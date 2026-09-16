import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Receipt, LogIn, LogOut, UserRound, ChevronDown } from 'lucide-react';
import logo from '../assets/logo.webp';
// import AuthModal from './AuthModal';
// import { useAuth } from '../context/AuthContext';
import { GooglePlayButton, AppStoreButton } from '../common/AppStoreBadges';

const Navbar = ({ onTrackOrder }) => {
  // Login / auth features commented out as requested. Official site is showcase only.
  // const { isSignedIn, profile, user, signOut } = useAuth();
  // const [authOpen, setAuthOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // const [profileOpen, setProfileOpen] = useState(false);
  // const profileRef = useRef(null);

  // Close the profile menu on an outside click or Escape (commented out with auth)
  /*
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
  */

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

  /**
   * Scroll to a section, allowing for the fixed header.
   *
   * The browser's own anchor jump was unreliable on mobile. Tapping a link
   * closed the menu, and the menu closes with a height animation — so the
   * document shrank by a couple of hundred pixels while the browser was
   * still scrolling to the target. The scroll landed somewhere else, or was
   * abandoned, and it read as "the link does nothing".
   *
   * Doing it by hand also fixes the quieter half of the bug: a native anchor
   * jump puts the section's top edge at y=0, which is underneath the fixed
   * navbar, so the heading was hidden even when the scroll did work.
   *
   * Non-hash links (the privacy policy) fall through to normal navigation.
   */
  const goToSection = (href) => (e) => {
    if (!href.startsWith('#')) return;      // real page — let the browser go
    const el = document.querySelector(href);
    if (!el) return;                        // no such section; don't swallow

    e.preventDefault();
    setMobileMenuOpen(false);

    // One frame after the menu starts closing, so the measurement below is
    // taken against a layout that is no longer mid-collapse.
    requestAnimationFrame(() => {
      const header = 84;                    // fixed navbar height + breathing room
      const top = el.getBoundingClientRect().top + window.scrollY - header;
      window.scrollTo({ top, behavior: 'smooth' });
      // Keeps the URL shareable without triggering a second, competing jump.
      history.replaceState(null, '', href);
    });
  };

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
                  onClick={goToSection(link.href)}
                  className="font-sans font-bold text-lg md:text-xl lg:text-2xl text-white hover:text-brand-secondary transition-colors duration-300"
                >
                  {link.name}
                </a>
              ))}
            </div>

            <span className="text-white/40 select-none text-xl lg:text-2xl">|</span>

            {/*
              Account / sign-in features commented out as requested.
              Official site is presentation only; orders and accounts are on mobile apps.

              {isSignedIn ? (
                <div className="relative" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen((v) => !v)}
                    className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 font-sans text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20"
                  >
                    ...
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAuthOpen(true)}
                  className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 font-sans text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20"
                >
                  <LogIn className="h-4 w-4" /> Sign in
                </button>
              )}
            */}

            {/* Professional Google Play & Apple App Store download buttons */}
            <div className="flex items-center gap-2.5">
              <GooglePlayButton size="small" />
              <AppStoreButton size="small" />
            </div>
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
                  onClick={goToSection(link.href)}
                  className="font-sans font-bold text-xl text-white hover:text-brand-secondary transition-colors"
                >
                  {link.name}
                </a>
              ))}
              <div className="pt-4 border-t border-white/10 w-full flex flex-col items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-secondary">
                  Download HomBites App
                </p>
                <div className="flex flex-col sm:flex-row gap-2.5 w-full items-center justify-center">
                  <GooglePlayButton size="small" />
                  <AppStoreButton size="small" />
                </div>

                {/*
                  Mobile login and orders commented out:
                  {isSignedIn ? (...) : (...)}
                */}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} /> */}
    </>
  );
};

export default Navbar;
