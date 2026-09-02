/**
 * What counts as a usable delivery location, for the website.
 *
 * The mirror of `customer_app/lib/core/location_policy.dart`. The two files
 * hold the same numbers on purpose and must be changed together — the whole
 * reason this file exists is that the three surfaces had drifted apart:
 *
 *  - this site rejected anything coarser than 150 m,
 *  - the app's add-address screen warned above 100 m and saved anyway,
 *  - the app's shared location service used `LocationAccuracy.high` with no
 *    time limit and no accuracy check whatsoever.
 *
 * The site's behaviour was the correct one, so it is what both now follow.
 *
 * | Accuracy            | Outcome                                            |
 * |---------------------|----------------------------------------------------|
 * | <= 50 m             | accept silently                                    |
 * | 50 m - 150 m        | usable only once the customer confirms the pin     |
 * | > 150 m, or unknown | reject: move outdoors and retry, or drop a pin      |
 *
 * A pin the customer placed by hand is always acceptable. It carries no
 * measurement error to judge — it is a statement of intent, and it is usually
 * better than a device fix taken indoors.
 */

/** Accept a fix this good without asking the customer anything. */
export const ACCEPT_METRES = 50;

/**
 * Usable up to here, but only after the customer confirms the pin on a map.
 * Anything coarser is refused. This was the site's existing
 * `ACCURACY_LIMIT_M`, kept identical so no customer's behaviour changes at the
 * top end while the app catches up.
 */
export const CONFIRM_METRES = 150;

/**
 * Give up on `getCurrentPosition` after this long.
 *
 * A high-accuracy request indoors can hang until the tab is closed. Failing
 * with something the customer can act on beats an indefinite spinner.
 */
export const TIMEOUT_MS = 15000;

/** The `locationSource` values written onto orders. Mirrors the Dart enum. */
export const LOCATION_SOURCE = {
  GPS: 'gps',
  CUSTOMER_MAPS_PIN: 'customer_maps_pin',
  BROWSER_GEOLOCATION: 'browser_geolocation',
  TAKEAWAY: 'takeaway',
};

/** The three verdicts. String values, so they can be logged and stored as-is. */
export const QUALITY = {
  GOOD: 'good',
  NEEDS_CONFIRMATION: 'needs_confirmation',
  TOO_COARSE: 'too_coarse',
};

/**
 * Places a reported accuracy radius into one of the three tiers.
 *
 * A missing, non-finite or negative radius is `too_coarse`, not "probably
 * fine". An unknown error is exactly the case that used to sail through
 * unchecked, and the manual pin is always available as the way out.
 *
 * @param {number|null|undefined} metres
 * @returns {'good'|'needs_confirmation'|'too_coarse'}
 */
export function classifyAccuracy(metres) {
  if (typeof metres !== 'number' || !Number.isFinite(metres) || metres < 0) {
    return QUALITY.TOO_COARSE;
  }
  if (metres <= ACCEPT_METRES) return QUALITY.GOOD;
  if (metres <= CONFIRM_METRES) return QUALITY.NEEDS_CONFIRMATION;
  return QUALITY.TOO_COARSE;
}

/**
 * Customer-facing copy for a verdict, kept here so the checkout modal and the
 * app cannot describe the same situation in two different ways.
 *
 * @param {'good'|'needs_confirmation'|'too_coarse'} quality
 * @param {number|null|undefined} metres
 * @returns {string}
 */
export function messageForQuality(quality, metres) {
  const rounded = (typeof metres === 'number' && Number.isFinite(metres) && metres >= 0)
    ? `${Math.round(metres)} m`
    : 'an unknown distance';

  if (quality === QUALITY.GOOD) return 'Location confirmed.';
  if (quality === QUALITY.NEEDS_CONFIRMATION) {
    return `That fix is accurate to about ${rounded}. Move the map so the pin `
      + 'sits on your door, then confirm it.';
  }
  return `That fix is only accurate to about ${rounded}, which is too rough for `
    + 'the rider to find you. Step outside or near a window and try again, or '
    + 'place the pin on your door yourself.';
}

/**
 * Asks the browser where the visitor is, under the shared policy.
 *
 * Three options matter and all three are set deliberately:
 *
 *  - `enableHighAccuracy: true` — without it the browser is free to answer
 *    from Wi-Fi or the IP address, which is how a 20 km "fix" that looks
 *    perfectly successful ends up pointing a rider at a cell tower.
 *  - `maximumAge: 0` — never reuse a cached position. A cached fix can be from
 *    the customer's office an hour ago, and it arrives instantly, so nothing
 *    on screen suggests anything is wrong.
 *  - `timeout: TIMEOUT_MS` — matches the app's 15 s limit.
 *
 * Resolves rather than rejects: a refused permission is an ordinary outcome of
 * asking a browser where it is, not an exception.
 *
 * @returns {Promise<{ok: boolean, lat?: number, lng?: number, accuracy?: number,
 *   source?: string, quality?: string, error?: string}>}
 */
export function getBrowserFix() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({
        ok: false,
        error: 'Your browser cannot share your location. Place the pin on your '
             + 'door instead.',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const accuracy = pos.coords.accuracy;
        resolve({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy,
          source: LOCATION_SOURCE.BROWSER_GEOLOCATION,
          quality: classifyAccuracy(accuracy),
        });
      },
      (err) => {
        const error = err.code === err.PERMISSION_DENIED
          ? 'Location permission was denied. Place the pin on your door instead.'
          : err.code === err.TIMEOUT
            ? 'Getting your location took too long. Step outside or near a '
              + 'window and try again, or place the pin on your door instead.'
            : 'Could not get your location. Place the pin on your door instead.';
        resolve({ ok: false, error });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: TIMEOUT_MS },
    );
  });
}

/**
 * A pin the customer placed themselves, in the same shape as a device fix.
 *
 * Always `good`: there is no measurement error to judge, and second-guessing a
 * pin somebody dragged onto their own front door with a GPS reading taken from
 * their sofa would be exactly backwards.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {{ok: true, lat: number, lng: number, accuracy: null, source: string, quality: string}}
 */
export function manualPinFix(lat, lng) {
  return {
    ok: true,
    lat,
    lng,
    accuracy: null,
    source: LOCATION_SOURCE.CUSTOMER_MAPS_PIN,
    quality: QUALITY.GOOD,
  };
}
