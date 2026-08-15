import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../context/AuthContext';

/**
 * The customer's saved addresses, from the `addresses` collection the mobile
 * app already uses.
 *
 * Subscriptions previously carried `deliveryAddress: profile?.defaultAddress
 * || null` — a field the web profile never sets, so in practice every
 * subscription bought on the website was created with **no delivery address at
 * all**. It looked fine on screen and would have been discovered by whoever
 * had to deliver the first meal.
 *
 * Filtered on userId, which the read rule requires. A query without it is
 * rejected outright rather than filtered down.
 *
 * Single-field equality needs no composite index, so this works without an
 * index deploy. Sorting happens in JS for the same reason — adding an
 * orderBy would demand one.
 */
export function useAddresses() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !user) {
      setAddresses([]);
      setLoading(false);
      return undefined;
    }
    const q = query(collection(db, 'addresses'), where('userId', '==', user.uid));
    return onSnapshot(
      q,
      (snap) => {
        const next = [];
        snap.forEach((d) => {
          const x = d.data() || {};
          if (x.isDeleted === true) return;
          next.push({
            id: d.id,
            label: String(x.label || x.type || 'Address'),
            addressLine: String(x.addressLine || x.address || x.doorInfo || ''),
            doorInfo: String(x.doorInfo || ''),
            city: String(x.city || ''),
            latitude: Number(x.latitude ?? x.lat) || 0,
            longitude: Number(x.longitude ?? x.lng) || 0,
            isDefault: x.isDefault === true,
          });
        });
        // Default first, then whatever order they arrived in.
        next.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
        setAddresses(next);
        setLoading(false);
      },
      (e) => {
        console.error('[addresses] listener failed', e);
        setLoading(false);
      },
    );
  }, [user]);

  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0] || null;

  return { addresses, defaultAddress, loading };
}
