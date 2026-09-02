import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Live pricing settings from `appSettings/general` — the same document the
 * mobile app and the admin dashboard already use.
 *
 * The website previously took its fee from `VITE_DELIVERY_FEE`, a Vite env var
 * baked in at build time. That meant an admin changing the platform fee in
 * Settings updated the app immediately and the website not at all, until
 * somebody happened to redeploy. The two clients would quietly quote different
 * totals for the same basket, and the website's would be whatever was true on
 * the day it was last built.
 *
 * Defaults match the app's AppSettings model so a missing document behaves the
 * same everywhere rather than zeroing the fees.
 */
export function useAppSettings() {
  const [settings, setSettings] = useState({
    platformFee: null,      // null = not loaded yet, distinct from a real 0
    minimumOrderValue: 0,
    taxRate: 0,
    deliveryCharge: 0,
    rainCharge: 0,
    // Contact details, so the support number shown to customers is the one the
    // admin set rather than a constant that goes stale the day it changes.
    supportPhone: '',
    storeAddress: '',
    // Service centre, for the distance the delivery charge is priced on.
    // NaN rather than 0 when unset: 0,0 is a real coordinate in the Atlantic,
    // and treating "not configured" as a location would price every delivery
    // as if the kitchen were there.
    centerLatitude: NaN,
    centerLongitude: NaN,
    // The untouched document, so the delivery-fee module can read its own
    // fields without this hook having to mirror every one of them. Adding a
    // field to the fee rule must not require editing this file too.
    raw: {},
    loaded: false,
  });

  useEffect(() => {
    if (!db) return undefined;
    return onSnapshot(
      doc(db, 'appSettings', 'general'),
      (snap) => {
        const d = snap.data() || {};
        setSettings({
          platformFee: Number(d.platformFee) || 0,
          minimumOrderValue: Number(d.minimumOrderValue) || 0,
          taxRate: Number(d.taxRate) || 0,
          deliveryCharge: Number(d.deliveryCharge) || 0,
          rainCharge: Number(d.rainCharge) || 0,
          supportPhone: String(d.supportPhone || ''),
          storeAddress: String(d.storeAddress || ''),
          centerLatitude: Number(d.centerLatitude),
          centerLongitude: Number(d.centerLongitude),
          raw: d,
          loaded: true,
        });
      },
      (e) => {
        // Leaves platformFee null so the caller keeps its build-time fallback
        // rather than charging zero on a dropped connection.
        console.error('[settings] pricing listener failed', e);
      },
    );
  }, []);

  return settings;
}
