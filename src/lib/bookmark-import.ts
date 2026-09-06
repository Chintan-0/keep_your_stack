export interface ParsedBookmark {
  title: string;
  url: string;
  /** e.g. "Bookmarks bar / Development / Frontend" — the Chrome folder path this bookmark lived in, if any. */
  folder: string | null;
  /** ISO date string from the export's ADD_DATE attribute, when present. */
  addedAt: string | null;
}

// Netscape Bookmark File format (what Chrome/Firefox/Edge all export) is a
// flat, non-nested-looking HTML document that's actually tree-shaped via
// <DT><H3>Folder</H3><DL><p>...contents...</DL><p> blocks. We never parse
// this with the DOM (no innerHTML, nothing gets executed) — just a single
// pass over the raw text picking out the handful of tags we care about, in
// the order they appear, tracking folder nesting with a plain stack.
const TOKEN_RE = /<H3[^>]*>([^<]*)<\/H3>|<A\s+([^>]*)>([^<]*)<\/A>|<DL>|<\/DL>/gi;

export function parseBookmarksHtml(html: string): ParsedBookmark[] {
  const results: ParsedBookmark[] = [];
  const folderStack: string[] = [];
  let pendingFolderName: string | null = null;

  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(html)) !== null) {
    const [full, folderHeading, anchorAttrs, anchorText] = match;

    if (folderHeading !== undefined) {
      // <H3>Name</H3> always precedes the <DL> that holds that folder's
      // contents — stash the name until we see that opening <DL>.
      pendingFolderName = decodeHtmlEntities(folderHeading.trim());
      continue;
    }

    if (/^<DL>$/i.test(full)) {
      folderStack.push(pendingFolderName ?? "");
      pendingFolderName = null;
      continue;
    }

    if (/^<\/DL>$/i.test(full)) {
      folderStack.pop();
      continue;
    }

    if (anchorAttrs !== undefined) {
      const hrefMatch = anchorAttrs.match(/HREF="([^"]*)"/i);
      if (!hrefMatch) continue;
      const url = decodeHtmlEntities(hrefMatch[1]);
      if (!/^https?:\/\//i.test(url)) continue; // skip javascript: bookmarklets etc.

      const title = decodeHtmlEntities((anchorText ?? "").trim()) || url;

      const addDateMatch = anchorAttrs.match(/ADD_DATE="(\d+)"/i);
      const addedAt = addDateMatch ? new Date(Number(addDateMatch[1]) * 1000).toISOString() : null;

      const folder = folderStack.filter(Boolean).join(" / ") || null;
      results.push({ title, url, folder, addedAt });
    }
  }

  return results;
}

/**
 * Quick sanity check before parsing — Chrome/Firefox/Edge exports all carry
 * this DOCTYPE and at least one <DL> bookmark list. Used to give a clear
 * error instead of silently "finding" 0 bookmarks in an unrelated file.
 */
export function looksLikeBookmarkExport(html: string): boolean {
  return /NETSCAPE-Bookmark-file-1/i.test(html) && /<DL>/i.test(html);
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
