// TypeScript's isolatedModules (extension/tsconfig.json) appends an empty
// `export {};` to any compiled file with zero import/export statements —
// standard, harmless behavior for a real ES module. But content scripts
// (extension/src/content/*.ts, listed in manifest.json's
// content_scripts.js) are always loaded by Chrome as classic, non-module
// scripts — Manifest V3 content_scripts has no "type": "module" option the
// way background.type does — so that trailing `export {};` is a syntax
// error at runtime ("Uncaught SyntaxError: Unexpected token 'export'"),
// even though the same file compiles and typechecks fine. Only content
// scripts have this constraint (popup.html/options.html load their
// scripts with type="module", and the background service worker declares
// "type": "module" in manifest.json), so this only ever touches
// dist/content/*.js — never popup/options/background output.
const fs = require("fs");
const path = require("path");

/** Pure, exported separately so it's unit-testable — see fix-content-scripts.test.ts. */
function stripTrailingExport(source) {
  return source.replace(/\n?export\s*\{\s*\};?\s*$/, "\n");
}

function run() {
  const contentDir = path.join(__dirname, "..", "dist", "content");
  if (!fs.existsSync(contentDir)) {
    console.log("No dist/content/ to fix (nothing built yet).");
    return;
  }

  let fixed = 0;
  for (const file of fs.readdirSync(contentDir)) {
    if (!file.endsWith(".js")) continue;
    const filePath = path.join(contentDir, file);
    const original = fs.readFileSync(filePath, "utf8");
    const stripped = stripTrailingExport(original);
    if (stripped !== original) {
      fs.writeFileSync(filePath, stripped);
      fixed++;
    }
  }
  console.log(`fix-content-scripts: stripped module syntax from ${fixed} file(s) in dist/content/.`);
}

module.exports = { stripTrailingExport };

if (require.main === module) {
  run();
}
