export type Pricing = "free" | "freemium" | "paid" | "open-source";
export type Platform = "web" | "desktop" | "cli" | "mobile" | "vscode-extension" | "browser-extension";

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Stack {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  color: string; // token key, e.g. "accent" | "violet" | "cyan" | "success" | "warning"
  createdAt: string;
}

export interface Resource {
  id: string;
  title: string;
  url: string;
  domain: string;
  description: string;
  faviconLetter: string; // fallback favicon glyph
  categoryId: string | null;
  useCases: string[]; // "Useful for" bullet points
  notes: string; // personal note
  tagIds: string[];
  stackIds: string[];
  pricing: Pricing | null;
  platform: Platform[] | null;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  useCount: number;
  /** e.g. "chrome-bookmarks" — set only for imported resources. */
  importSource: string | null;
  /** Original folder path at import time, e.g. "Bookmarks bar / Development / Frontend". */
  importFolder: string | null;
}

export interface SearchMatch {
  resource: Resource;
  score: number;
  matchedOn: string[]; // human labels: "API Testing", "GraphQL", note excerpt, etc.
}
