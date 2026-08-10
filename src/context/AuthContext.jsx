import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import {
  signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut as fbSignOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, updateProfile as fbUpdateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, isConfigured } from '../lib/firebase';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

/**
 * Splits a Google display name into the first/last fields the app's
 * UserModel expects, so a profile created here doesn't look half-filled
 * when the customer opens the app.
 */
function splitName(displayName) {
  const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);        // Firebase Auth user
  const [profile, setProfile] = useState(null);  // users/{uid} document
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  /**
   * Creates the users/{uid} document on first sign-in, or reads the existing
   * one. Deliberately non-destructive: an existing profile created by the
   * mobile app is never overwritten here, because it may hold a verified
   * phone number, wallet balance and order history that this site has no
   * business resetting. `merge: true` plus the `exists` guard means the
   * website can only ever fill in blanks.
   */
  const syncProfile = useCallback(async (fbUser) => {
    if (!db || !fbUser) return null;
    const ref = doc(db, 'users', fbUser.uid);

    try {
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = { uid: fbUser.uid, ...snap.data() };
        setProfile(data);
        return data;
      }

      const { firstName, lastName } = splitName(fbUser.displayName);
      const fresh = {
        uid: fbUser.uid,
        name: fbUser.displayName || '',
        displayName: fbUser.displayName || '',
        firstName,
        lastName,
        email: fbUser.email || '',
        // Phone stays empty until the customer types one at checkout.
        // It is self-declared here: phoneVerified only becomes true after
        // OTP linking in the mobile app, and nothing on this site may set it.
        phone: '',
        phoneVerified: false,
        profilePhoto: fbUser.photoURL || '',
        walletBalance: 0,
        pendingBalance: 0,
        cashbackBalance: 0,
        totalOrders: 0,
        totalSpent: 0,
        favoriteCategory: '',
        fcmToken: '',
        birthday: '',
        gender: '',
        codCancellations: 0,
        codAbandonments: 0,
        codDisabled: false,
        role: 'Customer',
        notificationPrefs: { orders: true, wallet: true, support: true, marketing: true },
        registrationDate: serverTimestamp(),
        createdVia: 'website',
        updatedAt: serverTimestamp(),
      };

      await setDoc(ref, fresh, { merge: true });
      setProfile(fresh);
      return fresh;
    } catch (e) {
      console.error('[auth] profile sync failed', e);
      // Sign-in itself succeeded; surface the profile problem without
      // pretending the user isn't logged in.
      setAuthError('Signed in, but we could not load your profile. Please refresh.');
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isConfigured || !auth) { setLoading(false); return; }

    // Safari and in-app browsers block popups, so we fall back to redirect
    // and pick the result up here on the way back.
    getRedirectResult(auth).catch(() => {});

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser || null);
      if (fbUser) await syncProfile(fbUser);
      else setProfile(null);
      setLoading(false);
    });
    return unsub;
  }, [syncProfile]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) { setAuthError('Sign-in is not configured yet.'); return; }
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
        try { await signInWithRedirect(auth, googleProvider); return; } catch { /* fall through */ }
      }
      if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') {
        return; // user changed their mind; not an error worth showing
      }
      console.error('[auth] google sign-in failed', e);
      setAuthError('Could not sign in with Google. Please try again.');
    }
  }, []);

  /**
   * Turns a Firebase auth error into something a customer can act on.
   *
   * Firebase's own messages are written for developers — "The supplied auth
   * credential is incorrect, malformed or has expired" tells someone who
   * mistyped their password nothing useful.
   *
   * `auth/invalid-credential` deliberately does not distinguish a wrong
   * password from an unknown address. Firebase collapses them on purpose so
   * the form cannot be used to discover which email addresses have accounts,
   * and spelling that out here would undo it.
   */
  const friendlyAuthError = (code) => {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'That email and password don\'t match. Please check and try again.';
      case 'auth/email-already-in-use':
        return 'An account already exists with that email. Try signing in instead.';
      case 'auth/weak-password':
        return 'Please choose a password of at least 6 characters.';
      case 'auth/invalid-email':
        return 'That doesn\'t look like a valid email address.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a few minutes and try again.';
      case 'auth/network-request-failed':
        return 'Network problem. Check your connection and try again.';
      default:
        return 'Something went wrong signing you in. Please try again.';
    }
  };

  /**
   * Create an account with email and password.
   *
   * The display name is set on the Firebase user *before* syncProfile runs,
   * because syncProfile reads `fbUser.displayName` to fill firstName and
   * lastName. Without that ordering a signup would create a profile with a
   * blank name, and the checkout would ask for it again on every order.
   */
  const signUpWithEmail = useCallback(async (email, password, fullName) => {
    if (!auth) { setAuthError('Sign-in is not configured yet.'); return false; }
    setAuthError('');
    try {
      const cred = await createUserWithEmailAndPassword(
        auth, email.trim(), password);
      const name = String(fullName || '').trim();
      if (name) {
        await fbUpdateProfile(cred.user, { displayName: name });
        await cred.user.reload();
      }
      await syncProfile(auth.currentUser || cred.user);
      return true;
    } catch (e) {
      console.error('[auth] email sign-up failed', e?.code);
      setAuthError(friendlyAuthError(e?.code));
      return false;
    }
  }, [syncProfile]);

  const signInWithEmail = useCallback(async (email, password) => {
    if (!auth) { setAuthError('Sign-in is not configured yet.'); return false; }
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return true;
    } catch (e) {
      console.error('[auth] email sign-in failed', e?.code);
      setAuthError(friendlyAuthError(e?.code));
      return false;
    }
  }, []);

  /**
   * Sends a reset link.
   *
   * Reports success even when the address has no account — the alternative
   * turns this box into a way to test whether someone is a customer here.
   */
  const resetPassword = useCallback(async (email) => {
    if (!auth) { setAuthError('Sign-in is not configured yet.'); return false; }
    setAuthError('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (e) {
      if (e?.code !== 'auth/user-not-found') {
        console.error('[auth] password reset failed', e?.code);
        setAuthError(friendlyAuthError(e?.code));
        return false;
      }
    }
    return true;
  }, []);

  const signOut = useCallback(async () => {
    if (auth) await fbSignOut(auth);
    setProfile(null);
  }, []);

  /** Saves checkout details back onto the profile so the app pre-fills them. */
  const updateProfile = useCallback(async (patch) => {
    if (!db || !user) return;
    const ref = doc(db, 'users', user.uid);
    const clean = { ...patch, updatedAt: serverTimestamp() };
    // phoneVerified is owned by the OTP flow in the app. Writing it from a
    // browser would let anyone claim any number as verified.
    delete clean.phoneVerified;
    await setDoc(ref, clean, { merge: true });
    setProfile((p) => ({ ...(p || {}), ...patch }));
  }, [user]);

  const value = useMemo(() => ({
    user, profile, loading, authError,
    isSignedIn: Boolean(user),
    signInWithGoogle, signUpWithEmail, signInWithEmail, resetPassword,
    signOut, updateProfile,
    clearAuthError: () => setAuthError(''),
  }), [user, profile, loading, authError, signInWithGoogle,
       signUpWithEmail, signInWithEmail, resetPassword, signOut, updateProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
