import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Crosshair, Search, LocateFixed, X, MapPin, AlertTriangle, Check } from 'lucide-react';
import { loadGoogleMaps } from '../lib/googleMaps';
import {
  GUNTUR_CENTER, checkCoordinates, getBrowserLocation,
} from '../lib/serviceArea';
import { deliveryFeeConfig, computeDeliveryCharge, haversineKm } from '../lib/deliveryFee';
import { useAppSettings } from '../lib/useAppSettings';

/**
 * Choosing where the food goes.
 *
 * The pin is fixed at the centre of the frame and the map moves underneath
 * it, rather than the marker being dragged. On a phone that matters: dragging
 * a small marker means your fingertip covers the exact thing you are aiming
 * at. Swiggy, Zomato and Uber all landed on the same pattern.
 *
 * ## What changed, and why
 *
 * This used to be a bare map with a crosshair and a confirm button. The
 * customer panned, pressed confirm, and only then found out whether we
 * deliver there — and never found out what delivery would cost until the
 * bill appeared two steps later. Delivery is now priced by distance, so that
 * gap is worse than untidy: the fee is the thing most likely to change the
 * customer's mind, and it was hidden until after the decision.
 *
 * So the panel under the map answers the three questions live, as the map
 * settles: where is this, do we deliver there, and what will delivery cost.
 *
 * ## `onPick` still only fires on confirm
 *
 * Panning resolves an address and a price but commits nothing. A stray scroll
 * must not silently move someone's delivery address. Everything below the map
 * is a preview of what confirming would do.
 *
 * ## The price shown here is a preview
 *
 * It comes from `lib/deliveryFee.js` and the live `appSettings/general`
 * config — the same rule the server uses. What the customer actually pays is
 * recomputed in `onOrderCreatedVerifyTotals` from the order's own
 * coordinates. This exists so the preview is honest, not so the browser can
 * decide the price.
 */

/** How long the map must sit still before we spend a geocode on it. */
const SETTLE_MS = 450;

export default function MapPicker({ initial, busy, onPick, onCancel }) {
  const holderRef = useRef(null);
  const mapRef = useRef(null);
  const searchRef = useRef(null);
  const acRef = useRef(null);
  const geocoderRef = useRef(null);
  const settleTimer = useRef(null);
  const seq = useRef(0);

  const centreRef = useRef(
    Number.isFinite(initial?.lat) && Number.isFinite(initial?.lng)
      ? { lat: initial.lat, lng: initial.lng }
      : GUNTUR_CENTER,
  );

  const settings = useAppSettings();

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');

  /* What the currently-centred point resolves to. `null` while a lookup is in
   * flight, so the panel can show it is thinking rather than showing a stale
   * address next to a moved pin — the one thing that would make a customer
   * confirm the wrong place. */
  const [spot, setSpot] = useState(null);
  const [resolving, setResolving] = useState(false);

  /** Reverse geocode + coverage + fee for a point. */
  const resolve = useCallback(async (lat, lng) => {
    const mine = ++seq.current;
    setResolving(true);

    let label = '';
    try {
      const g = geocoderRef.current;
      if (g) {
        const res = await g.geocode({ location: { lat, lng } });
        label = res?.results?.[0]?.formatted_address || '';
      }
    } catch {
      // A geocode failure must not block the pick. The coordinates are what
      // the rider navigates by; the text is a courtesy so the customer can
      // recognise the place.
      label = '';
    }

    let cover;
    try {
      cover = await checkCoordinates(lat, lng);
    } catch {
      // Same principle: an unreachable serviceAreas read must not refuse a
      // customer we do deliver to. The server re-checks on order creation.
      cover = { ok: true, unknown: true };
    }

    // Distance is measured from the configured service centre, the same point
    // the server measures from — not from the nearest service area, which
    // would price two customers differently for the same journey.
    const cLat = Number(settings.centerLatitude);
    const cLng = Number(settings.centerLongitude);
    const haveCentre = Number.isFinite(cLat) && Number.isFinite(cLng)
      && !(cLat === 0 && cLng === 0);
    const distanceKm = haveCentre ? haversineKm(cLat, cLng, lat, lng) : null;
    const fee = computeDeliveryCharge(distanceKm, deliveryFeeConfig(settings.raw || {}));

    if (mine !== seq.current) return;   // a newer pan won
    setSpot({
      label,
      ok: cover.ok !== false,
      areaName: cover.areaName || '',
      error: cover.error || '',
      distanceKm: distanceKm === null ? null : Number(distanceKm.toFixed(1)),
      fee,
      knownCentre: haveCentre,
    });
    setResolving(false);
  }, [settings.centerLatitude, settings.centerLongitude, settings.raw]);

  /** Debounced: only resolve once the map has actually stopped. */
  const scheduleResolve = useCallback(() => {
    clearTimeout(settleTimer.current);
    setSpot(null);
    settleTimer.current = setTimeout(() => {
      const c = centreRef.current;
      resolve(c.lat, c.lng);
    }, SETTLE_MS);
  }, [resolve]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ok = await loadGoogleMaps();
      if (cancelled) return;
      if (!ok || !holderRef.current) { setFailed(true); return; }

      const maps = window.google.maps;
      const MapCtor = maps.Map || (await maps.importLibrary('maps')).Map;
      if (cancelled || !holderRef.current || !MapCtor) { setFailed(true); return; }

      const map = new MapCtor(holderRef.current, {
        center: centreRef.current,
        // Close enough to tell one building from the next. Opening zoomed out
        // invites a pin dropped on roughly the right street, which is the
        // imprecision this control exists to remove.
        zoom: 18,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',   // one-finger pan inside a scrolling modal
        clickableIcons: false,       // tapping a shop shouldn't open its card
      });

      // Kept in a ref, not state. The centre changes on every animation frame
      // while panning, and re-rendering React that often would make the map
      // stutter on a mid-range phone.
      map.addListener('center_changed', () => {
        const c = map.getCenter();
        centreRef.current = { lat: c.lat(), lng: c.lng() };
      });
      // `idle` is the settled signal; the debounce above guards against the
      // burst of idles a flick produces.
      map.addListener('idle', scheduleResolve);

      try { geocoderRef.current = new maps.Geocoder(); } catch { geocoderRef.current = null; }

      /* Places autocomplete, when the key has the Places library enabled.
       * Wrapped because a key without Places throws on construction, and a
       * missing search box is a far smaller loss than a dead picker. */
      try {
        if (maps.places?.Autocomplete && searchRef.current) {
          const ac = new maps.places.Autocomplete(searchRef.current, {
            fields: ['geometry', 'formatted_address', 'name'],
            componentRestrictions: { country: 'in' },
          });
          ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            const loc = place?.geometry?.location;
            if (!loc) return;
            const next = { lat: loc.lat(), lng: loc.lng() };
            centreRef.current = next;
            map.panTo(next);
            map.setZoom(18);
            scheduleResolve();
          });
          acRef.current = ac;
        }
      } catch {
        acRef.current = null;
      }

      mapRef.current = map;
      setReady(true);
      scheduleResolve();
    })();

    return () => {
      cancelled = true;
      clearTimeout(settleTimer.current);
      mapRef.current = null;
    };
    // Mount-only on purpose: re-running would throw away the customer's pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Move the map to the device's position. One shot — this is address
   *  selection, not tracking, so nothing is watched after this resolves. */
  async function useCurrentLocation() {
    setLocateError('');
    setLocating(true);
    try {
      // Resolves `{ ok: false, error }` rather than rejecting — permission
      // denial is an expected outcome here, not an exception. Catching only
      // thrown errors would silently treat a denied prompt as a success and
      // pan the map to `undefined, undefined`.
      const pos = await getBrowserLocation();
      if (!pos?.ok || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) {
        setLocateError(
          pos?.error
          || 'Could not get your location. Move the map to your door instead.',
        );
        return;
      }
      const next = { lat: pos.lat, lng: pos.lng };
      centreRef.current = next;
      if (mapRef.current) {
        mapRef.current.panTo(next);
        mapRef.current.setZoom(18);
      }
      scheduleResolve();
    } catch {
      // The promise is not supposed to reject; if a future change makes it,
      // the picker must still be usable by panning.
      setLocateError('Could not get your location. Move the map to your door instead.');
    } finally {
      setLocating(false);
    }
  }

  if (failed) {
    return (
      <p className="rounded-xl bg-amber-50 p-3 font-sans text-[11px] leading-relaxed text-amber-900">
        The map could not load. Tap <strong>Paste coordinates</strong> above and
        enter your location from the Google Maps app instead — long-press your
        spot, then tap the coordinates at the top to copy them.
      </p>
    );
  }

  const outside = spot && !spot.ok;
  const canConfirm = ready && !busy && !resolving && !outside;

  return (
    <div>
      {/* Search sits above the map, where a customer looks first. It stays
          rendered even when Places is unavailable so the layout does not jump;
          it simply does nothing, and the map is still the way through. */}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-dark/35" />
        <input
          ref={searchRef}
          type="text"
          placeholder="Search a street, landmark or area"
          aria-label="Search for your delivery location"
          className="w-full rounded-xl border border-brand-primary/15 bg-white py-3 pl-9 pr-3
                     font-sans text-sm text-brand-dark placeholder:text-brand-dark/35
                     focus:border-brand-primary focus:outline-none"
          onKeyDown={(e) => {
            // The form this sits inside would otherwise submit on Enter while
            // the customer is picking a suggestion.
            if (e.key === 'Enter') e.preventDefault();
          }}
        />
      </div>

      <div className="relative overflow-hidden rounded-xl border border-brand-primary/15">
        <div ref={holderRef} className="h-64 w-full bg-brand-primary/5 sm:h-72" />

        {/* The pin. pointer-events-none so it never swallows a drag meant for
            the map underneath it. Sized and shadowed to read as a deliberate
            marker rather than Google's default teardrop, and lifted by half
            its height so the point — not the centre of the head — sits on the
            map centre the coordinates come from. */}
        {ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex -translate-y-4 flex-col items-center">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full
                               shadow-lg ring-4 ring-white/70 transition-colors
                               ${outside ? 'bg-red-500' : 'bg-brand-primary'}`}>
                <MapPin className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div className={`h-3 w-[3px] ${outside ? 'bg-red-500' : 'bg-brand-primary'}`} />
              <div className="h-1.5 w-1.5 rounded-full bg-black/25 blur-[1px]" />
            </div>
          </div>
        )}

        {/* Current location, floated over the map in the corner every mapping
            app puts it. */}
        {ready && (
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            aria-label="Use my current location"
            className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center
                       rounded-full bg-white shadow-md ring-1 ring-black/5 transition
                       hover:bg-brand-primary/5 disabled:opacity-60"
          >
            {locating
              ? <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
              : <LocateFixed className="h-4 w-4 text-brand-primary" />}
          </button>
        )}

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
          </div>
        )}
      </div>

      {locateError && (
        <p className="mt-2 flex items-start gap-1.5 font-sans text-[11px] leading-relaxed text-amber-700">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          {locateError}
        </p>
      )}

      {/* The answer panel: where, whether we deliver, and what it costs. */}
      <div className={`mt-2 rounded-xl border px-3 py-2.5 transition-colors
                       ${outside
                         ? 'border-red-200 bg-red-50'
                         : 'border-brand-primary/15 bg-brand-primary/[0.04]'}`}>
        {resolving || !spot ? (
          <div className="flex items-center gap-2 font-sans text-[13px] text-brand-dark/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Finding this place…
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2">
              {outside
                ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                : <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />}
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[13px] font-semibold leading-snug text-brand-dark">
                  {spot.label || 'Pinned location'}
                </p>
                {outside ? (
                  <p className="mt-0.5 font-sans text-[11px] leading-relaxed text-red-700">
                    {spot.error || 'We do not deliver to this location yet.'}
                  </p>
                ) : (
                  <p className="mt-0.5 font-sans text-[11px] text-brand-dark/55">
                    {spot.areaName ? `Delivering to ${spot.areaName}` : 'We deliver here'}
                  </p>
                )}
              </div>
            </div>

            {/* The fee, only when we would actually charge it. Quoting a
                delivery price for somewhere we do not deliver is noise at
                best and misleading at worst. */}
            {!outside && spot.knownCentre && (
              <div className="mt-2 flex items-center justify-between border-t border-brand-primary/10 pt-2">
                <span className="font-sans text-[11px] text-brand-dark/55">
                  Delivery{spot.distanceKm !== null ? ` · ${spot.distanceKm} km` : ''}
                </span>
                <span className="font-sans text-[13px] font-bold text-brand-dark">
                  ₹{spot.fee}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <p className="mt-2 font-sans text-[11px] leading-relaxed text-brand-dark/55">
        Move the map so the pin sits on your door, then confirm. Zoom in for a
        more exact spot — this is what the rider navigates to.
      </p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => onPick({ ...centreRef.current })}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3
                     font-sans text-sm font-bold text-white transition hover:bg-brand-primary/90
                     disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</>
            : <><Crosshair className="h-4 w-4" /> {outside ? 'Not deliverable' : 'Use this location'}</>}
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="flex items-center justify-center rounded-xl border border-brand-primary/15 px-4
                     font-sans text-sm font-semibold text-brand-dark/60 transition
                     hover:border-brand-primary/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
