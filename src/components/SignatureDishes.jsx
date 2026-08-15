import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { Plus, Minus, Leaf, Drumstick, Egg, Sparkles } from 'lucide-react';
import Container from '../common/Container';
import { db, isConfigured } from '../lib/firebase';
import { inr } from '../lib/format';
import { useCart } from '../context/CartContext';
import { useStoreOpen } from '../lib/useStoreOpen';
import { readCache, writeCache, TTL } from '../lib/localCache';

/** Small veg / non-veg / egg marker, the way Indian menus mark them. */
function FoodMark({ type }) {
  const map = {
    'Non-Veg': { ring: 'border-red-600', dot: 'bg-red-600', Icon: Drumstick, label: 'Non-vegetarian' },
    Egg: { ring: 'border-amber-500', dot: 'bg-amber-500', Icon: Egg, label: 'Contains egg' },
    Veg: { ring: 'border-green-700', dot: 'bg-green-700', Icon: Leaf, label: 'Vegetarian' },
  };
  const { ring, dot, Icon, label } = map[type] || map.Veg;
  return (
    <span className={`inline-flex h-4 w-4 items-center justify-center rounded-[3px] border-2 ${ring}`} title={label}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <Icon className="sr-only" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function DishCard({ item, qty, onAdd, onRemove, index, storeOpen = true }) {
  const discounted = item.price < item.originalPrice;
  // A closed kitchen and a sold-out dish both mean "can't order this now",
  // but they read differently to a customer, so the badge distinguishes them.
  const orderable = item.available && storeOpen;

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.05, 0.3), ease: [0.16, 1, 0.3, 1] }}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-brand-primary/10
                  bg-white shadow-premium transition-all duration-300
                  ${orderable ? 'hover:-translate-y-1 hover:shadow-premium-hover' : 'opacity-60'}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-brand-offwhite">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-brand-primary/20">
            <Sparkles className="h-10 w-10" />
          </div>
        )}

        {discounted && (
          <span className="absolute left-3 top-3 rounded-full bg-brand-accent px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-md">
            {Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100)}% off
          </span>
        )}
        {!orderable && (
          <div className="absolute inset-0 grid place-items-center bg-brand-dark/55 backdrop-blur-[2px]">
            <span className="rounded-full bg-white/95 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-brand-dark">
              {item.available ? 'Kitchen closed' : 'Sold out'}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-1.5 flex items-start gap-2">
          <span className="mt-1"><FoodMark type={item.foodType} /></span>
          <h3 className="font-display text-base font-bold leading-snug text-brand-dark">
            {item.name}
          </h3>
        </div>

        {item.description && (
          <p className="mb-4 line-clamp-2 font-sans text-[13px] leading-relaxed text-brand-dark/55">
            {item.description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg font-bold text-brand-primary">{inr(item.price)}</span>
            {discounted && (
              <span className="text-xs text-brand-dark/35 line-through">{inr(item.originalPrice)}</span>
            )}
          </div>

          {!orderable ? (
            <button
              disabled
              className="rounded-xl border-2 border-gray-300 px-4 py-1.5 font-sans text-sm font-bold text-gray-400 bg-gray-100 cursor-not-allowed"
            >
              {item.available ? 'Closed' : 'Sold Out'}
            </button>
          ) : qty === 0 ? (
            <button
              onClick={() => onAdd(item)}
              className="rounded-xl border-2 border-brand-primary px-4 py-1.5 font-sans text-sm font-bold text-brand-primary
                         transition-all duration-200 hover:bg-brand-primary hover:text-white"
            >
              Add
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-brand-primary px-2 py-1.5 text-white shadow-md">
              <button
                onClick={() => onRemove(item.id)}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-white/20 hover:bg-white/30"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-4 text-center font-sans text-sm font-bold">{qty}</span>
              <button
                onClick={() => onAdd(item)}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-white/20 hover:bg-white/30"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}

export default function SignatureDishes() {
  const { add, remove, qtyOf } = useCart();
  const { storeOpen, closedMessage } = useStoreOpen();
  // Seeded from localStorage so the menu is on screen before Firestore has
  // even connected. The network read below still runs and overwrites this —
  // the cache buys the first frame, not the truth.
  const cached = readCache('menu', { maxAgeMs: TTL.MENU });
  const [items, setItems] = useState(cached?.items ?? []);
  const [categories, setCategories] = useState(cached?.categories ?? []);
  const [activeCat, setActiveCat] = useState('all');
  // 'unconfigured' is kept distinct from 'error' on purpose. Both look the
  // same to a customer, but they need opposite fixes: one is a missing .env,
  // the other is a real Firestore failure. Collapsing them sends whoever is
  // debugging off in the wrong direction.
  const [state, setState] = useState(
    cached?.items?.length ? 'ready' : 'loading',
  ); // loading | ready | empty | unconfigured | error

  // Re-runs when `tick` changes. A menu the kitchen edits mid-service should
  // reach the website without the customer reloading — a dish marked out of
  // stock at 8pm must not stay orderable until someone refreshes.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isConfigured || !db) return undefined;
    // Cheap: one listener on two tiny collections, re-reading only when the
    // admin actually changes something.
    const bump = () => setTick((t) => t + 1);
    const unsubItems = onSnapshot(collection(db, 'menuItems'), bump, () => {});
    const unsubCats = onSnapshot(collection(db, 'categories'), bump, () => {});
    return () => { unsubItems(); unsubCats(); };
  }, []);

  useEffect(() => {
    if (!isConfigured || !db) { setState('unconfigured'); return; }

    (async () => {
      try {
        const [itemSnap, catSnap] = await Promise.all([
          getDocs(collection(db, 'menuItems')),
          getDocs(collection(db, 'categories')),
        ]);

        const catNames = {};
        const cats = [];
        catSnap.forEach((d) => {
          const c = d.data();
          // The admin's Categories page writes `status: "Active" | "Inactive"`.
          // This checked `isActive`, a field it never writes — so the check
          // always passed and a category switched off in the dashboard kept
          // its filter chip on the website.
          const disabled =
            c.isDeleted === true
            || c.isActive === false
            || (typeof c.status === 'string' && c.status.toLowerCase() !== 'active');
          if (disabled) return;

          // Indexed by id *and* by lowercased name: a dish's `categoryId`
          // holds the category's name, not its document id, so a lookup
          // keyed only on id returned undefined for every dish.
          catNames[d.id] = c.name || 'Menu';
          catNames[String(c.name || '').trim().toLowerCase()] = c.name || 'Menu';
          cats.push({
            id: d.id,
            name: c.name || 'Menu',
            // Honour the order the admin set, instead of Firestore's
            // document-id order, which is effectively random.
            order: Number(c.displayOrder ?? c.sortOrder ?? 9999),
          });
        });
        cats.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

        const mapped = itemSnap.docs.map((d) => {
          const x = d.data();
          const base = Number(x.price) || 0;
          const offer = Number(x.offerPrice) || 0;
          const dAmt = Number(x.discountAmount) || 0;
          const dPct = Number(x.discountPercentage) || 0;

          // Mirrors MenuItemModel.fromFirestore so the website never shows a
          // different price from the app for the same dish.
          let price = base;
          if (offer > 0 && offer < base) price = offer;
          else if (dAmt > 0 && dAmt < base) price = base - dAmt;
          else if (dPct > 0 && dPct < 100) price = base - (base * dPct) / 100;

          const outOfStock =
            (x.isAvailable !== undefined ? !x.isAvailable : x.outOfStock === true) ||
            (x.trackInventory === true && (Number(x.stockQuantity) || 0) <= 0);

          return {
            id: d.id,
            name: x.name || 'Dish',
            description: x.description || '',
            price: +price.toFixed(2),
            originalPrice: base,
            image: x.imageUrl || x.image || x.thumbnail || x.photo || '',
            categoryId: x.categoryId || '',
            // Display label, with a friendly fallback.
            category:
              catNames[x.categoryId]
              || catNames[String(x.categoryId || '').trim().toLowerCase()]
              || 'Signature',
            // The real category name, or '' when the dish has none. Kept
            // separate so the chip join below cannot match a dish on the
            // word 'Signature' and invent a category nobody created.
            categoryNameRaw: String(
              x.categoryName
                || catNames[x.categoryId]
                || catNames[String(x.categoryId || '').trim().toLowerCase()]
                || '',
            ).trim(),
            foodType: x.foodType || x.type || (x.isVeg === false ? 'Non-Veg' : 'Veg'),
            hidden: x.isHidden === true || x.isDeleted === true || x.isActive === false,
            available: !(x.isHidden === true || x.isDeleted === true || x.isActive === false || outOfStock),
          };
        }).filter((i) => !i.hidden);
        // Soft-delete is filtered in JS, not with where('isDeleted','!=',true):
        // a Firestore != query silently drops documents that lack the field.

        setItems(mapped);

        // A chip is only worth showing if tapping it yields dishes, so a
        // category has to be referenced by at least one visible item.
        //
        // The match is by id *or* by name. Menu items store `categoryId`, but
        // items imported or edited outside the Menu Items page sometimes carry
        // only the category's name — and a chip that silently disappears looks
        // identical to a filter that doesn't exist.
        // Match on id OR name, in both directions.
        //
        // The Menu Items page stores the *name* in `categoryId` — a dish in
        // Biryanis has categoryId: "Biryanis", not the category document's
        // id. So an id-to-id join matched nothing and the filter bar vanished
        // entirely, which read as "the feature isn't there" rather than "the
        // key doesn't line up".
        const norm = (v) => String(v || '').trim().toLowerCase();
        const used = cats.filter((c) =>
          mapped.some(
            (i) =>
              i.categoryId === c.id ||
              norm(i.categoryId) === norm(c.name) ||
              norm(i.categoryNameRaw) === norm(c.name),
          ),
        );

        if (import.meta.env.DEV && used.length < cats.length) {
          // Names the ones that were dropped, rather than leaving an empty
          // filter bar with no explanation of why.
          console.warn(
            '[menu] categories hidden because no visible dish references them:',
            cats.filter((c) => !used.includes(c)).map((c) => c.name),
            '— check that each dish has a category selected in Menu Items.',
          );
        }

        setCategories(used);

        // Cache for the next visit.
        //
        // base64 images are dropped before storing. A single inlined photo
        // runs to hundreds of kilobytes, so half a dozen dishes would exhaust
        // the ~5 MB quota and every write after that would fail — including
        // the useful ones. A cached dish therefore paints its name, price and
        // availability instantly and fetches its photo normally, which is the
        // part of the wait that actually matters.
        const forCache = mapped.map((i) => ({
          ...i,
          image: i.image.startsWith('data:') ? '' : i.image,
        }));
        writeCache('menu', { items: forCache, categories: used });
        setState(mapped.length ? 'ready' : 'empty');
      } catch (e) {
        console.error('[menu] load failed', e);
        setState('error');
      }
    })();
  }, [tick]);

  const visible = useMemo(() => {
    if (activeCat === 'all') return items;
    // activeCat is a category *document id*, but a dish's categoryId may hold
    // the category's name instead. Comparing only ids made every chip render
    // an empty grid — a filter that looks broken rather than one that filters.
    const chip = categories.find((c) => c.id === activeCat);
    const wanted = String(chip?.name || '').trim().toLowerCase();
    return items.filter(
      (i) =>
        i.categoryId === activeCat ||
        String(i.categoryId || '').trim().toLowerCase() === wanted ||
        String(i.categoryNameRaw || '').trim().toLowerCase() === wanted,
    );
  }, [items, activeCat, categories]);

  return (
    <section id="menu" className="relative bg-brand-offwhite py-24 md:py-32">
      {/* soft radial warmth behind the grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.55]"
           style={{ background: 'radial-gradient(1100px 460px at 50% -8%, rgba(130,195,65,0.16), transparent 65%)' }} />

      <Container>
        <div className="relative mb-14 text-center">
          <motion.span
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-primary/15
                       bg-white px-4 py-1.5 font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-brand-primary shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5 text-brand-accent" />
            Order online — delivered hot
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-4xl italic leading-tight text-brand-primary md:text-6xl"
          >
            Signature Dishes
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
            viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.15 }}
            className="mx-auto mt-3 max-w-xl font-display text-lg italic text-brand-dark/60 md:text-xl"
          >
            for tasting our quality foods
          </motion.p>

          <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-brand-accent to-transparent" />
        </div>

        {/* Kitchen closed. Said once, here, above the menu — browsing stays
            open so people can see what's on, but nothing can be added to the
            cart while the stove is off. */}
        {!storeOpen && (
          <div className="mx-auto mb-10 max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-5 text-center">
            <p className="font-display text-lg font-bold text-amber-900">
              The kitchen is closed right now
            </p>
            <p className="mt-1.5 font-sans text-[13px] leading-relaxed text-amber-800">
              {closedMessage
                || "We're not taking orders at the moment. Have a look at the "
                   + 'menu and come back when we reopen.'}
            </p>
          </div>
        )}

        {/* Category filter */}
        {state === 'ready' && categories.length > 1 && (
          <div className="mb-10 flex flex-wrap justify-center gap-2">
            {[{ id: 'all', name: 'All' }, ...categories].map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`rounded-full px-4 py-2 font-sans text-sm font-semibold transition-all duration-200
                  ${activeCat === c.id
                    ? 'bg-brand-primary text-white shadow-premium'
                    : 'border border-brand-primary/15 bg-white text-brand-dark/70 hover:border-brand-primary/40'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {state === 'loading' && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-2xl bg-white/70" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <p className="mx-auto max-w-md rounded-2xl border border-brand-primary/10 bg-white p-8 text-center font-sans text-sm text-brand-dark/60">
            Our menu isn't loading right now. Please refresh, or reach us through
            the Help Centre at the bottom of this page.
          </p>
        )}

        {state === 'unconfigured' && (
          import.meta.env.DEV ? (
            // Developer-facing: the customer copy above would send you hunting
            // for a Firestore problem that doesn't exist.
            <div className="mx-auto max-w-lg rounded-2xl border-2 border-dashed border-brand-accent/50 bg-white p-8 font-sans text-sm text-brand-dark/75">
              <p className="mb-2 font-bold text-brand-accent">Firebase isn't configured</p>
              <p className="mb-3 leading-relaxed">
                The menu can't load because this site has no Firebase credentials yet.
                Nothing is wrong with the code or your Firestore data.
              </p>
              <p className="mb-1 leading-relaxed">Create <code className="rounded bg-brand-offwhite px-1.5 py-0.5">.env</code> in <code className="rounded bg-brand-offwhite px-1.5 py-0.5">official_page/</code> by copying <code className="rounded bg-brand-offwhite px-1.5 py-0.5">.env.example</code>, then fill in:</p>
              <ul className="ml-5 list-disc leading-relaxed">
                <li><code>VITE_FIREBASE_API_KEY</code></li>
                <li><code>VITE_FIREBASE_APP_ID</code></li>
              </ul>
              <p className="mt-3 text-xs text-brand-dark/50">
                Both come from Firebase Console → Project settings → Your apps → Add app → Web.
                Restart the dev server afterwards — Vite only reads .env at startup.
              </p>
            </div>
          ) : (
            <p className="mx-auto max-w-md rounded-2xl border border-brand-primary/10 bg-white p-8 text-center font-sans text-sm text-brand-dark/60">
              Online ordering is being set up. Please reach us through the
              Help Centre at the bottom of this page to place an order.
            </p>
          )
        )}

        {state === 'empty' && (
          <p className="mx-auto max-w-md rounded-2xl border border-brand-primary/10 bg-white p-8 text-center font-sans text-sm text-brand-dark/60">
            The kitchen is between menus right now. Please check back shortly.
          </p>
        )}

        {state === 'ready' && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((item, i) => (
              <DishCard
                storeOpen={storeOpen}
                key={item.id}
                item={item}
                index={i}
                qty={qtyOf(item.id)}
                onAdd={add}
                onRemove={remove}
              />
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
