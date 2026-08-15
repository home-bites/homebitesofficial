import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Minus, Trash2, Tag, ShoppingBag, AlertCircle, Loader2, Smartphone, CloudOff } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useStoreOpen, useFeatureFlags } from '../lib/useStoreOpen';
import { inr } from '../lib/format';
import CheckoutModal, { OrderPlaced } from '../components/CheckoutModal';

/**
 * The cart.
 *
 * Deliberately thin: every number here comes from CartContext's `totals`, the
 * same object CheckoutModal reads when it builds the order. Recomputing the
 * bill locally would give the customer a page that agrees with the checkout
 * sheet right up until one of the two is edited.
 *
 * Checkout itself is the existing CheckoutModal — address entry, COD, Razorpay
 * and the server-side signature verification all already work there. Phase 2
 * gives it a route to be reached from, it does not reimplement it.
 */

function Line({ line }) {
  const { add, remove } = useCart();
  const { item, qty } = line;

  // Removing outright rather than stepping down one at a time. `remove` drops
  // the line when qty hits 1, so clearing a quantity of 8 would otherwise mean
  // eight taps.
  const removeAll = () => {
    for (let i = 0; i < qty; i += 1) remove(item.id);
  };

  return (
    <div className="flex gap-3 border-b border-brand-primary/8 py-3 last:border-0">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-brand-offwhite">
        {item.imageUrl || item.image ? (
          <img src={item.imageUrl || item.image} alt={item.name}
               className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold text-brand-dark">{item.name}</p>
        <p className="font-sans text-xs text-brand-dark/45">{inr(item.price)} each</p>

        <div className="mt-2 flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-brand-primary/25">
            <button onClick={() => remove(item.id)} aria-label="Decrease quantity"
                    className="px-2 py-1 text-brand-primary"><Minus className="h-3.5 w-3.5" /></button>
            <span className="w-6 text-center font-sans text-xs font-bold text-brand-primary">{qty}</span>
            <button onClick={() => add(item)} aria-label="Increase quantity"
                    className="px-2 py-1 text-brand-primary"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <button onClick={removeAll}
                  className="flex items-center gap-1 font-sans text-[11px] font-semibold text-brand-dark/35 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
      </div>

      <span className="shrink-0 self-start font-display text-sm font-bold text-brand-dark">
        {inr(item.price * qty)}
      </span>
    </div>
  );
}

export default function CartPage() {
  const {
    items, totals, minimumOrderValue, syncState,
    coupon, couponError, couponBusy, applyCoupon, removeCoupon,
  } = useCart();
  const { storeOpen, closedMessage } = useStoreOpen();
  const { couponEnabled } = useFeatureFlags();

  const [code, setCode] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [placed, setPlaced] = useState(null);

  const empty = items.length === 0;
  const belowMinimum = minimumOrderValue > 0 && totals.subtotal < minimumOrderValue;
  const canCheckout = !empty && storeOpen && !belowMinimum;

  if (empty) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-primary/10">
          <ShoppingBag className="h-5 w-5 text-brand-primary" />
        </div>
        <h1 className="font-display text-xl font-bold text-brand-dark">Your cart is empty</h1>
        <p className="mt-2 font-sans text-sm text-brand-dark/50">
          Add something from the menu and it will show up here.
        </p>
        <Link to="/home"
              className="mt-6 inline-block rounded-xl bg-brand-primary px-5 py-2.5 font-sans text-sm font-bold text-white">
          Browse the menu
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
      <h1 className="mb-4 font-display text-xl font-bold text-brand-dark">
        Your cart <span className="font-sans text-sm font-semibold text-brand-dark/40">({totals.count} items)</span>
      </h1>

      {/* Where the basket lives. Said plainly rather than left to be
          discovered: 'local' is a real limitation of being signed out, and a
          failed sync is invisible until the customer opens their phone and
          finds a stale basket. */}
      {syncState === 'error' && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="font-sans text-xs leading-relaxed text-amber-800">
            This cart isn't syncing to your account right now, so your phone
            won't see these changes. You can still order — the total here is
            correct.
          </p>
        </div>
      )}

      {syncState === 'local' && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-brand-primary/15 bg-white p-3">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
          <p className="font-sans text-xs leading-relaxed text-brand-dark/60">
            Saved on this device only. Sign in and this basket joins your
            account — nothing is lost, it merges with whatever is already there.
          </p>
        </div>
      )}

      {!storeOpen && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="font-sans text-xs leading-relaxed text-amber-800">
            {closedMessage || 'Our kitchen is closed right now, so orders cannot be placed. Your cart is saved.'}
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* ---- items ---- */}
        <section className="rounded-2xl border border-brand-primary/10 bg-white px-4">
          {items.map((line) => <Line key={line.item.id} line={line} />)}
        </section>

        {/* ---- bill ---- */}
        <aside className="h-fit rounded-2xl border border-brand-primary/10 bg-white p-4 lg:sticky lg:top-5">
          {/* Coupon input disappears with the dashboard's coupon switch, the
              same flag the app and checkout obey. */}
          {couponEnabled && (
            <div className="mb-4 border-b border-brand-primary/8 pb-4">
              {coupon ? (
                <div className="flex items-center gap-2 rounded-xl border border-brand-secondary/40 bg-brand-secondary/10 p-2.5">
                  <Tag className="h-4 w-4 shrink-0 text-brand-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-xs font-bold text-brand-primary">
                      {coupon.code} applied
                    </p>
                    {coupon.description && (
                      <p className="truncate font-sans text-[11px] text-brand-dark/45">{coupon.description}</p>
                    )}
                  </div>
                  <button onClick={removeCoupon}
                          className="font-sans text-[11px] font-bold text-brand-dark/45 underline">
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Coupon code"
                    maxLength={24}
                    className="w-full min-w-0 rounded-xl border border-brand-primary/15 px-3 py-2 font-sans text-xs font-semibold uppercase text-brand-dark focus:border-brand-primary focus:outline-none"
                  />
                  <button
                    onClick={() => applyCoupon(code)}
                    disabled={couponBusy || !code.trim()}
                    className="shrink-0 rounded-xl border-2 border-brand-primary px-4 font-sans text-xs font-bold text-brand-primary disabled:opacity-40"
                  >
                    {couponBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply'}
                  </button>
                </div>
              )}
              {couponError && (
                <p className="mt-2 font-sans text-[11px] text-red-600">{couponError}</p>
              )}
            </div>
          )}

          <dl className="space-y-1.5 font-sans text-xs">
            <div className="flex justify-between">
              <dt className="text-brand-dark/55">Item total</dt>
              <dd className="font-semibold text-brand-dark">{inr(totals.subtotal)}</dd>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-brand-primary">
                <dt>Coupon discount</dt>
                <dd className="font-semibold">−{inr(totals.discount)}</dd>
              </div>
            )}
            {/* Charges an admin has set to zero are omitted rather than shown
                as ₹0.00 — a bill listing charges that do not apply reads like
                something failed to load. */}
            {totals.deliveryCharge > 0 && (
              <div className="flex justify-between">
                <dt className="text-brand-dark/55">Delivery charge</dt>
                <dd className="font-semibold text-brand-dark">{inr(totals.deliveryCharge)}</dd>
              </div>
            )}
            {totals.rainCharge > 0 && (
              <div className="flex justify-between">
                <dt className="text-brand-dark/55">Rain / peak charge</dt>
                <dd className="font-semibold text-brand-dark">{inr(totals.rainCharge)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-brand-dark/55">Platform fee</dt>
              <dd className="font-semibold text-brand-dark">
                {totals.platformFee === 0 ? 'Free' : inr(totals.platformFee)}
              </dd>
            </div>
            {totals.tax > 0 && (
              <div className="flex justify-between">
                <dt className="text-brand-dark/55">
                  Taxes &amp; GST{totals.taxRate ? ` (${totals.taxRate}%)` : ''}
                </dt>
                <dd className="font-semibold text-brand-dark">{inr(totals.tax)}</dd>
              </div>
            )}
          </dl>

          <div className="mt-3 flex justify-between border-t border-brand-primary/8 pt-3">
            <span className="font-display text-sm font-bold text-brand-dark">To pay</span>
            <span className="font-display text-lg font-bold text-brand-primary">{inr(totals.grand)}</span>
          </div>

          {belowMinimum && (
            <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 font-sans text-[11px] font-semibold text-amber-800">
              Add {inr(minimumOrderValue - totals.subtotal)} more to reach the {inr(minimumOrderValue)} minimum order.
            </p>
          )}

          <button
            onClick={() => setCheckoutOpen(true)}
            disabled={!canCheckout}
            className="mt-4 w-full rounded-xl bg-brand-primary py-3 font-sans text-sm font-bold text-white transition-colors hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:bg-brand-dark/15 disabled:text-brand-dark/35"
          >
            {!storeOpen ? 'Kitchen closed' : belowMinimum ? 'Minimum not reached' : 'Proceed to checkout'}
          </button>
        </aside>
      </div>

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onPlaced={(result) => { setCheckoutOpen(false); setPlaced(result); }}
      />

      {/* Tracking is a phase 3 route, so the success sheet keeps its own
          modal tracker for now rather than linking somewhere unfinished. */}
      <OrderPlaced
        result={placed}
        onTrack={() => setPlaced(null)}
        onClose={() => setPlaced(null)}
      />
    </div>
  );
}
