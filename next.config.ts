import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // The Manual page reads docs/*.md at request time; make sure the files
  // travel with the deployed function.
  outputFileTracingIncludes: {
    "/admin/manual/[[...slug]]": ["./docs/*.md"],
  },
  experimental: {
    serverActions: {
      // Schedule tile notes embed inline images as data URLs.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
