import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listRememberedMappings, rememberMapping, forgetMapping } from "@/lib/data/import-mappings";

export async function GET() {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;
  try {
    const mappings = await listRememberedMappings(supabase, user.id);
    return NextResponse.json({ mappings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load remembered mappings." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.folderPath !== "string" || typeof body.categoryId !== "string") {
    return NextResponse.json({ error: "A folder path and category are required." }, { status: 400 });
  }

  try {
    const mapping = await rememberMapping(supabase, user.id, body.folderPath, body.categoryId);
    return NextResponse.json({ mapping });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't remember this mapping." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const folderPath = request.nextUrl.searchParams.get("folderPath");
  if (!folderPath) return NextResponse.json({ error: "A folder path is required." }, { status: 400 });

  try {
    await forgetMapping(supabase, user.id, folderPath);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't remove this mapping." }, { status: 500 });
  }
}
