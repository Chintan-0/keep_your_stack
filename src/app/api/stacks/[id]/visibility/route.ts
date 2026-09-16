import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { setStackVisibility, NotFoundError } from "@/lib/data/stack-sharing";
import { trackEvent } from "@/lib/data/analytics";

const VALID = new Set(["private", "unlisted", "public"]);

// Dedicated endpoint rather than folding this into the generic stacks
// PATCH — changing visibility has real side effects (minting/revoking a
// share token, assigning a slug the first time a stack is ever shared)
// that don't belong in the plain name/description/icon/color updater.
// setStackVisibility() itself re-verifies ownership (via requireUser +
// an owner-scoped query, not a client-supplied flag) before touching
// anything.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const visibility = body?.visibility;
  if (typeof visibility !== "string" || !VALID.has(visibility)) {
    return NextResponse.json({ error: "visibility must be one of private, unlisted, public." }, { status: 400 });
  }

  try {
    const result = await setStackVisibility(supabase, user.id, id, visibility as "private" | "unlisted" | "public");
    void trackEvent({ eventType: "stack_visibility_changed", userId: user.id, metadata: { visibility } });
    return NextResponse.json({
      stack: result.stack,
      shareUrl: result.shareToken ? `/share/${result.shareToken}` : null,
    });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't change visibility." }, { status: 500 });
  }
}
