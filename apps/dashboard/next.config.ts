import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The rest of this monorepo pins typescript@7.0.2 (native compiler), which
  // doesn't expose the classic ts.sys API Next.js's built-in type-checking
  // relies on. This package carries its own classic typescript@5.x
  // (see package.json) and this flag tells Next.js to shell out to that
  // installed `tsc` CLI instead of using its bundled API.
  experimental: {
    useTypeScriptCli: true
  }
};

export default nextConfig;
