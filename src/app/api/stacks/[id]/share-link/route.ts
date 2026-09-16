import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { regenerateShareLink, NotFoundError } from "@/lib/data/stack-sharing";
import { trackEvent } from "@/lib/data/analytics";

// Regenerates an unlisted stack's share token — Part H's "allow the owner
// to regenerate/revoke the share link... the previous token must stop
// working." regenerateShareLink() revokes the old link row and mints a
// fresh one in the same operation.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    const token = await regenerateShareLink(supabase, user.id, id);
    void trackEvent({ eventType: "stack_shared", userId: user.id, metadata: { action: "regenerate" } });
    return NextResponse.json({ shareUrl: `/share/${token}` });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't regenerate the share link." }, { status: 500 });
  }
}
