import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

/**
 * The rider's public-facing details for an in-progress delivery.
 *
 * Only name, phone and vehicle are surfaced. The partner document also holds
 * identity documents, earnings, bank details, approval history and a rating —
 * none of which a customer has any business seeing, so nothing else is copied
 * out of the snapshot. Narrowing here rather than in the component means a
 * future card cannot accidentally render a field it was never meant to.
 *
 * Firestore rules currently allow any signed-in user without a partner
 * document of their own to read `deliveryPartners`, which is broader than it
 * should be — the whole document is readable, this hook simply declines to use
 * it. Tightening that rule to expose only the delivery-relevant fields is a
 * worthwhile follow-up.
 *
 * Only called while an order is out for delivery, so a customer is not
 * subscribed to a rider's document outside the window where they are
 * genuinely involved.
 */
export function useRider(partnerId, enabled = true) {
  const [rider, setRider] = useState(null);

  useEffect(() => {
    if (!db || !partnerId || !enabled) {
      setRider(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'deliveryPartners', partnerId),
      (snap) => {
        if (!snap.exists()) { setRider(null); return; }
        const d = snap.data() || {};
        setRider({
          name: String(d.name || d.fullName || 'Your rider'),
          phone: String(d.phone || d.mobile || d.phoneNumber || ''),
          vehicleNumber: String(d.vehicleNumber || d.vehicleNo || ''),
        });
      },
      (e) => {
        // A failed read must not break tracking — the map and ETA are the
        // parts that matter, the rider card is a courtesy.
        console.error('[rider] lookup failed', e);
        setRider(null);
      },
    );
  }, [partnerId, enabled]);

  return rider;
}
