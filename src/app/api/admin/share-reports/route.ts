import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/data/admin-auth";
import { listOpenReports, listHiddenShares } from "@/lib/data/discover";

export async function GET(request: NextRequest) {
  const { forbidden } = await requireAdmin(request);
  if (forbidden) return forbidden;
  const [reports, hiddenShares] = await Promise.all([listOpenReports(), listHiddenShares()]);
  return NextResponse.json({ reports, hiddenShares });
}
