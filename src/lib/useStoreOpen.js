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
