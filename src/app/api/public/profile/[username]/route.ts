import { NextRequest, NextResponse } from "next/server";
import { getPublicProfile, getPublicStacksForUser } from "@/lib/data/public-stacks";
import { getServiceRoleClient } from "@/lib/data/service-role";
import { trackEvent } from "@/lib/data/analytics";

// Public, unauthenticated by design (Part D — viewing never requires
// login). Returns only a username/display name and PUBLIC stacks with
// their resource counts — never email, never private/unlisted stacks,
// never internal ids beyond what a stack's own slug/id already needs to
// render a link.
export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  try {
    const profile = await getPublicProfile(username);
    if (!profile) return NextResponse.json({ error: "That username doesn't exist." }, { status: 404 });

    // Re-look-up the id for the stacks query — getPublicProfile
    // deliberately doesn't return it (nothing external needs a raw user
    // id), so this one extra internal lookup keeps that contract clean.
    const service = getServiceRoleClient();
    const { data: row } = await service.from("profiles").select("id").ilike("username", username).maybeSingle();
    const stacks = row ? await getPublicStacksForUser(row.id) : [];

    void trackEvent({ eventType: "public_profile_view", path: `/@${profile.username}` });
    return NextResponse.json({ profile, stacks });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load this profile." }, { status: 500 });
  }
}
