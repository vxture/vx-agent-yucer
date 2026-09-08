"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMessages } from "../../(app)/lib/i18n/provider";
import { CHINA } from "../lib/china-geometry";
import { totalOf, type NationalRollup, type ProvinceRollup } from "../lib/rollup";
import {
  PROVINCES_BY_REGION,
  shortProvince,
  type Region,
} from "../../domains/shared/provinces";
import {
  AdoptionTrend, Bars, CashChart, HealthDonut, Ring, StageChart,
} from "./screen-charts";
import "./national-screen.css";

// 全国销售态势屏 - the display itself.
//
// WHAT IS AND IS NOT DS HERE. Every colour, radius and spacing on this screen is
// a design-token value; nothing is a hand-mixed hex. What the DS has no element
// for is the screen ITSELF: a choropleth of China, a honeycomb ground, and the
// bracket toggles that fold the rails. Those are registered as TD-025 rather
// than quietly built - see the entry for the missing element, the stopgap
// location and the recovery condition.
//
// THREE LEVELS, TWO GESTURES. 全国 -> 大区 -> 省份. The 大区 is chosen from the
// breadcrumb's own dropdown because picking a region off a map means guessing
// which province stands for it; a province is chosen by clicking it. Stepping
// out is bound to three things - right-click, bare canvas, and a button - so
// there is no single small target to hunt for.
//
// EVERY FIGURE COMES FROM rollup.ts. This component formats and draws; it does
// not compute. That split is what lets the arithmetic be tested without
// rendering, and it is why there is no sum in this file.

type Level = "nation" | "region" | "province";
type Metric = "contractValue" | "pipelineValue" | "inDelivery" | "healthRate";

export interface NationalScreenProps {
  readonly rollup: NationalRollup;
  readonly viewerSub: string;
}

/**
 * Scale a CNY figure and pair it with its unit.
 *
 * THE UNITS ARE COPY, passed in rather than written here. Hard-coding 亿元 in a
 * component is the defect ascii-containment exists to catch, and it is not
 * cosmetic: the English dictionary renders these figures with different
 * suffixes entirely, and a literal would have shown 亿元 to every reader.
 */
function money(v: number, u: { yi: string; wan: string; yuan: string }): { n: string; u: string } {
  if (v >= 100_000_000) return { n: (v / 100_000_000).toFixed(2), u: u.yi };
  if (v >= 10_000) return { n: (v / 10_000).toFixed(1), u: u.wan };
  return { n: Math.round(v).toLocaleString("en-US"), u: u.yuan };
}
const num = (v: number) => Math.round(v).toLocaleString("en-US");

/**
 * The viewBox that frames a scope.
 *
 * Squared to the arena's aspect around the scope's OWN centre, so a tall
 * province and a wide one both land in the middle rather than one of them
 * sitting against an edge. Falls back to the national box whenever the scope
 * has no drawable shape in it - an empty box would collapse the viewBox to
 * zero width and blank the map.
 */
function frameFor(level: Level, scope: readonly ProvinceRollup[]) {
  if (level === "nation") return CHINA.viewBox;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of scope) {
    const b = CHINA.provinces[p.province]?.bbox;
    if (!b) continue;
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]);
    x1 = Math.max(x1, b[0] + b[2]); y1 = Math.max(y1, b[1] + b[3]);
  }
  if (!Number.isFinite(x0)) return CHINA.viewBox;
  const w = x1 - x0, h = y1 - y0, pad = 0.5;
  const cx = x0 + w / 2, cy = y0 + h / 2;
  const aspect = 1.45;
  let vw = w * (1 + pad), vh = h * (1 + pad);
  if (vw / vh < aspect) vw = vh * aspect; else vh = vw / aspect;
  return [cx - vw / 2, cy - vh / 2, vw, vh] as const;
}

/* --- 板块 - the design's module, exactly ------------------------------------
   A header of four parts (ring, title, step, rule), then a body that holds a
   row of cells and a chart which takes the space that is left. The right rail
   reverses the header, so the rule always runs toward the map. */

function Mod(
  { step, title, right, children }:
  { step: string; title: string; right?: boolean; children: React.ReactNode },
) {
  return (
    <section className="mod">
      <div className={`mod-hd${right ? " rev" : ""}`}>
        <Ring />
        <h2>{title}</h2>
        <span className="step">{step}</span>
        <span className="rule" />
      </div>
      <div className="mod-bd">{children}</div>
    </section>
  );
}

/** Three readings across one line, the first of them the panel's lead. */
function Cells({ children }: { children: React.ReactNode }) {
  return <div className="cells">{children}</div>;
}

function Cell(
  { k, v, unit, tone }:
  { k: string; v: string; unit?: string; tone?: "lead" | "amber" | "red" | "hi" },
) {
  return (
    <div>
      <div className="k">{k}</div>
      <div className={`v${tone ? ` ${tone}` : ""}`}>
        {v}{unit ? <small>{unit}</small> : null}
      </div>
    </div>
  );
}

/**
 * The fold bracket - vxtpl's own graphic, one asset, mirrored.
 *
 * Both brackets drive the SAME state, so either click folds and unfolds both
 * rails together: they are one gesture, not two independent panels.
 */
function FoldArc(
  { side, folded, onToggle, label }:
  { side: "left" | "right"; folded: boolean; onToggle: () => void; label: string },
) {
  // Flipped on the right; folding flips it again, so the bracket always points
  // the way the rail is ABOUT to move rather than the way it came.
  const flip = (side === "right") !== folded;
  return (
    <button
      type="button"
      className={`arc arc-${side}`}
      aria-expanded={!folded}
      aria-label={label}
      onClick={onToggle}
    >
      <span className={`arc__art${flip ? " arc__art--flip" : ""}`} aria-hidden />
    </button>
  );
}

export function NationalScreen({ rollup, viewerSub }: NationalScreenProps) {
  const { SCREEN_TEXT } = useMessages();
  const units = {
    yi: SCREEN_TEXT.unitYi, wan: SCREEN_TEXT.unitWan, yuan: SCREEN_TEXT.unitYuan,
  };
  const cash = (v: number) => money(v, units);
  const [level, setLevel] = useState<Level>("nation");
  const [region, setRegion] = useState<Region | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("contractValue");
  const [menuOpen, setMenuOpen] = useState(false);
  const [railsFolded, setRailsFolded] = useState(false);
  const [titleFolded, setTitleFolded] = useState(false);

  /* THE DATE IS THE VIEWER'S, resolved after mount. Formatting it during the
     server render would stamp the server's day into the HTML and then disagree
     with the client's - a hydration mismatch, and on a screen left running
     overnight, a date that silently goes stale. */
  const [today, setToday] = useState("--");
  useEffect(() => {
    const stamp = () => {
      const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
      setToday(`${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`);
    };
    stamp();
    const t = setInterval(stamp, 30_000);
    return () => clearInterval(t);
  }, []);
  const menuRef = useRef<HTMLSpanElement>(null);

  /* DISMISSING THE 大区 MENU, for a keyboard as well as a mouse.
     This used to be an onClick on the root <div>, which is a handler a keyboard
     can never fire: with no pointer there was no way to close the menu at all,
     and the swallow-the-click <span> around it existed only to stop that same
     handler. Both are gone. Escape closes it and returns focus to the trigger,
     a pointer landing outside closes it, and neither depends on an element
     pretending to be interactive. The listeners exist only while it is open. */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const byName = useMemo(
    () => new Map(rollup.provinces.map((p) => [p.province, p])),
    [rollup],
  );

  const scope: readonly ProvinceRollup[] = useMemo(() => {
    if (level === "province" && province) {
      const one = byName.get(province);
      return one ? [one] : [];
    }
    if (level === "region" && region) return rollup.byRegion.get(region) ?? [];
    return rollup.provinces;
  }, [level, region, province, rollup, byName]);

  const total = useMemo(() => totalOf(scope), [scope]);
  const inScope = useMemo(() => new Set(scope.map((p) => p.province)), [scope]);

  const readMetric = (p: ProvinceRollup): number | null =>
    metric === "healthRate" ? p.healthRate : p[metric];

  // The ramp is graded over the CURRENT scope, so drilling into a region
  // re-grades against that region rather than leaving every province in it the
  // same shade it had nationally.
  const values = scope.map(readMetric).filter((v): v is number => v !== null);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;

  const shadeOf = (p: ProvinceRollup): string => {
    const v = readMetric(p);
    // NO READING IS ITS OWN SHADE, not the bottom of the ramp. A province where
    // nothing has been delivered is not the least healthy province.
    if (v === null) return "var(--screen-blank)";
    const t = hi === lo ? 0.6 : (v - lo) / (hi - lo);
    return `var(--screen-l${Math.min(5, Math.max(0, Math.round(t * 5)))})`;
  };

  /* A cell is a value and an optional unit, kept apart so the unit can be set
     smaller - the design's <small> inside .v. */
  const pctCell = (v: number | null) =>
    v === null
      ? { v: SCREEN_TEXT.noReading }
      : { v: (v * 100).toFixed(1), unit: "%" };
  const moneyCell = (v: number) => {
    const m = cash(v);
    return { v: m.n, unit: m.u };
  };
  const pct = (v: number | null) =>
    v === null ? SCREEN_TEXT.noReading : `${(v * 100).toFixed(1)}%`;

  const fmtMetric = (v: number | null): string => {
    if (v === null) return SCREEN_TEXT.noReading;
    if (metric === "healthRate") return `${(v * 100).toFixed(1)}%`;
    const m = cash(v);
    return m.n + m.u;
  };

  function stepOut() {
    if (level === "province") { setLevel("region"); setProvince(null); }
    else if (level === "region") { setLevel("nation"); setRegion(null); }
  }

  const frame = useMemo(() => frameFor(level, scope), [level, scope]);

  const METRICS: readonly { id: Metric; label: string; rate?: boolean }[] = [
    { id: "contractValue", label: SCREEN_TEXT.metricContract },
    { id: "pipelineValue", label: SCREEN_TEXT.metricPipeline },
    { id: "inDelivery", label: SCREEN_TEXT.metricInDelivery },
    { id: "healthRate", label: SCREEN_TEXT.metricHealth, rate: true },
  ];


  return (
    <div className={`screen${titleFolded ? " folded" : ""}`}>
      <div className="screen-hex" aria-hidden />

      {/* 日期条 - it lives OUTSIDE the title bar so it can survive the fold.
          Folded, it rides up to the top edge and becomes the control that
          brings the title back; the chevron points where the title is ABOUT to
          go, not where it is (owner, 2026-09-07). */}
      <button
        type="button"
        className="today"
        aria-label={titleFolded ? SCREEN_TEXT.unfoldTitle : SCREEN_TEXT.foldTitle}
        aria-expanded={!titleFolded}
        onClick={() => setTitleFolded((v) => !v)}
      >
        <span>{today}</span>
        <svg viewBox="0 0 8 8" fill="none" aria-hidden>
          <path d="M1.5 2.5 L4 5.5 L6.5 2.5" stroke="currentColor" strokeWidth="1.3"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <header className={`titlebar${titleFolded ? " folded" : ""}`}>
        <div className="chips">
          <Link className="home" href="/" aria-label={SCREEN_TEXT.home}>
            <svg viewBox="0 0 13 13" fill="none" aria-hidden>
              <path d="M7.5 1.5 L3 6.5 L7.5 11.5" stroke="currentColor" strokeWidth="1.6"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {SCREEN_TEXT.home}
          </Link>
          <div className="chip">
            <div className="k">{SCREEN_TEXT.provinceCount}</div>
            <div className="v">{scope.filter((p) => p.accounts > 0).length}</div>
          </div>
          <div className="chip">
            <div className="k">{SCREEN_TEXT.openDeals}</div>
            <div className="v">{num(total.openDeals)}</div>
          </div>
        </div>

        <div className="title">
          <h1>{SCREEN_TEXT.title}</h1>
          <p>{SCREEN_TEXT.subtitle}</p>
        </div>

        <div className="ident">
          {rollup.unplacedAccounts > 0 ? (
            // SAID OUT LOUD. These accounts are in the national total and on no
            // province, so without this line the map and the header disagree
            // and nothing explains why.
            <span className="screen-note">
              {SCREEN_TEXT.unplacedNote(rollup.unplacedAccounts)}
            </span>
          ) : null}
          {/* The design puts a named person here. This shows the SUB, because
              AuthUser carries no name and dressing an id up as a person is the
              defect the account page already fixed once. */}
          <span className="screen-viewer" title={viewerSub}>{viewerSub}</span>
        </div>
      </header>

      <div className="screen-deck">
        <aside className={`rail rail-left${railsFolded ? " folded" : ""}`}>
          <div className="rail__body">
            <Mod step="01" title={SCREEN_TEXT.panelLeads}>
              <Cells>
                <Cell k={SCREEN_TEXT.cellLeadsNew} v={num(total.leadsNew)} tone="lead" />
                <Cell k={SCREEN_TEXT.cellLeadsUnclaimed} v={num(total.leadsUnclaimed)} tone="amber" />
                <Cell k={SCREEN_TEXT.cellLeadConversion} {...pctCell(total.leadConversion)} />
              </Cells>
              <Bars
                id="leadChart"
                series={total.leadSeries}
                colour="var(--screen-accent)"
                label={SCREEN_TEXT.chartLeads}
                fmt={num}
              />
            </Mod>

            <Mod step="02" title={SCREEN_TEXT.panelPipeline}>
              <Cells>
                <Cell k={SCREEN_TEXT.cellPipelineValue} {...moneyCell(total.pipelineValue)} tone="lead" />
                <Cell k={SCREEN_TEXT.cellOpenDeals} v={num(total.openDeals)} />
                <Cell k={SCREEN_TEXT.cellWeighted} {...moneyCell(total.weighted)} />
              </Cells>
              <StageChart
                mix={total.stageMix}
                labels={SCREEN_TEXT.stageLabels}
                fmt={{ num, money: (v) => cash(v).n + cash(v).u }}
              />
            </Mod>

            <Mod step="03" title={SCREEN_TEXT.panelContract}>
              <Cells>
                <Cell k={SCREEN_TEXT.cellContractValue} {...moneyCell(total.contractValue)} tone="lead" />
                <Cell k={SCREEN_TEXT.cellWonDeals} v={num(total.wonDeals)} />
                <Cell k={SCREEN_TEXT.cellWinRate} {...pctCell(total.winRate)} />
              </Cells>
              <Bars
                id="signChart"
                series={total.signSeries}
                colour="var(--screen-accent-hi)"
                label={SCREEN_TEXT.chartSign}
                fmt={(v) => cash(v).n + cash(v).u}
              />
            </Mod>
          </div>
        </aside>

        <section className="screen-arena">
          <div className="screen-bar">
            <nav className="screen-crumb">
              {level === "nation" ? (
                <span className="cur">{SCREEN_TEXT.nation}</span>
              ) : (
                <button type="button" onClick={() => { setLevel("nation"); setRegion(null); setProvince(null); }}>
                  {SCREEN_TEXT.nation}
                </button>
              )}
              <span className="sep">▸</span>
              <span className="screen-menu" ref={menuRef}>
                <button
                  type="button"
                  className={region ? "chosen" : "placeholder"}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  {region ?? SCREEN_TEXT.regionDefault} ▾
                </button>
                {menuOpen ? (
                  <span className="screen-pop" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setLevel("nation"); setRegion(null); setProvince(null); setMenuOpen(false); }}>
                      {SCREEN_TEXT.regionDefault}
                    </button>
                    {(Object.keys(PROVINCES_BY_REGION) as Region[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="menuitem"
                        className={r === region ? "on" : ""}
                        onClick={() => { setLevel("region"); setRegion(r); setProvince(null); setMenuOpen(false); }}
                      >
                        {r}
                      </button>
                    ))}
                  </span>
                ) : null}
              </span>
              {level === "province" && province ? (
                <>
                  <span className="sep">▸</span>
                  <span className="cur">{province}</span>
                </>
              ) : null}
            </nav>

            <span className="screen-hint">
              {level === "nation" ? SCREEN_TEXT.drillHint : SCREEN_TEXT.backHint}
            </span>

            <div className="screen-picks">
              {METRICS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`screen-pick${m.rate ? " rate" : ""}${m.id === metric ? " on" : ""}`}
                  onClick={() => setMetric(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="screen-map"
            onContextMenu={(e) => { e.preventDefault(); stepOut(); }}
          >
            <svg
              viewBox={`${frame[0]} ${frame[1]} ${frame[2]} ${frame[3]}`}
              preserveAspectRatio="xMidYMid meet"
              aria-label={SCREEN_TEXT.title}
            >
              {/* Bare canvas is the step-out gesture. Sized to the frame, not to
                  a huge rectangle: an oversized one escapes this svg's box and
                  swallows pointer events across the whole screen. */}
              <rect
                x={frame[0]} y={frame[1]} width={frame[2]} height={frame[3]}
                fill="transparent" onClick={stepOut}
              />
              {rollup.provinces.map((p) => {
                const shape = CHINA.provinces[p.province];
                if (!shape || !inScope.has(p.province)) return null;
                return (
                  <path
                    key={p.province}
                    d={shape.d}
                    className={`screen-prov${province === p.province ? " sel" : ""}`}
                    style={{ fill: shadeOf(p) }}
                    onClick={() => {
                      setLevel("province");
                      setProvince(p.province);
                      setRegion(p.region);
                    }}
                  >
                    <title>{`${p.province} · ${fmtMetric(readMetric(p))}`}</title>
                  </path>
                );
              })}
              {/* 南海诸岛 in the corner, the conventional treatment and a
                  geometric necessity: the nine-dash line reaches about 4N, so
                  drawing it inline would squash the country into the top half
                  of its own frame. Shown only at national scope - at region
                  zoom it is neither in view nor relevant. */}
              {level === "nation" ? (
                <g
                  className="screen-sea"
                  transform={`translate(${
                    frame[0] + frame[2] - CHINA.seaViewBox[2] * ((frame[3] * 0.2) / CHINA.seaViewBox[3]) - frame[2] * 0.015
                  },${
                    frame[1] + frame[3] - CHINA.seaViewBox[3] * ((frame[3] * 0.2) / CHINA.seaViewBox[3]) - frame[3] * 0.02
                  }) scale(${(frame[3] * 0.2) / CHINA.seaViewBox[3]})`}
                  pointerEvents="none"
                >
                  <rect
                    x={CHINA.seaViewBox[0]} y={CHINA.seaViewBox[1]}
                    width={CHINA.seaViewBox[2]} height={CHINA.seaViewBox[3]}
                  />
                  <path d={CHINA.sea} />
                </g>
              ) : null}

              {scope.length <= 12
                ? scope.map((p) => {
                    const shape = CHINA.provinces[p.province];
                    if (!shape) return null;
                    const k = frame[2] / 1100;
                    return (
                      <g key={`l-${p.province}`} pointerEvents="none">
                        <text className="screen-plabel" x={shape.cx} y={shape.cy}
                              textAnchor="middle" fontSize={14 * k} strokeWidth={3 * k}>
                          {shortProvince(p.province)}
                        </text>
                        <text className="screen-pval" x={shape.cx} y={shape.cy + 17 * k}
                              textAnchor="middle" fontSize={15 * k} strokeWidth={3 * k}>
                          {fmtMetric(readMetric(p))}
                        </text>
                      </g>
                    );
                  })
                : null}
            </svg>

            {level !== "nation" ? (
              <button type="button" className="screen-back" onClick={stepOut}>
                ↩ {SCREEN_TEXT.back}
              </button>
            ) : null}

            <div className="screen-scale">
              <span>{fmtMetric(values.length ? lo : null)}</span>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <i key={i} style={{ background: `var(--screen-l${i})` }} />
              ))}
              <span>{fmtMetric(values.length ? hi : null)}</span>
            </div>

            {/* Pinned to the map's own edges, as the design places them. */}
            <FoldArc
              side="left"
              folded={railsFolded}
              onToggle={() => setRailsFolded((v) => !v)}
              label={railsFolded ? SCREEN_TEXT.unfoldRails : SCREEN_TEXT.foldRails}
            />
            <FoldArc
              side="right"
              folded={railsFolded}
              onToggle={() => setRailsFolded((v) => !v)}
              label={railsFolded ? SCREEN_TEXT.unfoldRails : SCREEN_TEXT.foldRails}
            />
          </div>

          {/* 漏斗带 - the stages in money order, largest type on the screen.
              Each figure is the previous stage's subset, never an independent
              number, so the row reconciles by construction. */}
          <div className="screen-ribbon">
            <div className="node">
              <span>{SCREEN_TEXT.funnelAccounts}</span>
              <b>{num(total.accounts)}<small> {SCREEN_TEXT.accountsUnit(0).replace("0 ", "")}</small></b>
            </div>
            <div className="node">
              <span>{SCREEN_TEXT.funnelPipeline}</span>
              <b>{cash(total.pipelineValue).n}<small>{cash(total.pipelineValue).u}</small></b>
            </div>
            <div className="node win">
              <span>{SCREEN_TEXT.funnelContract}</span>
              <b>{cash(total.contractValue).n}<small>{cash(total.contractValue).u}</small></b>
            </div>
            <div className="node cash">
              <span>{SCREEN_TEXT.funnelDelivery}</span>
              <b>{cash(total.inDelivery).n}<small>{cash(total.inDelivery).u}</small></b>
            </div>
          </div>
        </section>


        <aside className={`rail rail-right${railsFolded ? " folded" : ""}`}>
          <div className="rail__body">
            {/* 主数字是采纳率, 副数字是它的分子分母. The rate never appears
                without the volume it was computed from - a high rate over three
                proposals is not a result.

                ORDER MATTERS ACROSS THE SEAM (owner, 2026-09-07). This panel
                used to END on a row of numbers while 交付履约 BEGINS with one,
                so the two collided into a single dense band at the boundary. The
                three figures now sit together at the top and the panel closes on
                the chart, which gives the next panel's numbers a quiet edge. */}
            <Mod step="AI" title={SCREEN_TEXT.panelCopilot} right>
              <div className="hero">
                <div className="hero-v">
                  {total.adoption === null ? SCREEN_TEXT.noReading : (total.adoption * 100).toFixed(1)}
                  {total.adoption === null ? null : <small>%</small>}
                </div>
                <div className="hero-s">
                  <div className="hero-k">{SCREEN_TEXT.cellAdoption}</div>
                  <div className="hero-r">
                    <b>{num(total.accepted30)}</b> / <span>{num(total.proposals30)}</span>
                    {" "}{SCREEN_TEXT.adoptionSuffix}
                  </div>
                </div>
              </div>
              <div className="duo">
                <div>
                  <div className="k">{SCREEN_TEXT.cellInfluenced}</div>
                  <div className="v hi">
                    <span>{cash(total.influenced).n}<small>{cash(total.influenced).u}</small></span>
                    <span className="qual">{SCREEN_TEXT.qualExpected}</span>
                  </div>
                </div>
                <div>
                  <div className="k">{SCREEN_TEXT.cellPending}</div>
                  <div className="v amber">
                    <span>{num(total.pending)}</span>
                    <span className="plus">+{num(total.pendingLate)}</span>
                    <span className="qual">{SCREEN_TEXT.qualLate}</span>
                  </div>
                </div>
              </div>
              <AdoptionTrend series={total.adoptionSeries} label={SCREEN_TEXT.chartAdoption} />
            </Mod>

            <Mod step="04" title={SCREEN_TEXT.panelDelivery} right>
              <Cells>
                <Cell k={SCREEN_TEXT.cellInDelivery} {...moneyCell(total.inDelivery)} tone="lead" />
                <Cell k={SCREEN_TEXT.cellProjectsLive} v={num(total.projectsLive)} />
                <Cell k={SCREEN_TEXT.cellOnTime} {...pctCell(total.onTime)} tone="hi" />
              </Cells>
              <HealthDonut
                mix={total.healthMix}
                labels={SCREEN_TEXT.healthLabels}
                centreLabel={SCREEN_TEXT.healthCentre}
              />
            </Mod>

            <Mod step="05" title={SCREEN_TEXT.panelCollection} right>
              <Cells>
                <Cell k={SCREEN_TEXT.cellCollected} {...moneyCell(total.collected)} tone="lead" />
                <Cell k={SCREEN_TEXT.cellReceivable} {...moneyCell(total.receivable)} />
                <Cell k={SCREEN_TEXT.cellOverdue} {...moneyCell(total.overdue)} tone="red" />
              </Cells>
              <CashChart
                collected={total.collected}
                receivable={total.receivable}
                overdue={total.overdue}
                series={total.cashSeries}
                labelCollected={SCREEN_TEXT.cashCollected}
                labelOverdue={SCREEN_TEXT.cashOverdue}
                label={SCREEN_TEXT.chartCash}
              />
            </Mod>
          </div>
        </aside>
      </div>
    </div>
  );
}
