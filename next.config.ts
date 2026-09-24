import type { NextConfig } from "next";

// A phone opening the dev server by this computer's network address (the QR
// code for sending a photo, lib/phone-link.ts) is a different origin from
// "localhost", and Next 16 blocks cross-origin requests to its dev internals
// (hot reload) by default. Private network addresses only; `*` matches one
// segment. Development only: production ignores it.
const PRIVATE_NETWORKS = [
  "192.168.*.*",
  "10.*.*.*",
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
  "*.local",
];

const nextConfig: NextConfig = {
  allowedDevOrigins: PRIVATE_NETWORKS,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
