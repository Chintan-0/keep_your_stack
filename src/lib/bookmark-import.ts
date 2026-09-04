export interface ParsedBookmark {
  title: string;
  url: string;
}

// Parses a Netscape Bookmark File (the format Chrome/Firefox/Edge export)
// by pulling every <A HREF="..."> anchor out of the HTML.
export function parseBookmarksHtml(html: string): ParsedBookmark[] {
  const results: ParsedBookmark[] = [];
  const anchorRegex = /<A\s+([^>]*)>([^<]*)<\/A>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = match[1];
    const title = decodeHtmlEntities(match[2].trim());
    const hrefMatch = attrs.match(/HREF="([^"]*)"/i);
    if (!hrefMatch) continue;
    const url = decodeHtmlEntities(hrefMatch[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    results.push({ title: title || url, url });
  }
  return results;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
