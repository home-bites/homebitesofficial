import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { ReceiptText, Navigation, Clock, AlertCircle, Phone, Bike } from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useOrderTracking, haversineKm, etaMinutes } from '../lib/useOrderTracking';
import { useRider } from '../lib/useRider';
import LiveTrackMap from '../components/app/LiveTrackMap';
import { inr } from '../lib/format';

/**
 * Order history and live tracking.
 *
 * Reads `orders` filtered by customerId — the same query the existing
 * OrderTracking modal uses, and one the rules can prove safe. Rider position
 * comes from `orderTracking` via useOrderTracking, which is the collection the
 * delivery partner app writes and the customer app already reads. Nothing here
 * invents a position or animates a marker along a guessed path.
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

const badgeClass = (status) => {
  switch (normalise(status)) {
    case 'Delivered': return 'bg-brand-secondary/20 text-brand-primary';
    case 'Cancelled':
    case 'Rejected': return 'bg-red-100 text-red-700';
    case 'Out for Delivery': return 'bg-brand-accent/15 text-brand-accent';
    default: return 'bg-brand-primary/10 text-brand-primary';
  }
};

function Timeline({ status }) {
  const current = STAGES.indexOf(normalise(status));
  if (['Cancelled', 'Rejected'].includes(normalise(status))) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 font-sans text-xs font-semibold text-red-700">
        This order was {normalise(status).toLowerCase()}.
      </p>
    );
  }
  return (
    <ol className="flex gap-1">
      {STAGES.map((s, i) => (
        <li key={s} className="flex-1">
          <div className={`h-1.5 rounded-full ${i <= current ? 'bg-brand-primary' : 'bg-brand-primary/12'}`} />
          <p className={`mt-1 font-sans text-[9px] leading-tight ${
            i <= current ? 'font-bold text-brand-primary' : 'text-brand-dark/30'}`}>
            {s}
          </p>
        </li>
      ))}
    </ol>
  );
}

function TrackPanel({ order }) {
  const status = normalise(order.status);
  const finished = FINISHED.includes(status);

  // A rider is assigned before the food leaves the kitchen, and they are often
  // already riding to collect it. Gating purely on "Out for Delivery" meant a
  // customer watching a Preparing order saw nothing at all — no rider, no map,
  // no explanation — even when a partner had been assigned and was reporting
  // their position.
  //
  // The partner id comes from the order document first: `assignedPartnerId` is
  // set at assignment, whereas orderTracking only appears once the rider's app
  // starts reporting. Waiting for the tracking document meant the rider's name
  // and phone stayed hidden during the window a customer is most likely to
  // want them.
  const partnerId = order.assignedPartnerId || '';
  const assigned = Boolean(partnerId);

  // Show from Ready onwards, or as soon as anyone is assigned.
  const trackable = !finished && (assigned || status === 'Ready' || status === 'Out for Delivery');

  const { tracking, state } = useOrderTracking(order.id, trackable);
  const rider = useRider(partnerId || tracking?.partnerId, trackable);

  // Set by LiveTrackMap once Directions answers. Null means no road route was
  // available, which switches the figures below back to straight-line.
  const [route, setRoute] = useState(null);
  const handleRoute = useCallback((r) => setRoute(r), []);

  const destLat = Number(order.deliveryAddress?.latitude ?? order.deliveryAddress?.lat);
  const destLng = Number(order.deliveryAddress?.longitude ?? order.deliveryAddress?.lng);
  const destination = Number.isFinite(destLat) && Number.isFinite(destLng) && !(destLat === 0 && destLng === 0)
    ? { lat: destLat, lng: destLng }
    : null;

  if (!trackable) return null;

  // Prefer the real road route. Straight-line is the fallback for when
  // Directions is unavailable, and the wording below changes with it so the
  // customer is never shown an approximation labelled as a road distance.
  const straightKm = tracking && destination ? haversineKm(tracking, destination) : null;
  const usingRoute = Boolean(route);
  const distanceLabel = usingRoute
    ? route.distanceText
    : straightKm == null
      ? null
      : straightKm < 1
        ? `${Math.round(straightKm * 1000)} m`
        : `${straightKm.toFixed(1)} km`;
  const etaLabel = usingRoute
    ? route.durationText
    : etaMinutes(straightKm) != null
      ? `approx. ${etaMinutes(straightKm)} min`
      : null;

  return (
    <div className="mt-3 border-t border-brand-primary/8 pt-3">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 font-sans text-xs font-bold text-brand-accent">
          <Navigation className="h-3.5 w-3.5" />
          {status === 'Out for Delivery' ? 'On the way' : 'Rider assigned'}
        </span>
        {distanceLabel && (
          <span className="font-sans text-xs text-brand-dark/55">
            {usingRoute ? '' : '~'}{distanceLabel} away
          </span>
        )}
        {etaLabel && (
          <span className="flex items-center gap-1 font-sans text-xs text-brand-dark/55">
            <Clock className="h-3.5 w-3.5" /> {etaLabel}
            {route?.trafficAware && (
              <span className="text-brand-accent" title="Includes current traffic">
                &nbsp;· live traffic
              </span>
            )}
          </span>
        )}
      </div>

      {/* Rider card. Name, phone and vehicle only — see useRider for why the
          rest of the partner document is deliberately not read. */}
      {rider && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-brand-primary/10 bg-brand-offwhite px-3 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-primary/10">
            <Bike className="h-4 w-4 text-brand-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-sans text-xs font-bold text-brand-dark">{rider.name}</p>
            {rider.vehicleNumber && (
              <p className="truncate font-sans text-[11px] text-brand-dark/45">{rider.vehicleNumber}</p>
            )}
          </div>
          {rider.phone && (
            <a href={`tel:${rider.phone}`}
               className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 font-sans text-[11px] font-bold text-white">
              <Phone className="h-3.5 w-3.5" /> Call
            </a>
          )}
        </div>
      )}

      {state === 'ready' && tracking ? (
        <>
          <LiveTrackMap rider={tracking} destination={destination}
                        onRoute={handleRoute} className="h-64 w-full" />
          <p className="mt-1.5 font-sans text-[10px] text-brand-dark/35">
            {usingRoute
              ? 'Driving distance and time along the road route.'
              : 'Road route unavailable — this is a straight-line estimate.'}
            {tracking.updatedAt && ` Last update ${tracking.updatedAt.toLocaleTimeString()}.`}
          </p>
        </>
      ) : state === 'error' ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 font-sans text-xs text-red-700">
          We can't show the rider's location right now. Your order is still on its way.
        </p>
      ) : (
        <p className="rounded-lg bg-brand-offwhite px-3 py-2 font-sans text-xs text-brand-dark/50">
          {status === 'Out for Delivery'
            ? 'Waiting for your rider to start sharing their location…'
            : 'The live map appears here once your rider is on the move.'}
        </p>
      )}
    </div>
  );
}

function OrderCard({ order }) {
  const status = normalise(order.status);
  const paid = String(order.paymentStatus || '').toLowerCase() === 'paid';
  const isCod = String(order.paymentMethod || '').toUpperCase() === 'COD';
  const balanceDue = Number(order.balanceDue) || 0;
  const refundDue = Number(order.refundDue) || 0;

  return (
    <article className="rounded-2xl border border-brand-primary/10 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold text-brand-dark">
            {order.orderId || order.id.slice(0, 8)}
          </p>
          <p className="font-sans text-[11px] text-brand-dark/40">
            {order.createdAt?.toDate?.().toLocaleString?.() || ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-sm font-bold text-brand-primary">
            {inr(order.grandTotal ?? order.totalAmount ?? 0)}
          </p>
          <span className={`inline-block rounded-full px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide ${badgeClass(order.status)}`}>
            {status}
          </span>
        </div>
      </div>

      {order.itemsEditedAt && (
        <p className="mb-2 rounded-lg bg-brand-secondary/10 px-2.5 py-1.5 font-sans text-[11px] text-brand-primary">
          Order updated{order.lastEditReason ? ` — ${order.lastEditReason}` : ''}.
        </p>
      )}
      {balanceDue > 0 && (
        <p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-1.5 font-sans text-[11px] font-bold text-amber-800">
          Balance to pay: {inr(balanceDue)} — pay this to the rider.
        </p>
      )}
      {refundDue > 0 && (
        <p className="mb-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 font-sans text-[11px] font-bold text-emerald-800">
          Refund due to you: {inr(refundDue)}.
        </p>
      )}

      <ul className="mb-3 space-y-0.5">
        {(order.items || []).map((it, i) => (
          <li key={i} className="flex justify-between font-sans text-xs">
            <span className="truncate text-brand-dark/65">
              {it.quantity ?? it.qty ?? 1}× {it.name}
            </span>
            <span className="ml-3 shrink-0 text-brand-dark/45">
              {inr((it.price || 0) * (it.quantity ?? it.qty ?? 1))}
            </span>
          </li>
        ))}
      </ul>

      <p className="mb-3 font-sans text-[11px] text-brand-dark/40">
        {paid ? 'Paid' : isCod ? 'Cash on delivery' : 'Payment pending'}
      </p>

      <Timeline status={order.status} />
      <TrackPanel order={order} />
    </article>
  );
}

const PAGE_SIZE = 15;

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error

  // Pagination by growing the listener's limit rather than by paging with a
  // cursor. Orders change state constantly — a rider moves an order from Ready
  // to Out for Delivery mid-scroll — and a cursor-paged list would hold stale
  // snapshots for every page after the first. Growing one live query keeps
  // every order on screen current, at the cost of re-reading what is already
  // loaded when the customer asks for more.
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
        // Fewer documents than asked for means there is nothing further back.
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
    <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
      <h1 className="mb-4 font-display text-xl font-bold text-brand-dark">Your orders</h1>

      {state === 'loading' && (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/70" />)}
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="font-sans text-sm font-bold text-red-700">Couldn't load your orders</p>
            <button onClick={() => window.location.reload()}
                    className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 font-sans text-xs font-bold text-white">
              Try again
            </button>
          </div>
        </div>
      )}

      {state === 'ready' && orders.length === 0 && (
        <div className="rounded-2xl border border-brand-primary/10 bg-white p-10 text-center">
          <ReceiptText className="mx-auto mb-2 h-6 w-6 text-brand-dark/20" />
          <p className="font-display text-sm font-bold text-brand-dark/70">No orders yet</p>
          <Link to="/home"
                className="mt-4 inline-block rounded-xl bg-brand-primary px-5 py-2.5 font-sans text-sm font-bold text-white">
            Browse the menu
          </Link>
        </div>
      )}

      {active.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-sans text-xs font-bold uppercase tracking-wider text-brand-dark/45">
            Active
          </h2>
          <div className="space-y-3">
            {active.map((o) => <OrderCard key={o.id} order={o} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-2 font-sans text-xs font-bold uppercase tracking-wider text-brand-dark/45">
            Past orders
          </h2>
          <div className="space-y-3">
            {past.map((o) => <OrderCard key={o.id} order={o} />)}
          </div>
        </section>
      )}

      {state === 'ready' && orders.length > 0 && !atEnd && (
        <button
          onClick={() => setPageSize((n) => n + PAGE_SIZE)}
          className="mx-auto mt-5 block rounded-xl border border-brand-primary/20 px-5 py-2.5 font-sans text-sm font-bold text-brand-primary transition-colors hover:bg-brand-primary/5"
        >
          Load older orders
        </button>
      )}
    </div>
  );
}
