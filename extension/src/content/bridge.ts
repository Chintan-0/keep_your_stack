// Runs ONLY on KeepYourStack's own origin (see manifest.json's
// content_scripts.matches — never injected into arbitrary pages). Its sole
// job is relaying one explicit, user-initiated event from the web app's
// Extension page to the background service worker, so the web page never
// needs to know the extension's id to reach it. It reads nothing from the
// page beyond that one event's payload, and injects nothing into the page.
window.addEventListener("keepyourstack:connect", (event) => {
  const detail = (event as CustomEvent).detail as {
    accessToken: string;
    refreshToken: string;
    expiresAt: number | null;
    userEmail: string | null;
  };
  if (!detail?.accessToken || !detail?.refreshToken) return;

  chrome.runtime.sendMessage({ type: "KYS_CONNECT", session: detail }, () => {
    window.dispatchEvent(new CustomEvent("keepyourstack:connected"));
  });
});
