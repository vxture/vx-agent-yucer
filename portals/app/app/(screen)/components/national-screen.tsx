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

/* --- The panel primitives ----------------------------------------------------
   Six panels of the same shape: a title with its step, ONE hero figure, at most
   two secondary cells on one line, and an optional bar strip. The shape is the
   point - a panel that invents its own layout makes the rail read as six
   unrelated widgets rather than one instrument. */

function Panel(
  { step, title, grow, children }:
  { step: string; title: string; grow?: boolean; children: React.ReactNode },
) {
  return (
    <section className={`screen-mod${grow ? " screen-mod-grow" : ""}`}>
      <div className="screen-mod-hd">
        <h2>{title}</h2>
        <span className="screen-step">{step}</span>
      </div>
      {children}
    </section>
  );
}

/** The one big number. `unit` is separated so it can be set smaller. */
function Lead({ value, unit, label }: { value: string; unit?: string; label?: string }) {
  return (
    <>
      <div className="screen-lead">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
      {label ? <div className="screen-sub">{label}</div> : null}
    </>
  );
}

const Cells = ({ children }: { children: React.ReactNode }) => (
  <div className="screen-cells">{children}</div>
);

function Cell(
  { k, v, warn, danger, hi }:
  { k: string; v: string; warn?: boolean; danger?: boolean; hi?: boolean },
) {
  // The tone is the READING's meaning, not a palette position: an overdue
  // figure is the product's danger, an unclaimed lead is merely waiting.
  const tone = danger ? " danger" : warn ? " warn" : hi ? " hi" : "";
  return (
    <div className="screen-cell">
      <span className="k">{k}</span>
      <b className={`v${tone}`}>{v}</b>
    </div>
  );
}

/**
 * The bar strip: the scope's leading provinces on one measure.
 *
 * The value sits small beside its bar and grows on hover (owner, 2026-09-07) -
 * six figures at full size would out-shout the hero number the panel is built
 * around, and hiding them entirely makes the bars decorative.
 */
function Bars(
  { rows, fmt }: { rows: readonly { province: string; value: number }[]; fmt: (v: number) => string },
) {
  if (rows.length === 0) return null;
  const top = rows[0]!.value || 1;
  return (
    <ul className="screen-bars">
      {rows.map((r) => (
        <li key={r.province}>
          <span className="p">{shortProvince(r.province)}</span>
          <i><em style={{ width: `${Math.max(2, (r.value / top) * 100)}%` }} /></i>
          <b>{fmt(r.value)}</b>
        </li>
      ))}
    </ul>
  );
}

/**
 * The fold bracket, one per rail.
 *
 * ONE GRAPHIC, MIRRORED (owner, 2026-09-07): the right-hand bracket is the left
 * one flipped, never a second shape. Both drive the SAME state, so either click
 * folds and unfolds both rails together - the rails are one gesture, not two
 * independent panels. The caret points where the rail is ABOUT to go, which is
 * the direction a reader checks before clicking, not the one it came from.
 */
function FoldArc(
  { side, folded, onToggle, label }:
  { side: "l" | "r"; folded: boolean; onToggle: () => void; label: string },
) {
  return (
    <button
      type="button"
      className={`screen-arc screen-arc-${side}${folded ? " folded" : ""}`}
      aria-expanded={!folded}
      aria-label={label}
      onClick={onToggle}
    >
      <span aria-hidden />
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

  const pct = (v: number | null) =>
    v === null ? SCREEN_TEXT.noReading : `${(v * 100).toFixed(1)}%`;
  const moneyLead = (v: number) => {
    const m = cash(v);
    return { value: m.n, unit: m.u };
  };
  /* The leading provinces IN THE CURRENT SCOPE on one measure. Drilling into a
     region re-ranks against that region, so a panel never shows a province the
     map is not drawing. Zero-valued rows are dropped rather than drawn as a
     stub: an empty bar says "we measured nothing here", which is not the same
     as "there is nothing here". */
  const rankBy = (read: (p: ProvinceRollup) => number) =>
    [...scope]
      .map((p) => ({ province: p.province, value: read(p) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

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
    <div className="screen">
      <div className="screen-hex" aria-hidden />

      <header className="screen-head">
        <div className="screen-head-l">
          <Link className="screen-home" href="/">← {SCREEN_TEXT.home}</Link>
          <span className="screen-chip">
            <b>{SCREEN_TEXT.provinceCount}</b>
            <i>{scope.filter((p) => p.accounts > 0).length}</i>
          </span>
          <span className="screen-chip">
            <b>{SCREEN_TEXT.openDeals}</b>
            <i>{num(total.openDeals)}</i>
          </span>
        </div>

        <div className="screen-title">
          <h1>{SCREEN_TEXT.title}</h1>
          <p>{SCREEN_TEXT.subtitle}</p>
        </div>

        <div className="screen-head-r">
          {rollup.unplacedAccounts > 0 ? (
            // SAID OUT LOUD. These accounts are in the national total and on no
            // province, so without this line the map and the header disagree
            // and nothing explains why.
            <span className="screen-note">
              {SCREEN_TEXT.unplacedNote(rollup.unplacedAccounts)}
            </span>
          ) : null}
          <span className="screen-viewer" title={viewerSub}>{viewerSub}</span>
        </div>
      </header>

      <div className="screen-deck">
        <aside className={`screen-rail${railsFolded ? " folded" : ""}`}>
          <Panel step="01" title={SCREEN_TEXT.panelLeads}>
            <Lead value={num(total.leadsNew)} label={SCREEN_TEXT.cellLeadsNew} />
            <Cells>
              <Cell k={SCREEN_TEXT.cellLeadsUnclaimed} v={num(total.leadsUnclaimed)} warn={total.leadsUnclaimed > 0} />
              <Cell k={SCREEN_TEXT.cellLeadConversion} v={pct(total.leadConversion)} />
            </Cells>
            <Bars rows={rankBy((p) => p.leads)} fmt={(v) => num(v)} />
          </Panel>

          <Panel step="02" title={SCREEN_TEXT.panelPipeline}>
            <Lead {...moneyLead(total.pipelineValue)} label={SCREEN_TEXT.cellPipelineValue} />
            <Cells>
              <Cell k={SCREEN_TEXT.cellOpenDeals} v={num(total.openDeals)} />
              <Cell
                k={SCREEN_TEXT.cellAvgDeal}
                v={total.openDeals === 0 ? SCREEN_TEXT.noReading
                  : cash(total.pipelineValue / total.openDeals).n + cash(total.pipelineValue / total.openDeals).u}
              />
            </Cells>
          </Panel>

          <Panel step="03" title={SCREEN_TEXT.panelContract} grow>
            <Lead {...moneyLead(total.contractValue)} label={SCREEN_TEXT.cellContractValue} />
            <Cells>
              <Cell k={SCREEN_TEXT.cellWonDeals} v={num(total.wonDeals)} />
              <Cell k={SCREEN_TEXT.cellWinRate} v={pct(total.winRate)} />
            </Cells>
            <Bars rows={rankBy((p) => p.contractValue)} fmt={(v) => cash(v).n + cash(v).u} />
          </Panel>
        </aside>

        <FoldArc
          side="l"
          folded={railsFolded}
          onToggle={() => setRailsFolded((v) => !v)}
          label={railsFolded ? SCREEN_TEXT.unfoldRails : SCREEN_TEXT.foldRails}
        />

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

        <FoldArc
          side="r"
          folded={railsFolded}
          onToggle={() => setRailsFolded((v) => !v)}
          label={railsFolded ? SCREEN_TEXT.unfoldRails : SCREEN_TEXT.foldRails}
        />

        <aside className={`screen-rail screen-rail-r${railsFolded ? " folded" : ""}`}>
          {/* 智能副驾 at the top, where the eye lands first (owner, 2026-09-07).
              主副 layout: one hero figure, the rest kept to a single line each,
              because four flat numbers in a column read as a table nobody
              totals. */}
          <Panel title={SCREEN_TEXT.panelCopilot} step="AI">
            <Lead value={pct(total.adoption)} label={SCREEN_TEXT.cellAdoption} />
            <div className="screen-note">
              {SCREEN_TEXT.cellAdoptionSub(total.accepted30, total.proposals30)}
            </div>
            <Cells>
              <Cell k={SCREEN_TEXT.cellPending} v={num(total.pending)} warn={total.pending > 0} />
            </Cells>
          </Panel>

          <Panel step="04" title={SCREEN_TEXT.panelDelivery}>
            <Lead {...moneyLead(total.inDelivery)} label={SCREEN_TEXT.cellInDelivery} />
            <Cells>
              <Cell k={SCREEN_TEXT.cellProjectsLive} v={num(total.projectsLive)} />
              <Cell k={SCREEN_TEXT.cellHealth} v={pct(total.healthRate)} hi />
            </Cells>
          </Panel>

          <Panel step="05" title={SCREEN_TEXT.panelCollection} grow>
            <Lead {...moneyLead(total.collected)} label={SCREEN_TEXT.cellCollected} />
            <Cells>
              <Cell
                k={SCREEN_TEXT.cellReceivable}
                v={cash(total.receivable).n + cash(total.receivable).u}
              />
              <Cell
                k={SCREEN_TEXT.cellOverdue}
                v={cash(total.overdue).n + cash(total.overdue).u}
                danger={total.overdue > 0}
              />
            </Cells>
            <Bars rows={rankBy((p) => p.collected)} fmt={(v) => cash(v).n + cash(v).u} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
