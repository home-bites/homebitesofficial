/**
 * The delivery charge rule for the website — a mirror of
 * `functions/lib/deliveryFee.js`.
 *
 * DO NOT EDIT ONE WITHOUT THE OTHER. The website is a Vite bundle and cannot
 * import from the Cloud Functions package, so the rule exists twice. That is
 * a real risk — two copies of a pricing rule is how a customer gets shown one
 * number and charged another — so `functions/__tests__/delivery-fee.test.js`
 * runs both implementations over the same distances and fails if they ever
 * disagree by a single paisa.
 *
 * What the website computes here is a PREVIEW. The charge the customer
 * actually pays is recomputed server-side in `onOrderCreatedVerifyTotals`
 * from the order's own coordinates. This copy exists so the preview is
 * honest, not so the client can decide the price.
 */
/** Defaults, used when the admin has not configured a value. */
export const DELIVERY_FEE_DEFAULTS = Object.freeze({
  baseCharge: 20,
  baseDistanceKm: 3,
  perExtraKm: 8,
});

/** A finite, non-negative number, or the fallback. */
function safeNumber(value, fallback) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Reads the delivery-fee configuration out of an `appSettings/general`
 * document. Missing, blank, negative and NaN values fall back to the default
 * rather than to zero: a settings document with a typo in it must not make
 * delivery free.
 */
export function deliveryFeeConfig(settings) {
  const s = settings || {};
  return {
    baseCharge: safeNumber(s.deliveryBaseCharge, DELIVERY_FEE_DEFAULTS.baseCharge),
    baseDistanceKm: safeNumber(s.deliveryBaseDistanceKm, DELIVERY_FEE_DEFAULTS.baseDistanceKm),
    perExtraKm: safeNumber(s.deliveryPerExtraKm, DELIVERY_FEE_DEFAULTS.perExtraKm),
  };
}

/**
 * The delivery charge for a distance, in rupees.
 *
 * A null/negative/non-finite distance yields the base charge — the same as a
 * delivery inside the base radius. An order with no usable coordinates must
 * not be free, and must not be punished with an invented long distance
 * either.
 */
export function computeDeliveryCharge(distanceKm, config) {
  const c = config && typeof config === 'object' && 'baseCharge' in config
    ? config
    : deliveryFeeConfig(config);

  const d = typeof distanceKm === 'number' ? distanceKm : parseFloat(distanceKm);
  if (!Number.isFinite(d) || d <= c.baseDistanceKm) return round2(c.baseCharge);

  // See the rounding note above: snap before the ceiling so that a distance
  // of exactly 4 km is one extra kilometre and not two.
  const excess = Number((d - c.baseDistanceKm).toFixed(6));
  const extraKm = Math.ceil(excess);
  return round2(c.baseCharge + extraKm * c.perExtraKm);
}

/** Great-circle distance in km. Mirrors haversineKm on the website and
 *  ServiceArea.haversineKm in Dart — all three must stay identical. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function round2(n) {
  return Number(Number(n).toFixed(2));
}

/** A finite coordinate pair, or null. Zero is rejected: `0,0` is the null
 *  island, and in practice it means "no location was recorded". */
function coordsOrNull(lat, lng) {
  const a = typeof lat === 'number' ? lat : parseFloat(lat);
  const b = typeof lng === 'number' ? lng : parseFloat(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === 0 && b === 0) return null;
  return { lat: a, lng: b };
}

/**
 * Pulls the delivery point out of an order document.
 *
 * Reads the same field names `onOrderCreatedValidateArea` accepts, so an
 * order that the area check can validate is an order this can price. Any new
 * spelling must be added to both.
 */
export function orderDeliveryCoords(order) {
  const o = order || {};
  const addr = o.deliveryAddress || {};
  return coordsOrNull(o.deliveryLatitude, o.deliveryLongitude)
    || coordsOrNull(o.latitude, o.longitude)
    || coordsOrNull(addr.latitude, addr.longitude)
    || coordsOrNull(addr.lat, addr.lng);
}

