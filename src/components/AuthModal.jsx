import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import AuthPanel from './AuthPanel';
import { useAuth } from '../context/AuthContext';

/**
 * The sign-in dialog behind the navbar's "Sign in" button.
 *
 * Before this existed that button called signInWithGoogle directly, so it
 * jumped straight to the Google account chooser with no chance to use an
 * email and password — the accounts we now need for Razorpay's live review.
 *
 * Closes itself once auth succeeds. AuthPanel has no idea it is in a dialog,
 * which is what lets the checkout embed the same component inline.
 */
export default function AuthModal({ open, onClose }) {
  const { isSignedIn, clearAuthError } = useAuth();

  // Dismiss on success. Covers every route in — email, signup and the Google
  // popup — because all three end at the same isSignedIn flip.
  useEffect(() => {
    if (open && isSignedIn) onClose?.();
  }, [open, isSignedIn, onClose]);

  useEffect(() => {
    if (!open) return;
    clearAuthError?.();
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, clearAuthError]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-label="Sign in to HomeBites"
            className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-2 shadow-2xl"
          >
            <button
              onClick={onClose} aria-label="Close"
              className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-brand-dark/40
                         transition hover:bg-brand-primary/5 hover:text-brand-dark"
            >
              <X className="h-5 w-5" />
            </button>
            <AuthPanel />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
