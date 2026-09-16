// Cross-platform wrapper for `npm run package:extension:prod`.
//
// `EXTENSION_APP_ORIGINS=... npm run package:extension` (the form
// documented in extension/README.md and used by generate-manifest.js)
// only works when npm executes package.json scripts through a POSIX
// shell. On Windows, `npm run` executes scripts through cmd.exe by
// default regardless of which shell invoked `npm` itself — cmd.exe has
// no `VAR=value command` syntax, so that exact command silently fails
// there with "'EXTENSION_APP_ORIGINS' is not recognized...". Setting
// the variable here, in Node itself, before spawning the real build
// works identically on every platform.
const { spawnSync } = require("child_process");

const PROD_ORIGIN = "https://keep-your-stack.vercel.app";

const result = spawnSync("npm", ["run", "package:extension"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, EXTENSION_APP_ORIGINS: PROD_ORIGIN },
});

process.exit(result.status ?? 1);
