import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Receipt, LogIn, LogOut, UserRound, ChevronDown } from 'lucide-react';
import logo from '../assets/logo.webp';
import AuthModal from './AuthModal';
import { useAuth } from '../context/AuthContext';

const Navbar = ({ onTrackOrder }) => {
  const { isSignedIn, profile, user, signOut } = useAuth();
  // The sign-in dialog. This button used to call signInWithGoogle directly,
  // which skipped the choice entirely and jumped to the Google account
  // chooser — leaving no way to use an email and password.
  const [authOpen, setAuthOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // Close the profile menu on an outside click or Escape. Without this it
  // stays open behind the checkout sheet and intercepts taps.
  useEffect(() => {
    if (!profileOpen) return;
    const onDown = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Privacy is a real page, not an on-page anchor: Google Play requires the
  // policy to be reachable at its own publicly accessible URL. A plain <a>
  // handles both cases, so no special casing is needed in the render.
  //
  // Account deletion deliberately does NOT live here any more. A destructive,
  // irreversible action sitting between "About" and "Privacy" is one mis-tap
  // from disaster. It moved into the Help Centre in the footer, behind an
  // explicit confirmation — still reachable from the site without installing
  // the app, which is what Google Play actually requires.
  const navLinks = [
    { name: 'Home', href: '#home' },
    { name: 'Menu', href: '#menu' },
    { name: 'About', href: '#about' },
    { name: 'Contact', href: '#contact' },
    { name: 'Privacy', href: '/privacy-policy.html' },
  ];

  return (
    <>
      <motion.nav
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 ${isScrolled
            ? 'glass-nav py-4 shadow-lg'
            : 'bg-transparent py-6'
          }`}
      >
        <div className="w-full px-8 md:px-12 flex items-center justify-between">
          {/* Left: HomeBites Logo */}
          <a href="#home" className="flex items-center gap-2 group flex-shrink-0">
            <img
              src={logo}
              alt="HomeBites Logo"
              className={`transition-all duration-300 object-contain group-hover:scale-105 ${
                isScrolled ? 'h-12 md:h-28' : 'h-16 md:h-44'
              } w-auto`}
              onError={(e) => {
                e.target.style.display = 'none';
                document.getElementById('fallback-logo').style.display = 'block';
              }}
            />
            <div id="fallback-logo" className="hidden font-display text-2xl font-bold tracking-tight text-white">
              Home<span className="text-brand-accent">Bites</span>
            </div>
          </a>

          {/* Right: Navigation Links & Coming Soon */}
          <div className="hidden md:flex items-center gap-8 lg:gap-10">
            <div className="flex items-center gap-6 lg:gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="font-sans font-bold text-lg md:text-xl lg:text-2xl text-white hover:text-brand-secondary transition-colors duration-300"
                >
                  {link.name}
                </a>
              ))}
            </div>

            <span className="text-white/40 select-none text-xl lg:text-2xl">|</span>

            {/* Account / orders. Signing in here creates the same Firebase
                account the mobile app will use, so nothing is lost at launch. */}
            {isSignedIn ? (
              /* Profile menu. Signing out used to be impossible from the site —
                 once you'd signed in with Google there was no way back out,
                 which matters on a shared or borrowed device. */
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2
                             font-sans text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20"
                >
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <UserRound className="h-4 w-4" />
                  )}
                  <span className="max-w-[7rem] truncate">
                    {(profile?.firstName || user?.displayName || 'Account').split(' ')[0]}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${profileOpen ? 'rotate-180' : ''}`} />
                </button>

                {profileOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border
                               border-brand-primary/10 bg-white shadow-2xl"
                  >
                    <div className="border-b border-brand-primary/10 px-4 py-3">
                      <p className="truncate font-sans text-sm font-bold text-brand-dark">
                        {profile?.name || user?.displayName || 'Signed in'}
                      </p>
                      {user?.email && (
                        <p className="truncate font-sans text-xs text-brand-dark/50">{user.email}</p>
                      )}
                    </div>

                    <button
                      role="menuitem"
                      onClick={() => { setProfileOpen(false); onTrackOrder?.(); }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left font-sans text-sm
                                 font-semibold text-brand-dark transition hover:bg-brand-offwhite"
                    >
                      <Receipt className="h-4 w-4 text-brand-primary" /> Track my orders
                    </button>

                    <button
                      role="menuitem"
                      onClick={() => { setProfileOpen(false); signOut(); }}
                      className="flex w-full items-center gap-3 border-t border-brand-primary/10 px-4 py-3
                                 text-left font-sans text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2
                           font-sans text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                <LogIn className="h-4 w-4" /> Sign in
              </button>
            )}
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex md:hidden text-white hover:text-brand-secondary focus:outline-none transition-colors"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            )}
          </button>
        </div>
      </motion.nav>

      {/* Mobile Menu Panel */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed top-[72px] left-0 w-full z-40 bg-brand-primary/95 backdrop-blur-xl border-b border-white/10 md:hidden overflow-hidden"
          >
            <div className="px-6 py-8 flex flex-col gap-6 items-center">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="font-sans font-bold text-xl text-white hover:text-brand-secondary transition-colors"
                >
                  {link.name}
                </a>
              ))}
              <div className="pt-4 border-t border-white/10 w-full flex flex-col items-center gap-3">
                {isSignedIn ? (
                  <>
                    <button
                      onClick={() => { setMobileMenuOpen(false); onTrackOrder?.(); }}
                      className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-2.5
                                 font-sans text-base font-bold text-white"
                    >
                      <Receipt className="h-4 w-4" /> Track my orders
                    </button>
                    {/* Sign out has to be reachable on mobile too — the
                        desktop dropdown doesn't render at this breakpoint. */}
                    <button
                      onClick={() => { setMobileMenuOpen(false); signOut(); }}
                      className="flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5
                                 font-sans text-base font-bold text-white/80"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setMobileMenuOpen(false); setAuthOpen(true); }}
                    className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-2.5
                               font-sans text-base font-bold text-white"
                  >
                    <LogIn className="h-4 w-4" /> Sign in
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
};

export default Navbar;
