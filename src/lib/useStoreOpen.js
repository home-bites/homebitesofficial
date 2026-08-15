import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Whether the kitchen is currently accepting orders.
 *
 * Reads the same `appSettings/general.storeOpen` flag the mobile app obeys and
 * the admin dashboard already toggles — from the Dashboard's kitchen switch or
 * Settings → Accepting orders. The website was the only client ignoring it, so
 * closing the kitchen stopped app orders while the site kept taking them, and
 * whoever was on shift found out when the tickets arrived.
 *
 * Defaults to open. If Firestore is unreachable the right failure is a site
 * that still sells and a human who sorts it out, not a shut shop caused by a
 * dropped connection.
 */
export function useStoreOpen() {
  const [open, setOpen] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!db) return undefined;
    return onSnapshot(
      doc(db, 'appSettings', 'general'),
      (snap) => {
        const d = snap.data() || {};
        setOpen(d.storeOpen !== false);
        setMessage(String(d.storeClosedMessage || ''));
      },
      (e) => {
        console.error('[settings] storeOpen listener failed', e);
        setOpen(true);   // fail open, deliberately
      },
    );
  }, []);

  return { storeOpen: open, closedMessage: message };
}

/**
 * Feature switches from the dashboard's Settings → System tab.
 *
 * Same document as useStoreOpen, deliberately — the Firestore SDK shares one
 * underlying watch per document, so a second hook here costs no extra listener
 * and keeps each hook returning only what its callers actually use.
 *
 * Only `couponEnabled` matters on the website today: the site has no wallet
 * and no loyalty programme, so gating those would be gating nothing. They are
 * returned anyway so a future surface reads the flag instead of inventing a
 * second source of truth.
 *
 * Fails open for the same reason as useStoreOpen — an unreachable settings
 * document should not strip working features off a live storefront.
 */
export function useFeatureFlags() {
  const [flags, setFlags] = useState({
    couponEnabled: true,
    walletEnabled: true,
    loyaltyEnabled: true,
  });

  useEffect(() => {
    if (!db) return undefined;
    return onSnapshot(
      doc(db, 'appSettings', 'general'),
      (snap) => {
        const d = snap.data() || {};
        setFlags({
          couponEnabled: d.couponEnabled !== false,
          walletEnabled: d.walletEnabled !== false,
          loyaltyEnabled: d.loyaltyEnabled !== false,
        });
      },
      (e) => {
        console.error('[settings] feature flag listener failed', e);
      },
    );
  }, []);

  return flags;
}
