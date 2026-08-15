import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { ReceiptText, AlertCircle, Phone, Bike, ChevronDown, Check } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useOrderTracking, haversineKm, etaMinutes } from '../lib/useOrderTracking';
import { useRider } from '../lib/useRider';
import LiveTrackMap from '../components/app/LiveTrackMap';
import { inr } from '../lib/format';

/**
 * Order history and live tracking.
 *
 * The previous version gave every order the same card, so a delivery arriving
 * in four minutes sat at exactly the weight of a curry eaten last March. That
 * is backwards: somebody opening this page almost always wants the live one,
 * and everything else is reference material.
 *
 * So the live order now gets a dark full-width panel with the rider, the map
 * and the timeline open by default, and finished orders collapse to a single
 * quiet row that expands on tap. One thing is obviously the subject of the
 * page, and the rest waits its turn.
 *
 * Data and behaviour are unchanged: `orders` filtered by customerId, rider
 * position from the `orderTracking` collection the delivery app writes, and
 * the same route/ETA handling. Nothing here invents a position.
 */

const STAGES = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered'];
const FINISHED = ['Delivered', 'Cancelled', 'Rejected'];

/** Tolerates the spelling variations different clients write. */
function normalise(status) {
  const s = String(status || '').toLowerCase().replace(/[\s_]/g, '');
  if (s === 'outfordelivery') return 'Out for Delivery';
  const hit = STAGES.find((x) => x.toLowerCase().replace(/\s/g, '') === s);
  return hit || String(status || 'Pending');
}

const STAGE_COPY = {
  Pending: 'Waiting for the kitchen to accept',
  Accepted: 'The kitchen has your order',
  Preparing: 'Your food is being cooked',
  Ready: 'Packed and waiting for a rider',
  'Out for Delivery': 'On the way to you',
  Delivered: 'Delivered',
};

/* ------------------------------------------------------------------ */
/* Live order                                                          */
/* ------------------------------------------------------------------ */

/** Vertical timeline. Reads as progress rather than six identical bars. */
function Timeline({ status }) {
  const current = STAGES.indexOf(normalise(status));
  if (['Cancelled', 'Rejected'].includes(normalise(status))) return null;

  return (
    <ol className="space-y-0">
      {STAGES.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors ${
                done ? 'bg-brand-secondary'
                     : now ? 'bg-brand-secondary ring-4 ring-brand-secondary/25'
                           : 'bg-white/15'}`}>
                {done && <Check className="h-3 w-3 text-brand-primary" strokeWidth={3.5} />}
              </span>
              {i < STAGES.length - 1 && (
                <span className={`w-[2px] flex-1 ${done ? 'bg-brand-secondary' : 'bg-white/15'}`} />
              )}
            </div>
            <div className={`pb-4 ${i === STAGES.length - 1 ? 'pb-0' : ''}`}>
              <p className={`font-sans text-[13px] leading-5 ${
                now ? 'font-bold text-white' : done ? 'text-white/70' : 'text-white/30'}`}>
                {s}
              </p>
              {now && (
                <p className="font-sans text-[11px] text-brand-secondary">{STAGE_COPY[s]}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TrackPanel({ order }) {
  const status = normalise(order.status);
  const finished = FINISHED.includes(status);

  // A rider is assigned before the food leaves the kitchen, and they are often
  // already riding to collect it. `assignedPartnerId` is set at assignment,
  // whereas orderTracking only appears once the rider's app starts reporting —
  // so the name and phone come from the order, not the tracking document.
  const partnerId = order.assignedPartnerId || '';
  const trackable = !finished
    && (Boolean(partnerId) || status === 'Ready' || status === 'Out for Delivery');

  const { tracking, state } = useOrderTracking(order.id, trackable);
  const rider = useRider(partnerId || tracking?.partnerId, trackable);

  const [route, setRoute] = useState(null);
  const handleRoute = useCallback((r) => setRoute(r), []);

  const destLat = Number(order.deliveryAddress?.latitude ?? order.deliveryAddress?.lat);
  const destLng = Number(order.deliveryAddress?.longitude ?? order.deliveryAddress?.lng);
  const destination = Number.isFinite(destLat) && Number.isFinite(destLng)
    && !(destLat === 0 && destLng === 0)
    ? { lat: destLat, lng: destLng }
    : null;

  if (!trackable) return null;

  // Prefer the real road route; straight-line is the labelled fallback.
  const straightKm = tracking && destination ? haversineKm(tracking, destination) : null;
  const usingRoute = Boolean(route);
  const distanceLabel = usingRoute
    ? route.distanceText
    : straightKm == null ? null
      : straightKm < 1 ? `${Math.round(straightKm * 1000)} m` : `${straightKm.toFixed(1)} km`;
  const etaLabel = usingRoute
    ? route.durationText
    : etaMinutes(straightKm) != null ? `approx. ${etaMinutes(straightKm)} min` : null;

  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      {/* ETA is the single number people want. Given the size to match. */}
      {etaLabel && (
        <div className="mb-4 flex items-end gap-2.5">
          <div>
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
              {status === 'Out for Delivery' ? 'Arriving in' : 'Estimated'}
            </p>
            <p className="font-display text-3xl font-bold leading-none text-brand-secondary">
              {etaLabel.replace('approx. ', '')}
            </p>
          </div>
          {distanceLabel && (
            <p className="pb-1 font-sans text-xs text-white/45">
              · {usingRoute ? '' : '~'}{distanceLabel} away
            </p>
          )}
          {route?.trafficAware && (
            <span className="mb-1 rounded-full bg-brand-secondary/15 px-2 py-0.5 font-sans text-[10px] font-bold text-brand-secondary">
              live traffic
            </span>
          )}
        </div>
      )}

      {rider && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white/8 p-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-secondary/15">
            <Bike className="h-5 w-5 text-brand-secondary" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold text-white">{rider.name}</p>
            <p className="truncate font-sans text-[11px] text-white/45">
              {rider.vehicleNumber || 'Your delivery partner'}
            </p>
          </div>
          {rider.phone && (
            <a href={`tel:${rider.phone}`}
               className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-secondary text-brand-primary transition-transform active:scale-90">
              <Phone className="h-4 w-4" />
            </a>
          )}
        </div>
      )}

      {state === 'ready' && tracking ? (
        <>
          <LiveTrackMap rider={tracking} destination={destination}
                        onRoute={handleRoute}
                        className="h-56 w-full sm:h-72" />
          <p className="mt-2 font-sans text-[10px] text-white/30">
            {usingRoute
              ? 'Driving distance along the road route.'
              : 'Road route unavailable — straight-line estimate.'}
            {tracking.updatedAt && ` Updated ${tracking.updatedAt.toLocaleTimeString()}.`}
          </p>
        </>
      ) : state === 'error' ? (
        <p className="rounded-2xl bg-white/8 px-4 py-3 font-sans text-xs text-white/60">
          We can't show the rider's location right now — your order is still on its way.
        </p>
      ) : (
        <p className="rounded-2xl bg-white/8 px-4 py-3 font-sans text-xs text-white/60">
          {status === 'Out for Delivery'
            ? 'Waiting for your rider to start sharing their location…'
            : 'The live map appears here once your rider sets off.'}
        </p>
      )}
    </div>
  );
}

/** The order the customer is actually waiting for. */
function LiveOrderCard({ order }) {
  const status = normalise(order.status);
  const balanceDue = Number(order.balanceDue) || 0;
  const refundDue = Number(order.refundDue) || 0;
  const count = (order.items || []).reduce((n, i) => n + (i.quantity ?? i.qty ?? 1), 0);

  return (
    <article className="overflow-hidden rounded-[28px] bg-brand-primary p-5 text-white shadow-[0_20px_50px_-20px_rgba(11,77,59,0.6)] sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-brand-secondary">
            {STAGE_COPY[status] || status}
          </p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight">
            {count} {count === 1 ? 'item' : 'items'} · {inr(order.grandTotal ?? order.totalAmount ?? 0)}
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-white/35">
            {order.orderId || order.id.slice(0, 8)}
          </p>
        </div>
      </div>

      {order.itemsEditedAt && (
        <p className="mb-3 rounded-xl bg-brand-secondary/15 px-3 py-2 font-sans text-[11px] text-brand-secondary">
          Order updated{order.lastEditReason ? ` — ${order.lastEditReason}` : ''}.
        </p>
      )}
      {balanceDue > 0 && (
        <p className="mb-3 rounded-xl bg-amber-400/15 px-3 py-2 font-sans text-[11px] font-bold text-amber-200">
          Balance to pay: {inr(balanceDue)} — pay this to the rider.
        </p>
      )}
      {refundDue > 0 && (
        <p className="mb-3 rounded-xl bg-brand-secondary/15 px-3 py-2 font-sans text-[11px] font-bold text-brand-secondary">
          Refund due to you: {inr(refundDue)}.
        </p>
      )}

      <Timeline status={order.status} />
      <TrackPanel order={order} />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Past orders                                                         */
/* ------------------------------------------------------------------ */

const pastTone = (status) =>
  status === 'Delivered'
    ? 'bg-brand-secondary/15 text-brand-primary'
    : 'bg-red-50 text-red-600';

/** Collapsed by default — history is reference, not the subject of the page. */
function PastOrderRow({ order }) {
  const [open, setOpen] = useState(false);
  const status = normalise(order.status);
  const count = (order.items || []).reduce((n, i) => n + (i.quantity ?? i.qty ?? 1), 0);
  const when = order.createdAt?.toDate?.();

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-primary/8 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold text-brand-dark">
            {(order.items || []).slice(0, 2).map((i) => i.name).join(', ')}
            {count > 2 && <span className="text-brand-dark/40"> +{count - 2} more</span>}
          </p>
          <p className="mt-0.5 font-sans text-[11px] text-brand-dark/40">
            {when ? when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
            {' · '}{order.orderId || order.id.slice(0, 8)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-display text-sm font-bold text-brand-dark">
            {inr(order.grandTotal ?? order.totalAmount ?? 0)}
          </p>
          <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 font-sans text-[10px] font-bold ${pastTone(status)}`}>
            {status}
          </span>
        </div>

        <ChevronDown className={`h-4 w-4 shrink-0 text-brand-dark/25 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-brand-primary/8 bg-brand-offwhite/40 px-4 py-3">
          <ul className="space-y-1.5">
            {(order.items || []).map((it, i) => (
              <li key={i} className="flex justify-between gap-3 font-sans text-xs">
                <span className="truncate text-brand-dark/65">
                  {it.quantity ?? it.qty ?? 1} × {it.name}
                </span>
                <span className="shrink-0 text-brand-dark/45">
                  {inr((it.price || 0) * (it.quantity ?? it.qty ?? 1))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-brand-primary/8 pt-2 font-sans text-[11px] text-brand-dark/40">
            {String(order.paymentStatus || '').toLowerCase() === 'paid'
              ? 'Paid online'
              : String(order.paymentMethod || '').toUpperCase() === 'COD'
                ? 'Paid in cash'
                : 'Payment pending'}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const PAGE_SIZE = 15;

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [state, setState] = useState('loading');

  // Growing one live query rather than cursor-paging: orders change state
  // constantly, and cursor pages would hold stale snapshots after the first.
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    if (!db || !user) return undefined;
    const q = query(
      collection(db, 'orders'),
      where('customerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(pageSize),
    );
    return onSnapshot(
      q,
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAtEnd(snap.size < pageSize);
        setState('ready');
      },
      (e) => {
        console.error('[orders] listener failed', e);
        setState('error');
      },
    );
  }, [user, pageSize]);

  const active = orders.filter((o) => !FINISHED.includes(normalise(o.status)));
  const past = orders.filter((o) => FINISHED.includes(normalise(o.status)));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
      <h1 className="mb-6 font-display text-[28px] font-bold tracking-tight text-brand-dark">
        Your orders
      </h1>

      {state === 'loading' && (
        <div className="space-y-4">
          <div className="h-64 animate-pulse rounded-[28px] bg-white/70" />
          <div className="h-16 animate-pulse rounded-2xl bg-white/70" />
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-8 text-center">
          <AlertCircle className="mx-auto mb-2 h-6 w-6 text-red-500" />
          <p className="font-display text-base font-bold text-red-700">
            Couldn't load your orders
          </p>
          <button onClick={() => window.location.reload()}
                  className="mt-4 rounded-xl bg-red-600 px-5 py-2.5 font-sans text-sm font-bold text-white">
            Try again
          </button>
        </div>
      )}

      {state === 'ready' && orders.length === 0 && (
        <div className="rounded-[28px] border border-brand-primary/8 bg-white p-14 text-center">
          <ReceiptText className="mx-auto mb-3 h-7 w-7 text-brand-dark/15" />
          <p className="font-display text-lg font-bold text-brand-dark/70">No orders yet</p>
          <p className="mx-auto mt-2 max-w-xs font-sans text-sm leading-relaxed text-brand-dark/40">
            When you order, you'll be able to watch it being cooked and track the
            rider to your door.
          </p>
          <Link to="/home"
                className="mt-6 inline-block rounded-2xl bg-brand-primary px-6 py-3 font-display text-sm font-bold text-white">
            Browse the menu
          </Link>
        </div>
      )}

      {active.length > 0 && (
        <section className="mb-10 space-y-4">
          {active.map((o) => <LiveOrderCard key={o.id} order={o} />)}
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-brand-dark/35">
            Earlier
          </h2>
          <div className="space-y-2.5">
            {past.map((o) => <PastOrderRow key={o.id} order={o} />)}
          </div>
        </section>
      )}

      {state === 'ready' && orders.length > 0 && !atEnd && (
        <button
          onClick={() => setPageSize((n) => n + PAGE_SIZE)}
          className="mx-auto mt-6 block rounded-2xl border border-brand-primary/15 px-6 py-3 font-sans text-sm font-bold text-brand-primary transition-colors hover:bg-brand-primary/5"
        >
          Load older orders
        </button>
      )}
    </div>
  );
}
