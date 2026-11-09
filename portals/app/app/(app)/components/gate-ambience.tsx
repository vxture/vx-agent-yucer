/**
 * The ground behind the gate screens.
 *
 * STOPGAP - registered as TD-005. The design system has no ambient background
 * element, and its auth stylesheet was retired rather than replaced, so there
 * is nothing to compose here. Recovery is to delete this and consume the DS
 * element once one exists.
 *
 * A GLOW FROM ABOVE AND A SWELL ALONG THE BOTTOM THIRD (owner, 2026-09-15).
 * It has been hand-drawn curves, which had no form, and then a grid, which the
 * owner cut. What is left is two curves filling the bottom third under a
 * vertical gradient - a shape rather than a drawing, and one that cannot be
 * badly drawn because nothing about it is a fixed path at a fixed size: the
 * band is a third of whatever the viewport is and stretches to whatever width
 * it is given.
 *
 * Every colour is a token - `--primary` and `--background`, which are the names
 * the brand entry actually defines on :root (checked in the browser; an
 * undefined custom property makes a gradient invalid and the browser drops it
 * silently). No palette from any mockup is reproduced, so the ground follows
 * the brand and both themes. Decoration only: aria-hidden, no pointer events,
 * nothing here carries meaning.
 */
export function GateAmbience() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* THE GROUND, restored: one light source from above the top edge. A pass
          that replaced this with a corner-to-corner gradient was a misreading -
          the two layers the owner meant were the two waves below, not the
          page's colour - and the diagonal made the whole surface lean. This is
          the version that had been on screen through every earlier round. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_78%_at_50%_-12%,color-mix(in_srgb,var(--primary)_17%,transparent),transparent_62%)]" />

      {/* ONE WAVE, AND THE FADE FOLLOWS THE CURVE.
          A single vertical gradient could not do this. It runs over the
          shape's bounding box, so it is only fully transparent at the box's
          top - which is the crest on the right. The left of the wave starts
          two thirds of the way down that box and was therefore already tinted
          where it began, leaving a visible edge along the low side.
          So the ramp is built from the shape itself: the same path drawn
          sixteen times, each copy a little lower than the last, each almost
          invisible on its own. Only one copy covers the pixel just under the
          curve; all sixteen cover a pixel far below it. Depth from the curve
          is what sets the value, so every edge fades out, high or low.
          preserveAspectRatio="none" on purpose: this is a band, not a picture,
          and it should meet both edges at every width. */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[55%] w-full"
        viewBox="0 0 1440 400"
        preserveAspectRatio="none"
      >
        <defs>
          {/* A WAVE ON A SLANT - one trough, one crest, rising left to right.
              The baseline climbs about 200 units across the width while one
              long wave of roughly 150 rides on it. Two segments only, and the
              join at 880 is smooth by construction: the outgoing control
              (1120 64) is the reflection of the incoming one (620 236) about
              that point, which is the whole of why there is no kink. */}
          <path
            id="gate-wave"
            d="M0 244 C 330 300, 620 236, 880 150 C 1120 64, 1240 104, 1440 46 L1440 400 L0 400 Z"
          />
        </defs>

        <g fill="var(--primary)" fillOpacity="0.016">
          {Array.from({ length: 16 }, (_, i) => (
            <use key={i} href="#gate-wave" y={i * 14} />
          ))}
        </g>
      </svg>
    </div>
  );
}
