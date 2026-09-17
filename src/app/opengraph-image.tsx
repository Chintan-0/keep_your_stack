import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The homepage's default social-preview image (§14) — a plain branded
// card, not a screenshot. Next.js serves this automatically for any
// `opengraph-image`/`twitter-image` request under this route segment; the
// homepage's own metadata (src/app/page.tsx) doesn't need to reference it
// explicitly.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "#0a0c11",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 36 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "linear-gradient(135deg, #6f7bff, #22d3ee)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 700,
              color: "white",
            }}
          >
            K
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#e8eaf0", display: "flex" }}>KeepYourStack</div>
        </div>
        <div style={{ fontSize: 30, color: "#e8eaf0", fontWeight: 600, display: "flex", textAlign: "center" }}>
          Your browser is messy. Your stack shouldn&apos;t be.
        </div>
        <div style={{ fontSize: 20, color: "#a3a9b8", marginTop: 18, display: "flex", textAlign: "center" }}>
          A personal toolbox for building on the internet.
        </div>
      </div>
    ),
    { ...size }
  );
}
