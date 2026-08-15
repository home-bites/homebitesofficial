import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Gate for the customer-only routes.
 *
 * The `loading` check matters more than it looks. AuthContext starts with
 * `user = null` and resolves the real session asynchronously via
 * onAuthStateChanged, so redirecting on `!user` alone would bounce every
 * signed-in customer to the landing page on a hard refresh — the session was
 * there, this component just asked before Firebase had answered.
 *
 * The attempted path is carried in location state so the customer lands where
 * they were going after signing in, rather than being dropped on Home.
 */
export default function ProtectedRoute({ children }) {
  const { isSignedIn, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-brand-offwhite">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
          <p className="font-sans text-sm text-brand-dark/50">Loading your account…</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return children;
}
