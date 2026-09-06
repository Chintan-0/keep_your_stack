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
  openInNewTab: boolean;
}

export interface ExtStack {
  id: string;
  name: string;
  icon: string;
}

export interface ExtResource {
  id: string;
  title: string;
  url: string;
  stackIds: string[];
  tagIds: string[];
}

export interface SaveInput {
  url: string;
  title: string;
  faviconUrl?: string | null;
  useCases?: string[];
  notes?: string;
  tagNames?: string[];
  stackIds?: string[];
}

export interface SaveResult {
  resource: ExtResource;
  duplicate: boolean;
}
