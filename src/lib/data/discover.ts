import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Pricing, Platform } from "@/lib/types";
import { getServiceRoleClient } from "./service-role";
import { saveSharedResource } from "./resource-shares";
import { DropError } from "./resource-drops";
import { NotFoundError } from "./errors";

type Client = SupabaseClient<Database>;

export const DISCOVER_SORTS = ["trending", "new"] as const;
export type DiscoverSort = (typeof DISCOVER_SORTS)[number];
function positiveIntFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Distinct open reports that automatically hide a share until a moderator reviews it. */
export const REPORT_AUTO_HIDE_THRESHOLD = positiveIntFromEnv("REPORT_AUTO_HIDE_THRESHOLD", 3);

export interface DiscoverShare {
  id: string;
  title: string;
  url: string;
  domain: string;
  description: string;
  tagNames: string[];
  pricing: Pricing | null;
  platform: Platform[];
  message: string;
  categoryName: string | null;
  createdAt: string;
  saveCount: number;
  recentSaves: number;
}

export async function listDiscoverShares(sort: DiscoverSort, category: string | null): Promise<DiscoverShare[]> {
  const { data, error } = await getServiceRoleClient().rpc("discover_shares", {
    p_sort: sort,
    p_category: category,
    p_limit: 60,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.share_id,
    title: row.title,
    url: row.url,
    domain: row.domain,
    description: row.description,
    tagNames: row.tag_names,
    pricing: (row.pricing as Pricing | null) ?? null,
    platform: (row.platform as Platform[]) ?? [],
    message: row.message,
    categoryName: row.category_name,
    createdAt: row.created_at,
    saveCount: Number(row.save_count),
    recentSaves: Number(row.recent_saves),
  }));
}

/** Resolves a Discover share to its token server-side, so the token never has to reach the browser. */
async function getListedShare(shareId: string) {
  const { data, error } = await getServiceRoleClient()
    .from("resource_shares")
    .select("id, user_id, token, visibility, hidden_at, revoked_at")
    .eq("id", shareId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.visibility !== "public" || data.hidden_at || data.revoked_at) {
    throw new NotFoundError("This resource isn't available.");
  }
  return data;
}

export async function saveDiscoverShare(client: Client, userId: string, shareId: string) {
  const share = await getListedShare(shareId);
  const result = await saveSharedResource(client, userId, share.token);
  if (!result) throw new NotFoundError("This resource isn't available.");
  return result;
}

export type ReportOutcome = "reported" | "already_reported";

export async function reportDiscoverShare(
  client: Client,
  reporterId: string,
  shareId: string,
  reason: string
): Promise<ReportOutcome> {
  const share = await getListedShare(shareId);
  if (share.user_id === reporterId) throw new DropError("You can't report your own share.", 400);

  const { error } = await client
    .from("share_reports")
    .insert({ share_id: shareId, reporter_id: reporterId, reason });
  if (error) {
    if (error.code === "23505") return "already_reported";
    throw new Error(error.message);
  }

  const service = getServiceRoleClient();
  const { count, error: countError } = await service
    .from("share_reports")
    .select("id", { count: "exact", head: true })
    .eq("share_id", shareId)
    .eq("status", "open");
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= REPORT_AUTO_HIDE_THRESHOLD) {
    const { error: hideError } = await service
      .from("resource_shares")
      .update({ hidden_at: new Date().toISOString(), hidden_reason: "reported" })
      .eq("id", shareId)
      .is("hidden_at", null);
    if (hideError) throw new Error(hideError.message);
  }
  return "reported";
}

export interface OpenReport {
  id: string;
  shareId: string;
  reason: string;
  createdAt: string;
  shareTitle: string;
  shareDomain: string;
  shareHidden: boolean;
  openReportCount: number;
}

export async function listOpenReports(): Promise<OpenReport[]> {
  const service = getServiceRoleClient();
  const { data: reports, error } = await service
    .from("share_reports")
    .select("id, share_id, reason, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  if (!reports || reports.length === 0) return [];

  const shareIds = [...new Set(reports.map((r) => r.share_id))];
  const { data: shares, error: shareError } = await service
    .from("resource_shares")
    .select("id, title, domain, hidden_at")
    .in("id", shareIds);
  if (shareError) throw new Error(shareError.message);
  const shareById = new Map((shares ?? []).map((s) => [s.id, s]));
  const countByShare = new Map<string, number>();
  for (const r of reports) countByShare.set(r.share_id, (countByShare.get(r.share_id) ?? 0) + 1);

  return reports.map((r) => {
    const share = shareById.get(r.share_id);
    return {
      id: r.id,
      shareId: r.share_id,
      reason: r.reason,
      createdAt: r.created_at,
      shareTitle: share?.title ?? "(removed)",
      shareDomain: share?.domain ?? "",
      shareHidden: !!share?.hidden_at,
      openReportCount: countByShare.get(r.share_id) ?? 1,
    };
  });
}

export interface HiddenShare {
  shareId: string;
  title: string;
  domain: string;
  hiddenReason: string | null;
  hiddenAt: string;
}

export async function listHiddenShares(): Promise<HiddenShare[]> {
  const { data, error } = await getServiceRoleClient()
    .from("resource_shares")
    .select("id, title, domain, hidden_reason, hidden_at")
    .not("hidden_at", "is", null)
    .is("revoked_at", null)
    .order("hidden_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({
    shareId: s.id,
    title: s.title,
    domain: s.domain,
    hiddenReason: s.hidden_reason,
    hiddenAt: s.hidden_at as string,
  }));
}

/** Takes the share down from Discover and its link, and actions every open report on it. */
export async function hideShare(shareId: string): Promise<void> {
  const service = getServiceRoleClient();
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("resource_shares")
    .update({ hidden_at: now, hidden_reason: "moderator" })
    .eq("id", shareId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Share not found.");
  const { error: actionError } = await service
    .from("share_reports")
    .update({ status: "actioned", resolved_at: now })
    .eq("share_id", shareId)
    .eq("status", "open");
  if (actionError) throw new Error(actionError.message);
}

/** Puts a hidden share back and dismisses its open reports as not violating. Reports stay in the database as history. */
export async function restoreShare(shareId: string): Promise<void> {
  const service = getServiceRoleClient();
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("resource_shares")
    .update({ hidden_at: null, hidden_reason: null })
    .eq("id", shareId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Share not found.");
  const { error: dismissError } = await service
    .from("share_reports")
    .update({ status: "dismissed", resolved_at: now })
    .eq("share_id", shareId)
    .eq("status", "open");
  if (dismissError) throw new Error(dismissError.message);
}

export async function dismissReport(reportId: string): Promise<void> {
  const { data, error } = await getServiceRoleClient()
    .from("share_reports")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Report not found or already resolved.");
}

export interface PopularStack {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  resourceCount: number;
  username: string;
  slug: string;
}

export async function listPopularPublicStacks(limit = 12): Promise<PopularStack[]> {
  const client = getServiceRoleClient();
  const { data: stacks, error } = await client
    .from("stacks")
    .select("id, user_id, name, description, icon, color, slug")
    .eq("visibility", "public")
    .not("slug", "is", null)
    .limit(200);
  if (error) throw new Error(error.message);
  if (!stacks || stacks.length === 0) return [];

  const stackIds = stacks.map((s) => s.id);
  const { data: links, error: linkError } = await client.from("resource_stacks").select("stack_id").in("stack_id", stackIds);
  if (linkError) throw new Error(linkError.message);
  const countByStack = new Map<string, number>();
  for (const l of links ?? []) countByStack.set(l.stack_id, (countByStack.get(l.stack_id) ?? 0) + 1);

  const userIds = [...new Set(stacks.map((s) => s.user_id))];
  const { data: profiles, error: profileError } = await client
    .from("profiles")
    .select("id, username")
    .in("id", userIds);
  if (profileError) throw new Error(profileError.message);
  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  return stacks
    .filter((s) => usernameById.get(s.user_id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      icon: s.icon,
      color: s.color,
      resourceCount: countByStack.get(s.id) ?? 0,
      username: usernameById.get(s.user_id) as string,
      slug: s.slug as string,
    }))
    .sort((a, b) => b.resourceCount - a.resourceCount)
    .slice(0, limit);
}
