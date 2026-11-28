"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Button,
  Card,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  type CategorySeries,
} from "@vxture/design-system";
import { useLocale } from "../lib/i18n/provider";
import { attainmentCopy } from "./copy";
import styles from "./business-charts.module.css";

type Point = { key: string; label: string; value: number };
type Props = {
  title: string;
  note?: string;
  data: Point[];
  series: CategorySeries[];
  format: (value: number) => string;
  variant?: "horizontal" | "rate" | "stacked" | "line" | "donut" | "matrix";
  referenceValue?: number;
  selectedKey?: string | null;
  onSelectKey?: (key: string | null) => void;
  hoverKey?: string | null;
  onHoverKey?: (key: string | null) => void;
  renderLabel?: (point: Point) => ReactNode;
  categoryColors?: boolean;
  tooltipMatrix?: { rowLabel: string; unit?: string };
};
const ink = (index: number) => `var(--chart-${(index % 5) + 1})`;
const number = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);
function niceMaximum(value: number) {
  const raw = Math.max(1, value) / 4,
    power = 10 ** Math.floor(Math.log10(raw));
  return (
    ([1, 1.5, 2, 2.5, 5, 10].find((n) => n >= raw / power) ?? 10) * power * 4
  );
}
function Tip({
  title,
  rows,
  content,
  children,
}: {
  title: string;
  rows: { label: string; value: string }[];
  content?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent variant="surface">
        <div className={`${styles.tip} max-w-overlay-md`}>
          <strong>{title}</strong>
          {content ?? <dl>
            {rows.map((r, i) => (
              <div key={i}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
function Legend({
  series,
  hidden,
  toggle,
  hoverKey,
  onHoverKey,
}: {
  series: CategorySeries[];
  hidden?: string[];
  toggle?: (key: string) => void;
  hoverKey?: string | null;
  onHoverKey?: (key: string | null) => void;
}) {
  return (
    <div className={styles.legend}>
      {series.map((s, i) =>
        toggle ? (
          <Button
            key={s.key}
            size="md"
            variant="ghost"
            aria-pressed={!hidden?.includes(s.key)}
            className={styles.legendToggle}
            data-chart-key={s.key}
            data-dimmed={!!hoverKey && hoverKey !== s.key}
            onPointerEnter={() => onHoverKey?.(s.key)}
            onPointerLeave={() => onHoverKey?.(null)}
            onFocus={() => onHoverKey?.(s.key)}
            onBlur={() => onHoverKey?.(null)}
            onClick={() => toggle(s.key)}
          >
            <i style={{ background: ink(i) }} />
            {s.label}
          </Button>
        ) : (
          <span key={s.key}>
            <i style={{ background: ink(i) }} />
            {s.label}
          </span>
        ),
      )}
    </div>
  );
}
function Tracks({
  data,
  series,
  format,
  variant,
  selectedKey,
  onSelectKey,
  renderLabel,
  categoryColors,
  referenceValue,
  hoverKey,
  onHoverKey,
}: Props) {
  const T = attainmentCopy(useLocale());
  const stacked = variant === "stacked",
    rate = variant === "rate";
  const totals = data.map((d) => {
    const values = series.map((s) => s.values[d.key]);
    return values.every(number) ? values.reduce((n, v) => n + v, 0) : null;
  });
  const extent = (index: number) =>
    Math.max(
      0,
      totals[index] ?? 0,
      ...series.map((s) => s.references?.[data[index]!.key] ?? 0),
      referenceValue ?? 0,
    ) * 1.08;
  const maximum = niceMaximum(Math.max(1, ...data.map((_, i) => extent(i))));
  const percent = (value: number) =>
    `${Math.max(0, Math.min(100, (value / maximum) * 100))}%`;
  return (
    <div
      className={styles.trackPlot}
      data-chart-layout={rate ? "rate" : variant}
      data-chart-labels={renderLabel ? "people" : "regions"}
    >
      <div className={styles.trackRows}>
        {data.map((d, i) => {
          const total = totals[i] ?? null,
            reference = series[0]?.references?.[d.key] ?? referenceValue;
          let offset = 0;
          const color = ink(categoryColors ? i : 0);
          const rows = series.map((s) => ({
            label: s.label,
            value: number(s.values[d.key])
              ? format(s.values[d.key]!)
              : T.unknown,
          }));
          if (number(reference))
            rows.push({
              label: series[0]?.referenceLabel ?? T.target,
              value: format(reference),
            });
          return (
            <Tip key={d.key} title={d.label} rows={rows}>
              <button
                type="button"
                data-control-kind="structural"
                className={styles.trackRow}
                data-selected={selectedKey === d.key}
                data-chart-key={d.key}
                data-hovered={hoverKey === d.key}
                data-dimmed={!!(hoverKey ?? selectedKey) && (hoverKey ?? selectedKey) !== d.key}
                onPointerEnter={() => onHoverKey?.(d.key)}
                onPointerLeave={() => onHoverKey?.(null)}
                onFocus={() => onHoverKey?.(d.key)}
                onBlur={() => onHoverKey?.(null)}
                aria-label={`${d.label}; ${rows.map((r) => `${r.label} ${r.value}`).join("; ")}`}
                aria-pressed={onSelectKey ? selectedKey === d.key : undefined}
                onClick={() =>
                  onSelectKey?.(selectedKey === d.key ? null : d.key)
                }
              >
                <span className={styles.rowLabel} title={d.label}>
                  {renderLabel ? renderLabel(d) : d.label}
                </span>
                <span className={styles.trackSlot}>
                  <span className={styles.trackGrid} aria-hidden>
                    {[0, 25, 50, 75, 100].map((v) => (
                      <i key={v} style={{ left: `${v}%` }} />
                    ))}
                  </span>
                  {extent(i) > 0 && (
                    <span
                      className={styles.trackBack}
                      style={{ width: percent(extent(i)) }}
                    />
                  )}
                  {series.map((s, index) => {
                    const value = s.values[d.key],
                      start = offset;
                    offset += number(value) ? value : 0;
                    return number(value) ? (
                      <span
                        key={s.key}
                        className={styles.trackFill}
                        data-rate={rate}
                        style={{
                          left: percent(stacked ? start : 0),
                          width: percent(value),
                          background: stacked ? ink(index) : color,
                        }}
                      >
                        {rate && <i style={{ background: color }} />}
                      </span>
                    ) : null;
                  })}
                  {number(reference) && (
                    <i
                      className={styles.targetTick}
                      style={{ left: percent(reference) }}
                    />
                  )}
                </span>
                <span className={styles.rowValue}>
                  {total === null ? "\u2014" : format(total)}
                </span>
              </button>
            </Tip>
          );
        })}
      </div>
      <div className={styles.trackAxis}>
        <span />
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <span key={v}>{format(maximum * v)}</span>
        ))}
        <span />
      </div>
    </div>
  );
}
function Trend({ data, series, format, title, hoverKey, onHoverKey, tooltipMatrix }: Props) {
  const [hidden, setHidden] = useState<string[]>([]),
    ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 520, height: 240, space: 16 });
  const T = attainmentCopy(useLocale());
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setSize({
        width: el.clientWidth,
        height: el.clientHeight,
        space:
          parseFloat(getComputedStyle(el).getPropertyValue("--space-md")) || 16,
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const visible = series.filter((s) => !hidden.includes(s.key));
  const { width: W, height: H, space: s } = size,
    left = s * 4,
    right = s * 1.5,
    top = s,
    bottom = s * 1.8;
  const maximum = niceMaximum(
    Math.max(
      1,
      ...visible.flatMap((line) =>
        [
          ...Object.values(line.values),
          ...Object.values(line.references ?? {}),
        ].filter(number),
      ),
    ),
  );
  const x = (i: number) =>
      left + ((W - left - right) * i) / Math.max(1, data.length - 1),
    y = (v: number) => H - bottom - ((H - top - bottom) * v) / maximum;
  const path = (values: Record<string, number | null>) =>
    data
      .map((d, i) =>
        number(values[d.key])
          ? `${i === 0 || !number(values[data[i - 1]!.key]) ? "M" : "L"}${x(i)},${y(values[d.key]!)}`
          : "",
      )
      .join(" ");
  const tipTitle = (point: Point) => tooltipMatrix?.unit
    ? `${point.key} \u00b7 ${tooltipMatrix.unit}` : point.key;
  const comparison = (point: Point, highlighted?: string) => tooltipMatrix && (
    <table className={styles.comparisonTip} aria-label={tipTitle(point)}>
      <thead>
        <tr>
          <th scope="col">{tooltipMatrix.rowLabel}</th>
          <th scope="col">{T.target}</th>
          <th scope="col">{T.actual}</th>
        </tr>
      </thead>
      <tbody>
        {visible.map((line) => (
          <tr key={line.key} data-highlighted={highlighted === line.key}>
            <th scope="row">
              <span className={styles.comparisonLabel}>
                <i style={{ background: ink(series.findIndex((s) => s.key === line.key)) }} aria-hidden="true" />
                {line.label}
              </span>
            </th>
            <td className="text-muted-foreground">
              {number(line.references?.[point.key]) ? format(line.references![point.key]!) : T.noTarget}
            </td>
            <td>{number(line.values[point.key]) ? format(line.values[point.key]!) : T.unknown}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div className={styles.trend}>
      {series.length > 1 && (
        <Legend
          series={series}
          hidden={hidden}
          hoverKey={hoverKey}
          onHoverKey={onHoverKey}
          toggle={(key) =>
            setHidden((prev) =>
              prev.includes(key)
                ? prev.filter((k) => k !== key)
                : [...prev, key],
            )
          }
        />
      )}
      <div ref={ref} className={styles.trendSurface} data-chart-layout="line">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${W} ${H}`}
          aria-label={title}
          role="group"
        >
          <g className={styles.svgGrid}>
            {[0, 0.5, 1].map((v) => (
              <g key={v}>
                <line
                  x1={left}
                  x2={W - right}
                  y1={y(maximum * v)}
                  y2={y(maximum * v)}
                />
                <text
                  x={left - s * 0.5}
                  y={y(maximum * v) + s * 0.25}
                  textAnchor="end"
                >
                  {format(maximum * v)}
                </text>
              </g>
            ))}
            {data.map((d, i) => (
              <text key={d.key} x={x(i)} y={H - s * 0.4} textAnchor="middle">
                {d.label}
              </text>
            ))}
          </g>
          {series.map((line, index) =>
            hidden.includes(line.key) ? null : (
              <g key={line.key} data-chart-key={line.key}
                data-dimmed={!!hoverKey && hoverKey !== line.key}
                className={styles.trendSeries}>
                {line.references && (
                  <path
                    d={path(line.references)}
                    fill="none"
                    stroke={
                      series.length === 1 ? "var(--chart-axis)" : ink(index)
                    }
                    className={styles.referenceLine}
                  />
                )}
                <path
                  d={path(line.values)}
                  fill="none"
                  stroke={ink(index)}
                  className={styles.actualLine}
                />
                {data.map((d, i) =>
                  number(line.values[d.key]) ? (
                    <circle
                      key={d.key}
                      cx={x(i)}
                      cy={y(line.values[d.key]!)}
                      r={s * 0.22}
                      fill={ink(index)}
                      className={styles.point}
                    />
                  ) : null,
                )}
              </g>
            ),
          )}
          {visible.length ? (
            data.map((d, i) => (
              <Tip
                key={d.key}
                title={tipTitle(d)}
                content={comparison(d)}
                rows={visible.flatMap((line) => [
                  {
                    label: `${line.label} \u00b7 ${T.actual}`,
                    value: number(line.values[d.key])
                      ? format(line.values[d.key]!)
                      : T.unknown,
                  },
                  ...(line.references
                    ? [
                        {
                          label: `${line.label} \u00b7 ${line.referenceLabel ?? T.target}`,
                          value: number(line.references[d.key])
                            ? format(line.references[d.key]!)
                            : T.noTarget,
                        },
                      ]
                    : []),
                ])}
              >
                <g
                  tabIndex={0}
                  role="group"
                  aria-label={`${d.key}; ${visible.map((line) => `${line.label} ${number(line.values[d.key]) ? format(line.values[d.key]!) : T.unknown}`).join("; ")}`}
                  className={styles.trendHit}
                >
                  <rect
                    x={
                      i
                        ? x(i) -
                          (W - left - right) / Math.max(1, data.length - 1) / 2
                        : left - s
                    }
                    y={top}
                    width={
                      ((W - left - right) / Math.max(1, data.length - 1)) *
                        (i === 0 || i === data.length - 1 ? 0.5 : 1) +
                      s
                    }
                    height={H - top - bottom}
                    fill="transparent"
                  />
                  <line x1={x(i)} x2={x(i)} y1={top} y2={H - bottom} />
                </g>
              </Tip>
            ))
          ) : (
            <text
              x={W / 2}
              y={H / 2}
              textAnchor="middle"
              className={styles.noSeries}
            >
              {T.chooseSeries}
            </text>
          )}
          {visible.map((line) => (
            <g key={line.key} aria-hidden="true"
              onPointerEnter={() => onHoverKey?.(line.key)}
              onPointerLeave={() => onHoverKey?.(null)}>
              {[line.values, line.references].map((values, index) => values ? (
                <path key={index} d={path(values)} fill="none" stroke="transparent"
                  className={styles.trendLineHit} data-chart-line={line.key} />
              ) : null)}
            </g>
          ))}
          {visible.map((line) => data.map((d, i) => number(line.values[d.key]) ? (
            <Tip key={`${line.key}-${d.key}`} title={tooltipMatrix ? tipTitle(d) : `${line.label} \u00b7 ${d.label}`}
              content={comparison(d, line.key)}
              rows={[
                { label: T.actual, value: format(line.values[d.key]!) },
                ...(line.references ? [{ label: line.referenceLabel ?? T.target,
                  value: number(line.references[d.key]) ? format(line.references[d.key]!) : T.noTarget }] : []),
              ]}>
              <circle cx={x(i)} cy={y(line.values[d.key]!)} r={s * 0.6}
                className={styles.trendPointHit}
                fill="transparent" tabIndex={0} data-chart-point={line.key}
                aria-label={`${line.label}; ${d.label}; ${format(line.values[d.key]!)}`}
                onPointerEnter={() => onHoverKey?.(line.key)}
                onPointerLeave={() => onHoverKey?.(null)}
                onFocus={() => onHoverKey?.(line.key)}
                onBlur={() => onHoverKey?.(null)} />
            </Tip>
          ) : null))}
        </svg>
      </div>
    </div>
  );
}
function Distribution({ data, series, format, hoverKey, onHoverKey }: Props) {
  const T = attainmentCopy(useLocale()),
    [hovered, setHovered] = useState<string | null>(null),
    values = data.map((d) => series[0]?.values[d.key] ?? null),
    total = values.every(number) ? values.reduce((n, v) => n + v, 0) : null;
  let offset = 0;
  return (
    <div className={styles.distribution} data-chart-layout="donut">
      <svg
        viewBox="0 0 200 200"
        className={styles.donut}
        role="img"
        aria-label={`${T.gapShare}; ${total === null ? T.unknown : format(total)}`}
      >
        <circle
          cx={100}
          cy={100}
          r={78}
          fill="none"
          className={styles.donutBack}
        />
        {total !== null &&
          total > 0 &&
          data.map((d, i) => {
            const portion = (values[i]! / total) * 100,
              start = offset;
            offset += portion;
            return portion > 0 ? (
              <circle
                key={d.key}
                cx={100}
                cy={100}
                r={78}
                fill="none"
                stroke={ink(i)}
                pathLength={100}
                strokeDasharray={`${Math.max(0, portion - 0.5)} ${100 - Math.max(0, portion - 0.5)}`}
                strokeDashoffset={-start}
                transform="rotate(-90 100 100)"
                className={styles.donutArc}
                data-chart-key={d.key}
                data-dimmed={!!(hoverKey ?? hovered) && (hoverKey ?? hovered) !== d.key}
                onPointerEnter={() => { setHovered(d.key); onHoverKey?.(d.key); }}
                onPointerLeave={() => { setHovered(null); onHoverKey?.(null); }}
              />
            ) : null;
          })}
        <text x={100} y={96} textAnchor="middle" className={styles.donutValue}>
          {total === null ? "\u2014" : format(total)}
        </text>
        <text
          x={100}
          y={119}
          textAnchor="middle"
          className={styles.donutCaption}
        >
          {T.gapTotal}
        </text>
      </svg>
      <div className={styles.distributionRows}>
        {data.map((d, i) => (
          <Tip
            key={d.key}
            title={d.label}
            rows={[
              {
                label: T.remaining,
                value: number(values[i]) ? format(values[i]!) : T.unknown,
              },
              {
                label: T.share,
                value:
                  total !== null && total > 0 && number(values[i])
                    ? `${((values[i]! / total) * 100).toFixed(1)}%`
                    : "\u2014",
              },
            ]}
          >
            <button
              type="button"
              data-control-kind="structural"
              data-chart-key={d.key}
              data-hovered={hoverKey === d.key}
              data-dimmed={!!(hoverKey ?? hovered) && (hoverKey ?? hovered) !== d.key}
              onPointerEnter={() => { setHovered(d.key); onHoverKey?.(d.key); }}
              onPointerLeave={() => { setHovered(null); onHoverKey?.(null); }}
              onFocus={() => { setHovered(d.key); onHoverKey?.(d.key); }}
              onBlur={() => { setHovered(null); onHoverKey?.(null); }}
            >
              <i style={{ background: ink(i) }} />
              <span>{d.label}</span>
              <strong>
                {number(values[i]) ? format(values[i]!) : "\u2014"}
              </strong>
            </button>
          </Tip>
        ))}
      </div>
    </div>
  );
}
function Matrix({
  data,
  series,
  format,
  renderLabel,
  selectedKey,
  onSelectKey,
  hoverKey,
  onHoverKey,
}: Props) {
  const T = attainmentCopy(useLocale());
  return (
    <div
      className={styles.matrix}
      data-chart-layout="matrix"
      style={{ "--matrix-columns": series.length } as CSSProperties}
    >
      <div className={styles.matrixHead}>
        <span />
        {series.map((s) => (
          <span key={s.key}>{s.label}</span>
        ))}
      </div>
      {data.map((d) => (
        <div
          key={d.key}
          className={styles.matrixRow}
          data-chart-key={d.key}
          data-hovered={hoverKey === d.key}
          data-dimmed={!!(hoverKey ?? selectedKey) && (hoverKey ?? selectedKey) !== d.key}
          onPointerEnter={() => onHoverKey?.(d.key)}
          onPointerLeave={() => onHoverKey?.(null)}
          onFocus={() => onHoverKey?.(d.key)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) onHoverKey?.(null);
          }}
        >
          <button
            type="button"
            data-control-kind="structural"
            className={styles.rowLabel}
            title={d.label}
            aria-pressed={selectedKey === d.key}
            onClick={() => onSelectKey?.(selectedKey === d.key ? null : d.key)}
          >
            {renderLabel ? renderLabel(d) : d.label}
          </button>
          {series.map((s) => {
            const value = s.values[d.key];
            return (
              <Tip
                key={s.key}
                title={d.label}
                rows={[
                  {
                    label: s.label,
                    value: number(value) ? format(value) : T.unknown,
                  },
                ]}
              >
                <button
                  type="button"
                  data-control-kind="structural"
                  className={styles.matrixCell}
                  data-attention={number(value) && value > 0}
                  aria-pressed={selectedKey === d.key}
                  onClick={() =>
                    onSelectKey?.(selectedKey === d.key ? null : d.key)
                  }
                >
                  {number(value) ? format(value) : "\u2014"}
                </button>
              </Tip>
            );
          })}
        </div>
      ))}
    </div>
  );
}
export function AttainmentChart(props: Props) {
  const T = attainmentCopy(useLocale()),
    variant = props.variant ?? "horizontal";
  return (
    <Card className={styles.panel} data-control-size="preserve">
      <header className={styles.heading}>
        <div>
          <h2>{props.title}</h2>
          {props.note && <p>{props.note}</p>}
        </div>
        {(variant === "horizontal" || variant === "stacked") && (
          <div className={styles.legend}>
            {variant === "stacked" ? (
              <Legend series={props.series} />
            ) : (
              <span>
                <i style={{ background: ink(0) }} />
                {T.actual}
              </span>
            )}
            <span>
              <i data-kind="tick" />
              {props.series[0]?.referenceLabel ?? T.target}
            </span>
          </div>
        )}
        {variant === "line" && (
          <div className={styles.legend}>
            <span>
              <i data-kind="line" />
              {T.actual}
            </span>
            <span>
              <i data-kind="dash" />
              {T.target}
            </span>
          </div>
        )}
      </header>
      {variant === "line" ? (
        <Trend {...props} />
      ) : variant === "donut" ? (
        <Distribution {...props} />
      ) : variant === "matrix" ? (
        <Matrix {...props} />
      ) : (
        <Tracks {...props} variant={variant} />
      )}
    </Card>
  );
}
