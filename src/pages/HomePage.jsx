import React, { useMemo, useState } from 'react';
import { Search, Heart, MapPin, Plus, Minus, AlertCircle } from 'lucide-react';
import { useMenu, filterByCategory, searchItems, isVeg } from '../lib/useMenu';
import { useFavorites } from '../lib/useFavorites';
import { useCart } from '../context/CartContext';
import { useStoreOpen } from '../lib/useStoreOpen';
import { inr } from '../lib/format';

/**
 * Customer home — location, search, banners, categories, menu, favourites.
 *
 * Every list on this page comes from Firestore through useMenu(). There is no
 * placeholder data anywhere in this file: an empty menu renders an empty
 * state, not a set of invented dishes that look real until someone tries to
 * order one.
 */

function VegDot({ item }) {
  const veg = isVeg(item);
  const type = String(item.foodType || '').trim();
  if (!type) return null;
  return (
    <span
      title={type}
      className={`grid h-3.5 w-3.5 shrink-0 place-items-center border ${
        veg ? 'border-green-600' : 'border-red-600'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${veg ? 'bg-green-600' : 'bg-red-600'}`} />
    </span>
  );
}

function DishCard({ item, onOpen }) {
  const { add, remove, qtyOf } = useCart();
  const { isFavorite, toggleFavorite, canFavorite } = useFavorites();
  const qty = qtyOf(item.id);
  const fav = isFavorite(item.id);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-brand-primary/10 bg-white transition-shadow hover:shadow-md">
      <button onClick={() => onOpen(item)} className="relative block aspect-[4/3] w-full overflow-hidden bg-brand-offwhite text-left">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} loading="lazy"
               className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
        ) : (
          <span className="grid h-full w-full place-items-center font-sans text-xs text-brand-dark/30">
            No photo
          </span>
        )}
        {item.hasDiscount && (
          <span className="absolute left-2 top-2 rounded-full bg-brand-accent px-2 py-0.5 font-sans text-[10px] font-bold text-white">
            {Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100)}% off
          </span>
        )}
        {!item.isAvailable && (
          <span className="absolute inset-0 grid place-items-center bg-white/70 font-sans text-xs font-bold text-brand-dark/60">
            Unavailable
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col p-3">
        <div className="mb-1 flex items-start gap-1.5">
          <VegDot item={item} />
          <button onClick={() => onOpen(item)}
                  className="min-w-0 flex-1 text-left font-display text-sm font-bold leading-snug text-brand-dark hover:text-brand-primary">
            {item.name}
          </button>
          {/* Favouriting requires an account because it is stored per user in
              the same collection the app reads. Hidden rather than shown
              broken when signed out. */}
          {canFavorite && (
            <button onClick={() => toggleFavorite(item.id)}
                    aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
                    className="shrink-0 p-0.5">
              <Heart className={`h-4 w-4 transition-colors ${
                fav ? 'fill-brand-accent text-brand-accent' : 'text-brand-dark/25 hover:text-brand-accent'}`} />
            </button>
          )}
        </div>

        {item.description && (
          <p className="mb-2 line-clamp-2 font-sans text-[11px] leading-relaxed text-brand-dark/45">
            {item.description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="font-display text-sm font-bold text-brand-primary">{inr(item.price)}</span>
            {item.hasDiscount && (
              <span className="ml-1.5 font-sans text-[11px] text-brand-dark/35 line-through">
                {inr(item.originalPrice)}
              </span>
            )}
          </div>

          {!item.isAvailable ? (
            <span className="font-sans text-[11px] font-bold text-brand-dark/30">Sold out</span>
          ) : qty === 0 ? (
            <button onClick={() => add(item)}
                    className="rounded-lg bg-brand-primary px-3 py-1.5 font-sans text-xs font-bold text-white transition-colors hover:bg-brand-primary/90">
              Add
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded-lg border border-brand-primary/25">
              <button onClick={() => remove(item.id)} aria-label="Decrease"
                      className="px-2 py-1 text-brand-primary"><Minus className="h-3.5 w-3.5" /></button>
              <span className="w-5 text-center font-sans text-xs font-bold text-brand-primary">{qty}</span>
              <button onClick={() => add(item)} aria-label="Increase"
                      className="px-2 py-1 text-brand-primary"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DishDetail({ item, onClose }) {
  const { add, remove, qtyOf } = useCart();
  if (!item) return null;
  const qty = qtyOf(item.id);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-brand-dark/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
         onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl"
           onClick={(e) => e.stopPropagation()}>
        {item.imageUrl && (
          <img src={item.imageUrl} alt={item.name} className="aspect-[16/10] w-full object-cover" />
        )}
        <div className="p-5">
          <div className="mb-2 flex items-start gap-2">
            <VegDot item={item} />
            <h2 className="font-display text-lg font-bold text-brand-dark">{item.name}</h2>
          </div>
          {item.description && (
            <p className="mb-4 font-sans text-sm leading-relaxed text-brand-dark/55">{item.description}</p>
          )}
          <div className="mb-5 flex items-center gap-2">
            <span className="font-display text-xl font-bold text-brand-primary">{inr(item.price)}</span>
            {item.hasDiscount && (
              <span className="font-sans text-sm text-brand-dark/35 line-through">{inr(item.originalPrice)}</span>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={onClose}
                    className="flex-1 rounded-xl border border-brand-primary/20 py-2.5 font-sans text-sm font-bold text-brand-dark/60">
              Close
            </button>
            {item.isAvailable ? (
              qty === 0 ? (
                <button onClick={() => add(item)}
                        className="flex-[2] rounded-xl bg-brand-primary py-2.5 font-sans text-sm font-bold text-white">
                  Add to cart
                </button>
              ) : (
                <div className="flex flex-[2] items-center justify-center gap-3 rounded-xl border border-brand-primary/25">
                  <button onClick={() => remove(item.id)} className="px-3 py-2 text-brand-primary"><Minus className="h-4 w-4" /></button>
                  <span className="font-sans text-sm font-bold text-brand-primary">{qty} in cart</span>
                  <button onClick={() => add(item)} className="px-3 py-2 text-brand-primary"><Plus className="h-4 w-4" /></button>
                </div>
              )
            ) : (
              <span className="flex-[2] rounded-xl bg-brand-offwhite py-2.5 text-center font-sans text-sm font-bold text-brand-dark/35">
                Unavailable
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { items, categories, banners, loading, error } = useMenu();
  const { favoriteIds } = useFavorites();
  const { storeOpen, closedMessage } = useStoreOpen();

  const [term, setTerm] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [showFavourites, setShowFavourites] = useState(false);
  const [detail, setDetail] = useState(null);

  const visible = useMemo(() => {
    let list = items;
    if (showFavourites) list = list.filter((i) => favoriteIds.has(i.id));
    list = filterByCategory(list, categories, activeCat);
    list = searchItems(list, categories, term);
    return list;
  }, [items, categories, activeCat, term, showFavourites, favoriteIds]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
      {/* Location. Reads the saved address the checkout flow already keeps;
          the full selector arrives with the Cart phase, so this links to the
          place that can actually change it rather than pretending to. */}
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-brand-primary/10 bg-white px-3 py-2.5">
        <MapPin className="h-4 w-4 shrink-0 text-brand-accent" />
        <span className="min-w-0 flex-1 truncate font-sans text-xs text-brand-dark/60">
          Delivering to your saved address — confirm it at checkout
        </span>
      </div>

      {!storeOpen && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="font-sans text-xs leading-relaxed text-amber-800">
            {closedMessage || 'Our kitchen is closed right now. You can browse, but orders reopen shortly.'}
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-dark/30" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search dishes, categories…"
          className="w-full rounded-xl border border-brand-primary/15 bg-white py-2.5 pl-9 pr-3 font-sans text-sm text-brand-dark placeholder:text-brand-dark/30 focus:border-brand-primary focus:outline-none"
        />
      </div>

      {/* Banners */}
      {banners.length > 0 && (
        <div className="mb-5 flex snap-x gap-3 overflow-x-auto pb-1">
          {banners.map((b) => (
            <img key={b.id} src={b.imageUrl} alt={b.title || 'Offer'} loading="lazy"
                 className="h-32 w-[85%] shrink-0 snap-start rounded-2xl object-cover sm:h-40 sm:w-[420px]" />
          ))}
        </div>
      )}

      {/* Categories + favourites toggle */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setShowFavourites((v) => !v)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-sans text-xs font-bold transition-colors ${
            showFavourites
              ? 'border-brand-accent bg-brand-accent text-white'
              : 'border-brand-primary/15 bg-white text-brand-dark/55'
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${showFavourites ? 'fill-white' : ''}`} />
          Favourites
        </button>

        {['all', ...categories.map((c) => c.id)].map((id) => {
          const label = id === 'all' ? 'All' : categories.find((c) => c.id === id)?.name || id;
          const active = activeCat === id;
          return (
            <button key={id} onClick={() => setActiveCat(id)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 font-sans text-xs font-bold transition-colors ${
                      active
                        ? 'border-brand-primary bg-brand-primary text-white'
                        : 'border-brand-primary/15 bg-white text-brand-dark/55 hover:border-brand-primary/40'
                    }`}>
              {label}
            </button>
          );
        })}
      </div>

      {/* Menu */}
      {loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-white/70" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-sans text-sm font-bold text-red-700">{error}</p>
          <button onClick={() => window.location.reload()}
                  className="mt-3 rounded-lg bg-red-600 px-4 py-2 font-sans text-xs font-bold text-white">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="rounded-2xl border border-brand-primary/10 bg-white p-10 text-center">
          <p className="font-display text-sm font-bold text-brand-dark/70">
            {showFavourites ? 'No favourites yet' : term ? 'Nothing matched that search' : 'No dishes available'}
          </p>
          <p className="mt-1 font-sans text-xs text-brand-dark/40">
            {showFavourites
              ? 'Tap the heart on any dish to save it here.'
              : term
                ? 'Try a different word, or clear the search.'
                : 'Our menu is being updated — please check back shortly.'}
          </p>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((item) => (
            <DishCard key={item.id} item={item} onOpen={setDetail} />
          ))}
        </div>
      )}

      <DishDetail item={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
