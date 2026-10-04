import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { reportDiscoverShare } from "@/lib/data/discover";
import { NotFoundError } from "@/lib/data/errors";
import { DropError } from "@/lib/data/resource-drops";

const MAX_REASON_LENGTH = 500;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json({ error: `Add a reason (up to ${MAX_REASON_LENGTH} characters).` }, { status: 400 });
  }

  try {
    const outcome = await reportDiscoverShare(supabase, user.id, id, reason);
    return NextResponse.json({ outcome });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof DropError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Couldn't send this report." }, { status: 500 });
  }
}
