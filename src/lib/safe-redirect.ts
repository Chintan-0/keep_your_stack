// A same-origin relative path only — used to sanitize a caller-supplied
// "next" query param before redirecting to it. Without this, a crafted
// link like ?next=https://evil.example or ?next=//evil.example could
// bounce a user off this trusted domain right after they authenticate
// (open redirect). See src/app/auth/callback/route.ts.
export function safeNext(rawNext: string | null | undefined): string {
  if (rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.includes("://")) {
    return rawNext;
  }
  return "/";
}
