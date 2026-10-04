import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listDrops } from "@/lib/data/resource-drops";

export async function GET(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json(await listDrops(supabase, user.id));
}
