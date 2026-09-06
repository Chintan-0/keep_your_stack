import { NextRequest, NextResponse } from "next/server";

// A small set of API routes are also called by the KeepYourStack Chrome
// extension (chrome-extension://<id>, a different origin from the web app),
// using an Authorization: Bearer token instead of cookies — see
// src/lib/data/auth.ts. Cross-origin fetches need CORS headers to let the
// extension read the response; we scope this narrowly to real extension
// origins rather than reflecting every Origin.
//
// Chrome extension ids are always 32 lowercase letters a-p. This can't be
// spoofed by an arbitrary website: the `Origin` header for extension pages
// (popup/background) is set by Chrome itself to `chrome-extension://<id>`,
// not something page script can override.
const EXTENSION_ORIGIN_RE = /^chrome-extension:\/\/[a-p]{32}$/;

export function extensionCorsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin || !EXTENSION_ORIGIN_RE.test(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

export function withCors(request: NextRequest, response: NextResponse): NextResponse {
  const headers = extensionCorsHeaders(request);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value as string);
  }
  return response;
}

/** Shared OPTIONS preflight handler for routes the extension calls. */
export function corsPreflight(request: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: extensionCorsHeaders(request) });
}
