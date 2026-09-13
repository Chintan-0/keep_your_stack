import type { RecentSave, Settings, StoredSession } from "./types.js";
import { DEFAULT_APP_URL } from "./env.generated.js";

const SESSION_KEY = "kys_session";
const SETTINGS_KEY = "kys_settings";
const RECENT_SAVES_KEY = "kys_recent_saves";
const MAX_RECENT_SAVES = 8;

const DEFAULT_SETTINGS: Settings = {
  appUrl: DEFAULT_APP_URL,
  defaultStackId: null,
  defaultCategoryId: null,
  openInNewTab: true,
  closeAfterSave: false,
  autoEnrich: true,
  showSaveNotification: true,
};

export async function getSession(): Promise<StoredSession | null> {
  const { [SESSION_KEY]: session } = await chrome.storage.local.get(SESSION_KEY);
  return (session as StoredSession | undefined) ?? null;
}

export async function setSession(session: StoredSession | null): Promise<void> {
  if (session === null) {
    await chrome.storage.local.remove(SESSION_KEY);
  } else {
    await chrome.storage.local.set({ [SESSION_KEY]: session });
  }
}

export async function getSettings(): Promise<Settings> {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Tracked so the popup can tell "never connected" apart from "session expired". */
export async function hasEverConnected(): Promise<boolean> {
  const { kys_ever_connected } = await chrome.storage.local.get("kys_ever_connected");
  return kys_ever_connected === true;
}

export async function markEverConnected(): Promise<void> {
  await chrome.storage.local.set({ kys_ever_connected: true });
}

/**
 * A small local capture history for the popup's "Recently Saved" list —
 * never the authoritative record (the backend/web app is), never a second
 * bookmark manager. Shared across every capture path (popup save, context
 * menu, keyboard shortcut) so it reflects however the user actually saved.
 */
export async function getRecentSaves(): Promise<RecentSave[]> {
  const { [RECENT_SAVES_KEY]: saves } = await chrome.storage.local.get(RECENT_SAVES_KEY);
  return Array.isArray(saves) ? (saves as RecentSave[]) : [];
}

export async function addRecentSave(entry: RecentSave): Promise<void> {
  const current = await getRecentSaves();
  const next = [entry, ...current.filter((s) => s.id !== entry.id)].slice(0, MAX_RECENT_SAVES);
  await chrome.storage.local.set({ [RECENT_SAVES_KEY]: next });
}

/** Used by Undo — the resource no longer exists, so drop it from the local list too. */
export async function removeRecentSave(id: string): Promise<void> {
  const current = await getRecentSaves();
  await chrome.storage.local.set({ [RECENT_SAVES_KEY]: current.filter((s) => s.id !== id) });
}
