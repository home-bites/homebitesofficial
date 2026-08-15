import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { CalendarClock, AlertCircle, Pause, Play, XCircle, CalendarDays, UtensilsCrossed } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { inr } from '../lib/format';
import MealPicker from '../components/app/MealPicker';

/**
 * Active and past subscriptions, with the management actions the backend
 * already supports.
 *
 * Every action here calls an existing Cloud Function — pauseSubscription,
 * resumeSubscription, cancelSubscription, skipSubscriptionDay. None of them is
 * reimplemented client-side, and none of them could be: firestore.rules blocks
 * a customer from changing `status` or `paymentStatus` on their own
 * subscription document, so a button that wrote directly would silently fail.
 *
 * The query filters on userId. Firestore rules are not filters — a read of
 * `subscriptions` without that constraint is rejected outright rather than
 * returning a subset, which is the trap that has bitten this project
 * repeatedly.
 */

const ACTIVE_STATES = ['active', 'paused', 'pending'];

const fmtDate = (v) => {
  if (!v) return '';
  const d = typeof v?.toDate === 'function' ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
};

const statusStyle = (s) => {
  switch (String(s || '').toLowerCase()) {
    case 'active': return 'bg-brand-secondary/20 text-brand-primary';
    case 'paused': return 'bg-amber-100 text-amber-700';
    case 'cancelled':
    case 'expired': return 'bg-brand-dark/8 text-brand-dark/50';
    default: return 'bg-brand-primary/10 text-brand-primary';
  }
};

function SubscriptionCard({ sub, onAction, busy, onPickMeals }) {
  // Defaults to tomorrow. Today is already past the midnight-IST freeze, so it
  // is never a legitimate skip — the input's `min` says so rather than letting
  // the customer choose a date the server will refuse.
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const [skipDate, setSkipDate] = React.useState(tomorrow);
  const status = String(sub.status || 'Pending');
  const lower = status.toLowerCase();
  const isActive = lower === 'active';
  const isPaused = lower === 'paused';
  const canManage = isActive || isPaused;

  return (
    <article className="rounded-2xl border border-brand-primary/10 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold text-brand-dark">
            {sub.planName || 'Meal plan'}
          </p>
          <p className="font-sans text-[11px] text-brand-dark/40">
            {fmtDate(sub.startDate)}{sub.endDate ? ` — ${fmtDate(sub.endDate)}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-sm font-bold text-brand-primary">
            {inr(sub.price ?? sub.totalAmount ?? 0)}
          </p>
          <span className={`inline-block rounded-full px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide ${statusStyle(status)}`}>
            {status}
          </span>
        </div>
      </div>

      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 font-sans text-[11px]">
        {sub.durationDays > 0 && (
          <div className="flex justify-between">
            <dt className="text-brand-dark/45">Duration</dt>
            <dd className="font-semibold text-brand-dark/70">{sub.durationDays} days</dd>
          </div>
        )}
        {sub.mealsPerDay > 0 && (
          <div className="flex justify-between">
            <dt className="text-brand-dark/45">Meals/day</dt>
            <dd className="font-semibold text-brand-dark/70">{sub.mealsPerDay}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-brand-dark/45">Payment</dt>
          <dd className="font-semibold text-brand-dark/70">
            {String(sub.paymentStatus || '').toUpperCase() === 'VERIFIED' ? 'Paid' : (sub.paymentStatus || '—')}
          </dd>
        </div>
        {sub.pausedDaysTotal > 0 && (
          <div className="flex justify-between">
            <dt className="text-brand-dark/45">Paused days</dt>
            <dd className="font-semibold text-brand-dark/70">{sub.pausedDaysTotal}</dd>
          </div>
        )}
      </dl>

      {isPaused && (
        <p className="mb-3 rounded-lg bg-amber-50 px-2.5 py-2 font-sans text-[11px] text-amber-800">
          Paused. Days you miss are added to the end of your plan, so nothing is lost.
        </p>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2 border-t border-brand-primary/8 pt-3">
          {isActive && (
            <button onClick={() => onAction(sub, 'pause')} disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg border border-brand-primary/20 px-3 py-1.5 font-sans text-[11px] font-bold text-brand-primary disabled:opacity-40">
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>
          )}
          {isPaused && (
            <button onClick={() => onAction(sub, 'resume')} disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 font-sans text-[11px] font-bold text-white disabled:opacity-40">
              <Play className="h-3.5 w-3.5" /> Resume
            </button>
          )}
          {isActive && (
            <>
              <button onClick={() => onPickMeals(sub)} disabled={busy}
                      className="flex items-center gap-1.5 rounded-lg border border-brand-primary/20 px-3 py-1.5 font-sans text-[11px] font-bold text-brand-primary disabled:opacity-40">
                <UtensilsCrossed className="h-3.5 w-3.5" /> Choose meals
              </button>
              <span className="flex items-center gap-1 rounded-lg border border-brand-primary/20 px-2 py-1">
                <CalendarDays className="h-3.5 w-3.5 text-brand-dark/40" />
                <input
                  type="date"
                  value={skipDate}
                  min={tomorrow}
                  max={String(sub.endDate || '').slice(0, 10) || undefined}
                  onChange={(e) => setSkipDate(e.target.value)}
                  aria-label="Date to skip"
                  className="w-[7.5rem] bg-transparent font-sans text-[11px] font-bold text-brand-dark/60 focus:outline-none"
                />
                <button onClick={() => onAction(sub, 'skip', skipDate)} disabled={busy || !skipDate}
                        className="font-sans text-[11px] font-bold text-brand-primary disabled:opacity-40">
                  Skip
                </button>
              </span>
            </>
          )}
          <button onClick={() => onAction(sub, 'cancel')} disabled={busy}
                  className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-[11px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-40">
            <XCircle className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      )}
    </article>
  );
}

export default function SubscriptionsPage() {
  const { user } = useAuth();
  const [subs, setSubs] = useState([]);
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pickingFor, setPickingFor] = useState(null);

  useEffect(() => {
    if (!db || !user) return undefined;
    // userId, not customerId. The rule accepts either, but the documents this
    // site creates set both, and mixing the two across queries is how a
    // subscription ends up invisible to the customer who owns it.
    const q = query(
      collection(db, 'subscriptions'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        setSubs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setState('ready');
      },
      (e) => {
        console.error('[subscriptions] listener failed', e);
        setState('error');
      },
    );
  }, [user]);

  const onAction = async (sub, action, skipDate) => {
    setError('');
    setMessage('');

    if (action === 'cancel'
        && !window.confirm('Cancel this subscription? Remaining days will not be delivered.')) {
      return;
    }

    const map = {
      pause: 'pauseSubscription',
      resume: 'resumeSubscription',
      cancel: 'cancelSubscription',
      skip: 'skipSubscriptionDay',
    };

    setBusy(true);
    try {
      const payload = { subscriptionId: sub.id };
      if (action === 'skip') {
        // Chosen by the customer, defaulting to tomorrow. The rules freeze a
        // day at midnight IST, so anything earlier than tomorrow is already
        // past the point where a skip could be honoured.
        payload.date = skipDate;
      }
      await httpsCallable(getFunctions(), map[action])(payload);
      setMessage({
        pause: 'Subscription paused.',
        resume: 'Subscription resumed.',
        cancel: 'Subscription cancelled.',
        skip: `Delivery on ${skipDate} skipped.`,
      }[action]);
      // No local state change: the snapshot listener above is the single
      // source of truth and updates itself.
    } catch (e) {
      console.error('[subscriptions] action failed', e);
      setError(e?.message || 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const active = subs.filter((s) => ACTIVE_STATES.includes(String(s.status || '').toLowerCase()));
  const past = subs.filter((s) => !ACTIVE_STATES.includes(String(s.status || '').toLowerCase()));

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
      <h1 className="mb-4 font-display text-xl font-bold text-brand-dark">Subscriptions</h1>

      {message && (
        <p className="mb-4 rounded-xl border border-brand-secondary/40 bg-brand-secondary/10 px-3 py-2 font-sans text-xs font-semibold text-brand-primary">
          {message}
        </p>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="font-sans text-xs text-red-700">{error}</p>
        </div>
      )}

      {state === 'loading' && (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/70" />)}
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="font-sans text-sm font-bold text-red-700">Couldn't load your subscriptions</p>
          <button onClick={() => window.location.reload()}
                  className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 font-sans text-xs font-bold text-white">
            Try again
          </button>
        </div>
      )}

      {state === 'ready' && subs.length === 0 && (
        <div className="rounded-2xl border border-brand-primary/10 bg-white p-10 text-center">
          <CalendarClock className="mx-auto mb-2 h-6 w-6 text-brand-dark/20" />
          <p className="font-display text-sm font-bold text-brand-dark/70">No subscriptions yet</p>
          <p className="mt-1 font-sans text-xs text-brand-dark/40">
            Pick a plan and your meals arrive on a schedule.
          </p>
          <Link to="/diet-plans"
                className="mt-4 inline-block rounded-xl bg-brand-primary px-5 py-2.5 font-sans text-sm font-bold text-white">
            Browse diet plans
          </Link>
        </div>
      )}

      {active.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-sans text-xs font-bold uppercase tracking-wider text-brand-dark/45">
            Active
          </h2>
          <div className="space-y-3">
            {active.map((s) => (
              <SubscriptionCard key={s.id} sub={s} onAction={onAction} busy={busy}
                                onPickMeals={setPickingFor} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-2 font-sans text-xs font-bold uppercase tracking-wider text-brand-dark/45">
            Past
          </h2>
          <div className="space-y-3">
            {past.map((s) => (
              <SubscriptionCard key={s.id} sub={s} onAction={onAction} busy={busy}
                                onPickMeals={setPickingFor} />
            ))}
          </div>
        </section>
      )}
      {pickingFor && (
        <MealPicker subscription={pickingFor} onClose={() => setPickingFor(null)} />
      )}
    </div>
  );
}
