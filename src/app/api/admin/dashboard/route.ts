import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/data/admin-auth";
import {
  getOverview,
  getDailyTimeseries,
  getTopDimension,
  getSourceBreakdown,
  getExtensionSaveHealth,
  getRecentActivity,
  getUserStats,
  getVisitorBreakdown,
  type DateRange,
} from "@/lib/data/admin-analytics";

// The one route the whole /admin dashboard reads from — everything the UI
// needs for a given date range in a single request, all aggregated
// server-side (SQL GROUP BY / indexed counts — see admin-analytics.ts),
// never a raw event dump. requireAdmin() is the entire authorization
// boundary: no admin flag is ever read from anything client-supplied.
export async function GET(request: NextRequest) {
  const { forbidden, service } = await requireAdmin(request);
  if (forbidden) return forbidden;

  const params = request.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return NextResponse.json({ error: "Valid ?from= and ?to= (ISO dates) are required." }, { status: 400 });
  }
  const range: DateRange = { from, to };

  try {
    const [
      overview,
      timeseries,
      topCategories,
      topStacks,
      topTags,
      topPricing,
      sources,
      extensionHealth,
      recentActivity,
      userStats,
      visitorBreakdown,
    ] = await Promise.all([
      getOverview(service!, range),
      getDailyTimeseries(service!, range),
      getTopDimension(service!, "category", range),
      getTopDimension(service!, "stack", range),
      getTopDimension(service!, "tag", range),
      getTopDimension(service!, "pricing", range),
      getSourceBreakdown(service!, range),
      getExtensionSaveHealth(service!, range),
      getRecentActivity(service!),
      getUserStats(service!),
      getVisitorBreakdown(service!, range),
    ]);

    return NextResponse.json({
      overview,
      timeseries,
      topCategories,
      topStacks,
      topTags,
      topPricing,
      sources,
      extensionHealth,
      recentActivity,
      userStats,
      visitorBreakdown,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load admin data." }, { status: 500 });
  }
}
