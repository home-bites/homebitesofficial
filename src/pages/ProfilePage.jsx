import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, addDoc, doc, deleteDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import {
  User, MapPin, LogOut, Plus, Trash2, Check, Loader2, AlertCircle, Mail, Phone,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useAddresses } from '../lib/useAddresses';
import MapPicker from '../components/MapPicker';
import { checkCoordinates } from '../lib/serviceArea';
import PhoneVerify from '../components/app/PhoneVerify';

/**
 * Profile, saved addresses and wallet.
 *
 * The customer may edit their name and manage addresses. They may not touch
 * `role`, `walletBalance`, `loyaltyPoints` or the referral fields — firestore.rules
 * rejects those outright, and nothing here attempts them. The wallet section is
 * strictly a view onto server-owned values.
 *
 * Saved addresses are new to the website. Until now the site kept the delivery
 * location in localStorage and never wrote to the `addresses` collection, so a
 * customer who had only ever used the website had no saved address anywhere —
 * which is what blocked subscriptions for them.
 */

function Field({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 border-b border-brand-primary/8 py-2.5 last:border-0">
      <Icon className="h-4 w-4 shrink-0 text-brand-dark/30" />
      <span className="w-24 shrink-0 font-sans text-[11px] uppercase tracking-wide text-brand-dark/40">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate font-sans text-sm text-brand-dark">
        {value || <span className="text-brand-dark/30">Not set</span>}
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const { user, profile, signOut, updateProfile } = useAuth();
  const { addresses, loading: addrLoading } = useAddresses();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState('');

  const [addingAddress, setAddingAddress] = useState(false);
  const [newLabel, setNewLabel] = useState('Home');
  const [newDoor, setNewDoor] = useState('');
  const [coords, setCoords] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);
  const [busyAddr, setBusyAddr] = useState('');

  const displayName = profile?.name || user?.displayName || '';

  const startEditName = () => {
    setName(displayName);
    setEditingName(true);
  };

  const saveName = async () => {
    const clean = name.trim();
    // Same rule the app applies: a name is letters, spaces and the odd
    // apostrophe. Rejecting here gives a message instead of a silent bad value.
    if (clean.length < 2 || !/^[A-Za-zÀ-ɏ\s'.-]+$/.test(clean)) {
      setError('Enter a real name — letters only, at least two characters.');
      return;
    }
    setSavingName(true);
    setError('');
    try {
      await updateProfile({ name: clean });
      setEditingName(false);
    } catch (e) {
      console.error('[profile] name save failed', e);
      setError('Could not save your name. Please try again.');
    } finally {
      setSavingName(false);
    }
  };

  const saveAddress = async () => {
    if (!coords) { setError('Drop the pin on your building first.'); return; }
    if (newDoor.trim().length < 4) { setError('Add a flat or door number so the rider can find you.'); return; }

    setSavingAddr(true);
    setError('');
    try {
      // The same coverage check the checkout runs before accepting a pin.
      // Without it a customer could save an address outside the delivery zone,
      // set it as default, and only discover the problem at checkout — or
      // worse, on a subscription that had already been paid for.
      const cover = await checkCoordinates(coords.lat, coords.lng);
      if (!cover.ok) {
        // The helper returns `error`, not `message` — using the wrong key
        // would swallow the specific reason ("about 3 km outside our
        // delivery area") and show a vague fallback instead.
        setError(cover.error || 'We do not deliver to that location yet.');
        setSavingAddr(false);
        return;
      }

      await addDoc(collection(db, 'addresses'), {
        userId: user.uid,
        label: newLabel.trim() || 'Home',
        addressLine: newDoor.trim(),
        doorInfo: newDoor.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        // Both spellings, because the app reads lat/lng on some screens and
        // latitude/longitude on others.
        lat: coords.lat,
        lng: coords.lng,
        isDefault: addresses.length === 0,
        createdAt: serverTimestamp(),
      });
      setAddingAddress(false);
      setShowMap(false);
      setNewDoor('');
      setCoords(null);
    } catch (e) {
      console.error('[profile] address save failed', e);
      setError('Could not save that address.');
    } finally {
      setSavingAddr(false);
    }
  };

  const makeDefault = async (id) => {
    setBusyAddr(id);
    try {
      // Batched so there is never a moment with two defaults or none.
      const batch = writeBatch(db);
      addresses.forEach((a) => {
        batch.update(doc(db, 'addresses', a.id), { isDefault: a.id === id });
      });
      await batch.commit();
    } catch (e) {
      console.error('[profile] default address failed', e);
      setError('Could not change your default address.');
    } finally {
      setBusyAddr('');
    }
  };

  const removeAddress = async (id) => {
    if (!window.confirm('Remove this address?')) return;
    setBusyAddr(id);
    try {
      await deleteDoc(doc(db, 'addresses', id));
    } catch (e) {
      console.error('[profile] address delete failed', e);
      setError('Could not remove that address.');
    } finally {
      setBusyAddr('');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
      <h1 className="mb-4 font-display text-xl font-bold text-brand-dark">Profile</h1>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="font-sans text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* ---- account ---- */}
      <section className="mb-5 rounded-2xl border border-brand-primary/10 bg-white p-4">
        <div className="mb-3 flex items-center gap-3">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-primary/10">
              <User className="h-5 w-5 text-brand-primary" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  className="w-full min-w-0 rounded-lg border border-brand-primary/20 px-2.5 py-1.5 font-sans text-sm focus:border-brand-primary focus:outline-none"
                />
                <button onClick={saveName} disabled={savingName}
                        className="shrink-0 rounded-lg bg-brand-primary px-3 font-sans text-xs font-bold text-white disabled:opacity-40">
                  {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                </button>
                <button onClick={() => { setEditingName(false); setError(''); }}
                        className="shrink-0 font-sans text-xs font-bold text-brand-dark/45">
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <p className="truncate font-display text-base font-bold text-brand-dark">
                  {displayName || 'Your name'}
                </p>
                <button onClick={startEditName}
                        className="font-sans text-[11px] font-bold text-brand-primary underline">
                  Edit name
                </button>
              </>
            )}
          </div>
        </div>

        <Field icon={Mail} label="Email" value={user?.email} />
        <Field icon={Phone} label="Mobile"
               value={user?.phoneNumber || profile?.phone || profile?.mobile} />

        {/* Verifying links a real phone credential to this account, so the
            same customer can sign in on the mobile app and reach the same
            orders, wallet and subscriptions. */}
        <div className="mt-3">
          <PhoneVerify />
        </div>
      </section>

      {/*
        Wallet removed for now, by request.

        The balance and ledger are still server-owned and still shown in the
        mobile app — nothing was deleted from the data, only from this page.
        useWallet.js is left in place so restoring the section is a re-render
        rather than a rebuild.
      */}

      {/* ---- addresses ---- */}
      <section className="mb-5 rounded-2xl border border-brand-primary/10 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-wider text-brand-dark/45">
            <MapPin className="h-4 w-4" /> Saved addresses
          </h2>
          {!addingAddress && (
            <button onClick={() => { setAddingAddress(true); setError(''); }}
                    className="flex items-center gap-1 rounded-lg border border-brand-primary/20 px-2.5 py-1 font-sans text-[11px] font-bold text-brand-primary">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          )}
        </div>

        {addingAddress && (
          <div className="mb-4 rounded-xl border border-brand-primary/15 p-3">
            <div className="mb-2 flex gap-2">
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                     placeholder="Label (Home, Work)" maxLength={20}
                     className="w-32 shrink-0 rounded-lg border border-brand-primary/20 px-2.5 py-1.5 font-sans text-xs focus:border-brand-primary focus:outline-none" />
              <input value={newDoor} onChange={(e) => setNewDoor(e.target.value)}
                     placeholder="Flat / door number and landmark" maxLength={120}
                     className="w-full min-w-0 rounded-lg border border-brand-primary/20 px-2.5 py-1.5 font-sans text-xs focus:border-brand-primary focus:outline-none" />
            </div>

            {/* Same picker the checkout uses, so a web-saved address carries
                the same coordinates the delivery-area check and the rider map
                expect. Its real props are initial/onPick/onCancel — it owns its
                own confirm button rather than taking a value/onChange pair. */}
            {showMap ? (
              <MapPicker
                initial={coords}
                onPick={(picked) => { setCoords(picked); setShowMap(false); }}
                onCancel={() => setShowMap(false)}
              />
            ) : (
              <button
                onClick={() => setShowMap(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-brand-primary/30 py-2.5 font-sans text-xs font-bold text-brand-primary"
              >
                <MapPin className="h-3.5 w-3.5" />
                {coords ? 'Change pin location' : 'Drop a pin on your building'}
              </button>
            )}

            {coords && !showMap && (
              <p className="mt-1.5 font-sans text-[10px] text-brand-dark/40">
                Pin set at {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            )}

            <div className="mt-2 flex gap-2">
              <button onClick={saveAddress} disabled={savingAddr}
                      className="rounded-lg bg-brand-primary px-4 py-2 font-sans text-xs font-bold text-white disabled:opacity-40">
                {savingAddr ? 'Saving…' : 'Save address'}
              </button>
              <button onClick={() => { setAddingAddress(false); setShowMap(false); setError(''); }}
                      className="font-sans text-xs font-bold text-brand-dark/45">
                Cancel
              </button>
            </div>
          </div>
        )}

        {addrLoading && (
          <p className="py-3 font-sans text-xs text-brand-dark/40">Loading addresses…</p>
        )}

        {!addrLoading && addresses.length === 0 && !addingAddress && (
          <p className="py-4 text-center font-sans text-xs text-brand-dark/40">
            No saved addresses yet.
          </p>
        )}

        {addresses.map((a) => (
          <div key={a.id} className="flex items-start gap-3 border-b border-brand-primary/8 py-2.5 last:border-0">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark/25" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-sans text-xs font-bold text-brand-dark">
                {a.label}
                {a.isDefault && (
                  <span className="rounded-full bg-brand-secondary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-primary">
                    Default
                  </span>
                )}
              </p>
              <p className="truncate font-sans text-[11px] text-brand-dark/45">{a.addressLine}</p>
            </div>
            {!a.isDefault && (
              <button onClick={() => makeDefault(a.id)} disabled={busyAddr === a.id}
                      title="Make default"
                      className="shrink-0 p-1 text-brand-dark/30 hover:text-brand-primary disabled:opacity-40">
                <Check className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => removeAddress(a.id)} disabled={busyAddr === a.id}
                    title="Remove"
                    className="shrink-0 p-1 text-brand-dark/25 hover:text-red-600 disabled:opacity-40">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </section>

      <button onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white py-3 font-sans text-sm font-bold text-red-600 hover:bg-red-50">
        <LogOut className="h-4 w-4" /> Log out
      </button>
    </div>
  );
}
