import React, { useEffect, useMemo, useState } from 'react';
import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { X, Check, Lock, Loader2, AlertCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

/**
 * Meal selection for a subscription.
 *
 * Every constraint here mirrors firestore.rules exactly, because a picker that
 * offers a choice the rules reject fails the write with no useful message and
 * looks like a broken app. The rules are the authority; this is a UI that
 * refuses to ask for something it knows will be refused.
 *
 * From `match /subscriptionMealSelections`:
 *
 *   - Document id MUST be `{subscriptionId}_{date}_{slot}`. Not a random id —
 *     the rule compares the id against the payload, so an addDoc() would be
 *     rejected outright.
 *   - `slot` ∈ breakfast | lunch | snacks | dinner.
 *   - `mealName` must appear in `mealPlans/{planId}.slotMealNames[slot]`, so
 *     the options come from the plan rather than the whole dish catalogue.
 *   - The subscription must be `active` and the date inside its start/end.
 *   - **Create** is allowed until 23:59 IST on the delivery day.
 *   - **Update** is only allowed until *midnight IST at the start* of that day.
 *
 * That last asymmetry is easy to miss and matters: on the delivery day itself
 * a customer may still make a first choice, but can no longer change one they
 * already made. The UI states which of the two applies rather than letting a
 * confident-looking button fail.
 */

const SLOTS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** YYYY-MM-DD, as the rules expect. */
const iso = (d) => d.toISOString().slice(0, 10);

/** Midnight IST at the start of `dateStr`, in real (UTC) time. */
function freezeAt(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

/** 23:59 IST on `dateStr` — the last moment a *new* selection may be created. */
function createDeadline(dateStr) {
  return new Date(freezeAt(dateStr).getTime() + 24 * 60 * 60 * 1000 - 60 * 1000);
}

export default function MealPicker({ subscription, onClose }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState(null);
  const [selections, setSelections] = useState({}); // `${date}_${slot}` -> doc
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [activeDate, setActiveDate] = useState('');

  // ---- plan (source of the allowed meal names) -----------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!db || !subscription?.planId) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, 'mealPlans', subscription.planId));
        if (cancelled) return;
        if (!snap.exists()) {
          setError('This plan is no longer available, so meals cannot be chosen.');
        } else {
          const d = snap.data() || {};
          if (!d.slotMealNames) {
            // Stated plainly: without this field the rules reject every write,
            // so there is nothing the customer can do from here.
            setError('This plan has no meal options set up yet. Please contact support.');
          }
          setPlan({ id: snap.id, ...d });
        }
      } catch (e) {
        console.error('[meals] plan load failed', e);
        setError('Could not load the plan.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [subscription?.planId]);

  // ---- existing selections -------------------------------------------------
  useEffect(() => {
    if (!db || !user || !subscription?.id) return undefined;
    // Filtered on userId: the read rule requires it, and a query without it is
    // rejected rather than filtered.
    const q = query(
      collection(db, 'subscriptionMealSelections'),
      where('userId', '==', user.uid),
      where('subscriptionId', '==', subscription.id),
    );
    return onSnapshot(
      q,
      (snap) => {
        const next = {};
        snap.forEach((d) => {
          const x = d.data() || {};
          next[`${x.date}_${x.slot}`] = { id: d.id, ...x };
        });
        setSelections(next);
      },
      (e) => console.error('[meals] selections listener failed', e),
    );
  }, [user, subscription?.id]);

  // ---- the days a customer may choose for --------------------------------
  const days = useMemo(() => {
    if (!subscription?.startDate || !subscription?.endDate) return [];
    const start = String(subscription.startDate).slice(0, 10);
    const end = String(subscription.endDate).slice(0, 10);
    const today = iso(new Date());
    const from = today > start ? today : start;

    const out = [];
    const cur = new Date(`${from}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    // Capped at 14 days: a 90-day plan would otherwise render 360 controls.
    while (cur <= last && out.length < 14) {
      out.push(iso(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
  }, [subscription?.startDate, subscription?.endDate]);

  useEffect(() => {
    if (!activeDate && days.length) setActiveDate(days[0]);
  }, [days, activeDate]);

  const slotsForPlan = useMemo(() => {
    const names = plan?.slotMealNames || {};
    return SLOTS.filter((s) => Array.isArray(names[s]) && names[s].length > 0);
  }, [plan]);

  const isActive = String(subscription?.status || '').toLowerCase() === 'active';

  const choose = async (date, slot, mealName) => {
    if (!user || !db) return;
    const key = `${date}_${slot}`;
    const existing = selections[key];
    const now = new Date();

    // Same two deadlines the rules apply, checked here so the customer gets a
    // sentence instead of a permission error.
    if (existing && now >= freezeAt(date)) {
      setError(`Choices for ${date} are locked — the kitchen has started prepping.`);
      return;
    }
    if (!existing && now >= createDeadline(date)) {
      setError(`It is too late to choose a meal for ${date}.`);
      return;
    }

    setError('');
    setBusyKey(key);
    try {
      // Deterministic id, exactly as the rule requires.
      const ref = doc(db, 'subscriptionMealSelections', `${subscription.id}_${date}_${slot}`);
      if (existing) {
        // userId / subscriptionId / date / slot / mealNameSnapshot are frozen
        // by the rule, so only the mutable fields are sent.
        await updateDoc(ref, {
          mealName,
          status: 'Upcoming',
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          userId: user.uid,
          subscriptionId: subscription.id,
          date,
          slot,
          mealName,
          mealNameSnapshot: mealName,
          status: 'Upcoming',
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error('[meals] save failed', e);
      setError(
        e?.code === 'permission-denied'
          ? 'That choice was refused — it may be past the cut-off, or the meal is no longer on your plan.'
          : 'Could not save your choice. Please try again.',
      );
    } finally {
      setBusyKey('');
    }
  };

  const locked = activeDate ? new Date() >= freezeAt(activeDate) : false;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-brand-dark/60 backdrop-blur-sm sm:items-center sm:p-6"
         onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
           onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-brand-primary/10 px-5 py-3">
          <div>
            <h2 className="font-display text-sm font-bold text-brand-dark">Choose your meals</h2>
            <p className="font-sans text-[11px] text-brand-dark/45">
              {subscription?.planName || 'Your plan'}
            </p>
          </div>
          <button onClick={onClose} className="text-brand-dark/35 hover:text-brand-dark">
            <X className="h-5 w-5" />
          </button>
        </header>

        {!isActive && (
          <p className="m-4 rounded-xl bg-amber-50 px-3 py-2 font-sans text-xs text-amber-800">
            Meals can only be chosen while a subscription is active. Resume it first.
          </p>
        )}

        {error && (
          <div className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="font-sans text-xs text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 p-8 font-sans text-xs text-brand-dark/45">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your plan…
          </div>
        ) : (
          <>
            {/* dates */}
            <div className="flex gap-2 overflow-x-auto border-b border-brand-primary/8 px-4 py-3">
              {days.map((d) => {
                const isLocked = new Date() >= freezeAt(d);
                return (
                  <button key={d} onClick={() => setActiveDate(d)}
                          className={`shrink-0 rounded-xl border px-3 py-1.5 text-center font-sans transition-colors ${
                            activeDate === d
                              ? 'border-brand-primary bg-brand-primary text-white'
                              : 'border-brand-primary/15 bg-white text-brand-dark/60'
                          }`}>
                    <span className="block text-[10px] font-bold uppercase">
                      {new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short' })}
                    </span>
                    <span className="block text-xs font-bold">{d.slice(8)}</span>
                    {isLocked && <Lock className="mx-auto mt-0.5 h-2.5 w-2.5 opacity-60" />}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {days.length === 0 && (
                <p className="py-8 text-center font-sans text-xs text-brand-dark/45">
                  This subscription has no upcoming delivery days.
                </p>
              )}

              {activeDate && locked && (
                <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-brand-offwhite px-3 py-2 font-sans text-[11px] text-brand-dark/55">
                  <Lock className="h-3.5 w-3.5" />
                  Choices for this day are locked. You can still make a first
                  selection if you never made one, but changes are closed.
                </p>
              )}

              {slotsForPlan.length === 0 && !error && (
                <p className="py-8 text-center font-sans text-xs text-brand-dark/45">
                  This plan has no meal options to choose from.
                </p>
              )}

              {activeDate && slotsForPlan.map((slot) => {
                const key = `${activeDate}_${slot}`;
                const chosen = selections[key]?.mealName;
                const options = plan?.slotMealNames?.[slot] || [];
                return (
                  <section key={slot} className="mb-4">
                    <h3 className="mb-2 font-sans text-[11px] font-bold uppercase tracking-wider text-brand-dark/45">
                      {slot}
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {options.map((name) => {
                        const active = chosen === name;
                        return (
                          <button key={name}
                                  disabled={!isActive || busyKey === key}
                                  onClick={() => choose(activeDate, slot, name)}
                                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left font-sans text-xs font-semibold transition-colors disabled:opacity-40 ${
                                    active
                                      ? 'border-brand-primary bg-brand-primary/8 text-brand-primary'
                                      : 'border-brand-primary/15 bg-white text-brand-dark/70 hover:border-brand-primary/40'
                                  }`}>
                            <span className="min-w-0 truncate">{name}</span>
                            {busyKey === key
                              ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                              : active && <Check className="h-3.5 w-3.5 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
