// Zips the extension into public/downloads/keepyourstack-chrome-extension.zip
// — served directly by the Next.js app at /downloads/keepyourstack-chrome-
// extension.zip (see src/app/(app)/extension/page.tsx's "Download for
// Chrome" button) so anyone can grab a real, working build without cloning
// the repo. The same package also doubles as a future Chrome Web Store
// submission artifact (see extension/README.md) — one script, one output,
// both uses. Run via `npm run package:extension`, which builds dist/ first
// (respecting EXTENSION_APP_ORIGINS the same way build:extension does — see
// extension/scripts/generate-manifest.js — so the packaged manifest/popup
// point at whatever origin the build was run with, production included).
// Uses only Node's built-in zlib/fs — no extra dependency.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "..", "public", "downloads");
const outZip = path.join(outDir, "keepyourstack-chrome-extension.zip");

const INCLUDE = ["manifest.json", "popup.html", "popup.css", "options.html", "icons", "dist"];

// Defense in depth on top of the INCLUDE allowlist above (which already
// can't pull in .env files, node_modules, or source .ts — those simply
// aren't in this list): scan every packaged file's bytes for anything
// shaped like a real secret before writing the zip, so a mistake in
// INCLUDE or a stray committed file can't silently ship one.
const SECRET_PATTERNS = [
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /service_role/i,
  /sb_secret_/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /sk-ant-/i,
  /sk-proj-/i,
];

/** Minimal, dependency-free ZIP writer (store method — deflate optional). */
function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name.replace(/\\/g, "/"), "utf8");
    const crc = zlib.crc32 ? zlib.crc32(data) : crc32(data);
    const compressed = zlib.deflateRawSync(data);
    const useDeflate = compressed.length < data.length;
    const payload = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc >>> 0, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc >>> 0, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, end]);
}

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = makeTable());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    crc = (crc >>> 8) ^ table[c];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function makeTable() {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

function walk(rel) {
  const full = path.join(root, rel);
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    return fs.readdirSync(full).flatMap((entry) => walk(path.join(rel, entry)));
  }
  return [{ name: rel, data: fs.readFileSync(full) }];
}

// Clean whatever the previous run left behind before collecting files, so
// a stale zip can never survive a failed/aborted package and get mistaken
// for a fresh one.
if (fs.existsSync(outZip)) fs.rmSync(outZip);

const files = INCLUDE.filter((f) => fs.existsSync(path.join(root, f))).flatMap(walk);
if (!files.some((f) => f.name.startsWith("dist"))) {
  console.error("dist/ is missing or empty — run `npm run build:extension` first.");
  process.exit(1);
}

const flagged = [];
for (const { name, data } of files) {
  // Binary files (icons) can't meaningfully contain a leaked text secret —
  // skip them rather than pattern-matching arbitrary PNG bytes.
  if (/\.(png|jpg|jpeg|gif|ico)$/i.test(name)) continue;
  const text = data.toString("utf8");
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) flagged.push(`${name} matches ${pattern}`);
  }
}
if (flagged.length > 0) {
  console.error("Refusing to package — possible secret found in:\n" + flagged.map((f) => `  ${f}`).join("\n"));
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outZip, buildZip(files));
console.log(`Wrote ${path.relative(process.cwd(), outZip)} (${files.length} files, no secrets found)`);
