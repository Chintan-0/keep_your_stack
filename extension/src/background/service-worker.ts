import { setSession, markEverConnected, getSettings } from "../lib/storage";
import { findExisting, saveResource, ApiError, AuthError } from "../lib/api";
import { isSupportedUrl } from "../lib/url";
import type { StoredSession } from "../lib/types";

const MENU_ID = "keepyourstack-save";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Save to KeepYourStack",
    contexts: ["page", "link"],
  });
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const url = info.linkUrl ?? info.pageUrl ?? tab?.url;
  const title = tab?.title || url || "Untitled";
  if (!url || !isSupportedUrl(url)) {
    notify("Can't save this page", "This page can't be saved to KeepYourStack.");
    return;
  }

  try {
    const existing = await findExisting(url);
    if (existing) {
      notify("Already saved", `"${existing.title}" is already in your stack.`);
      return;
    }
    const { defaultStackId } = await getSettings();
    const { resource } = await saveResource({
      url,
      title,
      faviconUrl: tab?.favIconUrl ?? null,
      stackIds: defaultStackId ? [defaultStackId] : [],
    });
    notify("Saved to KeepYourStack", resource.title);
  } catch (e) {
    if (e instanceof AuthError) {
      notify("Not connected", "Open the KeepYourStack extension icon to connect your account.");
    } else if (e instanceof ApiError) {
      notify("Couldn't save this page", e.message);
    } else {
      notify("Couldn't save this page", "Check your connection and try again.");
    }
  }
});

function notify(title: string, message: string) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}
