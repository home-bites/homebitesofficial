/**
 * Loads the Razorpay Checkout script on demand.
 *
 * Kept out of index.html so the marketing pages don't pay for a third-party
 * script they never use — it only loads when someone opens checkout.
 */
let promise = null;

export function loadRazorpay() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (promise) return promise;

  promise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { promise = null; resolve(false); };
    document.body.appendChild(s);
  });
  return promise;
}
