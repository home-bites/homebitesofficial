import React, { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Navbar from './components/Navbar';
import Hero from './components/Hero';
import About from './components/About';
import SignatureDishes from './components/SignatureDishes';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import Showcase from './components/Showcase';
import Footer from './components/Footer';
import CartBar from './components/CartBar';
import CheckoutModal, { OrderPlaced } from './components/CheckoutModal';
import OrderTracking from './components/OrderTracking';
import HelpCenter from './components/HelpCenter';

import ProtectedRoute from './routes/ProtectedRoute';
import CookieConsent from './components/CookieConsent';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

/**
 * The customer app is code-split away from the landing page.
 *
 * Everything below was imported eagerly, so a first-time visitor who only
 * wanted to read the menu downloaded the meal picker, the live tracking map,
 * the Google Maps loader and the Razorpay subscription flow before the hero
 * image had painted — roughly 130 KB of source they had no route to.
 *
 * Split at the guard rather than per page: these six always load behind a
 * sign-in, so they share a boundary naturally, and a visitor who never signs
 * in never pays for any of it.
 */
const AppShell = lazy(() => import('./components/app/AppShell'));
const HomePage = lazy(() => import('./pages/HomePage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const DietPlansPage = lazy(() => import('./pages/DietPlansPage'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

/** Matches ProtectedRoute's spinner, so a chunk load is not a visual jump. */
function RouteFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-brand-offwhite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
    </div>
  );
}


/**
 * Public landing page.
 *
 * ComingSoon and the store-badge block are gone: the website is the product
 * now, not an advert for an app that has not shipped. Everything else here is
 * unchanged and still works — the marketing sections, the live menu, the
 * checkout modal and order tracking all behave exactly as before for a
 * visitor who has not signed in.
 */
function Landing() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [placed, setPlaced] = useState(null);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F8F5EE] text-brand-dark selection:bg-brand-secondary/35 selection:text-brand-primary">
      <Navbar onTrackOrder={() => setTrackingOpen(true)} />

      <Hero />
      <About />
      <SignatureDishes />
      <Features />
      <HowItWorks />
      <Showcase />

      <Footer onOpenHelp={() => setHelpOpen(true)} />

      <CartBar onOpen={() => setCheckoutOpen(true)} />

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onPlaced={(result) => { setCheckoutOpen(false); setPlaced(result); }}
      />

      <OrderPlaced
        result={placed}
        onTrack={() => { setPlaced(null); setTrackingOpen(true); }}
        onClose={() => setPlaced(null)}
      />

      <OrderTracking open={trackingOpen} onClose={() => setTrackingOpen(false)} />
      <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

/**
 * Sends an already-signed-in visitor from the landing page into the app.
 *
 * Waits for `loading` to resolve first. Redirecting on `isSignedIn` alone
 * would flash the marketing page on every refresh, because AuthContext has not
 * yet heard back from onAuthStateChanged at first paint.
 */
function LandingOrApp() {
  const { isSignedIn, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-brand-offwhite">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
      </div>
    );
  }
  return isSignedIn ? <Navigate to="/home" replace /> : <Landing />;
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        {/*
          Opting in to the v7 behaviours now.

          Both warnings describe changes React Router will make by default in
          v7: state updates wrapped in React.startTransition, and relative
          route resolution inside splat routes. Enabling them here means the
          eventual upgrade is a version bump rather than a debugging session,
          and it silences two warnings that otherwise sit in the console making
          real errors harder to notice.
        */}
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/" element={<LandingOrApp />} />

            {/* Customer app. One guard on the layout rather than one per
                child — a route added later inherits protection instead of
                needing somebody to remember to wrap it. */}
            <Route
              element={
                <ProtectedRoute>
                  <Suspense fallback={<RouteFallback />}>
                    <AppShell />
                  </Suspense>
                </ProtectedRoute>
              }
            >
              <Route path="/home" element={<HomePage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/diet-plans" element={<DietPlansPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/subscriptions" element={<SubscriptionsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>

            {/* Unknown paths go home rather than to a blank screen. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          {/* Outside <Routes> so it shows on the landing page and inside the
              app alike — consent is not a per-page concern. */}
          <CookieConsent />
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}
