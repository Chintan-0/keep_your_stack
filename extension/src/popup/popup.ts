import { getSettings, setSettings, getRecentSaves, addRecentSave, removeRecentSave } from "../lib/storage.js";
import {
  checkConnection,
  findExisting,
  saveResource,
  enrichResource,
  listStacks,
  listCategories,
  suggestOrganization,
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
import { track } from "../lib/analytics.js";
import type { ExtResource, OrganizationSuggestion } from "../lib/types.js";

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
let currentSuggestion: OrganizationSuggestion | null = null;
let tags: string[] = [];

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
  currentSuggestion = null;
  tags = [];
  if (requestId === 0) void track("extension_popup_opened"); // once per popup open, not once per internal retry

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
    if (view === "disconnected" || view === "expired") void track("extension_login_required");
    show(view);
    return;
  }
  void track("extension_metadata_loaded"); // title/favicon from the tab are already in hand at this point

  setLoadingMessage("Checking your stack…");
  await checkDuplicateAndRender(requestId);
}

async function checkDuplicateAndRender(requestId: number) {
  if (!currentPage) return;
  try {
    const existing = await findExisting(currentPage.url);
    if (!startupGuard.isCurrent(requestId)) return; // superseded while awaiting the duplicate check
    if (resolveResourceView(existing) === "duplicate" && existing) {
      void track("extension_duplicate_detected");
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
  (document.getElementById("noteInput") as HTMLTextAreaElement).value = "";
  const enrichStatusEl = document.getElementById("enrichStatus");
  if (enrichStatusEl) enrichStatusEl.textContent = "";
  tags = [];
  renderTagChips();
  currentSuggestion = null;
  suggestionChangeTracked = false;
  $("suggestionBox").hidden = true;
  $("noSuggestion").hidden = true;

  const stackSelect = document.getElementById("stackSelect") as HTMLSelectElement;
  stackSelect.innerHTML = '<option value="">No stack</option>';
  const categorySelect = document.getElementById("categorySelect") as HTMLSelectElement;
  categorySelect.innerHTML = '<option value="">Uncategorized</option>';

  const { defaultStackId, defaultCategoryId } = await getSettings();
  let stacks: Awaited<ReturnType<typeof listStacks>> = [];
  let categories: Awaited<ReturnType<typeof listCategories>> = [];
  // Fetched together — the suggestion needs categories/stacks to resolve
  // ids to names anyway, and this keeps the popup to one round trip of
  // waiting rather than three sequential ones.
  const [stacksResult, categoriesResult, suggestionResult] = await Promise.allSettled([
    listStacks(),
    listCategories(),
    suggestOrganization(currentPage.url, currentPage.title),
  ]);

  if (stacksResult.status === "fulfilled") {
    stacks = stacksResult.value;
    for (const stack of stacks) {
      const opt = document.createElement("option");
      opt.value = stack.id;
      opt.textContent = `${stack.icon} ${stack.name}`;
      stackSelect.appendChild(opt);
    }
  } // A failed stack list must never block saving — the select just stays at "No stack".
  if (categoriesResult.status === "fulfilled") {
    categories = categoriesResult.value;
    for (const opt of buildCategoryOptions(categories)) {
      const el = document.createElement("option");
      el.value = opt.id;
      el.textContent = opt.label;
      categorySelect.appendChild(el);
    }
  } // Same — optional, never blocks saving.

  const suggestion = suggestionResult.status === "fulfilled" ? suggestionResult.value : null;
  currentSuggestion = suggestion;
  applySuggestion(suggestion, stacks, categories, defaultStackId, defaultCategoryId);

  await renderRecentSaves();
  if (guardId !== undefined && !startupGuard.isCurrent(guardId)) return; // superseded while loading stacks/categories/recents
  show("new");
}

/**
 * Pre-fills the stack/category selects and tag chips from a suggestion —
 * only ever called once, right after the fields are freshly reset by
 * renderNew(); nothing later ever calls this again, which is what keeps
 * a user's own subsequent edit authoritative (§7 — enrichment/
 * suggestions never overwrite a choice already made). Falls back to the
 * user's stored defaultStackId/defaultCategoryId when there's no
 * suggestion for that field, same as before this feature existed.
 */
function applySuggestion(
  suggestion: OrganizationSuggestion | null,
  stacks: { id: string; name: string; icon: string }[],
  categories: { id: string; name: string; parentId: string | null }[],
  defaultStackId: string | null,
  defaultCategoryId: string | null
) {
  const stackSelect = document.getElementById("stackSelect") as HTMLSelectElement;
  const categorySelect = document.getElementById("categorySelect") as HTMLSelectElement;

  const suggestedStackId = suggestion?.stack?.id ?? null;
  const suggestedCategoryId = suggestion?.category?.id ?? null;
  stackSelect.value = suggestedStackId ?? defaultStackId ?? "";
  categorySelect.value = suggestedCategoryId ?? defaultCategoryId ?? "";
  tags = suggestion?.tags ? [...suggestion.tags] : [];
  renderTagChips();

  const hasSuggestion = !!(suggestion && (suggestedCategoryId || suggestedStackId || tags.length > 0));
  $("suggestionBox").hidden = !hasSuggestion;
  $("noSuggestion").hidden = hasSuggestion;

  const linesEl = $("suggestionLines");
  const whyBtn = $("whySuggestionBtn") as HTMLButtonElement;
  const reasonsEl = $("suggestionReasons");
  linesEl.innerHTML = "";
  reasonsEl.innerHTML = "";
  whyBtn.hidden = true;
  reasonsEl.hidden = true;
  whyBtn.setAttribute("aria-expanded", "false");

  if (!hasSuggestion) return;
  void track("extension_suggestion_shown");

  if (suggestedCategoryId) {
    const category = categories.find((c) => c.id === suggestedCategoryId);
    const parent = category?.parentId ? categories.find((c) => c.id === category.parentId) : null;
    const label = category ? (parent ? `${parent.name} / ${category.name}` : category.name) : null;
    if (label) linesEl.appendChild(suggestionLine(label));
  }
  if (suggestion?.stack) {
    linesEl.appendChild(suggestionLine(`${suggestion.stack.icon} ${suggestion.stack.name}`));
  }
  if (tags.length > 0) {
    const tagsLine = document.createElement("div");
    tagsLine.className = "suggestion-tags";
    for (const tag of tags) {
      const span = document.createElement("span");
      span.className = "suggestion-tag";
      span.textContent = `#${tag}`;
      tagsLine.appendChild(span);
    }
    linesEl.appendChild(tagsLine);
  }

  if (suggestion && suggestion.reasons.length > 0) {
    whyBtn.hidden = false;
    for (const reason of suggestion.reasons) {
      const li = document.createElement("li");
      li.textContent = reason;
      reasonsEl.appendChild(li);
    }
  }
}

function suggestionLine(text: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "suggestion-line";
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.textContent = "✓";
  div.appendChild(dot);
  div.appendChild(document.createTextNode(text));
  return div;
}

// ── Tag chips ────────────────────────────────────────────────────────────

function renderTagChips() {
  const container = $("tagChips");
  const input = document.getElementById("tagsInput") as HTMLInputElement;
  for (const chip of Array.from(container.querySelectorAll(".tag-chip"))) chip.remove();
  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    const label = document.createElement("span");
    label.textContent = `#${tag}`;
    chip.appendChild(label);
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", `Remove tag ${tag}`);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      tags = tags.filter((t) => t !== tag);
      renderTagChips();
      trackSuggestionOverrideIfChanged("tags");
    });
    chip.appendChild(removeBtn);
    container.insertBefore(chip, input);
  }
}

function addTagFromInput() {
  const input = document.getElementById("tagsInput") as HTMLInputElement;
  const raw = input.value.trim().replace(/^#/, "");
  input.value = "";
  if (!raw) return;
  const normalized = raw.toLowerCase();
  if (tags.some((t) => t.toLowerCase() === normalized)) return;
  tags = [...tags, raw].slice(0, 8); // a small set of relevant tags, never dozens
  renderTagChips();
  trackSuggestionOverrideIfChanged("tags");
}

/** Fires extension_suggestion_changed at most once per popup session, the first time the user's choice diverges from what was actually suggested — never for a field with no suggestion to begin with. */
let suggestionChangeTracked = false;
function trackSuggestionOverrideIfChanged(field: "category" | "stack" | "tags") {
  if (!currentSuggestion || suggestionChangeTracked) return;
  if (field === "category" && !currentSuggestion.category) return;
  if (field === "stack" && !currentSuggestion.stack) return;
  if (field === "tags" && currentSuggestion.tags.length === 0) return;
  suggestionChangeTracked = true;
  void track("extension_suggestion_changed");
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
  addTagFromInput(); // commit whatever's still sitting in the tag input, unsubmitted, before reading `tags`
  show("saving");
  void track("extension_save_started");

  const useCase = (document.getElementById("useCase") as HTMLInputElement).value.trim();
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
      tagNames: tags,
      stackIds: stackId ? [stackId] : [],
      notes: note,
      force,
    });
    savedResource = resource;
    if (duplicate && !force) {
      void track("extension_duplicate_detected");
      await renderDuplicate(resource);
      return;
    }

    const successTitleEl = document.querySelector("#view-success .empty-title");
    const successOrgEl = document.getElementById("successOrg");
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
    if (successOrgEl) {
      const stackName = currentSuggestion?.stack && stackId === currentSuggestion.stack.id ? currentSuggestion.stack.name : null;
      const parts: string[] = [];
      if (stackName) parts.push(stackName);
      if (tags.length > 0) parts.push(tags.map((t) => `#${t}`).join(" "));
      successOrgEl.textContent = parts.join(" · ");
    }
    void track("extension_save_success");
    show("success");

    const { autoEnrich, closeAfterSave } = await getSettings();
    if (autoEnrich) void enrichAfterSave(resource);
    if (closeAfterSave) setTimeout(() => window.close(), 1400);
  } catch (e) {
    void track("extension_save_failure");
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
  if (currentSuggestion?.stack && value !== currentSuggestion.stack.id) trackSuggestionOverrideIfChanged("stack");
  void setSettings({ defaultStackId: value || null });
});
document.getElementById("categorySelect")?.addEventListener("change", (e) => {
  const value = (e.target as HTMLSelectElement).value;
  if (currentSuggestion?.category && value !== currentSuggestion.category.id) trackSuggestionOverrideIfChanged("category");
  void setSettings({ defaultCategoryId: value || null });
});
document.getElementById("tagsInput")?.addEventListener("keydown", (e) => {
  const key = (e as KeyboardEvent).key;
  if (key === "Enter" || key === ",") {
    e.preventDefault();
    addTagFromInput();
  }
});
$("whySuggestionBtn").addEventListener("click", () => {
  const btn = $("whySuggestionBtn");
  const panel = $("suggestionReasons");
  const expanded = btn.getAttribute("aria-expanded") === "true";
  btn.setAttribute("aria-expanded", String(!expanded));
  panel.hidden = expanded;
});
