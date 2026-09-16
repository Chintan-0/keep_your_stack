import { NextRequest, NextResponse } from "next/server";
import { getPublicStackBySlug } from "@/lib/data/public-stacks";
import { trackEvent } from "@/lib/data/analytics";

export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await params;
  try {
    const stack = await getPublicStackBySlug(username, slug);
    if (!stack) return NextResponse.json({ error: "This stack is private or doesn't exist." }, { status: 404 });

    void trackEvent({ eventType: "public_stack_view", path: `/@${username}/${slug}`, metadata: { stackId: stack.id } });
    return NextResponse.json({ stack });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load this stack." }, { status: 500 });
  }
}
