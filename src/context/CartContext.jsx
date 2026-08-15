import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { normaliseCoupon } from '../lib/validate';
import { useAppSettings } from '../lib/useAppSettings';
import { useAuth } from './AuthContext';
import {
  loadRemoteCart, saveRemoteCart, watchRemoteCart, mergeLines, sameLines,
} from '../lib/cartSync';

const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);

/**
 * Fallback platform fee, used only until the live settings document arrives —
 * and if Firestore is unreachable, for the whole session.
 *
 * The fee now comes from `appSettings/general.platformFee`, the same field the
 * mobile app and admin dashboard read. It used to come from this constant
 * alone, which is baked in at build time: changing the fee in Settings updated
 * the app instantly and the website never, so the two quoted different totals
 * for the same basket until somebody redeployed.
 *
 * This value must still match your .env and the dashboard, because it is what
 * a customer is charged in the seconds before settings load.
 */
const FALLBACK_PLATFORM_FEE = Number(import.meta.env.VITE_DELIVERY_FEE ?? 10);
const STORAGE_KEY = 'homebites.cart.v1';

export function CartProvider({ children }) {
  // Live pricing. `platformFee` is null until the document arrives, which is
  // why the fallback below is a `??` rather than a `||` — a genuine fee of 0
  // set by an admin must survive, and `0 || 10` would quietly become 10.
  const appSettings = useAppSettings();
  const platformFee = appSettings.platformFee ?? FALLBACK_PLATFORM_FEE;

  // CartProvider is mounted inside AuthProvider in App.jsx, so this is safe.
  const { user } = useAuth();

  // Map<itemId, { item, qty }> held as a plain object for easy persistence.
  const [lines, setLines] = useState({});

  // Guards the write-back effect. Without it the first cloud snapshot after
  // sign-in would be written straight back, and a remote clear performed on the
  // phone would race the website re-uploading what it still held.
  const syncedRef = useRef(false);

  /**
   * Where the basket currently lives, as far as the customer is concerned.
   *
   *   'local'  — signed out. Saved on this device only.
   *   'synced' — written to the cloud; the phone will see it.
   *   'error'  — a write failed. The basket still works here, but the phone
   *              will not see these changes.
   *
   * Surfaced in the cart rather than only logged. A cart that has quietly
   * stopped syncing is indistinguishable from a healthy one until the customer
   * opens their phone and finds a stale basket.
   */
  const [syncState, setSyncState] = useState('local');
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

  /**
   * Sign-in: merge whatever is in this browser with the customer's cloud cart.
   *
   * `mergeLines` unions the two and takes the larger quantity per dish — see
   * cartSync.js for why neither side is allowed to win outright. Running once
   * per uid, before the listener is attached, so the merged result is what gets
   * published rather than one side overwriting the other.
   */
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // Signed out: the cloud cart is not ours to touch. The local basket stays
      // so an accidental sign-out does not empty someone's order.
      syncedRef.current = false;
      setSyncState('local');
      return undefined;
    }

    (async () => {
      const remote = await loadRemoteCart(user.uid);
      if (cancelled) return;

      setLines((local) => {
        const merged = remote ? mergeLines(local, remote) : local;
        // Push the merge up immediately when it differs from what the cloud
        // holds, so the phone sees the website's additions without waiting for
        // the next local change.
        if (!remote || !sameLines(merged, remote)) {
          saveRemoteCart(user.uid, merged).then((ok) => setSyncState(ok ? 'synced' : 'error'));
        } else {
          setSyncState('synced');
        }
        return merged;
      });

      syncedRef.current = true;
    })();

    return () => { cancelled = true; };
  }, [user]);

  /**
   * Cloud -> local. Picks up a change made on the phone while the site is open.
   *
   * Ignored until the merge above has run, otherwise the first snapshot would
   * arrive mid-merge and clobber the local basket.
   */
  useEffect(() => {
    if (!user) return undefined;
    return watchRemoteCart(user.uid, (remoteLines) => {
      if (!syncedRef.current) return;
      setLines((local) => (sameLines(local, remoteLines) ? local : remoteLines));
    });
  }, [user]);

  /**
   * Local -> cloud, on every basket change.
   *
   * `sameLines` in the listener above is what stops this becoming a loop: a
   * write echoes back as a snapshot, the snapshot matches what we hold, and the
   * update is dropped rather than triggering another write.
   */
  useEffect(() => {
    if (!user || !syncedRef.current) return;
    saveRemoteCart(user.uid, lines).then((ok) => setSyncState(ok ? 'synced' : 'error'));
  }, [lines, user]);

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

    // Full bill, matching getGrandTotal() in the app's checkout_screen.dart:
    //
    //   (subtotal − discount) + delivery + rain + platform + tax
    //
    // The website used to charge a single flat fee and write it into the
    // order's `deliveryCharge` field while recording platformFee and taxAmount
    // as 0. So a website order showed no GST at all, and a "delivery charge"
    // that was really the platform fee — the totals looked plausible on the
    // page and were wrong in every report that read them.
    //
    // Zero when the cart is empty: charging a platform fee on nothing would
    // show a non-zero total on an empty basket.
    const charged = count > 0;
    const taxable = Math.max(0, subtotal - discount);

    const deliveryCharge = charged ? appSettings.deliveryCharge : 0;
    const rainCharge = charged ? appSettings.rainCharge : 0;
    const platform = charged ? platformFee : 0;
    const tax = charged ? (taxable * appSettings.taxRate) / 100 : 0;

    const grand = taxable + deliveryCharge + rainCharge + platform + tax;

    return {
      count,
      subtotal: +subtotal.toFixed(2),
      discount: +discount.toFixed(2),
      deliveryCharge: +deliveryCharge.toFixed(2),
      rainCharge: +rainCharge.toFixed(2),
      platformFee: +platform.toFixed(2),
      tax: +tax.toFixed(2),
      taxRate: appSettings.taxRate,
      grand: +grand.toFixed(2),
    };
  }, [lines, coupon, platformFee, appSettings.deliveryCharge,
      appSettings.rainCharge, appSettings.taxRate]);

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
    lines, items: Object.values(lines), totals, deliveryFee: platformFee,
    syncState,
    minimumOrderValue: appSettings.minimumOrderValue,
    add, remove, clear, qtyOf,
    coupon, couponError, couponBusy, applyCoupon, removeCoupon,
  }), [lines, totals, platformFee, syncState, appSettings.minimumOrderValue, add, remove, clear, qtyOf, coupon, couponError, couponBusy, applyCoupon, removeCoupon]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
