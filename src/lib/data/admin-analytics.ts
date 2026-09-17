import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export interface DateRange {
  from: string; // ISO
  to: string; // ISO, exclusive
}

/** The same-length period immediately before `range`, for "vs previous period" comparisons. */
export function previousPeriod(range: DateRange): DateRange {
  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  const spanMs = to - from;
  return { from: new Date(from - spanMs).toISOString(), to: new Date(to - spanMs).toISOString() };
}

export interface OverviewStats {
  visitors: number;
  prevVisitors: number;
  uniqueVisitors: number;
  prevUniqueVisitors: number;
  pageViews: number;
  prevPageViews: number;
  newUsers: number;
  prevNewUsers: number;
  totalUsers: number;
  resourcesCreated: number;
  prevResourcesCreated: number;
  totalResources: number;
  activeUsers: number;
  prevActiveUsers: number;
  extensionSaves: number;
  prevExtensionSaves: number;
  importsCompleted: number;
  prevImportsCompleted: number;
  failedOperations: number;
  prevFailedOperations: number;
}

export async function getOverview(client: Client, range: DateRange): Promise<OverviewStats> {
  const prev = previousPeriod(range);
  const { data, error } = await client
    .rpc("admin_overview", {
      p_from: range.from,
      p_to: range.to,
      p_prev_from: prev.from,
      p_prev_to: prev.to,
    })
    .single();
  if (error) throw new Error(error.message);
  const row = data as Record<string, number>;
  return {
    visitors: row.visitors ?? 0,
    prevVisitors: row.prev_visitors ?? 0,
    uniqueVisitors: row.unique_visitors ?? 0,
    prevUniqueVisitors: row.prev_unique_visitors ?? 0,
    pageViews: row.page_views ?? 0,
    prevPageViews: row.prev_page_views ?? 0,
    newUsers: row.new_users ?? 0,
    prevNewUsers: row.prev_new_users ?? 0,
    totalUsers: row.total_users ?? 0,
    resourcesCreated: row.resources_created ?? 0,
    prevResourcesCreated: row.prev_resources_created ?? 0,
    totalResources: row.total_resources ?? 0,
    activeUsers: row.active_users ?? 0,
    prevActiveUsers: row.prev_active_users ?? 0,
    extensionSaves: row.extension_saves ?? 0,
    prevExtensionSaves: row.prev_extension_saves ?? 0,
    importsCompleted: row.imports_completed ?? 0,
    prevImportsCompleted: row.prev_imports_completed ?? 0,
    failedOperations: row.failed_operations ?? 0,
    prevFailedOperations: row.prev_failed_operations ?? 0,
  };
}

export interface DailyPoint {
  day: string;
  visitors: number;
  uniqueVisitors: number;
  pageViews: number;
  newUsers: number;
  resourcesCreated: number;
  extensionSaves: number;
  searches: number;
  importsCompleted: number;
}

export async function getDailyTimeseries(client: Client, range: DateRange): Promise<DailyPoint[]> {
  const { data, error } = await client.rpc("admin_daily_timeseries", { p_from: range.from, p_to: range.to });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    day: r.day,
    visitors: r.visitors ?? 0,
    uniqueVisitors: r.unique_visitors ?? 0,
    pageViews: r.page_views ?? 0,
    newUsers: r.new_users ?? 0,
    resourcesCreated: r.resources_created ?? 0,
    extensionSaves: r.extension_saves ?? 0,
    searches: r.searches ?? 0,
    importsCompleted: r.imports_completed ?? 0,
  }));
}

export interface DimensionCount {
  label: string;
  count: number;
}

export async function getTopDimension(
  client: Client,
  kind: "category" | "stack" | "tag" | "pricing",
  range: DateRange,
  limit = 8
): Promise<DimensionCount[]> {
  const { data, error } = await client.rpc("admin_top_dimension", {
    p_kind: kind,
    p_from: range.from,
    p_to: range.to,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ label: r.label ?? "Unknown", count: r.count ?? 0 }));
}

export interface SourceBreakdown {
  extensionSaves: number;
  webSaves: number;
  importCreated: number;
  manualCreated: number;
}

export async function getSourceBreakdown(client: Client, range: DateRange): Promise<SourceBreakdown> {
  // Two independent axes, each its own {this, everything else} split —
  // "Extension vs Web" and "Import vs Manual" are separate questions, not
  // four mutually-exclusive buckets. extensionSaves and importCreated
  // both come straight from resources.import_source (set to
  // "chrome-extension" by every extension save — see extension/src/lib/
  // api.ts's saveResource — and to "chrome-bookmarks" by the bulk/Stack
  // Studio importer), matched to its own specific value rather than a
  // catch-all "is not null" so an extension save is never miscounted as
  // an "import." The resource row is the authoritative record of what was
  // actually created; an analytics event is fire-and-forget best-effort
  // and can go missing on a flaky network without the save itself failing.
  const countBySource = (source: string) =>
    client
      .from("resources")
      .select("id", { count: "exact", head: true })
      .eq("import_source", source)
      .gte("created_at", range.from)
      .lt("created_at", range.to);

  const [totalRes, importRes, extensionRes] = await Promise.all([
    client.from("resources").select("id", { count: "exact", head: true }).gte("created_at", range.from).lt("created_at", range.to),
    countBySource("chrome-bookmarks"),
    countBySource("chrome-extension"),
  ]);
  if (totalRes.error) throw new Error(totalRes.error.message);
  if (importRes.error) throw new Error(importRes.error.message);
  if (extensionRes.error) throw new Error(extensionRes.error.message);
  const total = totalRes.count ?? 0;
  const importCreated = importRes.count ?? 0;
  const extensionSaves = extensionRes.count ?? 0;
  return {
    extensionSaves,
    webSaves: Math.max(0, total - extensionSaves),
    importCreated,
    manualCreated: Math.max(0, total - importCreated),
  };
}

export interface ExtensionSaveHealth {
  saveStarted: number;
  saveSuccess: number;
  saveFailure: number;
  duplicateDetected: number;
  /** Rounded 0-100; null when there's no data yet (never shown as a fabricated "0%"). */
  successRate: number | null;
  duplicateRate: number | null;
}

/** Extension-specific reliability metrics — success/duplicate rate, from real analytics_events counts only. */
export async function getExtensionSaveHealth(client: Client, range: DateRange): Promise<ExtensionSaveHealth> {
  const countEvent = (eventType: string) =>
    client
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", eventType)
      .gte("created_at", range.from)
      .lt("created_at", range.to);

  const [startedRes, successRes, failureRes, duplicateRes] = await Promise.all([
    countEvent("extension_save_started"),
    countEvent("extension_save_success"),
    countEvent("extension_save_failure"),
    countEvent("extension_duplicate_detected"),
  ]);
  for (const r of [startedRes, successRes, failureRes, duplicateRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const saveStarted = startedRes.count ?? 0;
  const saveSuccess = successRes.count ?? 0;
  const saveFailure = failureRes.count ?? 0;
  const duplicateDetected = duplicateRes.count ?? 0;
  const attempted = saveSuccess + saveFailure;

  return {
    saveStarted,
    saveSuccess,
    saveFailure,
    duplicateDetected,
    successRate: attempted > 0 ? Math.round((saveSuccess / attempted) * 100) : null,
    duplicateRate: saveStarted > 0 ? Math.round((duplicateDetected / saveStarted) * 100) : null,
  };
}

export interface RecentActivityItem {
  id: string;
  eventType: string;
  createdAt: string;
  path: string | null;
  userId: string | null;
}

export async function getRecentActivity(client: Client, limit = 30): Promise<RecentActivityItem[]> {
  const { data, error } = await client
    .from("analytics_events")
    .select("id, event_type, created_at, path, user_id")
    .neq("event_type", "page_view") // page views are high-volume and shown in the visitor chart, not the activity feed
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: r.id, eventType: r.event_type, createdAt: r.created_at, path: r.path, userId: r.user_id }));
}

export interface UserRow {
  id: string;
  email: string | null;
  signupDate: string;
  resourceCount: number;
  lastActiveAt: string | null;
}

export interface UserStats {
  totalUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  activeUsersToday: number;
  activeUsersThisWeek: number;
  activeUsersThisMonth: number;
  usersWithResources: number;
  usersWithoutResources: number;
  users: UserRow[];
}

/**
 * The admin user table (§8) — bounded to the most recent 200 signups
 * (an "admin table," not an export; anyone running a KeepYourStack
 * instance past a couple hundred users would want real pagination here,
 * out of scope for this pass). Resource counts and last-active come from
 * two grouped queries, not one row-by-row loop.
 */
export async function getUserStats(client: Client): Promise<UserStats> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
  const monthStart = new Date(now.getTime() - 30 * 86400000).toISOString();

  const [profilesRes, resourceCountsRes, activityRes] = await Promise.all([
    client.from("profiles").select("id, email, created_at").order("created_at", { ascending: false }).limit(200),
    client.from("resources").select("user_id"),
    client
      .from("analytics_events")
      .select("user_id, created_at")
      .not("user_id", "is", null)
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false }),
  ]);
  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (resourceCountsRes.error) throw new Error(resourceCountsRes.error.message);
  if (activityRes.error) throw new Error(activityRes.error.message);

  const resourceCountByUser = new Map<string, number>();
  for (const r of resourceCountsRes.data ?? []) {
    resourceCountByUser.set(r.user_id, (resourceCountByUser.get(r.user_id) ?? 0) + 1);
  }
  const lastActiveByUser = new Map<string, string>();
  const activeToday = new Set<string>();
  const activeWeek = new Set<string>();
  const activeMonth = new Set<string>();
  for (const e of activityRes.data ?? []) {
    if (!e.user_id) continue;
    if (!lastActiveByUser.has(e.user_id)) lastActiveByUser.set(e.user_id, e.created_at); // first hit = most recent, since ordered desc
    activeMonth.add(e.user_id);
    if (e.created_at >= weekStart) activeWeek.add(e.user_id);
    if (e.created_at >= todayStart) activeToday.add(e.user_id);
  }

  const profiles = profilesRes.data ?? [];
  const users: UserRow[] = profiles.map((p) => ({
    id: p.id,
    email: p.email,
    signupDate: p.created_at,
    resourceCount: resourceCountByUser.get(p.id) ?? 0,
    lastActiveAt: lastActiveByUser.get(p.id) ?? null,
  }));

  const totalUsers = profiles.length; // note: capped at 200 — see this function's own comment
  const usersWithResources = profiles.filter((p) => (resourceCountByUser.get(p.id) ?? 0) > 0).length;

  return {
    totalUsers,
    newUsersToday: profiles.filter((p) => p.created_at >= todayStart).length,
    newUsersThisWeek: profiles.filter((p) => p.created_at >= weekStart).length,
    newUsersThisMonth: profiles.filter((p) => p.created_at >= monthStart).length,
    activeUsersToday: activeToday.size,
    activeUsersThisWeek: activeWeek.size,
    activeUsersThisMonth: activeMonth.size,
    usersWithResources,
    usersWithoutResources: totalUsers - usersWithResources,
    users,
  };
}

export interface DeviceBreakdown {
  devices: DimensionCount[];
  browsers: DimensionCount[];
  operatingSystems: DimensionCount[];
  referrers: DimensionCount[];
  landingPages: DimensionCount[];
}

export async function getVisitorBreakdown(client: Client, range: DateRange): Promise<DeviceBreakdown> {
  const { data, error } = await client
    .from("visitor_sessions")
    .select("device_type, browser, operating_system, referrer, landing_path")
    .gte("first_seen_at", range.from)
    .lt("first_seen_at", range.to)
    .limit(5000); // bounded — see this function's own comment below

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  // Client-side tally over a bounded (5,000-row) page rather than a SQL
  // GROUP BY for this one — device/browser/OS/referrer/landing-page
  // cardinality is small, and this keeps the four breakdowns as one query
  // instead of four. At real scale beyond 5,000 sessions in a single
  // reporting window this becomes an approximation over the most recent
  // 5,000, not the true total — documented, not hidden.
  const tally = (key: keyof (typeof rows)[number]) => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const v = (r[key] as string | null) ?? "Unknown";
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  };

  return {
    devices: tally("device_type"),
    browsers: tally("browser"),
    operatingSystems: tally("operating_system"),
    referrers: tally("referrer"),
    landingPages: tally("landing_path"),
  };
}

export interface ActivationFunnel {
  visitors: number;
  signups: number;
  firstResource: number;
  firstSearch: number;
  activated: number;
}

/**
 * The V1 funnel (§21): visitors -> signups -> first resource -> first
 * search -> activated. Whole-history counts, not scoped to the dashboard's
 * date-range picker — a funnel step is "has this ever happened," not "did
 * it happen this week," so filtering by range here would just make small
 * accounts look artificially like they have low activation. See
 * admin_activation_funnel() in supabase/migrations for exactly how each
 * step and "activated" are defined from real event data.
 */
export async function getActivationFunnel(client: Client): Promise<ActivationFunnel> {
  const { data, error } = await client.rpc("admin_activation_funnel").single();
  if (error) throw new Error(error.message);
  const row = data as Record<string, number>;
  return {
    visitors: row.visitors ?? 0,
    signups: row.signups ?? 0,
    firstResource: row.first_resource ?? 0,
    firstSearch: row.first_search ?? 0,
    activated: row.activated ?? 0,
  };
}

export interface RetentionStats {
  eligibleForD1: number;
  returnedD1: number;
  eligibleForD7: number;
  returnedD7: number;
  activeUsers30d: number;
  resourcesPerActiveUser: number;
  searchesPerActiveUser: number;
}

/** Returning-user + per-active-user usage signals (§22). See admin_retention_stats() for exact definitions. */
export async function getRetentionStats(client: Client): Promise<RetentionStats> {
  const { data, error } = await client.rpc("admin_retention_stats").single();
  if (error) throw new Error(error.message);
  const row = data as Record<string, number>;
  return {
    eligibleForD1: row.eligible_for_d1 ?? 0,
    returnedD1: row.returned_d1 ?? 0,
    eligibleForD7: row.eligible_for_d7 ?? 0,
    returnedD7: row.returned_d7 ?? 0,
    activeUsers30d: row.active_users_30d ?? 0,
    resourcesPerActiveUser: row.resources_per_active_user ?? 0,
    searchesPerActiveUser: row.searches_per_active_user ?? 0,
  };
}
