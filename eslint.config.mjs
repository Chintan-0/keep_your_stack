import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Compiled extension output, and its plain-Node (CommonJS) build
    // tooling — not app source, not run through the Next.js/TS toolchain.
    "extension/dist/**",
    "extension/scripts/**",
  ]),
]);

export default eslintConfig;
