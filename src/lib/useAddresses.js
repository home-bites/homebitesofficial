import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, deleteField, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../context/AuthContext';

/**
 * The customer's saved addresses, from the `addresses` collection the mobile
 * app already uses.
 *
 * ## The schema is the app's, not this file's
 *
 * The document has exactly these keys, and no others:
 *
 *   userId  label  addressLine  latitude  longitude  createdAt
 *   accuracyM?  source?  capturedAt?  houseNumber?  landmark?
 *
 * There is **no** `city`, `state`, `pincode`, `type`, `doorInfo`, `isDefault`
 * or `isDeleted`. This hook used to read all of them. Every one was a dead
 * read returning `''` or `false`, and one of them was actively harmful:
 * `isDefault` drove both the sort and the `defaultAddress` choice, so
 * "the customer's default address" was in practice whichever document
 * Firestore happened to return first. There is no default-address concept in
 * this product; the most recently added address is a defensible stand-in and
 * is what this now returns.
 *
 * State, city and pincode live inside `addressLine` as free text, composed by
 * the app's reverse geocoder. Adding real columns for them here would create a
 * second address schema that the Flutter app cannot read.
 *
 * ## `0, 0` is not a location
 *
 * The old code read coordinates as `Number(x.latitude ?? x.lat) || 0`. A
 * missing or malformed coordinate therefore became `0, 0` — which is a real
 * point in the Atlantic, is the exact sentinel `firestore.rules` rejects on
 * write (`addressHasCoordinates()`), and which the Flutter app treats as "no
 * address at all". The website was manufacturing the one value every other
 * layer was built to refuse, and then offering it to checkout as deliverable.
 * Coordinates are now `null` unless they are finite and non-zero, and an
 * address without them is marked `usable: false`.
 *
 * ## Ownership
 *
 * Every read is filtered on `userId == auth.uid` because the rule requires it,
 * and every write stamps `userId` from `user.uid` — never from an argument.
 * A caller cannot pass an owner in.
 */

/** Finite, non-zero coordinates, or null. */
function coordsOf(x) {
  const lat = Number(x.latitude);
  const lng = Number(x.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

export function useAddresses() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db || !user) {
      setAddresses([]);
      setLoading(false);
      return undefined;
    }
    // Single-field equality needs no composite index, so this works without an
    // index deploy. Sorting happens in JS for the same reason — adding an
    // orderBy would demand one.
    const q = query(collection(db, 'addresses'), where('userId', '==', user.uid));
    return onSnapshot(
      q,
      (snap) => {
        const next = [];
        snap.forEach((d) => {
          const x = d.data() || {};
          const coords = coordsOf(x);
          next.push({
            id: d.id,
            label: String(x.label || 'Address'),
            addressLine: String(x.addressLine || ''),
            houseNumber: String(x.houseNumber || ''),
            landmark: String(x.landmark || ''),
            latitude: coords?.latitude ?? null,
            longitude: coords?.longitude ?? null,
            // An address the rider cannot be sent to. Rendered as such rather
            // than hidden: the customer needs to be able to find it and fix it.
            usable: coords !== null,
            // Provenance, as the app records it. Kept so the website can tell
            // a 9 m GPS fix from a hand-dropped pin instead of treating every
            // saved address as equally trustworthy.
            accuracyM: Number.isFinite(Number(x.accuracyM)) ? Number(x.accuracyM) : null,
            source: String(x.source || ''),
            createdAtMs: x.createdAt?.toMillis?.() ?? 0,
          });
        });
        // Newest first. There is no `isDefault` in this schema to sort on.
        next.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setAddresses(next);
        setError('');
        setLoading(false);
      },
      (e) => {
        console.error('[addresses] listener failed', e);
        setError('Could not load your saved addresses.');
        setLoading(false);
      },
    );
  }, [user]);

  /**
   * Only the fields the app's schema defines, and only when they hold
   * something. Blank optional fields are removed rather than written as `''`,
   * matching `AddressProvider.updateAddress`, which uses `FieldValue.delete()`
   * for exactly this. A cleared landmark should not leave an empty string
   * behind for the app to render as a blank line.
   */
  function writablePayload(input, { forUpdate }) {
    const out = {
      label: String(input.label || '').trim(),
      addressLine: String(input.addressLine || '').trim(),
      latitude: Number(input.latitude),
      longitude: Number(input.longitude),
    };
    for (const key of ['houseNumber', 'landmark']) {
      const v = String(input[key] || '').trim();
      if (v) out[key] = v;
      else if (forUpdate) out[key] = deleteField();
    }
    if (Number.isFinite(Number(input.accuracyM))) out.accuracyM = Number(input.accuracyM);
    else if (forUpdate) out.accuracyM = deleteField();
    if (input.source) out.source = String(input.source);
    else if (forUpdate) out.source = deleteField();
    return out;
  }

  /** Refuses rather than writing a document the rules would reject anyway. */
  function assertSavable(input) {
    if (!db) throw new Error('Not connected.');
    if (!user) throw new Error('Please sign in to save an address.');
    const lat = Number(input.latitude);
    const lng = Number(input.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      throw new Error('Pick the delivery location on the map first.');
    }
    if (!String(input.label || '').trim()) throw new Error('Give this address a label.');
    if (!String(input.addressLine || '').trim()) throw new Error('Enter the full address.');
  }

  const createAddress = useCallback(async (input) => {
    assertSavable(input);
    const ref = await addDoc(collection(db, 'addresses'), {
      ...writablePayload(input, { forUpdate: false }),
      // Stamped from the session, never from the caller. A client-supplied
      // owner is exactly what the rule exists to refuse.
      userId: user.uid,
      createdAt: serverTimestamp(),
    });
    return ref.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const updateAddress = useCallback(async (id, input) => {
    assertSavable(input);
    // `userId` is re-sent because the update rule requires the merged document
    // to still be owned by the caller. It is re-sent as `user.uid`, so an
    // attempt to hand ownership to somebody else cannot pass through here.
    await updateDoc(doc(db, 'addresses', id), {
      ...writablePayload(input, { forUpdate: true }),
      userId: user.uid,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /**
   * Hard delete, matching `AddressProvider.deleteAddress` — there is no
   * `isDeleted` flag in this schema and inventing one here would leave the app
   * still showing the address.
   *
   * Orders are unaffected. Every order carries its own `deliveryAddress`
   * snapshot written at checkout, so deleting a saved address never changes
   * where a past order was sent.
   */
  const removeAddress = useCallback(async (id) => {
    if (!db || !user) throw new Error('Please sign in.');
    await deleteDoc(doc(db, 'addresses', id));
  }, [user]);

  const deliverable = useMemo(() => addresses.filter((a) => a.usable), [addresses]);

  return {
    addresses,
    deliverable,
    // The newest usable address. Not a "default" — this product has no such
    // concept — but a sane pre-selection that is at least deliverable.
    defaultAddress: deliverable[0] || null,
    loading,
    error,
    createAddress,
    updateAddress,
    removeAddress,
  };
}
