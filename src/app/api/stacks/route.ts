import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listStacks, createStack } from "@/lib/data/stacks";
import { corsPreflight, withCors } from "@/lib/cors";

// GET is also called by the Chrome extension (optional Stack dropdown in
// the popup), hence the Bearer-token support + CORS below. POST (creating
// a stack) stays web-app-only for now — the extension only lets you pick
// an existing stack, not create one, to keep its save form lightweight.
export async function GET(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return withCors(request, unauthorized);

  try {
    const stacks = await listStacks(supabase, user.id);
    return withCors(request, NextResponse.json({ stacks }));
  } catch (e) {
    return withCors(
      request,
      NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load stacks" }, { status: 500 })
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "Give your stack a name first." }, { status: 400 });
  }

  try {
    const stack = await createStack(supabase, user.id, {
      name: body.name,
      description: body.description ?? "",
      icon: body.icon ?? "📦",
      color: body.color ?? "accent",
    });
    return NextResponse.json({ stack }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't create the stack." }, { status: 500 });
  }
}
