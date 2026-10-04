import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listDiscoverShares, listPopularPublicStacks, DISCOVER_SORTS, type DiscoverSort } from "@/lib/data/discover";

export async function GET(request: NextRequest) {
  const { unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const sortParam = request.nextUrl.searchParams.get("sort") ?? "trending";
  const sort = (DISCOVER_SORTS as readonly string[]).includes(sortParam) ? (sortParam as DiscoverSort) : "trending";
  const category = request.nextUrl.searchParams.get("category")?.slice(0, 60) || null;

  try {
    const [shares, popularStacks] = await Promise.all([
      listDiscoverShares(sort, category),
      listPopularPublicStacks(),
    ]);
    return NextResponse.json({ shares, popularStacks });
  } catch {
    return NextResponse.json({ error: "Couldn't load Discover." }, { status: 500 });
  }
}
