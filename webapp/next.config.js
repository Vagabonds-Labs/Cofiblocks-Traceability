const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./i18n.ts');

// Backend origin, e.g. http://localhost:4000. A trailing /api is tolerated,
// same as in lib/api/api.ts, so both always build the same URLs.
const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },

  async rewrites() {
    // 🚨 ONLY proxy in non-production
    if (process.env.NEXT_PUBLIC_ENV === 'production') {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
