import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag } from 'lucide-react';
import { inr } from '../lib/format';
import { useCart } from '../context/CartContext';

/**
 * Sticky summary that appears only once something is in the cart.
 * Sits above the fold on mobile where the checkout button needs to be
 * reachable with a thumb.
 */
export default function CartBar({ onOpen }) {
  const { totals } = useCart();
  const has = totals.count > 0;

  return (
    <AnimatePresence>
      {has && (
        <motion.div
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:px-6 sm:pb-6"
        >
          <div className="mx-auto flex max-w-3xl items-center gap-4 rounded-2xl border border-white/10
                          bg-brand-primary px-5 py-4 text-white shadow-[0_18px_40px_-12px_rgba(11,77,59,0.55)]">
            <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-white/12">
              <ShoppingBag className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-sans text-[11px] uppercase tracking-[0.14em] text-white/60">
                {totals.count} {totals.count === 1 ? 'item' : 'items'} in your bag
              </p>
              <p className="font-display text-xl font-bold leading-tight">{inr(totals.grand)}</p>
            </div>

            <button
              onClick={onOpen}
              className="flex-shrink-0 rounded-xl bg-brand-secondary px-6 py-3 font-sans text-sm font-bold
                         text-brand-primary transition-all duration-200 hover:bg-white hover:shadow-lg"
            >
              Checkout
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
