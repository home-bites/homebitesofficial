import { doc, getDoc, setDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Shared cart between the website and the mobile app.
 *
 * Both now read and write `carts/{uid}`, the document the app's CartProvider
 * has always used. The website previously kept its basket in localStorage
 * alone, so a customer who added three dishes on their phone opened the site to
 * an empty cart and reasonably concluded something was broken.
 *
 * Document shape is fixed by the app's CartModel and must not drift:
 *
 *   { userId, items: [{ menuItemId, name, price, imageUrl, quantity,
 *                       selectedAddons, notes }], subtotal, updatedAt }
 *
 * Firestore rules are `allow read, write: if isOwner(cartId)`, so the document
 * id is the uid — not a generated id. Anything else is denied.
 */

/** Website line ({ item, qty }) -> the app's item shape. */
export function linesToRemote(lines) {
  return Object.values(lines).map(({ item, qty }) => ({
    menuItemId: item.id,
    name: String(item.name || ''),
    price: Number(item.price) || 0,
    imageUrl: String(item.imageUrl || item.image || ''),
    quantity: Number(qty) || 1,
    selectedAddons: [],
    notes: '',
  }));
}

/**
 * App item shape -> website lines.
 *
 * The item object is reconstructed from what the cart document stores, which is
 * a snapshot taken when the dish was added rather than a live menu reference.
 * That is deliberate on the app's side and is preserved here: re-pricing a
 * basket from the current menu would silently change a total the customer had
 * already seen. The checkout re-reads prices anyway.
 */
export function remoteToLines(items) {
  const lines = {};
  (items || []).forEach((it) => {
    const id = String(it.menuItemId || it.itemId || '');
    if (!id) return;
    lines[id] = {
      item: {
        id,
        name: String(it.name || ''),
        price: Number(it.price) || 0,
        imageUrl: String(it.imageUrl || ''),
      },
      qty: Math.max(1, Number(it.quantity) || 1),
    };
  });
  return lines;
}

/** Cheap structural comparison, to stop write→listen→write loops. */
export function sameLines(a, b) {
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  if (ka.length !== kb.length) return false;
  return ka.every((k) => b[k] && b[k].qty === a[k].qty);
}

/**
 * Decides what a customer's cart should be at sign-in.
 *
 * Union, taking the larger quantity per dish — not "newest wins".
 *
 * Whichever side you discard, somebody loses items they deliberately chose. A
 * customer who filled a basket on their phone, then opened the website and
 * added one more thing, expects to end up with all of it. Timestamps cannot
 * tell you which basket was *meant*, and silently emptying one is the failure
 * people notice at checkout, when it is most expensive.
 *
 * Taking the larger quantity rather than the sum avoids the opposite problem:
 * the same dish added on both devices should be two portions, not four.
 */
export function mergeLines(localLines, remoteLines) {
  const out = { ...remoteLines };
  Object.entries(localLines || {}).forEach(([id, line]) => {
    const existing = out[id];
    out[id] = existing
      ? { ...existing, qty: Math.max(existing.qty, line.qty) }
      : line;
  });
  return out;
}

export async function loadRemoteCart(uid) {
  if (!db || !uid) return null;
  try {
    const snap = await getDoc(doc(db, 'carts', uid));
    if (!snap.exists()) return null;
    return remoteToLines(snap.data()?.items);
  } catch (e) {
    console.error('[cart] remote load failed', e);
    return null;
  }
}

/**
 * Writes the basket to the cloud. Resolves true on success, false on failure.
 *
 * The boolean matters: the caller surfaces a quiet "not synced" note rather
 * than swallowing the failure. A cart that has silently stopped syncing looks
 * identical to one that is syncing fine, right up until the customer opens
 * their phone and finds yesterday's basket.
 *
 * It still never throws. Losing sync is a degradation, not a reason to stop
 * someone ordering — the checkout reads local state and works regardless.
 */
export async function saveRemoteCart(uid, lines) {
  if (!db || !uid) return false;
  const items = linesToRemote(lines);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  try {
    await setDoc(doc(db, 'carts', uid), {
      userId: uid,
      items,
      subtotal: Number(subtotal.toFixed(2)),
      updatedAt: Timestamp.now(),
    });
    return true;
  } catch (e) {
    console.error('[cart] remote save failed', e);
    return false;
  }
}

export function watchRemoteCart(uid, onChange) {
  if (!db || !uid) return () => {};
  return onSnapshot(
    doc(db, 'carts', uid),
    (snap) => onChange(snap.exists() ? remoteToLines(snap.data()?.items) : {}),
    (e) => console.error('[cart] remote listener failed', e),
  );
}
