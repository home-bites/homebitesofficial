import React from 'react';
import { motion } from 'framer-motion';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.homebites.customer.customerApp';
export const APP_STORE_URL = 'https://apps.apple.com/app/homebites/id1234567890';

export const GooglePlayIcon = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <path
      fill="#4285F4"
      d="M3.6 1.8a2.5 2.5 0 0 0-.6 1.7v17c0 .6.2 1.2.6 1.7l10.2-10.2L3.6 1.8z"
    />
    <path
      fill="#FBBC05"
      d="M17.2 8.6L13.8 12l3.4 3.4 3.8-2.2c1.1-.6 1.1-1.7 0-2.3l-3.8-2.3z"
    />
    <path
      fill="#34A853"
      d="M3.6 22.2l10.2-10.2 3.4 3.4-11.8 6.7c-.6.3-1.3.3-1.8.1z"
    />
    <path
      fill="#EA4335"
      d="M17.2 8.6L13.8 12 3.6 1.8c.5-.2 1.2-.2 1.8.1l11.8 6.7z"
    />
  </svg>
);

export const AppleIcon = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.93-2.85-.9.04-1.99.6-2.63 1.35-.57.65-1.06 1.71-.93 2.74 1.01.08 2.02-.49 2.63-1.24z" />
  </svg>
);

export const GooglePlayButton = ({ className = '', size = 'default', theme = 'dark' }) => {
  const isSmall = size === 'small';
  const isLight = theme === 'light';

  return (
    <motion.a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={`group relative inline-flex items-center gap-3 rounded-2xl border transition-all duration-300 select-none shadow-md ${
        isSmall ? 'px-3.5 py-1.5 text-xs' : 'px-5 py-2.5'
      } ${
        isLight
          ? 'bg-white text-slate-900 border-slate-200 hover:border-brand-primary/40 hover:shadow-lg'
          : 'bg-black/90 hover:bg-black text-white border-white/15 hover:border-white/30 hover:shadow-xl hover:shadow-black/40'
      } ${className}`}
      title="Get HomBites on Google Play"
    >
      <GooglePlayIcon className={isSmall ? 'w-5 h-5 flex-shrink-0' : 'w-7 h-7 flex-shrink-0'} />
      <div className="flex flex-col text-left leading-none">
        <span className={`${isSmall ? 'text-[9px]' : 'text-[10px]'} font-sans font-medium uppercase tracking-wider ${
          isLight ? 'text-slate-500' : 'text-white/70'
        }`}>
          GET IT ON
        </span>
        <span className={`${isSmall ? 'text-xs' : 'text-sm md:text-base'} font-display font-bold tracking-tight mt-0.5`}>
          Google Play
        </span>
      </div>
    </motion.a>
  );
};

export const AppStoreButton = ({ className = '', size = 'default', theme = 'dark' }) => {
  const isSmall = size === 'small';
  const isLight = theme === 'light';

  return (
    <motion.a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={`group relative inline-flex items-center gap-3 rounded-2xl border transition-all duration-300 select-none shadow-md ${
        isSmall ? 'px-3.5 py-1.5 text-xs' : 'px-5 py-2.5'
      } ${
        isLight
          ? 'bg-white text-slate-900 border-slate-200 hover:border-brand-primary/40 hover:shadow-lg'
          : 'bg-black/90 hover:bg-black text-white border-white/15 hover:border-white/30 hover:shadow-xl hover:shadow-black/40'
      } ${className}`}
      title="Download HomBites on the App Store"
    >
      <AppleIcon className={isSmall ? 'w-5 h-5 flex-shrink-0' : 'w-7 h-7 flex-shrink-0'} />
      <div className="flex flex-col text-left leading-none">
        <span className={`${isSmall ? 'text-[9px]' : 'text-[10px]'} font-sans font-medium opacity-80`}>
          Download on the
        </span>
        <span className={`${isSmall ? 'text-xs' : 'text-sm md:text-base'} font-display font-bold tracking-tight mt-0.5`}>
          App Store
        </span>
      </div>
    </motion.a>
  );
};

export default function AppStoreBadges({
  className = '',
  size = 'default',
  theme = 'dark',
  stackOnMobile = true,
}) {
  return (
    <div
      className={`flex items-center gap-3 ${
        stackOnMobile ? 'flex-col sm:flex-row' : 'flex-row'
      } ${className}`}
    >
      <GooglePlayButton size={size} theme={theme} />
      <AppStoreButton size={size} theme={theme} />
    </div>
  );
}
