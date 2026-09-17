"use client";

import Link from "next/link";
import { useMessages } from "../../(app)/lib/i18n/provider";
import { HealthDonut, Ring, TitleDot } from "./screen-charts";
import { ScreenHex } from "./screen-hex";
import "./national-screen.css";
import "./enablement-screen.css";

// 赋能分析 - the display itself (owner, 2026-09-17).
//
// 大屏统计展示的风格，完全图表，分块，分区，排名等等方式。单独设计 (owner's
// own words, verbatim). Same (screen) idiom as 全国态势屏 - chromeless,
// hand-rolled SVG via screen-charts.tsx, dark ground, honeycomb backdrop - but
// its OWN layout: this is a smaller reading (one domain's own usage, not six
// panels of the whole business), so it is one grid of rank/ratio panels
// rather than a map with two rails.
//
// REPLACES THE REJECTED 使用分析 ADMIN PAGE. The owner's own critique of that
// page's rebuild - "这些是分析吗，这是统计一下，页面到处都有，还要专门
// 分析" - is answered here with rankings and ratios rather than a bare
// per-user number table: who executed what (ranked), what happened to what
// the copilot proposed (adopted / rejected / lapsed, as a composition and as
// per-user ratios), not raw counts side by side.

export interface EnablementRow {
  readonly sub: string;
  readonly name: string;
  readonly executed: number;
  readonly adopted: number;
  readonly rejected: number;
}

export interface EnablementScreenProps {
  readonly rows: readonly EnablementRow[];
  readonly windowDays: number;
  readonly totals: {
    readonly executed: number;
    readonly adopted: number;
    readonly rejected: number;
    readonly expired: number;
  };
}

const num = (v: number) => Math.round(v).toLocaleString("en-US");

/** One ranked row: a name, a proportional bar, and its count. Not `Bars` (the
 *  shared 12-period strip) - a ranking has named rows, not time periods, and
 *  forcing one onto the other's geometry would either drop the names or draw
 *  a bar chart with no axis worth having. */
function RankList({
  rows,
  max,
  empty,
}: {
  rows: readonly { readonly key: string; readonly label: string; readonly value: number }[];
  max: number;
  empty: string;
}) {
  if (rows.length === 0) {
    return <div className="rank-empty">{empty}</div>;
  }
  return (
    <div className="rank-list">
      {rows.map((r, i) => (
        <div className="rank-row" key={r.key}>
          <span className="rank-ord">{i + 1}</span>
          <span className="rank-name" title={r.label}>
            {r.label}
          </span>
          <span className="rank-track">
            <span
              className="rank-fill"
              style={{ width: `${max > 0 ? Math.max(2, (r.value / max) * 100) : 0}%` }}
            />
          </span>
          <span className="rank-val">{num(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

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
    <section className="mod enablement-panel">
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

export function EnablementScreen({ rows, windowDays, totals }: EnablementScreenProps) {
  const { ENABLEMENT_TEXT: T } = useMessages();

  const byExecuted = [...rows]
    .filter((r) => r.executed > 0)
    .sort((a, b) => b.executed - a.executed)
    .slice(0, 10);
  const maxExecuted = Math.max(1, ...byExecuted.map((r) => r.executed));

  const byAdopted = [...rows]
    .filter((r) => r.adopted > 0 || r.rejected > 0)
    .sort((a, b) => b.adopted - a.adopted)
    .slice(0, 10);
  const maxAdopted = Math.max(1, ...byAdopted.map((r) => Math.max(r.adopted, r.rejected)));

  const decided = totals.adopted + totals.rejected + totals.expired;
  const donutMix = [totals.adopted, totals.rejected, totals.expired];
  const donutLabels = [T.donutAdopted, T.donutRejected, T.donutExpired];

  return (
    <div className="screen enablement">
      <ScreenHex />

      <header className="titlebar enablement-titlebar">
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

      <div className="screen-deck enablement-grid">
        <Mod step="01" title={T.panelExecuted}>
          <p className="enablement-why">{T.panelExecutedWhy}</p>
          <RankList
            rows={byExecuted.map((r) => ({ key: r.sub, label: r.name, value: r.executed }))}
            max={maxExecuted}
            empty={T.rankEmpty}
          />
        </Mod>

        <Mod step="02" title={T.panelAdoption}>
          <p className="enablement-why">{T.panelAdoptionWhy}</p>
          {byAdopted.length === 0 ? (
            <div className="rank-empty">{T.noAdoption}</div>
          ) : (
            <div className="rank-list">
              {byAdopted.map((r) => (
                <div className="rank-row rank-row--dual" key={r.sub}>
                  <span className="rank-name" title={r.name}>
                    {r.name}
                  </span>
                  <span className="rank-track">
                    <span
                      className="rank-fill rank-fill--adopted"
                      style={{ width: `${Math.max(2, (r.adopted / maxAdopted) * 100)}%` }}
                    />
                  </span>
                  <span className="rank-val rank-val--adopted">{num(r.adopted)}</span>
                  <span className="rank-track">
                    <span
                      className="rank-fill rank-fill--rejected"
                      style={{ width: `${r.rejected > 0 ? Math.max(2, (r.rejected / maxAdopted) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="rank-val rank-val--rejected">{num(r.rejected)}</span>
                </div>
              ))}
            </div>
          )}
        </Mod>

        <Mod step="03" title={T.donutTitle}>
          {decided === 0 ? (
            <div className="rank-empty">{T.noAdoption}</div>
          ) : (
            <HealthDonut mix={donutMix} labels={donutLabels} centreLabel={T.donutTitle} />
          )}
        </Mod>

        <section className="mod enablement-panel enablement-hero">
          <div className="hero-grid">
            <div className="hero-cell">
              <div className="hero-v">{num(totals.executed)}</div>
              <div className="hero-k">{T.heroExecuted}</div>
            </div>
            <div className="hero-cell">
              <div className="hero-v hi">{num(totals.adopted)}</div>
              <div className="hero-k">{T.heroAdopted}</div>
            </div>
            <div className="hero-cell">
              <div className="hero-v amber">{num(totals.rejected)}</div>
              <div className="hero-k">{T.heroRejected}</div>
            </div>
            <div className="hero-cell">
              <div className="hero-v">{num(totals.expired)}</div>
              <div className="hero-k">{T.heroExpired}</div>
              <div className="hero-hint">{T.heroExpiredHint}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
