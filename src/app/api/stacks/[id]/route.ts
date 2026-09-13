import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { updateStack, deleteStack, NotFoundError } from "@/lib/data/stacks";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const patch = await request.json().catch(() => null);
  if (!patch) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  try {
    const stack = await updateStack(supabase, user.id, id, patch);
    return NextResponse.json({ stack });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't update the stack." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    await deleteStack(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't delete the stack." }, { status: 500 });
  }
}
