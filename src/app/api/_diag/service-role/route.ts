import { NextResponse } from "next/server";

// TEMPORARY diagnostic route — checks whether SUPABASE_SERVICE_ROLE_KEY is
// accepted by the production Supabase project. Never returns the key
// itself, any part of it, or any other secret — only a boolean/status
// code. Deleted immediately after use; not meant to remain in the
// codebase.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ present: false });
  }
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return NextResponse.json({ present: true, accepted: res.ok, status: res.status });
  } catch {
    return NextResponse.json({ present: true, accepted: false, status: null });
  }
}
