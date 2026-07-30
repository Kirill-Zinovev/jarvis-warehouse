import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Cloudflare uses the OpenNext adapter; standalone output is not needed. */
  reactStrictMode: false,
  allowedDevOrigins: ["*"],
};

export default nextConfig;
