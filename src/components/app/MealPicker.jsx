import React, { useEffect, useMemo, useState } from 'react';
import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { X, Check, Lock, Loader2, AlertCircle, CircleDot } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

/**
 * Meal selection for a subscription.
 *
 * Choices are **staged locally and committed together**. The first version of
 * this component wrote to Firestore on every option tap, with the button
 * turning green as the only signal. That is wrong here: these choices become
 * food that gets cooked, and firestore.rules freezes a day at midnight IST — so
 * a mistap on a day that then locked could not be undone. Save-on-tap is fine
 * for a filter; it is not fine for something a kitchen acts on.
 *
 * Every constraint below mirrors firestore.rules exactly, because a picker that
 * offers a choice the rules reject fails with no useful message and looks like
 * a broken app:
 *
 *   - Document id MUST be `{subscriptionId}_{date}_{slot}` — the rule compares
 *     the id against the payload, so addDoc() with a random id is refused.
 *   - `mealName` must appear in `mealPlans/{planId}.slotMealNames[slot]`.
 *   - The subscription must be active and the date inside its range.
 *   - **Create** is allowed until 23:59 IST on the delivery day.
 *   - **Update** only until midnight IST at the *start* of that day.
 *
 * That last asymmetry is why saving is reported per day rather than as one
 * result. A batch can legitimately have some writes accepted and others
 * refused — on the delivery day itself a customer may still make a first
 * choice but can no longer change one they already made. Reporting a single
 * green tick would claim success for writes the server rejected.
 */

const SLOTS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const iso = (d) => d.toISOString().slice(0, 10);

/** Midnight IST at the start of `dateStr`, in real time. */
function freezeAt(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

/** 23:59 IST on `dateStr` — the last moment a *new* selection may be created. */
function createDeadline(dateStr) {
  return new Date(freezeAt(dateStr).getTime() + 24 * 60 * 60 * 1000 - 60 * 1000);
}

const keyOf = (date, slot) => `${date}_${slot}`;

export default function MealPicker({ subscription, onClose }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState(null);
  const [saved, setSaved] = useState({});      // key -> { id, mealName, ... }
  const [pending, setPending] = useState({});  // key -> mealName, not yet written
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);  // { savedCount, failures[] }
  const [saving, setSaving] = useState(false);
  const [activeDate, setActiveDate] = useState('');

  // ---- plan -----------------------------------------------------------
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
            // Without this field the rules reject every write, so there is
            // nothing the customer could do from here. Say so.
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

  // ---- existing selections -------------------------------------------
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
          next[keyOf(x.date, x.slot)] = { id: d.id, ...x };
        });
        setSaved(next);
      },
      (e) => console.error('[meals] selections listener failed', e),
    );
  }, [user, subscription?.id]);

  // ---- days -----------------------------------------------------------
  const days = useMemo(() => {
    if (!subscription?.startDate || !subscription?.endDate) return [];
    const start = String(subscription.startDate).slice(0, 10);
    const end = String(subscription.endDate).slice(0, 10);
    const today = iso(new Date());
    const from = today > start ? today : start;

    const out = [];
    const cur = new Date(`${from}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    // Capped at 14: a 90-day plan would render 360 controls.
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
  const pendingKeys = Object.keys(pending);
  const hasPending = pendingKeys.length > 0;

  /** What is shown as chosen: a staged choice wins over the saved one. */
  const chosenFor = (date, slot) => {
    const k = keyOf(date, slot);
    return pending[k] ?? saved[k]?.mealName ?? null;
  };

  const stage = (date, slot, mealName) => {
    const k = keyOf(date, slot);
    setError('');
    setReport(null);

    // Refuse to stage what the server would certainly reject, so the customer
    // learns now rather than at save time.
    const now = new Date();
    if (saved[k] && now >= freezeAt(date)) {
      setError(`Choices for ${date} are locked — the kitchen has started prepping.`);
      return;
    }
    if (!saved[k] && now >= createDeadline(date)) {
      setError(`It is too late to choose a meal for ${date}.`);
      return;
    }

    setPending((prev) => {
      const next = { ...prev };
      // Selecting what is already saved clears the staged change rather than
      // queueing a pointless write.
      if (saved[k]?.mealName === mealName) delete next[k];
      else next[k] = mealName;
      return next;
    });
  };

  /**
   * Commits every staged choice, one write per selection.
   *
   * Not a batch: batched writes fail as a unit, and here a partial success is
   * the *correct* outcome — one locked day should not discard the customer's
   * other twelve choices.
   */
  const saveAll = async () => {
    if (!user || !db || !hasPending) return;
    setSaving(true);
    setError('');
    setReport(null);

    const failures = [];
    let savedCount = 0;

    for (const k of pendingKeys) {
      const [date, slot] = [k.slice(0, 10), k.slice(11)];
      const mealName = pending[k];
      const existing = saved[k];
      const now = new Date();

      // Re-checked at save time, not just at stage time: a customer can sit on
      // this screen across midnight, and the deadline moves while they do.
      if (existing && now >= freezeAt(date)) {
        failures.push({ date, slot, reason: 'that day is now locked' });
        continue;
      }
      if (!existing && now >= createDeadline(date)) {
        failures.push({ date, slot, reason: 'too late to choose for that day' });
        continue;
      }

      try {
        const ref = doc(db, 'subscriptionMealSelections',
          `${subscription.id}_${date}_${slot}`);

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
        savedCount += 1;
        // Cleared individually so a later failure does not discard what was
        // already written.
        setPending((prev) => { const n = { ...prev }; delete n[k]; return n; });
      } catch (e) {
        console.error('[meals] save failed', k, e);
        failures.push({
          date,
          slot,
          reason: e?.code === 'permission-denied'
            ? 'refused — past the cut-off, or that meal is no longer on your plan'
            : 'could not be saved',
        });
      }
    }

    setReport({ savedCount, failures });
    setSaving(false);
  };

  const discard = () => { setPending({}); setError(''); setReport(null); };

  const attemptClose = () => {
    if (hasPending
        && !window.confirm('You have unsaved meal choices. Close without saving?')) {
      return;
    }
    onClose?.();
  };

  const locked = activeDate ? new Date() >= freezeAt(activeDate) : false;
  const pendingOnActiveDay = pendingKeys.filter((k) => k.startsWith(activeDate)).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-brand-dark/70 backdrop-blur-sm sm:items-center sm:p-6"
         onClick={attemptClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-white sm:rounded-[28px]"
           onClick={(e) => e.stopPropagation()}>

        <header className="flex items-center justify-between border-b border-brand-primary/8 px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-brand-dark">
              Choose your meals
            </h2>
            <p className="truncate font-sans text-[11px] text-brand-dark/45">
              {subscription?.planName || 'Your plan'}
            </p>
          </div>
          <button onClick={attemptClose} aria-label="Close"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-offwhite text-brand-dark/45">
            <X className="h-4 w-4" />
          </button>
        </header>

        {!isActive && (
          <p className="mx-5 mt-4 rounded-2xl bg-amber-50 px-4 py-3 font-sans text-xs text-amber-800">
            Meals can only be chosen while a subscription is active. Resume it first.
          </p>
        )}

        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="font-sans text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Partial success is reported as partial. */}
        {report && (
          <div className={`mx-5 mt-4 rounded-2xl border p-3 ${
            report.failures.length
              ? 'border-amber-200 bg-amber-50'
              : 'border-brand-secondary/40 bg-brand-secondary/10'}`}>
            <p className={`font-sans text-xs font-bold ${
              report.failures.length ? 'text-amber-800' : 'text-brand-primary'}`}>
              {report.savedCount > 0
                ? `${report.savedCount} ${report.savedCount === 1 ? 'choice' : 'choices'} saved`
                : 'Nothing was saved'}
              {report.failures.length > 0 && ` · ${report.failures.length} refused`}
            </p>
            {report.failures.map((f, i) => (
              <p key={i} className="mt-1 font-sans text-[11px] text-amber-700">
                {f.date} {f.slot} — {f.reason}
              </p>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 p-10 font-sans text-xs text-brand-dark/45">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your plan…
          </div>
        ) : (
          <>
            {/* dates */}
            <div className="flex gap-2 overflow-x-auto border-b border-brand-primary/8 px-5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {days.map((d) => {
                const isLocked = new Date() >= freezeAt(d);
                const unsaved = pendingKeys.some((k) => k.startsWith(d));
                return (
                  <button key={d} onClick={() => setActiveDate(d)}
                          className={`relative shrink-0 rounded-2xl border px-3.5 py-2 text-center transition-colors ${
                            activeDate === d
                              ? 'border-brand-primary bg-brand-primary text-white'
                              : 'border-brand-primary/12 bg-white text-brand-dark/55'
                          }`}>
                    <span className="block font-sans text-[10px] font-bold uppercase">
                      {new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short' })}
                    </span>
                    <span className="block font-display text-sm font-bold">{d.slice(8)}</span>
                    {isLocked && <Lock className="mx-auto mt-0.5 h-2.5 w-2.5 opacity-50" />}
                    {unsaved && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand-accent ring-2 ring-white" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {days.length === 0 && (
                <p className="py-10 text-center font-sans text-xs text-brand-dark/45">
                  This subscription has no upcoming delivery days.
                </p>
              )}

              {activeDate && locked && (
                <p className="mb-4 flex items-start gap-2 rounded-2xl bg-brand-offwhite px-3.5 py-2.5 font-sans text-[11px] leading-relaxed text-brand-dark/55">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  This day is locked. You can still make a first choice for a slot
                  you never picked, but existing choices can no longer change.
                </p>
              )}

              {slotsForPlan.length === 0 && !error && (
                <p className="py-10 text-center font-sans text-xs text-brand-dark/45">
                  This plan has no meal options to choose from.
                </p>
              )}

              {activeDate && slotsForPlan.map((slot) => {
                const chosen = chosenFor(activeDate, slot);
                const isStaged = keyOf(activeDate, slot) in pending;
                const options = plan?.slotMealNames?.[slot] || [];
                return (
                  <section key={slot} className="mb-5">
                    <h3 className="mb-2.5 flex items-center gap-2 font-sans text-[11px] font-bold uppercase tracking-[0.14em] text-brand-dark/45">
                      {slot}
                      {isStaged && (
                        <span className="flex items-center gap-1 rounded-full bg-brand-accent/12 px-2 py-0.5 text-[9px] text-brand-accent">
                          <CircleDot className="h-2.5 w-2.5" /> unsaved
                        </span>
                      )}
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {options.map((name) => {
                        const active = chosen === name;
                        return (
                          <button key={name}
                                  disabled={!isActive || saving}
                                  onClick={() => stage(activeDate, slot, name)}
                                  className={`flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-3 text-left font-sans text-[13px] font-semibold transition-colors disabled:opacity-40 ${
                                    active
                                      ? 'border-brand-primary bg-brand-primary/6 text-brand-primary'
                                      : 'border-brand-primary/12 bg-white text-brand-dark/70 hover:border-brand-primary/35'
                                  }`}>
                            <span className="min-w-0 truncate">{name}</span>
                            {active && <Check className="h-4 w-4 shrink-0" strokeWidth={3} />}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            {/* ---- save bar ---- */}
            <footer className="border-t border-brand-primary/8 bg-white px-5 py-4">
              {hasPending ? (
                <>
                  <p className="mb-3 font-sans text-[11px] text-brand-dark/45">
                    {pendingKeys.length} unsaved {pendingKeys.length === 1 ? 'choice' : 'choices'}
                    {pendingOnActiveDay > 0 && activeDate
                      && ` · ${pendingOnActiveDay} on this day`}
                  </p>
                  <div className="flex gap-2.5">
                    <button onClick={discard} disabled={saving}
                            className="rounded-2xl border border-brand-primary/15 px-5 py-3.5 font-sans text-sm font-bold text-brand-dark/50 disabled:opacity-40">
                      Discard
                    </button>
                    <button onClick={saveAll} disabled={saving}
                            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-primary py-3.5 font-display text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50">
                      {saving
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                        : <>Save {pendingKeys.length} {pendingKeys.length === 1 ? 'choice' : 'choices'}</>}
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={attemptClose}
                        className="w-full rounded-2xl bg-brand-offwhite py-3.5 font-sans text-sm font-bold text-brand-dark/55">
                  Done
                </button>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
