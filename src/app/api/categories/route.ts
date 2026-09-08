import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listCategories, createCategory } from "@/lib/data/categories";
import { corsPreflight, withCors } from "@/lib/cors";

// GET is also called by the Chrome extension's popup/options page (to
// offer real category selection instead of a second taxonomy) — see
// extension/src/lib/api.ts's listCategories(). CORS is only needed on GET
// for that; category creation stays web-app-only for now.
export async function GET(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return withCors(request, unauthorized);

  try {
    const categories = await listCategories(supabase, user.id);
    return withCors(request, NextResponse.json({ categories }));
  } catch (e) {
    return withCors(
      request,
      NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load categories" }, { status: 500 })
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
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
