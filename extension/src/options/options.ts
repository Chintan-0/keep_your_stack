import { getSettings, setSettings, setSession, getSession } from "../lib/storage";
import { listStacks, listCategories } from "../lib/api";
import { buildCategoryOptions } from "../lib/categories";

async function init() {
  const settings = await getSettings();
  (document.getElementById("appUrl") as HTMLInputElement).value = settings.appUrl;
  (document.getElementById("openInNewTab") as HTMLInputElement).checked = settings.openInNewTab;
  (document.getElementById("closeAfterSave") as HTMLInputElement).checked = settings.closeAfterSave;
  (document.getElementById("autoEnrich") as HTMLInputElement).checked = settings.autoEnrich;
  (document.getElementById("showSaveNotification") as HTMLInputElement).checked = settings.showSaveNotification;

  const stackSelect = document.getElementById("defaultStackSelect") as HTMLSelectElement;
  const categorySelect = document.getElementById("defaultCategorySelect") as HTMLSelectElement;

  // Stack/category lists need a connected account — a signed-out or
  // never-connected user just sees the two defaults with nothing to pick
  // from yet, rather than an error (this page still works for the other
  // settings either way).
  const session = await getSession();
  if (!session) return;

  try {
    const stacks = await listStacks();
    for (const stack of stacks) {
      const opt = document.createElement("option");
      opt.value = stack.id;
      opt.textContent = `${stack.icon} ${stack.name}`;
      if (stack.id === settings.defaultStackId) opt.selected = true;
      stackSelect.appendChild(opt);
    }
  } catch {
    // Not connected, or offline — the rest of the options page still works.
  }
  try {
    const categories = await listCategories();
    for (const opt of buildCategoryOptions(categories)) {
      const el = document.createElement("option");
      el.value = opt.id;
      el.textContent = opt.label;
      if (opt.id === settings.defaultCategoryId) el.selected = true;
      categorySelect.appendChild(el);
    }
  } catch {
    // Same.
  }
}

document.getElementById("saveBtn")?.addEventListener("click", async () => {
  const appUrl = (document.getElementById("appUrl") as HTMLInputElement).value.trim().replace(/\/$/, "");
  const openInNewTab = (document.getElementById("openInNewTab") as HTMLInputElement).checked;
  const closeAfterSave = (document.getElementById("closeAfterSave") as HTMLInputElement).checked;
  const autoEnrich = (document.getElementById("autoEnrich") as HTMLInputElement).checked;
  const showSaveNotification = (document.getElementById("showSaveNotification") as HTMLInputElement).checked;
  const defaultStackId = (document.getElementById("defaultStackSelect") as HTMLSelectElement).value || null;
  const defaultCategoryId = (document.getElementById("defaultCategorySelect") as HTMLSelectElement).value || null;

  await setSettings({
    appUrl: appUrl || "http://localhost:3000",
    openInNewTab,
    closeAfterSave,
    autoEnrich,
    showSaveNotification,
    defaultStackId,
    defaultCategoryId,
  });
  const status = document.getElementById("status")!;
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1500);
});

document.getElementById("disconnectBtn")?.addEventListener("click", async () => {
  await setSession(null);
  const status = document.getElementById("status")!;
  status.textContent = "Disconnected. Click the extension icon and reconnect when you're ready.";
});

void init();
