import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listCategories, createCategory } from "@/lib/data/categories";

export async function GET(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  try {
    const categories = await listCategories(supabase, user.id);
    return NextResponse.json({ categories });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load categories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string") {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  try {
    const category = await createCategory(supabase, user.id, {
      name: body.name,
      parentId: body.parentId ?? null,
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't create the category." }, { status: 400 });
  }
}
