// Minimal mirrors of src/lib/types.ts — only the fields the extension
// actually reads or writes. Not the full Resource/Stack shape; the backend
// (src/lib/data/resources.ts) remains the single source of truth for
// everything else.

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds, from Supabase's session.expires_at. */
  expiresAt: number | null;
  userEmail: string | null;
}

export interface Settings {
  appUrl: string;
  defaultStackId: string | null;
  defaultCategoryId: string | null;
  openInNewTab: boolean;
  /** Close the popup automatically a moment after a successful save. */
  closeAfterSave: boolean;
  /** Trigger the same background enrichment pass the web app's Add Resource flow uses, right after a save. */
  autoEnrich: boolean;
  /** Chrome notification on a successful save (context menu / keyboard shortcut only — the popup's own success view is feedback enough on its own). */
  showSaveNotification: boolean;
}

export interface ExtStack {
  id: string;
  name: string;
  icon: string;
}

export interface ExtCategory {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ExtResource {
  id: string;
  title: string;
  url: string;
  categoryId: string | null;
  stackIds: string[];
  tagIds: string[];
  useCases: string[];
  isArchived: boolean;
}

export interface SaveInput {
  url: string;
  title: string;
  faviconUrl?: string | null;
  categoryId?: string | null;
  useCases?: string[];
  notes?: string;
  tagNames?: string[];
  stackIds?: string[];
  /** Explicit re-save of a URL that's already saved — never set implicitly. */
  force?: boolean;
}

/** One entry in the local "Recently Saved" list — a convenience, never the authoritative record (the backend is). */
export interface RecentSave {
  id: string;
  title: string;
  url: string;
  savedAt: number;
}

export interface SaveResult {
  resource: ExtResource;
  duplicate: boolean;
}
