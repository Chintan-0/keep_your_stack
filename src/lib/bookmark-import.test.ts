import { describe, it, expect } from "vitest";
import { parseBookmarksHtml, looksLikeBookmarkExport } from "./bookmark-import";

const SAMPLE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1690000000">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://react.dev" ADD_DATE="1690000001">React</A>
        <DT><H3 ADD_DATE="1690000002">Development</H3>
        <DL><p>
            <DT><H3 ADD_DATE="1690000003">Frontend</H3>
            <DL><p>
                <DT><A HREF="https://nextjs.org" ADD_DATE="1690000004">Next.js</A>
            </DL><p>
            <DT><A HREF="https://tailwindcss.com" ADD_DATE="1690000005">Tailwind &amp; Friends</A>
        </DL><p>
    </DL><p>
    <DT><H3 ADD_DATE="1690000006">Other bookmarks</H3>
    <DL><p>
        <DT><A HREF="https://example.com">No date bookmark</A>
    </DL><p>
</DL><p>
`;

describe("parseBookmarksHtml", () => {
  it("extracts every bookmark link regardless of folder nesting depth", () => {
    const result = parseBookmarksHtml(SAMPLE);
    expect(result.map((b) => b.url)).toEqual([
      "https://react.dev",
      "https://nextjs.org",
      "https://tailwindcss.com",
      "https://example.com",
    ]);
  });

  it("preserves the full folder path for a top-level bookmark", () => {
    const result = parseBookmarksHtml(SAMPLE);
    expect(result[0]).toMatchObject({ title: "React", folder: "Bookmarks bar" });
  });

  it("preserves the full nested folder path (parent / child)", () => {
    const result = parseBookmarksHtml(SAMPLE);
    expect(result[1]).toMatchObject({ folder: "Bookmarks bar / Development / Frontend" });
    expect(result[2]).toMatchObject({ folder: "Bookmarks bar / Development" });
  });

  it("pops back out of a nested folder correctly for siblings after it", () => {
    const result = parseBookmarksHtml(SAMPLE);
    expect(result[3]).toMatchObject({ folder: "Other bookmarks" });
  });

  it("decodes HTML entities in titles", () => {
    const result = parseBookmarksHtml(SAMPLE);
    expect(result[2].title).toBe("Tailwind & Friends");
  });

  it("converts ADD_DATE (unix seconds) to an ISO date when present", () => {
    const result = parseBookmarksHtml(SAMPLE);
    expect(result[0].addedAt).toBe(new Date(1690000001 * 1000).toISOString());
  });

  it("leaves addedAt null when ADD_DATE is missing", () => {
    const result = parseBookmarksHtml(SAMPLE);
    expect(result[3].addedAt).toBeNull();
  });

  it("ignores folder headings (H3) — they aren't bookmarks", () => {
    const result = parseBookmarksHtml(SAMPLE);
    expect(result.some((b) => b.title === "Development" || b.title === "Frontend")).toBe(false);
  });

  it("skips non-http(s) entries like javascript: bookmarklets", () => {
    const withBookmarklet = `<DT><A HREF="javascript:void(alert('hi'))">Bookmarklet</A>
      <DT><A HREF="https://real-site.com">Real Site</A>`;
    const result = parseBookmarksHtml(withBookmarklet);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://real-site.com");
  });

  it("returns an empty array for malformed or empty input instead of throwing", () => {
    expect(parseBookmarksHtml("")).toEqual([]);
    expect(parseBookmarksHtml("<not>even<html")).toEqual([]);
  });

  it("falls back to the URL as the title when the link has no text", () => {
    const result = parseBookmarksHtml(`<DT><A HREF="https://example.com"></A>`);
    expect(result[0].title).toBe("https://example.com");
  });

  it("gives a top-level bookmark (no folder) a null folder, not an empty string", () => {
    const result = parseBookmarksHtml(`<DT><A HREF="https://example.com">Example</A>`);
    expect(result[0].folder).toBeNull();
  });
});

describe("looksLikeBookmarkExport", () => {
  it("accepts a real Netscape bookmark export", () => {
    expect(looksLikeBookmarkExport(SAMPLE)).toBe(true);
  });

  it("rejects an unrelated HTML file", () => {
    expect(looksLikeBookmarkExport("<html><body><h1>Not bookmarks</h1></body></html>")).toBe(false);
  });

  it("rejects plain text", () => {
    expect(looksLikeBookmarkExport("just some random text, not html at all")).toBe(false);
  });
});
