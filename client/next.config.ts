import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/favicon.ico", destination: "/bridge-icon-clean.png", permanent: false },
    ];
  },
};

export default nextConfig;
