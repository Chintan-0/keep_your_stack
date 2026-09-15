import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/data/admin-auth";

// Cheap "am I an admin" check purely for nav-link visibility (§20) — NOT a
// security boundary. /admin and every /api/admin/* route independently
// re-run the exact same requireAdmin() check regardless of what this
// returns; a forged/replayed {isAdmin:true} response here grants nothing.
export async function GET(request: NextRequest) {
  const { forbidden } = await requireAdmin(request);
  return NextResponse.json({ isAdmin: !forbidden });
}
