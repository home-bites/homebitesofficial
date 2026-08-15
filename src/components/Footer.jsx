import React from 'react';
import { LifeBuoy } from 'lucide-react';
import logo from '../assets/logo.webp';
import Container from '../common/Container';

// Same source of truth as the Help Centre, overridable from .env.
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@hombites.com';
const SUPPORT_PHONE = String(import.meta.env.VITE_SUPPORT_PHONE || '8184877798')
  .replace(/\D/g, '').slice(-10);

import { clearConsent } from '../lib/consent';

const Footer = ({ onOpenHelp }) => {
  const quickLinks = [
    { name: 'Home', href: '#home' },
    { name: 'Menu', href: '#menu' },
    { name: 'About', href: '#about' },
    { name: 'Contact', href: '#contact' },
    { name: 'Privacy Policy', href: '/privacy-policy.html' },
  ];

  // Social Icons using simple crisp SVG shapes
  const socials = [
    {
      name: 'Facebook',
      href: '#',
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/>
        </svg>
      )
    },
    {
      name: 'Instagram',
      href: '#',
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      )
    },
    {
      name: 'Twitter',
      href: '#',
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
        </svg>
      )
    },
    {
      name: 'YouTube',
      href: '#',
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M23.498 6.163c-.272-1.016-1.074-1.819-2.09-2.09C19.56 3.73 12 3.73 12 3.73s-7.56 0-9.408.343c-1.016.271-1.819 1.074-2.09 2.09C.143 8.01.143 12 .143 12s0 3.99.343 5.837c.271 1.016 1.074 1.819 2.09 2.09C4.44 20.27 12 20.27 12 20.27s7.56 0 9.408-.343c1.016-.271 1.819-1.074 2.09-2.09.343-1.847.343-5.837.343-5.837s0-3.99-.343-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      )
    }
  ];

  return (
    <footer className="bg-[#06261E] border-t border-white/5 py-16 text-brand-offwhite">
      <Container>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8 items-start mb-12">
          
          {/* Left Column: Brand & Tagline */}
          <div className="col-span-1 md:col-span-6 flex flex-col items-start text-left">
            <a href="#home" className="flex items-center gap-2 mb-4 group">
              <img 
                src={logo} 
                alt="HomeBites Logo" 
                className="h-16 md:h-20 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  e.target.style.display = 'none';
                  document.getElementById('footer-fallback-logo').style.display = 'block';
                }}
              />
              <div id="footer-fallback-logo" className="hidden font-display text-2xl font-bold tracking-tight text-white">
                Home<span className="text-brand-accent">Bites</span>
              </div>
            </a>
            <p className="text-xs md:text-sm text-brand-offwhite/60 leading-relaxed font-sans max-w-sm mb-6">
              HomeBites is your premier platform for delicious meals cooked from the best local kitchens and delivered directly to your doorstep.
            </p>
            <p className="text-xs uppercase tracking-widest text-brand-secondary font-bold font-display mb-6">
              Food for Every Lifestyle
            </p>

            {/* Contact. Kept as real tel:/mailto: links so a phone dials and a
                desktop opens the mail client — a customer chasing an order
                shouldn't have to copy digits by hand. */}
            <div className="flex flex-col items-start gap-2 font-sans">
              <a
                href={`tel:+91${SUPPORT_PHONE}`}
                className="text-xs md:text-sm text-brand-offwhite/70 hover:text-brand-secondary transition-colors"
              >
                +91 {SUPPORT_PHONE.slice(0, 5)} {SUPPORT_PHONE.slice(5)}
              </a>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-xs md:text-sm text-brand-offwhite/70 hover:text-brand-secondary transition-colors"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>

          {/* Middle Column: Quick Links */}
          <div className="col-span-1 md:col-span-3 flex flex-col items-start text-left">
            <h4 className="font-display font-bold text-sm tracking-wider uppercase text-white mb-4">
              Company
            </h4>
            <div className="flex flex-col items-start gap-3">
              {quickLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="text-xs md:text-sm text-brand-offwhite/70 hover:text-brand-secondary transition-colors font-sans"
                >
                  {link.name}
                </a>
              ))}

              {/* Account deletion moved out of the navbar and lives inside the
                  Help Centre. Google Play requires the deletion route to be
                  reachable from the site without installing the app — it is,
                  it's just one deliberate tap deeper than a nav link. */}
              <button
                onClick={onOpenHelp}
                className="mt-1 inline-flex items-center gap-2 rounded-lg border border-brand-secondary/40
                           bg-brand-secondary/10 px-3 py-2 text-xs md:text-sm font-bold text-brand-secondary
                           transition-colors hover:bg-brand-secondary hover:text-brand-primary font-sans"
              >
                <LifeBuoy className="h-4 w-4" />
                Help Centre
              </button>
              <span className="text-[10px] text-brand-offwhite/35 font-sans leading-relaxed max-w-[14rem]">
                Support, order queries and account deletion
              </span>
            </div>
          </div>

          {/* Right Column: Social Media */}
          <div className="col-span-1 md:col-span-3 flex flex-col items-start text-left">
            <h4 className="font-display font-bold text-sm tracking-wider uppercase text-white mb-4">
              Follow Us
            </h4>
            <p className="text-xs text-brand-offwhite/60 mb-4 font-sans leading-relaxed">
              Stay updated with our launch and beta program updates.
            </p>
            <div className="flex items-center gap-4">
              {socials.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  className="w-10 h-10 rounded-xl bg-white/5 hover:bg-brand-secondary hover:text-brand-primary flex items-center justify-center text-brand-offwhite/80 transition-all duration-300 shadow-md"
                  aria-label={social.name}
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>

        </div>

        {/* Divider & Copyright */}
        <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <p className="text-xs text-brand-offwhite/40 font-sans">
            © 2026 HomeBites. All rights reserved.
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-xs text-brand-offwhite/40 font-sans">
            <a href="/privacy-policy.html" className="hover:text-white transition-colors">Privacy Policy</a>
            <button onClick={onOpenHelp} className="hover:text-white transition-colors">Help &amp; Account Deletion</button>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            {/* Reopens the consent dialog. A choice a customer cannot revisit
                is not really consent — clearConsent() removes the stored
                record, and CookieConsent listens for that and shows itself. */}
            <button
              onClick={clearConsent}
              className="hover:text-white transition-colors"
            >
              Cookie preferences
            </button>
          </div>
        </div>

      </Container>
    </footer>
  );
};

export default Footer;
