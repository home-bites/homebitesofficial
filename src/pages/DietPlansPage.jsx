import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Salad, AlertCircle, CalendarDays, Loader2, CheckCircle2, Plus, Minus } from 'lucide-react';
import { useDietCatalogue } from '../lib/useDietCatalogue';
import { purchaseSubscription, ONLINE_ENABLED } from '../lib/subscribe';
import { useAuth } from '../context/AuthContext';
import { useAddresses } from '../lib/useAddresses';
import { useCart } from '../context/CartContext';
import { inr } from '../lib/format';

/**
 * Diet meals and subscription plans.
 *
 * Meals are a catalogue view — they are what the plans deliver, not separately
 * purchasable, so there is no "add to cart" on them. Presenting a buy button
 * that then failed would be worse than presenting none.
 */

function Nutrition({ meal }) {
  const parts = [
    meal.calories && `${meal.calories} kcal`,
    meal.protein && `${meal.protein}g protein`,
    meal.carbs && `${meal.carbs}g carbs`,
    meal.fat && `${meal.fat}g fat`,
  ].filter(Boolean);
  // Nothing rendered when the admin has not filled nutrition in, rather than a
  // row of zeroes that looks like real data.
  if (parts.length === 0) return null;
  return (
    <p className="mt-1 font-sans text-[10px] text-brand-dark/40">{parts.join(' · ')}</p>
  );
}

function MealCard({ meal }) {
  // Diet meals are orderable individually, not only as part of a plan. They
  // were previously catalogue-only, which left a priced dish on screen with no
  // way to buy it.
  const { add, remove, qtyOf } = useCart();
  const qty = qtyOf(meal.id);

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-primary/10 bg-white">
      <div className="aspect-[4/3] bg-brand-offwhite">
        {meal.imageUrl ? (
          <img src={meal.imageUrl} alt={meal.name} loading="lazy"
               className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="p-3">
        <p className="font-display text-sm font-bold leading-snug text-brand-dark">{meal.name}</p>
        {meal.description && (
          <p className="mt-0.5 line-clamp-2 font-sans text-[11px] leading-relaxed text-brand-dark/45">
            {meal.description}
          </p>
        )}
        <Nutrition meal={meal} />
        <div className="mt-2 flex items-center justify-between gap-2">
          {meal.price > 0 && (
            <span className="font-display text-sm font-bold text-brand-primary">{inr(meal.price)}</span>
          )}

          {!meal.isAvailable ? (
            <span className="font-sans text-[11px] font-bold text-brand-dark/30">Sold out</span>
          ) : meal.price <= 0 ? (
            // Priced at zero means the admin has not set a price. Offering
            // "Add" would put a free item in the basket.
            <span className="font-sans text-[11px] font-bold text-brand-dark/30">Plan only</span>
          ) : qty === 0 ? (
            <button onClick={() => add({ ...meal, id: meal.id })}
                    className="rounded-lg bg-brand-primary px-3 py-1.5 font-sans text-xs font-bold text-white">
              Add
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded-lg border border-brand-primary/25">
              <button onClick={() => remove(meal.id)} aria-label="Decrease"
                      className="px-2 py-1 text-brand-primary"><Minus className="h-3.5 w-3.5" /></button>
              <span className="w-5 text-center font-sans text-xs font-bold text-brand-primary">{qty}</span>
              <button onClick={() => add({ ...meal, id: meal.id })} aria-label="Increase"
                      className="px-2 py-1 text-brand-primary"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, onSubscribe, busy }) {
  // Per-day cost, when both figures exist. A ₹2,400 monthly plan means little
  // on its own; "₹80 a day" is the number people actually compare.
  const perDay = plan.durationDays > 0 ? plan.price / plan.durationDays : 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-brand-primary/15 bg-white">
      {/* The image was being loaded by useDietCatalogue and then never drawn,
          so every plan looked like a bare price list. */}
      {plan.imageUrl && (
        <div className="aspect-[16/9] w-full overflow-hidden bg-brand-offwhite">
          <img src={plan.imageUrl} alt={plan.name} loading="lazy"
               className="h-full w-full object-cover" />
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-brand-dark">{plan.name}</p>
          {plan.planType && (
            <span className="mt-0.5 inline-block rounded-full bg-brand-secondary/15 px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-brand-primary">
              {plan.planType}
            </span>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-lg font-bold text-brand-primary">{inr(plan.price)}</p>
          {perDay > 0 && (
            <p className="font-sans text-[10px] font-semibold text-brand-dark/40">
              {inr(perDay)}/day
            </p>
          )}
        </div>
      </div>

      {plan.description && (
        <p className="mb-3 font-sans text-xs leading-relaxed text-brand-dark/50">{plan.description}</p>
      )}

      <ul className="mb-4 space-y-1 font-sans text-xs text-brand-dark/60">
        {plan.durationDays > 0 && (
          <li className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-brand-primary" /> {plan.durationDays} days
          </li>
        )}
        {plan.mealsPerDay > 0 && (
          <li className="flex items-center gap-1.5">
            <Salad className="h-3.5 w-3.5 text-brand-primary" /> {plan.mealsPerDay} meal
            {plan.mealsPerDay > 1 ? 's' : ''} a day
          </li>
        )}
      </ul>

      <button
        onClick={() => onSubscribe(plan)}
        disabled={busy || !ONLINE_ENABLED || !(plan.price > 0)}
        className="mt-auto w-full rounded-xl bg-brand-primary py-2.5 font-sans text-sm font-bold text-white transition-colors hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:bg-brand-dark/15 disabled:text-brand-dark/35"
      >
        {busy ? 'Working…' : !ONLINE_ENABLED ? 'Payment unavailable' : 'Subscribe'}
      </button>
      </div>
    </div>
  );
}

export default function DietPlansPage() {
  const { meals, plans, categories, loading, error } = useDietCatalogue();
  const { user, profile } = useAuth();
  const { defaultAddress, loading: addressesLoading } = useAddresses();
  const navigate = useNavigate();

  const [activeCat, setActiveCat] = useState('all');
  const [busyPlan, setBusyPlan] = useState(null);
  const [stage, setStage] = useState('');
  const [fatal, setFatal] = useState('');
  const [done, setDone] = useState(null);

  const visibleMeals = useMemo(() => {
    if (activeCat === 'all') return meals;
    const cat = categories.find((c) => c.id === activeCat);
    const name = String(cat?.name || '').trim().toLowerCase();
    return meals.filter((m) => {
      const raw = String(m.categoryId || '').trim().toLowerCase();
      return m.categoryId === activeCat || (name && raw === name);
    });
  }, [meals, categories, activeCat]);

  const handleSubscribe = async (plan) => {
    setFatal('');
    // Refusing before payment rather than after. A subscription with no
    // address takes the customer's money and then cannot be delivered.
    if (!addressesLoading && !defaultAddress) {
      setFatal(
        'We have no delivery address saved for you, so this subscription could '
        + 'not be delivered. Add one in the mobile app first.',
      );
      return;
    }
    setBusyPlan(plan.id);
    try {
      const result = await purchaseSubscription({
        plan,
        user,
        profile,
        phone: profile?.phone || profile?.mobile || '',
        // A real saved address, not the `profile.defaultAddress` field the web
        // profile never sets. Guarded below so nobody pays for a subscription
        // we cannot deliver.
        address: defaultAddress,
        onStage: setStage,
      });
      setDone(result);
    } catch (e) {
      setFatal(e?.message || 'Could not complete the subscription.');
    } finally {
      setBusyPlan(null);
      setStage('');
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
      <h1 className="mb-1 font-display text-xl font-bold text-brand-dark">Diet plans</h1>
      <p className="mb-5 font-sans text-sm text-brand-dark/50">
        Balanced meals delivered on a schedule.
      </p>

      {!addressesLoading && !defaultAddress && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="font-sans text-xs leading-relaxed text-amber-800">
            You have no saved delivery address yet, so a subscription could not
            be delivered. Add one in the HomeBites mobile app and it will appear
            here — saved addresses arrive on the website in the next update.
          </p>
        </div>
      )}

      {fatal && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="font-sans text-xs leading-relaxed text-red-700">{fatal}</p>
        </div>
      )}

      {stage && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-brand-primary/15 bg-white p-3">
          <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
          <p className="font-sans text-xs font-semibold text-brand-dark/60">{stage}</p>
        </div>
      )}

      {done && (
        <div className="mb-4 rounded-xl border border-brand-secondary/40 bg-brand-secondary/10 p-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />
            <div>
              <p className="font-display text-sm font-bold text-brand-primary">Subscription active</p>
              <p className="mt-0.5 font-sans text-xs text-brand-dark/55">
                Payment confirmed. You can manage it, pick meals, pause or cancel from Subscriptions.
              </p>
              <button onClick={() => navigate('/subscriptions')}
                      className="mt-3 rounded-xl bg-brand-primary px-4 py-2 font-sans text-xs font-bold text-white">
                Go to Subscriptions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- plans ---- */}
      <section className="mb-8">
        <h2 className="mb-3 font-sans text-xs font-bold uppercase tracking-wider text-brand-dark/45">
          Subscription plans
        </h2>

        {loading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-52 animate-pulse rounded-2xl bg-white/70" />)}
          </div>
        )}

        {!loading && plans.length === 0 && (
          <div className="rounded-2xl border border-brand-primary/10 bg-white p-8 text-center">
            <p className="font-display text-sm font-bold text-brand-dark/70">No plans available yet</p>
            <p className="mt-1 font-sans text-xs text-brand-dark/40">
              Subscription plans will appear here once they are published.
            </p>
          </div>
        )}

        {plans.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} onSubscribe={handleSubscribe} busy={busyPlan === p.id} />
            ))}
          </div>
        )}
      </section>

      {/* ---- meals ---- */}
      <section>
        <h2 className="mb-3 font-sans text-xs font-bold uppercase tracking-wider text-brand-dark/45">
          What you'll be eating
        </h2>

        {categories.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {['all', ...categories.map((c) => c.id)].map((id) => {
              const label = id === 'all' ? 'All' : categories.find((c) => c.id === id)?.name || id;
              const active = activeCat === id;
              return (
                <button key={id} onClick={() => setActiveCat(id)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 font-sans text-xs font-bold transition-colors ${
                          active
                            ? 'border-brand-primary bg-brand-primary text-white'
                            : 'border-brand-primary/15 bg-white text-brand-dark/55'
                        }`}>
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="font-sans text-sm font-bold text-red-700">{error}</p>
          </div>
        )}

        {!loading && !error && visibleMeals.length === 0 && (
          <div className="rounded-2xl border border-brand-primary/10 bg-white p-8 text-center">
            <p className="font-display text-sm font-bold text-brand-dark/70">No meals to show</p>
          </div>
        )}

        {visibleMeals.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleMeals.map((m) => <MealCard key={m.id} meal={m} />)}
          </div>
        )}
      </section>
    </div>
  );
}
