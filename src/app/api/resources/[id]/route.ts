import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { getResource, updateResource, deleteResource, type ResourcePatch } from "@/lib/data/resources";
import { corsPreflight, withCors } from "@/lib/cors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return withCors(request, unauthorized);

  const resource = await getResource(supabase, user.id, id);
  if (!resource) return withCors(request, NextResponse.json({ error: "Not found" }, { status: 404 }));
  return withCors(request, NextResponse.json({ resource }));
}

// Fields a client is actually allowed to set. Deliberately excludes
// descriptionSource/usefulForSource/enrichmentStatus/enrichmentAttempts*
// — those are bookkeeping only src/lib/data/enrichment.ts's server-side
// enrichResource() sets; updateResource() itself defaults description/
// useCases edits to "user" whenever a caller doesn't specify otherwise,
// which is exactly right for this route (a human editing their resource).
const EDITABLE_FIELDS = [
  "url", "title", "description", "useCases", "categoryId", "notes",
  "isFavorite", "isArchived", "pricing", "platform", "tagNames", "stackIds",
  "needsReviewDismissed",
] as const;

function sanitizePatch(body: Record<string, unknown>): ResourcePatch {
  const patch: ResourcePatch = {};
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) (patch as Record<string, unknown>)[key] = body[key];
  }
  return patch;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return withCors(request, unauthorized);

  const body = await request.json().catch(() => null);
  if (!body) return withCors(request, NextResponse.json({ error: "Invalid request body" }, { status: 400 }));

  try {
    const resource = await updateResource(supabase, user.id, id, sanitizePatch(body));
    return withCors(request, NextResponse.json({ resource }));
  } catch (e) {
    return withCors(
      request,
      NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save your changes. Try again." }, { status: 500 })
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return withCors(request, unauthorized);

  try {
    await deleteResource(supabase, user.id, id);
    return withCors(request, NextResponse.json({ ok: true }));
  } catch (e) {
    return withCors(
      request,
      NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't delete this resource." }, { status: 500 })
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}
