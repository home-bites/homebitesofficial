import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from '../context/AuthContext';

/**
 * Wallet balance and ledger — read only.
 *
 * The balance is read from `users/{uid}.walletBalance` and is never computed
 * here by summing the ledger. Two independent notions of "your balance" will
 * disagree the moment a transaction fails to write, and the one on the user
 * document is the one every other client and Cloud Function trusts.
 *
 * Nothing in this file writes. `walletBalance` is server-owned — firestore.rules
 * rejects a customer changing it, and top-ups only become real through
 * `creditWalletTopUp`, which fetches the captured amount from Razorpay rather
 * than believing the client. There is deliberately no "add money" button on the
 * website yet: wiring one means the full Razorpay round trip, and a button that
 * looked like it topped up but did not would be worse than no button.
 *
 * The ledger query filters on userId and is covered by the existing
 * walletTransactions(userId, createdAt) index — no index deploy needed.
 */
export function useWallet(pageSize = 25) {
  const { user, profile } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [state, setState] = useState('loading');

  useEffect(() => {
    if (!db || !user) { setState('ready'); return undefined; }
    const q = query(
      collection(db, 'walletTransactions'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(pageSize),
    );
    return onSnapshot(
      q,
      (snap) => {
        setTransactions(snap.docs.map((d) => {
          const x = d.data() || {};
          const raw = String(x.type || x.transactionType || '').toLowerCase();
          const amount = Number(x.amount) || 0;
          // Direction comes from the type where one is given, and falls back to
          // the sign of the amount. Both spellings exist in this collection.
          const isCredit = raw
            ? ['credit', 'topup', 'top_up', 'refund', 'cashback', 'bonus'].includes(raw)
            : amount >= 0;
          return {
            id: d.id,
            amount: Math.abs(amount),
            isCredit,
            type: x.type || x.transactionType || (isCredit ? 'Credit' : 'Debit'),
            description: String(x.description || x.note || x.reason || ''),
            orderId: String(x.orderId || ''),
            createdAt: x.createdAt?.toDate?.() ?? null,
          };
        }));
        setState('ready');
      },
      (e) => {
        console.error('[wallet] ledger listener failed', e);
        setState('error');
      },
    );
  }, [user, pageSize]);

  return {
    balance: Number(profile?.walletBalance) || 0,
    transactions,
    state,
  };
}
