import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";

// Per-stack member counts over the caller's active resources, computed in the
// database so they don't depend on which resource pages are loaded.
export async function GET(request: NextRequest) {
  const { supabase, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const { data, error } = await supabase.rpc("stack_resource_counts");
  if (error) return NextResponse.json({ error: "Couldn't load stack counts." }, { status: 500 });

  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.stack_id] = Number(row.member_count);
  return NextResponse.json({ counts });
}
