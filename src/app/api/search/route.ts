import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { searchResources, suggestSearchTerms } from "@/lib/data/search";
import { trackEvent } from "@/lib/data/analytics";

export async function GET(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const results = await searchResources(supabase, q);
    // Only bother looking up "did you mean" suggestions when the search
    // actually came back empty — it's an extra query, not worth running
    // on every keystroke that already found something.
    const didYouMean = results.length === 0 && q.trim() ? await suggestSearchTerms(supabase, q) : [];
    if (q.trim()) {
      // No query text stored — just that a search happened and how many
      // results it found (§6/§16: minimal, non-sensitive metadata).
      void trackEvent({ eventType: "search_performed", userId: user.id, metadata: { resultCount: results.length } });
    }
    return NextResponse.json({ results, didYouMean });
  } catch {
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 503 });
  }
}
