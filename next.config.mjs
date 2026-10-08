/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pdf-parse', 'xlsx', 'mammoth'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Disable filesystem pack cache in development to prevent Windows ENOENT pack.gz rename collisions
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
