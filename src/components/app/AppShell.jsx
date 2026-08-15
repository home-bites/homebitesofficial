import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Home, ShoppingBag, Salad, ReceiptText, CalendarClock, User, LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';

/**
 * Layout for the signed-in customer experience.
 *
 * Sidebar on desktop, bottom bar on mobile — not the same component stretched.
 * A bottom bar on a 27-inch monitor puts the primary navigation as far from
 * the content as the screen allows, and a sidebar on a phone eats a third of
 * the width.
 *
 * Rendered once and kept mounted across route changes, so moving between
 * sections does not tear down and rebuild the chrome.
 */

const NAV = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/cart', label: 'Cart', icon: ShoppingBag, badge: 'cart' },
  { to: '/diet-plans', label: 'Diet Plans', icon: Salad },
  { to: '/orders', label: 'Orders', icon: ReceiptText },
  { to: '/subscriptions', label: 'Subscriptions', icon: CalendarClock },
  { to: '/profile', label: 'Profile', icon: User },
];

function CartBadge({ count }) {
  if (!count) return null;
  return (
    <span className="ml-auto grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-brand-accent px-1 font-sans text-[10px] font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function AppShell() {
  const { profile, user, signOut } = useAuth();
  const { items } = useCart();
  const navigate = useNavigate();

  const cartCount = items.reduce((n, l) => n + (l.qty || 0), 0);
  const name = profile?.name || user?.displayName || 'there';

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-brand-offwhite text-brand-dark">
      {/* ---------- desktop sidebar ---------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-brand-primary/10 bg-white lg:flex">
        <div className="px-5 py-5">
          <p className="font-display text-lg font-bold text-brand-primary">HomeBites</p>
          <p className="mt-0.5 truncate font-sans text-xs text-brand-dark/45">Hi, {name}</p>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 font-sans text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-brand-primary/10 text-brand-primary'
                    : 'text-brand-dark/60 hover:bg-brand-primary/5 hover:text-brand-primary'
                }`
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
              {badge === 'cart' && <CartBadge count={cartCount} />}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={handleSignOut}
          className="m-3 flex items-center gap-3 rounded-xl px-3 py-2.5 font-sans text-sm font-semibold text-brand-dark/50 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Log out
        </button>
      </aside>

      {/* ---------- mobile top bar ---------- */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-brand-primary/10 bg-white px-4 py-3 lg:hidden">
        <div>
          <p className="font-display text-base font-bold text-brand-primary">HomeBites</p>
          <p className="truncate font-sans text-[11px] text-brand-dark/45">Hi, {name}</p>
        </div>
        <button
          onClick={handleSignOut}
          aria-label="Log out"
          className="rounded-lg p-2 text-brand-dark/40 hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </header>

      {/* Bottom padding on mobile clears the fixed nav bar, so the last card
          on any page is reachable rather than sitting behind it. */}
      <main className="pb-24 lg:ml-60 lg:pb-10">
        <Outlet />
      </main>

      {/* ---------- mobile bottom nav ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-brand-primary/10 bg-white lg:hidden">
        {NAV.map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 py-2 font-sans text-[10px] font-semibold transition-colors ${
                isActive ? 'text-brand-primary' : 'text-brand-dark/40'
              }`
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {/* Truncated so "Subscriptions" does not wrap and shove the bar
                taller than its neighbours. */}
            <span className="max-w-full truncate px-0.5">{label}</span>
            {badge === 'cart' && cartCount > 0 && (
              <span className="absolute right-1/4 top-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-brand-accent px-1 text-[9px] font-bold text-white">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
