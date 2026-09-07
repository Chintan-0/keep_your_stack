import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { renameCategory, moveCategory, reorderCategory, deleteCategory } from "@/lib/data/categories";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  try {
    let category;
    if (typeof body.name === "string") {
      category = await renameCategory(supabase, user.id, id, body.name);
    }
    if (body.parentId !== undefined) {
      category = await moveCategory(supabase, user.id, id, body.parentId);
    }
    if (body.reorder === "up" || body.reorder === "down") {
      await reorderCategory(supabase, user.id, id, body.reorder);
    }
    return NextResponse.json({ category: category ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't update the category." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const reassignParam = request.nextUrl.searchParams.get("reassignTo");
  const reassignTo = reassignParam && reassignParam !== "none" ? reassignParam : null;

  try {
    const result = await deleteCategory(supabase, user.id, id, reassignTo);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't delete the category." }, { status: 400 });
  }
}
