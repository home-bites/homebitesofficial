/**
 * Cookie and storage consent.
 *
 * A banner that records a choice and changes nothing is worse than no banner —
 * it tells the customer they have a say while the same third parties load
 * regardless. So this module is the gate, not the decoration: `googleMaps.js`
 * and the phone-verification reCAPTCHA both check `hasConsent('functional')`
 * before loading anything from Google.
 *
 * Three categories, deliberately few:
 *
 *   essential  — always on, cannot be declined. Sign-in session, the cart, the
 *                consent record itself. Without these the site does not work,
 *                so offering a choice would be dishonest.
 *   functional — Google Maps for address picking, reCAPTCHA for phone
 *                verification. Declining means those features ask for consent
 *                at the point of use rather than silently failing.
 *   analytics  — nothing uses this yet. Present so that adding analytics later
 *                is a config change rather than a new consent conversation,
 *                and it defaults to off.
 *
 * Stored in localStorage rather than a cookie. The irony is deliberate: a
 * consent record does not need to travel to a server on every request, and
 * localStorage is not sent with them.
 */

const KEY = 'homebites.consent.v1';

/** Bump when the categories change, so old consent is re-asked rather than assumed. */
export const CONSENT_VERSION = 1;

export const CATEGORIES = {
  essential: {
    label: 'Essential',
    always: true,
    description:
      'Keeps you signed in, remembers your bag, and stores this choice. '
      + 'The site cannot work without these.',
  },
  functional: {
    label: 'Maps and verification',
    always: false,
    description:
      'Google Maps for picking your delivery pin, and reCAPTCHA when you verify '
      + 'your mobile number. Both are loaded from Google and set their own cookies.',
  },
  analytics: {
    label: 'Analytics',
    always: false,
    description:
      'Not currently used. If we ever add anonymous usage measurement, this is '
      + 'the switch that controls it.',
  },
};

const DEFAULTS = { essential: true, functional: false, analytics: false };

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // A record from an older category set is treated as absent, so the
    // customer is asked again rather than having a stale choice applied to
    // categories they never saw.
    if (parsed?.version !== CONSENT_VERSION) return null;
    return { ...DEFAULTS, ...parsed.choices, essential: true };
  } catch {
    return null;
  }
}

function write(choices) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      version: CONSENT_VERSION,
      decidedAt: new Date().toISOString(),
      choices: { ...choices, essential: true },
    }));
  } catch { /* private mode — the session still works, consent just is not remembered */ }
  // Same-tab listeners: the storage event only fires in *other* tabs.
  window.dispatchEvent(new CustomEvent('homebites:consent'));
}

/** Null when the customer has not decided yet. */
export function getConsent() {
  return read();
}

export function hasDecided() {
  return read() !== null;
}

/**
 * Whether a category may run.
 *
 * Returns false when no decision has been made, so nothing third-party loads
 * before the customer has been asked. Essential is the exception and is always
 * true — it is what makes the site function at all.
 */
export function hasConsent(category) {
  if (category === 'essential') return true;
  const c = read();
  return c ? Boolean(c[category]) : false;
}

export function acceptAll() {
  write({ essential: true, functional: true, analytics: true });
}

export function rejectNonEssential() {
  write({ essential: true, functional: false, analytics: false });
}

export function saveChoices(choices) {
  write(choices);
}

/** Lets a customer re-open the dialog from the footer or profile. */
export function clearConsent() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent('homebites:consent'));
}

/** Subscribe to changes — fires for this tab and for others. */
export function onConsentChange(fn) {
  const local = () => fn(read());
  const cross = (e) => { if (e.key === KEY) fn(read()); };
  window.addEventListener('homebites:consent', local);
  window.addEventListener('storage', cross);
  return () => {
    window.removeEventListener('homebites:consent', local);
    window.removeEventListener('storage', cross);
  };
}
