// Regenerates extension/manifest.json's host_permissions and
// content_scripts.matches from EXTENSION_APP_ORIGINS (comma-separated
// origins, e.g. "https://app.keepyourstack.example"), defaulting to the
// local-dev origins. Nothing else in manifest.json is touched.
//
// This is the "obvious, documented, single place to change" for pointing
// a build at a production deployment (§24 of the Phase 5.1 spec) — reusing
// the project's existing environment-variable convention (.env.local /
// process.env), the same way NEXT_PUBLIC_SUPABASE_URL configures the web
// app, rather than a second bespoke mechanism. No secret ever belongs in
// this variable — it's just the public origin(s) the extension is allowed
// to talk to.
//
// Usage:
//   EXTENSION_APP_ORIGINS=https://app.keepyourstack.example npm run build:extension
//   EXTENSION_APP_ORIGINS=https://app.keepyourstack.example,http://localhost:3000 npm run build:extension
//
// Run automatically as part of `npm run build:extension` — see package.json.
const fs = require("fs");
const path = require("path");

const DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

/** Pure parsing/validation, exported separately so it's unit-testable — see generate-manifest.test.js. */
function parseOrigins(raw) {
  const origins = raw
    ? raw
        .split(",")
        .map((o) => o.trim().replace(/\/$/, ""))
        .filter(Boolean)
    : DEFAULT_ORIGINS;

  for (const origin of origins) {
    if (!/^https?:\/\/[^/]+$/.test(origin)) {
      throw new Error(
        `Invalid entry in EXTENSION_APP_ORIGINS: "${origin}" — expected a bare origin like "https://app.example.com" (no path, no trailing slash).`
      );
    }
  }
  return origins;
}

function run() {
  const manifestPath = path.join(__dirname, "..", "manifest.json");
  const raw = process.env.EXTENSION_APP_ORIGINS;

  let origins;
  try {
    origins = parseOrigins(raw);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const matches = origins.map((o) => `${o}/*`);

  manifest.host_permissions = matches;
  if (Array.isArray(manifest.content_scripts) && manifest.content_scripts[0]) {
    manifest.content_scripts[0].matches = matches;
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    raw
      ? `manifest.json updated for EXTENSION_APP_ORIGINS: ${origins.join(", ")}`
      : `manifest.json using default local-dev origins: ${origins.join(", ")} (set EXTENSION_APP_ORIGINS to change)`
  );
}

module.exports = { parseOrigins, DEFAULT_ORIGINS };

if (require.main === module) {
  run();
}
