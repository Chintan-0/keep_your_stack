import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { addResourceToStack, removeResourceFromStack } from "@/lib/data/resources";

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body?.resourceId || !body?.stackId) {
    return NextResponse.json({ error: "resourceId and stackId are required" }, { status: 400 });
  }

  try {
    await addResourceToStack(supabase, user.id, body.resourceId, body.stackId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't add to stack." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const resourceId = request.nextUrl.searchParams.get("resourceId");
  const stackId = request.nextUrl.searchParams.get("stackId");
  if (!resourceId || !stackId) {
    return NextResponse.json({ error: "resourceId and stackId are required" }, { status: 400 });
  }

  try {
    await removeResourceFromStack(supabase, user.id, resourceId, stackId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't remove from stack." }, { status: 500 });
  }
}
