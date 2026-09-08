import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listResources } from "@/lib/data/resources";
import { checkResourceLink, listLinkChecks } from "@/lib/data/link-check";
import { runWithConcurrency } from "@/lib/concurrency";

// Checks are always user-triggered (this route, or the single-resource
// check-link route) — there's no background scheduler in this
// architecture, so "priority" just means: pick a sensible batch when the
// caller doesn't name specific resources, rather than hammering the
// user's entire library every time.
const MAX_BATCH = 15;
const CONCURRENCY = 4;

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const requestedIds: string[] | undefined = Array.isArray(body?.resourceIds) ? body.resourceIds : undefined;

  let targetIds: string[];
  if (requestedIds && requestedIds.length > 0) {
    targetIds = requestedIds.slice(0, MAX_BATCH);
  } else {
    const [resources, existingChecks] = await Promise.all([
      listResources(supabase, user.id),
      listLinkChecks(supabase, user.id),
    ]);
    const active = resources.filter((r) => !r.isArchived);
    // Never-checked first, then oldest-checked — never re-hammer a
    // recently-confirmed-healthy link ahead of one that's never been
    // looked at.
    const withPriority = active.map((r) => {
      const checked = existingChecks.get(r.id)?.checkedAt;
      return { id: r.id, priority: checked ? new Date(checked).getTime() : -1 };
    });
    withPriority.sort((a, b) => a.priority - b.priority);
    targetIds = withPriority.slice(0, MAX_BATCH).map((x) => x.id);
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ checked: 0, results: {} });
  }

  const results: Record<string, string> = {};
  const resources = await listResources(supabase, user.id);
  const byId = new Map(resources.map((r) => [r.id, r]));

  await runWithConcurrency(targetIds, CONCURRENCY, async (id) => {
    const resource = byId.get(id);
    if (!resource) return;
    try {
      const result = await checkResourceLink(supabase, user.id, id, resource.url);
      results[id] = result.status;
    } catch {
      results[id] = "unknown";
    }
  });

  return NextResponse.json({ checked: targetIds.length, results });
}
