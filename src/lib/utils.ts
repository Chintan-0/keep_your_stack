import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { categories } from "./categories";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  try {
    const u = new URL(value);
    u.hash = "";
    // strip trailing slash on bare domain paths
    if (u.pathname === "/") u.pathname = "";
    return u.toString();
  } catch {
    return null;
  }
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function categoryPath(categoryId: string | null): string {
  if (!categoryId) return "Uncategorized";
  const chain: string[] = [];
  let current = categories.find((c) => c.id === categoryId);
  while (current) {
    chain.unshift(current.name);
    current = current.parentId ? categories.find((c) => c.id === current!.parentId) : undefined;
  }
  return chain.join(" → ") || "Uncategorized";
}

export function categoryName(categoryId: string | null): string {
  if (!categoryId) return "Uncategorized";
  return categories.find((c) => c.id === categoryId)?.name ?? "Uncategorized";
}

export function topLevelCategories() {
  return categories.filter((c) => c.parentId === null);
}

export function childCategories(parentId: string) {
  return categories.filter((c) => c.parentId === parentId);
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.round(diffDay / 7)}w ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const AVATAR_COLORS = [
  "#6f7bff", "#a78bfa", "#22d3ee", "#34d399", "#f5b756", "#f87171", "#f472b6", "#38bdf8",
];

export function faviconColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export const PRICING_LABELS: Record<string, string> = {
  free: "Free",
  freemium: "Freemium",
  paid: "Paid",
  "open-source": "Open Source",
};

export const PLATFORM_LABELS: Record<string, string> = {
  web: "Web",
  desktop: "Desktop",
  cli: "CLI",
  mobile: "Mobile",
  "vscode-extension": "VS Code",
  "browser-extension": "Browser Extension",
};
