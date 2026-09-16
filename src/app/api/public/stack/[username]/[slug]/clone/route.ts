import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { getPublicStackBySlug } from "@/lib/data/public-stacks";
import { cloneResourcesToUser } from "@/lib/data/stack-clone";
import { trackEvent } from "@/lib/data/analytics";

// Requires auth (Part F: viewing never requires login, saving does).
// Re-derives the resource list from the SAME server-side public-stack
// lookup used to render the page — an optional `resourceIds` in the body
// filters to a subset (the single-resource "[Save]" button), but the
// actual resource data always comes from this trusted lookup, never from
// anything the client sent. That's what makes single-resource save safe:
// a resource can only be cloned if it's genuinely part of THIS public
// stack, not because a client claimed some arbitrary resource id belongs
// to it.
export async function POST(request: NextRequest, { params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const requestedIds: string[] | undefined = Array.isArray(body?.resourceIds) ? body.resourceIds : undefined;

  try {
    const stack = await getPublicStackBySlug(username, slug);
    if (!stack) return NextResponse.json({ error: "This stack is private or doesn't exist." }, { status: 404 });

    const candidates = requestedIds ? stack.resources.filter((r) => requestedIds.includes(r.id)) : stack.resources;
    void trackEvent({ eventType: "stack_clone_started", userId: user.id, metadata: { stackId: stack.id, count: candidates.length } });

    const result = await cloneResourcesToUser(supabase, user.id, candidates);
    void trackEvent({
      eventType: result.failed > 0 && result.added === 0 ? "stack_clone_failed" : "stack_clone_completed",
      userId: user.id,
      metadata: { stackId: stack.id, ...result },
    });
    return NextResponse.json(result);
  } catch (e) {
    void trackEvent({ eventType: "stack_clone_failed", userId: user.id });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save this stack." }, { status: 500 });
  }
}
