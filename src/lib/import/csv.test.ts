import { describe, it, expect } from "vitest";
import { parseCsvRows, detectCsvColumns, parseCsvBookmarks, sanitizeCsvCell, toCsvRow, serializeCsv } from "./csv";

describe("parseCsvRows", () => {
  it("parses a simple comma-separated file", () => {
    expect(parseCsvRows("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with embedded commas", () => {
    expect(parseCsvRows('title,url\n"Hello, world",https://example.com')).toEqual([
      ["title", "url"],
      ["Hello, world", "https://example.com"],
    ]);
  });

  it("handles doubled quotes inside a quoted field", () => {
    expect(parseCsvRows('note\n"She said ""hi"""')).toEqual([["note"], ['She said "hi"']]);
  });

  it("handles embedded newlines inside a quoted field", () => {
    expect(parseCsvRows('note\n"line one\nline two"')).toEqual([["note"], ["line one\nline two"]]);
  });

  it("handles CRLF and bare LF line endings", () => {
    expect(parseCsvRows("a,b\r\n1,2\r\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("ignores a trailing blank line", () => {
    expect(parseCsvRows("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("detectCsvColumns", () => {
  it("recognizes standard headers", () => {
    expect(detectCsvColumns(["title", "url", "description", "tags", "category", "notes"])).toEqual({
      title: 0,
      url: 1,
      description: 2,
      tags: 3,
      category: 4,
      notes: 5,
    });
  });

  it("recognizes alternate header spellings", () => {
    expect(detectCsvColumns(["Website Name", "Link", "Labels"])).toEqual({
      title: 0,
      url: 1,
      tags: 2,
    });
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(detectCsvColumns([" URL ", "TITLE"])).toEqual({ url: 0, title: 1 });
  });

  it("returns no url mapping when nothing looks like one", () => {
    expect(detectCsvColumns(["foo", "bar"]).url).toBeUndefined();
  });
});

describe("parseCsvBookmarks", () => {
  it("parses rows with standard headers", () => {
    const csv = "title,url,description,tags,category,notes\nReact,https://react.dev,A library,\"js, ui\",Frontend,Great docs";
    const { items, invalidRows } = parseCsvBookmarks(csv, { title: 0, url: 1, description: 2, tags: 3, category: 4, notes: 5 });
    expect(invalidRows).toEqual([]);
    expect(items).toEqual([
      {
        title: "React",
        url: "https://react.dev",
        description: "A library",
        tags: ["js", "ui"],
        folderPath: "Frontend",
        notes: "Great docs",
      },
    ]);
  });

  it("reports a row missing the required URL as invalid, without dropping the rest of the file", () => {
    const csv = "title,url\nGood,https://good.example.com\nBad,\nAlso Good,https://also-good.example.com";
    const { items, invalidRows } = parseCsvBookmarks(csv, { title: 0, url: 1 });
    expect(items.map((i) => i.title)).toEqual(["Good", "Also Good"]);
    expect(invalidRows).toEqual([{ row: 3, reason: "Missing URL" }]);
  });

  it("falls back to the URL as the title when no title column is mapped", () => {
    const csv = "url\nhttps://example.com";
    const { items } = parseCsvBookmarks(csv, { url: 0 });
    expect(items[0].title).toBe("https://example.com");
  });

  it("treats every other field as optional", () => {
    const csv = "url\nhttps://example.com";
    const { items } = parseCsvBookmarks(csv, { url: 0 });
    expect(items).toEqual([{ title: "https://example.com", url: "https://example.com", description: undefined, tags: undefined, folderPath: null, notes: undefined }]);
  });

  it("tolerates a malformed row with too few columns instead of crashing", () => {
    const csv = "title,url,notes\nShort row,https://example.com";
    const { items } = parseCsvBookmarks(csv, { title: 0, url: 1, notes: 2 });
    expect(items).toEqual([{ title: "Short row", url: "https://example.com", description: undefined, tags: undefined, folderPath: null, notes: undefined }]);
  });

  it("splits tags on both comma and semicolon", () => {
    const csv = 'url,tags\nhttps://example.com,"api; rest,http"';
    const { items } = parseCsvBookmarks(csv, { url: 0, tags: 1 });
    expect(items[0].tags).toEqual(["api", "rest", "http"]);
  });
});

describe("CSV export safety (formula injection)", () => {
  it("prefixes a leading = with an apostrophe", () => {
    expect(sanitizeCsvCell("=1+1")).toBe("'=1+1");
  });
  it("prefixes a leading + with an apostrophe", () => {
    expect(sanitizeCsvCell("+1")).toBe("'+1");
  });
  it("prefixes a leading - with an apostrophe", () => {
    expect(sanitizeCsvCell("-2+3")).toBe("'-2+3");
  });
  it("prefixes a leading @ with an apostrophe", () => {
    expect(sanitizeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
  it("leaves an ordinary value untouched", () => {
    expect(sanitizeCsvCell("React")).toBe("React");
  });
  it("leaves an empty value untouched", () => {
    expect(sanitizeCsvCell("")).toBe("");
  });

  it("toCsvRow quotes and escapes every cell, including a formula-injection attempt end to end", () => {
    expect(toCsvRow(["=cmd|'/c calc'!A1", 'He said "hi"', "plain"])).toBe(
      `"'=cmd|'/c calc'!A1","He said ""hi""","plain"`
    );
  });

  it("serializeCsv joins rows with CRLF", () => {
    expect(serializeCsv([["a", "b"], ["1", "2"]])).toBe('"a","b"\r\n"1","2"');
  });
});
