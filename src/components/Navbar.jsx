import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '../assets/logo.webp';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  const navLinks = [
    { name: 'Home', href: '#home' },
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

            <span 
              className="text-2xl lg:text-3xl text-brand-secondary tracking-wide select-none font-bold italic"
              style={{ fontFamily: "'Kaushan Script', cursive" }}
            >
              Coming Soon
            </span>
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
              <div className="pt-4 border-t border-white/10 w-full flex justify-center">
                <span 
                  className="text-2xl text-brand-secondary tracking-wide select-none font-bold italic"
                  style={{ fontFamily: "'Kaushan Script', cursive" }}
                >
                  Coming Soon
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
