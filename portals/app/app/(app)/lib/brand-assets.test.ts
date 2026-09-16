import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join, relative } from "node:path";

// Two rules from the 2026-09-16 rules revision, both enforced as real checks
// rather than left to reviewer memory:
//
//   1. "图片路径只写在一处品牌常量里" - grep the whole app tree for the two
//      published mark paths and fail if they turn up anywhere but this file.
//   2. The PNG mark decodes to exactly what a consumer that cannot take SVG
//      is promised: 512x512, 8-bit RGBA, non-interlaced, transparent corners,
//      opaque centre - checked by actually decoding the file, not by eye.

const APP_DIR = join(import.meta.dirname, "..", "..");
const THIS_FILE = relative(APP_DIR, join(import.meta.dirname, "brand-assets.ts"));

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test("the two published mark paths appear nowhere but brand-assets.ts", () => {
  const offenders: string[] = [];
  for (const p of walk(APP_DIR)) {
    if (!p.endsWith(".ts") && !p.endsWith(".tsx")) continue;
    const rel = relative(APP_DIR, p);
    if (rel === THIS_FILE || rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
    const text = readFileSync(p, "utf8");
    if (text.includes("/logo.svg") || text.includes("/logo.png")) offenders.push(rel);
  }
  assert.deepEqual(
    offenders,
    [],
    `image path hardcoded outside brand-assets.ts - import PRODUCT_MARK_SRC / PRODUCT_MARK_PNG_SRC instead:\n  ${offenders.join("\n  ")}`,
  );
});

// --- Minimal PNG decoder, just enough to check the four properties above ---
// No new dependency: PNG's compressed data is plain zlib (node:zlib covers
// it), and defiltering eight-bit RGBA scanlines is a few dozen lines. Only
// what this file's own checks need - bit depth 8, colour type 6 (truecolor +
// alpha), non-interlaced - anything else throws rather than guessing.

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buf: Buffer): { width: number; height: number; interlace: number; pixels: Buffer } {
  assert.ok(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 8 + len + 4; // length + type + data + crc
  }
  assert.equal(bitDepth, 8, `expected 8-bit depth, got ${bitDepth}`);
  assert.equal(colorType, 6, `expected colour type 6 (truecolor+alpha), got ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4; // RGBA @ 8 bits
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rawOffset++];
    for (let x = 0; x < stride; x++) {
      const filt = raw[rawOffset++];
      const a = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = y > 0 && x >= bpp ? pixels[(y - 1) * stride + x - bpp] : 0;
      let recon: number;
      switch (filter) {
        case 0:
          recon = filt;
          break;
        case 1:
          recon = filt + a;
          break;
        case 2:
          recon = filt + b;
          break;
        case 3:
          recon = filt + Math.floor((a + b) / 2);
          break;
        case 4:
          recon = filt + paeth(a, b, c);
          break;
        default:
          throw new Error(`unknown PNG filter type ${filter}`);
      }
      pixels[y * stride + x] = recon & 0xff;
    }
  }
  return { width, height, interlace, pixels };
}

test("the PNG mark is 512x512, 8-bit RGBA, non-interlaced, corners transparent, centre opaque", () => {
  const png = decodePng(readFileSync(join(APP_DIR, "..", "public", "logo.png")));
  assert.equal(png.width, 512);
  assert.equal(png.height, 512);
  assert.equal(png.interlace, 0, "must be non-interlaced");

  const alphaAt = (x: number, y: number) => png.pixels[(y * png.width + x) * 4 + 3];
  const corners = [
    [0, 0],
    [png.width - 1, 0],
    [0, png.height - 1],
    [png.width - 1, png.height - 1],
  ] as const;
  for (const [x, y] of corners) {
    assert.equal(alphaAt(x, y), 0, `corner (${x},${y}) must be fully transparent`);
  }
  assert.equal(alphaAt(png.width >> 1, png.height >> 1), 255, "centre must be fully opaque");
});
