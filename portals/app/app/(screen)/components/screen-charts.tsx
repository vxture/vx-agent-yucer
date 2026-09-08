"use client";

import { STAGE_KEYS, HEALTH_KEYS } from "../lib/rollup";

/* 态势屏的六个图 - the design's charts, drawn from the product's own data.
 *
 * GEOMETRY IS THE DESIGN'S, NUMBERS ARE OURS. Every viewBox, bar width, axis
 * position and label below is the one the approved mock draws; what changed is
 * where the series comes from. The mock filled them with seeded noise because
 * it had no database behind it, and noise on a wall display is worse than an
 * empty panel: it is a reading nobody can act on and nobody can tell is fake.
 *
 * COLOURS ARE DS TOKENS, via the stylesheet's own variables. The DS has no cyan
 * family, so the mock's cyan is sky - its nearest neighbour - which is the one
 * documented substitution on this screen (TD-025).
 */

const CYAN = "var(--screen-accent)";
const CYAN_B = "var(--screen-accent-hi)";
const AMBER = "var(--screen-warn)";
const RED = "var(--screen-danger)";

export interface Fmt {
  /** A count, grouped. */
  num: (v: number) => string;
  /** Money, scaled and carrying its own unit. */
  money: (v: number) => string;
}

/**
 * The 12-period bar strip, used by 线索供给 and 签约合同.
 *
 * EVERY BAR CARRIES ITS NUMBER, tiny until you go near it (owner, 2026-09-07).
 * A 12-bar strip has no room for twelve legible figures but plenty of room for
 * twelve faint ones, so the value sits at 7px and grows to 12px with full
 * contrast when the pointer enters that bar's own column. The hit area is a
 * transparent rect spanning the FULL height, not the bar: a short bar is a few
 * pixels tall and would be a target nobody can hit.
 */
export function Bars(
  { id, series, colour, label, fmt }:
  { id: string; series: readonly number[]; colour: string; label: string; fmt: (v: number) => string },
) {
  const W = 328, H = 112, n = series.length, bw = W / n;
  const max = Math.max(...series) || 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ flex: 1, minHeight: 0 }} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`g_${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CYAN_B} />
          <stop offset=".38" stopColor={colour} />
          <stop offset="1" stopColor={colour} stopOpacity=".52" />
        </linearGradient>
      </defs>
      {series.map((v, i) => {
        const h = (v / max) * (H - 34), x = i * bw + 3, w = bw - 6;
        return (
          <g className="barcol" key={i}>
            <rect x={x} y={H - 22 - h} width={w} height={h} fill={`url(#g_${id})`} />
            <rect x={x} y={H - 22 - h} width={w} height={1.5} fill={CYAN_B} opacity=".9" />
            <text className="barval" x={x + w / 2} y={H - 27 - h} textAnchor="middle">{fmt(v)}</text>
            <rect className="barhit" x={i * bw} y={0} width={bw} height={H - 22} fill="transparent" />
          </g>
        );
      })}
      <line x1="0" y1={H - 22} x2={W} y2={H - 22} className="axis" />
      <text className="slab" x="0" y={H - 5}>{label}</text>
    </svg>
  );
}

/**
 * 商机储备's stage bars.
 *
 * The four run across the ramp's LIT half only (l5..l3) with a horizontal
 * fade, so they stay distinguishable without any of them going dim - 决策签批,
 * the stage nearest the money, must not read as the faintest bar on the panel.
 */
export function StageChart(
  { mix, labels, fmt }:
  { mix: readonly number[]; labels: readonly string[]; fmt: Fmt },
) {
  const W = 328, x0 = 62, barW = W - x0 - 74;
  const total = mix.reduce((a, b) => a + b, 0) || 1;
  const lit = ["var(--screen-l5)", "var(--screen-l5)", "var(--screen-l4)", "var(--screen-l3)"];
  return (
    <svg viewBox={`0 0 ${W} 112`} style={{ flex: 1, minHeight: 0 }} role="img">
      <defs>
        {lit.map((c, i) => (
          <linearGradient id={`sg${i}`} key={i} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={c} />
            <stop offset="1" stopColor={c} stopOpacity=".55" />
          </linearGradient>
        ))}
      </defs>
      {STAGE_KEYS.map((_, i) => {
        const v = (mix[i] ?? 0) / total, y = 2 + i * 26;
        return (
          <g key={i}>
            <text className="slab" x="0" y={y + 13}>{labels[i]}</text>
            <rect x={x0} y={y + 2} width={barW} height="14" className="trough" />
            <rect x={x0} y={y + 2} width={Math.max(3, v * barW)} height="14" fill={`url(#sg${i})`} />
            <text className="val" x={W} y={y + 13} fontSize="13" textAnchor="end">
              {fmt.money(mix[i] ?? 0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 智能副驾's 30-day 采纳率 band.
 *
 * A sparkline says "up or down"; a band with a scale says how far - and 采纳率
 * is read against a target, not against its own last value. A day on which the
 * copilot proposed nothing has no rate, so the line CARRIES FORWARD the last
 * reading rather than dropping to zero: a quiet day is not a day the humans
 * rejected everything.
 */
export function AdoptionTrend(
  { series, label }:
  { series: readonly { acc: number; prop: number }[]; label: string },
) {
  const W = 328, H = 140, N = series.length;
  const xs = (i: number) => i * (W / (N - 1));
  const ys = (v: number) => H - 16 - v * (H - 26);

  let carried = 0;
  const pts = series.map((d) => {
    if (d.prop > 0) carried = d.acc / d.prop;
    return carried;
  });
  const d = pts.map((v, i) => `${i ? "L" : "M"}${xs(i)} ${ys(v)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ marginTop: "auto" }} role="img" aria-label={label}>
      <defs>
        <linearGradient id="agg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CYAN} stopOpacity=".4" />
          <stop offset="1" stopColor={CYAN} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${xs(N - 1)} ${H - 14} L0 ${H - 14} Z`} fill="url(#agg)" />
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <g key={g}>
          <line x1="0" y1={ys(g)} x2={W} y2={ys(g)} className="gridline" />
          <text className="tick" x={W} y={ys(g) - 3} textAnchor="end">{Math.round(g * 100)}%</text>
        </g>
      ))}
      <path d={d} fill="none" stroke={CYAN} strokeWidth="1.8" />
      <circle cx={xs(N - 1)} cy={ys(pts[N - 1] ?? 0)} r="3.4" fill={CYAN_B} />
      <line x1="0" y1={H - 14} x2={W} y2={H - 14} className="axis" />
      <text className="slab" x="0" y={H}>{label}</text>
    </svg>
  );
}

/**
 * 交付履约's health donut.
 *
 * 健康 takes the same bright tint every LEAD number on this screen uses, so
 * the one reading the map is coloured by is not the dimmest of the three.
 */
export function HealthDonut(
  { mix, labels, centreLabel }:
  { mix: readonly number[]; labels: readonly string[]; centreLabel: string },
) {
  const cx = 58, cy = 58, r = 47, th = 11;
  const cols = [CYAN_B, AMBER, RED];
  const total = mix.reduce((a, b) => a + b, 0);
  const pcts = HEALTH_KEYS.map((_, i) => (total === 0 ? 0 : (mix[i] ?? 0) / total));

  let a0 = -Math.PI / 2;
  const arcs = pcts.map((v, i) => {
    if (v <= 0) return null;
    // A single band covering everything cannot be drawn as an arc - its start
    // and end coincide - so it is a plain ring.
    if (v >= 0.999) {
      return (
        <circle key={i} cx={cx} cy={cy} r={r - th / 2} fill="none"
                stroke={cols[i]} strokeWidth={th} />
      );
    }
    const a1 = a0 + v * Math.PI * 2 - 0.05;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    /* ROUNDED, and not for tidiness. Node and the browser's V8 disagree on the
       last bits of cos/sin, so the server and client rendered path strings that
       differed in the 15th decimal - a real hydration mismatch React refuses to
       patch up. Three decimals is far below a pixel at 108px wide and makes the
       two agree exactly. */
    const r3 = (n: number) => n.toFixed(3);
    const P = (a: number, rr: number) => `${r3(cx + Math.cos(a) * rr)} ${r3(cy + Math.sin(a) * rr)}`;
    const d =
      `M${P(a0, r)} A${r} ${r} 0 ${big} 1 ${P(a1, r)}` +
      `L${P(a1, r - th)} A${r - th} ${r - th} 0 ${big} 0 ${P(a0, r - th)} Z`;
    a0 = a1 + 0.05;
    return <path key={i} d={d} fill={cols[i]} />;
  });

  return (
    <div className="screen-health">
      <svg viewBox="0 0 116 116" style={{ width: 108, flex: "none" }} role="img">
        {arcs}
        <text x={cx} y={cy + 2} textAnchor="middle" className="val" fontSize="23" fill={CYAN_B}>
          {total === 0 ? "-" : `${Math.round(pcts[0]! * 100)}%`}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" className="tick">{centreLabel}</text>
      </svg>
      <div className="legend">
        {labels.map((k, i) => (
          <div key={k}>
            <i style={{ background: cols[i] }} />
            {k}
            <b style={{ color: cols[i] }}>
              {total === 0 ? "-" : `${(pcts[i]! * 100).toFixed(1)}%`}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 回款兑现's split bar over the 7-period collection rate. */
export function CashChart(
  { collected, receivable, overdue, series, labelCollected, labelOverdue, label }:
  {
    collected: number; receivable: number; overdue: number;
    series: readonly { got: number; due: number }[];
    labelCollected: (p: string) => string;
    labelOverdue: (p: string) => string;
    label: string;
  },
) {
  const W = 328;
  const total = collected + receivable || 1;
  const y0 = 48, y1 = 94, N = series.length;
  const xs = (i: number) => i * ((W - 4) / (N - 1));
  const ys = (v: number) => y1 - (v / 100) * (y1 - y0);

  // A period in which nothing fell due has no rate; the line carries the last
  // reading across rather than plunging to zero on a quiet fortnight.
  let carried = 0;
  const pts = series.map((d) => {
    if (d.due > 0) carried = Math.max(0, Math.min(100, (d.got / d.due) * 100));
    return carried;
  });

  return (
    <svg viewBox={`0 0 ${W} 112`} style={{ flex: 1, minHeight: 0 }} role="img" aria-label={label}>
      <rect x="0" y="4" width={W} height="18" className="trough" />
      <rect x="0" y="4" width={(W * collected) / total} height="18" fill={CYAN} />
      <rect x={(W * collected) / total} y="4"
            width={(W * Math.max(0, receivable - overdue)) / total} height="18"
            fill={AMBER} opacity=".72" />
      <rect x={(W * (collected + receivable - overdue)) / total} y="4"
            width={(W * overdue) / total} height="18" fill={RED} />
      <text className="tick" x="0" y="37">
        {labelCollected(`${((collected / total) * 100).toFixed(1)}%`)}
      </text>
      <text className="tick" x={W} y="37" textAnchor="end">
        {labelOverdue(`${((overdue / total) * 100).toFixed(1)}%`)}
      </text>
      <path d={pts.map((v, i) => `${i ? "L" : "M"}${xs(i)} ${ys(v)}`).join(" ")}
            fill="none" stroke={CYAN} strokeWidth="2" />
      {pts.map((v, i) => (
        <circle key={i} cx={xs(i)} cy={ys(v)} r="2.6"
                fill="var(--screen-ground)" stroke={CYAN} strokeWidth="1.5" />
      ))}
      <line x1="0" y1={y1} x2={W} y2={y1} className="axis" />
      <text className="slab" x="0" y="109">{label}</text>
    </svg>
  );
}

/**
 * The mark beside every panel title.
 *
 * NO OUTER RING (owner). It carried an amber circle around the outside, which
 * put a boxed frame on six titles that need no framing - the header already
 * has its rule. What is left is the part that reads as a mark: a thin circle
 * and its core.
 */
export function Ring() {
  const R = 9;
  return (
    <span className="ring" aria-hidden>
      <svg viewBox={`0 0 ${R * 2} ${R * 2}`} fill="none">
        <circle cx={R} cy={R} r={R * 0.52} stroke={CYAN} strokeWidth="1" />
        <circle cx={R} cy={R} r={R * 0.21} fill={CYAN} />
      </svg>
    </span>
  );
}
