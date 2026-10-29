/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['lucide-react'],
  serverExternalPackages: ['pdf-parse', 'xlsx', 'mammoth'],
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  webpack: (config, { dev }) => {
    if (dev) {
      // Disable filesystem pack cache in development to prevent Windows ENOENT pack.gz rename collisions
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
