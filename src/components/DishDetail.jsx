import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Leaf, Drumstick, Egg, Clock, Flame, Plus, Minus, ImageOff, AlertTriangle,
} from 'lucide-react';
import { useCart } from '../context/CartContext';

/**
 * Everything the kitchen recorded about a dish, and nothing it did not.
 *
 * ## The rule this component exists to enforce
 *
 * A section renders only when its data is actually present. There is no
 * "Ingredients:" heading above an empty list, no "0 calories" standing in for
 * a missing figure, no default spice level, and no stock photograph where a
 * dish has no picture. Every one of those would be the page inventing a claim
 * about food — which is the kind of mistake that matters when somebody is
 * checking for an allergen.
 *
 * `Section` and `Chips` below both return `null` on empty input, so the rule
 * is enforced in one place rather than at twenty call sites.
 *
 * ## Allergens
 *
 * An absent allergen list means *unknown*, not *none*. The section is omitted
 * entirely rather than rendered empty, because an empty "Allergens" heading
 * reads as "no allergens" — a statement this data cannot support.
 */

const FOOD_MARK = {
  'Non-Veg': { ring: 'border-red-600', dot: 'bg-red-600', Icon: Drumstick, label: 'Non-vegetarian' },
  Egg: { ring: 'border-amber-500', dot: 'bg-amber-500', Icon: Egg, label: 'Contains egg' },
  Veg: { ring: 'border-green-700', dot: 'bg-green-700', Icon: Leaf, label: 'Vegetarian' },
};

/** No mark at all for an unclassified dish — see SignatureDishes. */
function FoodMark({ type }) {
  const entry = FOOD_MARK[type];
  if (!entry) return null;
  const { ring, dot, Icon, label } = entry;
  return (
    <span className={`inline-flex h-4 w-4 items-center justify-center rounded-[3px] border-2 ${ring}`} title={label}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <Icon className="sr-only" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Section({ title, children }) {
  if (children === null || children === undefined || children === false) return null;
  return (
    <div className="border-t border-brand-primary/10 pt-3">
      <h3 className="mb-1.5 font-sans text-[11px] font-bold uppercase tracking-wide text-brand-dark/45">
        {title}
      </h3>
      {children}
    </div>
  );
}

/** Renders nothing at all for an empty or all-blank list. */
function Chips({ values, tone = 'neutral' }) {
  const clean = (Array.isArray(values) ? values : [])
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  if (clean.length === 0) return null;
  const style = tone === 'warn'
    ? 'border-amber-300 bg-amber-50 text-amber-900'
    : 'border-brand-primary/20 bg-brand-primary/[0.06] text-brand-dark/75';
  return (
    <div className="flex flex-wrap gap-1.5">
      {clean.map((v) => (
        <span key={v} className={`rounded-full border px-2.5 py-1 font-sans text-[11px] font-semibold ${style}`}>
          {v}
        </span>
      ))}
    </div>
  );
}

function DishImage({ urls, name }) {
  const [idx, setIdx] = useState(0);
  const [broken, setBroken] = useState({});
  const usable = urls.filter((u, i) => u && !broken[i]);

  if (urls.length === 0 || usable.length === 0) {
    // A dish with no usable picture gets the HomeBites empty state, never a
    // photograph of some other restaurant's food.
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 bg-brand-primary/[0.06]">
        <ImageOff className="h-7 w-7 text-brand-primary/35" />
        <span className="font-sans text-[11px] text-brand-dark/40">No photo yet</span>
      </div>
    );
  }

  const current = Math.min(idx, urls.length - 1);
  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-brand-primary/[0.06]">
        <img
          key={current}
          src={urls[current]}
          alt={name}
          loading="lazy"
          onError={() => setBroken((b) => ({ ...b, [current]: true }))}
          className="h-full w-full animate-[fadeIn_.25s_ease] object-cover"
        />
      </div>
      {/* Thumbnail strip only when there is more than one real image. */}
      {urls.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2">
          {urls.map((u, i) => (
            <button
              key={u}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`View image ${i + 1} of ${urls.length}`}
              className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition
                          ${i === current ? 'border-brand-primary' : 'border-transparent opacity-60'}`}
            >
              <img src={u} alt="" className="h-full w-full object-cover"
                   onError={() => setBroken((b) => ({ ...b, [i]: true }))} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DishDetail({ dish, onClose }) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [picked, setPicked] = useState({});   // addon index -> true

  // Escape closes, and the page behind must not scroll while this is open.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const addons = useMemo(
    () => (Array.isArray(dish.addons) ? dish.addons : [])
      .filter((a) => a && String(a.name || '').trim() && a.isAvailable !== false),
    [dish.addons],
  );

  const chosen = useMemo(
    () => addons.filter((_, i) => picked[i]),
    [addons, picked],
  );

  const addonTotal = chosen.reduce((t, a) => t + (Number(a.price) || 0), 0);
  const lineTotal = ((Number(dish.price) || 0) + addonTotal) * qty;

  // Distinct images, in the order the schema prefers, with blanks removed.
  const images = useMemo(() => {
    const list = [dish.imageUrl, dish.thumbnail, ...(Array.isArray(dish.gallery) ? dish.gallery : [])];
    return [...new Set(list.map((u) => String(u || '').trim()).filter(Boolean))];
  }, [dish.imageUrl, dish.thumbnail, dish.gallery]);

  const calories = typeof dish.calories === 'number' && Number.isFinite(dish.calories)
    ? dish.calories : null;
  const discountPct = dish.originalPrice > dish.price
    ? Math.round(((dish.originalPrice - dish.price) / dish.originalPrice) * 100)
    : 0;

  function addToCart() {
    add(dish, { addons: chosen.map((a) => ({ name: a.name, price: Number(a.price) || 0, isVeg: a.isVeg })), qty });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={dish.name}
    >
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white
                      sm:max-h-[88vh] sm:max-w-3xl sm:rounded-2xl">
        <div className="flex-1 overflow-y-auto sm:grid sm:grid-cols-2 sm:gap-0">
          {/* Image column. On desktop it holds its own side; on mobile it is
              the full-width lead. */}
          <div className="relative sm:sticky sm:top-0">
            <DishImage urls={images} name={dish.name} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full
                         bg-white/90 shadow-md transition hover:bg-white"
            >
              <X className="h-4 w-4 text-brand-dark" />
            </button>
          </div>

          <div className="space-y-3 p-4 sm:p-5">
            <div>
              <div className="flex items-start gap-2">
                <FoodMark type={dish.foodType} />
                <h2 className="font-serif text-xl leading-tight text-brand-dark">{dish.name}</h2>
              </div>
              {dish.categoryName && (
                <p className="mt-0.5 font-sans text-[11px] uppercase tracking-wide text-brand-dark/40">
                  {dish.categoryName}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-sans text-lg font-bold text-brand-dark">₹{dish.price}</span>
              {discountPct > 0 && (
                <>
                  <span className="font-sans text-sm text-brand-dark/40 line-through">
                    ₹{dish.originalPrice}
                  </span>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 font-sans text-[11px] font-bold text-green-800">
                    {discountPct}% off
                  </span>
                </>
              )}
            </div>

            {(dish.badges?.length > 0 || dish.tags?.length > 0) && (
              // Badges and tags share one row: they are both short metadata,
              // and two separate labelled sections for a handful of words each
              // is more chrome than content.
              <Chips values={[...(dish.badges || []), ...(dish.tags || [])]} />
            )}

            {/* Timings and spice, only the ones actually recorded. */}
            {(dish.prepTime || dish.cookingTime || dish.spiceLevel) && (
              <div className="flex flex-wrap gap-3 font-sans text-[12px] text-brand-dark/60">
                {dish.prepTime > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Ready in {dish.prepTime} min
                  </span>
                )}
                {dish.cookingTime && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Cooks in {dish.cookingTime}
                  </span>
                )}
                {dish.spiceLevel && (
                  <span className="inline-flex items-center gap-1">
                    <Flame className="h-3.5 w-3.5" /> {dish.spiceLevel}
                  </span>
                )}
              </div>
            )}

            {dish.description && (
              <p className="font-sans text-[13px] leading-relaxed text-brand-dark/70">
                {dish.description}
              </p>
            )}

            <Section title="Ingredients">
              <Chips values={dish.ingredients} />
            </Section>

            {/* Allergens are never implied. No list means unknown, and the
                section simply does not appear. */}
            <Section title="Contains">
              {dish.allergens?.length > 0
                ? (
                  <div>
                    <Chips values={dish.allergens} tone="warn" />
                    <p className="mt-1.5 flex items-start gap-1 font-sans text-[10px] leading-relaxed text-brand-dark/45">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                      Prepared in a kitchen that handles other ingredients.
                    </p>
                  </div>
                )
                : null}
            </Section>

            <Section title="Nutrition">
              {calories !== null
                ? (
                  <p className="font-sans text-[13px] text-brand-dark/70">
                    {calories} kcal
                  </p>
                )
                : null}
            </Section>

            {addons.length > 0 && (
              <Section title="Add to this">
                <div className="space-y-1.5">
                  {addons.map((a, i) => (
                    <label
                      key={`${a.name}-${i}`}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition
                                  ${picked[i]
                                    ? 'border-brand-primary bg-brand-primary/[0.06]'
                                    : 'border-brand-primary/15 hover:border-brand-primary/35'}`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(picked[i])}
                        onChange={() => setPicked((p) => ({ ...p, [i]: !p[i] }))}
                        className="h-4 w-4 accent-[color:var(--brand-primary,#0B4D3B)]"
                      />
                      {a.isVeg !== undefined && <FoodMark type={a.isVeg === false ? 'Non-Veg' : 'Veg'} />}
                      <span className="min-w-0 flex-1 font-sans text-[13px] text-brand-dark">
                        {a.name}
                      </span>
                      <span className="font-sans text-[13px] font-semibold text-brand-dark/70">
                        +₹{Number(a.price) || 0}
                      </span>
                    </label>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </div>

        {/* Sticky action bar. Quantity and the running line total sit together
            so the number on the button is always the number being added. */}
        <div className="flex items-center gap-3 border-t border-brand-primary/10 bg-white p-3
                        pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {dish.available === false ? (
            <p className="flex-1 text-center font-sans text-[13px] font-semibold text-brand-dark/45">
              Currently unavailable
            </p>
          ) : (
            <>
              <div className="flex items-center gap-1 rounded-xl border border-brand-primary/20 px-1">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  aria-label="Reduce quantity"
                  className="flex h-9 w-9 items-center justify-center text-brand-primary disabled:opacity-30"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[1.5rem] text-center font-sans text-sm font-bold text-brand-dark">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(20, q + 1))}
                  aria-label="Increase quantity"
                  className="flex h-9 w-9 items-center justify-center text-brand-primary"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={addToCart}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary
                           px-4 py-3 font-sans text-sm font-bold text-white transition
                           hover:bg-brand-primary/90"
              >
                Add · ₹{Number(lineTotal.toFixed(2))}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
