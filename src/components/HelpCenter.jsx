import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  X, LifeBuoy, Mail, Phone, MessageCircle, Trash2, ChevronRight,
  Loader2, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

// Overridable from .env so these don't need a code change to update.
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@hombites.com';
const SUPPORT_PHONE_RAW = String(import.meta.env.VITE_SUPPORT_PHONE || '8184877798').replace(/\D/g, '').slice(-10);
const SUPPORT_PHONE = `+91 ${SUPPORT_PHONE_RAW.slice(0, 5)} ${SUPPORT_PHONE_RAW.slice(5)}`;

/**
 * Help Centre.
 *
 * Account deletion used to sit in the navbar, which put a destructive action
 * one mis-tap away from Home and About. It now lives here, behind an explicit
 * choice and a typed confirmation — while still being reachable from the site
 * without signing into the app, which is what Google Play requires.
 */
export default function HelpCenter({ open, onClose }) {
  const { user, profile, isSignedIn, signInWithGoogle, signOut } = useAuth();
  const [view, setView] = useState('menu');       // menu | delete
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (!open) { setView('menu'); setConfirm(''); setError(''); setDone(false); }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  async function requestDeletion() {
    setError('');
    if (confirm.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE to confirm.');
      return;
    }
    if (!functions || !user) { setError('Please sign in again.'); return; }

    setBusy(true);
    try {
      // The backend does the real work: it refuses while a delivery is in
      // flight, writes an audit record, then removes the account.
      const call = httpsCallable(functions, 'deleteAccount');
      await call({});
      setDone(true);
      setTimeout(() => { signOut(); }, 2500);
    } catch (e) {
      console.error('[help] deleteAccount failed', e);

      if (e?.code === 'functions/failed-precondition') {
        setError(e.message || 'You have an order in progress. Please wait until it is delivered or cancelled.');
        setBusy(false);
        return;
      }

      // If the callable is unreachable, don't leave the customer with nothing —
      // log the request so support can complete it manually.
      try {
        if (db) {
          await addDoc(collection(db, 'supportTickets'), {
            userId: user.uid,
            type: 'account_deletion',
            subject: 'Account deletion request (website)',
            message: 'Customer requested account deletion from the website Help Centre. '
                   + 'The automated deletion did not complete and needs manual action.',
            email: user.email || '',
            name: profile?.name || user.displayName || '',
            status: 'Open',
            priority: 'High',
            source: 'website_help_centre',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setDone(true);
          setBusy(false);
          return;
        }
      } catch (e2) {
        console.error('[help] fallback ticket failed', e2);
      }

      setError('We could not process that right now. Please email ' + SUPPORT_EMAIL + '.');
      setBusy(false);
    }
  }

  const Row = ({ icon: Icon, title, sub, onClick, href, danger }) => {
    const Cmp = href ? 'a' : 'button';
    return (
      <Cmp
        {...(href ? { href, target: href.startsWith('http') ? '_blank' : undefined, rel: 'noreferrer' } : { onClick })}
        className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition
          ${danger
            ? 'border-red-200 bg-red-50/50 hover:border-red-300 hover:bg-red-50'
            : 'border-brand-primary/10 bg-white hover:border-brand-primary/30 hover:shadow-sm'}`}
      >
        <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg
          ${danger ? 'bg-red-100 text-red-600' : 'bg-brand-offwhite text-brand-primary'}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block font-sans text-sm font-bold ${danger ? 'text-red-700' : 'text-brand-dark'}`}>{title}</span>
          <span className="block font-sans text-xs text-brand-dark/50">{sub}</span>
        </span>
        <ChevronRight className={`h-4 w-4 flex-shrink-0 ${danger ? 'text-red-400' : 'text-brand-dark/25'}`} />
      </Cmp>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-brand-dark/60 backdrop-blur-sm sm:items-center sm:p-6"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-brand-offwhite shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-brand-primary/10 bg-white px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  <LifeBuoy className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-xl font-bold text-brand-primary">Help Centre</h2>
                  <p className="font-sans text-xs text-brand-dark/50">We usually reply within a few hours</p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close"
                      className="grid h-9 w-9 place-items-center rounded-full text-brand-dark/50 transition hover:bg-brand-offwhite hover:text-brand-dark">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {view === 'menu' && (
                <div className="space-y-3">
                  <Row icon={Mail} title="Email us" sub={SUPPORT_EMAIL} href={`mailto:${SUPPORT_EMAIL}`} />
                  <Row icon={Phone} title="Call us" sub={SUPPORT_PHONE} href={`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`} />
                  <Row icon={MessageCircle} title="Question about an order"
                       sub="Order status, refunds, missing items" href={`mailto:${SUPPORT_EMAIL}?subject=Order%20query`} />

                  <div className="pt-4">
                    <p className="mb-3 font-sans text-[11px] font-bold uppercase tracking-[0.14em] text-brand-dark/40">
                      Account
                    </p>
                    <Row icon={Trash2} danger title="Delete my account"
                         sub="Permanently removes your profile and personal data"
                         onClick={() => setView('delete')} />
                  </div>
                </div>
              )}

              {view === 'delete' && !done && (
                <div>
                  <button onClick={() => { setView('menu'); setError(''); }}
                          className="mb-5 font-sans text-xs font-bold text-brand-dark/50 hover:text-brand-dark">
                    ← Back to Help Centre
                  </button>

                  <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                    <div className="font-sans text-[13px] leading-relaxed text-amber-900">
                      <p className="mb-1 font-bold">This cannot be undone.</p>
                      <p>
                        Your profile, saved addresses and any wallet balance are removed.
                        Past order records are kept in anonymised form because we're
                        required to retain them for accounting.
                      </p>
                    </div>
                  </div>

                  <p className="mb-5 font-sans text-[13px] leading-relaxed text-brand-dark/60">
                    If you have an order in progress, deletion is blocked until it's
                    delivered or cancelled — otherwise your rider would lose the
                    delivery address mid-route.
                  </p>

                  {!isSignedIn ? (
                    <div className="rounded-xl border border-brand-primary/10 bg-white p-6 text-center">
                      <p className="mb-4 font-sans text-sm text-brand-dark/60">
                        Sign in with the account you want to delete.
                      </p>
                      <button onClick={signInWithGoogle}
                              className="rounded-xl bg-brand-primary px-6 py-3 font-sans text-sm font-bold text-white transition hover:bg-brand-primary/90">
                        Continue with Google
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="mb-3 font-sans text-[13px] text-brand-dark/60">
                        Signed in as <b className="text-brand-dark">{user?.email}</b>
                      </p>
                      <label className="mb-1.5 block font-sans text-[13px] font-bold text-brand-dark">
                        Type <span className="font-mono text-red-600">DELETE</span> to confirm
                      </label>
                      <input
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="DELETE"
                        className="mb-4 w-full rounded-xl border border-red-200 bg-white px-4 py-3 font-sans text-sm outline-none focus:border-red-500"
                      />
                      {error && (
                        <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 font-sans text-xs text-red-700">
                          <AlertTriangle className="mt-[1px] h-3.5 w-3.5 flex-shrink-0" />{error}
                        </p>
                      )}
                      <button
                        onClick={requestDeletion}
                        disabled={busy}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3.5
                                   font-sans text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</> : 'Delete my account permanently'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {done && (
                <div className="py-8 text-center">
                  <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand-secondary/15">
                    <CheckCircle2 className="h-7 w-7 text-brand-primary" />
                  </div>
                  <h3 className="mb-2 font-display text-xl font-bold text-brand-primary">Request received</h3>
                  <p className="mx-auto max-w-xs font-sans text-[13px] leading-relaxed text-brand-dark/55">
                    Your account is being removed and you'll be signed out shortly.
                    A confirmation goes to {user?.email || 'your email'}.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
