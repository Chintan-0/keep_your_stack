import { getSettings, hasEverConnected, setSettings } from "../lib/storage";
import { checkConnection, findExisting, saveResource, enrichResource, listStacks, resourceUrl, appAuthUrl, ApiError, AuthError } from "../lib/api";
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

function setLoadingMessage(text: string) {
  const el = document.querySelector("#view-loading p");
  if (el) el.textContent = text;
}

async function init() {
  show("loading");
  setLoadingMessage("Checking…");

  currentPage = await getActiveTab();
  const supportedUrl = !!currentPage && isSupportedUrl(currentPage.url);

  if (supportedUrl) setLoadingMessage("Checking your KeepYourStack account…");
  const connection = supportedUrl ? await checkConnection() : null;
  const everConnected = await hasEverConnected();

  const view = resolveInitialView({ supportedUrl, connected: !!connection, everConnected });
  if (view !== "check-duplicate") {
    show(view);
    return;
  }

  setLoadingMessage("Checking your stack…");
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
  const enrichStatusEl = document.getElementById("enrichStatus");
  if (enrichStatusEl) enrichStatusEl.textContent = "";

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
      void enrichAfterSave(resource);
    }
  } catch (e) {
    renderError(e);
  }
}

/**
 * Runs after the popup has already shown "Saved ✓" — never blocks the
 * save itself. Best-effort: a failed/slow enrichment just leaves the
 * status line blank rather than showing an error for something the user
 * didn't explicitly ask for.
 */
async function enrichAfterSave(resource: ExtResource) {
  const statusEl = document.getElementById("enrichStatus");
  if (statusEl) statusEl.textContent = "Enriching resource…";

  const enriched = await enrichResource(resource.id);
  if (!enriched || !statusEl || savedResource?.id !== resource.id) return;

  savedResource = enriched;
  const parts: string[] = [];
  if (enriched.tagIds.length > 0) parts.push(`${enriched.tagIds.length} tag${enriched.tagIds.length === 1 ? "" : "s"}`);
  if (enriched.useCases.length > 0) parts.push("Useful For added");
  statusEl.textContent = parts.length > 0 ? parts.join(" · ") : "";
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

// Guard the whole startup path: a single unexpected throw here (a missing
// element, a chrome.* call rejecting in an unusual way) must never leave a
// blank, silently-broken popup — show the same error view a network
// failure would, since to the user it looks identical either way.
function showFatalError(message: string) {
  try {
    renderError(new Error(message));
  } catch {
    document.body.innerHTML = `<div style="padding:16px;font:13px sans-serif;color:#e8eaf0">${message}</div>`;
  }
}

try {
  wireEvents();
  void init().catch((e) => {
    showFatalError(e instanceof Error ? e.message : "Something went wrong. Try reopening the popup.");
  });
} catch {
  showFatalError("Something went wrong loading the popup. Try reopening it.");
}

// Persist the chosen stack as the new default whenever the user saves with
// one selected — makes the next save one field lighter, without ever
// forcing a stack choice (see setSettings' merge semantics).
document.getElementById("stackSelect")?.addEventListener("change", (e) => {
  const value = (e.target as HTMLSelectElement).value;
  void setSettings({ defaultStackId: value || null });
});
