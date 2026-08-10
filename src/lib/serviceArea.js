/**
 * Delivery coverage — Guntur city only.
 *
 * Two independent gates, because each catches what the other misses:
 *
 *   1. PINCODE. Always applied. Cheap, needs no API key, works offline, and
 *      catches the common case of someone in another city typing a real
 *      address. Weak on its own: a pincode can be typed without living there.
 *
 *   2. COORDINATES. Applied when the customer shares their location. Checked
 *      against the same `serviceAreas` documents the mobile app uses, with the
 *      same haversine maths, so web and app agree on where you deliver. This
 *      is also what makes the server-side guard work — see the note below.
 *
 * SERVER SIDE: `onOrderCreatedValidateArea` in functions/index.js reads
 * `deliveryLatitude` / `latitude` / `deliveryAddress.latitude`. If none are
 * finite it returns early and accepts the order unchecked — an escape hatch
 * meant for takeaway. An order written without coordinates therefore bypasses
 * coverage entirely, which is why the checkout writes them under exactly those
 * field names whenever it has them.
 */
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

/** Guntur city centre — same constants the Flutter app uses. */
export const GUNTUR_CENTER = { lat: 16.3067, lng: 80.4365 };

/** Fallback radius when `serviceAreas` is empty or unreachable. */
export const FALLBACK_RADIUS_KM = Number(import.meta.env.VITE_SERVICE_RADIUS_KM ?? 15);

/**
 * Guntur delivery pincodes, confirmed by the business.
 *
 * Override without touching code via VITE_ALLOWED_PINCODES in `.env`.
 *
 * An earlier version of this list was assembled from public sources and was
 * wrong in both directions: it invented 522005 / 522018 / 522019 / 522020,
 * which would have accepted undeliverable orders, and it omitted 522008,
 * 522009 and 522509, which would have turned real customers away.
 */
const DEFAULT_PINCODES = [
  '522001',
  '522002',
  '522003',
  '522004',
  '522006',
  '522007',
  '522008',
  '522009', // Perecherla
  '522017',
  '522034',
  '522236', // Tadikonda side
  '522509', // Pedakakani side
];

export const ALLOWED_PINCODES = new Set(
  (import.meta.env.VITE_ALLOWED_PINCODES
    ? String(import.meta.env.VITE_ALLOWED_PINCODES).split(',')
    : DEFAULT_PINCODES
  ).map((p) => p.trim()).filter(Boolean),
);

export const SERVICE_CITY = import.meta.env.VITE_SERVICE_CITY || 'Guntur';

/** Great-circle distance in km. Mirrors ServiceArea.haversineKm in Dart. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* ── pincode gate ─────────────────────────────────────────────────────── */

/**
 * @returns {{ok: boolean, error?: string}}
 */
export function checkPincode(pincode) {
  const p = String(pincode || '').trim();
  if (!/^[1-9]\d{5}$/.test(p)) {
    return { ok: false, error: 'Include a valid 6-digit pincode in your address.' };
  }
  if (!ALLOWED_PINCODES.has(p)) {
    return {
      ok: false,
      error: `Sorry — we only deliver within ${SERVICE_CITY} city right now. `
           + `Pincode ${p} is outside our delivery area.`,
    };
  }
  return { ok: true };
}

/* ── coordinate gate ──────────────────────────────────────────────────── */

let areaCache = null;

/**
 * Loads the admin-managed zones. Cached for the session: coverage changes
 * rarely and this sits in the ordering path.
 *
 * Customers can read `serviceAreas` but never write it — a customer who could
 * edit coverage could open delivery to an address the kitchen can't reach.
 */
export async function fetchServiceAreas({ force = false } = {}) {
  if (areaCache && !force) return areaCache;
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, 'serviceAreas'));
    areaCache = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((a) => a.isActive !== false && Number(a.radiusKm) > 0)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    return areaCache;
  } catch (e) {
    console.error('[serviceArea] load failed', e);
    return [];
  }
}

/**
 * Tests a point against every configured area.
 *
 * When nothing is configured this falls back to a radius around Guntur rather
 * than refusing everyone. An empty collection is a misconfiguration, and
 * telling every customer "we don't deliver here" reads as the business having
 * closed. The same reasoning the Dart repository uses.
 */
export async function checkCoordinates(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: true, unknown: true };  // nothing to test against
  }

  const areas = await fetchServiceAreas();

  if (!areas.length) {
    const km = haversineKm(lat, lng, GUNTUR_CENTER.lat, GUNTUR_CENTER.lng);
    return km <= FALLBACK_RADIUS_KM
      ? { ok: true, areaName: `${SERVICE_CITY} city`, distanceKm: km }
      : {
          ok: false,
          distanceKm: km,
          // Name the places actually served. "We only deliver inside Guntur
          // city" told a customer in Tadikonda they were out of range even
          // though they aren't, because the phrase describes the fallback
          // circle rather than the business's coverage.
          error: `That location is about ${Math.round(km)} km from ${SERVICE_CITY}, `
               + 'which is outside our delivery range. We currently deliver across '
               + `${SERVICE_CITY} city, Tadikonda, Lam and Perecherla.`,
        };
  }

  let covering = null;
  let nearest = null;
  let nearestKm = Infinity;

  for (const a of areas) {
    const km = haversineKm(lat, lng, Number(a.centerLat), Number(a.centerLng));
    if (km < nearestKm) { nearestKm = km; nearest = a; }
    // Closest covering zone wins, so overlapping areas resolve predictably
    // rather than by whichever document loaded first.
    if (km <= Number(a.radiusKm) && (!covering || km < covering._km)) {
      covering = { ...a, _km: km };
    }
  }

  if (covering) {
    return { ok: true, areaId: covering.id, areaName: covering.name || '', distanceKm: covering._km };
  }

  const short = nearest ? Math.ceil(nearestKm - Number(nearest.radiusKm)) : null;
  return {
    ok: false,
    distanceKm: nearestKm,
    error: short && short > 0
      ? `That location is about ${short} km outside our delivery area. `
        + `We currently serve ${nearest?.name || SERVICE_CITY}.`
      : `We don't deliver to that location yet.`,
  };
}

/* ── coordinates from a pasted Google Maps link ───────────────────────── */

/**
 * Pulls a latitude/longitude out of what someone pastes from Google Maps.
 *
 * This exists because GPS is not always right. Inside a building, or on a
 * street the phone places badly, the fix can land on the wrong side of a
 * block — and the customer is the only one who knows. Letting them drop a pin
 * and paste it is the escape hatch.
 *
 * Handles the formats that carry coordinates in the URL:
 *
 *   https://www.google.com/maps?q=16.3067,80.4365
 *   https://maps.google.com/?ll=16.3067,80.4365
 *   https://www.google.com/maps/@16.3067,80.4365,17z
 *   https://www.google.com/maps/place/.../@16.3067,80.4365,17z/...
 *   16.3067, 80.4365
 *
 * Deliberately does NOT handle `maps.app.goo.gl` short links, which are what
 * the mobile Share button produces most often. Resolving one means following
 * a redirect to another origin, which the browser blocks, and quietly
 * failing on the most common input would be worse than saying so. The UI
 * tells people to use "Copy coordinates" instead.
 */
export function parseMapsCoordinates(input) {
  const text = String(input || '').trim();
  if (!text) return { ok: false, error: 'Paste a Google Maps link or coordinates.' };

  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text)) {
    return {
      ok: false,
      error: 'Short Maps links can\'t be read here. In Google Maps, long-press '
           + 'your location, then tap the coordinates at the top to copy them '
           + 'and paste those instead.',
    };
  }

  // Ordered by specificity: `@lat,lng` appears in place URLs that may also
  // contain other number pairs, so it is tried before the bare-pair fallback.
  const patterns = [
    /[?&](?:q|ll|daddr)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { ok: false, error: 'Those coordinates are out of range.' };
    }
    return { ok: true, lat, lng };
  }

  return {
    ok: false,
    error: 'Could not find coordinates in that. Paste a Google Maps link, or '
         + 'the numbers themselves like 16.3067, 80.4365.',
  };
}

/** A link that opens this point in Google Maps, for checking the pin. */
export const mapsLinkFor = (lat, lng) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/* ── browser geolocation ──────────────────────────────────────────────── */

/**
 * Asks the browser for the customer's position.
 *
 * Optional by design. Requiring it would block anyone who denies the prompt —
 * and on a food site that's a meaningful share of people — so the pincode gate
 * stands alone and this only tightens it.
 */
export function getBrowserLocation({ timeout = 12000 } = {}) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ok: false, error: 'Your browser can\'t share location.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        ok: true,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. You can still order using your pincode.'
            : err.code === err.TIMEOUT
              ? 'Getting your location took too long. Please try again.'
              : 'Could not get your location.';
        resolve({ ok: false, error: msg });
      },
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
  });
}
