"use client";

import Link from "next/link";
import { useMessages } from "../../(app)/lib/i18n/provider";
import { Ring, TitleDot } from "./screen-charts";
import { ScreenHex } from "./screen-hex";
import { carryForward, carriedPath, railX } from "../lib/carried";
import "./national-screen.css";
import "./strategy-diag-screen.css";

// 战略诊断 - strategy diagnostics display (batch 11c).
//
// Three panels: segment coverage trend ranking, territory attainment
// comparison, and "false fat" warnings. Same (screen) idiom as 全国态势屏
// and 赋能分析 - chromeless, dark ground, hand-rolled SVG.

export interface SegmentTrendRow {
  readonly segmentId: string;
  readonly name: string;
  readonly currentCount: number;
  readonly countDelta: number;
  readonly currentPipeline: number;
  readonly pipelineDelta: number;
  readonly pipelinePctChange: number;
  readonly series: readonly {
    readonly at: string;
    readonly count: number;
    readonly pipeline: number;
    readonly won: number;
  }[];
  readonly isFalseFat: boolean;
}

export interface TerritoryAttainmentRow {
  readonly territoryId: string;
  readonly name: string;
  readonly period: string;
  readonly targetAmount: number;
  readonly attainedAmount: number;
  readonly attainmentPct: number;
  readonly series: readonly {
    readonly at: string;
    readonly target: number;
    readonly attained: number;
  }[];
}

export interface StrategyDiagScreenProps {
  readonly segments: readonly SegmentTrendRow[];
  readonly territories: readonly TerritoryAttainmentRow[];
  readonly windowDays: number;
  readonly totals: {
    readonly segments: number;
    readonly territories: number;
    readonly avgCoverage: number;
    readonly avgAttainment: number;
  };
}

const num = (v: number) => Math.round(v).toLocaleString("en-US");

function Mod({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mod sd-panel">
      <div className="mod-hd">
        <Ring />
        <h2>{title}</h2>
        <span className="step">{step}</span>
        <span className="rule" />
      </div>
      <div className="mod-bd">{children}</div>
    </section>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 0) return <span className="sd-delta sd-delta--up">+{delta}</span>;
  if (delta < 0) return <span className="sd-delta sd-delta--down">{delta}</span>;
  return <span className="sd-delta sd-delta--flat">--</span>;
}

function MiniSparkline({
  series,
  color,
}: {
  series: readonly number[];
  color: string;
}) {
  const W = 80, H = 24, n = series.length;
  if (n < 2) return null;
  const max = Math.max(...series) || 1;
  const min = Math.min(...series);
  const range = max - min || 1;
  const xs = (i: number) => railX(i, n, W);
  const ys = (v: number) => H - 2 - ((v - min) / range) * (H - 4);
  const c = carryForward(series.map((v) => v));
  const d = carriedPath(c, xs, ys);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sd-spark">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx={xs(n - 1)} cy={ys(series[n - 1]!)} r="2" fill={color} />
    </svg>
  );
}

export function StrategyDiagScreen({
  segments,
  territories,
  windowDays,
  totals,
}: StrategyDiagScreenProps) {
  const { STRATEGY_DIAG_TEXT: T } = useMessages();

  const money = (v: number) => {
    if (Math.abs(v) >= 1e8) return T.moneyYi(v);
    if (Math.abs(v) >= 1e4) return T.moneyWan(v);
    return `${Math.round(v)}`;
  };

  const falseFatSegments = segments.filter((s) => s.isFalseFat);

  return (
    <div className="screen strategy-diag">
      <ScreenHex />

      <header className="titlebar sd-titlebar">
        <div className="chips">
          <Link className="home" href="/" aria-label={T.home}>
            <svg viewBox="0 0 13 13" fill="none" aria-hidden>
              <path
                d="M7.5 1.5 L3 6.5 L7.5 11.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {T.home}
          </Link>
          <div className="chip">
            <div className="k">{T.windowLabel(windowDays)}</div>
          </div>
        </div>

        <div className="title">
          <h1>
            {T.title}
            <TitleDot />
          </h1>
          <p>{T.subtitle}</p>
        </div>

        <div className="ident" />
      </header>

      <div className="screen-deck sd-grid">
        {/* Panel 01: Segment coverage trend ranking */}
        <Mod step="01" title={T.panelSegmentCoverage}>
          <p className="sd-why">{T.panelSegmentCoverageWhy}</p>
          {segments.length === 0 ? (
            <div className="sd-empty">{T.noSegments}</div>
          ) : (
            <div className="sd-rank-list">
              {segments.slice(0, 10).map((s, i) => (
                <div className="sd-rank-row" key={s.segmentId}>
                  <span className="sd-rank-ord">{i + 1}</span>
                  <span className="sd-rank-name" title={s.name}>
                    {s.name}
                  </span>
                  <MiniSparkline
                    series={s.series.map((p) => p.count)}
                    color="var(--screen-accent)"
                  />
                  <span className="sd-rank-val">
                    {T.coverageUnit(s.currentCount)}
                  </span>
                  <DeltaBadge delta={s.countDelta} />
                </div>
              ))}
            </div>
          )}
        </Mod>

        {/* Panel 02: Territory attainment comparison */}
        <Mod step="02" title={T.panelAttainment}>
          <p className="sd-why">{T.panelAttainmentWhy}</p>
          {territories.length === 0 ? (
            <div className="sd-empty">{T.noTerritories}</div>
          ) : (
            <div className="sd-attain-list">
              {territories.slice(0, 10).map((t) => {
                const pct = Math.min(t.attainmentPct, 100);
                const over = t.attainmentPct > 100;
                return (
                  <div className="sd-attain-row" key={`${t.territoryId}-${t.period}`}>
                    <span className="sd-attain-name" title={t.name}>
                      {t.name}
                    </span>
                    <span className="sd-attain-period">{t.period}</span>
                    <span className="sd-attain-track">
                      <span
                        className={`sd-attain-fill${over ? " sd-attain-fill--over" : ""}`}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </span>
                    <span className="sd-attain-pct">
                      {T.attainmentPct(t.attainmentPct)}
                    </span>
                    <span className="sd-attain-amounts">
                      {money(t.attainedAmount)} / {money(t.targetAmount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Mod>

        {/* Panel 03: False fat warnings */}
        <Mod step="03" title={T.panelFalseFat}>
          <p className="sd-why">{T.panelFalseFatWhy}</p>
          {falseFatSegments.length === 0 ? (
            <div className="sd-empty">{T.noFalseFat}</div>
          ) : (
            <div className="sd-warn-list">
              {falseFatSegments.map((s) => (
                <div className="sd-warn-row" key={s.segmentId}>
                  <span className="sd-warn-icon" aria-hidden>!</span>
                  <span className="sd-warn-name">{s.name}</span>
                  <span className="sd-warn-detail">
                    <span className="sd-warn-pipeline">
                      {T.pipelineLabel} {s.pipelinePctChange >= 0 ? "+" : ""}
                      {s.pipelinePctChange.toFixed(0)}%
                    </span>
                    <span className="sd-warn-count">
                      {T.countLabel}{" "}
                      <DeltaBadge delta={s.countDelta} />
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Mod>

        {/* Hero numbers */}
        <section className="mod sd-panel sd-hero">
          <div className="sd-hero-grid">
            <div className="sd-hero-cell">
              <div className="sd-hero-v">{num(totals.segments)}</div>
              <div className="sd-hero-k">{T.heroSegments}</div>
            </div>
            <div className="sd-hero-cell">
              <div className="sd-hero-v">{num(totals.territories)}</div>
              <div className="sd-hero-k">{T.heroTerritories}</div>
            </div>
            <div className="sd-hero-cell">
              <div className="sd-hero-v">
                {T.coverageUnit(totals.avgCoverage)}
              </div>
              <div className="sd-hero-k">{T.heroAvgCoverage}</div>
            </div>
            <div className="sd-hero-cell">
              <div className="sd-hero-v hi">
                {T.attainmentPct(totals.avgAttainment)}
              </div>
              <div className="sd-hero-k">{T.heroAvgAttainment}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
