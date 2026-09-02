import { doc, collection } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { db, RAZORPAY_KEY_ID } from './firebase';
import { loadRazorpay } from './razorpay';

// Imported from lib/firebase rather than read from import.meta.env directly.
//
// This file originally had its own `import.meta.env.VITE_RAZORPAY_KEY_ID`
// while CheckoutModal used the exported constant. They agree today only
// because both happen to hold the same live key — point .env at a test key to
// try something and orders would go live while subscriptions went to test,
// with nothing on either screen showing the difference.

export const ONLINE_ENABLED =
  Boolean(RAZORPAY_KEY_ID) && !RAZORPAY_KEY_ID.startsWith('REPLACE_WITH');

/**
 * Buys a subscription.
 *
 * The browser never writes the subscription document. It reserves an id, pays,
 * and hands the signed payment to `verifyRazorpayPayment`, which recomputes the
 * HMAC server-side and only then creates the record with
 * `paymentStatus: 'VERIFIED'`.
 *
 * That split is enforced by firestore.rules, not just convention: a customer
 * may create a subscription document, but the rule rejects any create where
 * `paymentStatus` is 'verified' or 'paid', or `status` is 'active' — checked
 * case-insensitively, because an earlier version tested only the uppercase
 * spellings and a client writing 'Active' walked straight through. So a
 * client-created subscription could never be an active, paid one anyway.
 *
 * The same rule restricts `paymentMethod` to online methods. Wallet and COD are
 * fine for a one-off order but not for a recurring commitment, since there is
 * no reliable way to collect either on a future renewal date.
 */
export async function purchaseSubscription({
  plan, user, profile, phone, address, onStage,
}) {
  if (!db) throw new Error('Subscriptions are unavailable right now.');
  if (!user) throw new Error('Please sign in first.');
  if (!ONLINE_ENABLED) {
    throw new Error('Online payment is not configured, and subscriptions cannot be paid any other way.');
  }
  if (!plan?.id || !(plan.price > 0)) {
    throw new Error('This plan has no price set. Please contact support.');
  }

  onStage?.('Opening payment…');

  const sdkReady = await loadRazorpay();
  if (!sdkReady) throw new Error('Could not reach the payment gateway. Check your connection.');

  // Reserve the id up front so the payment notes can reference the exact
  // document the server will create, which is also what the webhook matches on.
  const subId = doc(collection(db, 'subscriptions')).id;
  const receipt = `SUB${Date.now().toString().slice(-8)}`;

  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + (plan.durationDays || 30));

  // Everything the server needs to build the record. Status and paymentStatus
  // are deliberately absent — the function sets those itself.
  const subscriptionData = {
    userId: user.uid,
    customerId: user.uid,
    customerName: profile?.name || user.displayName || '',
    customerEmail: user.email || '',
    customerMobile: phone || '',
    planId: plan.id,
    planName: plan.name,
    planType: plan.planType || '',
    price: plan.price,
    totalAmount: plan.price,
    durationDays: plan.durationDays || 30,
    mealsPerDay: plan.mealsPerDay || 1,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    paymentMethod: 'Razorpay',
    deliveryAddress: address || null,
    source: 'website',
  };

  const functions = getFunctions();
  const createOrder = httpsCallable(functions, 'createRazorpayOrder');
  const res = await createOrder({
    amount: plan.price,
    receipt,
    notes: { subId, source: 'website', kind: 'subscription' },
  });
  const rzpOrder = res?.data;
  if (!rzpOrder?.id) throw new Error('The payment gateway did not return an order.');

  /**
   * A subscription whose payment did not complete must not be left behind.
   *
   * The `subscriptions` and `subscriptionOrders` documents are written before
   * the gateway is opened, because the webhook needs something to reconcile
   * against. Until now a dismissal or a decline simply rejected this promise
   * and left both documents sitting Pending forever — and because
   * `createRazorpayOrder` refuses a second plan while one is "active", a
   * customer whose card was declined once could be told on their next attempt
   * that they already have a plan running.
   *
   * Errors are swallowed on purpose: the customer needs to hear about the
   * payment failure, not about our clean-up. `expireUnpaidOrders` and the
   * sweeper catch anything this misses.
   */
  async function cancelUnpaid(id, reason) {
    try {
      await httpsCallable(functions, 'cancelUnpaidPurchase')({
        purchaseId: id, kind: 'SUBSCRIPTION', reason,
      });
    } catch (e) {
      console.warn('[subscription] cancelUnpaidPurchase failed', e);
    }
  }

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: RAZORPAY_KEY_ID,
      order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: 'INR',
      name: 'HomeBites',
      description: plan.name,
      image: '/favicon.png',
      prefill: {
        name: subscriptionData.customerName,
        contact: phone || '',
        email: user.email || '',
      },
      notes: { subId },
      theme: { color: '#0B4D3B' },
      modal: {
        ondismiss: async () => {
          await cancelUnpaid(subId, 'PAYMENT_DISMISSED');
          reject(new Error('Payment cancelled — the plan was not started.'));
        },
      },
      handler: async (r) => {
        try {
          onStage?.('Confirming your subscription…');
          const verify = httpsCallable(functions, 'verifyRazorpayPayment');
          await verify({
            orderId: rzpOrder.id,
            paymentId: r.razorpay_payment_id,
            signature: r.razorpay_signature,
            type: 'SUBSCRIPTION',
            amount: plan.price,
            metadata: { subId, subscriptionData },
          });
          resolve({ subId, paymentId: r.razorpay_payment_id });
        } catch (e) {
          // The money may well have been taken — say so plainly rather than
          // reporting a generic failure that reads as "nothing happened".
          console.error('[subscription] verification failed', e);
          reject(new Error(
            'Payment went through but we could not activate the subscription. '
            + 'Please contact support with your payment id: '
            + (r.razorpay_payment_id || 'unknown'),
          ));
        }
      },
    });

    rzp.on('payment.failed', async (resp) => {
      await cancelUnpaid(subId, 'PAYMENT_FAILED');
      reject(new Error(resp?.error?.description || 'Payment failed. Please try again.'));
    });

    rzp.open();
  });
}
