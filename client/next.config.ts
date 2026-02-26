import type { NextConfig } from "next";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.159:3000", "192.168.0.159:3003"],
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/favicon.ico", destination: "/bridge-icon-clean.png", permanent: false },
    ];
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
    ];
  },
};

export default nextConfig;
