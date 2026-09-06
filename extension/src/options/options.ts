import { getSettings, setSettings, setSession } from "../lib/storage";

async function init() {
  const settings = await getSettings();
  (document.getElementById("appUrl") as HTMLInputElement).value = settings.appUrl;
  (document.getElementById("openInNewTab") as HTMLInputElement).checked = settings.openInNewTab;
}

document.getElementById("saveBtn")?.addEventListener("click", async () => {
  const appUrl = (document.getElementById("appUrl") as HTMLInputElement).value.trim().replace(/\/$/, "");
  const openInNewTab = (document.getElementById("openInNewTab") as HTMLInputElement).checked;
  await setSettings({ appUrl: appUrl || "http://localhost:3000", openInNewTab });
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
