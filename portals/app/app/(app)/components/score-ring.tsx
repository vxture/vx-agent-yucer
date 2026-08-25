"use client";

import type { Tone } from "../lib/view-model";

// The signal score, drawn as a ring.
//
// STOPGAP, REGISTERED AS TD-009. The DS has no ring: design-ui@3.0.0 exports
// `Progress` and nothing else in that family - no donut, no circular, no radial
// - and `Progress` is the linear shadcn bar (accent track, translateX fill).
// So this is a local drawing rather than a DS element used wrongly.
//
// It is a STOPGAP and not a deviation because it REPLACES NOTHING. CLAUDE.md's
// rigid zone forbids restyling a DS element or hand-rolling one the DS already
// ships; this overrides no DS class and shadows no DS export. Every colour is a
// DS semantic token reached through `currentColor`, so a theme change moves the
// ring with everything else. Recovery condition: the DS ships a score ring, and
// this file is deleted rather than adapted.
//
// WHY A RING AT ALL. A bare number asks the reader to hold the scale in their
// head - is 62 good? The ring states the scale by drawing it, so the answer is
// legible before the digits are read, which is what a triage queue is for.
//
// THE BAND AND THE ARC CANNOT DISAGREE, because both come from confidenceTone.
// The old code mapped tones by hand and asked for a "danger" that
// confidenceTone never returns, so its info branch fell through to the success
// colour: a 65 was painted the same green as an 85.

/** The lead rail is `w-control-md` = 32px. The ring is drawn to fill it. */
const SIZE = 32;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ARC_TONE: Record<Tone, string> = {
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  danger: "text-destructive",
  brand: "text-primary",
  neutral: "text-muted-foreground",
};

export interface ScoreRingProps {
  /** null when the signal has not been scored - drawn as an empty track. */
  readonly score: number | null;
  readonly tone: Tone;
  /** Read out to assistive tech, since the ring itself carries no text. */
  readonly label: string;
}

export function ScoreRing({ score, tone, label }: ScoreRingProps) {
  // Scores are a 0-100 scale but the rule is not bounded to it, so clamp:
  // an arc longer than the circle would wrap and read as a smaller one.
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const arc = ARC_TONE[tone] ?? ARC_TONE.neutral;

  return (
    <span
      className="relative inline-flex shrink-0"
      role="img"
      aria-label={label}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
      >
        {/* Track. Always drawn, so an unscored signal still occupies the rail
            and the column stays a column. */}
        <circle
          className="text-border"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
        />
        {/* Arc. Rotated to start at twelve o'clock - a gauge that starts at
            three reads as a fraction of the wrong thing. */}
        {score === null ? null : (
          <circle
            className={arc}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - pct)}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        )}
      </svg>
      {/* The digits sit inside the ring rather than beside it: two glyphs at
          label-sm clear the 26px inner diameter, and putting them outside
          would cost the rail its fixed width. */}
      <span
        className={`absolute inset-0 flex items-center justify-center text-label-sm tabular-nums ${
          score === null ? "text-muted-foreground" : arc
        }`}
        aria-hidden="true"
      >
        {score ?? "-"}
      </span>
    </span>
  );
}
