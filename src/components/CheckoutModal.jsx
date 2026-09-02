import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  addDoc, collection, doc, updateDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  X, Minus, Plus, ShieldCheck, Tag, Loader2, CheckCircle2, AlertCircle,
  MapPin, Crosshair, Wallet,
} from 'lucide-react';
import { db, functions, RAZORPAY_KEY_ID } from '../lib/firebase';
import { loadRazorpay } from '../lib/razorpay';
import { inr } from '../lib/format';
import { validateOrderForm, normalisePhone } from '../lib/validate';
import {
  // checkPincode is no longer used here — the typed address it read from is
  // gone, and coordinates are a strictly stronger coverage test. It remains
  // exported for any future flow that only has a postal address to work with.
  checkCoordinates, getBrowserLocation, SERVICE_CITY,
  parseMapsCoordinates, mapsLinkFor,
} from '../lib/serviceArea';
import { useCart } from '../context/CartContext';
import AuthPanel from './AuthPanel';
import MapPicker from './MapPicker';
import AddressBook from './AddressBook';
import { useStoreOpen, useFeatureFlags } from '../lib/useStoreOpen';
import { readCache, writeCache, TTL } from '../lib/localCache';
import { MAPS_ENABLED } from '../lib/googleMaps';
import { CONFIRM_METRES } from '../lib/locationPolicy';
import { useAuth } from '../context/AuthContext';

function Field({ label, hint, error, children }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block font-sans text-[13px] font-bold text-brand-dark">
        {label}
        {hint && <span className="ml-1.5 font-normal text-brand-dark/40">{hint}</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 flex items-start gap-1.5 font-sans text-xs text-red-600">
          <AlertCircle className="mt-[1px] h-3.5 w-3.5 flex-shrink-0" />{error}
        </p>
      )}
    </div>
  );
}

/**
 * Whether to offer online payment at all.
 *
 * True only when a real live Key ID is present. The placeholder value shipped
 * in .env would otherwise produce a checkout that looks like it works, opens
 * the Razorpay sheet and fails at the gateway with an error the customer reads
 * as "this restaurant's payment is broken".
 *
 * When the live keys arrive, drop them into official_page/.env and this turns
 * itself on — no code change, but you must rebuild, because Vite bakes env
 * values into the bundle at build time.
 */
const ONLINE_ENABLED =
  Boolean(RAZORPAY_KEY_ID) && !RAZORPAY_KEY_ID.startsWith('REPLACE_WITH');

const inputCls = (bad) =>
  `w-full rounded-xl border px-4 py-3 font-sans text-sm outline-none transition
   ${bad ? 'border-red-400 bg-red-50/40 focus:border-red-500'
         : 'border-brand-primary/15 bg-white focus:border-brand-primary'}`;

export default function CheckoutModal({ open, onClose, onPlaced }) {
  const { items, totals, add, remove, clear, coupon, couponError, couponBusy, applyCoupon, removeCoupon, setDeliveryPoint } = useCart();
  const { user, profile, isSignedIn, updateProfile, authError } = useAuth();
  const { storeOpen, closedMessage } = useStoreOpen();
  const { couponEnabled } = useFeatureFlags();

  // `address` is gone. Location comes from the device; `doorInfo` carries only
  // the part GPS can't know — flat number, floor, gate, landmark.
  const [form, setForm] = useState({ name: '', phone: '', doorInfo: '', note: '' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [couponInput, setCouponInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState('');

  /*
   * How the customer pays. Nothing is preselected.
   *
   * This was `useState('COD')`, so every website customer was defaulted into
   * cash — on a checkout that ran no eligibility check of any kind. A customer
   * whose cash payment had been withdrawn in the app simply opened a browser
   * and carried on, which is how the abuse lock was bypassed in practice.
   * Requiring an explicit choice also means the eligibility answer below has
   * somewhere to land before an order exists.
   */
  const [payMethod, setPayMethod] = useState('');

  /* Server-side cash-on-delivery eligibility. One answer, shared with the app
   * and enforced again in the order path — this is the display copy only. */
  const [codEligible, setCodEligible] = useState(true);
  const [codMessage, setCodMessage] = useState('');

  /* The server-owned checkout session. A session left open past its window is
   * swept and counted as an abandoned cash checkout, which is what makes the
   * three-strike rule enforceable rather than voluntary. */
  const [sessionId, setSessionId] = useState(null);

  // Delivery-area state. `coords` stays null unless the customer chooses to
  // share their location — the pincode gate works without it.
  const [coords, setCoords] = useState(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');
  const [areaError, setAreaError] = useState('');

  // Optional manual pin. GPS is the primary route; this is for when it lands
  // in the wrong place, which indoors it regularly does.
  const [showMapsInput, setShowMapsInput] = useState(false);
  const [mapsInput, setMapsInput] = useState('');
  const [mapsError, setMapsError] = useState('');

  // The draggable map. Separate from showMapsInput so the coordinate box
  // stays available as a fallback when the Maps script is blocked.
  const [showMap, setShowMap] = useState(false);

  // The last delivery point this browser confirmed.
  //
  // Deliberately *offered* rather than applied. Restoring it automatically
  // would mean a customer ordering from the office silently gets their food
  // sent home — the checkout would look complete and correct while pointing
  // the rider at the wrong building. Re-confirming is one tap; a misdelivery
  // is a wasted meal and a refund.
  const [savedLoc, setSavedLoc] = useState(null);

  useEffect(() => {
    if (!open || coords) return;
    setSavedLoc(readCache('lastLocation', { maxAgeMs: TTL.LOCATION }));
  }, [open, coords]);

  /* ── The delivery point drives the delivery charge ─────────────────────
   *
   * Delivery is priced by distance, so the charge cannot be known until
   * there is a destination. This is the single place that hands the chosen
   * point to the cart.
   *
   * It is one effect on `coords` rather than a call inside each of the four
   * places that set it — GPS, the saved point, a pasted Maps link and the
   * map pin. Wiring each of them separately is how you end up with three
   * paths that update the fee and a fourth that quietly does not, which is a
   * customer being quoted ₹20 for an 8 km delivery. Anything that sets
   * `coords` from here on is priced automatically.
   *
   * `coords` is only ever set after `checkCoordinates` has confirmed the
   * point is inside a service area, so an out-of-area location never reaches
   * the fee calculation — it clears the point instead, and the charge falls
   * back to the base fare with checkout blocked by the area error.
   */
  /* A location chosen any other way deselects the saved address card, so the
   * list never shows a tick beside an address the order is not going to. */
  useEffect(() => {
    if (!coords) { setSavedSel(null); return; }
    setSavedSel((sel) => {
      if (!sel) return sel;
      const same = Math.abs(sel.lat - coords.lat) < 1e-7
        && Math.abs(sel.lng - coords.lng) < 1e-7;
      return same ? sel : null;
    });
  }, [coords]);

  useEffect(() => {
    setDeliveryPoint(
      coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
        ? { lat: coords.lat, lng: coords.lng }
        : null,
    );
  }, [coords, setDeliveryPoint]);

  /** Confirm the saved point, re-checking coverage in case areas changed. */
  async function useSavedLocation() {
    if (!savedLoc) return;
    setGeoBusy(true); setAreaError(''); setGeoMsg('');
    const cover = await checkCoordinates(savedLoc.lat, savedLoc.lng);
    if (!cover.ok) {
      setAreaError(cover.error);
      setGeoBusy(false);
      return;
    }
    setCoords({
      lat: savedLoc.lat,
      lng: savedLoc.lng,
      accuracy: savedLoc.accuracy ?? null,
      source: savedLoc.source,
    });
    setGeoMsg(cover.areaName ? `Delivering to ${cover.areaName}.` : 'Location set.');
    setSavedLoc(null);
    setGeoBusy(false);
  }

  // Honeypot: real people never fill a hidden field. Bots fill everything.
  //
  // The field name matters. This was `company`, which browsers and password
  // managers recognise as the `organization` autofill token — so Chrome
  // silently filled it for real customers and the checkout dead-ended on
  // "Something went wrong. Please reload and try again." with no way past it.
  // The name below maps to no autofill token, so only a script fills it.
  const [trap, setTrap] = useState('');

  // Prefill from the profile so returning customers barely have to type.
  useEffect(() => {
    if (!profile) return;
    setForm((f) => ({
      ...f,
      name: f.name || profile.name || profile.displayName || '',
      phone: f.phone || profile.phone || '',
      doorInfo: f.doorInfo || profile.lastDoorInfo || '',
    }));
  }, [profile]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    if (touched[k]) setErrors(validateOrderForm({ ...form, [k]: v }));
  };
  const blur = (k) => () => {
    setTouched((t) => ({ ...t, [k]: true }));
    setErrors(validateOrderForm(form));
  };

  const formValid = useMemo(
    () => Object.keys(validateOrderForm(form)).length === 0,
    [form],
  );

  /**
   * Capture the delivery point. No longer optional — it *is* the address.
   *
   * Accuracy is checked, not just presence. A browser will happily return a
   * position derived from the IP address with a 20 km error radius, which
   * looks like a successful fix but points the rider at a cell tower. Anything
   * coarser than ACCURACY_LIMIT_M is rejected with an explanation rather than
   * quietly accepted.
   */
  // Tiers, not a single limit. Imported from the shared policy module so the
  // website and the app cannot drift: 50 m is accepted silently, 50-150 m is
  // usable once the customer confirms the pin, and anything coarser is
  // refused outright.
  const ACCURACY_LIMIT_M = CONFIRM_METRES;

  async function useMyLocation() {
    setGeoBusy(true); setGeoMsg(''); setAreaError('');
    const pos = await getBrowserLocation();
    if (!pos.ok) { setGeoMsg(pos.error); setGeoBusy(false); return; }

    if (Number.isFinite(pos.accuracy) && pos.accuracy > ACCURACY_LIMIT_M) {
      setCoords(null);
      setGeoMsg(
        `That fix is only accurate to about ${Math.round(pos.accuracy)} m, which `
        + 'is too rough for the rider to find you. Step outside or near a window '
        + 'and try again.',
      );
      setGeoBusy(false);
      return;
    }

    const cover = await checkCoordinates(pos.lat, pos.lng);
    if (!cover.ok) {
      setCoords(null);
      setAreaError(cover.error);
      setGeoMsg('');
      setGeoBusy(false);
      return;
    }

    setCoords({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy });
    // Only points that already passed the accuracy and coverage checks are
    // remembered, so a saved location can never be worse than a fresh one.
    writeCache('lastLocation', {
      lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, source: 'gps',
      areaName: cover.areaName || '',
    });
    setGeoMsg(
      cover.areaName
        ? `Location confirmed — delivering to ${cover.areaName}.`
        : 'Location confirmed.',
    );
    setGeoBusy(false);
  }

  /**
   * Set the delivery point from a pasted Google Maps link.
   *
   * Runs the same coverage check as GPS. A manually placed pin is still a
   * point that has to be inside a service area — the escape hatch is for
   * accuracy, not for ordering from outside Guntur.
   *
   * No accuracy figure is recorded, because a pin the customer placed
   * themselves has no measurement error to report. `locationSource`
   * distinguishes the two so the rider knows which they are following.
   */
  async function applyMapsLink() {
    setMapsError(''); setAreaError(''); setGeoMsg('');
    const parsed = parseMapsCoordinates(mapsInput);
    if (!parsed.ok) { setMapsError(parsed.error); return; }

    setGeoBusy(true);
    const cover = await checkCoordinates(parsed.lat, parsed.lng);
    if (!cover.ok) {
      setCoords(null);
      setAreaError(cover.error);
      setGeoBusy(false);
      return;
    }

    setCoords({
      lat: parsed.lat,
      lng: parsed.lng,
      accuracy: null,
      source: 'maps_pin',
    });
    setGeoMsg(
      cover.areaName
        ? `Pin set — delivering to ${cover.areaName}.`
        : 'Pin set.',
    );
    setShowMapsInput(false);
    setGeoBusy(false);
  }

  /* ── Saved addresses ───────────────────────────────────────────────────
   *
   * Choosing a saved address is the same act as dropping a pin: it sets a
   * delivery point, so it runs the same coverage check and lands in the same
   * `coords` state, which is what feeds the distance-based delivery charge.
   * Anything that bypassed `coords` here would be quoted the base fare.
   *
   * The saved `addressLine` also prefills the door detail, because retyping
   * an address you have already saved is the reason people abandon a
   * checkout.
   */
  // The id *and* the point, so the deselect check below can compare the two.
  // Comparing `coords.source` alone is not enough: a fresh map pin and a saved
  // address placed by pin both carry 'maps_pin', so a customer who dropped a
  // new pin would still see a tick on the old saved card.
  const [savedSel, setSavedSel] = useState(null);
  const savedAddressId = savedSel?.id || '';

  async function useSavedAddress(a) {
    if (!a || !a.usable) return;
    setMapsError(''); setAreaError(''); setGeoMsg('');
    setGeoBusy(true);
    try {
      const cover = await checkCoordinates(a.latitude, a.longitude);
      if (!cover.ok) {
        // The address is saved and real; coverage may simply have changed
        // since. `coords` stays cleared so nothing is priced or ordered
        // against a point we cannot deliver to.
        setCoords(null);
        setSavedSel(null);
        setAreaError(cover.error);
        return;
      }
      setSavedSel({ id: a.id, lat: a.latitude, lng: a.longitude });
      setCoords({
        lat: a.latitude,
        lng: a.longitude,
        accuracy: a.accuracyM ?? null,
        source: a.source === 'customer_maps_pin' ? 'maps_pin' : (a.source || 'saved_address'),
      });
      const line = [a.houseNumber, a.addressLine].filter(Boolean).join(', ');
      if (line) setForm((f) => ({ ...f, doorInfo: line }));
      setGeoMsg(cover.areaName ? `Delivering to ${cover.areaName}.` : 'Address set.');
    } finally {
      setGeoBusy(false);
    }
  }

  /**
   * Commit the point the customer chose on the map.
   *
   * Runs the same coverage check as GPS and the pasted link. A pin placed by
   * hand is still a point that has to be inside a service area — the map is
   * there for precision, not to let someone order from outside Guntur.
   */
  async function applyMapPick({ lat, lng }) {
    setMapsError(''); setAreaError(''); setGeoMsg('');
    setGeoBusy(true);

    const cover = await checkCoordinates(lat, lng);
    if (!cover.ok) {
      setCoords(null);
      setAreaError(cover.error);
      setGeoBusy(false);
      return;
    }

    setCoords({ lat, lng, accuracy: null, source: 'maps_pin' });
    writeCache('lastLocation', {
      lat, lng, accuracy: null, source: 'maps_pin',
      areaName: cover.areaName || '',
    });
    setGeoMsg(cover.areaName ? `Pin set — delivering to ${cover.areaName}.` : 'Pin set.');
    setShowMap(false);
    setGeoBusy(false);
  }

  /* Ask the server whether this customer may pay cash, whenever the answer
   * could have changed. The website previously never asked at all. */
  useEffect(() => {
    if (!open || !functions || !isSignedIn || !items.length) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await httpsCallable(functions, 'checkCodEligibility')({
          subtotal: totals.subtotal,
          grandTotal: totals.grand,
          isTakeaway: false,
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        });
        if (cancelled) return;
        setCodEligible(res?.data?.eligible !== false);
        setCodMessage(res?.data?.message || '');
      } catch (e) {
        // Fail open on a transport error — the order path re-checks
        // server-side, so a genuinely blocked customer is still refused there.
        console.warn('[checkout] checkCodEligibility failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, isSignedIn, items.length, totals.subtotal, totals.grand, coords]);

  /* Open a session when the modal opens, and re-open it when the customer
   * switches to or from cash — only a cash session counts as an abandonment,
   * and beginCheckout supersedes the previous one without counting it. */
  useEffect(() => {
    if (!open || !isSignedIn || !items.length) return;
    beginSession(payMethod || 'Unknown');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isSignedIn, items.length > 0, payMethod]);

  /* Closing the modal without ordering is an abandonment. The server sweeps
   * unclosed sessions after fifteen minutes regardless, so this is only about
   * updating the customer's standing promptly. */
  useEffect(() => {
    if (open) return undefined;
    endSession('ABANDONED');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ────────────────────────────────────────────────────────────────────
   * Checkout sessions and cash eligibility
   *
   * `beginCheckout` opens a server-owned session; a session still open when
   * its window closes is swept and, if cash was selected, counted as an
   * abandoned COD checkout. That sweep is what makes the three-strike rule
   * enforceable — the previous scheme incremented a counter from the mobile
   * app's back button only, so the website never participated and a client
   * that stayed quiet was never counted at all.
   * ──────────────────────────────────────────────────────────────────── */

  async function beginSession(method) {
    if (!functions || !isSignedIn) return;
    try {
      const fn = httpsCallable(functions, 'beginCheckout');
      const res = await fn({ paymentMethod: method || 'Unknown' });
      if (res?.data?.checkoutSessionId) setSessionId(res.data.checkoutSessionId);
    } catch (e) {
      // Never block checkout on this. A session that fails to open simply
      // means this attempt is not counted — the safe direction to fail.
      console.warn('[checkout] beginCheckout failed', e);
    }
  }

  async function endSession(outcome) {
    if (!functions || !sessionId) return;
    const id = sessionId;
    setSessionId(null);
    try {
      await httpsCallable(functions, 'endCheckout')({
        checkoutSessionId: id, outcome,
      });
    } catch (e) {
      console.warn('[checkout] endCheckout failed', e);
    }
  }

  /**
   * A failed or dismissed payment cancels the order.
   *
   * The old copy — "Your order is saved, you can pay again" — was untrue in
   * both directions: nothing on this site let the customer pay again, and the
   * order was cancelled by the sweeper twenty minutes later anyway. Now it is
   * cancelled immediately, server-side, with the stock and coupon redemption
   * it consumed handed back.
   *
   * `cancelUnpaidPurchase` asks Razorpay whether money actually moved before
   * cancelling. `payment.failed` is a client-side signal that fires on a
   * dropped connection as readily as on a decline, so acting on it alone
   * would cancel orders the customer has genuinely paid for.
   */
  async function failOrder(orderDocId, reason, gatewayMessage) {
    setBusy(false);
    let alreadyPaid = false;
    try {
      const res = await httpsCallable(functions, 'cancelUnpaidPurchase')({
        purchaseId: orderDocId,
        kind: 'ORDER',
        reason,
        ...(sessionId ? { checkoutSessionId: sessionId } : {}),
      });
      alreadyPaid = res?.data?.alreadyPaid === true;
    } catch (e) {
      console.error('[checkout] cancelUnpaidPurchase failed', e);
    }
    setSessionId(null);

    if (alreadyPaid) {
      setFatal(
        'Your payment is being confirmed — please do not pay again. '
        + 'We will update your order shortly.',
      );
      return;
    }

    // The cart is deliberately NOT cleared. Re-ordering should be one tap,
    // and clearing it was what made a failed payment feel like losing the
    // basket as well as the order.
    setFatal(
      (gatewayMessage ? gatewayMessage + ' ' : '')
      + 'The order was cancelled because payment did not complete. '
      + 'Your items are still in your bag.',
    );
  }

  /* Double-submit guard.
   *
   * `busy` disables the button, but `setBusy(true)` does not run until after
   * the coverage re-check and the cash-eligibility re-check — two network
   * round trips during which the button is live. React state is asynchronous
   * anyway, so even moving `setBusy` earlier would not close the gap; a ref
   * flips synchronously and is the only thing that can.
   *
   * It matters because nothing downstream collapses a repeat: the app's
   * `placeOrder` mints a fresh idempotency token per call, and the website
   * writes its order document directly. Two clicks produce two orders. */
  const submitting = useRef(false);

  async function placeOrder() {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await runPlaceOrder();
    } finally {
      submitting.current = false;
    }
  }

  async function runPlaceOrder() {
    setFatal(''); setAreaError('');

    // Checked here as well as on the menu. Someone who filled a cart before
    // closing time, or left the tab open, still has a working Place order
    // button — and a ticket printing in an empty kitchen is worse than a
    // customer being told to come back.
    if (!storeOpen) {
      setFatal(
        closedMessage
        || "The kitchen has closed and we can't take this order. Your cart is "
           + 'saved — please try again when we reopen.',
      );
      return;
    }

    const errs = validateOrderForm(form);
    setErrors(errs);
    setTouched({ name: true, phone: true, address: true, note: true });
    if (Object.keys(errs).length) return;

    // Coordinates are now the only coverage gate, and they are mandatory.
    //
    // This is stricter than the pincode check it replaces, in the way that
    // matters: a pincode was typed and so could be any six digits the customer
    // felt like entering, whereas a GPS fix has to actually be inside a
    // service area. It also means every website order carries coordinates, so
    // `onOrderCreatedValidateArea` can no longer hit its "no usable
    // coordinates" branch and wave the order through unchecked.
    if (!coords) {
      setAreaError('Please share your location so the rider can find you.');
      return;
    }

    // Re-checked at submit rather than trusting the earlier pass — the areas
    // are admin-editable and the customer may have sat on this screen a while.
    const cover = await checkCoordinates(coords.lat, coords.lng);
    if (!cover.ok) { setAreaError(cover.error); return; }

    if (trap) {
      // Logged so a false positive is diagnosable rather than an unexplained
      // dead end for a paying customer — which is exactly what happened when
      // this field was named `company` and Chrome autofilled it.
      console.warn('[checkout] honeypot filled — blocking submit');
      setFatal('Something went wrong. Please reload and try again.');
      return;
    }
    if (!items.length) { setFatal('Your bag is empty.'); return; }

    // Only the online route needs a gateway key.
    //
    // This used to be an unconditional `if (!RAZORPAY_KEY_ID) return`, which
    // ran before the COD branch below and refused every cash order with
    // "Online payment isn't configured yet" — a message about a payment
    // method the customer hadn't chosen, on a checkout that couldn't be
    // completed at all. It made the site look broken while the kitchen was
    // waiting for orders.
    if (payMethod !== 'COD' && !ONLINE_ENABLED) {
      setFatal('Online payment isn\'t available right now. Please choose cash on delivery.');
      return;
    }

    // Nothing is preselected any more, so an unanswered choice is a real state.
    if (!payMethod) {
      setFatal('Please choose how you would like to pay.');
      return;
    }

    // The server decides, and decides again in the order path. This check is
    // here so the customer gets a sentence rather than a rejected write.
    if (payMethod === 'COD' && !codEligible) {
      setFatal(codMessage || 'Cash on delivery isn\'t available for this order.');
      return;
    }

    if (!db || !functions || !user) { setFatal('Please sign in again.'); return; }

    /* Re-ask at the moment of submission.
     *
     * The cached verdict above came from an effect that last ran against a
     * possibly different basket, and cash can be withdrawn between the two —
     * a value limit crossed, the global switch turned off, a block earned by
     * abandoning a checkout in another tab. Without this the customer gets a
     * confirmation and then a cancellation a few seconds later.
     *
     * Still advisory. `onOrderCreatedVerifyTotals` re-evaluates the same rule
     * against a basket it re-prices from the menu, and that is what binds.
     * Unreachable means proceed: refusing here on a network error would block
     * a customer who is entitled to pay cash, and the server still catches
     * the case that matters. */
    if (payMethod === 'COD') {
      try {
        const res = await httpsCallable(functions, 'checkCodEligibility')({
          subtotal: totals.subtotal,
          grandTotal: totals.grand,
          isTakeaway: false,
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        });
        if (res?.data?.eligible === false) {
          setCodEligible(false);
          setCodMessage(res.data.message || '');
          setFatal(res.data.message || 'Cash on delivery isn\'t available for this order.');
          return;
        }
      } catch (e) {
        console.warn('[checkout] final checkCodEligibility failed', e);
      }
    }

    setBusy(true);
    let orderDocId = null;

    try {
      // Cash on delivery never touches the gateway, so don't make the order
      // depend on a script that may be blocked or, right now, on a keyset that
      // isn't live yet.
      const isCod = payMethod === 'COD';
      if (!isCod) {
        const sdkReady = await loadRazorpay();
        if (!sdkReady) throw new Error('Could not reach the payment gateway.');
      }

      const phone = normalisePhone(form.phone);
      const readable = 'WEB' + Date.now().toString().slice(-8);

      const orderItems = items.map(({ item, qty, addons }) => {
        // `selectedAddons` already existed on the order schema and was always
        // written empty. It is now filled from the line, in the shape the
        // menu document stores add-ons, so the kitchen ticket and the admin
        // order view show what was actually ordered.
        const chosen = Array.isArray(addons) ? addons : [];
        const addonTotal = chosen.reduce((t, a) => t + (Number(a.price) || 0), 0);
        return {
          menuItemId: item.id,
          itemId: item.id,
          name: item.name,
          // The dish price stays the dish price. The server re-prices this
          // line from `menuItems` and would flag a mismatch if the add-on
          // money were folded in here.
          price: item.price,
          imageUrl: item.image || '',
          quantity: qty,
          selectedAddons: chosen.map((a) => ({
            name: String(a.name || ''),
            price: Number(a.price) || 0,
            ...(a.isVeg === undefined ? {} : { isVeg: a.isVeg !== false }),
          })),
          notes: '',
          total: +((item.price + addonTotal) * qty).toFixed(2),
        };
      });

      // 1. Persist the order first. The webhook reconciles against this
      //    document, so it has to exist before Razorpay is involved.
      const ref = await addDoc(collection(db, 'orders'), {
        orderId: readable,
        customerId: user.uid,
        customerName: form.name.trim(),
        customerEmail: user.email || '',
        customerMobile: phone,
        customerPhone: phone,
        items: orderItems,
        subtotal: totals.subtotal,
        // Each charge under its own name, matching what the app writes and
        // what the admin dashboard and order-details screens read back.
        //
        // This block previously put the flat fee into `deliveryCharge` and
        // recorded `platformFee: 0, taxAmount: 0`. Every website order in the
        // database therefore claims it collected no GST and no platform fee,
        // and attributes the money to a delivery charge that was never one.
        // Existing orders keep those values; new ones are correct.
        deliveryCharge: totals.deliveryCharge,
        rainCharge: totals.rainCharge,
        platformFee: totals.platformFee,
        taxAmount: totals.tax,
        totalAmount: totals.grand,
        grandTotal: totals.grand,
        discountAmount: totals.discount,
        couponCode: coupon?.code || '',
        status: 'Pending',
        // 'COD' is the vocabulary the admin dashboard and the delivery app
        // already use for cash orders, so a website COD order lands in the
        // same kitchen queue and settles through the same rider flow.
        paymentMethod: isCod ? 'COD' : 'Razorpay',
        paymentStatus: 'Pending',
        paymentId: '',
        // Coordinates are written under the exact names
        // `onOrderCreatedValidateArea` looks for — deliveryLatitude /
        // deliveryAddress.latitude. Without them that trigger hits its
        // "no usable coordinates" branch and accepts the order unchecked,
        // which would make the server-side area guard a no-op for the web.
        deliveryAddress: {
          // The door detail the rider needs, plus a map link they can tap.
          // No free-text street address exists any more.
          addressLine: form.doorInfo.trim(),
          doorInfo: form.doorInfo.trim(),
          city: SERVICE_CITY,
          latitude: coords.lat,
          longitude: coords.lng,
          lat: coords.lat,   // legacy key used elsewhere in the app
          lng: coords.lng,
          locationAccuracyM: coords.accuracy ?? null,
          // Distinguishes a device fix from a pin the customer placed. A rider
          // treats them differently: a 12 m GPS reading is a measurement, a
          // manual pin is a statement of intent and is usually the better one.
          locationSource:
            coords.source === 'maps_pin' ? 'customer_maps_pin' : 'browser_geolocation',
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`,
        },
        deliveryLatitude: coords.lat,
        deliveryLongitude: coords.lng,
        assignmentStatus: 'Unassigned',
        statusHistory: [{ status: 'Pending', timestamp: new Date() }],
        assignedPartnerId: '',
        assignedPartnerName: '',
        verificationCode: '',
        verificationStatus: false,
        orderSource: 'website',
        cookingInstructions: form.note.trim(),
        deliveryDistance: 0,
        orderToken: '',
        assignmentMethod: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      orderDocId = ref.id;

      // Remember details for next time and for the mobile app.
      updateProfile({
        name: form.name.trim(),
        displayName: form.name.trim(),
        phone,
        lastDoorInfo: form.doorInfo.trim(),
      }).catch(() => { /* non-blocking */ });

      // Cash orders are complete at this point. The order is in the kitchen
      // queue, the rider collects on delivery, and verifyDeliveryCode settles
      // it — the same path COD takes from the mobile app.
      if (isCod) {
        clear();
        setBusy(false);
        onPlaced?.({ docId: orderDocId, orderId: readable, paymentId: '', cod: true });
        return;
      }

      // 2. notes.orderId is the key razorpayWebhook looks the order up by.
      //    Without it a captured payment can never be matched to this order.
      const createOrder = httpsCallable(functions, 'createRazorpayOrder');
      const res = await createOrder({
        amount: totals.grand,
        receipt: readable,
        notes: { orderId: orderDocId, source: 'website' },
      });
      const rzpOrder = res?.data;
      if (!rzpOrder?.id) throw new Error('The payment gateway did not return an order.');

      // 3. Hand off to Razorpay.
      const rzp = new window.Razorpay({
        key: RAZORPAY_KEY_ID,
        order_id: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: 'INR',
        name: 'HomeBites',
        description: `Order ${readable}`,
        image: '/favicon.png',
        prefill: { name: form.name.trim(), contact: phone, email: user.email || '' },
        notes: { orderId: orderDocId },
        theme: { color: '#0B4D3B' },
        modal: {
          ondismiss: () => { failOrder(orderDocId, 'PAYMENT_DISMISSED'); },
        },
        handler: async (r) => {
          /*
           * Nothing is written from the browser here.
           *
           * This used to attach `paymentId` to the order document. That write
           * is refused by firestore.rules — a customer may only touch
           * `status`, `cancellationReason` and `updatedAt` — so it failed
           * silently into the catch on every single order. It was harmless
           * only because the webhook writes `paymentId` itself, which is also
           * the reason removing it costs nothing.
           *
           * paymentStatus stays Pending until a signature-verified server
           * path flips it: anything a client can set, a client can forge.
           *
           * ── Why this now calls the server before showing success ────────
           *
           * Razorpay's `handler` firing means the *browser* was told the
           * payment worked. That is a claim, not a fact — the callback runs in
           * a page the customer controls. This used to go straight to
           * `onPlaced`, so the success screen appeared on the strength of that
           * claim alone. The order was never marked paid by it (the webhook
           * owns that, and always did), but the customer was told "order
           * placed" before anything had been checked.
           *
           * `verifyRazorpayPayment` is the existing backend verification and
           * it already does the work: it re-derives the HMAC signature, checks
           * the caller owns the order, refuses a cancelled one, and — the part
           * that matters — fetches the payment from Razorpay and compares the
           * amount actually captured against the order's server-side total. It
           * refuses outright when RAZORPAY_SECRET is absent. The Flutter app
           * has called it all along; the website never did.
           *
           * The webhook remains the authoritative reconciler, so a customer
           * whose verification call fails on a flaky network still gets their
           * order settled a moment later. This gate is about not *claiming*
           * success before the server agrees.
           */
          try {
            const verify = httpsCallable(functions, 'verifyRazorpayPayment');
            const out = await verify({
              // Razorpay's signature is over `razorpay_order_id|payment_id`,
              // so the top-level id must be Razorpay's, not ours. Our
              // Firestore document id travels in `metadata.orderId`, exactly
              // as the app sends it.
              orderId: r.razorpay_order_id,
              paymentId: r.razorpay_payment_id,
              signature: r.razorpay_signature,
              type: 'ORDER',
              metadata: { orderId: orderDocId },
            });

            if (out?.data?.success !== true) {
              // A structured refusal — a cancelled order, most often.
              setBusy(false);
              setFatal(
                out?.data?.message
                || 'We could not confirm that payment. If money left your account '
                 + 'it will be refunded. Please contact us before paying again.',
              );
              return;
            }
          } catch (err) {
            /*
             * Verification failed: bad signature, wrong owner, amount short of
             * the order total, or the gateway unreachable. No success screen
             * and no cart clear — the order document stays Pending and is
             * either settled by the webhook or expired by
             * `expireUnpaidOrders`. Telling the customer it worked here is the
             * one thing that must not happen.
             */
            console.error('[checkout] payment verification failed', err);
            setBusy(false);
            setFatal(
              'We could not verify that payment. Do not pay again yet — if money '
              + 'left your account we will either complete this order or refund '
              + 'it. Please contact us with your order number ' + readable + '.',
            );
            return;
          }

          await endSession('ORDERED');
          clear();
          setBusy(false);
          onPlaced?.({ docId: orderDocId, orderId: readable, paymentId: r.razorpay_payment_id });
        },
      });

      rzp.on('payment.failed', (resp) => {
        failOrder(orderDocId, 'PAYMENT_FAILED', resp?.error?.description);
      });

      rzp.open();
    } catch (e) {
      console.error('[checkout] failed', e);
      setBusy(false);
      const msg = String(e?.message || '');
      setFatal(
        msg.includes('not configured')
          ? 'Payments are temporarily unavailable. Please contact us to order.'
          : orderDocId
            ? 'Something went wrong — your order was saved, please try paying again.'
            : 'Something went wrong. Please try again.',
      );
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-brand-dark/60 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-brand-offwhite shadow-2xl sm:rounded-3xl"
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-brand-primary/10 bg-white px-6 py-5">
              <div>
                <h2 className="font-display text-xl font-bold text-brand-primary">Your order</h2>
                <p className="font-sans text-xs text-brand-dark/50">
                  {totals.count} {totals.count === 1 ? 'item' : 'items'}
                </p>
              </div>
              <button onClick={onClose} aria-label="Close"
                      className="grid h-9 w-9 place-items-center rounded-full text-brand-dark/50 transition hover:bg-brand-offwhite hover:text-brand-dark">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* items */}
              {items.length === 0 ? (
                <p className="py-10 text-center font-sans text-sm text-brand-dark/50">Your bag is empty.</p>
              ) : (
                <div className="mb-6 space-y-3">
                  {items.map(({ item, qty }) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl bg-white p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sans text-sm font-semibold text-brand-dark">{item.name}</p>
                        <p className="font-sans text-xs text-brand-dark/50">{inr(item.price)} each</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-lg border border-brand-primary/15">
                        <button onClick={() => remove(item.id)} aria-label="Remove one"
                                className="grid h-7 w-7 place-items-center text-brand-primary transition hover:bg-brand-offwhite">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[1.25rem] text-center font-sans text-sm font-bold tabular-nums">{qty}</span>
                        <button onClick={() => add(item)} aria-label="Add one"
                                className="grid h-7 w-7 place-items-center text-brand-primary transition hover:bg-brand-offwhite">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="w-16 text-right font-sans text-sm font-bold text-brand-dark">
                        {inr(item.price * qty)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* sign-in gate */}
              {!isSignedIn ? (
                <AuthPanel />
              ) : (
                <>
                  {/* delivery details */}
                  <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-brand-dark/70">
                    Delivery details
                  </h3>

                  <Field label="Full name" error={touched.name ? errors.name : ''}>
                    <input className={inputCls(touched.name && errors.name)} value={form.name}
                           onChange={set('name')} onBlur={blur('name')}
                           autoComplete="name" placeholder="As it should appear on the order" maxLength={60} />
                  </Field>

                  <Field label="Mobile number" hint="we'll call to confirm" error={touched.phone ? errors.phone : ''}>
                    <div className="flex">
                      <span className="grid place-items-center rounded-l-xl border border-r-0 border-brand-primary/15 bg-brand-offwhite px-3 font-sans text-sm text-brand-dark/60">
                        +91
                      </span>
                      <input className={`${inputCls(touched.phone && errors.phone)} rounded-l-none`}
                             value={form.phone} onChange={set('phone')} onBlur={blur('phone')}
                             inputMode="numeric" autoComplete="tel" maxLength={13} placeholder="10-digit number" />
                    </div>
                  </Field>

                  {/* Location replaces the typed address entirely. It's the
                      primary control, so it gets the emphasis a text field
                      used to have. */}
                  {/* Names the areas actually served. "Guntur city only" told
                      a Tadikonda customer they were out of range before they
                      had even tried. */}
                  <Field
                    label="Delivery location"
                    hint={`${SERVICE_CITY}, Tadikonda, Lam & Perecherla`}
                  >
                    {/* One tap for a returning customer, instead of waiting
                        on the GPS again — but shown as a choice, because the
                        saved point is where they ordered from last time, not
                        necessarily where they are now. */}
                    {savedLoc && !coords && (
                      <button
                        type="button"
                        onClick={useSavedLocation}
                        disabled={geoBusy}
                        className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border-2
                                   border-brand-primary/30 bg-brand-secondary/10 px-4 py-3 font-sans
                                   text-sm font-bold text-brand-primary transition
                                   hover:border-brand-primary/50 disabled:opacity-50"
                      >
                        <MapPin className="h-4 w-4" />
                        Deliver to my last location
                        {savedLoc.areaName ? ` — ${savedLoc.areaName}` : ''}
                      </button>
                    )}

                    {/* Saved addresses first: a returning customer should be
                        one tap from ordering, not asked to re-share their
                        location every time. */}
                    <div className="mb-3">
                      <AddressBook
                        selectedId={savedAddressId}
                        onSelect={useSavedAddress}
                      />
                    </div>

                    <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-wide text-brand-dark/40">
                      Or set a location now
                    </p>

                    <button
                      type="button"
                      onClick={useMyLocation}
                      disabled={geoBusy}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 px-4 py-3.5
                                  font-sans text-sm font-bold transition disabled:opacity-50
                                  ${coords
                                    ? 'border-brand-primary/30 bg-brand-secondary/10 text-brand-primary'
                                    : 'border-brand-primary bg-brand-primary text-white hover:bg-brand-primary/90'}`}
                    >
                      {geoBusy
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Getting your location…</>
                        : coords
                          ? <><CheckCircle2 className="h-4 w-4" /> Location captured — tap to update</>
                          : <><Crosshair className="h-4 w-4" /> Locate my accurate location</>}
                    </button>

                    {coords && (
                      <p className="mt-2 flex items-start gap-1.5 font-sans text-xs text-brand-primary">
                        <MapPin className="mt-[1px] h-3.5 w-3.5 flex-shrink-0" />
                        {coords.source === 'maps_pin'
                          ? 'Using the pin you set. Your rider gets this exact point.'
                          : `Pinned to within ${Math.round(coords.accuracy ?? 0)} m. `
                            + 'Your rider gets this exact point on their map.'}
                      </p>
                    )}
                    {geoMsg && !coords && (
                      <p className="mt-2 font-sans text-xs text-brand-dark/55">{geoMsg}</p>
                    )}
                    {!coords && !geoMsg && (
                      <p className="mt-2 font-sans text-xs text-brand-dark/45">
                        We use your exact position instead of a typed address so the
                        food reaches you, not the end of your street.
                      </p>
                    )}

                    {/* Optional manual pin. Secondary by design — most people
                        should never need it, but indoors GPS can land a
                        street away and only the customer knows that. */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {MAPS_ENABLED && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowMap((v) => !v);
                            setShowMapsInput(false);
                            setMapsError('');
                          }}
                          className="font-sans text-xs font-semibold text-brand-primary underline underline-offset-2"
                        >
                          {showMap ? 'Hide map' : 'Set the pin on the map instead'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setShowMapsInput((v) => !v); setMapsError(''); }}
                        className="font-sans text-xs text-brand-dark/55 underline underline-offset-2"
                      >
                        {showMapsInput ? 'Hide' : 'Paste coordinates'}
                      </button>
                      {coords && (
                        <a
                          href={mapsLinkFor(coords.lat, coords.lng)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-sans text-xs text-brand-dark/55 underline underline-offset-2"
                        >
                          Check this pin
                        </a>
                      )}
                    </div>

                    {showMap && (
                      <div className="mt-2">
                        <MapPicker
                          initial={coords}
                          busy={geoBusy}
                          onPick={applyMapPick}
                          onCancel={() => setShowMap(false)}
                        />
                      </div>
                    )}

                    {showMapsInput && (
                      <div className="mt-2 rounded-xl border border-brand-primary/15 bg-white p-3">
                        <p className="font-sans text-[11px] leading-relaxed text-brand-dark/55">
                          In Google Maps, long-press your exact spot, then tap the
                          coordinates at the top to copy them. Paste them here.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <input
                            className={inputCls(!!mapsError)}
                            value={mapsInput}
                            onChange={(e) => { setMapsInput(e.target.value); setMapsError(''); }}
                            placeholder="16.3067, 80.4365"
                          />
                          <button
                            type="button"
                            onClick={applyMapsLink}
                            disabled={geoBusy || !mapsInput.trim()}
                            className="flex-shrink-0 rounded-xl border-2 border-brand-primary px-4 font-sans text-sm font-bold
                                       text-brand-primary transition hover:bg-brand-primary hover:text-white
                                       disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Set
                          </button>
                        </div>
                        {mapsError && (
                          <p className="mt-1.5 flex items-start gap-1.5 font-sans text-xs text-red-600">
                            <AlertCircle className="mt-[1px] h-3.5 w-3.5 flex-shrink-0" />{mapsError}
                          </p>
                        )}
                      </div>
                    )}
                  </Field>

                  {/* GPS gives a point, not a door. This is the difference. */}
                  <Field label="Flat / door no. and landmark"
                         hint="what GPS can't tell the rider"
                         error={touched.doorInfo ? errors.doorInfo : ''}>
                    <input className={inputCls(touched.doorInfo && errors.doorInfo)}
                           value={form.doorInfo} onChange={set('doorInfo')} onBlur={blur('doorInfo')}
                           maxLength={140}
                           placeholder="e.g. Flat 302, 3rd floor, blue gate beside the pharmacy" />
                  </Field>

                  <Field label="Cooking instructions" hint="optional" error={touched.note ? errors.note : ''}>
                    <textarea className={`${inputCls(touched.note && errors.note)} min-h-[60px] resize-y`}
                              value={form.note} onChange={set('note')} onBlur={blur('note')}
                              maxLength={200} placeholder="Less spicy, no onion…" />
                  </Field>

                  {/* Honeypot — hidden from people, visible to scripts.
                      Parked off-screen rather than sized to 0: some autofill
                      engines skip zero-size inputs, which would have defeated
                      the trap for bots too. */}
                  <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
                    <input type="text" name="hb_ref_token" id="hb_ref_token"
                           value={trap} onChange={(e) => setTrap(e.target.value)}
                           tabIndex={-1} autoComplete="off" /></div>

                  {/* coupon — hidden entirely when switched off in the
                      dashboard, heading included, so the section closes up
                      rather than leaving a "Coupon" label over blank space. */}
                  {couponEnabled && (
                  <>
                  <h3 className="mb-3 mt-6 font-display text-sm font-bold uppercase tracking-wider text-brand-dark/70">
                    Coupon
                  </h3>

                  {coupon ? (
                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-secondary/40 bg-brand-secondary/10 p-3">
                      <Tag className="h-4 w-4 flex-shrink-0 text-brand-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-sm font-bold text-brand-primary">{coupon.code} applied</p>
                        {coupon.description && (
                          <p className="truncate font-sans text-xs text-brand-dark/55">{coupon.description}</p>
                        )}
                      </div>
                      <button onClick={removeCoupon}
                              className="font-sans text-xs font-bold text-brand-dark/50 underline hover:text-brand-dark">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="mb-2 flex gap-2">
                      <input
                        className={inputCls(false)}
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="Enter code"
                        maxLength={24}
                      />
                      <button
                        onClick={() => applyCoupon(couponInput)}
                        disabled={couponBusy || !couponInput.trim()}
                        className="flex-shrink-0 rounded-xl border-2 border-brand-primary px-5 font-sans text-sm font-bold
                                   text-brand-primary transition hover:bg-brand-primary hover:text-white
                                   disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {couponBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                      </button>
                    </div>
                  )}
                  {couponError && <p className="mb-3 font-sans text-xs text-red-600">{couponError}</p>}
                  </>
                  )}

                  {/* bill */}
                  <div className="mt-6 rounded-2xl bg-white p-5">
                    <div className="flex justify-between py-1 font-sans text-sm">
                      <span className="text-brand-dark/60">Item total</span><span>{inr(totals.subtotal)}</span>
                    </div>
                    {totals.discount > 0 && (
                      <div className="flex justify-between py-1 font-sans text-sm text-brand-primary">
                        <span>Coupon discount</span><span>−{inr(totals.discount)}</span>
                      </div>
                    )}
                    {/* Same lines, same order, same source as the cart page —
                        both read totals, so they cannot drift apart. Charges
                        set to zero in the dashboard are hidden rather than
                        listed as ₹0.00, which reads like a mistake. */}
                    {totals.deliveryCharge > 0 && (
                      <div className="flex justify-between py-1 font-sans text-sm">
                        <span className="text-brand-dark/60">
                          Delivery charge
                          {/* The distance is shown beside the charge because
                              the charge depends on it. A customer who sees
                              ₹36 where they saw ₹20 last week needs to be
                              able to account for it without asking. Until a
                              location is chosen there is no distance, and the
                              figure shown is the base fare — say so rather
                              than implying it is final. */}
                          {totals.deliveryDistanceKm !== null && (
                            <span className="ml-1.5 text-brand-dark/45">
                              · {totals.deliveryDistanceKm} km
                            </span>
                          )}
                          {totals.deliveryDistanceKm === null && (
                            <span className="ml-1.5 text-brand-dark/45">
                              · base fare
                            </span>
                          )}
                        </span>
                        <span>{inr(totals.deliveryCharge)}</span>
                      </div>
                    )}
                    {totals.deliveryCharge > 0 && totals.deliveryDistanceKm === null && (
                      <p className="pb-1 font-sans text-[11px] leading-relaxed text-brand-dark/45">
                        Set your delivery location to see the exact charge for
                        your distance.
                      </p>
                    )}
                    {totals.rainCharge > 0 && (
                      <div className="flex justify-between py-1 font-sans text-sm">
                        <span className="text-brand-dark/60">Rain / peak charge</span>
                        <span>{inr(totals.rainCharge)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 font-sans text-sm">
                      <span className="text-brand-dark/60">Platform fee</span>
                      <span>{totals.platformFee === 0 ? 'Free' : inr(totals.platformFee)}</span>
                    </div>
                    {totals.tax > 0 && (
                      <div className="flex justify-between py-1 font-sans text-sm">
                        <span className="text-brand-dark/60">
                          Taxes &amp; GST{totals.taxRate ? ` (${totals.taxRate}%)` : ''}
                        </span>
                        <span>{inr(totals.tax)}</span>
                      </div>
                    )}
                    <div className="mt-3 flex justify-between border-t border-brand-primary/10 pt-3 font-display text-lg font-bold text-brand-dark">
                      <span>To pay</span><span>{inr(totals.grand)}</span>
                    </div>
                  </div>

                  {areaError && (
                    <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 font-sans text-xs text-amber-900">
                      <MapPin className="mt-[1px] h-4 w-4 flex-shrink-0" />{areaError}
                    </p>
                  )}

                  {fatal && (
                    <p className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 font-sans text-xs text-red-700">
                      <AlertCircle className="mt-[1px] h-4 w-4 flex-shrink-0" />{fatal}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* footer */}
            {isSignedIn && items.length > 0 && (
              <div className="border-t border-brand-primary/10 bg-white px-6 py-4">
                {/* How to pay. Only shown when there's a real choice to make —
                    while the live keyset is in review, cash is the only route
                    and a disabled radio button would just raise questions. */}
                {ONLINE_ENABLED && (
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    {[
                      ['COD', 'Cash on delivery', Wallet],
                      ['ONLINE', 'Pay online', ShieldCheck],
                    ].map(([val, label, Icon]) => {
                      const blocked = val === 'COD' && !codEligible;
                      return (
                        <button
                          key={val}
                          type="button"
                          disabled={blocked}
                          onClick={() => setPayMethod(val)}
                          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3
                                      font-sans text-[13px] font-bold transition
                                      disabled:cursor-not-allowed disabled:opacity-45
                                      ${payMethod === val
                                        ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                                        : 'border-brand-primary/15 text-brand-dark/60 hover:border-brand-primary/40'}`}
                        >
                          <Icon className="h-4 w-4" /> {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* The server writes this sentence. It knows whether the block
                    is a support action, an abuse lock with hours left, a value
                    limit or a coverage gap; a hardcoded string here could only
                    ever describe one of them, and would drift from the app's. */}
                {!codEligible && codMessage && (
                  <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2
                                font-sans text-[11px] leading-relaxed text-amber-900">
                    {codMessage}
                  </p>
                )}

                <button
                  onClick={placeOrder}
                  // Location is now a hard requirement, so the button stays
                  // disabled until it's captured rather than letting someone
                  // reach the payment sheet and fail there.
                  disabled={busy || !formValid || !coords || !storeOpen}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-6 py-4
                             font-sans text-sm font-bold text-white transition hover:bg-brand-primary/90
                             disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                        : !storeOpen ? <>Kitchen closed</>
                        : payMethod === 'COD'
                          ? <>Place order · Pay {inr(totals.grand)} on delivery</>
                          : <>Pay {inr(totals.grand)} securely</>}
                </button>
                <p className="mt-2.5 flex items-center justify-center gap-1.5 font-sans text-[11px] text-brand-dark/45">
                  {payMethod === 'COD'
                    ? <><Wallet className="h-3.5 w-3.5" /> Pay the rider in cash when your food arrives</>
                    : <><ShieldCheck className="h-3.5 w-3.5" /> Payments processed by Razorpay</>}
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Confirmation shown after a successful capture. */
/**
 * Live delivery code for a freshly placed order.
 *
 * The code is not written by the browser — `onOrderCreatedIssueCode` generates
 * it server-side with crypto.randomInt the moment the order document appears,
 * which is what stops a customer from choosing their own. That means it isn't
 * there at the instant this screen opens, so we subscribe and let it arrive
 * (typically under two seconds).
 *
 * Website customers had no way to see it at all: the code shows on the mobile
 * app's order screens, and someone who ordered from the website has no app.
 * The rider would ask for a number the customer had never been given.
 */
function DeliveryCode({ docId }) {
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!db || !docId) return undefined;
    return onSnapshot(
      doc(db, 'orders', docId),
      (snap) => setCode(String(snap.data()?.verificationCode || '')),
      () => { /* tracking page shows it too; no need to alarm anyone here */ },
    );
  }, [docId]);

  return (
    <div className="mb-6 rounded-2xl border border-brand-primary/15 bg-brand-primary/5 p-4">
      <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-brand-dark/50">
        Delivery code
      </p>
      <p className="my-1 font-display text-3xl font-bold tracking-[0.3em] text-brand-primary">
        {code || '····'}
      </p>
      <p className="font-sans text-[11px] leading-relaxed text-brand-dark/55">
        {code
          ? 'Read this out to the rider when your food arrives. Only give it once you have your order.'
          : 'Generating your code…'}
      </p>
    </div>
  );
}

export function OrderPlaced({ result, onTrack, onClose }) {
  if (!result) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-brand-dark/60 p-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl"
      >
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-brand-secondary/15">
          <CheckCircle2 className="h-9 w-9 text-brand-primary" />
        </div>
        <h3 className="mb-1.5 font-display text-2xl font-bold text-brand-primary">Order placed</h3>
        <p className="mb-1 font-sans text-sm text-brand-dark/60">Your order number is</p>
        <p className="mb-5 font-display text-lg font-bold tracking-wide text-brand-dark">{result.orderId}</p>

        <DeliveryCode docId={result.docId} />

        <p className="mb-6 font-sans text-[13px] leading-relaxed text-brand-dark/55">
          We'll call you shortly to confirm the delivery time. You can follow
          its progress on the tracking page.
        </p>
        <button onClick={onTrack}
                className="mb-2 w-full rounded-xl bg-brand-primary px-6 py-3.5 font-sans text-sm font-bold text-white transition hover:bg-brand-primary/90">
          Track my order
        </button>
        <button onClick={onClose}
                className="w-full rounded-xl px-6 py-3 font-sans text-sm font-semibold text-brand-dark/60 transition hover:text-brand-dark">
          Back to menu
        </button>
      </motion.div>
    </motion.div>
  );
}
