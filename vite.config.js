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
})
