import { ImageResponse } from "next/og";
import { getPublicStackBySlug } from "@/lib/data/public-stacks";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// A real per-Stack social preview (§14/§15) — name, creator, and resource
// count pulled from the same server-trusted lookup the page itself uses
// (never client-supplied), so a shared link always reflects the actual
// Stack. Only ever renders for a Stack this lookup already resolves as
// public/unlisted (getPublicStackBySlug's own visibility check) — nothing
// private is ever composed into an image.
export default async function Image({ params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await params;
  const stack = await getPublicStackBySlug(username, slug).catch(() => null);

  const name = stack?.name ?? "A shared Stack";
  const count = stack?.resources.length ?? 0;
  const owner = stack?.ownerName ? `@${username}` : `@${username}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0c11",
          fontFamily: "system-ui, sans-serif",
          padding: 64,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "linear-gradient(135deg, #6f7bff, #22d3ee)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 700,
              color: "white",
            }}
          >
            K
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#a3a9b8", display: "flex" }}>KeepYourStack</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 56, fontWeight: 700, color: "#e8eaf0", display: "flex" }}>{name}</div>
          <div style={{ fontSize: 24, color: "#a3a9b8", display: "flex" }}>
            {owner} · {count} resource{count === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
