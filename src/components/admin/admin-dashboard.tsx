"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Shield, Users, Eye, FileText, Star, Download, AlertTriangle, Puzzle, ArrowLeft } from "lucide-react";
import { MiniLineChart } from "./mini-line-chart";

type Preset = "today" | "yesterday" | "7d" | "30d" | "90d" | "thisMonth" | "prevMonth";

function rangeForPreset(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + 86400000);

  switch (preset) {
    case "today":
      return { from: today.toISOString(), to: tomorrow.toISOString() };
    case "yesterday": {
      const y = new Date(today.getTime() - 86400000);
      return { from: y.toISOString(), to: today.toISOString() };
    }
    case "7d":
      return { from: new Date(today.getTime() - 7 * 86400000).toISOString(), to: tomorrow.toISOString() };
    case "30d":
      return { from: new Date(today.getTime() - 30 * 86400000).toISOString(), to: tomorrow.toISOString() };
    case "90d":
      return { from: new Date(today.getTime() - 90 * 86400000).toISOString(), to: tomorrow.toISOString() };
    case "thisMonth":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: tomorrow.toISOString() };
    case "prevMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start.toISOString(), to: end.toISOString() };
    }
  }
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "thisMonth", label: "This month" },
  { value: "prevMonth", label: "Previous month" },
];

interface DashboardData {
  overview: Record<string, number>;
  timeseries: { day: string; visitors: number; uniqueVisitors: number; pageViews: number; newUsers: number; resourcesCreated: number; extensionSaves: number; searches: number; importsCompleted: number }[];
  topCategories: { label: string; count: number }[];
  topStacks: { label: string; count: number }[];
  topTags: { label: string; count: number }[];
  topPricing: { label: string; count: number }[];
  sources: { extensionSaves: number; webSaves: number; importCreated: number; manualCreated: number };
  extensionHealth: {
    saveStarted: number;
    saveSuccess: number;
    saveFailure: number;
    duplicateDetected: number;
    successRate: number | null;
    duplicateRate: number | null;
  };
  recentActivity: { id: string; eventType: string; createdAt: string; path: string | null; userId: string | null }[];
  userStats: {
    totalUsers: number;
    newUsersToday: number;
    newUsersThisWeek: number;
    newUsersThisMonth: number;
    activeUsersToday: number;
    activeUsersThisWeek: number;
    activeUsersThisMonth: number;
    usersWithResources: number;
    usersWithoutResources: number;
    users: { id: string; email: string | null; signupDate: string; resourceCount: number; lastActiveAt: string | null }[];
  };
  visitorBreakdown: {
    devices: { label: string; count: number }[];
    browsers: { label: string; count: number }[];
    operatingSystems: { label: string; count: number }[];
    referrers: { label: string; count: number }[];
    landingPages: { label: string; count: number }[];
  };
  activationFunnel: { visitors: number; signups: number; firstResource: number; firstSearch: number; activated: number };
  retention: {
    eligibleForD1: number;
    returnedD1: number;
    eligibleForD7: number;
    returnedD7: number;
    activeUsers30d: number;
    resourcesPerActiveUser: number;
    searchesPerActiveUser: number;
  };
}

const EVENT_LABELS: Record<string, string> = {
  signup: "New user signed up",
  login: "User signed in",
  resource_created: "Resource saved",
  resource_updated: "Resource updated",
  resource_deleted: "Resource deleted",
  resource_favorited: "Resource favorited",
  resource_unfavorited: "Resource unfavorited",
  resource_archived: "Resource archived",
  resource_restored: "Resource restored",
  duplicate_save_prevented: "Duplicate save prevented",
  extension_popup_opened: "Extension popup opened",
  extension_metadata_loaded: "Extension metadata loaded",
  extension_suggestion_shown: "Extension suggestion shown",
  extension_suggestion_changed: "Extension suggestion overridden",
  extension_save_started: "Extension save started",
  extension_save_success: "Extension save",
  extension_save_failure: "Extension save failed",
  extension_duplicate_detected: "Extension duplicate detected",
  extension_login_required: "Extension sign-in prompted",
  import_completed: "Bookmark import completed",
  import_failed: "Bookmark import failed",
  export_performed: "Export performed",
  search_performed: "Search performed",
  enrichment_completed: "Enrichment completed",
  enrichment_failed: "Enrichment failed",
  server_error: "Server error",
  client_error: "Client error",
  onboarding_started: "Onboarding started",
  onboarding_completed: "Onboarding completed",
  onboarding_skipped: "Onboarding skipped",
  stack_created: "Stack created",
  first_resource_saved: "First resource saved 🎉",
  first_import_completed: "First import completed 🎉",
  first_stack_created: "First stack created 🎉",
  first_favorite: "First favorite 🎉",
  feedback_submitted: "Feedback submitted",
};

export function AdminDashboard() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => rangeForPreset(preset), [preset]);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    cancelledRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/dashboard?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Couldn't load admin data.");
      if (!cancelledRef.current) setData(body);
    } catch (e) {
      if (!cancelledRef.current) setError(e instanceof Error ? e.message : "Couldn't load admin data.");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [range.from, range.to]);

  // Justified use of an effect: fetching data in response to the selected
  // date range changing is exactly the "synchronize with an external
  // system" case React's own docs carve out as a legitimate effect — there
  // is no render-time equivalent to a network request. The linter's
  // set-state-in-effect heuristic can't distinguish this from the "derive
  // state you could compute during render" anti-pattern it actually
  // targets (see the same justified pattern already in
  // src/app/(app)/resources/page.tsx and library/page.tsx).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2.5">
          <Shield size={18} className="text-accent" />
          <h1 className="text-[15px] font-semibold text-text-primary">KeepYourStack Admin</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
            className="h-8 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[12.5px] text-text-primary focus:border-accent focus:outline-none"
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <Link href="/home" className="flex items-center gap-1.5 text-[12.5px] text-text-secondary hover:text-text-primary">
            <ArrowLeft size={13} /> Back to app
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1400px] flex-col gap-8 px-6 py-6">
        {error && (
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {loading && !data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-[var(--radius-lg)] border border-border bg-surface" />
            ))}
          </div>
        ) : data ? (
          <>
            <Overview data={data} />
            <ActivationFunnel funnel={data.activationFunnel} />
            <RetentionSignals retention={data.retention} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard title="Visitors & Page Views">
                <MiniLineChart
                  series={[
                    { label: "Visitors", color: "var(--accent, #7c6cf6)", points: data.timeseries.map((d) => d.visitors) },
                    { label: "Unique visitors", color: "#22d3ee", points: data.timeseries.map((d) => d.uniqueVisitors) },
                    { label: "Page views", color: "#f59e0b", points: data.timeseries.map((d) => d.pageViews) },
                  ]}
                />
              </ChartCard>
              <ChartCard title="Resource Saves">
                <MiniLineChart series={[{ label: "Resources saved", color: "var(--accent, #7c6cf6)", points: data.timeseries.map((d) => d.resourcesCreated) }]} />
              </ChartCard>
              <ChartCard title="User Growth">
                <MiniLineChart series={[{ label: "New users", color: "#34d399", points: data.timeseries.map((d) => d.newUsers) }]} />
              </ChartCard>
              <ChartCard title="Activity">
                <MiniLineChart
                  series={[
                    { label: "Saves", color: "var(--accent, #7c6cf6)", points: data.timeseries.map((d) => d.resourcesCreated) },
                    { label: "Searches", color: "#22d3ee", points: data.timeseries.map((d) => d.searches) },
                    { label: "Extension saves", color: "#f59e0b", points: data.timeseries.map((d) => d.extensionSaves) },
                    { label: "Imports", color: "#34d399", points: data.timeseries.map((d) => d.importsCompleted) },
                  ]}
                />
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <TopList title="Top Categories" items={data.topCategories} />
              <TopList title="Top Stacks" items={data.topStacks} />
              <TopList title="Top Tags" items={data.topTags} />
              <TopList title="Top Pricing" items={data.topPricing} />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <TopList title="Devices" items={data.visitorBreakdown.devices} />
              <TopList title="Browsers" items={data.visitorBreakdown.browsers} />
              <TopList title="Top Landing Pages" items={data.visitorBreakdown.landingPages} />
              <TopList title="Top Referrers" items={data.visitorBreakdown.referrers.filter((r) => r.label !== "" && r.label !== "Unknown")} />
            </div>

            <SourceBreakdown sources={data.sources} health={data.extensionHealth} />

            <UserTable stats={data.userStats} />

            <RecentActivity items={data.recentActivity} />
          </>
        ) : null}
      </main>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[var(--radius-lg)] border border-border bg-surface p-5 ${className}`}>{children}</div>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-[13px] font-semibold text-text-primary">{title}</h2>
      {children}
    </Card>
  );
}

function pctChange(current: number, prev: number): string | null {
  if (prev === 0) return current > 0 ? "new" : null;
  const change = ((current - prev) / prev) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(0)}% vs previous period`;
}

function Kpi({ icon: Icon, label, value, prev }: { icon: React.ElementType; label: string; value: number; prev?: number }) {
  const change = prev !== undefined ? pctChange(value, prev) : null;
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon size={14} />
        <span className="text-[11.5px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-[22px] font-semibold text-text-primary">{value.toLocaleString()}</p>
      <p className="text-[11px] text-text-muted">{change ?? "Not enough historical data yet"}</p>
    </Card>
  );
}

function Overview({ data }: { data: DashboardData }) {
  const o = data.overview;
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Kpi icon={Eye} label="Total Visitors" value={o.visitors} prev={o.prevVisitors} />
      <Kpi icon={Eye} label="Unique Visitors" value={o.uniqueVisitors} prev={o.prevUniqueVisitors} />
      <Kpi icon={FileText} label="Page Views" value={o.pageViews} prev={o.prevPageViews} />
      <Kpi icon={Users} label="New Users" value={o.newUsers} prev={o.prevNewUsers} />
      <Kpi icon={Users} label="Registered Users" value={o.totalUsers} />
      <Kpi icon={Star} label="Resources Saved" value={o.resourcesCreated} prev={o.prevResourcesCreated} />
      <Kpi icon={FileText} label="Total Resources" value={o.totalResources} />
      <Kpi icon={Users} label="Active Users" value={o.activeUsers} prev={o.prevActiveUsers} />
      <Kpi icon={Puzzle} label="Extension Saves" value={o.extensionSaves} prev={o.prevExtensionSaves} />
      <Kpi icon={Download} label="Bookmark Imports" value={o.importsCompleted} prev={o.prevImportsCompleted} />
      <Kpi icon={AlertTriangle} label="Failed Operations" value={o.failedOperations} prev={o.prevFailedOperations} />
    </section>
  );
}

// Phase 17 (§21): the V1 growth funnel — visitors -> signups -> first
// resource -> first search -> activated. Whole-history counts (see
// admin_activation_funnel() in supabase/migrations), not scoped to the
// date-range picker above — a funnel step is "has this ever happened."
// Conversion between steps is computed here, not manufactured: a step
// with a zero prior-step count shows "—" rather than a division-by-zero
// percentage or a fabricated number.
function ActivationFunnel({ funnel }: { funnel: DashboardData["activationFunnel"] }) {
  const steps = [
    { label: "Visitors", value: funnel.visitors },
    { label: "Signups", value: funnel.signups },
    { label: "First Resource", value: funnel.firstResource },
    { label: "First Search", value: funnel.firstSearch },
    { label: "Activated", value: funnel.activated },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  const totalTracked = steps.some((s) => s.value > 0);

  return (
    <Card>
      <h2 className="mb-1 text-[13px] font-semibold text-text-primary">Activation Funnel</h2>
      <p className="mb-4 text-[11.5px] text-text-muted">
        Whole-account history — a user has saved/imported a resource and successfully found it again via Search
        counts as activated.
      </p>
      {!totalTracked ? (
        <p className="text-[12.5px] text-text-muted">Not enough historical data yet to show a funnel.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {steps.map((step, i) => {
            const prevValue = i > 0 ? steps[i - 1].value : null;
            const conversion = prevValue && prevValue > 0 ? `${Math.round((step.value / prevValue) * 100)}%` : null;
            return (
              <div key={step.label} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-[12.5px] text-text-secondary">{step.label}</span>
                <div className="h-2 flex-1 rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(step.value / max) * 100}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right text-[12.5px] font-medium text-text-primary">
                  {step.value.toLocaleString()}
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-[11px] text-text-muted">{conversion ?? "—"}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// Phase 17 (§22): returning-user + per-active-user usage signals — only
// metrics directly computable from existing analytics_events/profiles
// data (admin_retention_stats()), not a full analytics warehouse.
function RetentionSignals({ retention }: { retention: DashboardData["retention"] }) {
  const d1 = retention.eligibleForD1 > 0 ? `${Math.round((retention.returnedD1 / retention.eligibleForD1) * 100)}%` : null;
  const d7 = retention.eligibleForD7 > 0 ? `${Math.round((retention.returnedD7 / retention.eligibleForD7) * 100)}%` : null;
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card className="flex flex-col gap-1">
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-text-muted">Returned after 1 day</span>
        <p className="text-[22px] font-semibold text-text-primary">{d1 ?? "—"}</p>
        <p className="text-[11px] text-text-muted">
          {retention.eligibleForD1 > 0 ? `${retention.returnedD1} of ${retention.eligibleForD1} eligible` : "Not enough historical data yet"}
        </p>
      </Card>
      <Card className="flex flex-col gap-1">
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-text-muted">Returned after 7 days</span>
        <p className="text-[22px] font-semibold text-text-primary">{d7 ?? "—"}</p>
        <p className="text-[11px] text-text-muted">
          {retention.eligibleForD7 > 0 ? `${retention.returnedD7} of ${retention.eligibleForD7} eligible` : "Not enough historical data yet"}
        </p>
      </Card>
      <Card className="flex flex-col gap-1">
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-text-muted">Resources / active user</span>
        <p className="text-[22px] font-semibold text-text-primary">{retention.resourcesPerActiveUser}</p>
        <p className="text-[11px] text-text-muted">last 30 days · {retention.activeUsers30d} active users</p>
      </Card>
      <Card className="flex flex-col gap-1">
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-text-muted">Searches / active user</span>
        <p className="text-[22px] font-semibold text-text-primary">{retention.searchesPerActiveUser}</p>
        <p className="text-[11px] text-text-muted">last 30 days</p>
      </Card>
    </section>
  );
}

function TopListRows({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) return <p className="text-[12.5px] text-text-muted">No data in this range.</p>;
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-[12.5px] text-text-secondary" title={item.label}>
            {item.label}
          </span>
          <div className="h-1.5 flex-1 rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-[11.5px] text-text-muted">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function TopList({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  return (
    <Card>
      <h2 className="mb-3 text-[13px] font-semibold text-text-primary">{title}</h2>
      <TopListRows items={items} />
    </Card>
  );
}

function SourceBreakdown({ sources, health }: { sources: DashboardData["sources"]; health: DashboardData["extensionHealth"] }) {
  return (
    <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <Card>
        <h2 className="mb-3 text-[13px] font-semibold text-text-primary">Extension vs Web Saves</h2>
        <TopListRows items={[
          { label: "Extension", count: sources.extensionSaves },
          { label: "Web", count: sources.webSaves },
        ]} />
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[11.5px] text-text-muted">
          <span>
            Success rate:{" "}
            <strong className="text-text-primary">{health.successRate === null ? "—" : `${health.successRate}%`}</strong>
          </span>
          <span>
            Duplicate rate:{" "}
            <strong className="text-text-primary">{health.duplicateRate === null ? "—" : `${health.duplicateRate}%`}</strong>
          </span>
          <span>
            Attempts: <strong className="text-text-primary">{health.saveStarted.toLocaleString()}</strong>
          </span>
        </div>
      </Card>
      <TopList
        title="Import vs Manual"
        items={[
          { label: "Import-created", count: sources.importCreated },
          { label: "Manual", count: sources.manualCreated },
        ]}
      />
    </section>
  );
}

function UserTable({ stats }: { stats: DashboardData["userStats"] }) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-text-primary">Users</h2>
        <div className="flex flex-wrap gap-4 text-[11.5px] text-text-muted">
          <span>New today: <strong className="text-text-primary">{stats.newUsersToday}</strong></span>
          <span>New this week: <strong className="text-text-primary">{stats.newUsersThisWeek}</strong></span>
          <span>New this month: <strong className="text-text-primary">{stats.newUsersThisMonth}</strong></span>
          <span>Active today: <strong className="text-text-primary">{stats.activeUsersToday}</strong></span>
          <span>Never saved: <strong className="text-text-primary">{stats.usersWithoutResources}</strong></span>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead className="sticky top-0 bg-surface text-text-muted">
            <tr>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Signed up</th>
              <th className="pb-2 font-medium">Resources</th>
              <th className="pb-2 font-medium">Last active</th>
            </tr>
          </thead>
          <tbody>
            {stats.users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="py-1.5 text-text-primary">{u.email ?? "—"}</td>
                <td className="py-1.5 text-text-secondary">{new Date(u.signupDate).toLocaleDateString()}</td>
                <td className="py-1.5 text-text-secondary">{u.resourceCount}</td>
                <td className="py-1.5 text-text-secondary">{u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString() : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RecentActivity({ items }: { items: DashboardData["recentActivity"] }) {
  return (
    <Card>
      <h2 className="mb-3 text-[13px] font-semibold text-text-primary">Recent Activity</h2>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">No recent activity.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 text-[12.5px] last:border-0">
              <span className="text-text-primary">{EVENT_LABELS[item.eventType] ?? item.eventType}</span>
              <span className="shrink-0 text-text-muted">{new Date(item.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
