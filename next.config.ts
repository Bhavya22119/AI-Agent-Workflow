import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No `ignoreBuildErrors` / `ignoreDuringBuilds` escape hatches: a type error
  // or lint error should fail the build, not ship.
};

export default nextConfig;
