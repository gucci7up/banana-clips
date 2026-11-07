/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@banana/config', '@banana/shared', '@banana/video-types'],
  async rewrites() {
    const apiTarget = process.env.INTERNAL_API_ORIGIN || 'http://127.0.0.1:4000';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiTarget}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
