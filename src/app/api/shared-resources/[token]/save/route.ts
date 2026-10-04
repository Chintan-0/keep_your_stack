import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { saveSharedResource } from "@/lib/data/resource-shares";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    const result = await saveSharedResource(supabase, user.id, token);
    if (!result) return NextResponse.json({ error: "This link is no longer available." }, { status: 404 });
    return NextResponse.json({ resource: result.resource, duplicate: result.duplicate });
  } catch {
    return NextResponse.json({ error: "Couldn't save this resource." }, { status: 500 });
  }
}
