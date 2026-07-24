import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The rest of this monorepo pins typescript@7.0.2 (native compiler), which
  // doesn't expose the classic ts.sys API Next.js's built-in type-checking
  // relies on. This package carries its own classic typescript@5.x
  // (see package.json) and this flag tells Next.js to shell out to that
  // installed `tsc` CLI instead of using its bundled API.
  experimental: {
    useTypeScriptCli: true
  },
  // @sm-bot/logging re-exports Discord gateway event handlers, which pull in
  // discord.js. discord.js's WS layer (@discordjs/ws) lazily imports the
  // optional native compression addon "zlib-sync" via a plain import(), which
  // Turbopack tries to statically resolve and fails on since it isn't
  // installed (it's optional at runtime, never actually needed by the
  // dashboard's tRPC-only usage of @sm-bot/logging). Marking discord.js
  // external defers its resolution to Node at runtime instead of the bundler.
  serverExternalPackages: ["discord.js"]
};

export default nextConfig;
