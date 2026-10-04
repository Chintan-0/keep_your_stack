import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { createResourceShare, listActiveResourceShares } from "@/lib/data/resource-shares";
import { NotFoundError } from "@/lib/data/errors";
import { parseShareRequest } from "@/lib/resource-share-validation";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;
  const shares = await listActiveResourceShares(supabase, user.id, id);
  return NextResponse.json({ shares });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = parseShareRequest(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const share = await createResourceShare(supabase, user.id, id, parsed);
    return NextResponse.json({ share }, { status: 201 });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: "Couldn't create the share link." }, { status: 500 });
  }
}
