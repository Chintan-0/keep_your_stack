import { normalizeUrl, getDomain } from "./utils";

export interface FetchedMetadata {
  title: string;
  description: string;
  domain: string;
}

// A small library of known responses so the demo feels real for common
// developer tools. Anything else falls back to a reasonable guess from the
// domain name. This simulates a server-side metadata fetch (og:title,
// og:description, favicon) without needing a real backend.
const KNOWN: Record<string, FetchedMetadata> = {
  "squoosh.app": {
    title: "Squoosh",
    description: "Compress and optimize images directly in your browser.",
    domain: "squoosh.app",
  },
  "usebruno.com": {
    title: "Bruno",
    description: "Fast, offline-first, Git-friendly API client for testing REST and GraphQL.",
    domain: "usebruno.com",
  },
  "react-svgr.com": {
    title: "SVGR",
    description: "Convert SVG files into ready-to-use React JSX components.",
    domain: "react-svgr.com",
  },
  "tailwindcss.com": {
    title: "Tailwind CSS",
    description: "A utility-first CSS framework for building custom designs quickly.",
    domain: "tailwindcss.com",
  },
  "vercel.com": {
    title: "Vercel",
    description: "Deployment platform for frontend frameworks with instant previews.",
    domain: "vercel.com",
  },
  "postman.com": {
    title: "Postman",
    description: "A full-featured platform for building and testing APIs.",
    domain: "postman.com",
  },
  "jwt.io": {
    title: "jwt.io",
    description: "Decode, verify, and inspect JSON Web Tokens in the browser.",
    domain: "jwt.io",
  },
  "regex101.com": {
    title: "regex101",
    description: "Build, test, and debug regular expressions with live explanations.",
    domain: "regex101.com",
  },
};

// Domains that simulate an unreachable page / failed metadata extraction,
// so the "Save Anyway" error-state flow can be demoed.
const UNREACHABLE = new Set(["example-broken-site.test", "unreachable.test"]);

function titleFromDomain(domain: string): string {
  const base = domain.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function fetchMetadata(
  rawUrl: string
): Promise<{ ok: true; data: FetchedMetadata } | { ok: false; domain: string }> {
  return new Promise((resolve) => {
    const normalized = normalizeUrl(rawUrl);
    const delay = 500 + Math.random() * 500;
    setTimeout(() => {
      if (!normalized) {
        resolve({ ok: false, domain: rawUrl });
        return;
      }
      const domain = getDomain(normalized);
      if (UNREACHABLE.has(domain)) {
        resolve({ ok: false, domain });
        return;
      }
      const known = KNOWN[domain];
      if (known) {
        resolve({ ok: true, data: known });
        return;
      }
      resolve({
        ok: true,
        data: {
          title: titleFromDomain(domain),
          description: "",
          domain,
        },
      });
    }, delay);
  });
}
