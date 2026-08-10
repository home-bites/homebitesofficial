/**
 * A small, expiring cache in localStorage.
 *
 * Why not cookies: a cookie is capped at roughly 4 KB and is attached to
 * every request the browser makes to the domain — including images, scripts
 * and the Firestore calls themselves. Caching a menu in cookies would both
 * overflow immediately (dishes carry base64 image data) and make every
 * subsequent request heavier, which is the opposite of the goal.
 * localStorage holds ~5 MB, never touches the network, and reads
 * synchronously so the first paint can use it.
 *
 * Every entry carries a version and a timestamp. The version is bumped
 * whenever the shape of what we store changes, so a browser holding last
 * month's format discards it instead of feeding stale fields into new code.
 */

const PREFIX = 'hb.v1.';

/** localStorage throws in private mode on some browsers, and when disabled. */
function store() {
  try {
    const s = window.localStorage;
    const probe = `${PREFIX}__probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * Read a cached value, or null when absent, expired or unreadable.
 *
 * A cache miss is never an error — the caller always has the network path.
 */
export function readCache(key, { maxAgeMs }) {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + key);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (!at || Date.now() - at > maxAgeMs) {
      s.removeItem(PREFIX + key);
      return null;
    }
    return data;
  } catch {
    // Corrupt entry — drop it rather than letting it fail every load.
    try { s.removeItem(PREFIX + key); } catch { /* nothing left to try */ }
    return null;
  }
}

/**
 * Write a value, silently doing nothing if it won't fit.
 *
 * A failed cache write must never break the page. QuotaExceededError is the
 * expected failure once a menu carries a few base64 images, so it is handled
 * rather than reported: the site simply behaves as it did before caching.
 */
export function writeCache(key, data) {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
    return true;
  } catch {
    // Most likely the quota. Clear our own keys and try once more — stale
    // menu data is worth less than the entry being written now.
    try {
      Object.keys(s)
        .filter((k) => k.startsWith(PREFIX) && k !== PREFIX + key)
        .forEach((k) => s.removeItem(k));
      s.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
      return true;
    } catch {
      return false;
    }
  }
}

export function clearCache(key) {
  const s = store();
  if (!s) return;
  try { s.removeItem(PREFIX + key); } catch { /* nothing to do */ }
}

/** How long each kind of cached data stays usable. */
export const TTL = {
  /**
   * The menu. Short, because a sold-out dish shown for an hour is a refunded
   * order and an unhappy customer. Firestore revalidates within milliseconds
   * of paint anyway — this window only governs the very first frame.
   */
  MENU: 10 * 60 * 1000,

  /**
   * The customer's last confirmed delivery point. Long, because a returning
   * customer ordering to the same address is the common case — but never
   * applied silently; see CheckoutModal.
   */
  LOCATION: 30 * 24 * 60 * 60 * 1000,
};
