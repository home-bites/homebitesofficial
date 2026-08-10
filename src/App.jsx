import React, { useState } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import About from './components/About';
import SignatureDishes from './components/SignatureDishes';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import Showcase from './components/Showcase';
import ComingSoon from './components/ComingSoon';
import Footer from './components/Footer';
import CartBar from './components/CartBar';
import CheckoutModal, { OrderPlaced } from './components/CheckoutModal';
import OrderTracking from './components/OrderTracking';
import HelpCenter from './components/HelpCenter';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

function Site() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [placed, setPlaced] = useState(null);

  return (
    <div className="bg-[#F8F5EE] min-h-screen text-brand-dark overflow-x-hidden selection:bg-brand-secondary/35 selection:text-brand-primary">
      <Navbar onTrackOrder={() => setTrackingOpen(true)} />

      <Hero />
      <About />

      {/* Ordering: live menu straight from Firestore */}
      <SignatureDishes />

      <Features />
      <HowItWorks />
      <Showcase />
      <ComingSoon />

      <Footer onOpenHelp={() => setHelpOpen(true)} />

      {/* Sticky bag summary — only rendered once something is in the cart */}
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

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <Site />
      </CartProvider>
    </AuthProvider>
  );
}
