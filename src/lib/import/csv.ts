// A small, dependency-free RFC4180-ish CSV reader/writer — good enough for
// "export from KeepYourStack" and "import a spreadsheet someone made by
// hand or exported from another tool", without pulling in a parsing
// library for something this contained. Handles quoted fields (including
// embedded commas, quotes, and newlines), CRLF and bare-LF line endings,
// and rows that are shorter/longer than the header (padded/truncated
// rather than thrown away — a single malformed row must never sink the
// whole file).

/** Parses raw CSV text into rows of raw string cells. No header handling, no type coercion. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  function endCell() {
    row.push(cell);
    cell = "";
  }
  function endRow() {
    endCell();
    rows.push(row);
    row = [];
  }

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      endCell();
      i += 1;
      continue;
    }
    if (c === "\r") {
      // Swallow bare \r and \r\n alike — the \n (if any) is consumed next iteration.
      i += 1;
      continue;
    }
    if (c === "\n") {
      endRow();
      i += 1;
      continue;
    }
    cell += c;
    i += 1;
  }
  // Trailing cell/row, unless the file ended cleanly on a newline (which
  // already flushed via endRow and left nothing pending).
  if (cell !== "" || row.length > 0) endRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export interface CsvColumnMap {
  title?: number;
  url: number;
  description?: number;
  tags?: number;
  category?: number;
  notes?: number;
}

// Common header spellings a real export might use, matched
// case-insensitively with surrounding whitespace trimmed. The first match
// wins — order matters only in that "url" beats "link" if a file
// (implausibly) had both.
const HEADER_ALIASES: Record<keyof CsvColumnMap, string[]> = {
  title: ["title", "name", "website name", "bookmark"],
  url: ["url", "link", "address", "href", "website"],
  description: ["description", "desc", "summary"],
  tags: ["tags", "labels", "keywords"],
  category: ["category", "folder", "collection", "group"],
  notes: ["notes", "note", "comment", "comments"],
};

/** Detects a best-guess column mapping from a header row. Returns null for `url` if no column looks like one — the caller must ask the user to map it explicitly. */
export function detectCsvColumns(header: string[]): Partial<CsvColumnMap> {
  const normalized = header.map((h) => h.trim().toLowerCase());
  const map: Partial<CsvColumnMap> = {};
  for (const key of Object.keys(HEADER_ALIASES) as (keyof CsvColumnMap)[]) {
    const idx = normalized.findIndex((h) => HEADER_ALIASES[key].includes(h));
    if (idx !== -1) (map as Record<string, number>)[key] = idx;
  }
  return map;
}

export interface CsvImportResult {
  items: ImportItemDraft[];
  /** Rows that couldn't produce a usable item (no URL after mapping) — 1-indexed, header excluded, for a human-readable "row 4" message. */
  invalidRows: { row: number; reason: string }[];
}

/** Same shape as ImportItem but without `source` — the caller (the import page) stamps that on, since csv.ts doesn't know or care what it'll be labeled. */
export interface ImportItemDraft {
  title: string;
  url: string;
  description?: string;
  tags?: string[];
  folderPath?: string | null;
  notes?: string;
}

/**
 * Parses a full CSV file into import-ready items using an explicit column
 * map (from detectCsvColumns, possibly corrected by the user). Only `url`
 * is required — a row missing it is reported as invalid rather than
 * silently dropped, so the preview's "invalid" count is real.
 */
export function parseCsvBookmarks(text: string, columns: CsvColumnMap): CsvImportResult {
  const rows = parseCsvRows(text);
  const dataRows = rows.slice(1); // first row is always the header here
  const items: ImportItemDraft[] = [];
  const invalidRows: { row: number; reason: string }[] = [];

  const cellAt = (row: string[], idx: number | undefined): string => {
    if (idx === undefined || idx < 0 || idx >= row.length) return "";
    return row[idx]?.trim() ?? "";
  };

  dataRows.forEach((row, i) => {
    const url = cellAt(row, columns.url);
    if (!url) {
      invalidRows.push({ row: i + 2, reason: "Missing URL" }); // +2: 1-indexed, header was row 1
      return;
    }
    const title = cellAt(row, columns.title) || url;
    const description = cellAt(row, columns.description) || undefined;
    const notes = cellAt(row, columns.notes) || undefined;
    const category = cellAt(row, columns.category) || null;
    const tagsRaw = cellAt(row, columns.tags);
    const tags = tagsRaw
      ? tagsRaw
          .split(/[;,]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;

    items.push({ title, url, description, tags, folderPath: category, notes });
  });

  return { items, invalidRows };
}

// ── CSV export ────────────────────────────────────────────────────────────

/**
 * Formula-injection guard (OWASP's standard CSV-export mitigation): a cell
 * whose first character is one a spreadsheet treats as a formula prefix
 * gets a leading apostrophe, which every major spreadsheet application
 * renders as "force this to be read as text", neutralizing the formula
 * without changing what the user sees. Applied to every exported cell,
 * not just ones that look suspicious — the whole point is not having to
 * trust the content.
 */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

export function sanitizeCsvCell(value: string): string {
  if (value.length > 0 && FORMULA_PREFIXES.includes(value[0])) {
    return `'${value}`;
  }
  return value;
}

function escapeCsvField(value: string): string {
  const sanitized = sanitizeCsvCell(value);
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export function toCsvRow(cells: string[]): string {
  return cells.map(escapeCsvField).join(",");
}

export function serializeCsv(rows: string[][]): string {
  return rows.map(toCsvRow).join("\r\n");
}
