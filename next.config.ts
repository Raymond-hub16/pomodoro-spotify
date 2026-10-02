import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The Docker build sets NEXT_OUTPUT=standalone so the image only carries the traced
  // server files. Local `npm run build && npm start` keeps the default output.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
