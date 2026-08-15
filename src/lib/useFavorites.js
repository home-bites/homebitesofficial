import { useCallback, useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../context/AuthContext';

/**
 * Favourites, stored in the same `favorites` collection the mobile app uses.
 *
 * Matches FavoriteProvider in customer_app: one document per (userId,
 * menuItemId) pair, queried by userId. Keeping the shape identical is the
 * whole point — a dish hearted on the website has to appear in the app, and
 * inventing a website-only shape would give the customer two separate lists
 * that both claim to be their favourites.
 *
 * Returns an empty set when signed out rather than falling back to
 * localStorage. A local favourites list that silently fails to follow the
 * customer to their phone is worse than none.
 */
export function useFavorites() {
  const { user } = useAuth();
  const [ids, setIds] = useState(() => new Set());
  const [docIds, setDocIds] = useState(() => new Map()); // menuItemId -> docId
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!db || !user) {
      setIds(new Set());
      setDocIds(new Map());
      return undefined;
    }
    const q = query(collection(db, 'favorites'), where('userId', '==', user.uid));
    return onSnapshot(
      q,
      (snap) => {
        const nextIds = new Set();
        const nextDocs = new Map();
        snap.forEach((d) => {
          const menuItemId = String(d.data()?.menuItemId || '');
          if (!menuItemId) return;
          nextIds.add(menuItemId);
          nextDocs.set(menuItemId, d.id);
        });
        setIds(nextIds);
        setDocIds(nextDocs);
      },
      (e) => console.error('[favorites] listener failed', e),
    );
  }, [user]);

  const isFavorite = useCallback((menuItemId) => ids.has(menuItemId), [ids]);

  const toggleFavorite = useCallback(async (menuItemId) => {
    if (!user || !db || !menuItemId || busy) return;
    setBusy(true);
    try {
      const existingDocId = docIds.get(menuItemId);
      if (existingDocId) {
        await deleteDoc(doc(db, 'favorites', existingDocId));
      } else {
        await addDoc(collection(db, 'favorites'), {
          userId: user.uid,
          menuItemId,
          createdAt: serverTimestamp(),
        });
      }
      // No local state update: the snapshot listener above is the single
      // source of truth. Writing both would let the two disagree whenever a
      // write fails.
    } catch (e) {
      console.error('[favorites] toggle failed', e);
    } finally {
      setBusy(false);
    }
  }, [user, docIds, busy]);

  return { favoriteIds: ids, isFavorite, toggleFavorite, canFavorite: Boolean(user) };
}
