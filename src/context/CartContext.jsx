import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { normaliseCoupon } from '../lib/validate';

const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);

/**
 * Flat fee on every order. Shown to the customer as "Platform fee".
 *
 * The 10 here is the fallback for a build where VITE_DELIVERY_FEE wasn't
 * set — it must match the .env value, or a misconfigured deploy quietly
 * charges a different amount than the one you agreed.
 */
const DELIVERY_FEE = Number(import.meta.env.VITE_DELIVERY_FEE ?? 10);
const STORAGE_KEY = 'homebites.cart.v1';

export function CartProvider({ children }) {
  // Map<itemId, { item, qty }> held as a plain object for easy persistence.
  const [lines, setLines] = useState({});
  const [coupon, setCoupon] = useState(null);       // validated CouponModel-ish
  const [couponError, setCouponError] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);

  // Survive an accidental refresh mid-order.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setLines(JSON.parse(saved));
    } catch { /* corrupt storage is not worth crashing over */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lines)); } catch { /* quota */ }
  }, [lines]);

  const add = useCallback((item) => {
    setLines((prev) => {
      const cur = prev[item.id]?.qty || 0;
      return { ...prev, [item.id]: { item, qty: cur + 1 } };
    });
  }, []);

  const remove = useCallback((itemId) => {
    setLines((prev) => {
      const cur = prev[itemId]?.qty || 0;
      if (cur <= 1) {
        const { [itemId]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { ...prev[itemId], qty: cur - 1 } };
    });
  }, []);

  const clear = useCallback(() => {
    setLines({});
    setCoupon(null);
    setCouponError('');
  }, []);

  const qtyOf = useCallback((itemId) => lines[itemId]?.qty || 0, [lines]);

  const totals = useMemo(() => {
    const list = Object.values(lines);
    const subtotal = list.reduce((s, l) => s + l.item.price * l.qty, 0);
    const count = list.reduce((s, l) => s + l.qty, 0);

    let discount = 0;
    if (coupon && subtotal >= (coupon.minOrderValue || 0)) {
      if (coupon.discountType === 'percentage') {
        discount = subtotal * (coupon.discountValue / 100);
        if (coupon.maxDiscount > 0 && discount > coupon.maxDiscount) {
          discount = coupon.maxDiscount;
        }
      } else {
        discount = coupon.discountValue;
      }
      if (discount > subtotal) discount = subtotal;
    }

    const delivery = count > 0 ? DELIVERY_FEE : 0;
    const grand = Math.max(0, subtotal - discount) + delivery;

    return {
      count,
      subtotal: +subtotal.toFixed(2),
      discount: +discount.toFixed(2),
      delivery,
      grand: +grand.toFixed(2),
    };
  }, [lines, coupon]);

  /**
   * Looks a coupon up by code and validates it against the current subtotal.
   *
   * The rules only allow reading /coupons when signed in, so this is called
   * after Google sign-in. Everything is re-derived from the Firestore document
   * rather than trusted from the UI, and the same shape of checks the app's
   * CouponModel applies is repeated here — expiry, active flag, soft-delete and
   * minimum order value.
   *
   * Note the discount is recomputed on the server side too when the Cloud
   * Function creates the Razorpay order from `grandTotal`; a tampered client
   * can only lower the amount it asks to pay, which the kitchen sees before
   * accepting the order.
   */
  const applyCoupon = useCallback(async (rawCode) => {
    const code = normaliseCoupon(rawCode);
    setCouponError('');

    if (!code) { setCouponError('Enter a coupon code.'); return false; }
    if (!db) { setCouponError('Coupons are unavailable right now.'); return false; }

    setCouponBusy(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'coupons'), where('code', '==', code), limit(1)),
      );

      if (snap.empty) { setCouponError('That code doesn\'t exist.'); return false; }

      const d = snap.docs[0];
      const x = d.data();

      if (x.isDeleted === true) { setCouponError('That code is no longer available.'); return false; }

      const status = x.status || (x.isActive === false ? 'Disabled' : 'Active');
      if (status === 'Disabled' || x.isActive === false) {
        setCouponError('That code is no longer active.');
        return false;
      }

      const rawExpiry = x.expiresAt ?? x.expiryDate ?? x.expiry;
      const expiry =
        typeof rawExpiry?.toDate === 'function' ? rawExpiry.toDate()
        : typeof rawExpiry === 'string'
          ? (rawExpiry.toLowerCase().trim() === 'no expiry' ? new Date(2099, 11, 31) : new Date(rawExpiry))
          : rawExpiry != null ? new Date(rawExpiry) : null;
      if (expiry && !Number.isNaN(expiry.getTime()) && expiry < new Date()) {
        setCouponError('That code has expired.');
        return false;
      }

      const minOrderValue = Number(
        x.minOrderValue ?? x.minimumOrderValue ?? x.minOrder ?? x.minimumOrder ?? 0,
      );
      if (totals.subtotal < minOrderValue) {
        setCouponError(`Add ₹${Math.ceil(minOrderValue - totals.subtotal)} more to use this code.`);
        return false;
      }

      setCoupon({
        id: d.id,
        code: x.code || code,
        description: x.description || '',
        discountType: x.discountType || 'flat',
        discountValue: Number(x.discountValue || 0),
        minOrderValue,
        maxDiscount: Number(x.maxDiscountAmount ?? x.maxDiscount ?? 0),
      });
      return true;
    } catch (e) {
      console.error('[coupon] lookup failed', e);
      setCouponError('Could not check that code. Please try again.');
      return false;
    } finally {
      setCouponBusy(false);
    }
  }, [totals.subtotal]);

  const removeCoupon = useCallback(() => {
    setCoupon(null);
    setCouponError('');
  }, []);

  // A coupon that was valid at ₹500 shouldn't survive the cart dropping to
  // ₹200 — re-check the minimum whenever the subtotal moves.
  useEffect(() => {
    if (coupon && totals.subtotal < (coupon.minOrderValue || 0)) {
      setCoupon(null);
      setCouponError('Coupon removed — your cart no longer meets the minimum.');
    }
  }, [totals.subtotal, coupon]);

  const value = useMemo(() => ({
    lines, items: Object.values(lines), totals, deliveryFee: DELIVERY_FEE,
    add, remove, clear, qtyOf,
    coupon, couponError, couponBusy, applyCoupon, removeCoupon,
  }), [lines, totals, add, remove, clear, qtyOf, coupon, couponError, couponBusy, applyCoupon, removeCoupon]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
