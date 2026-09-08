import { setSession, markEverConnected, getSettings, addRecentSave } from "../lib/storage";
import { findExisting, saveResource, enrichResource, ApiError, AuthError } from "../lib/api";
import { isSupportedUrl } from "../lib/url";
import type { StoredSession } from "../lib/types";

const MENU_SAVE_PAGE = "keepyourstack-save-page";
const MENU_SAVE_LINK = "keepyourstack-save-link";
const COMMAND_QUICK_SAVE = "quick-save";

chrome.runtime.onInstalled.addListener(() => {
  // Two distinct items rather than one generic one — right-clicking a link
  // inside a page is ambiguous ("save this page" or "save what I clicked
  // on?") without it, and the target must be exactly what the user meant:
  // the link's own URL, never the page it happens to sit on.
  chrome.contextMenus.create({ id: MENU_SAVE_PAGE, title: "Save to KeepYourStack", contexts: ["page"] });
  chrome.contextMenus.create({ id: MENU_SAVE_LINK, title: "Save link to KeepYourStack", contexts: ["link"] });
});

// The web app's Extension page (only on the origins listed in
// content_scripts) dispatches a `keepyourstack:connect` DOM event with the
// user's *own* already-established Supabase session after they click
// "Connect Extension" — see extension/src/content/bridge.ts, which relays
// it here. This is the entire auth bridge: no password, no second login
// form, no long-lived secret — just the same short-lived session token the
// web app already holds, handed over by an explicit user action.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "KYS_CONNECT") {
    const session: StoredSession = {
      accessToken: message.session.accessToken,
      refreshToken: message.session.refreshToken,
      expiresAt: message.session.expiresAt ?? null,
      userEmail: message.session.userEmail ?? null,
    };
    setSession(session)
      .then(markEverConnected)
      .then(() => sendResponse({ ok: true }));
    return true; // keep the message channel open for the async response
  }
  return false;
});

/**
 * The one-click save path shared by the context menu and the keyboard
 * shortcut — deliberately never opens the popup (Chrome has no API to do
 * that programmatically); a notification is the only feedback available
 * here, kept sparse per settings. This never scrapes the link target's own
 * page for metadata — only the title Chrome already knows for the
 * *current* tab, or the link text (untrusted, used only as a title
 * fallback) for a link save. Enrichment (real title/description) happens
 * server-side, same as every other capture path.
 */
async function quickSave(url: string, title: string, faviconUrl: string | null | undefined) {
  if (!isSupportedUrl(url)) {
    notify("Can't save this page", "This page can't be saved to KeepYourStack.", true);
    return;
  }

  const settings = await getSettings();

  try {
    const existing = await findExisting(url);
    if (existing) {
      if (existing.isArchived) {
        notify("Already saved in Archive", `"${existing.title}" is archived. Restore it from KeepYourStack.`, true);
      } else {
        notify("Already saved", `"${existing.title}" is already in your stack.`, true);
      }
      return;
    }

    const { resource } = await saveResource({
      url,
      title,
      faviconUrl: faviconUrl ?? null,
      stackIds: settings.defaultStackId ? [settings.defaultStackId] : [],
      categoryId: settings.defaultCategoryId,
    });

    void addRecentSave({ id: resource.id, title: resource.title, url: resource.url, savedAt: Date.now() });
    notify("Saved to KeepYourStack", resource.title, settings.showSaveNotification);
    if (settings.autoEnrich) void enrichResource(resource.id);
  } catch (e) {
    if (e instanceof AuthError) {
      notify("Not connected", "Open the KeepYourStack extension icon to connect your account.", true);
    } else if (e instanceof ApiError) {
      notify("Couldn't save this page", e.message, true);
    } else {
      notify("Couldn't save this page", "Check your connection and try again.", true);
    }
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_SAVE_PAGE) {
    const url = info.pageUrl ?? tab?.url;
    if (!url) return;
    await quickSave(url, tab?.title || url, tab?.favIconUrl);
    return;
  }
  if (info.menuItemId === MENU_SAVE_LINK) {
    // The link's own target — never the page it's on, and never visited
    // just to scrape a better title. linkText isn't reliably available
    // from the context menu API, so the raw URL is the fallback title;
    // server-side enrichment fills in the real title afterward.
    const url = info.linkUrl;
    if (!url) return;
    await quickSave(url, url, undefined);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== COMMAND_QUICK_SAVE) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  await quickSave(tab.url, tab.title || tab.url, tab.favIconUrl);
});

function notify(title: string, message: string, show: boolean) {
  // Sparse, meaningful-only notifications — errors and "already saved"
  // always surface (there's no other feedback channel for a context-menu
  // or shortcut save), but a plain success notification respects the
  // user's own showSaveNotification setting.
  if (!show) return;
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}
