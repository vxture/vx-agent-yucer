"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Banner,
  Button,
  Drawer,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  NativeSelect,
  Section,
} from "@vxture/design-ui";
import {
  divisionCode,
  localCode,
  scopePrefix,
  type MarketScope,
} from "../../domains/shared/market-division";
import { useMessages } from "../lib/i18n/provider";
import { FormFields } from "./form-page";
import { removeDivisionAction, saveDivision } from "../admin/division/actions";
import { Tag } from "./tag";

/* 配置区域 - 编辑面, in the order the owner ruled on 2026-09-09:
 *
 *   1. 区域代码   - the frame's prefix is fixed in front of it (CHINA-), and
 *                   a person types only the rest.
 *   2. 区域名称
 *   3. 包括范围   - what this region is made of, derived from the frame and
 *                   read-only here: 全国市场 · 包括为省级.
 *   4. inside that range, the two sources: 引用系统配置 (a preset row, read
 *                   as 五分法-中部 and nothing more) and 选择省份 (the drawer).
 *   5. the answer, as the roster shows it: `JS 江苏` tags across the row.
 *   6. WARNINGS AT THE FOOT OF THE SECTION, as the DS's Banner, and only when
 *                   there is something to warn about - provinces about to be
 *                   taken from another region, or a save that failed. In the
 *                   normal case nothing is there.
 *
 * A PROVINCE ALREADY IN ANOTHER 大区 CAN STILL BE TICKED (owner). It moves
 * here and drops out of the other one - the primary key means it could never
 * have been in two places, so refusing would only send the reader to a second
 * screen to say one thing. What it must not do is move something quietly:
 * the banner names each one, before saving.
 */

export interface ProvinceOption {
  readonly province: string;
  /** The 大区 it sits in now, or null. */
  readonly heldBy: string | null;
  /** `JS 江苏` - the code and the short name, the one shape a province takes
   *  in configuration. */
  readonly tag: string;
  /** Where the five-way carve puts it, and where the seven-way does. */
  readonly five: string;
  readonly seven: string;
}

/** One division out of a shipped carve, offered as a starting point. */
export interface PresetOption {
  readonly key: string;
  readonly code: string;
  readonly name: string;
  readonly provinces: readonly string[];
  /** Which carve it comes from - 五分法 / 七分法 - so two 华东s are distinguishable. */
  readonly from: string;
}

export function DivisionForm(
  { scope, code, name, provinces, options, presets, isNew }:
  {
    /** The frame this region is carved inside (incr/0043). */
    readonly scope: MarketScope;
    readonly code: string;
    readonly name: string;
    readonly provinces: readonly string[];
    readonly options: readonly ProvinceOption[];
    /** Empty when editing: referencing a preset is a way to START one. */
    readonly presets: readonly PresetOption[];
    readonly isNew: boolean;
  },
) {
  const { PLANNING_TEXT, TERRITORY_ERROR } = useMessages();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const prefix = scopePrefix(scope);
  const [local, setLocal] = useState(localCode(scope, code));
  const [nameValue, setName] = useState(name);
  const [chosen, setChosen] = useState<Set<string>>(new Set(provinces));
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  /* 省份标签 - `JS 江苏`, the same shape everywhere configuration shows a
     province (owner, 2026-09-08). The two letters are GB/T 2260's, not a house
     abbreviation. */
  const tagOf = useMemo(() => new Map(options.map((o) => [o.province, o.tag])), [options]);
  /* ORDERED BY THE OPTION LIST, not by the click order: the badges read as a
     stable roster of what this 大区 holds, and a set that reshuffled every
     time somebody unticked one would be unreadable. */
  const chosenList = useMemo(
    () => options.filter((o) => chosen.has(o.province)).map((o) => o.province),
    [options, chosen],
  );
  const matches = useMemo(() => {
    const q = query.trim();
    if (q === "") return options;
    return options.filter(
      (o) =>
        o.province.includes(q)
        || o.tag.toUpperCase().includes(q.toUpperCase())
        || o.five.includes(q)
        || o.seven.includes(q),
    );
  }, [options, query]);

  const toggle = (p: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  /* Which ticks would take a province off another 大区. Shown BEFORE saving,
     because reorganising somebody else's division is exactly the kind of thing
     that should not be a surprise. */
  const takenFrom = useMemo(
    () =>
      options.filter(
        (o) => chosen.has(o.province) && o.heldBy !== null && !provinces.includes(o.province),
      ),
    [options, chosen, provinces],
  );

  const remove = () => {
    setError(null);
    start(async () => {
      const r = await removeDivisionAction(code);
      if (!r.ok) setError(TERRITORY_ERROR[r.error] ?? r.error);
      else router.push("/admin/division");
    });
  };

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await saveDivision({
        code: divisionCode(scope, local),
        name: nameValue.trim(),
        provinces: [...chosen],
      });
      if (!r.ok) setError(TERRITORY_ERROR[r.error] ?? r.error);
      else router.push("/admin/division");
    });
  };

  return (
    /* NO DESCRIPTION HERE: both pages that render this form put the same
       sentence in their ViewHeader, and the two sat one above the other. */
    <Section title={PLANNING_TEXT.divisionFormTitle}>
      <div className="gap-xl flex flex-col">
        {/* 1 + 2. CODE THEN NAME, ON ONE ROW: the code is the anchor and is
            typed first; the name is what everyone reads afterwards. */}
        <FormFields>
          <Field>
            <FieldLabel>{PLANNING_TEXT.divisionCode}</FieldLabel>
            {/* THE PREFIX IS THE FRAME'S, NOT THE PERSON'S. CHINA- sits in the
                addon as a fact; the input holds the half that is theirs. The
                database CHECKs the same composition, so nothing typed here can
                land a code in the wrong frame. */}
            <InputGroup>
              <InputGroupAddon align="start">{prefix}</InputGroupAddon>
              <InputGroupInput
                value={local}
                onChange={(e) => setLocal(e.target.value.toUpperCase())}
                /* The anchor. Editable only while creating: every import and
                   every mapping row keys on it, and a division whose code
                   changed is a new division wearing an old one's history. */
                disabled={!isNew || pending}
              />
            </InputGroup>
            <FieldDescription>
              {isNew ? PLANNING_TEXT.divisionCodePrefixHint : PLANNING_TEXT.divisionCodeHint}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>{PLANNING_TEXT.divisionNameLabel}</FieldLabel>
            <Input value={nameValue} onChange={(e) => setName(e.target.value)} disabled={pending} />
          </Field>
        </FormFields>

        {/* 3. 包括范围 - what this region is made of. Derived from the frame
            and stated rather than asked: a person carving 中国市场 does not
            choose to carve it by province, that is what the frame means. */}
        <FormFields>
          <Field>
            <FieldLabel>{PLANNING_TEXT.divisionIncludes}</FieldLabel>
            <Input value={PLANNING_TEXT.scopeIncludes[scope.kind] ?? scope.kind} readOnly disabled />
          </Field>
        </FormFields>

        {/* 4. INSIDE THAT RANGE, the two sources side by side: take a shipped
            region wholesale, or pick the provinces yourself. */}
        <FormFields>
          {isNew && presets.length > 0 ? (
            <Field>
              <FieldLabel>{PLANNING_TEXT.templateRef}</FieldLabel>
              <NativeSelect
                disabled={pending}
                defaultValue=""
                onChange={(e) => {
                  const p = presets.find((x) => `${x.key}:${x.code}` === e.target.value);
                  if (!p) return;
                  setLocal(localCode(scope, p.code));
                  setName(p.name);
                  setChosen(new Set(p.provinces));
                }}
              >
                <option value="">{PLANNING_TEXT.templateRefNone}</option>
                {/* 五分法-中部, and nothing else: the carve's own list of
                    names belongs in the reset dialog, not in every option. */}
                {presets.map((p) => (
                  <option key={`${p.key}:${p.code}`} value={`${p.key}:${p.code}`}>
                    {PLANNING_TEXT.presetOption(p.from, p.name)}
                  </option>
                ))}
              </NativeSelect>
              <FieldDescription>{PLANNING_TEXT.templateRefWhy}</FieldDescription>
            </Field>
          ) : null}
          <Field>
            {/* NOT 「选择省份」 TWICE: the label names the source, the button
                is the door. */}
            <FieldLabel>{PLANNING_TEXT.divisionPickManual}</FieldLabel>
            {/* THE PICKER IS A DRAWER, not 34 checkboxes on the page: the list
                is long enough that the fields above scrolled away before the
                last province arrived. What stays on the page is the ANSWER. */}
            <div className="w-fit">
              <Button variant="secondary" disabled={pending} onClick={() => setPicking(true)}>
                {PLANNING_TEXT.divisionPick}
              </Button>
            </div>
            <FieldDescription>{PLANNING_TEXT.divisionChosen(chosenList.length)}</FieldDescription>
          </Field>
        </FormFields>

        {/* 5. THE ANSWER, ACROSS THE FULL WIDTH, in the roster's own shape.
            Tags wrap; this is the one part of the form that earns the page's
            width. */}
        <div className="gap-2xs flex flex-wrap items-center">
          {chosenList.length === 0 ? (
            <span className="text-muted-foreground text-body-sm">
              {PLANNING_TEXT.divisionPickEmpty}
            </span>
          ) : (
            chosenList.map((p) => <Tag key={p}>{tagOf.get(p) ?? p}</Tag>)
          )}
        </div>

        <div className="gap-sm flex items-center">
          <Button onClick={submit} disabled={pending}>
            {PLANNING_TEXT.divisionSave}
          </Button>
          {/* REMOVAL IS OFFERED ONLY WHEN IT HOLDS NOTHING, which is the
              foreign key's own rule (ON DELETE RESTRICT) shown rather than
              enforced after the fact. */}
          {!isNew && provinces.length === 0 ? (
            <Button variant="secondary" disabled={pending} onClick={remove}>
              {PLANNING_TEXT.divisionRemove}
            </Button>
          ) : null}
        </div>

        {/* 6. WARNINGS, AT THE FOOT, AS THE DS DRAWS THEM - and absent when
            there is nothing to say. A province about to change hands is a
            warning about somebody else's region; a failed save is a danger
            about this one. Neither is a line of coloured text. */}
        {takenFrom.length > 0 ? (
          <Banner
            tone="warning"
            title={PLANNING_TEXT.divisionMovedTitle(takenFrom.length)}
            description={
              <ul className="gap-2xs flex flex-col">
                {takenFrom.map((o) => (
                  <li key={o.province}>{PLANNING_TEXT.divisionTakenFrom(o.tag, o.heldBy!)}</li>
                ))}
              </ul>
            }
          />
        ) : null}
        {error ? (
          <Banner tone="danger" title={PLANNING_TEXT.divisionSaveFailed} description={error} />
        ) : null}
      </div>

      <Drawer
        open={picking}
        onClose={() => setPicking(false)}
        width="lg"
        title={PLANNING_TEXT.divisionPickTitle}
        description={PLANNING_TEXT.divisionPickWhy}
        closeLabel={PLANNING_TEXT.divisionPickDone}
        footer={
          <div className="gap-sm flex items-center justify-between">
            <span className="text-muted-foreground text-body-sm">
              {PLANNING_TEXT.divisionChosen(chosenList.length)}
            </span>
            <div className="gap-sm flex items-center">
              <Button variant="secondary" onClick={() => setChosen(new Set())}>
                {PLANNING_TEXT.divisionPickClear}
              </Button>
              <Button onClick={() => setPicking(false)}>{PLANNING_TEXT.divisionPickDone}</Button>
            </div>
          </div>
        }
      >
        <div className="gap-sm flex flex-col">
          {/* SEARCHES THE SHORT NAME TOO, because that is the name on the map
              and on every screen that has no room for 内蒙古自治区. */}
          <Input
            value={query}
            placeholder={PLANNING_TEXT.divisionSearch}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length === 0 ? (
            <p className="text-muted-foreground text-body-sm">{PLANNING_TEXT.divisionPickNone}</p>
          ) : null}
          <ul className="gap-2xs flex flex-col">
            {matches.map((o) => (
              <li key={o.province}>
                <label className="gap-sm hover:bg-muted flex items-center rounded-sm px-2xs py-2xs">
                  <input
                    type="checkbox"
                    checked={chosen.has(o.province)}
                    onChange={() => toggle(o.province)}
                  />
                  {/* 前缀: the letter code, in a fixed column so the names
                      beside it line up down the list. */}
                  <span className="text-body-sm w-[3ch] shrink-0 font-medium tabular-nums">
                    {o.tag.slice(0, 2)}
                  </span>
                  <span className="text-body-sm grow">{o.province}</span>
                  {/* 后缀: what each standard carve says about it. */}
                  <span className="text-muted-foreground text-body-sm shrink-0">
                    {PLANNING_TEXT.divisionHintPresets(o.five, o.seven)}
                  </span>
                  {/* Held elsewhere: a warning-toned tag, the DS's own shape
                      for "this has a state you should notice". */}
                  {o.heldBy && !provinces.includes(o.province) ? (
                    <Tag tone="warning">{o.heldBy}</Tag>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </Drawer>
    </Section>
  );
}
