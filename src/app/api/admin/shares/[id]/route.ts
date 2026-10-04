import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/data/admin-auth";
import { hideShare, restoreShare } from "@/lib/data/discover";
import { NotFoundError } from "@/lib/data/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { forbidden } = await requireAdmin(request);
  if (forbidden) return forbidden;

  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action !== "hide" && body?.action !== "restore") {
    return NextResponse.json({ error: "Action must be hide or restore." }, { status: 400 });
  }

  try {
    if (body.action === "hide") await hideShare(id);
    else await restoreShare(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: "Couldn't update this share." }, { status: 500 });
  }
}
