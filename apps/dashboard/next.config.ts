import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // typescript@7.0.2 (native compiler) doesn't expose the classic ts.sys API
  // that Next.js's built-in type-checking normally relies on; this flag tells
  // Next.js to shell out to the installed `tsc` CLI instead.
  experimental: {
    useTypeScriptCli: true
  }
};

export default nextConfig;
