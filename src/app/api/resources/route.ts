import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listResources, createResource } from "@/lib/data/resources";
import { normalizeUrl } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const archived = request.nextUrl.searchParams.get("archived") === "true";
  try {
    const resources = await listResources(supabase, user.id, { archived });
    return NextResponse.json({ resources });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load resources" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.url !== "string") {
    return NextResponse.json({ error: "A URL is required." }, { status: 400 });
  }
  if (!normalizeUrl(body.url)) {
    return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }

  try {
    const result = await createResource(
      supabase,
      user.id,
      {
        url: body.url,
        title: body.title,
        description: body.description,
        categoryId: body.categoryId ?? null,
        useCases: Array.isArray(body.useCases) ? body.useCases : [],
        notes: body.notes,
        tagNames: Array.isArray(body.tagNames) ? body.tagNames : [],
        stackIds: Array.isArray(body.stackIds) ? body.stackIds : [],
        pricing: body.pricing ?? null,
        platform: Array.isArray(body.platform) ? body.platform : null,
        faviconUrl: body.faviconUrl ?? null,
        imageUrl: body.imageUrl ?? null,
      },
      { force: body.force === true }
    );
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save your resource. Try again." }, { status: 500 });
  }
}
