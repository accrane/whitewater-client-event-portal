import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      // Schedule tile notes embed inline images as data URLs.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
