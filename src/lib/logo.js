const LOGO_TOKEN = import.meta.env.VITE_LOGO_API_KEY;

export function getLogoUrl(domain) {
  if (!domain || domain === 'unknown' || !LOGO_TOKEN) return null;
  return `https://img.logo.dev/${domain}?token=${LOGO_TOKEN}&format=webp&size=64`;
}
