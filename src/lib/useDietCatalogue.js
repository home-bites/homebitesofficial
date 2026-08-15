import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Diet meals and subscription plans.
 *
 * `dietFoods`, `mealPlans` and `dietCategories` are all `allow read: if true`
 * in firestore.rules, so no auth-shaped query is needed — but the listeners are
 * still independent, so a failure loading plans does not blank the meals.
 *
 * Field names are read defensively. These collections are edited from the
 * dashboard and have accumulated more than one spelling for the same idea
 * (price/amount, durationDays/days), so each is tried in turn rather than
 * assuming the newest one and silently rendering blanks for older documents.
 */

const alive = (d) => d.isDeleted !== true;
const num = (...vals) => {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
};

export function useDietCatalogue() {
  const [meals, setMeals] = useState([]);
  const [plans, setPlans] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db) {
      setError('Diet plans are unavailable right now.');
      setLoading(false);
      return undefined;
    }

    const unsubMeals = onSnapshot(
      collection(db, 'dietFoods'),
      (snap) => {
        const next = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          if (!alive(d)) return;
          next.push({
            id: doc.id,
            name: String(d.name || ''),
            description: String(d.description || ''),
            imageUrl: String(d.imageUrl || d.image || ''),
            price: num(d.price, d.amount),
            categoryId: String(d.categoryId || ''),
            foodType: String(d.foodType || ''),
            isAvailable: d.isAvailable !== false,
            // Nutrition is optional — shown only when the admin filled it in,
            // rather than rendering "0 kcal" for every meal that has none.
            calories: num(d.calories, d.kcal),
            protein: num(d.protein, d.proteinGrams),
            carbs: num(d.carbs, d.carbohydrates),
            fat: num(d.fat, d.fats),
          });
        });
        setMeals(next);
        setLoading(false);
      },
      (e) => {
        console.error('[diet] meals listener failed', e);
        setError('Could not load diet meals.');
        setLoading(false);
      },
    );

    const unsubPlans = onSnapshot(
      collection(db, 'mealPlans'),
      (snap) => {
        const next = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          if (!alive(d)) return;
          if (d.isActive === false) return;
          next.push({
            id: doc.id,
            name: String(d.name || d.title || 'Plan'),
            description: String(d.description || ''),
            imageUrl: String(d.imageUrl || d.image || ''),
            price: num(d.price, d.amount, d.totalPrice),
            planType: String(d.planType || d.type || ''),
            durationDays: num(d.durationDays, d.days, d.duration),
            mealsPerDay: num(d.mealsPerDay, d.meals),
            displayOrder: Number(d.displayOrder) || 0,
          });
        });
        next.sort((a, b) => a.displayOrder - b.displayOrder);
        setPlans(next);
      },
      (e) => console.error('[diet] plans listener failed', e),
    );

    const unsubCats = onSnapshot(
      collection(db, 'dietCategories'),
      (snap) => {
        const next = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          if (!alive(d)) return;
          next.push({
            id: doc.id,
            name: String(d.name || ''),
            displayOrder: Number(d.displayOrder) || 0,
          });
        });
        next.sort((a, b) => a.displayOrder - b.displayOrder);
        setCategories(next);
      },
      () => {},
    );

    return () => { unsubMeals(); unsubPlans(); unsubCats(); };
  }, []);

  return { meals, plans, categories, loading, error };
}
