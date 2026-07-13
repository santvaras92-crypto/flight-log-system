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

module.exports = nextConfig
