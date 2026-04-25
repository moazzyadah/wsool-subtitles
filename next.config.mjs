/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [
      'better-sqlite3',
      'fluent-ffmpeg',
      '@ffmpeg-installer/ffmpeg',
    ],
    serverActions: {
      bodySizeLimit: process.env.MAX_UPLOAD_MB
        ? `${process.env.MAX_UPLOAD_MB}mb`
        : '2048mb',
    },
  },
};

export default nextConfig;
