import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Minus, Trash2, Tag, ShoppingBag, AlertCircle, Loader2,
  Smartphone, CloudOff, ArrowRight, X,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useStoreOpen, useFeatureFlags } from '../lib/useStoreOpen';
import { inr } from '../lib/format';
import CheckoutModal, { OrderPlaced } from '../components/CheckoutModal';

/**
 * The cart.
 *
 * The old version was a two-column form: a list of thin rows on the left, a
 * bill of grey labels on the right, and the amount payable in the same 14px
 * type as everything above it. The total is the whole point of a cart, and it
 * looked like a footnote.
 *
 * Now the food is visible — 72px thumbnails instead of 64px squares that were
 * mostly empty — and the payable amount is the largest thing on the page, on a
 * dark panel that reads as the destination rather than another card in a stack.
 * On mobile the checkout button is pinned to the bottom, because a customer
 * scrolling nine dishes should not have to scroll back for the one control
 * they want.
 *
 * Every figure still comes from CartContext's `totals`, the same object
 * CheckoutModal reads when it builds the order. Computing the bill twice is how
 * a cart and a checkout sheet end up disagreeing.
 */

function Line({ line }) {
  const { add, remove } = useCart();
  const { item, qty } = line;

  // `remove` drops the line when qty hits 1, so clearing eight portions would
  // otherwise take eight taps.
  const removeAll = () => { for (let i = 0; i < qty; i += 1) remove(item.id); };

  return (
    <div className="flex gap-4 py-4">
      <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-brand-offwhite">
        {(item.imageUrl || item.image) && (
          <img src={item.imageUrl || item.image} alt={item.name} loading="lazy"
               className="h-full w-full object-cover" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-bold leading-tight text-brand-dark">
              {item.name}
            </p>
            <p className="mt-0.5 font-sans text-xs text-brand-dark/40">
              {inr(item.price)} each
            </p>
          </div>
          <button
            onClick={removeAll}
            aria-label={`Remove ${item.name}`}
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-brand-dark/20 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full border border-brand-primary/15 p-0.5">
            <button onClick={() => remove(item.id)} aria-label="One less"
                    className="grid h-7 w-7 place-items-center rounded-full text-brand-primary transition-colors hover:bg-brand-primary/8">
              <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
            <span className="min-w-[1.25rem] text-center font-display text-sm font-bold text-brand-primary">
              {qty}
            </span>
            <button onClick={() => add(item)} aria-label="One more"
                    className="grid h-7 w-7 place-items-center rounded-full text-brand-primary transition-colors hover:bg-brand-primary/8">
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </div>

          <span className="font-display text-[15px] font-bold text-brand-dark">
            {inr(item.price * qty)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** One line of the bill. Discounts read green so a saving looks like one. */
function BillRow({ label, value, tone = 'normal', hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={`font-sans text-[13px] ${
        tone === 'credit' ? 'text-brand-secondary' : 'text-white/50'}`}>
        {label}
        {hint && <span className="ml-1 text-white/25">{hint}</span>}
      </span>
      <span className={`shrink-0 font-sans text-[13px] font-semibold ${
        tone === 'credit' ? 'text-brand-secondary' : 'text-white/80'}`}>
        {value}
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

  const cta = !storeOpen ? 'Kitchen closed'
    : belowMinimum ? `Add ${inr(minimumOrderValue - totals.subtotal)} more`
      : 'Checkout';

  if (empty) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-8">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-brand-primary/8">
          <ShoppingBag className="h-7 w-7 text-brand-primary/50" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-brand-dark">
          Your bag is empty
        </h1>
        <p className="mx-auto mt-2 max-w-xs font-sans text-sm leading-relaxed text-brand-dark/40">
          Add a dish from the menu and it will be waiting here.
        </p>
        <Link to="/home"
              className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-brand-primary px-6 py-3.5 font-display text-sm font-bold text-white transition-transform active:scale-95">
          Browse the menu <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-8 lg:pb-10">
      <h1 className="mb-1 font-display text-[28px] font-bold tracking-tight text-brand-dark">
        Your bag
      </h1>
      <p className="mb-6 font-sans text-sm text-brand-dark/40">
        {totals.count} {totals.count === 1 ? 'item' : 'items'}
      </p>

      {/* Status notices, quietest first. */}
      {syncState === 'error' && (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="font-sans text-xs leading-relaxed text-amber-800">
            This bag isn't syncing to your account, so your phone won't see these
            changes. You can still order — the total here is correct.
          </p>
        </div>
      )}

      {syncState === 'local' && (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-brand-primary/10 bg-white p-4">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
          <p className="font-sans text-xs leading-relaxed text-brand-dark/55">
            Saved on this device. Sign in and this bag joins your account —
            it merges with whatever is already there, nothing is lost.
          </p>
        </div>
      )}

      {!storeOpen && (
        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="font-sans text-xs leading-relaxed text-amber-800">
            {closedMessage || 'Our kitchen is closed right now. Your bag is saved — ordering reopens shortly.'}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        {/* ---------- items ---------- */}
        <section className="divide-y divide-brand-primary/8 rounded-3xl border border-brand-primary/8 bg-white px-5">
          {items.map((line) => <Line key={line.item.id} line={line} />)}
        </section>

        {/* ---------- bill ---------- */}
        <aside className="lg:sticky lg:top-6">
          {couponEnabled && (
            <div className="mb-4 rounded-3xl border border-brand-primary/8 bg-white p-4">
              {coupon ? (
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-secondary/15">
                    <Tag className="h-4 w-4 text-brand-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold text-brand-primary">
                      {coupon.code}
                    </p>
                    <p className="truncate font-sans text-[11px] text-brand-dark/40">
                      {coupon.description || 'Applied to this order'}
                    </p>
                  </div>
                  <button onClick={removeCoupon} aria-label="Remove coupon"
                          className="shrink-0 rounded-lg p-1.5 text-brand-dark/25 hover:bg-brand-offwhite hover:text-brand-dark/60">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Coupon code"
                    maxLength={24}
                    className="w-full min-w-0 rounded-xl bg-brand-offwhite px-3.5 py-3 font-sans text-sm font-semibold uppercase tracking-wide text-brand-dark placeholder:font-normal placeholder:tracking-normal placeholder:text-brand-dark/30 focus:outline-none focus:ring-2 focus:ring-brand-primary/15"
                  />
                  <button
                    onClick={() => applyCoupon(code)}
                    disabled={couponBusy || !code.trim()}
                    className="shrink-0 rounded-xl bg-brand-primary px-5 font-sans text-sm font-bold text-white transition-colors disabled:bg-brand-dark/10 disabled:text-brand-dark/30"
                  >
                    {couponBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                  </button>
                </div>
              )}
              {couponError && (
                <p className="mt-2 font-sans text-[11px] text-red-600">{couponError}</p>
              )}
            </div>
          )}

          {/* Dark panel: the destination, not another card in the stack. */}
          <div className="rounded-3xl bg-brand-primary p-5 text-white shadow-[0_18px_44px_-20px_rgba(11,77,59,0.6)]">
            <BillRow label="Item total" value={inr(totals.subtotal)} />
            {totals.discount > 0 && (
              <BillRow label="Coupon discount" value={`−${inr(totals.discount)}`} tone="credit" />
            )}
            {/* Charges set to zero in the dashboard are omitted — a bill listing
                charges that do not apply reads like something failed to load. */}
            {/* The distance sits in the label because it is what sets the
                charge. Before a location is chosen there is no distance and
                this is the base fare, which the cart says plainly rather than
                presenting as the final figure. */}
            {totals.deliveryCharge > 0 && (
              <BillRow
                label={totals.deliveryDistanceKm !== null
                  ? `Delivery · ${totals.deliveryDistanceKm} km`
                  : 'Delivery · base fare'}
                value={inr(totals.deliveryCharge)}
              />
            )}
            {totals.rainCharge > 0 && (
              <BillRow label="Rain / peak charge" value={inr(totals.rainCharge)} />
            )}
            <BillRow
              label="Platform fee"
              value={totals.platformFee === 0 ? 'Free' : inr(totals.platformFee)}
            />
            {totals.tax > 0 && (
              <BillRow
                label="Taxes & GST"
                hint={totals.taxRate ? `(${totals.taxRate}%)` : ''}
                value={inr(totals.tax)}
              />
            )}

            <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/12 pt-4">
              <span className="pb-1 font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
                To pay
              </span>
              <span className="font-display text-3xl font-bold leading-none text-brand-secondary">
                {inr(totals.grand)}
              </span>
            </div>

            {belowMinimum && (
              <p className="mt-4 rounded-xl bg-amber-400/15 px-3 py-2.5 font-sans text-[11px] leading-relaxed text-amber-200">
                Minimum order is {inr(minimumOrderValue)} — add{' '}
                {inr(minimumOrderValue - totals.subtotal)} more to check out.
              </p>
            )}

            {/* Hidden on mobile: the pinned bar below carries it there. */}
            <button
              onClick={() => setCheckoutOpen(true)}
              disabled={!canCheckout}
              className="mt-4 hidden w-full items-center justify-center gap-2 rounded-2xl bg-brand-secondary py-4 font-display text-sm font-bold text-brand-primary transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 lg:flex"
            >
              {cta} {canCheckout && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>

          <Link to="/home"
                className="mt-4 hidden text-center font-sans text-xs font-bold text-brand-primary/60 transition-colors hover:text-brand-primary lg:block">
            Add more dishes
          </Link>
        </aside>
      </div>

      {/* ---------- pinned mobile checkout ---------- */}
      <div className="fixed inset-x-0 bottom-[68px] z-30 border-t border-brand-primary/8 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          onClick={() => setCheckoutOpen(true)}
          disabled={!canCheckout}
          className="flex w-full items-center justify-between gap-3 rounded-2xl bg-brand-primary px-5 py-4 text-white transition-transform active:scale-[0.98] disabled:bg-brand-dark/15"
        >
          <span className="text-left">
            <span className="block font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
              {totals.count} {totals.count === 1 ? 'item' : 'items'}
            </span>
            <span className="block font-display text-lg font-bold leading-tight">
              {inr(totals.grand)}
            </span>
          </span>
          <span className="flex items-center gap-1.5 font-display text-sm font-bold text-brand-secondary">
            {cta} <ArrowRight className="h-4 w-4" />
          </span>
        </button>
      </div>

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onPlaced={(result) => { setCheckoutOpen(false); setPlaced(result); }}
      />

      <OrderPlaced
        result={placed}
        onTrack={() => setPlaced(null)}
        onClose={() => setPlaced(null)}
      />
    </div>
  );
}
