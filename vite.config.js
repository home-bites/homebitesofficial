import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Cross-Origin-Opener-Policy: same-origin-allow-popups
 *
 * Firebase's `signInWithPopup` opens the Google consent window and then polls
 * `popup.closed` to notice when the user finishes or cancels. Under the
 * default COOP the browser severs the opener reference, the poll is blocked,
 * and Chrome logs on every tick:
 *
 *   Cross-Origin-Opener-Policy policy would block the window.closed call.
 *
 * Sign-in often still completes, but a cancelled popup hangs forever because
 * nothing ever detects the close. `same-origin-allow-popups` keeps the site
 * isolated from other origins while letting it retain a handle on popups it
 * opened itself — the narrowest setting that makes the flow work.
 *
 * This covers `npm run dev` and `npm run preview` only. The same header must
 * be set by whatever serves the built site (Firebase Hosting: add it under
 * `hosting.headers` in firebase.json), or the warning returns in production.
 */
const authPopupHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { headers: authPopupHeaders },
  preview: { headers: authPopupHeaders },

  build: {
    // Vendor code changes far less often than ours. Splitting it out means a
    // routine deploy invalidates only the app chunk, so returning visitors
    // re-download a few KB instead of the whole bundle — Firebase alone is
    // several hundred KB and had been rebuilt into a new hash on every deploy.
    rollupOptions: {
      output: {
        /**
         * Function form, not the object form.
         *
         * Vite 8 bundles with rolldown rather than rollup, and rolldown accepts
         * only a function here — the `{ name: [modules] }` object that rollup
         * supported fails the build outright with "manualChunks is not a
         * function".
         *
         * Matching on the module id rather than naming packages also means a
         * transitive dependency lands in the right chunk instead of being
         * duplicated into the app bundle.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // Checked before the generic react test: react-router-dom contains
          // "react", and both belong together anyway.
          if (id.includes('react-router')) return 'vendor-react';
          if (id.includes('/react-dom/') || id.includes('/react/')
              || id.includes('/scheduler/')) return 'vendor-react';

          if (id.includes('firebase') || id.includes('@firebase')) return 'vendor-firebase';
          if (id.includes('framer-motion') || id.includes('motion-dom')
              || id.includes('motion-utils')) return 'vendor-motion';
          if (id.includes('lucide-react')) return 'vendor-icons';

          return undefined;   // everything else keeps Vite's default grouping
        },
      },
    },
    // Default is 500 KB, which the Firebase chunk exceeds by design. Raised so
    // a genuine regression stands out instead of being lost in a warning that
    // is always present.
    chunkSizeWarningLimit: 900,
  },
})
