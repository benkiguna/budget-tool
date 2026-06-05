import { useState, useEffect } from 'react';
import { getLogoUrl } from '../lib/logo.js';

export default function MerchantLogo({ domain, logo, name, size = 20, className = '' }) {
  // stage 0 = try Trove logo, stage 1 = try logo.dev, stage 2 = letter avatar
  const [stage, setStage] = useState(0);

  const logoDev = getLogoUrl(domain);
  const url = stage === 0 && logo ? logo : (stage <= 1 ? logoDev : null);

  // Reset when merchant changes
  useEffect(() => { setStage(0); }, [logo, domain]);
  const initial = (name?.[0] ?? '?').toUpperCase();
  const base = `inline-flex shrink-0 rounded-md overflow-hidden ${className}`;

  if (!url) {
    return (
      <span
        className={`${base} items-center justify-center bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 font-semibold`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.48) }}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={`${base} object-contain bg-white`}
      style={{ width: size, height: size }}
      onError={() => setStage((s) => s + 1)}
    />
  );
}
