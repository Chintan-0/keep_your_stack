import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 13: /@username public-profile URLs. A folder literally named
  // "@username" in the App Router is reserved for parallel routes, not a
  // real path segment — there's no way to make Next.js match a literal
  // "@" in a route folder name. The standard workaround: build the real
  // pages under a plain, never-user-facing path (src/app/u/...) and
  // rewrite the public-facing URL to it. Rewrites (unlike redirects) keep
  // the original URL in the browser's address bar, so a visitor typing or
  // sharing /@chintan never sees /u/chintan at all.
  async rewrites() {
    return [
      { source: "/@:username/:slug", destination: "/u/:username/:slug" },
      { source: "/@:username", destination: "/u/:username" },
    ];
  },
};

export default nextConfig;
