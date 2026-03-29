/** @type {import('next').NextConfig} */
const nextConfig = {
  // The v5 app uses .jsx extensively
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],

  // Rewrite SPA routes to the root page so the client-side router handles them.
  // This replaces the old hash-based (#feed) navigation with clean paths (/feed).
  async rewrites() {
    return [
      { source: '/feed', destination: '/' },
      { source: '/submit', destination: '/' },
      { source: '/review', destination: '/' },
      { source: '/orgs', destination: '/' },
      { source: '/guide', destination: '/' },
      { source: '/rules', destination: '/' },
      { source: '/badges', destination: '/' },
      { source: '/vision', destination: '/' },
      { source: '/about', destination: '/' },
      { source: '/ai-agents', destination: '/' },
      { source: '/consensus', destination: '/' },
      { source: '/stories', destination: '/' },
      { source: '/audit', destination: '/' },
      { source: '/vault', destination: '/' },
      { source: '/profile', destination: '/' },
      { source: '/extensions', destination: '/' },
      { source: '/feedback', destination: '/' },
      { source: '/login', destination: '/' },
      { source: '/register', destination: '/' },
      { source: '/forgot-password', destination: '/' },
      { source: '/reset-password', destination: '/' },
      { source: '/citizen/:slug', destination: '/' },
      { source: '/record/:slug', destination: '/' },
    ];
  },
};

module.exports = nextConfig;
