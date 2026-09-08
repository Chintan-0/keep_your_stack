import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { getResource } from "@/lib/data/resources";
import { checkResourceLink } from "@/lib/data/link-check";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const resource = await getResource(supabase, user.id, id);
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await checkResourceLink(supabase, user.id, id, resource.url);
    return NextResponse.json({ linkHealth: result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't check this link." }, { status: 500 });
  }
}
