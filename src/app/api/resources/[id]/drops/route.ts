import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { sendResourceDrop, DropError, DROP_ACCEPTED_MESSAGE } from "@/lib/data/resource-drops";
import { NotFoundError } from "@/lib/data/errors";
import { parseDropRequest } from "@/lib/resource-drop-validation";
import { MAX_SHARE_MESSAGE_LENGTH } from "@/lib/resource-share-validation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const parsed = parseDropRequest(await request.json().catch(() => null), MAX_SHARE_MESSAGE_LENGTH);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await sendResourceDrop(supabase, user.id, id, parsed);
    return NextResponse.json({ message: DROP_ACCEPTED_MESSAGE }, { status: 202 });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof DropError) {
      return NextResponse.json({ error: e.message }, { status: e instanceof DropError ? e.status : 404 });
    }
    return NextResponse.json({ error: "Couldn't send this drop." }, { status: 500 });
  }
}
