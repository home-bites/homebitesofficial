import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import {
  CalendarClock, AlertCircle, Pause, Play, XCircle, CalendarDays,
  UtensilsCrossed, ChevronDown, Check,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { inr } from '../lib/format';
import MealPicker from '../components/app/MealPicker';

/**
 * Subscriptions.
 *
 * A subscription is a countdown, and the old page never said so. It listed
 * duration and dates as two more rows in a grid of grey labels, so the one
 * thing a customer actually wants — how much of what they paid for is left —
 * had to be worked out by subtracting one date from another in their head.
 *
 * Days remaining now leads, with a progress bar underneath it. The live plan
 * gets the dark panel; finished ones collapse to a quiet row, matching the
 * orders page so the two read as the same product.
 *
 * Behaviour is unchanged. Every action calls an existing Cloud Function —
 * pauseSubscription, resumeSubscription, cancelSubscription, skipSubscriptionDay
 * — and none could be reimplemented client-side even if that were tempting:
 * firestore.rules blocks a customer from writing `status` or `paymentStatus` on
 * their own subscription, so a button that wrote directly would fail silently.
 *
 * The query filters on userId. Firestore rules are not filters — a read without
 * that constraint is rejected outright, which is the trap this project has hit
 * repeatedly.
 */

const ACTIVE_STATES = ['active', 'paused', 'pending'];

const toDate = (v) => {
  if (!v) return null;
  const d = typeof v?.toDate === 'function' ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtDate = (v) => {
  const d = toDate(v);
  return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
};

/**
 * True once the plan's last day has passed.
 *
 * Nothing writes "Expired" the moment a plan runs out — the renewal engine does
 * it on its own schedule, so a subscription whose endDate was weeks ago still
 * reads "Active" until then. Without this a finished plan kept offering Pause,
 * Skip and Cancel, and Cancel on a plan that has already delivered everything
 * can only confuse.
 */
function hasExpired(sub) {
  const end = toDate(sub?.endDate);
  if (!end) return false;
  end.setHours(23, 59, 59, 999);   // a plan ending today is still live
  return end < new Date();
}

/** Whole days from today to the plan's last day, floored at zero. */
function daysLeft(sub) {
  const end = toDate(sub?.endDate);
  if (!end) return null;
  end.setHours(23, 59, 59, 999);
  const ms = end - new Date();
  return ms <= 0 ? 0 : Math.ceil(ms / 86400000);
}

/** How far through the plan we are, 0–1. */
function progress(sub) {
  const start = toDate(sub?.startDate);
  const end = toDate(sub?.endDate);
  if (!start || !end || end <= start) return 0;
  const span = end - start;
  const done = new Date() - start;
  return Math.min(1, Math.max(0, done / span));
}

/* ------------------------------------------------------------------ */
/* Live subscription                                                   */
/* ------------------------------------------------------------------ */

function LiveSubscriptionCard({ sub, onAction, busy, onPickMeals }) {
  // Defaults to tomorrow: today is already past the midnight-IST freeze, so it
  // is never a legitimate skip, and `min` says so rather than letting the
  // customer pick a date the server will refuse.
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const [skipDate, setSkipDate] = useState(tomorrow);

  const lower = String(sub.status || 'Pending').toLowerCase();
  const isActive = lower === 'active';
  const isPaused = lower === 'paused';
  const left = daysLeft(sub);
  const pct = Math.round(progress(sub) * 100);

  return (
    <article className="overflow-hidden rounded-[28px] bg-brand-primary p-5 text-white shadow-[0_20px_50px_-20px_rgba(11,77,59,0.6)] sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-brand-secondary">
            {isPaused ? 'Paused' : 'Active plan'}
          </p>
          <h2 className="mt-1 truncate font-display text-xl font-bold tracking-tight">
            {sub.planName || 'Meal plan'}
          </h2>
        </div>
        <p className="shrink-0 font-display text-lg font-bold text-white/80">
          {inr(sub.price ?? sub.totalAmount ?? 0)}
        </p>
      </div>

      {/* The countdown. This is the number people open the page for. */}
      {left != null && (
        <div className="mb-5">
          <div className="flex items-end gap-2.5">
            <p className="font-display text-4xl font-bold leading-none text-brand-secondary">
              {left}
            </p>
            <p className="pb-0.5 font-sans text-sm text-white/55">
              {left === 1 ? 'day left' : 'days left'}
            </p>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/12">
            <div
              className="h-full rounded-full bg-brand-secondary transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-sans text-[10px] text-white/35">
            <span>{fmtDate(sub.startDate)}</span>
            <span>{fmtDate(sub.endDate)}</span>
          </div>
        </div>
      )}

      <dl className="mb-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4 font-sans text-[11px]">
        {sub.mealsPerDay > 0 && (
          <div>
            <dt className="text-white/35">Meals a day</dt>
            <dd className="mt-0.5 font-display text-sm font-bold text-white">{sub.mealsPerDay}</dd>
          </div>
        )}
        {sub.durationDays > 0 && (
          <div>
            <dt className="text-white/35">Plan length</dt>
            <dd className="mt-0.5 font-display text-sm font-bold text-white">{sub.durationDays} days</dd>
          </div>
        )}
        {sub.pausedDaysTotal > 0 && (
          <div>
            <dt className="text-white/35">Days banked</dt>
            <dd className="mt-0.5 font-display text-sm font-bold text-brand-secondary">
              +{sub.pausedDaysTotal}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-white/35">Payment</dt>
          <dd className="mt-0.5 flex items-center gap-1 font-display text-sm font-bold text-white">
            {String(sub.paymentStatus || '').toUpperCase() === 'VERIFIED' ? (
              <><Check className="h-3.5 w-3.5 text-brand-secondary" strokeWidth={3} />Paid</>
            ) : (sub.paymentStatus || '—')}
          </dd>
        </div>
      </dl>

      {isPaused && (
        <p className="mb-4 rounded-2xl bg-amber-400/15 px-4 py-3 font-sans text-xs leading-relaxed text-amber-200">
          Paused. Days you miss are added to the end of your plan, so nothing you
          paid for is lost.
        </p>
      )}

      {/* Primary action first and full-width; destructive last and quiet. */}
      <div className="space-y-2.5">
        {isActive && (
          <button
            onClick={() => onPickMeals(sub)}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-secondary py-3.5 font-display text-sm font-bold text-brand-primary transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            <UtensilsCrossed className="h-4 w-4" /> Choose your meals
          </button>
        )}

        {isPaused && (
          <button
            onClick={() => onAction(sub, 'resume')}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-secondary py-3.5 font-display text-sm font-bold text-brand-primary transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            <Play className="h-4 w-4" /> Resume plan
          </button>
        )}

        {isActive && (
          <div className="flex gap-2.5">
            <button
              onClick={() => onAction(sub, 'pause')}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/10 py-3 font-sans text-xs font-bold text-white transition-colors hover:bg-white/15 disabled:opacity-40"
            >
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>

            <div className="flex flex-[1.4] items-center gap-1 rounded-2xl bg-white/10 px-3">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-white/40" />
              <input
                type="date"
                value={skipDate}
                min={tomorrow}
                max={String(sub.endDate || '').slice(0, 10) || undefined}
                onChange={(e) => setSkipDate(e.target.value)}
                aria-label="Date to skip"
                className="w-full min-w-0 bg-transparent py-3 font-sans text-xs font-bold text-white [color-scheme:dark] focus:outline-none"
              />
              <button
                onClick={() => onAction(sub, 'skip', skipDate)}
                disabled={busy || !skipDate}
                className="shrink-0 font-sans text-xs font-bold text-brand-secondary disabled:opacity-40"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => onAction(sub, 'cancel')}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 py-2 font-sans text-[11px] font-bold text-white/35 transition-colors hover:text-red-300 disabled:opacity-40"
        >
          <XCircle className="h-3.5 w-3.5" /> Cancel this subscription
        </button>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Finished subscriptions                                              */
/* ------------------------------------------------------------------ */

function PastSubscriptionRow({ sub }) {
  const [open, setOpen] = useState(false);
  const raw = String(sub.status || '').toLowerCase();
  const label = ['cancelled', 'expired'].includes(raw)
    ? String(sub.status)
    : 'Completed';

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-primary/8 bg-white">
      <button onClick={() => setOpen((v) => !v)}
              className="flex w-full items-center gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold text-brand-dark">
            {sub.planName || 'Meal plan'}
          </p>
          <p className="mt-0.5 font-sans text-[11px] text-brand-dark/40">
            {fmtDate(sub.startDate)} — {fmtDate(sub.endDate)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-sm font-bold text-brand-dark">
            {inr(sub.price ?? sub.totalAmount ?? 0)}
          </p>
          <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 font-sans text-[10px] font-bold ${
            label === 'Completed'
              ? 'bg-brand-secondary/15 text-brand-primary'
              : 'bg-brand-dark/6 text-brand-dark/45'}`}>
            {label}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-brand-dark/25 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <dl className="grid grid-cols-2 gap-y-2 border-t border-brand-primary/8 bg-brand-offwhite/40 px-4 py-3 font-sans text-[11px]">
          {sub.durationDays > 0 && (
            <div><dt className="text-brand-dark/40">Length</dt>
                 <dd className="font-bold text-brand-dark/70">{sub.durationDays} days</dd></div>
          )}
          {sub.mealsPerDay > 0 && (
            <div><dt className="text-brand-dark/40">Meals a day</dt>
                 <dd className="font-bold text-brand-dark/70">{sub.mealsPerDay}</dd></div>
          )}
          {sub.pausedDaysTotal > 0 && (
            <div><dt className="text-brand-dark/40">Paused days</dt>
                 <dd className="font-bold text-brand-dark/70">{sub.pausedDaysTotal}</dd></div>
          )}
          <div><dt className="text-brand-dark/40">Payment</dt>
               <dd className="font-bold text-brand-dark/70">
                 {String(sub.paymentStatus || '').toUpperCase() === 'VERIFIED' ? 'Paid' : (sub.paymentStatus || '—')}
               </dd></div>
        </dl>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

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
    // userId, not customerId. The rule accepts either, but documents this site
    // creates set both, and mixing the two across queries is how a subscription
    // ends up invisible to the customer who owns it.
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
      if (action === 'skip') payload.date = skipDate;
      await httpsCallable(getFunctions(), map[action])(payload);
      setMessage({
        pause: 'Subscription paused.',
        resume: 'Subscription resumed.',
        cancel: 'Subscription cancelled.',
        skip: `Delivery on ${skipDate} skipped.`,
      }[action]);
      // No local state change: the snapshot listener is the single source of
      // truth and updates itself.
    } catch (e) {
      console.error('[subscriptions] action failed', e);
      setError(e?.message || 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const live = subs.filter(
    (s) => ACTIVE_STATES.includes(String(s.status || '').toLowerCase()) && !hasExpired(s),
  );
  const past = subs.filter(
    (s) => !ACTIVE_STATES.includes(String(s.status || '').toLowerCase()) || hasExpired(s),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
      <h1 className="mb-6 font-display text-[28px] font-bold tracking-tight text-brand-dark">
        Subscriptions
      </h1>

      {message && (
        <p className="mb-4 flex items-center gap-2 rounded-2xl bg-brand-secondary/12 px-4 py-3 font-sans text-xs font-bold text-brand-primary">
          <Check className="h-4 w-4" strokeWidth={3} />{message}
        </p>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="font-sans text-xs text-red-700">{error}</p>
        </div>
      )}

      {state === 'loading' && (
        <div className="space-y-4">
          <div className="h-72 animate-pulse rounded-[28px] bg-white/70" />
          <div className="h-16 animate-pulse rounded-2xl bg-white/70" />
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="mx-auto mb-2 h-6 w-6 text-red-500" />
          <p className="font-display text-base font-bold text-red-700">
            Couldn't load your subscriptions
          </p>
          <button onClick={() => window.location.reload()}
                  className="mt-4 rounded-xl bg-red-600 px-5 py-2.5 font-sans text-sm font-bold text-white">
            Try again
          </button>
        </div>
      )}

      {state === 'ready' && subs.length === 0 && (
        <div className="rounded-[28px] border border-brand-primary/8 bg-white p-14 text-center">
          <CalendarClock className="mx-auto mb-3 h-7 w-7 text-brand-dark/15" />
          <p className="font-display text-lg font-bold text-brand-dark/70">
            No subscriptions yet
          </p>
          <p className="mx-auto mt-2 max-w-xs font-sans text-sm leading-relaxed text-brand-dark/40">
            Pick a plan and your meals arrive on a schedule — pause any day you
            are away, and those days get added to the end.
          </p>
          <Link to="/diet-plans"
                className="mt-6 inline-block rounded-2xl bg-brand-primary px-6 py-3 font-display text-sm font-bold text-white">
            Browse diet plans
          </Link>
        </div>
      )}

      {live.length > 0 && (
        <section className="mb-10 space-y-4">
          {live.map((s) => (
            <LiveSubscriptionCard key={s.id} sub={s} onAction={onAction}
                                  busy={busy} onPickMeals={setPickingFor} />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-brand-dark/35">
            Earlier plans
          </h2>
          <div className="space-y-2.5">
            {past.map((s) => <PastSubscriptionRow key={s.id} sub={s} />)}
          </div>
        </section>
      )}

      {/* A second plan is allowed to run alongside the first, so the entry
          point stays available while one is live. */}
      {state === 'ready' && live.length > 0 && (
        <Link to="/diet-plans"
              className="mx-auto mt-6 block w-fit rounded-2xl border border-brand-primary/15 px-6 py-3 font-sans text-sm font-bold text-brand-primary transition-colors hover:bg-brand-primary/5">
          Add another plan
        </Link>
      )}

      {pickingFor && (
        <MealPicker subscription={pickingFor} onClose={() => setPickingFor(null)} />
      )}
    </div>
  );
}
