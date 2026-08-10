/**
 * Firebase entry point for the marketing site's ordering flow.
 *
 * This connects to the SAME Firebase project as the customer app
 * (homebites-production-56afa), which is the whole point: a customer who
 * signs in with Google here gets a Firebase Auth account and a
 * `users/{uid}` document. When they later install the app and tap
 * "Continue with Google", Firebase resolves the same UID, so their
 * profile, addresses and order history are already waiting for them.
 *
 * Config comes from Vite env vars so the values aren't baked into the repo.
 * Copy `.env.example` to `.env` and fill it in. Note that Firebase web
 * config is public by design — it ships in the bundle no matter what.
 * Firestore rules, not secrecy, are what protect the data.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** True when the site hasn't been given its Firebase credentials yet. */
export const isConfigured = Boolean(config.apiKey && config.projectId && config.appId);

/** Razorpay Key ID (public). The SECRET lives only in the Cloud Function. */
export const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || '';

let app = null;
if (isConfigured) {
  app = getApps().length ? getApps()[0] : initializeApp(config);
} else if (import.meta.env.DEV) {
  console.warn(
    '[HomeBites] Firebase env vars are missing. Ordering is disabled. ' +
    'Copy .env.example to .env and fill it in.',
  );
}

export const auth = app ? getAuth(app) : null;

/**
 * Firestore, configured to fall back to long polling when it has to.
 *
 * By default the web SDK opens a WebChannel stream, which many networks break
 * without saying so: corporate proxies, some antivirus HTTPS inspection,
 * campus firewalls and a few VPNs all pass the initial request and then stall
 * the streaming connection. The symptom is exactly this —
 *
 *   "Could not reach Cloud Firestore backend. Backend didn't respond within
 *    10 seconds ... The client will operate in offline mode"
 *
 * — while ordinary HTTPS to the same domain works fine, which is why it reads
 * like a connectivity fault when the connection is healthy.
 *
 * experimentalAutoDetectLongPolling lets the SDK notice the stall and switch
 * to plain HTTP long polling. It costs nothing on networks where WebChannel
 * works, because detection only kicks in when the stream fails to establish.
 *
 * Note this must be initializeFirestore, not getFirestore — settings can only
 * be supplied at creation, and getFirestore elsewhere in the app will return
 * this same configured instance.
 */
export const db = app
  ? initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    })
  : null;
// v1 onCall functions are deployed to us-central1, which is also the default.
export const functions = app ? getFunctions(app) : null;

export const googleProvider = new GoogleAuthProvider();
// Always show the chooser rather than silently reusing a session — people
// share devices, and a wrong-account order is painful to unpick.
googleProvider.setCustomParameters({ prompt: 'select_account' });

export default app;
