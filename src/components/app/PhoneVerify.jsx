import React, { useEffect, useRef, useState } from 'react';
import { RecaptchaVerifier, linkWithPhoneNumber } from 'firebase/auth';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { Phone, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

/**
 * Verifies a mobile number and **links it to the signed-in account**.
 *
 * Linking rather than a bespoke OTP is the whole point. `linkWithPhoneNumber`
 * attaches a real phone credential to the existing Firebase user, so the same
 * person who signed up on the website with Google or email can later open the
 * mobile app, sign in with that number, and land in the same account — same
 * orders, same wallet, same subscriptions. A homegrown "enter the code we
 * texted you" flow would prove the number to *us* and mean nothing to Firebase
 * Auth, leaving the app to create a second account for the same customer.
 *
 * `phoneVerified` is set by a Cloud Function, not written from here. The
 * browser can put any string in a Firestore field; only the server can read
 * `phone_number` off a verified auth token and decide it is true. AuthContext's
 * updateProfile already strips that field for the same reason.
 *
 * reCAPTCHA is required by Firebase for phone auth in a browser. It is
 * invisible, but the container must exist in the DOM before the verifier is
 * constructed — hence the ref and the effect ordering below.
 */

/** 10 digits, first digit 6-9. Matches FormValidators.mobile in the app. */
const INDIAN_MOBILE = /^[6-9][0-9]{9}$/;

export default function PhoneVerify({ onDone }) {
  const { user, profile, updateProfile } = useAuth();
  const recaptchaHolder = useRef(null);
  const verifierRef = useRef(null);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const existing = user?.phoneNumber || profile?.phone || '';
  const alreadyLinked = Boolean(user?.phoneNumber);

  useEffect(() => {
    const t = cooldown > 0 && setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => t && clearTimeout(t);
  }, [cooldown]);

  // Torn down on unmount: a stale verifier bound to a removed DOM node makes
  // the next attempt fail with an opaque internal error.
  useEffect(() => () => {
    try { verifierRef.current?.clear(); } catch { /* already gone */ }
    verifierRef.current = null;
  }, []);

  const ensureVerifier = () => {
    if (verifierRef.current) return verifierRef.current;
    verifierRef.current = new RecaptchaVerifier(auth, recaptchaHolder.current, {
      size: 'invisible',
    });
    return verifierRef.current;
  };

  const sendCode = async () => {
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (!INDIAN_MOBILE.test(digits)) {
      setError('Enter a 10-digit mobile number starting 6, 7, 8 or 9.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await linkWithPhoneNumber(user, `+91${digits}`, ensureVerifier());
      setConfirmation(result);
      setCooldown(30);
    } catch (e) {
      console.error('[phone] send failed', e);
      // The reCAPTCHA is single-use; a failed attempt must not reuse it.
      try { verifierRef.current?.clear(); } catch { /* noop */ }
      verifierRef.current = null;

      const map = {
        'auth/credential-already-in-use':
          'That number is already on another HomeBites account. Sign in with it instead, or use a different number.',
        'auth/provider-already-linked':
          'This account already has a mobile number linked.',
        'auth/invalid-phone-number': 'That number does not look right.',
        'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
        'auth/quota-exceeded': 'We cannot send codes right now. Please try later.',
      };
      setError(map[e?.code] || 'Could not send the code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 6) { setError('Enter the 6-digit code.'); return; }

    setBusy(true);
    setError('');
    try {
      await confirmation.confirm(clean);

      const digits = phone.replace(/\D/g, '').slice(-10);
      // The plain number goes on the profile so the app, dashboard and rider
      // sheet all read it the same way they always have.
      await updateProfile({ phone: digits });

      // phoneVerified is decided server-side from the token, never here.
      try {
        await httpsCallable(getFunctions(), 'syncPhoneVerified')({});
      } catch (e) {
        // Non-fatal: the number is genuinely linked in Firebase Auth either
        // way, and that is what lets them sign in on the app. The flag is a
        // convenience for other screens.
        console.warn('[phone] verified flag not synced', e);
      }

      onDone?.(digits);
    } catch (e) {
      console.error('[phone] confirm failed', e);
      setError(
        e?.code === 'auth/invalid-verification-code'
          ? 'That code is not right. Check and try again.'
          : e?.code === 'auth/code-expired'
            ? 'That code expired. Send a new one.'
            : 'Could not verify that code.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (alreadyLinked) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-brand-secondary/40 bg-brand-secondary/10 px-3 py-2.5">
        <ShieldCheck className="h-4 w-4 shrink-0 text-brand-primary" />
        <p className="font-sans text-xs text-brand-primary">
          <span className="font-bold">{existing}</span> is verified — you can sign
          in to the HomeBites app with this number.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-brand-primary/15 p-3">
      <p className="mb-2 font-sans text-[11px] leading-relaxed text-brand-dark/55">
        Verify your mobile number so riders can reach you — and so you can sign
        in to the HomeBites app with the same account.
      </p>

      {error && (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-red-50 p-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
          <p className="font-sans text-[11px] text-red-700">{error}</p>
        </div>
      )}

      {!confirmation ? (
        <div className="flex gap-2">
          <span className="flex items-center rounded-lg border border-brand-primary/20 px-2.5 font-sans text-xs font-bold text-brand-dark/50">
            +91
          </span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            inputMode="numeric"
            placeholder="10-digit mobile"
            className="w-full min-w-0 rounded-lg border border-brand-primary/20 px-2.5 py-2 font-sans text-xs focus:border-brand-primary focus:outline-none"
          />
          <button onClick={sendCode} disabled={busy || phone.length !== 10}
                  className="shrink-0 rounded-lg bg-brand-primary px-4 font-sans text-xs font-bold text-white disabled:opacity-40">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Send code'}
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="6-digit code"
              className="w-full min-w-0 rounded-lg border border-brand-primary/20 px-2.5 py-2 font-mono text-xs tracking-[0.3em] focus:border-brand-primary focus:outline-none"
            />
            <button onClick={confirmCode} disabled={busy || code.length !== 6}
                    className="shrink-0 rounded-lg bg-brand-primary px-4 font-sans text-xs font-bold text-white disabled:opacity-40">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Verify'}
            </button>
          </div>
          <button
            onClick={() => { setConfirmation(null); setCode(''); setError(''); }}
            disabled={cooldown > 0}
            className="mt-2 font-sans text-[11px] font-bold text-brand-primary disabled:text-brand-dark/30"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Use a different number'}
          </button>
        </>
      )}

      {/* Required by Firebase phone auth. Invisible, but it must be in the DOM
          before the verifier is constructed. */}
      <div ref={recaptchaHolder} />
    </div>
  );
}
