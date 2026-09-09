"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Drawer,
  Field,
  FieldDescription,
  FieldLabel,
  NativeSelect,
  RadioGroup,
  RadioGroupItem,
  useToast,
} from "@vxture/design-ui";
import {
  MARKET_SCOPES,
  PROVINCE_FRAMES,
  provinceFrame,
  type MarketScope,
  type MarketScopeKind,
} from "../../domains/shared/market-division";
import { shortProvince } from "../../domains/shared/provinces";
import { useMessages } from "../lib/i18n/provider";
import { setMarketScopeAction } from "../admin/division/actions";

/* 市场范围 - the frame the regions are carved inside (incr/0043).
 *
 * A BUTTON THAT OPENS A PANEL, and one choice inside it (owner, 2026-09-09:
 * 用一个按钮，展开面板选择一项即可). The rule behind the shape is the one the
 * owner named as the recurring defect: a DISPLAY page shows; CONFIGURATION
 * happens in a sub-page or a panel opened from it. 区域设置's roster is a
 * display page. An inline select in its header was configuration leaking
 * into it - the same mistake as a picker inside a table row, one level up.
 *
 * THE PANEL IS A DRAWER, not a dialog (owner: 可以抽屉侧栏展示，弹出面板不一定
 * 好布局). The choice is two-step for a province frame - which frame, then
 * WHICH PROVINCE (owner: 选择省级时需要确定是哪个省的市场) - and a dialog that
 * grows a second field when a radio is ticked jumps; a drawer has the height.
 *
 * WHAT THE BUTTON SAYS is the whole current answer: 市场范围 · 省级市场 · 陕西.
 * A province frame without its province is not a frame, so the label never
 * shows one without the other.
 */
export function MarketScopeControl({
  scope,
  editable,
}: {
  readonly scope: MarketScope;
  readonly editable: boolean;
}) {
  const { DS_LABELS, PLANNING_TEXT, TERRITORY_ERROR } = useMessages();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<MarketScopeKind>(scope.kind);
  const [province, setProvince] = useState<string>(scope.code ?? PROVINCE_FRAMES[0]?.code ?? "");
  const { toast } = useToast();

  const current = (s: MarketScope) => {
    const label = PLANNING_TEXT.scopeLabel[s.kind] ?? s.kind;
    const frame = s.kind === "province" ? provinceFrame(s.code) : null;
    return frame ? PLANNING_TEXT.scopeProvinceFrame(label, shortProvince(frame.province)) : label;
  };
  const next: MarketScope = { kind: chosen, code: chosen === "province" ? province : null };
  const unchanged = next.kind === scope.kind && next.code === scope.code;

  const reset = () => {
    setChosen(scope.kind);
    setProvince(scope.code ?? PROVINCE_FRAMES[0]?.code ?? "");
  };
  const submit = () =>
    start(async () => {
      const r = await setMarketScopeAction(next);
      if (!r.ok) {
        toast({ tone: "danger", title: TERRITORY_ERROR[r.error] ?? r.error });
      } else {
        toast({ tone: "success", title: PLANNING_TEXT.scopeSaved });
        setOpen(false);
      }
    });

  return (
    <>
      <Button
        variant="secondary"
        disabled={!editable}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {PLANNING_TEXT.scopeButton(current(scope))}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width="sm"
        title={PLANNING_TEXT.scopeLabelTitle}
        description={PLANNING_TEXT.scopeWhy}
        closeLabel={PLANNING_TEXT.scopeCancel}
        footer={
          <div className="gap-sm flex items-center justify-end">
            <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
              {PLANNING_TEXT.scopeCancel}
            </Button>
            <Button disabled={unchanged || pending} onClick={submit}>
              {pending ? DS_LABELS.confirmPending : PLANNING_TEXT.scopeConfirm}
            </Button>
          </div>
        }
      >
        <div className="gap-xl flex flex-col">
          <RadioGroup
            value={chosen}
            onValueChange={(v) => setChosen(v as MarketScopeKind)}
            className="gap-md flex flex-col"
          >
            {MARKET_SCOPES.map((s) => (
              <label className="gap-sm flex items-start" key={s.kind} htmlFor={`scope-${s.kind}`}>
                <RadioGroupItem id={`scope-${s.kind}`} value={s.kind} disabled={!s.open || pending} className="mt-2xs" />
                <span className="gap-2xs flex flex-col">
                  <span className="text-body font-semibold">
                    {PLANNING_TEXT.scopeLabel[s.kind]}
                    {s.open ? "" : ` · ${PLANNING_TEXT.scopePlanned}`}
                  </span>
                  <span className="text-muted-foreground text-body-sm">
                    {PLANNING_TEXT.scopeIncludes[s.kind]}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>

          {/* THE SECOND HALF OF A PROVINCE FRAME. Offered only once 省级市场 is
              ticked, and only the provinces the product has opened - 陕西
              first. The rule behind the short list is setMarketScope's
              scope_province_not_open. */}
          {chosen === "province" ? (
            <Field>
              <FieldLabel>{PLANNING_TEXT.scopeProvinceLabel}</FieldLabel>
              <NativeSelect
                value={province}
                disabled={pending}
                onChange={(e) => setProvince(e.target.value)}
              >
                {PROVINCE_FRAMES.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.province}
                  </option>
                ))}
              </NativeSelect>
              <FieldDescription>
                {PLANNING_TEXT.scopeProvinceOpen(PROVINCE_FRAMES.map((f) => shortProvince(f.province)))}
              </FieldDescription>
            </Field>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}
