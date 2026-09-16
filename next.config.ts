import type { NextConfig } from "next";

// Phase 16: production security headers. Scoped deliberately narrow rather
// than copy-pasted from a generic template — every source here is one this
// app actually uses:
//   - 'self' for scripts/styles/fonts: everything is same-origin (Next's
//     own bundles, next/font self-hosts Inter/JetBrains Mono — no Google
//     Fonts network fetch at runtime).
//   - 'unsafe-inline' on script-src/style-src: Next.js injects small
//     inline bootstrap scripts (RSC payload, hydration data) and Tailwind/
//     styled-jsx emit inline styles; a strict nonce-based policy is
//     possible but a bigger, riskier change than this hardening pass
//     warrants — see the Phase 16 report's Security section.
//   - connect-src includes the Supabase project URL (auth + every data
//     fetch goes there) — no other third-party APIs are called from the
//     browser.
//   - img-src is 'self' + data: only: resource favicons/images are letter
//     avatars rendered in CSS (src/components/ui/favicon.tsx), never an
//     <img> pointed at an arbitrary saved URL — so no need for a broad
//     https: allowance.
//   - frame-ancestors 'none' + X-Frame-Options DENY: nothing in the product
//     is meant to be iframed, including public stack pages.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// React/Next dev mode needs eval() for its debugging tooling (component
// stack reconstruction) — confirmed live: without this, dev mode logs
// "eval() is not supported... React will never use eval() in production
// mode" (React says so itself) and HMR breaks. Production never uses
// eval(), so 'unsafe-eval' is scoped to development only, not shipped.
const scriptSrc = process.env.NODE_ENV === "production" ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
const csp = [
  "default-src 'self'",
  scriptSrc,
  `style-src 'self' 'unsafe-inline'`,
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Every route except the API gets the full set — CSP/frame-
        // ancestors/Permissions-Policy are meaningful for a document a
        // browser renders, not a JSON response.
        source: "/((?!api/).*)",
        headers: securityHeaders,
      },
      {
        // API responses still get the two headers that matter regardless
        // of content type (nosniff stops a browser from ever executing a
        // JSON response as script/HTML if it's ever loaded directly;
        // Referrer-Policy limits what leaks via the Referer header on any
        // outbound link a response might trigger). Skips CSP/frame-
        // ancestors/Permissions-Policy here on purpose — meaningless on
        // JSON, and API routes already carry their own scoped CORS
        // headers for the extension (src/lib/cors.ts).
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
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
