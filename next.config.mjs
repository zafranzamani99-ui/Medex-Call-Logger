/** @type {import('next').NextConfig} */
const nextConfig = {
  // WHY: Prevent webpack from hanging on Windows when project path has spaces.
  // The 'CALL LOG' directory name causes file watcher issues with webpack's
  // default polling. These settings fix repeated cache corruption on Windows.
  webpack: (config, { dev }) => {
    if (dev) {
      // WHY: On Windows with spaces in path ("CALL LOG"), webpack's persistent
      // disk cache corrupts repeatedly, breaking CSS. Disable it entirely.
      // Uses in-memory cache instead — slightly slower cold start but no corruption.
      config.cache = { type: 'memory' }
    }
    return config
  },

  // WHY: Reduce server-side timeout for external fetches.
  // Default is 30s — if Supabase is unreachable, every page hangs for 30s.
  // 5s is plenty for a hosted database that normally responds in <300ms.
  httpAgentOptions: {
    keepAlive: true,
  },
};

export default nextConfig;
