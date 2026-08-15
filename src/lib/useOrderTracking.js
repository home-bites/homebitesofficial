import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Live rider position for one order.
 *
 * Reads the `orderTracking` collection — the same one the customer app
 * subscribes to in order_provider.dart, written by the delivery partner app as
 * the rider moves. No new backend, no polling, no second source of truth: when
 * the rider's device reports, both the app and this page receive the same
 * snapshot.
 *
 * Firestore rules allow any signed-in user to read orderTracking, and the
 * query filters on orderId, so this is provably safe under the rule rather
 * than relying on the rule to filter for us.
 */

const EARTH_RADIUS_KM = 6371;

/** Straight-line distance. Roads are longer, which the ETA accounts for. */
export function haversineKm(a, b) {
  if (!a || !b) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Rough arrival estimate.
 *
 * 18 km/h is a deliberately modest city average for a two-wheeler once you
 * include lights and turns, and 1.35 pads the straight-line distance out to
 * something road-like. This is presented to the customer as an estimate and
 * never as a promise — a precise-looking ETA derived from a straight line is
 * worse than an approximate one that admits what it is.
 */
export function etaMinutes(distanceKm) {
  if (distanceKm == null) return null;
  const roadKm = distanceKm * 1.35;
  const minutes = (roadKm / 18) * 60;
  return Math.max(2, Math.round(minutes));
}

export function useOrderTracking(orderId, enabled = true) {
  const [tracking, setTracking] = useState(null);
  const [state, setState] = useState('idle'); // idle | loading | ready | empty | error

  useEffect(() => {
    if (!db || !orderId || !enabled) {
      setTracking(null);
      setState('idle');
      return undefined;
    }
    setState('loading');

    const q = query(collection(db, 'orderTracking'), where('orderId', '==', orderId));
    return onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setTracking(null);
          // Not an error: the rider simply has not started reporting yet.
          setState('empty');
          return;
        }
        const d = snap.docs[0].data() || {};
        const lat = Number(d.currentLatitude);
        const lng = Number(d.currentLongitude);

        // (0, 0) is the Gulf of Guinea, not a position — it is what an
        // uninitialised field looks like, and plotting it would send the
        // customer's map to the middle of the Atlantic.
        const usable =
          Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

        setTracking(usable
          ? {
              lat,
              lng,
              partnerId: String(d.partnerId || ''),
              status: String(d.status || ''),
              updatedAt: d.updatedAt?.toDate?.() ?? null,
            }
          : null);
        setState(usable ? 'ready' : 'empty');
      },
      (e) => {
        console.error('[tracking] listener failed', e);
        setState('error');
      },
    );
  }, [orderId, enabled]);

  return { tracking, state };
}
