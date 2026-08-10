/**
 * Field validation for the ordering flow.
 *
 * The goal is to stop *plausible-looking rubbish* — "aaaaaa", "1234567890",
 * "asdf asdf" — from becoming an order that a rider then can't deliver.
 * Every rule here targets a pattern that shows up in real junk submissions.
 *
 * IMPORTANT: this is client-side, so a determined person can bypass all of it
 * with devtools. It is a data-quality tool, not a security boundary. The real
 * enforcement lives in firestore.rules — `isValidPhone()` is checked there on
 * every write to /users, and orders are created by an authenticated user whose
 * UID is recorded. Treat this file as the first filter, not the last.
 *
 * Each validator returns `{ ok: true }` or `{ ok: false, error: '...' }` so
 * callers can show the reason inline instead of a generic "invalid input".
 */

const ok = { ok: true };
const fail = (error) => ({ ok: false, error });

/* ── helpers ──────────────────────────────────────────────────────────── */

/** "aaaaaa", "!!!!!!" — the same character repeated past the point of sense. */
const hasLongRun = (s, max = 4) => new RegExp(`(.)\\1{${max},}`).test(s);

/** "1234567890" / "9876543210" — consecutive ascending or descending digits. */
function isSequential(digits) {
  if (digits.length < 4) return false;
  let up = true, down = true;
  for (let i = 1; i < digits.length; i++) {
    const diff = digits.charCodeAt(i) - digits.charCodeAt(i - 1);
    if (diff !== 1) up = false;
    if (diff !== -1) down = false;
  }
  return up || down;
}

/** Rough keyboard-mash detector: a long stretch with no vowels at all. */
const looksMashed = (s) => /[bcdfghjklmnpqrstvwxz]{6,}/i.test(s);

/* ── name ─────────────────────────────────────────────────────────────── */

export function validateName(raw) {
  const v = String(raw || '').trim().replace(/\s+/g, ' ');

  if (!v) return fail('Please enter your name.');
  if (v.length < 3) return fail('Name looks too short.');
  if (v.length > 60) return fail('Name looks too long.');

  // Letters (incl. accents), spaces, apostrophes, hyphens and dots only.
  // Digits in a name are almost always a typo or junk.
  if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(v)) {
    return fail('Use letters only — no numbers or symbols.');
  }
  if (!/\p{L}{2}/u.test(v)) return fail('Please enter your real name.');
  if (hasLongRun(v)) return fail('That doesn\'t look like a real name.');
  if (looksMashed(v)) return fail('That doesn\'t look like a real name.');

  // A single 1-2 letter "name" is almost never genuine.
  if (v.replace(/[^\p{L}]/gu, '').length < 3) {
    return fail('Please enter your full name.');
  }
  return ok;
}

/* ── mobile ───────────────────────────────────────────────────────────── */

/**
 * Indian mobile numbers: exactly 10 digits, first digit 6-9.
 * This deliberately matches `isValidPhone()` in firestore.rules so a number
 * accepted here is never rejected server-side (which would strand the user
 * mid-checkout with an unexplained permission error).
 */
export function validatePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  const local = d.length === 12 && d.startsWith('91') ? d.slice(2) : d;

  if (!local) return fail('Please enter your mobile number.');
  if (local.length !== 10) return fail('Enter a 10-digit mobile number.');
  if (!/^[6-9]/.test(local)) {
    return fail('Indian mobile numbers start with 6, 7, 8 or 9.');
  }
  if (/^(\d)\1{9}$/.test(local)) return fail('That number isn\'t valid.');
  if (isSequential(local)) return fail('That number isn\'t valid.');

  // Numbers used as placeholders in test data and by people avoiding contact.
  const known = ['9999999999', '1234567890', '9876543210', '0000000000', '9000000000'];
  if (known.includes(local)) return fail('Please enter your real mobile number.');

  return ok;
}

/** Strips formatting to the bare 10 digits for storage. */
export const normalisePhone = (raw) => {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
};

/* ── address ──────────────────────────────────────────────────────────── */

/**
 * The typed street address is gone. Location is captured from the device's
 * GPS instead, which is both more accurate for the rider and impossible to
 * fake by typing — the old free-text field accepted any string containing six
 * digits and three words, and a rider then had to make sense of it.
 *
 * What GPS cannot supply is the part of an address that isn't a coordinate:
 * which flat, which floor, which gate. A pin on a twelve-flat building is a
 * pin on the roof. So one short field survives, and it is required.
 *
 * `validateAddress` is kept as an export because it still guards the old
 * shape wherever a stored address is re-validated, but the checkout now calls
 * `validateDoorInfo`.
 */
export function validateDoorInfo(raw) {
  const v = String(raw || '').trim().replace(/\s+/g, ' ');

  if (!v) return fail('Add your flat / door number and a landmark.');
  if (v.length < 4) return fail('Too short — the rider needs a door number.');
  if (v.length > 140) return fail('Keep this under 140 characters.');
  if (hasLongRun(v)) return fail('That doesn\'t look like a real address.');
  if (looksMashed(v)) return fail('That doesn\'t look like a real address.');

  // A door number is the whole point of this field, so require a digit.
  // "Near the temple" is exactly the input that made the old field useless.
  if (!/\d/.test(v)) return fail('Include your flat or door number.');

  return ok;
}

/**
 * Legacy free-text validator, retained for stored addresses written before
 * the checkout moved to GPS.
 */
export function validateAddress(raw) {
  const v = String(raw || '').trim().replace(/\s+/g, ' ');

  if (!v) return fail('Please enter your delivery address.');
  if (v.length < 15) return fail('Address is too short — include house number, street and area.');
  if (v.length > 300) return fail('Address is too long.');

  const words = v.split(' ').filter((w) => w.length > 1);
  if (words.length < 3) return fail('Please write the full address, not just one line.');

  if (!/\d/.test(v)) return fail('Include your house or flat number.');
  if (hasLongRun(v)) return fail('That doesn\'t look like a real address.');
  if (looksMashed(v)) return fail('That doesn\'t look like a real address.');

  // Indian pincodes: 6 digits, never starting with 0.
  if (!/(^|\D)[1-9]\d{5}(\D|$)/.test(v)) {
    return fail('Include a valid 6-digit pincode.');
  }
  return ok;
}

/** Pulls the pincode out of a free-text address, for serviceability checks. */
export function extractPincode(address) {
  const m = String(address || '').match(/(^|\D)([1-9]\d{5})(\D|$)/);
  return m ? m[2] : '';
}

/* ── optional free text ───────────────────────────────────────────────── */

export function validateNote(raw) {
  const v = String(raw || '').trim();
  if (!v) return ok;                       // genuinely optional
  if (v.length > 200) return fail('Keep instructions under 200 characters.');
  // Cheap defence against someone pasting a URL to phish whoever reads it.
  if (/https?:\/\//i.test(v)) return fail('Links aren\'t allowed here.');
  return ok;
}

/** Coupon codes: uppercase alphanumeric, dashes allowed. */
export function normaliseCoupon(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
}

/**
 * Runs every field and returns a map of `{ field: message }` for the ones
 * that failed. An empty object means the form is good to submit.
 */
export function validateOrderForm({ name, phone, doorInfo, note }) {
  const errors = {};
  const n = validateName(name);
  if (!n.ok) errors.name = n.error;
  const p = validatePhone(phone);
  if (!p.ok) errors.phone = p.error;
  const d = validateDoorInfo(doorInfo);
  if (!d.ok) errors.doorInfo = d.error;
  const t = validateNote(note);
  if (!t.ok) errors.note = t.error;
  return errors;
}
