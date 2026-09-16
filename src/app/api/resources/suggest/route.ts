import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { corsPreflight, withCors } from "@/lib/cors";
import { getDomain, normalizeUrl } from "@/lib/utils";
import { suggestCategoryForResource, suggestTags, suggestUsefulFor } from "@/lib/enrichment";
import { listCategories } from "@/lib/data/categories";

// Phase 15: lets the Chrome extension show organization suggestions
// BEFORE a resource is created — never blocks on a real metadata fetch
// (fetchMetadata can take seconds against a slow site; this route never
// calls it), so the popup can populate "Suggested for you" within a
// couple hundred milliseconds of opening. Deterministic only, reusing the
// exact same rules regular server-side enrichment uses — no new judgment
// logic, no AI.
//
// Two signals, combined:
//  1. Personal history (suggest_resource_organization RPC) — how the
//     CALLER has previously organized resources from this same domain.
//     This is the stronger, more specific signal once it exists.
//  2. Content-based (suggestCategoryForResource/suggestTags/
//     suggestUsefulFor from src/lib/enrichment.ts) — the same
//     domain/title keyword rules used by every other enrichment path,
//     as a fallback for a domain the user has never saved from before.
export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return withCors(request, unauthorized);

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : null;
  const title = typeof body?.title === "string" ? body.title : "";
  if (!url) return withCors(request, NextResponse.json({ error: "url is required" }, { status: 400 }));

  const normalized = normalizeUrl(url);
  if (!normalized) return withCors(request, NextResponse.json({ error: "Invalid URL" }, { status: 400 }));
  const domain = getDomain(normalized);

  try {
    const [{ data: personal, error: rpcError }, categories] = await Promise.all([
      supabase.rpc("suggest_resource_organization", { p_domain: domain }),
      listCategories(supabase, user.id),
    ]);
    if (rpcError) throw new Error(rpcError.message);

    const personalCategory = personal?.category as { id: string; name: string; count: number } | null;
    const personalStack = personal?.stack as { id: string; name: string; icon: string; count: number } | null;
    const personalTags = (personal?.tags ?? []) as { id: string; name: string; count: number }[];
    const domainTotal: number = personal?.domainTotal ?? 0;

    const reasons: string[] = [];

    // Category: prefer the personal-history match (it names a category
    // this exact user already uses for this exact domain) over the
    // generic content-based rules, which only ever produce medium/low
    // confidence without folder context (the extension has no bookmark
    // folder — that signal only exists for bulk/Stack Studio imports).
    let categoryId: string | null = null;
    let categoryConfidence: "high" | "medium" | "low" | "none" = "none";
    if (personalCategory && personalCategory.count >= 2) {
      categoryId = personalCategory.id;
      categoryConfidence = "high";
      reasons.push(`${personalCategory.count} resources from ${domain} are in ${personalCategory.name}`);
    } else {
      const contentSuggestion = suggestCategoryForResource({ title, domain, folder: null }, categories);
      if (contentSuggestion) {
        categoryId = contentSuggestion.categoryId;
        categoryConfidence = contentSuggestion.confidence;
        const name = categories.find((c) => c.id === contentSuggestion.categoryId)?.name;
        if (contentSuggestion.confidence === "medium") reasons.push(`Title mentions "${name}"`);
        else reasons.push(`${domain} is commonly filed under ${name}`);
      }
    }

    const stack = personalStack && personalStack.count >= 2 ? personalStack : null;
    if (stack) reasons.push(`${stack.count} resources from ${domain} are in ${stack.name}`);

    // Tags: union of personal-history tags (real usage, strongest signal)
    // and content-based keyword tags — deduped, capped small per the
    // spec's own "prefer a small set of relevant tags."
    const contentTags = suggestTags({ title, domain });
    const tagNames = Array.from(
      new Set([...personalTags.filter((t) => t.count >= 2).map((t) => t.name), ...contentTags])
    ).slice(0, 5);
    if (personalTags.some((t) => t.count >= 2)) reasons.push(`Frequently tagged this way on ${domain}`);

    const usefulFor = suggestUsefulFor({ title });

    return withCors(
      request,
      NextResponse.json({
        domain,
        domainTotal,
        confident: domainTotal >= 2,
        category: categoryId ? { id: categoryId, confidence: categoryConfidence } : null,
        stack: stack ? { id: stack.id, name: stack.name, icon: stack.icon } : null,
        tags: tagNames,
        usefulFor: usefulFor?.value ?? null,
        reasons,
      })
    );
  } catch (e) {
    // Suggestions are a nice-to-have, never a blocker — the popup falls
    // back to plain manual selection on any failure here.
    return withCors(
      request,
      NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't compute suggestions." }, { status: 500 })
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}
