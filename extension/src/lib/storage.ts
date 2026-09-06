import type { Settings, StoredSession } from "./types";

const SESSION_KEY = "kys_session";
const SETTINGS_KEY = "kys_settings";

const DEFAULT_SETTINGS: Settings = {
  appUrl: "http://localhost:3000",
  defaultStackId: null,
  openInNewTab: true,
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
