import React, { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { loadGoogleMaps, MAPS_ENABLED } from '../../lib/googleMaps';

/**
 * Live map showing the rider, the delivery address and the road route between
 * them.
 *
 * Uses `google.maps.DirectionsService` from the JS SDK rather than the REST
 * Directions endpoint the mobile app calls. The REST API rejects browser
 * requests — it has no CORS headers and is documented as server-side only — so
 * porting the app's `google_directions_service.dart` literally would have
 * produced a route that worked on the phone and silently failed on the web.
 * The JS SDK is the browser-side equivalent of the same product and the same
 * quota.
 *
 * The route is only re-requested when the rider has moved more than
 * ROUTE_REFRESH_M, mirroring `_routeRefreshKm` in the app. Requesting on every
 * GPS ping would burn Directions quota several times a minute and make the
 * polyline flicker.
 *
 * There is deliberately no fallback route. If Directions fails, the map falls
 * back to a plain straight line clearly labelled as such — the app's service
 * carries the same rule, and for the same reason: a fabricated route is worse
 * than none, because the customer cannot tell it is wrong.
 */

const ROUTE_REFRESH_M = 150;

function metresBetween(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function LiveTrackMap({ rider, destination, onRoute, className = '' }) {
  const holderRef = useRef(null);
  const mapRef = useRef(null);
  const riderMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
  const straightLineRef = useRef(null);
  const lastRouteOriginRef = useRef(null);
  const directionsRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadGoogleMaps();
      if (cancelled || !ok || !holderRef.current) { setFailed(true); return; }
      const g = window.google.maps;
      mapRef.current = new g.Map(holderRef.current, {
        center: rider || destination || { lat: 16.3067, lng: 80.4365 },
        zoom: 14,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
      });
      directionsRef.current = new g.DirectionsService();
      setReady(true);
    })();
    return () => { cancelled = true; };
    // Runs once: re-creating the map on every position update would reset the
    // customer's pan and zoom mid-delivery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- markers -------------------------------------------------------------
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = window.google.maps;
    const map = mapRef.current;

    if (destination) {
      if (destMarkerRef.current) destMarkerRef.current.setPosition(destination);
      else destMarkerRef.current = new g.Marker({
        position: destination, map, title: 'Your delivery address',
        icon: { path: g.SymbolPath.CIRCLE, scale: 7, fillColor: '#0B4D3B',
                fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
      });
    }

    if (rider) {
      if (riderMarkerRef.current) riderMarkerRef.current.setPosition(rider);
      else riderMarkerRef.current = new g.Marker({
        position: rider, map, title: 'Your rider', zIndex: 2,
        icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: '#FF7A00',
                fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 },
      });
    }
  }, [ready, rider, destination]);

  // ---- route ---------------------------------------------------------------
  useEffect(() => {
    if (!ready || !mapRef.current || !rider || !destination) return;
    const g = window.google.maps;
    const map = mapRef.current;

    const moved = metresBetween(lastRouteOriginRef.current, rider);
    if (moved < ROUTE_REFRESH_M && routeLineRef.current) {
      // Close enough to the last routed position — keep the existing polyline
      // and just let the marker move along it.
      return;
    }

    let cancelled = false;
    directionsRef.current.route(
      {
        origin: rider,
        destination,
        travelMode: g.TravelMode.DRIVING,
        // Traffic-aware duration. Requires Directions enabled *and* billing
        // active on the key; without billing the SDK returns REQUEST_DENIED,
        // which is surfaced below rather than swallowed.
        drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' },
      },
      (result, status) => {
        if (cancelled) return;

        if (status !== 'OK' || !result?.routes?.length) {
          console.warn('[directions] route unavailable:', status);
          // Straight line, and the caller is told there is no real route so it
          // can label the distance honestly.
          if (!straightLineRef.current) {
            straightLineRef.current = new g.Polyline({
              path: [rider, destination], map, geodesic: true,
              strokeColor: '#FF7A00', strokeOpacity: 0.4, strokeWeight: 3,
            });
          } else {
            straightLineRef.current.setPath([rider, destination]);
            straightLineRef.current.setMap(map);
          }
          onRoute?.(null);
          return;
        }

        const leg = result.routes[0].legs[0];
        lastRouteOriginRef.current = rider;

        // Real route replaces the straight line entirely.
        straightLineRef.current?.setMap(null);

        const path = result.routes[0].overview_path;
        if (routeLineRef.current) {
          routeLineRef.current.setPath(path);
        } else {
          routeLineRef.current = new g.Polyline({
            path, map, strokeColor: '#FF7A00', strokeOpacity: 0.85, strokeWeight: 4,
          });
        }

        map.fitBounds(result.routes[0].bounds, 72);

        onRoute?.({
          distanceText: leg.distance?.text || '',
          distanceKm: (leg.distance?.value || 0) / 1000,
          // duration_in_traffic is only present when billing allows it; the
          // plain duration is the fallback so the ETA never disappears.
          durationText: leg.duration_in_traffic?.text || leg.duration?.text || '',
          durationMinutes: Math.round(
            (leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0) / 60,
          ),
          trafficAware: Boolean(leg.duration_in_traffic),
        });
      },
    );

    return () => { cancelled = true; };
  }, [ready, rider, destination, onRoute]);

  if (!MAPS_ENABLED || failed) {
    return (
      <div className={`grid place-items-center rounded-2xl border border-brand-primary/10 bg-brand-offwhite ${className}`}>
        <div className="px-6 text-center">
          <MapPin className="mx-auto mb-2 h-6 w-6 text-brand-dark/25" />
          <p className="font-sans text-xs font-bold text-brand-dark/55">
            {MAPS_ENABLED ? 'Map could not load' : 'Map not configured'}
          </p>
          <p className="mt-0.5 font-sans text-[11px] text-brand-dark/40">
            Your order is still on its way — only the map is unavailable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={holderRef}
         className={`overflow-hidden rounded-2xl border border-brand-primary/10 bg-brand-offwhite ${className}`} />
  );
}
