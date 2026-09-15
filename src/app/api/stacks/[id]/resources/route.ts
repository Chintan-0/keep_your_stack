import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listResourcesForStack } from "@/lib/data/resources";
import { corsPreflight, withCors } from "@/lib/cors";

// Every resource in this stack, regardless of the client's general
// resources pagination — see listResourcesForStack's own comment. Stack
// Detail uses this to make sure older members aren't missing just because
// they fell past whatever page the store has cached.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return withCors(request, unauthorized);

  try {
    const resources = await listResourcesForStack(supabase, user.id, id);
    return withCors(request, NextResponse.json({ resources }));
  } catch (e) {
    return withCors(
      request,
      NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load this stack's resources." }, { status: 500 })
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}
