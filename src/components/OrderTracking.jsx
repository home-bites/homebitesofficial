import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { X, Check, Clock, PackageX, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { inr, timeAgo, ORDER_STAGES, stageIndex } from '../lib/format';
import { useAuth } from '../context/AuthContext';

/**
 * Live order tracking.
 *
 * Reads straight from Firestore with onSnapshot, so the kitchen moving an
 * order to Preparing in the admin dashboard updates this view within a second
 * — no polling and no refresh. The rules only return orders whose
 * `customerId` matches the signed-in UID, so this can't leak anyone else's.
 */
function Timeline({ order }) {
  const cancelled = order.status === 'Cancelled';
  const current = stageIndex(order.status);

  if (cancelled) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4">
        <PackageX className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        <div>
          <p className="font-sans text-sm font-bold text-red-700">Order cancelled</p>
          <p className="font-sans text-xs text-red-600/80">
            If you were charged, the refund reaches your account in 5–7 working days.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ol className="relative ml-2 border-l-2 border-brand-primary/12 pl-6">
      {ORDER_STAGES.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={stage.key} className="relative pb-5 last:pb-0">
            <span
              className={`absolute -left-[calc(1.5rem+1px)] grid h-5 w-5 place-items-center rounded-full border-2 transition
                ${done ? 'border-brand-primary bg-brand-primary text-white'
                       : active ? 'animate-pulse border-brand-accent bg-brand-accent text-white'
                                : 'border-brand-primary/20 bg-white'}`}
            >
              {done ? <Check className="h-3 w-3" /> : active ? <Clock className="h-3 w-3" /> : null}
            </span>
            <p className={`font-sans text-sm font-bold ${active ? 'text-brand-primary' : done ? 'text-brand-dark' : 'text-brand-dark/35'}`}>
              {stage.label}
            </p>
            {(active || done) && (
              <p className="font-sans text-xs text-brand-dark/45">{stage.hint}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function OrderCard({ order }) {
  const paid = order.paymentStatus === 'Paid';
  const isCod = order.paymentMethod === 'COD';

  // The handover code, shown for as long as it can still be used.
  //
  // Hidden once the order is delivered or cancelled: at that point it proves
  // nothing and only invites someone to read out a spent code. Orders placed
  // before onOrderCreatedIssueCode existed have no code, so the block is
  // skipped rather than showing an empty box.
  const finished = ['Delivered', 'Cancelled', 'Rejected'].includes(order.status);
  const showCode = !finished && /^\d{4}$/.test(String(order.verificationCode || ''));

  // Written by adminUpdateOrderItems when an admin changes the items.
  const balanceDue = Number(order.balanceDue) || 0;
  const refundDue = Number(order.refundDue) || 0;
  // Denormalised by the function so both clients read the same string rather
  // than each digging the last element out of itemRevisions their own way.
  const editReason = String(order.lastEditReason || '').trim();

  return (
    <div className="rounded-2xl border border-brand-primary/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-base font-bold text-brand-dark">{order.orderId || order.id.slice(0, 8)}</p>
          <p className="font-sans text-xs text-brand-dark/45">{timeAgo(order.createdAt)}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-base font-bold text-brand-primary">{inr(order.grandTotal ?? order.totalAmount)}</p>
          {/* "Payment pending" on a cash order reads like something went
              wrong. Nothing is pending — the customer pays the rider. */}
          <span className={`inline-block rounded-full px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide
            ${paid ? 'bg-brand-secondary/20 text-brand-primary'
                   : isCod ? 'bg-brand-primary/10 text-brand-primary'
                           : 'bg-amber-100 text-amber-700'}`}>
            {paid ? 'Paid' : isCod ? 'Cash on delivery' : 'Payment pending'}
          </span>
        </div>
      </div>

      {showCode && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-primary/15 bg-brand-primary/5 p-3">
          <div>
            <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-brand-dark/50">
              Delivery code
            </p>
            <p className="font-display text-xl font-bold tracking-[0.25em] text-brand-primary">
              {order.verificationCode}
            </p>
          </div>
          <p className="flex-1 font-sans text-[11px] leading-relaxed text-brand-dark/55">
            Read this to the rider once your order is in your hands.
          </p>
        </div>
      )}

      {!paid && !isCod && order.paymentId && (
        <p className="mb-4 rounded-lg bg-amber-50 p-2.5 font-sans text-[11px] leading-relaxed text-amber-800">
          We've received your payment reference and are waiting for the bank to
          confirm it. This usually takes under a minute.
        </p>
      )}

      {/*
        Shown when the kitchen changed the items after the order was placed —
        usually because the customer rang to add or drop something.

        The total above already updates on its own, because this card is a live
        snapshot listener. That is exactly the problem this block solves: a
        price silently changing under someone is worse than one that changes
        with a reason attached. The website has no notification centre, so this
        card is the only place a web customer would ever find out.
      */}
      {order.itemsEditedAt && (
        <div className="mb-4 rounded-xl border border-brand-secondary/40 bg-brand-secondary/10 p-3">
          <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-brand-primary">
            Order updated
          </p>
          <p className="mt-0.5 font-sans text-[12px] leading-relaxed text-brand-dark/70">
            We changed the items on this order
            {editReason ? ` — ${editReason}.` : '.'}
            {' '}The total above reflects the change.
          </p>

          {/* Money on these is settled by hand, so the figure and who acts
              next are both stated rather than left to be worked out. */}
          {balanceDue > 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 font-sans text-[12px] font-bold text-amber-800">
              Balance to pay: {inr(balanceDue)} — please pay this to the rider.
            </p>
          )}
          {refundDue > 0 && (
            <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 font-sans text-[12px] font-bold text-emerald-800">
              Refund due to you: {inr(refundDue)} — we'll return this to you.
            </p>
          )}
        </div>
      )}

      <div className="mb-4 space-y-1">
        {(order.items || []).map((it, i) => (
          <div key={i} className="flex justify-between font-sans text-[13px]">
            <span className="truncate text-brand-dark/70">{it.quantity}× {it.name}</span>
            <span className="ml-3 flex-shrink-0 text-brand-dark/50">{inr((it.price || 0) * (it.quantity || 1))}</span>
          </div>
        ))}
      </div>

      <Timeline order={order} />

      {order.deliveryAddress?.addressLine && (
        <p className="mt-4 border-t border-brand-primary/8 pt-3 font-sans text-xs leading-relaxed text-brand-dark/45">
          Delivering to: {order.deliveryAddress.addressLine}
        </p>
      )}
    </div>
  );
}

export default function OrderTracking({ open, onClose }) {
  const { user, isSignedIn, signInWithGoogle } = useAuth();
  const [orders, setOrders] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | empty | error

  useEffect(() => {
    if (!open || !isSignedIn || !db || !user) return undefined;

    setState('loading');
    const q = query(
      collection(db, 'orders'),
      where('customerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(10),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setOrders(list);
        setState(list.length ? 'ready' : 'empty');
      },
      (err) => {
        console.error('[tracking] snapshot failed', err);
        // A missing composite index surfaces here as failed-precondition; the
        // console error carries a direct link to create it.
        setState('error');
      },
    );
    return unsub;
  }, [open, isSignedIn, user]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-brand-dark/60 backdrop-blur-sm sm:items-center sm:p-6"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-brand-offwhite shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-brand-primary/10 bg-white px-6 py-5">
              <div>
                <h2 className="font-display text-xl font-bold text-brand-primary">Track your order</h2>
                <p className="font-sans text-xs text-brand-dark/50">Updates live as the kitchen works</p>
              </div>
              <button onClick={onClose} aria-label="Close"
                      className="grid h-9 w-9 place-items-center rounded-full text-brand-dark/50 transition hover:bg-brand-offwhite hover:text-brand-dark">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {!isSignedIn ? (
                <div className="rounded-2xl border border-brand-primary/10 bg-white p-8 text-center">
                  <p className="mb-4 font-sans text-sm text-brand-dark/60">
                    Sign in with the Google account you ordered with to see your orders.
                  </p>
                  <button onClick={signInWithGoogle}
                          className="rounded-xl bg-brand-primary px-6 py-3 font-sans text-sm font-bold text-white transition hover:bg-brand-primary/90">
                    Continue with Google
                  </button>
                </div>
              ) : state === 'loading' ? (
                <div className="grid place-items-center py-14 text-brand-primary/50">
                  <Loader2 className="h-7 w-7 animate-spin" />
                </div>
              ) : state === 'error' ? (
                <p className="rounded-2xl bg-white p-8 text-center font-sans text-sm text-brand-dark/55">
                  We couldn't load your orders just now. Please close this and try again.
                </p>
              ) : state === 'empty' ? (
                <p className="rounded-2xl bg-white p-8 text-center font-sans text-sm text-brand-dark/55">
                  No orders yet. Once you place one, it'll appear here.
                </p>
              ) : (
                orders.map((o) => <OrderCard key={o.id} order={o} />)
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
