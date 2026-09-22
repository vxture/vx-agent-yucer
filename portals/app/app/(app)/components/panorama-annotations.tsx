import type { ReactNode } from "react";

// TD-023 (panorama annotations): LayerLabel, CapBadge, CapFooter - stopgap
// presentation atoms for the account-detail panorama (designed into the
// prototype, no DS equivalent). DS has no "layer label" or "capability
// badge" element; when one ships, these three switch to wrapping it.

const LAYER_BG: Record<string, string> = {
  L1: "bg-[#3b82f6]",
  L2: "bg-[#8b5cf6]",
  L3: "bg-[#f59e0b]",
  L4: "bg-[#10b981]",
  L5: "bg-[#ef4444]",
  L6: "bg-[#ec4899]",
  EV: "bg-[#6b7280]",
};

export function LayerLabel({ layer }: { readonly layer: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[3px] px-[3px] text-[9px] font-extrabold leading-[16px] tracking-wider text-white ${LAYER_BG[layer] ?? "bg-[#6b7280]"}`}
    >
      {layer}
    </span>
  );
}

export function CapBadge({
  tier,
  children,
}: {
  readonly tier: "basic" | "pro" | "pending";
  readonly children: ReactNode;
}) {
  const cls =
    tier === "pro"
      ? "bg-[linear-gradient(135deg,#7c3aed15,#6d28d915)] text-[#7c3aed] border border-[#7c3aed25] dark:bg-[linear-gradient(135deg,#7c3aed20,#6d28d920)] dark:text-[#a78bfa] dark:border-[#7c3aed40]"
      : tier === "pending"
        ? "border border-dashed border-border text-muted-foreground"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-[3px] whitespace-nowrap rounded-[5px] px-[7px] py-[1.5px] text-[9.5px] font-extrabold tracking-wider ${cls}`}
    >
      {children}
    </span>
  );
}

export function CapFooter({ children }: { readonly children: ReactNode }) {
  return (
    <div className="mt-sm border-t border-border pt-xs text-[10px] leading-[1.7] text-muted-foreground">
      {children}
    </div>
  );
}

const LAYER_NAMES: readonly { layer: string; label: string }[] = [
  { layer: "L1", label: "客户档案" },
  { layer: "L2", label: "关系资产" },
  { layer: "L3", label: "增量阵地" },
  { layer: "L4", label: "存量资产" },
  { layer: "L5", label: "客户评估" },
  { layer: "L6", label: "作战方案" },
  { layer: "EV", label: "证据底座" },
];

export function PanoramaLegend({
  basicLabel,
  proLabel,
  pendingLabel,
}: {
  readonly basicLabel: string;
  readonly proLabel: string;
  readonly pendingLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-[10px] rounded-[10px] border border-border bg-card px-[14px] py-[10px] text-[11px] text-muted-foreground">
      {LAYER_NAMES.map((l) => (
        <span key={l.layer} className="inline-flex items-center gap-[4px]">
          <LayerLabel layer={l.layer} />
          {l.label}
        </span>
      ))}
      <span className="ml-auto inline-flex items-center gap-[4px]">
        <CapBadge tier="basic">{basicLabel}</CapBadge>
        {"核心能力"}
      </span>
      <span className="inline-flex items-center gap-[4px]">
        <CapBadge tier="pro">{proLabel}</CapBadge>
        {"高档位"}
      </span>
      <span className="inline-flex items-center gap-[4px]">
        <CapBadge tier="pending">{pendingLabel}</CapBadge>
        {"已设计"}
      </span>
    </div>
  );
}
