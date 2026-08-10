import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Crosshair } from 'lucide-react';
import { loadGoogleMaps } from '../lib/googleMaps';
import { GUNTUR_CENTER } from '../lib/serviceArea';

/**
 * A draggable Google map for choosing the delivery point.
 *
 * Replaces asking the customer to long-press in the Google Maps app, copy a
 * coordinate pair and paste it into a text box — a five-step detour at the
 * last stage of a checkout, which most people abandon rather than finish.
 *
 * The pin is fixed at the centre of the frame and the map moves underneath
 * it, rather than the marker being dragged. On a phone that matters: dragging
 * a small marker means your fingertip covers the exact thing you're aiming
 * at. Swiggy, Zomato and Uber all landed on the same pattern.
 *
 * `onPick` fires only on confirm. Panning alone commits nothing, so a stray
 * scroll can't silently move someone's delivery address.
 */
export default function MapPicker({ initial, busy, onPick, onCancel }) {
  const holderRef = useRef(null);
  const mapRef = useRef(null);
  const centreRef = useRef(
    initial?.lat && initial?.lng
      ? { lat: initial.lat, lng: initial.lng }
      : GUNTUR_CENTER,
  );

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ok = await loadGoogleMaps();
      if (cancelled) return;
      if (!ok || !holderRef.current) { setFailed(true); return; }

      // loadGoogleMaps only resolves true once google.maps.Map exists, so the
      // constructor is safe to use directly here. The importLibrary route is
      // kept as a fallback for the case where a future API version ships Map
      // lazily — it's a no-op today.
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

      mapRef.current = map;
      setReady(true);
    })();

    return () => { cancelled = true; mapRef.current = null; };
    // Mount-only on purpose: re-running would throw away the customer's pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <p className="rounded-xl bg-amber-50 p-3 font-sans text-[11px] leading-relaxed text-amber-900">
        The map could not load. Tap <strong>Paste coordinates</strong> above and
        enter your location from the Google Maps app instead — long-press your
        spot, then tap the coordinates at the top to copy them.
      </p>
    );
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-brand-primary/15">
        <div ref={holderRef} className="h-56 w-full bg-brand-primary/5" />

        {/* Crosshair. pointer-events-none so it never swallows a drag meant
            for the map underneath it. */}
        {ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="-translate-y-3">
              <div className="mx-auto h-8 w-8 rounded-full border-[3px] border-brand-primary bg-white/60 shadow-lg" />
              <div className="mx-auto -mt-1 h-3 w-[3px] bg-brand-primary" />
            </div>
          </div>
        )}

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
          </div>
        )}
      </div>

      <p className="mt-2 font-sans text-[11px] leading-relaxed text-brand-dark/55">
        Move the map so the pin sits on your door, then confirm. Zoom in for a
        more exact spot — this is what the rider navigates to.
      </p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => onPick({ ...centreRef.current })}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3
                     font-sans text-sm font-bold text-white transition hover:bg-brand-primary/90
                     disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</>
            : <><Crosshair className="h-4 w-4" /> Use this location</>}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-brand-primary/15 px-4 font-sans text-sm font-semibold
                     text-brand-dark/60 transition hover:border-brand-primary/40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
