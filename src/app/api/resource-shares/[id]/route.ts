import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { revokeResourceShare } from "@/lib/data/resource-shares";
import { NotFoundError } from "@/lib/data/errors";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    await revokeResourceShare(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: "Couldn't revoke the share link." }, { status: 500 });
  }
}
