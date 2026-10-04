import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { saveDrop } from "@/lib/data/resource-drops";
import { NotFoundError } from "@/lib/data/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;
  try {
    const result = await saveDrop(supabase, user.id, id);
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: "Couldn't update this drop." }, { status: 500 });
  }
}
