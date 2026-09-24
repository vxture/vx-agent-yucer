#!/usr/bin/env python3
"""Generate the round gradient "coin" backgrounds for the customer card's
badge area (owner, 2026-09-24: the deals and health badges get PNG
backgrounds, all three badges read as round, with gradients - matching the
glossy tier medals in public/assets/icons/tier-*.png).

Pure PIL, no numpy. Drawn at 4x and downsampled for clean edges. Output:
public/assets/icons/coin-deals.png, coin-tier-{gold,silver,bronze}.png (pale,
the medal sits on them) and coin-health-{00..10}.png (one per 10 points of the
health score, red through amber to green), all 184x184 (46px @4x).

    python3 scripts/assets/gen-badge-coins.py
"""
import math
import os
from PIL import Image, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "portals", "app", "public", "assets", "icons")
SIZE = 184
SS = 4  # supersample

# (face top, face bottom, rim light, rim dark)
PALETTES = {
    "deals": ((110, 160, 255), (29, 78, 216), (191, 212, 255), (22, 52, 150)),
    # Pale, so the medal on top stays the thing you see (owner, 2026-09-24:
    # 背景色可以淡一些).
    "tier-gold": ((255, 250, 232), (248, 226, 164), (255, 253, 244), (212, 172, 84)),
    "tier-silver": ((250, 251, 253), (216, 222, 232), (255, 255, 255), (150, 160, 176)),
    "tier-bronze": ((254, 244, 236), (240, 204, 176), (255, 250, 245), (182, 114, 72)),
}

# Health: the colour follows the score, not three fixed bands (owner,
# 2026-09-24: 根据健康分数，背景颜色进行改变). Anchors sit on healthTone's own
# lines (40 and 70) so the coin never contradicts the band elsewhere.
# Each band keeps its own hue family - red, amber, green - and only deepens
# within it; mixing straight across bands went through olive.
HEALTH_ANCHORS = [
    (0, (153, 27, 27)), (39, (220, 60, 30)),
    (40, (217, 119, 6)), (69, (234, 170, 8)),
    (70, (74, 170, 60)), (100, (21, 128, 61)),
]


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def health_base(score):
    for (s0, c0), (s1, c1) in zip(HEALTH_ANCHORS, HEALTH_ANCHORS[1:]):
        if score <= s1:
            return mix(c0, c1, (score - s0) / (s1 - s0))
    return HEALTH_ANCHORS[-1][1]


def palette_from(base):
    white, black = (255, 255, 255), (0, 0, 0)
    return (mix(base, white, 0.45), base, mix(base, white, 0.7), mix(base, black, 0.35))


for step in range(11):
    PALETTES[f"health-{step:02d}"] = palette_from(health_base(step * 10))


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def coin(face_top, face_bottom, rim_light, rim_dark):
    n = SIZE * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    px = img.load()
    c = (n - 1) / 2
    r_out = n / 2 - 2 * SS
    r_face = r_out * 0.87
    for y in range(n):
        for x in range(n):
            dx, dy = x - c, y - c
            d = math.hypot(dx, dy)
            if d > r_out:
                continue
            if d > r_face:
                # Bevelled rim: light from the top-left, dark to the bottom-right.
                t = (math.atan2(dy, dx) + math.pi) / (2 * math.pi)  # 0..1
                k = (math.cos((t - 0.125) * 2 * math.pi) + 1) / 2  # 1 at top-left
                col = lerp(rim_dark, rim_light, k)
            else:
                # Face: vertical gradient, a touch of radial depth at the edge.
                t = (y - (c - r_face)) / (2 * r_face)
                col = lerp(face_top, face_bottom, max(0.0, min(1.0, t)))
                edge = (d / r_face) ** 6 * 0.18
                col = lerp(col, face_bottom, edge)
            px[x, y] = (*col, 255)
    # Gloss: a soft white ellipse over the upper face.
    gloss = Image.new("L", (n, n), 0)
    gp = gloss.load()
    gx, gy, ga, gb = c, c - r_face * 0.42, r_face * 0.78, r_face * 0.46
    for y in range(n):
        for x in range(n):
            e = ((x - gx) / ga) ** 2 + ((y - gy) / gb) ** 2
            if e < 1 and math.hypot(x - c, y - c) < r_face:
                gp[x, y] = round(70 * (1 - e) ** 1.5)
    gloss = gloss.filter(ImageFilter.GaussianBlur(3 * SS))
    white = Image.new("RGBA", (n, n), (255, 255, 255, 0))
    white.putalpha(gloss)
    img = Image.alpha_composite(img, white)
    return img.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, pal in PALETTES.items():
        path = os.path.join(OUT, f"coin-{name}.png")
        coin(*pal).save(path, optimize=True)
        print("wrote", os.path.normpath(path))
