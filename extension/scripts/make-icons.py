"""Generates the extension's toolbar icons (16/48/128px) from KeepYourStack's
own brand mark — the accent-to-violet rounded square with a "K" glyph used
in src/app/(app)/extension/page.tsx's popup mockup. Run once with:
    python extension/scripts/make-icons.py
Regenerate only if the brand mark changes; the PNGs are committed so
`npm run build:extension` doesn't need Python as a build dependency.
"""
from PIL import Image, ImageDraw, ImageFont
import os

ACCENT = (111, 123, 255)
VIOLET = (167, 139, 250)
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    radius = size * 0.22
    for y in range(size):
        t = y / max(size - 1, 1)
        color = lerp(ACCENT, VIOLET, t)
        for x in range(size):
            px[x, y] = (*color, 255)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    img.putalpha(mask)

    draw = ImageDraw.Draw(img)
    font_size = int(size * 0.6)
    try:
        font = ImageFont.truetype("arialbd.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()
    text = "K"
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), text, font=font, fill=(255, 255, 255, 255))
    return img


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    for s in (16, 48, 128):
        make_icon(s).save(os.path.join(OUT_DIR, f"icon{s}.png"))
    print("Wrote icon16.png, icon48.png, icon128.png to", OUT_DIR)
