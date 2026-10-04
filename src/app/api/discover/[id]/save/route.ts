import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { saveDiscoverShare } from "@/lib/data/discover";
import { NotFoundError } from "@/lib/data/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;
  try {
    const result = await saveDiscoverShare(supabase, user.id, id);
    return NextResponse.json({ resource: result.resource, duplicate: result.duplicate });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: "Couldn't save this resource." }, { status: 500 });
  }
}
