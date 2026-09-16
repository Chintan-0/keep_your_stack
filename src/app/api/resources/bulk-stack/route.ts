import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { bulkAddToStack } from "@/lib/data/resources";

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.resourceIds) || body.resourceIds.length === 0 || typeof body.stackId !== "string") {
    return NextResponse.json({ error: "resourceIds and stackId are required." }, { status: 400 });
  }

  try {
    const added = await bulkAddToStack(
      supabase,
      user.id,
      body.resourceIds.filter((id: unknown) => typeof id === "string"),
      body.stackId
    );
    return NextResponse.json({ added });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't add those resources to the stack." }, { status: 400 });
  }
}
