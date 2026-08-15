import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Live menu, categories and banners straight from Firestore.
 *
 * Extracted so the customer Home page and the public SignatureDishes section
 * read the same collections through the same normalisation. SignatureDishes
 * keeps its own copy for now — it works, and rewriting a working module to
 * share a hook is the kind of change that breaks a live storefront for no
 * visible gain. This one is for the new pages.
 *
 * Prices mirror MenuItemModel in the app, tier for tier: offerPrice, then
 * discountAmount, then discountPercentage. A website that prices a discounted
 * dish differently from the app is a support call, not a rounding difference.
 */

function effectivePrice(d) {
  const base = Number(d.price) || 0;
  const offer = Number(d.offerPrice) || 0;
  const dAmt = Number(d.discountAmount) || 0;
  const dPct = Number(d.discountPercentage) || 0;
  if (offer > 0 && offer < base) return offer;
  if (dAmt > 0 && dAmt < base) return base - dAmt;
  if (dPct > 0 && dPct < 100) return base - (base * (dPct / 100));
  return base;
}

const alive = (d) => d.isDeleted !== true;

export function useMenu() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db) {
      setError('Menu is unavailable right now.');
      setLoading(false);
      return undefined;
    }

    // Three independent listeners rather than one gate: a banner collection
    // that fails to load should not hide the menu.
    const unsubItems = onSnapshot(
      collection(db, 'menuItems'),
      (snap) => {
        const next = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          if (!alive(d)) return;
          const base = Number(d.price) || 0;
          const price = effectivePrice(d);
          next.push({
            id: doc.id,
            name: String(d.name || ''),
            description: String(d.description || ''),
            imageUrl: String(d.imageUrl || d.image || ''),
            price,
            originalPrice: base,
            hasDiscount: price < base,
            // categoryId holds the category *name* on some documents rather
            // than the doc id — a mismatch that has bitten this project before.
            // Both are kept so the filter can match on either.
            categoryId: String(d.categoryId || ''),
            foodType: String(d.foodType || ''),
            isAvailable: d.isAvailable !== false,
            rating: Number(d.rating) || 0,
          });
        });
        setItems(next);
        setLoading(false);
      },
      (e) => {
        console.error('[menu] items listener failed', e);
        setError('Could not load the menu.');
        setLoading(false);
      },
    );

    const unsubCats = onSnapshot(
      collection(db, 'categories'),
      (snap) => {
        const next = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          if (!alive(d)) return;
          next.push({
            id: doc.id,
            name: String(d.name || ''),
            imageUrl: String(d.imageUrl || ''),
            displayOrder: Number(d.displayOrder) || 0,
          });
        });
        next.sort((a, b) => a.displayOrder - b.displayOrder);
        setCategories(next);
      },
      () => {},
    );

    const unsubBanners = onSnapshot(
      collection(db, 'banners'),
      (snap) => {
        const next = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          if (!alive(d)) return;
          if (!d.imageUrl) return;
          next.push({
            id: doc.id,
            imageUrl: String(d.imageUrl),
            title: String(d.title || ''),
            displayOrder: Number(d.displayOrder) || 0,
          });
        });
        next.sort((a, b) => a.displayOrder - b.displayOrder);
        setBanners(next);
      },
      () => {},
    );

    return () => { unsubItems(); unsubCats(); unsubBanners(); };
  }, []);

  return { items, categories, banners, loading, error };
}

/** Case-insensitive match on id or name, covering both shapes of categoryId. */
export function filterByCategory(items, categories, activeCatId) {
  if (!activeCatId || activeCatId === 'all') return items;
  const cat = categories.find((c) => c.id === activeCatId);
  const name = String(cat?.name || '').trim().toLowerCase();
  return items.filter((i) => {
    const raw = String(i.categoryId || '').trim().toLowerCase();
    return i.categoryId === activeCatId || (name && raw === name);
  });
}

/** Substring search over name, description and category name. */
export function searchItems(items, categories, term) {
  const q = String(term || '').trim().toLowerCase();
  if (!q) return items;
  const catNameById = new Map(categories.map((c) => [c.id, String(c.name || '').toLowerCase()]));
  return items.filter((i) =>
    i.name.toLowerCase().includes(q) ||
    i.description.toLowerCase().includes(q) ||
    String(catNameById.get(i.categoryId) || i.categoryId).toLowerCase().includes(q));
}

/** Stable veg/non-veg classification used by the indicator dot. */
export function isVeg(item) {
  return String(item.foodType || '').toLowerCase() === 'veg';
}

export function useCategoryCounts(items, categories) {
  return useMemo(() => {
    const counts = new Map();
    categories.forEach((c) => {
      counts.set(c.id, filterByCategory(items, categories, c.id).length);
    });
    return counts;
  }, [items, categories]);
}
