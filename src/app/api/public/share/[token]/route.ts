import { NextRequest, NextResponse } from "next/server";
import { getStackByShareToken } from "@/lib/data/public-stacks";
import { trackEvent } from "@/lib/data/analytics";

// Unlisted access — Part H. The token in the URL IS the credential; no
// username/slug/auth is needed. getStackByShareToken() only ever returns
// a stack for a currently-valid (non-revoked) token, and re-checks
// visibility isn't 'private' as defense in depth even though revoking the
// link row already handles the "changed back to private" case.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const stack = await getStackByShareToken(token);
    if (!stack) return NextResponse.json({ error: "This share link is invalid or has been revoked." }, { status: 404 });

    void trackEvent({ eventType: "public_stack_view", path: `/share/${token}`, metadata: { stackId: stack.id, via: "unlisted" } });
    return NextResponse.json({ stack });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load this stack." }, { status: 500 });
  }
}
