export interface ClipboardDeps {
  clipboard?: { writeText: (text: string) => Promise<void> } | null;
  fallbackCopy?: (text: string) => boolean;
}

/** Resolves true only when the text really reached the clipboard. */
export async function copyText(text: string, deps: ClipboardDeps = browserClipboardDeps()): Promise<boolean> {
  if (deps.clipboard) {
    try {
      await deps.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or insecure context: fall through to the selection-based copy.
    }
  }
  return deps.fallbackCopy ? deps.fallbackCopy(text) : false;
}

function browserClipboardDeps(): ClipboardDeps {
  if (typeof navigator === "undefined" || typeof document === "undefined") return {};
  return {
    clipboard: navigator.clipboard ?? null,
    fallbackCopy: legacyCopy,
  };
}

function legacyCopy(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
