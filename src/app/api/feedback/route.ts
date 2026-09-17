import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { submitFeedback, isFeedbackCategory } from "@/lib/data/feedback";
import { trackEvent, classifyUserAgent, logServerError } from "@/lib/data/analytics";
import packageJson from "../../../../package.json";

const MAX_MESSAGE_LENGTH = 2000;

// Requires auth — a signed-in user submitting feedback about their own
// experience is the only case this phase's lightweight mechanism covers
// (§23). Inserted via the normal RLS-scoped client (the "insert own"
// policy is exactly this case) — no service-role needed to write. No read
// path exists for a regular user (see the migration's RLS policy); an
// admin reads feedback via the service-role client only.
export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const category = body?.category;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const route = typeof body?.route === "string" ? body.route.slice(0, 200) : undefined;

  if (!isFeedbackCategory(category)) {
    return NextResponse.json({ error: "Choose a feedback category." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Add a few words so we know what you mean." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Keep it under ${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });
  }

  try {
    const { deviceType, browser, os } = classifyUserAgent(request.headers.get("user-agent"));
    await submitFeedback(supabase, user.id, {
      category,
      message,
      context: { route, browser, os, deviceType, appVersion: packageJson.version },
    });
    void trackEvent({ eventType: "feedback_submitted", userId: user.id, metadata: { label: category } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    void logServerError("POST /api/feedback", e, user.id);
    return NextResponse.json({ error: "Couldn't send your feedback. Try again." }, { status: 500 });
  }
}
