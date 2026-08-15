import React, { useEffect, useState } from 'react';
import { Cookie, X } from 'lucide-react';
import {
  CATEGORIES, getConsent, hasDecided, acceptAll, rejectNonEssential,
  saveChoices, onConsentChange,
} from '../lib/consent';

/**
 * Cookie consent.
 *
 * Shown once until a choice is made, then reachable again from the footer so a
 * customer can change their mind — a consent record you cannot revisit is not
 * really consent.
 *
 * "Reject" is a real button of equal weight, not a link hidden under an
 * "Accept" the size of a door. If declining is harder than accepting, the
 * consent is not freely given, which defeats the point of asking.
 *
 * Nothing third-party loads before a decision: `hasConsent()` returns false
 * while undecided, and googleMaps.js checks it before injecting the script.
 */
export default function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(false);
  const [choices, setChoices] = useState({
    essential: true, functional: false, analytics: false,
  });

  useEffect(() => {
    if (!hasDecided()) setOpen(true);
    const saved = getConsent();
    if (saved) setChoices(saved);

    // Reopened from the footer via clearConsent(), or decided in another tab.
    return onConsentChange((c) => {
      if (c === null) setOpen(true);
      else { setChoices(c); setOpen(false); setDetail(false); }
    });
  }, []);

  if (!open) return null;

  const toggle = (key) =>
    setChoices((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] p-3 sm:p-5">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-brand-primary/10 bg-white shadow-[0_20px_60px_-20px_rgba(28,28,28,0.45)]">
        <div className="flex items-start gap-3 p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-primary/8">
            <Cookie className="h-5 w-5 text-brand-primary" />
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold text-brand-dark">
              Cookies and site storage
            </h2>
            <p className="mt-1 font-sans text-xs leading-relaxed text-brand-dark/55">
              We keep you signed in and remember your bag — that part is
              essential. Maps and mobile verification load from Google and set
              their own cookies, so those are your choice.
            </p>

            {detail && (
              <div className="mt-4 space-y-2.5">
                {Object.entries(CATEGORIES).map(([key, cat]) => (
                  <label key={key}
                         className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${
                           cat.always
                             ? 'border-brand-primary/10 bg-brand-offwhite/60'
                             : 'border-brand-primary/12 bg-white'}`}>
                    <input
                      type="checkbox"
                      checked={cat.always ? true : Boolean(choices[key])}
                      disabled={cat.always}
                      onChange={() => toggle(key)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#0B4D3B] disabled:opacity-50"
                    />
                    <span className="min-w-0">
                      <span className="block font-sans text-xs font-bold text-brand-dark">
                        {cat.label}
                        {cat.always && (
                          <span className="ml-2 font-normal text-brand-dark/35">
                            always on
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block font-sans text-[11px] leading-relaxed text-brand-dark/45">
                        {cat.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={acceptAll}
                className="flex-1 rounded-2xl bg-brand-primary px-5 py-3 font-display text-sm font-bold text-white transition-transform active:scale-[0.98] sm:flex-none"
              >
                Accept all
              </button>

              {/* Same size and shape as Accept. A reject that looks like a
                  footnote is not a real choice. */}
              <button
                onClick={rejectNonEssential}
                className="flex-1 rounded-2xl border border-brand-primary/20 px-5 py-3 font-display text-sm font-bold text-brand-primary transition-colors hover:bg-brand-primary/5 sm:flex-none"
              >
                Essential only
              </button>

              {detail ? (
                <button
                  onClick={() => saveChoices(choices)}
                  className="flex-1 rounded-2xl border border-brand-primary/20 px-5 py-3 font-sans text-sm font-bold text-brand-dark/60 sm:flex-none"
                >
                  Save choices
                </button>
              ) : (
                <button
                  onClick={() => setDetail(true)}
                  className="flex-1 px-2 py-3 font-sans text-sm font-bold text-brand-dark/45 underline sm:flex-none"
                >
                  Choose what to allow
                </button>
              )}
            </div>
          </div>

          {/* Dismiss is deliberately absent until a choice is made: closing
              without deciding would leave the site in an undecided state and
              show the banner again on the next page, which is worse than
              asking once clearly. */}
          {detail && (
            <button onClick={() => setDetail(false)} aria-label="Collapse options"
                    className="shrink-0 rounded-lg p-1 text-brand-dark/25 hover:text-brand-dark/50">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
