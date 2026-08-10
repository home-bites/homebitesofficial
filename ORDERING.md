# Ordering on the official page — setup & notes

The marketing site now takes real orders. It reads the live menu from
Firestore, signs customers in with Google, applies coupons, takes payment
through Razorpay and tracks the order in real time — against the **same**
Firebase project the mobile app uses.

## What was added

```
src/lib/firebase.js          Firebase init (app, auth, db, functions)
src/lib/validate.js          Anti-junk validation for name / phone / address
src/lib/format.js            Currency, dates, order stage helpers
src/lib/razorpay.js          Lazy-loads Razorpay Checkout
src/context/AuthContext.jsx  Google sign-in + users/{uid} profile sync
src/context/CartContext.jsx  Cart state, totals, coupon validation
src/components/SignatureDishes.jsx  Menu grid ("Signature Dishes")
src/components/CartBar.jsx          Sticky bag summary
src/components/CheckoutModal.jsx    Cart, details, coupon, payment
src/components/OrderTracking.jsx    Live order timeline
src/components/HelpCenter.jsx       Support + account deletion
```

Modified: `App.jsx` (providers + modals), `Navbar.jsx`, `Footer.jsx`,
`package.json` (adds `firebase`).

## Setup

```bash
cd official_page
npm install                 # picks up the new `firebase` dependency
cp .env.example .env        # then fill it in
npm run dev
```

`.env` needs:

| Variable | Where to get it |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Console → Project settings → Your apps → **Add app → Web** |
| `VITE_FIREBASE_APP_ID` | same screen |
| `VITE_RAZORPAY_KEY_ID` | Razorpay Dashboard → Account & Settings → API Keys |
| `VITE_DELIVERY_FEE` | flat rupee amount, `0` for free |

The other three Firebase values are pre-filled for `homebites-production-56afa`.

Then, in the Firebase Console:

1. **Authentication → Sign-in method → Google → Enable.**
2. **Authentication → Settings → Authorized domains** — add the domain you
   deploy to. Google sign-in silently fails on an unlisted domain.

Nothing here needs new Firestore rules. The existing ones already allow what
the site does: `menuItems` and `categories` are publicly readable, `/orders`
allows create for any signed-in user, `/coupons` allows read when signed in,
and `/users/{uid}` allows the owner to read and write their own document.

## Google sign-in carries over to the app

This is the point of using Google rather than a website-only login. Signing in
here creates a Firebase Auth user and a `users/{uid}` document in the shared
project. When the same person installs the app and taps **Continue with
Google**, Firebase resolves the identical UID — their profile, saved address
and order history are already there. No migration, no duplicate accounts.

Two deliberate constraints in `AuthContext`:

- An existing profile is **never overwritten**. If the app created it first,
  the site only fills blanks (`merge: true` plus an `exists` guard). A wallet
  balance or verified phone written by the app can't be clobbered by a browser.
- `phoneVerified` can never be set from the site. That flag belongs to the OTP
  flow in the app; letting a webpage set it would let anyone claim any number.

## Field validation

`src/lib/validate.js` rejects the patterns that show up in real junk orders:

- **Name** — letters only, ≥3 letters, no repeated-character runs (`aaaaaa`),
  no consonant mashes (`asdfgh`).
- **Phone** — exactly 10 digits, must start 6–9, rejects all-same digits,
  ascending/descending sequences, and common placeholders like `9999999999`.
  This deliberately mirrors `isValidPhone()` in `firestore.rules`, so a number
  accepted here is never rejected server-side mid-checkout.
- **Address** — ≥15 characters, ≥3 words, must contain a house number and a
  valid 6-digit pincode. The pincode rule is the single most effective filter
  against undeliverable entries.
- **Instructions** — length capped, URLs blocked.
- A hidden **honeypot** field catches naive form bots.

**This is a data-quality filter, not a security boundary.** Anyone with
devtools can bypass all of it. The real enforcement is in the Firestore rules
and in the fact that every order carries the authenticated customer's UID.

## Navbar and Help Centre

Account deletion is **out of the navbar**. A destructive, irreversible action
sitting between "About" and "Privacy" is one mis-tap from disaster.

It now lives in the **Help Centre**, opened from a button in the footer,
behind a typed `DELETE` confirmation. It calls the existing `deleteAccount`
Cloud Function directly. If that call fails, a `supportTickets` document is
raised so the request isn't silently lost.

The old `/delete-account` page in `public/` is untouched and still works, so
any Play Console listing pointing at that URL keeps resolving.

## Two things you should fix on the backend

**1. `deleteAccount`'s in-progress-order guard never fires.**
`functions/index.js` queries:

```js
db.collection("orders").where("userId", "==", uid)
```

but orders are written with `customerId`, not `userId` — in `OrderModel`,
in the app, and in this site. The query always returns empty, so the guard
that's meant to block deletion during a live delivery never triggers. Change
`userId` to `customerId` and redeploy.

**2. `orderSource` is `"website"` on these orders,** not `"customer_app"`.
If the admin dashboard filters the order list by source, web orders won't
appear until you include that value.

## Delivery area — Guntur city only

`src/lib/serviceArea.js`. Two independent gates, because each catches what the
other misses.

**1. Pincode — always enforced.** The address must contain a pincode from the
allowlist. Cheap, needs no API key, works offline, and catches the common case
of someone in another city typing a genuine address. The verdict appears live
under the address field, and the Pay button stays disabled while it fails —
nobody fills the whole form only to be refused at the last step.

> **Verify the pincode list before going live.** The built-in list in
> `serviceArea.js` covers Guntur city (522001–522009, 522017–522020, 522034).
> It decides who can order, so check it against where you actually deliver.
> Override without touching code via `VITE_ALLOWED_PINCODES` in `.env`.

**2. Coordinates — when the customer shares them.** A "Pin my exact location"
button uses browser geolocation and checks the point against the same
`serviceAreas` documents the mobile app reads, with the same haversine maths,
so web and app agree on coverage. Deliberately optional: a denied permission
prompt must not block an order, and on a food site a lot of people deny it.

If `serviceAreas` is empty or unreachable, it falls back to a radius around
Guntur centre (16.3067, 80.4365) rather than refusing everyone — the same
reasoning `ServiceAreaRepository` uses. An empty collection is a
misconfiguration, and telling every customer "we don't deliver here" reads as
the business having shut down.

### Why the coordinates matter beyond the UI

`onOrderCreatedValidateArea` in `functions/index.js` reads
`deliveryLatitude` / `latitude` / `deliveryAddress.latitude`. If none of those
are finite it returns early and accepts the order **unchecked** — an escape
hatch meant for takeaway orders with no delivery point.

The first version of this checkout wrote `deliveryAddress.lat` (and null at
that), so every web order hit that branch and bypassed the server-side guard
entirely. It now writes `deliveryLatitude`, `deliveryLongitude` and
`deliveryAddress.latitude` / `.longitude` under exactly the names the trigger
looks for, whenever a location has been pinned.

Orders placed without pinning a location still have no coordinates, so the
server guard still can't check them — the pincode gate is all that stands
there. If you want coverage enforced on every single order, make the location
pin mandatory, or geocode the address server-side in the trigger.

## Known limits

- **Coordinates are optional**, so an order placed without pinning a location
  reaches the kitchen with a pincode but no lat/lng. If partner
  auto-assignment needs coordinates, those orders need manual assignment.
- **Coupon usage isn't counted.** `usageCount` and per-user redemption limits
  aren't enforced here, so a single-use coupon can be reused on the site.
  Worth adding before running a serious promotion.
- **Stock isn't decremented.** Two people can order the last portion.
- **Prepaid only** — no COD, no wallet.
- **Order tracking needs a composite index** on `orders` (`customerId` ASC,
  `createdAt` DESC). The first load logs a console error with a direct link to
  create it; click that once.

## Testing

Use Razorpay **test** keys first: test Key ID in `.env`, test secret in the
function config. Card `4111 1111 1111 1111`, any future expiry, any CVV.

Confirm end to end: the order document appears in Firestore → Razorpay
Checkout completes → the webhook flips `paymentStatus` to `Paid` → the
tracking view updates without a refresh. Only then switch both sides to live.
