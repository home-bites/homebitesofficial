import React, { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  validateSignupEmail, validateSignupName, validateSignupPassword,
  canonicalEmail, isEmailAlias,
} from '../lib/validate';

export const GoogleMark = (props) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...props}>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
    <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"/>
    <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14Z"/>
  </svg>
);

const inputCls = () =>
  `w-full rounded-xl border border-brand-primary/15 bg-white px-4 py-3
   font-sans text-sm outline-none transition focus:border-brand-primary`;

/**
 * Sign in, create an account, or reset a password.
 *
 * Email and password sit alongside Google rather than replacing it. Google
 * alone loses every customer unwilling to link a Google account to a takeaway
 * order, and it also made the site impossible to hand to a reviewer who needs
 * a username and password — which is what Razorpay asks for during live
 * activation.
 *
 * Lives in its own module because two places need it: the checkout gate and
 * the navbar's Sign in button. When it was defined inside CheckoutModal the
 * navbar had no way to reach it, so its button called signInWithGoogle
 * directly and jumped straight to the Google account chooser.
 *
 * `compact` drops the heading and blurb for hosts that draw their own.
 */
export default function AuthPanel({ compact = false }) {
  const {
    signInWithGoogle, signUpWithEmail, signInWithEmail, resetPassword,
    authError, clearAuthError,
  } = useAuth();

  const [mode, setMode] = useState('signin');   // signin | signup | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  // Local validation errors, distinct from authError which comes from Firebase.
  const [fieldError, setFieldError] = useState('');
  // Shown when the address is a dotted/plus alias of a plainer one.
  const [aliasWarning, setAliasWarning] = useState('');

  const swap = (next) => {
    clearAuthError?.(); setNotice(''); setFieldError(''); setAliasWarning('');
    setMode(next);
  };

  async function submit(e) {
    e.preventDefault();
    setNotice(''); setFieldError('');

    // Checked before the network call. Firebase enforces a valid-looking email
    // and six characters and nothing more — it will happily create an account
    // named "aaaa" with the password "123456".
    if (mode === 'signup') {
      const bad = validateSignupName(name)
        || validateSignupEmail(email)
        || validateSignupPassword(password, { name, email });
      if (bad) { setFieldError(bad); return; }
    } else if (mode === 'signin' || mode === 'reset') {
      if (!email.trim()) { setFieldError('Enter your email address.'); return; }
    }

    setBusy(true);
    if (mode === 'signup') {
      await signUpWithEmail(email.trim().toLowerCase(), password, name.trim());
    } else if (mode === 'signin') {
      await signInWithEmail(email.trim().toLowerCase(), password);
    } else {
      const ok = await resetPassword(email);
      // Deliberately unconditional on whether the address exists — see
      // resetPassword. Saying "no such account" would turn this into a way
      // to find out who orders here.
      if (ok) setNotice('If that address has an account, a reset link is on its way.');
    }
    setBusy(false);
  }

  const heading = mode === 'signup' ? 'Create your account'
                : mode === 'reset' ? 'Reset your password'
                : 'Sign in to continue';

  return (
    <div className={compact ? '' : 'rounded-2xl border border-brand-primary/10 bg-white p-6'}>
      {!compact && (
        <>
          <h3 className="mb-1.5 text-center font-display text-lg font-bold text-brand-dark">
            {heading}
          </h3>
          <p className="mx-auto mb-5 max-w-xs text-center font-sans text-[13px] leading-relaxed text-brand-dark/55">
            {mode === 'reset'
              ? 'We\'ll email you a link to set a new one.'
              : 'Your account saves your address and order history, and signs you '
                + 'straight into the HomeBites app.'}
          </p>
        </>
      )}

      <form onSubmit={submit} className="space-y-3">
        {mode === 'signup' && (
          <input
            className={inputCls()} value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name" placeholder="Full name" maxLength={60} required
          />
        )}

        <input
          className={inputCls()} value={email} type="email"
          onChange={(e) => { setEmail(e.target.value); setFieldError(''); }}
          onBlur={() => {
            // Warning only. Rewriting what someone typed would send their
            // password reset to an address they never entered.
            setAliasWarning(
              mode === 'signup' && isEmailAlias(email)
                ? `This looks like an alias of ${canonicalEmail(email)}. `
                  + 'If you already have an account there, sign in instead — '
                  + 'aliases create a separate account.'
                : '',
            );
          }}
          autoComplete="email" placeholder="Email address" required
        />

        {mode !== 'reset' && (
          <input
            className={inputCls()} value={password} type="password"
            onChange={(e) => setPassword(e.target.value)}
            // Tells the password manager to offer a new strong password on
            // signup and the saved one on sign-in.
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder={mode === 'signup' ? 'Choose a password (8+, letters and numbers)' : 'Password'}
            minLength={6} required
          />
        )}

        <button
          type="submit" disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-6 py-3.5
                     font-sans text-sm font-bold text-white transition hover:bg-brand-primary/90
                     disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Please wait…</>
                : mode === 'signup' ? 'Create account'
                : mode === 'reset' ? 'Send reset link'
                : 'Sign in'}
        </button>
      </form>

      {fieldError && (
        <p className="mb-3 flex items-start gap-1.5 font-sans text-xs text-red-600">
          <AlertCircle className="mt-[1px] h-3.5 w-3.5 flex-shrink-0" />{fieldError}
        </p>
      )}

      {aliasWarning && !fieldError && (
        <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 font-sans text-xs text-amber-800">
          <AlertCircle className="mt-[1px] h-3.5 w-3.5 flex-shrink-0" />{aliasWarning}
        </p>
      )}

      {authError && (
        <p className="mt-3 flex items-start gap-1.5 font-sans text-xs text-red-600">
          <AlertCircle className="mt-[1px] h-3.5 w-3.5 flex-shrink-0" />{authError}
        </p>
      )}
      {notice && <p className="mt-3 font-sans text-xs text-brand-primary">{notice}</p>}

      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 font-sans text-xs">
        {mode !== 'signin' && (
          <button type="button" onClick={() => swap('signin')} className="font-semibold text-brand-primary underline underline-offset-2">
            Already have an account? Sign in
          </button>
        )}
        {mode !== 'signup' && (
          <button type="button" onClick={() => swap('signup')} className="font-semibold text-brand-primary underline underline-offset-2">
            Create an account
          </button>
        )}
        {mode === 'signin' && (
          <button type="button" onClick={() => swap('reset')} className="text-brand-dark/55 underline underline-offset-2">
            Forgot password?
          </button>
        )}
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-brand-primary/10" />
        <span className="font-sans text-[11px] uppercase tracking-wider text-brand-dark/40">or</span>
        <span className="h-px flex-1 bg-brand-primary/10" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        className="mx-auto flex items-center justify-center gap-3 rounded-xl border border-brand-primary/15
                   bg-white px-6 py-3 font-sans text-sm font-bold text-brand-dark shadow-sm
                   transition hover:border-brand-primary/40 hover:shadow-md"
      >
        <GoogleMark /> Continue with Google
      </button>
    </div>
  );
}
