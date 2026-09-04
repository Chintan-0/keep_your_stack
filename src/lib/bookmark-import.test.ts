import { describe, it, expect } from "vitest";
import { parseBookmarksHtml } from "./bookmark-import";

const SAMPLE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://react.dev" ADD_DATE="1690000000">React</A>
    <DT><A HREF="https://nextjs.org" ADD_DATE="1690000001">Next.js</A>
    <DT><H3>A Folder</H3>
    <DL><p>
        <DT><A HREF="https://tailwindcss.com">Tailwind &amp; Friends</A>
    </DL><p>
</DL><p>
`;

describe("parseBookmarksHtml", () => {
  it("extracts every bookmark link regardless of nesting in folders", () => {
    const result = parseBookmarksHtml(SAMPLE);
    expect(result).toHaveLength(3);
    expect(result.map((b) => b.url)).toEqual([
      "https://react.dev",
      "https://nextjs.org",
      "https://tailwindcss.com",
    ]);
  });

  it("decodes HTML entities in titles", () => {
    const result = parseBookmarksHtml(SAMPLE);
    expect(result[2].title).toBe("Tailwind & Friends");
  });

  it("ignores folder headings (H3) — they aren't bookmarks", () => {
    const result = parseBookmarksHtml(SAMPLE);
    expect(result.some((b) => b.title === "A Folder")).toBe(false);
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
});
