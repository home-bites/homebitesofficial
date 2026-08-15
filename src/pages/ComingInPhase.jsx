import React from 'react';
import { Link } from 'react-router-dom';
import { Construction } from 'lucide-react';

/**
 * Honest placeholder for routes whose features land in a later phase.
 *
 * Deliberately not a fake page. Cart, Diet Plans, Orders, Subscriptions and
 * Profile are all routable and guarded from phase 1 so navigation, guards and
 * session persistence can be verified now — but showing invented orders or a
 * dummy wallet balance behind them would make the site look finished and give
 * nobody a way to tell which parts actually reach the database.
 *
 * Each one names its phase so the gap is a plan rather than a bug.
 */
export default function ComingInPhase({ title, phase, description }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-primary/10">
        <Construction className="h-5 w-5 text-brand-primary" />
      </div>
      <h1 className="font-display text-xl font-bold text-brand-dark">{title}</h1>
      <p className="mx-auto mt-2 max-w-md font-sans text-sm leading-relaxed text-brand-dark/50">
        {description}
      </p>
      <p className="mt-4 inline-block rounded-full bg-brand-secondary/15 px-3 py-1 font-sans text-xs font-bold text-brand-primary">
        Arriving in phase {phase}
      </p>
      <div className="mt-6">
        <Link to="/home"
              className="inline-block rounded-xl bg-brand-primary px-5 py-2.5 font-sans text-sm font-bold text-white">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
