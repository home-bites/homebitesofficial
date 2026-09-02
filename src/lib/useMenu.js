import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import {
  normalizeMenuItem, isListable, sortMenuItems, sortByDisplayOrder,
} from './menuItem';

/**
 * Live menu, categories and banners straight from Firestore.
 *
 * Parsing lives in `lib/menuItem.js` and is shared with `SignatureDishes`.
 * This hook used to carry its own copy, which is how the same dish came to be
 * orderable on one page and sold out on another, and why the rich fields an
 * admin enters — ingredients, allergens, add-ons — reached only half the site.
 *
 * Neither listener gates the other: a banner collection that fails to load
 * must not hide the menu.
 */

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
          // Deleted and hidden are both "not on the menu". Hidden used to be
          // ignored here, so a dish an admin had taken down stayed listed and
          // orderable on every page this hook feeds.
          if (!isListable(d)) return;
          next.push(normalizeMenuItem(doc.id, d));
        });
        setItems(sortMenuItems(next));
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
            // null, not 0. A category with no order set must sort after the
            // ones an admin actually placed, not ahead of them.
            displayOrder: Number.isFinite(Number(d.displayOrder)) ? Number(d.displayOrder) : null,
          });
        });
        setCategories(sortByDisplayOrder(next));
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
            displayOrder: Number.isFinite(Number(d.displayOrder)) ? Number(d.displayOrder) : null,
          });
        });
        setBanners(sortByDisplayOrder(next));
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
