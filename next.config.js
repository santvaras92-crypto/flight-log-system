const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // Take control of the page as soon as the SW activates so a cold offline
  // launch is handled by the SW without needing a prior reload.
  clientsClaim: true,
  // Precache the offline shell so reopening the app with no connection always
  // renders something useful even if the requested route was never cached.
  additionalManifestEntries: [
    { url: '/offline.html', revision: 'offline-v2' },
  ],
  // When a navigation request can't be served (offline + not cached), fall back
  // to the last cached page if available, otherwise the offline shell.
  fallbacks: {
    document: '/offline.html',
  },
  runtimeCaching: [
    {
      // Handle page navigations (app cold-start, link clicks) reliably offline.
      // NetworkFirst with a short timeout: try the server briefly, then fall
      // back to the last cached HTML so reopening offline shows saved data fast.
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
        },
        matchOptions: {
          ignoreVary: true,
          ignoreSearch: true,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      // Fallback catch-all for other same-origin GETs
      urlPattern: /^https?:\/\/.*$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'misc-cache',
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24, // 24 hours
        },
        matchOptions: {
          ignoreVary: true,
        },
      },
      method: 'GET',
    },
    {
      urlPattern: /\.(png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
    {
      urlPattern: /\.(js|css|woff|woff2|ttf)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-resources',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
    {
      urlPattern: /\/api\/.*$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 5, // 5 minutes
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Disable webpack persistent cache to prevent Railway/Nixpacks stale module errors
  webpack: (config, { isServer }) => {
    config.cache = false;
    // Ensure @/* alias resolves correctly even if webpack cache is stale
    const path = require('path');
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    };
    return config;
  },
}

module.exports = withPWA(nextConfig)
