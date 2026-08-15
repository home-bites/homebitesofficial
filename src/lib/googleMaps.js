/**
 * Loads the Google Maps JavaScript API on demand.
 *
 * Loaded lazily rather than from a <script> tag in index.html so the cost —
 * and the billed map load — only falls on customers who actually open the
 * picker. Most accept the GPS fix and never see a map.
 *
 * Uses the `callback` parameter rather than `importLibrary`. The inline
 * bootstrap snippet in Google's docs defines `google.maps.importLibrary`
 * itself; loading the plain script URL does not, so calling it threw
 * "importLibrary is not a function". The callback fires once the core API —
 * including google.maps.Map — is ready, and works on every version.
 *
 * Resolves false instead of throwing, so the caller can fall back to the
 * coordinate box rather than dead-end the checkout.
 */

import { hasConsent } from './consent';

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

/** False when no key is configured, so callers can hide the map entirely. */
export const MAPS_ENABLED = Boolean(KEY);

/**
 * Give up after this long. Without it, a key blocked by referrer restrictions
 * or an extension leaves the picker spinning with no explanation — the script
 * tag never fires load *or* error, so nothing resolves.
 */
const LOAD_TIMEOUT_MS = 15000;

const CALLBACK = '__hbGoogleMapsReady';

let pending = null;

export function loadGoogleMaps() {
  // The consent banner is not decoration: declining "Maps and verification"
  // must actually stop Google's script loading, or the choice meant nothing.
  // Callers already handle a false result by explaining rather than hanging.
  if (!hasConsent('functional')) {
    console.info('[maps] not loaded — no consent for functional cookies');
    return Promise.resolve(false);
  }

  if (typeof window === 'undefined') return Promise.resolve(false);
  if (!KEY) return Promise.resolve(false);
  if (window.google?.maps?.Map) return Promise.resolve(true);
  if (pending) return pending;

  pending = new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (!ok) pending = null;   // allow a retry on the next open
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), LOAD_TIMEOUT_MS);

    window[CALLBACK] = () => {
      clearTimeout(timer);
      finish(Boolean(window.google?.maps?.Map));
    };

    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}`
      + `&v=weekly&loading=async&callback=${CALLBACK}`;
    script.async = true;
    script.defer = true;
    script.dataset.hbMaps = '1';
    script.onerror = () => { clearTimeout(timer); finish(false); };
    document.head.appendChild(script);
  });

  return pending;
}
