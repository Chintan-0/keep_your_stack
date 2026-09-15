import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listResources, listResourcesPage, createResource, findResourceByUrl } from "@/lib/data/resources";
import { normalizeUrl } from "@/lib/utils";
import { corsPreflight, withCors } from "@/lib/cors";
import { trackEvent } from "@/lib/data/analytics";

export async function GET(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return withCors(request, unauthorized);

  // ?url= is a lightweight duplicate check (used by the Chrome extension's
  // popup so it doesn't have to pull the whole library just to ask "have I
  // already saved this page?") — same normalization + lookup the backend
  // already uses for createResource's own duplicate check, just exposed
  // read-only here.
  const url = request.nextUrl.searchParams.get("url");
  if (url) {
    try {
      const existing = await findResourceByUrl(supabase, user.id, url);
      return withCors(request, NextResponse.json({ resource: existing }));
    } catch (e) {
      return withCors(
        request,
        NextResponse.json({ error: e instanceof Error ? e.message : "Lookup failed" }, { status: 500 })
      );
    }
  }

  // ?limit= (optionally with ?offset=) switches to the paginated response
  // shape ({ resources, total, hasMore }) instead of the full-list one —
  // opt-in so existing callers (the extension's bearer-token flow, anything
  // else expecting { resources: Resource[] }) keep working unchanged.
  const limitParam = request.nextUrl.searchParams.get("limit");
  if (limitParam !== null) {
    const limit = Number(limitParam);
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
    if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
      return withCors(request, NextResponse.json({ error: "Invalid limit/offset" }, { status: 400 }));
    }
    try {
      const page = await listResourcesPage(supabase, user.id, { limit, offset });
      return withCors(request, NextResponse.json(page));
    } catch (e) {
      return withCors(
        request,
        NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load resources" }, { status: 500 })
      );
    }
  }

  try {
    const resources = await listResources(supabase, user.id);
    return withCors(request, NextResponse.json({ resources }));
  } catch (e) {
    return withCors(
      request,
      NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load resources" }, { status: 500 })
    );
  }
}

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return withCors(request, unauthorized);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.url !== "string") {
    return withCors(request, NextResponse.json({ error: "A URL is required." }, { status: 400 }));
  }
  if (!normalizeUrl(body.url)) {
    return withCors(request, NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 }));
  }

  try {
    const result = await createResource(
      supabase,
      user.id,
      {
        url: body.url,
        title: body.title,
        description: body.description,
        categoryId: body.categoryId ?? null,
        useCases: Array.isArray(body.useCases) ? body.useCases : [],
        notes: body.notes,
        tagNames: Array.isArray(body.tagNames) ? body.tagNames : [],
        stackIds: Array.isArray(body.stackIds) ? body.stackIds : [],
        pricing: body.pricing ?? null,
        platform: Array.isArray(body.platform) ? body.platform : null,
        faviconUrl: body.faviconUrl ?? null,
        imageUrl: body.imageUrl ?? null,
        importSource: body.importSource ?? null,
        importFolder: body.importFolder ?? null,
      },
      { force: body.force === true }
    );

    // The extension is the only caller that ever sends a bearer token here
    // (the web app is cookie-only) — a reliable, no-guesswork signal for
    // the admin dashboard's "extension vs web saves" breakdown, not an
    // inferred one.
    const isExtension = !!request.headers.get("authorization");
    if (result.duplicate) {
      void trackEvent({ eventType: "duplicate_save_prevented", userId: user.id, metadata: { extension: isExtension } });
    } else {
      void trackEvent({ eventType: "resource_created", userId: user.id, metadata: { extension: isExtension } });
      if (isExtension) void trackEvent({ eventType: "extension_save_success", userId: user.id });
    }

    return withCors(request, NextResponse.json(result, { status: result.duplicate ? 200 : 201 }));
  } catch (e) {
    if (!!request.headers.get("authorization")) {
      void trackEvent({ eventType: "extension_save_failure", userId: user.id });
    }
    return withCors(
      request,
      NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save your resource. Try again." }, { status: 500 })
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}
