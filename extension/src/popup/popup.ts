import { getSettings, hasEverConnected, setSettings } from "../lib/storage";
import { checkConnection, findExisting, saveResource, listStacks, resourceUrl, appAuthUrl, ApiError, AuthError } from "../lib/api";
import { isSupportedUrl } from "../lib/url";
import { resolveInitialView, resolveResourceView } from "../lib/view-state";
import type { ExtResource } from "../lib/types";

type ViewName =
  | "loading"
  | "disconnected"
  | "expired"
  | "unsupported"
  | "error"
  | "duplicate"
  | "new"
  | "saving"
  | "success";

function $(id: string) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function show(view: ViewName) {
  const ids: ViewName[] = ["loading", "disconnected", "expired", "unsupported", "error", "duplicate", "new", "saving", "success"];
  for (const id of ids) {
    $(`view-${id}`).hidden = id !== view;
  }
}

interface PageInfo {
  url: string;
  title: string;
  favIconUrl?: string;
}

function faviconFallback(url: string): string {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
  } catch {
    return "";
  }
}

async function getActiveTab(): Promise<PageInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  return { url: tab.url, title: tab.title || tab.url, favIconUrl: tab.favIconUrl };
}

let currentPage: PageInfo | null = null;
let savedResource: ExtResource | null = null;

async function init() {
  show("loading");

  currentPage = await getActiveTab();
  const supportedUrl = !!currentPage && isSupportedUrl(currentPage.url);
  const connection = supportedUrl ? await checkConnection() : null;
  const everConnected = await hasEverConnected();

  const view = resolveInitialView({ supportedUrl, connected: !!connection, everConnected });
  if (view !== "check-duplicate") {
    show(view);
    return;
  }

  await checkDuplicateAndRender();
}

async function checkDuplicateAndRender() {
  if (!currentPage) return;
  try {
    const existing = await findExisting(currentPage.url);
    if (resolveResourceView(existing) === "duplicate" && existing) {
      renderDuplicate(existing);
    } else {
      await renderNew();
    }
  } catch (e) {
    renderError(e);
  }
}

function renderDuplicate(resource: ExtResource) {
  savedResource = resource;
  ($("dupFavicon") as HTMLImageElement).src = currentPage?.favIconUrl || faviconFallback(resource.url);
  $("dupTitle").textContent = resource.title;
  $("dupMeta").textContent = resource.url;
  show("duplicate");
}

async function renderNew() {
  if (!currentPage) return;
  ($("newFavicon") as HTMLImageElement).src = currentPage.favIconUrl || faviconFallback(currentPage.url);
  $("newTitle").textContent = currentPage.title;
  $("newUrl").textContent = currentPage.url;
  (document.getElementById("useCase") as HTMLInputElement).value = "";
  (document.getElementById("tagsInput") as HTMLInputElement).value = "";
  (document.getElementById("noteInput") as HTMLTextAreaElement).value = "";

  const select = document.getElementById("stackSelect") as HTMLSelectElement;
  select.innerHTML = '<option value="">No stack</option>';
  try {
    const stacks = await listStacks();
    const { defaultStackId } = await getSettings();
    for (const stack of stacks) {
      const opt = document.createElement("option");
      opt.value = stack.id;
      opt.textContent = `${stack.icon} ${stack.name}`;
      if (stack.id === defaultStackId) opt.selected = true;
      select.appendChild(opt);
    }
  } catch {
    // Optional organization — a failed stack list must never block saving.
  }

  show("new");
}

function renderError(e: unknown) {
  if (e instanceof AuthError) {
    show("expired");
    return;
  }
  const message =
    e instanceof ApiError ? e.message : "Couldn't connect to KeepYourStack. Check your connection and try again.";
  $("errorMessage").textContent = message;
  show("error");
}

async function onSave() {
  if (!currentPage) return;
  show("saving");

  const useCase = (document.getElementById("useCase") as HTMLInputElement).value.trim();
  const tagsRaw = (document.getElementById("tagsInput") as HTMLInputElement).value.trim();
  const note = (document.getElementById("noteInput") as HTMLTextAreaElement).value.trim();
  const stackId = (document.getElementById("stackSelect") as HTMLSelectElement).value;

  try {
    const { resource, duplicate } = await saveResource({
      url: currentPage.url,
      title: currentPage.title,
      faviconUrl: currentPage.favIconUrl || null,
      useCases: useCase ? [useCase] : [],
      tagNames: tagsRaw
        ? tagsRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      stackIds: stackId ? [stackId] : [],
      notes: note,
    });
    savedResource = resource;
    if (duplicate) {
      renderDuplicate(resource);
    } else {
      show("success");
    }
  } catch (e) {
    renderError(e);
  }
}

async function openResource(id: string) {
  const url = await resourceUrl(id);
  const { openInNewTab } = await getSettings();
  if (openInNewTab) {
    chrome.tabs.create({ url });
  } else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) chrome.tabs.update(tab.id, { url });
    else chrome.tabs.create({ url });
  }
}

async function openApp() {
  chrome.tabs.create({ url: await appAuthUrl() });
}

function wireEvents() {
  $("openAppBtn").addEventListener("click", openApp);
  $("signInAgainBtn").addEventListener("click", openApp);
  $("retryBtn").addEventListener("click", init);
  $("saveBtn").addEventListener("click", onSave);
  $("saveAnotherBtn").addEventListener("click", init);
  $("settingsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());

  $("openResourceBtn").addEventListener("click", () => savedResource && openResource(savedResource.id));
  $("editInAppBtn").addEventListener("click", () => savedResource && openResource(savedResource.id));
  $("openSavedBtn").addEventListener("click", () => savedResource && openResource(savedResource.id));

  const toggle = $("toggleDetails");
  const panel = $("detailsPanel");
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    panel.hidden = expanded;
  });
}

wireEvents();
void init();

// Persist the chosen stack as the new default whenever the user saves with
// one selected — makes the next save one field lighter, without ever
// forcing a stack choice (see setSettings' merge semantics).
document.getElementById("stackSelect")?.addEventListener("change", (e) => {
  const value = (e.target as HTMLSelectElement).value;
  void setSettings({ defaultStackId: value || null });
});
