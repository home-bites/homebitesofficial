import React, { useMemo, useState } from 'react';
import { Search, Heart, MapPin, Plus, Minus, AlertCircle, X, Flame } from 'lucide-react';
import { useMenu, filterByCategory, searchItems, isVeg } from '../lib/useMenu';
import { useFavorites } from '../lib/useFavorites';
import { useCart } from '../context/CartContext';
import { useStoreOpen } from '../lib/useStoreOpen';
import { useAuth } from '../context/AuthContext';
import { inr } from '../lib/format';

/**
 * Customer home.
 *
 * The previous version was a correct page that looked like a form: every
 * element the same weight, the same 12px type, arranged in a flat column. Food
 * does not sell that way — people choose with their eyes, and a menu where the
 * photograph is the smallest thing on the card is working against itself.
 *
 * What changed, and why each one matters more than the shadows:
 *
 *   - **Typographic range.** Headings now run 28-32px against 11px labels. The
 *     old page spanned 12px to 19px, which reads as uniform and therefore as
 *     unconsidered. Range is what makes a layout feel deliberate.
 *   - **The photograph leads.** Cards are taller with a 4:5 image, and the
 *     name sits over a gradient rather than beneath the picture in its own
 *     box. Fewer boxes, more food.
 *   - **Vertical rhythm.** Sections are separated by 40px rather than 20, so
 *     the eye gets somewhere to rest. Cramped spacing is the single most
 *     reliable way to make a page feel cheap.
 *   - **A greeting.** The page opens by addressing the customer by name. It
 *     costs one line and turns a catalogue into somebody's account.
 *
 * Every list is still live Firestore data — no placeholder dishes anywhere in
 * this file, and an empty menu renders an empty state rather than invented
 * food that looks real until someone tries to order it.
 */

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

function VegDot({ item, className = '' }) {
  const type = String(item.foodType || '').trim();
  if (!type) return null;
  const veg = isVeg(item);
  return (
    <span
      title={type}
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border-[1.5px] bg-white/95 ${
        veg ? 'border-green-600' : 'border-red-600'
      } ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${veg ? 'bg-green-600' : 'bg-red-600'}`} />
    </span>
  );
}

/**
 * A dish.
 *
 * Image-led and taller than it is wide. The name and price sit *on* the
 * photograph over a dark gradient — one surface instead of a picture stacked
 * on a text panel, which is what made the old grid read as a spreadsheet.
 */
function DishCard({ item, onOpen }) {
  const { add, remove, qtyOf } = useCart();
  const { isFavorite, toggleFavorite, canFavorite } = useFavorites();
  const qty = qtyOf(item.id);
  const fav = isFavorite(item.id);
  const off = item.hasDiscount
    ? Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100)
    : 0;

  return (
    <article className="group relative overflow-hidden rounded-3xl bg-brand-dark shadow-[0_2px_20px_-8px_rgba(28,28,28,0.25)] transition-all duration-300 hover:shadow-[0_12px_36px_-12px_rgba(28,28,28,0.4)]">
      <button
        onClick={() => onOpen(item)}
        className="relative block aspect-[4/5] w-full overflow-hidden text-left"
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <span className="grid h-full w-full place-items-center bg-brand-primary/10 font-sans text-xs text-white/40">
            No photo
          </span>
        )}

        {/* Two stops rather than a flat overlay: the name stays legible over a
            bright plate without dimming the whole photograph. */}
        <span className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-brand-dark via-brand-dark/70 to-transparent" />

        {off > 0 && (
          <span className="absolute left-3 top-3 rounded-full bg-brand-accent px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-wider text-white shadow-lg">
            {off}% off
          </span>
        )}

        {!item.isAvailable && (
          <span className="absolute inset-0 grid place-items-center bg-brand-dark/65 font-display text-sm font-bold uppercase tracking-widest text-white/90">
            Sold out
          </span>
        )}

        <VegDot item={item} className="absolute right-3 top-3" />

        <div className="absolute inset-x-0 bottom-0 p-3.5">
          <h3 className="font-display text-[15px] font-bold leading-tight text-white drop-shadow-sm">
            {item.name}
          </h3>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-display text-base font-bold text-brand-secondary">
              {inr(item.price)}
            </span>
            {item.hasDiscount && (
              <span className="font-sans text-[11px] text-white/45 line-through">
                {inr(item.originalPrice)}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Actions float over the image so the card stays one surface. */}
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
        {canFavorite && (
          <button
            onClick={() => toggleFavorite(item.id)}
            aria-label={fav ? 'Remove from favourites' : 'Save to favourites'}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-md backdrop-blur transition-transform active:scale-90"
          >
            <Heart className={`h-4 w-4 transition-colors ${
              fav ? 'fill-brand-accent text-brand-accent' : 'text-brand-dark/40'}`} />
          </button>
        )}
      </div>

      {item.isAvailable && (
        <div className="absolute bottom-3.5 right-3.5">
          {qty === 0 ? (
            <button
              onClick={() => add(item)}
              className="grid h-9 w-9 place-items-center rounded-full bg-brand-secondary text-brand-primary shadow-lg transition-transform hover:scale-105 active:scale-90"
              aria-label={`Add ${item.name}`}
            >
              <Plus className="h-4 w-4" strokeWidth={3} />
            </button>
          ) : (
            <div className="flex items-center gap-0.5 rounded-full bg-brand-secondary px-1 py-1 shadow-lg">
              <button onClick={() => remove(item.id)} aria-label="One less"
                      className="grid h-7 w-7 place-items-center rounded-full text-brand-primary">
                <Minus className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
              <span className="min-w-[1.1rem] text-center font-display text-sm font-bold text-brand-primary">
                {qty}
              </span>
              <button onClick={() => add(item)} aria-label="One more"
                      className="grid h-7 w-7 place-items-center rounded-full text-brand-primary">
                <Plus className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function DishDetail({ item, onClose }) {
  const { add, remove, qtyOf } = useCart();
  if (!item) return null;
  const qty = qtyOf(item.id);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-brand-dark/70 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {item.imageUrl && (
            <img src={item.imageUrl} alt={item.name}
                 className="aspect-[5/4] w-full object-cover sm:rounded-t-[28px]" />
          )}
          <button onClick={onClose} aria-label="Close"
                  className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-md backdrop-blur">
            <X className="h-4 w-4 text-brand-dark/60" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-3 flex items-start gap-2.5">
            <VegDot item={item} className="mt-1.5" />
            <h2 className="font-display text-2xl font-bold leading-tight text-brand-dark">
              {item.name}
            </h2>
          </div>

          {item.description && (
            <p className="mb-5 font-sans text-sm leading-relaxed text-brand-dark/55">
              {item.description}
            </p>
          )}

          <div className="mb-6 flex items-baseline gap-2.5">
            <span className="font-display text-3xl font-bold text-brand-primary">
              {inr(item.price)}
            </span>
            {item.hasDiscount && (
              <>
                <span className="font-sans text-base text-brand-dark/30 line-through">
                  {inr(item.originalPrice)}
                </span>
                <span className="rounded-full bg-brand-accent/10 px-2 py-0.5 font-sans text-[11px] font-bold text-brand-accent">
                  Save {inr(item.originalPrice - item.price)}
                </span>
              </>
            )}
          </div>

          {item.isAvailable ? (
            qty === 0 ? (
              <button onClick={() => add(item)}
                      className="w-full rounded-2xl bg-brand-primary py-4 font-display text-base font-bold text-white transition-colors hover:bg-brand-primary/90">
                Add to bag · {inr(item.price)}
              </button>
            ) : (
              <div className="flex items-center justify-between rounded-2xl border-2 border-brand-primary px-2 py-2">
                <button onClick={() => remove(item.id)}
                        className="grid h-11 w-11 place-items-center rounded-xl text-brand-primary">
                  <Minus className="h-5 w-5" strokeWidth={2.5} />
                </button>
                <span className="font-display text-base font-bold text-brand-primary">
                  {qty} in your bag
                </span>
                <button onClick={() => add(item)}
                        className="grid h-11 w-11 place-items-center rounded-xl text-brand-primary">
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </button>
              </div>
            )
          ) : (
            <p className="rounded-2xl bg-brand-offwhite py-4 text-center font-display text-base font-bold text-brand-dark/35">
              Currently unavailable
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { items, categories, banners, loading, error } = useMenu();
  const { favoriteIds } = useFavorites();
  const { storeOpen, closedMessage } = useStoreOpen();
  const { profile, user } = useAuth();

  const [term, setTerm] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [showFavourites, setShowFavourites] = useState(false);
  const [detail, setDetail] = useState(null);

  const firstName = String(profile?.name || user?.displayName || '').split(' ')[0];

  const visible = useMemo(() => {
    let list = items;
    if (showFavourites) list = list.filter((i) => favoriteIds.has(i.id));
    list = filterByCategory(list, categories, activeCat);
    list = searchItems(list, categories, term);
    return list;
  }, [items, categories, activeCat, term, showFavourites, favoriteIds]);

  // Surfaced as its own row rather than buried in the grid: a discount nobody
  // sees is a discount that does not sell anything.
  const deals = useMemo(
    () => items.filter((i) => i.hasDiscount && i.isAvailable).slice(0, 8),
    [items],
  );

  const browsing = Boolean(term) || showFavourites || activeCat !== 'all';

  return (
    <div className="pb-10">
      {/* ---------- greeting + location ---------- */}
      <header className="bg-brand-primary px-5 pb-12 pt-7 text-white sm:px-8 sm:pb-14">
        <div className="mx-auto max-w-6xl">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-secondary">
            {greeting()}{firstName ? `, ${firstName}` : ''}
          </p>
          <h1 className="mt-1.5 max-w-lg font-display text-[28px] font-bold leading-[1.15] tracking-tight sm:text-[34px]">
            What are you eating today?
          </h1>

          <div className="mt-4 flex items-center gap-2 text-white/60">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-secondary" />
            <span className="font-sans text-xs">
              Delivering to your saved address — confirm at checkout
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto -mt-7 max-w-6xl px-4 sm:px-8">
        {/* ---------- search, lifted onto the header edge ---------- */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-brand-dark/25" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search biryani, curries, desserts…"
            className="w-full rounded-2xl border border-brand-primary/8 bg-white py-4 pl-[52px] pr-4 font-sans text-sm text-brand-dark shadow-[0_8px_28px_-12px_rgba(11,77,59,0.3)] placeholder:text-brand-dark/30 focus:border-brand-primary/30 focus:outline-none"
          />
        </div>

        {!storeOpen && (
          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="font-sans text-xs leading-relaxed text-amber-800">
              {closedMessage || 'Our kitchen is closed right now. Browse the menu — ordering reopens shortly.'}
            </p>
          </div>
        )}

        {/* ---------- banners ---------- */}
        {banners.length > 0 && !browsing && (
          <div className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {banners.map((b) => (
              <img
                key={b.id}
                src={b.imageUrl}
                alt={b.title || 'Offer'}
                loading="lazy"
                decoding="async"
                className="h-44 w-[88%] shrink-0 snap-start rounded-3xl object-cover shadow-[0_10px_30px_-14px_rgba(28,28,28,0.5)] sm:h-56 sm:w-[520px]"
              />
            ))}
          </div>
        )}

        {/* ---------- categories ---------- */}
        <div className="mt-8 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setShowFavourites((v) => !v)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2.5 font-sans text-[13px] font-bold transition-all ${
              showFavourites
                ? 'border-brand-accent bg-brand-accent text-white shadow-md shadow-brand-accent/25'
                : 'border-brand-primary/12 bg-white text-brand-dark/60 hover:border-brand-primary/30'
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${showFavourites ? 'fill-white' : ''}`} />
            Favourites
          </button>

          {['all', ...categories.map((c) => c.id)].map((id) => {
            const label = id === 'all' ? 'All dishes' : categories.find((c) => c.id === id)?.name || id;
            const active = activeCat === id;
            return (
              <button
                key={id}
                onClick={() => setActiveCat(id)}
                className={`shrink-0 rounded-full border px-4 py-2.5 font-sans text-[13px] font-bold transition-all ${
                  active
                    ? 'border-brand-primary bg-brand-primary text-white shadow-md shadow-brand-primary/20'
                    : 'border-brand-primary/12 bg-white text-brand-dark/60 hover:border-brand-primary/30'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ---------- today's offers ---------- */}
        {deals.length > 0 && !browsing && (
          <section className="mt-10">
            <div className="mb-4 flex items-baseline gap-2.5">
              <Flame className="h-5 w-5 self-center text-brand-accent" />
              <h2 className="font-display text-xl font-bold tracking-tight text-brand-dark">
                Today's offers
              </h2>
              <span className="font-sans text-xs text-brand-dark/35">{deals.length} dishes</span>
            </div>
            <div className="flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {deals.map((item) => (
                <div key={item.id} className="w-[46%] shrink-0 snap-start sm:w-56">
                  <DishCard item={item} onOpen={setDetail} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---------- the menu ---------- */}
        <section className="mt-10">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-bold tracking-tight text-brand-dark">
              {showFavourites
                ? 'Your favourites'
                : term
                  ? 'Search results'
                  : activeCat === 'all'
                    ? 'Full menu'
                    : categories.find((c) => c.id === activeCat)?.name || 'Menu'}
            </h2>
            {!loading && visible.length > 0 && (
              <span className="shrink-0 font-sans text-xs text-brand-dark/35">
                {visible.length} {visible.length === 1 ? 'dish' : 'dishes'}
              </span>
            )}
          </div>

          {loading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] animate-pulse rounded-3xl bg-white/70" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-10 text-center">
              <p className="font-display text-base font-bold text-red-700">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 rounded-xl bg-red-600 px-5 py-2.5 font-sans text-sm font-bold text-white"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && visible.length === 0 && (
            <div className="rounded-3xl border border-brand-primary/8 bg-white p-14 text-center">
              <p className="font-display text-lg font-bold text-brand-dark/70">
                {showFavourites
                  ? 'No favourites yet'
                  : term
                    ? 'Nothing matched that'
                    : 'No dishes available'}
              </p>
              <p className="mx-auto mt-2 max-w-xs font-sans text-sm leading-relaxed text-brand-dark/40">
                {showFavourites
                  ? 'Tap the heart on any dish and it will be waiting here next time.'
                  : term
                    ? 'Try a shorter word, or clear the search to see everything.'
                    : 'Our menu is being updated — please check back shortly.'}
              </p>
              {(term || showFavourites || activeCat !== 'all') && (
                <button
                  onClick={() => { setTerm(''); setShowFavourites(false); setActiveCat('all'); }}
                  className="mt-5 rounded-xl border border-brand-primary/20 px-5 py-2.5 font-sans text-sm font-bold text-brand-primary"
                >
                  Show everything
                </button>
              )}
            </div>
          )}

          {!loading && !error && visible.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((item) => (
                <DishCard key={item.id} item={item} onOpen={setDetail} />
              ))}
            </div>
          )}
        </section>
      </div>

      <DishDetail item={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
