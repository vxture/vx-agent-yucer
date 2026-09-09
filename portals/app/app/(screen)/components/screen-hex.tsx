/* 六边形底纹 - the design's honeycomb ground, ported as its own SVG.
 *
 * IT WAS A CSS TILE AND THAT LOST THE POINT OF IT. A repeating background
 * image draws every cell identically, so the ground was a flat uniform mesh.
 * The design's is not uniform: individual cells are lifted or sunk against the
 * mesh at varying opacity, which is what gives the surface depth and stops
 * 1920x1080 of hexagons reading as graph paper. That light/dark variation is
 * the whole effect, and a tile cannot express it.
 *
 * Four layers, bottom to top: the diagonal ground wash, the honeycomb mesh
 * (drawn twice per cell - a dark stroke with a lighter one offset 1.5px above
 * it, which is what makes the cells look bevelled rather than outlined), the
 * lit and sunk cells, then a central glow and a vignette.
 *
 * NEUTRALS ARE DS TOKENS. The mock's raw oklch greys map onto the neutral
 * scale it was already sampling; the sky it uses for the core glow is the same
 * substitution as everywhere else on this screen (TD-025).
 */

/** x, y and opacity of each cell that is lifted out of the mesh. */
const LIT: readonly (readonly [number, number, number])[] = [
  [277.1, 96, 0.55], [831.4, 288, 0.4], [1441.1, 0, 0.5], [1163.9, 480, 0.35],
  [498.8, 672, 0.45], [1662.8, 768, 0.4], [55.4, 864, 0.3], [1053.1, 864, 0.35],
];
/** And each cell that is sunk into it. */
const SUNK: readonly (readonly [number, number, number])[] = [
  [554.3, 192, 0.6], [1385.6, 288, 0.5], [277.1, 480, 0.55], [1607.4, 480, 0.45],
  [720.5, 672, 0.5], [1274.8, 864, 0.55], [887.0, 0, 0.4],
];

const HEX = "M55.4256 0 L110.8512 32 L110.8512 96 L55.4256 128 L0 96 L0 32 Z";

export function ScreenHex() {
  return (
    <svg
      className="screen-hex"
      viewBox="0 0 1920 1080"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="hbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--vx-color-neutral-800)" />
          <stop offset=".55" stopColor="var(--vx-color-neutral-900)" />
          <stop offset="1" stopColor="var(--vx-color-neutral-950)" />
        </linearGradient>
        <linearGradient id="cellHi" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--screen-hex-hi-top)" />
          <stop offset="1" stopColor="var(--screen-hex-hi-bottom)" />
        </linearGradient>
        <linearGradient id="cellLo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--screen-hex-lo-top)" />
          <stop offset="1" stopColor="var(--screen-hex-lo-bottom)" />
        </linearGradient>
        <radialGradient id="core" cx=".5" cy=".5" r=".55">
          <stop offset="0" stopColor="var(--vx-color-sky-800)" stopOpacity=".28" />
          <stop offset="1" stopColor="var(--vx-color-sky-800)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="vig" cx=".5" cy=".46" r=".92">
          <stop offset=".5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".52" />
        </radialGradient>

        <path id="hex" d={HEX} />
        {/* Three cells per tile - one column and the two half-offset
            neighbours - which is what makes the rows interlock. */}
        <pattern id="honey" width="110.8512" height="192" patternUnits="userSpaceOnUse">
          {[[0, 0], [-55.4256, 96], [55.4256, 96]].map(([x, y]) => (
            <g key={`${x},${y}`}>
              <use href="#hex" x={x} y={y} fill="none"
                   stroke="var(--vx-color-neutral-950)" strokeOpacity=".62" strokeWidth="2.5" />
              <use href="#hex" x={x} y={y} fill="none"
                   stroke="var(--vx-color-neutral-600)" strokeOpacity=".16" strokeWidth="1"
                   transform="translate(0,-1.5)" />
            </g>
          ))}
        </pattern>
      </defs>

      <rect width="1920" height="1080" fill="url(#hbg)" />
      <rect width="1920" height="1080" fill="url(#honey)" />
      <g>
        {LIT.map(([x, y, o]) => (
          <use key={`hi${x},${y}`} href="#hex" x={x} y={y} fill="url(#cellHi)" opacity={o} />
        ))}
        {SUNK.map(([x, y, o]) => (
          <use key={`lo${x},${y}`} href="#hex" x={x} y={y} fill="url(#cellLo)" opacity={o} />
        ))}
      </g>
      <rect width="1920" height="1080" fill="url(#core)" />
      <rect width="1920" height="1080" fill="url(#vig)" />
    </svg>
  );
}
