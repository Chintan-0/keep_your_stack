import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { getStackByShareToken } from "@/lib/data/public-stacks";
import { cloneResourcesToUser } from "@/lib/data/stack-clone";
import { trackEvent } from "@/lib/data/analytics";

// Same trusted-lookup pattern as the public-stack clone route — resource
// data always comes from getStackByShareToken() (which itself re-validates
// the token), never from the request body.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const requestedIds: string[] | undefined = Array.isArray(body?.resourceIds) ? body.resourceIds : undefined;

  try {
    const stack = await getStackByShareToken(token);
    if (!stack) return NextResponse.json({ error: "This share link is invalid or has been revoked." }, { status: 404 });

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
