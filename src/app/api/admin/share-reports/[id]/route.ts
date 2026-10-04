import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/data/admin-auth";
import { dismissReport } from "@/lib/data/discover";
import { NotFoundError } from "@/lib/data/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { forbidden } = await requireAdmin(request);
  if (forbidden) return forbidden;

  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action !== "dismiss") {
    return NextResponse.json({ error: "Action must be dismiss." }, { status: 400 });
  }

  try {
    await dismissReport(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: "Couldn't dismiss this report." }, { status: 500 });
  }
}
