import { getSettings, setSettings, getRecentSaves, addRecentSave, removeRecentSave } from "../lib/storage.js";
import {
  checkConnection,
  findExisting,
  saveResource,
  enrichResource,
  listStacks,
  listCategories,
  restoreResource,
  deleteResource,
  resourceUrl,
  appAuthUrl,
  ApiError,
  AuthError,
} from "../lib/api.js";
import { isSupportedUrl } from "../lib/url.js";
import { resolveInitialView, resolveResourceView } from "../lib/view-state.js";
import { buildCategoryOptions } from "../lib/categories.js";
import { createSequenceGuard } from "../lib/request-guard.js";
import type { ExtResource } from "../lib/types.js";

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

function timeAgo(ms: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function getActiveTab(): Promise<PageInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  return { url: tab.url, title: tab.title || tab.url, favIconUrl: tab.favIconUrl };
}

// A fresh document every time the popup opens (Chrome tears it down on
// close) — this module-level state never survives across a close/reopen,
// so there's no stale-tab risk from a previous popup instance.
let currentPage: PageInfo | null = null;
let savedResource: ExtResource | null = null;
let justCreatedResourceId: string | null = null;

// Guards against a stale async startup response overwriting a newer one —
// e.g. the user clicks Retry (a second init() run) while the first run's
// slower checkConnection() is still in flight; that first run must not be
// allowed to render anything once a newer run has started. Every render
// inside init()/checkDuplicateAndRender() is gated on "am I still the most
// recent startup?" (via startupGuard.isCurrent) immediately before it
// touches the DOM. This is scoped to one popup document's lifetime —
// Chrome tears the whole document (and this guard) down on close, so a
// *previous popup session's* async work can never reach a *new* one; the
// race this actually guards against is two startups racing within the
// same still-open popup. See lib/request-guard.ts + request-guard.test.ts.
const startupGuard = createSequenceGuard();

function setLoadingMessage(text: string) {
  const el = document.querySelector("#view-loading p");
  if (el) el.textContent = text;
}

async function init() {
  const requestId = startupGuard.start();
  show("loading");
  setLoadingMessage("Checking…");
  justCreatedResourceId = null;

  currentPage = await getActiveTab();
  if (!startupGuard.isCurrent(requestId)) return; // superseded by a newer init() while awaiting the tab
  const supportedUrl = !!currentPage && isSupportedUrl(currentPage.url);

  if (supportedUrl) setLoadingMessage("Checking your KeepYourStack account…");
  const connection = supportedUrl
    ? await checkConnection()
    : ({ status: "no-session" } as const); // never checked — supportedUrl already decides "unsupported" below
  if (!startupGuard.isCurrent(requestId)) return; // superseded while awaiting the connection check

  const view = resolveInitialView({ supportedUrl, connection });
  if (view !== "check-duplicate") {
    show(view);
    return;
  }

  setLoadingMessage("Checking your stack…");
  await checkDuplicateAndRender(requestId);
}

async function checkDuplicateAndRender(requestId: number) {
  if (!currentPage) return;
  try {
    const existing = await findExisting(currentPage.url);
    if (!startupGuard.isCurrent(requestId)) return; // superseded while awaiting the duplicate check
    if (resolveResourceView(existing) === "duplicate" && existing) {
      await renderDuplicate(existing, requestId);
    } else {
      await renderNew(requestId);
    }
  } catch (e) {
    if (!startupGuard.isCurrent(requestId)) return;
    renderError(e);
  }
}

/**
 * `guardId`, when passed, is the startup run this render belongs to —
 * checked immediately before the final `show()` so a slow startup's own
 * *internal* awaits (fetching stacks/categories for the "already in
 * these" line) can't land after a newer startup has already rendered
 * something else. Omitted when called from doSave(), which isn't part of
 * the startup sequence and always represents the current, live state.
 */
async function renderDuplicate(resource: ExtResource, guardId?: number) {
  savedResource = resource;
  ($("dupFavicon") as HTMLImageElement).src = currentPage?.favIconUrl || faviconFallback(resource.url);
  $("dupTitle").textContent = resource.title;
  $("dupMeta").textContent = resource.url;
  $("dupLabel").textContent = resource.isArchived ? "Already saved in Archive" : "Already saved";
  ($("restoreResourceBtn") as HTMLButtonElement).hidden = !resource.isArchived;

  const orgEl = $("dupOrg");
  if (resource.isArchived) {
    orgEl.textContent = "Restore it to see it in your library again.";
  } else {
    // Best-effort only — where it already lives is a nice-to-know, never
    // something worth blocking or erroring the view over if it fails.
    orgEl.textContent = "";
    try {
      const [stacks, categories] = await Promise.all([listStacks(), listCategories()]);
      const parts: string[] = [];
      const category = categories.find((c) => c.id === resource.categoryId);
      if (category) {
        const parent = category.parentId ? categories.find((c) => c.id === category.parentId) : null;
        parts.push(parent ? `${parent.name} → ${category.name}` : category.name);
      }
      const stackNames = resource.stackIds
        .map((id) => stacks.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => `${s.icon} ${s.name}`);
      parts.push(...stackNames);
      orgEl.textContent = parts.length > 0 ? `In ${parts.join(" · ")}` : "";
    } catch {
      // Leave it blank.
    }
  }

  if (guardId !== undefined && !startupGuard.isCurrent(guardId)) return; // superseded while fetching org info
  show("duplicate");
}

async function renderNew(guardId?: number) {
  if (!currentPage) return;
  ($("newFavicon") as HTMLImageElement).src = currentPage.favIconUrl || faviconFallback(currentPage.url);
  $("newTitle").textContent = currentPage.title;
  $("newUrl").textContent = currentPage.url;
  (document.getElementById("useCase") as HTMLInputElement).value = "";
  (document.getElementById("tagsInput") as HTMLInputElement).value = "";
  (document.getElementById("noteInput") as HTMLTextAreaElement).value = "";
  const enrichStatusEl = document.getElementById("enrichStatus");
  if (enrichStatusEl) enrichStatusEl.textContent = "";

  const stackSelect = document.getElementById("stackSelect") as HTMLSelectElement;
  stackSelect.innerHTML = '<option value="">No stack</option>';
  const categorySelect = document.getElementById("categorySelect") as HTMLSelectElement;
  categorySelect.innerHTML = '<option value="">Uncategorized</option>';

  const { defaultStackId, defaultCategoryId } = await getSettings();
  try {
    const stacks = await listStacks();
    for (const stack of stacks) {
      const opt = document.createElement("option");
      opt.value = stack.id;
      opt.textContent = `${stack.icon} ${stack.name}`;
      if (stack.id === defaultStackId) opt.selected = true;
      stackSelect.appendChild(opt);
    }
  } catch {
    // Optional organization — a failed stack list must never block saving.
  }
  try {
    const categories = await listCategories();
    for (const opt of buildCategoryOptions(categories)) {
      const el = document.createElement("option");
      el.value = opt.id;
      el.textContent = opt.label;
      if (opt.id === defaultCategoryId) el.selected = true;
      categorySelect.appendChild(el);
    }
  } catch {
    // Same — optional, never blocks saving.
  }

  await renderRecentSaves();
  if (guardId !== undefined && !startupGuard.isCurrent(guardId)) return; // superseded while loading stacks/categories/recents
  show("new");
}

async function renderRecentSaves() {
  const section = $("recentSection");
  const list = $("recentList");
  const saves = await getRecentSaves();
  list.innerHTML = "";
  if (saves.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  for (const save of saves) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "recent-item";
    btn.innerHTML = `<span class="recent-title"></span><span class="recent-time"></span>`;
    btn.querySelector(".recent-title")!.textContent = save.title;
    btn.querySelector(".recent-time")!.textContent = timeAgo(save.savedAt);
    btn.addEventListener("click", () => openResource(save.id));
    li.appendChild(btn);
    list.appendChild(li);
  }
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

async function doSave(force: boolean) {
  if (!currentPage) return;
  show("saving");

  const useCase = (document.getElementById("useCase") as HTMLInputElement).value.trim();
  const tagsRaw = (document.getElementById("tagsInput") as HTMLInputElement).value.trim();
  const note = (document.getElementById("noteInput") as HTMLTextAreaElement).value.trim();
  const stackId = (document.getElementById("stackSelect") as HTMLSelectElement).value;
  const categoryId = (document.getElementById("categorySelect") as HTMLSelectElement).value;

  try {
    const { resource, duplicate } = await saveResource({
      url: currentPage.url,
      title: currentPage.title,
      faviconUrl: currentPage.favIconUrl || null,
      categoryId: categoryId || null,
      useCases: useCase ? [useCase] : [],
      tagNames: tagsRaw
        ? tagsRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      stackIds: stackId ? [stackId] : [],
      notes: note,
      force,
    });
    savedResource = resource;
    if (duplicate && !force) {
      await renderDuplicate(resource);
      return;
    }

    const successTitleEl = document.querySelector("#view-success .empty-title");
    const undoBtn = $("undoSaveBtn") as HTMLButtonElement;
    if (duplicate) {
      // force + duplicate: the URL already existed, so nothing new was
      // created — whatever was entered got merged into that resource
      // instead (see createResource's own doc comment). Never eligible
      // for Undo — this isn't a resource this popup session created.
      justCreatedResourceId = null;
      undoBtn.hidden = true;
      if (successTitleEl) successTitleEl.textContent = "Added to your existing save";
    } else {
      justCreatedResourceId = resource.id;
      void addRecentSave({ id: resource.id, title: resource.title, url: resource.url, savedAt: Date.now() });
      undoBtn.hidden = false;
      if (successTitleEl) successTitleEl.textContent = "Saved to KeepYourStack";
    }
    show("success");

    const { autoEnrich, closeAfterSave } = await getSettings();
    if (autoEnrich) void enrichAfterSave(resource);
    if (closeAfterSave) setTimeout(() => window.close(), 1400);
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

async function onUndo() {
  if (!justCreatedResourceId) return;
  const id = justCreatedResourceId;
  const undoBtn = $("undoSaveBtn") as HTMLButtonElement;
  undoBtn.disabled = true;
  try {
    await deleteResource(id);
    await removeRecentSave(id);
    justCreatedResourceId = null;
    await init();
  } catch {
    undoBtn.disabled = false;
    // Leave the success view as-is — the save itself is still real and fine either way.
  }
}

async function onRestore() {
  if (!savedResource) return;
  const btn = $("restoreResourceBtn") as HTMLButtonElement;
  btn.disabled = true;
  try {
    await restoreResource(savedResource.id);
    await openResource(savedResource.id);
  } catch (e) {
    renderError(e);
  } finally {
    btn.disabled = false;
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
  $("saveBtn").addEventListener("click", () => void doSave(false));
  $("saveAnywayBtn").addEventListener("click", () => void doSave(true));
  $("saveAnotherBtn").addEventListener("click", init);
  $("settingsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("undoSaveBtn").addEventListener("click", onUndo);
  $("restoreResourceBtn").addEventListener("click", onRestore);

  $("openResourceBtn").addEventListener("click", () => savedResource && openResource(savedResource.id));
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
    // Last-resort fallback if renderError itself throws (e.g. a missing
    // DOM element). Every message reaching here today is a static,
    // hardcoded string — nothing attacker-controlled (a webpage's title,
    // a server error body) ever becomes an Error shown in this popup —
    // but building the element via textContent rather than innerHTML
    // costs nothing and means that stays true even if a future caller
    // passes something less trusted.
    document.body.textContent = "";
    const div = document.createElement("div");
    div.style.cssText = "padding:16px;font:13px sans-serif;color:#e8eaf0";
    div.textContent = message;
    document.body.appendChild(div);
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

// Persist the chosen stack/category as the new defaults whenever the user
// saves with one selected — makes the next save one field lighter, without
// ever forcing a choice (see setSettings' merge semantics). Always
// reversible: just clear it back to "No stack" / "Uncategorized" and save
// again.
document.getElementById("stackSelect")?.addEventListener("change", (e) => {
  const value = (e.target as HTMLSelectElement).value;
  void setSettings({ defaultStackId: value || null });
});
document.getElementById("categorySelect")?.addEventListener("change", (e) => {
  const value = (e.target as HTMLSelectElement).value;
  void setSettings({ defaultCategoryId: value || null });
});
