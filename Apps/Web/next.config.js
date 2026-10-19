/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  devIndicators: false,
  poweredByHeader: false,
  transpilePackages: ['@finora/contracts'],
  async headers() {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    const apiOrigin =
      apiBaseUrl && /^https?:\/\//i.test(apiBaseUrl)
        ? new URL(apiBaseUrl).origin
        : null;
    const connectSources = ["'self'", 'https:', ...(apiOrigin ? [apiOrigin] : [])];
    const headers = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy-Report-Only', value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; connect-src ${connectSources.join(' ')}; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'` },
    ];
    if (process.env.NODE_ENV === 'production') {
      headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
    }
    return [{ source: '/(.*)', headers }];
  },
  turbopack: {
    resolveAlias: {
      'next/babel': false,
    },
  },
};

module.exports = nextConfig;
