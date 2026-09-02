import React, { useState } from 'react';
import {
  Home, Briefcase, MapPin, Pencil, Trash2, Plus, Loader2,
  AlertTriangle, Check, X,
} from 'lucide-react';
import MapPicker from './MapPicker';
import { useAddresses } from '../lib/useAddresses';

/**
 * Saved addresses: list, add, edit, delete, choose.
 *
 * ## Only the fields that exist
 *
 * The `addresses` document has `label`, `addressLine`, `latitude`,
 * `longitude`, and optional `houseNumber` and `landmark`. There is no city,
 * state, pincode or contact field on it — those live inside `addressLine` as
 * free text, composed by reverse geocoding. This form therefore collects
 * exactly what the schema holds. Adding separate city/pincode inputs would
 * create a second address shape the Flutter app cannot read, which is the one
 * thing that would actually break the ecosystem.
 *
 * ## Labels
 *
 * `label` is free text in the data model (2–24 characters), and the app's own
 * hint is "e.g. Home, Work, Gym". Chips are an improvement on the app's plain
 * text field, so Home and Work are offered as one tap and "Other" reveals the
 * text input — which keeps every value the chips produce valid against the
 * same schema and the same validator.
 *
 * ## Coordinates are never typed
 *
 * They come from the map, and they are never shown to the customer. A
 * latitude is not information a person ordering dinner can act on.
 */

const LABEL_MAX = 24;
const QUICK_LABELS = ['Home', 'Work'];

function labelIcon(label) {
  const l = String(label || '').trim().toLowerCase();
  if (l === 'home') return Home;
  if (l === 'work' || l === 'office') return Briefcase;
  return MapPin;
}

/** The map step and the details step, in one sheet. */
function AddressEditor({ existing, onCancel, onSaved, save }) {
  // Editing opens at the address's own pin, so the customer sees where it
  // currently points before changing anything.
  const [point, setPoint] = useState(
    existing && existing.usable
      ? { lat: existing.latitude, lng: existing.longitude }
      : null,
  );
  const [showMap, setShowMap] = useState(!existing || !existing.usable);

  const [label, setLabel] = useState(existing?.label || 'Home');
  const [customLabel, setCustomLabel] = useState(
    existing && !QUICK_LABELS.includes(existing.label) ? existing.label : '',
  );
  const [useCustom, setUseCustom] = useState(
    Boolean(existing && !QUICK_LABELS.includes(existing.label)),
  );
  const [addressLine, setAddressLine] = useState(existing?.addressLine || '');
  const [houseNumber, setHouseNumber] = useState(existing?.houseNumber || '');
  const [landmark, setLandmark] = useState(existing?.landmark || '');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const effectiveLabel = useCustom ? customLabel.trim() : label;

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!point) { setErr('Choose the delivery location on the map first.'); return; }
    if (effectiveLabel.length < 2) { setErr('Give this address a label.'); return; }
    if (addressLine.trim().length < 8) {
      setErr('Enter the full address, including the house or flat number.');
      return;
    }
    setBusy(true);
    try {
      await save({
        label: effectiveLabel,
        addressLine: addressLine.trim(),
        houseNumber: houseNumber.trim(),
        landmark: landmark.trim(),
        latitude: point.lat,
        longitude: point.lng,
        // A pin the customer placed themselves, recorded the way the app
        // records it so the rider sees the same provenance either way.
        source: 'customer_maps_pin',
      });
      onSaved();
    } catch (e2) {
      setErr(e2?.message || 'Could not save that address.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {showMap ? (
        <MapPicker
          initial={point}
          busy={busy}
          onPick={(p) => { setPoint(p); setShowMap(false); }}
          onCancel={() => (point ? setShowMap(false) : onCancel())}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowMap(true)}
          className="flex w-full items-start gap-2 rounded-xl border border-brand-primary/15
                     bg-brand-primary/[0.04] px-3 py-2.5 text-left transition
                     hover:border-brand-primary/40"
        >
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
          <span className="min-w-0 flex-1">
            <span className="block font-sans text-[13px] font-semibold text-brand-dark">
              Delivery location set
            </span>
            <span className="block font-sans text-[11px] text-brand-dark/55">
              Tap to move the pin
            </span>
          </span>
        </button>
      )}

      {!showMap && (
        <>
          <div>
            <span className="mb-1.5 block font-sans text-[11px] font-semibold uppercase tracking-wide text-brand-dark/50">
              Save as
            </span>
            <div className="flex flex-wrap gap-2">
              {QUICK_LABELS.map((l) => {
                const Icon = labelIcon(l);
                const active = !useCustom && label === l;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => { setUseCustom(false); setLabel(l); }}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2
                                font-sans text-[13px] font-semibold transition
                                ${active
                                  ? 'border-brand-primary bg-brand-primary text-white'
                                  : 'border-brand-primary/20 text-brand-dark/70 hover:border-brand-primary/50'}`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {l}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setUseCustom(true)}
                aria-pressed={useCustom}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2
                            font-sans text-[13px] font-semibold transition
                            ${useCustom
                              ? 'border-brand-primary bg-brand-primary text-white'
                              : 'border-brand-primary/20 text-brand-dark/70 hover:border-brand-primary/50'}`}
              >
                <MapPin className="h-3.5 w-3.5" /> Other
              </button>
            </div>
            {useCustom && (
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value.slice(0, LABEL_MAX))}
                placeholder="Gym, Mum's place…"
                aria-label="Address label"
                className="mt-2 w-full rounded-xl border border-brand-primary/15 px-3 py-2.5
                           font-sans text-sm text-brand-dark focus:border-brand-primary focus:outline-none"
              />
            )}
          </div>

          <label className="block">
            <span className="mb-1.5 block font-sans text-[11px] font-semibold uppercase tracking-wide text-brand-dark/50">
              Full address
            </span>
            <textarea
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value.slice(0, 200))}
              rows={3}
              placeholder="Flat, building, street, area and pincode"
              className="w-full resize-none rounded-xl border border-brand-primary/15 px-3 py-2.5
                         font-sans text-sm text-brand-dark focus:border-brand-primary focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block font-sans text-[11px] font-semibold uppercase tracking-wide text-brand-dark/50">
                House / flat <span className="font-normal normal-case">(optional)</span>
              </span>
              <input
                type="text"
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value.slice(0, 60))}
                className="w-full rounded-xl border border-brand-primary/15 px-3 py-2.5
                           font-sans text-sm text-brand-dark focus:border-brand-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-sans text-[11px] font-semibold uppercase tracking-wide text-brand-dark/50">
                Landmark <span className="font-normal normal-case">(optional)</span>
              </span>
              <input
                type="text"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value.slice(0, 80))}
                placeholder="Opposite the temple"
                className="w-full rounded-xl border border-brand-primary/15 px-3 py-2.5
                           font-sans text-sm text-brand-dark focus:border-brand-primary focus:outline-none"
              />
            </label>
          </div>

          {err && (
            <p className="flex items-start gap-1.5 font-sans text-[12px] text-red-600">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {err}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-primary
                         px-4 py-3 font-sans text-sm font-bold text-white transition
                         hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {existing ? 'Save changes' : 'Save address'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-brand-primary/15 px-4 font-sans text-sm
                         font-semibold text-brand-dark/60 transition hover:border-brand-primary/40"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </form>
  );
}

export default function AddressBook({ selectedId, onSelect, onUse }) {
  const {
    addresses, loading, error, createAddress, updateAddress, removeAddress,
  } = useAddresses();

  const [editing, setEditing] = useState(null);   // address object, or 'new'
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busyId, setBusyId] = useState('');

  if (editing) {
    const existing = editing === 'new' ? null : editing;
    return (
      <AddressEditor
        existing={existing}
        onCancel={() => setEditing(null)}
        onSaved={() => setEditing(null)}
        save={(payload) => (existing
          ? updateAddress(existing.id, payload)
          : createAddress(payload))}
      />
    );
  }

  return (
    <div className="space-y-2">
      {loading && (
        <div className="space-y-2" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="h-[86px] animate-pulse rounded-xl bg-brand-primary/5" />
          ))}
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 font-sans text-[12px] text-red-600">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {!loading && !error && addresses.length === 0 && (
        <div className="rounded-xl border border-dashed border-brand-primary/25 px-4 py-6 text-center">
          <MapPin className="mx-auto h-6 w-6 text-brand-primary/40" />
          <p className="mt-2 font-sans text-[13px] font-semibold text-brand-dark">
            No saved addresses yet
          </p>
          <p className="mt-0.5 font-sans text-[11px] text-brand-dark/55">
            Add one and we&rsquo;ll remember it for next time.
          </p>
        </div>
      )}

      {addresses.map((a) => {
        const Icon = labelIcon(a.label);
        const selected = a.id === selectedId;
        return (
          <div
            key={a.id}
            className={`rounded-xl border px-3 py-3 transition
                        ${selected
                          ? 'border-brand-primary bg-brand-primary/[0.06] ring-1 ring-brand-primary/30'
                          : 'border-brand-primary/15 hover:border-brand-primary/35'}`}
          >
            <div className="flex items-start gap-2.5">
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                                ${selected ? 'bg-brand-primary text-white' : 'bg-brand-primary/10 text-brand-primary'}`}>
                <Icon className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-sans text-[13px] font-bold text-brand-dark">{a.label}</p>
                  {selected && (
                    <span className="flex items-center gap-0.5 rounded-full bg-brand-primary px-1.5 py-0.5
                                     font-sans text-[9px] font-bold uppercase tracking-wide text-white">
                      <Check className="h-2.5 w-2.5" /> Selected
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-sans text-[12px] leading-snug text-brand-dark/65">
                  {a.addressLine}
                </p>
                {/* Rendered only when present — an empty "Landmark:" line is
                    worse than no line. */}
                {a.landmark && (
                  <p className="mt-0.5 font-sans text-[11px] text-brand-dark/45">
                    Landmark: {a.landmark}
                  </p>
                )}
                {!a.usable && (
                  <p className="mt-1 flex items-start gap-1 font-sans text-[11px] text-amber-700">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                    This address has no map location — edit it and place the pin
                    so a rider can find it.
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  aria-label={`Edit ${a.label}`}
                  className="rounded-lg p-1.5 text-brand-dark/45 transition hover:bg-brand-primary/10 hover:text-brand-primary"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(a)}
                  aria-label={`Delete ${a.label}`}
                  className="rounded-lg p-1.5 text-brand-dark/45 transition hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Deletion asks first, and says what it will not do — a customer
                should not have to wonder whether removing an address rewrites
                the orders that were sent to it. */}
            {confirmDelete?.id === a.id && (
              <div className="mt-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <p className="font-sans text-[12px] font-semibold text-red-900">
                  Delete &ldquo;{a.label}&rdquo;?
                </p>
                <p className="mt-0.5 font-sans text-[11px] leading-relaxed text-red-800/80">
                  Your past orders keep the address they were delivered to.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === a.id}
                    onClick={async () => {
                      setBusyId(a.id);
                      try { await removeAddress(a.id); } finally {
                        setBusyId(''); setConfirmDelete(null);
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5
                               font-sans text-[12px] font-bold text-white transition
                               hover:bg-red-700 disabled:opacity-50"
                  >
                    {busyId === a.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Trash2 className="h-3 w-3" />}
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(null)}
                    className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5
                               font-sans text-[12px] font-semibold text-red-800 transition hover:bg-white"
                  >
                    <X className="h-3 w-3" /> Keep
                  </button>
                </div>
              </div>
            )}

            {onSelect && a.usable && !selected && (
              <button
                type="button"
                onClick={() => { onSelect(a); if (onUse) onUse(a); }}
                className="mt-2 w-full rounded-lg border border-brand-primary/25 py-2
                           font-sans text-[12px] font-bold text-brand-primary transition
                           hover:bg-brand-primary/5"
              >
                Deliver here
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => setEditing('new')}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border
                   border-dashed border-brand-primary/30 py-3 font-sans text-[13px]
                   font-bold text-brand-primary transition hover:bg-brand-primary/5"
      >
        <Plus className="h-4 w-4" /> Add a new address
      </button>
    </div>
  );
}
