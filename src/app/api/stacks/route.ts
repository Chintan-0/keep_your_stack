import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listStacks, createStack } from "@/lib/data/stacks";

export async function GET() {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    const stacks = await listStacks(supabase, user.id);
    return NextResponse.json({ stacks });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load stacks" }, { status: 500 });
  }
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
