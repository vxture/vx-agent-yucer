"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Button,
  Drawer,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { removeDivisionAction, saveDivision } from "../admin/division/actions";

/* 配置大区 - 编辑面. Separate from the roster on purpose: the list answers
 * "how is the market carved", this answers "carve it differently", and putting
 * a picker inside a row made the page do both at once.
 *
 * A PROVINCE ALREADY IN ANOTHER 大区 CAN STILL BE TICKED (owner). It moves
 * here and drops out of the other one - the primary key means it could never
 * have been in two places, so refusing would only send the reader to a second
 * screen to say one thing. What it must not do is move something quietly: each
 * such province is labelled with where it currently sits, before saving.
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
  /** Which carve it comes from, so two 华东s are distinguishable. */
  readonly from: string;
}

export function DivisionForm(
  { code, name, provinces, options, presets, isNew }:
  {
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

  const [codeValue, setCode] = useState(code);
  const [nameValue, setName] = useState(name);
  const [chosen, setChosen] = useState<Set<string>>(new Set(provinces));
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  /* 省份标签 - `JS 江苏`, the same shape everywhere configuration shows a
     province (owner, 2026-09-08). The two letters are GB/T 2260's, not a house
     abbreviation. */
  const tagOf = useMemo(
    () => new Map(options.map((o) => [o.province, o.tag])),
    [options],
  );
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
        code: codeValue.trim(),
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
      {error ? <p className="text-destructive text-body-sm" role="alert">{error}</p> : null}

      {/* THE PAGE IS FULL WIDTH; THE CONTROLS ARE NOT (owner, 2026-09-08).
          A text field stretched across 1400px is harder to read and harder to
          aim at than one sized to its content, and a code is eight characters
          - the field should not be able to hold eighty. The grid caps at a
          reading measure and the page keeps the rest of its width for the
          province tags below, which actually use it. */}
      <div className="gap-md flex max-w-(--vx-container-md) flex-col">
        {/* CODE THEN NAME, ON ONE ROW (owner): the code is the anchor and is
            typed first; the name is what everyone reads afterwards. Two short
            fields stacked into two rows made the form look longer than the
            decision it is asking for. */}
        <div className="gap-md sm:grid-cols-2 grid grid-cols-1">
          <Field>
            <FieldLabel>{PLANNING_TEXT.divisionCode}</FieldLabel>
            <Input
              value={codeValue}
              onChange={(e) => setCode(e.target.value)}
              /* The anchor. Editable only while creating: every import and
                 every mapping row keys on it, and a division whose code
                 changed is a new division wearing an old one's history. */
              disabled={!isNew || pending}
            />
            <FieldDescription>{PLANNING_TEXT.divisionCodeHint}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>{PLANNING_TEXT.divisionNameLabel}</FieldLabel>
            <Input
              value={nameValue}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
            />
          </Field>
        </div>

        {/* 覆盖省份 - TWO SOURCES, side by side, because they answer the same
            question two ways: take a shipped carve wholesale, or pick the
            provinces yourself. They were stacked at opposite ends of the form,
            which read as two unrelated fields. */}
        <div className="gap-2xs flex flex-col">
          <span className="text-body-sm font-medium">
            {PLANNING_TEXT.divisionProvincesLabel}
          </span>
          <div className="gap-md sm:grid-cols-2 grid grid-cols-1">
            {/* 引用系统内置. Fills all three fields and leaves them editable -
                the point is to save typing, not to lock the shape. Only while
                creating: on an existing division it would silently overwrite
                what the workspace had already decided. */}
            {isNew && presets.length > 0 ? (
              <Field>
                <FieldLabel>{PLANNING_TEXT.templateRef}</FieldLabel>
                <NativeSelect
                  disabled={pending}
                  defaultValue=""
                  onChange={(e) => {
                    const p = presets.find((x) => `${x.key}:${x.code}` === e.target.value);
                    if (!p) return;
                    setCode(p.code);
                    setName(p.name);
                    setChosen(new Set(p.provinces));
                  }}
                >
                  <option value="">{PLANNING_TEXT.templateRefNone}</option>
                  {presets.map((p) => (
                    <option key={`${p.key}:${p.code}`} value={`${p.key}:${p.code}`}>
                      {p.from} · {p.name}
                    </option>
                  ))}
                </NativeSelect>
                <FieldDescription>{PLANNING_TEXT.templateRefWhy}</FieldDescription>
              </Field>
            ) : null}
            <Field>
              {/* NOT 「选择省份」 TWICE: the label names the source, the button
                  is the door. A field labelled with the same words as the
                  control inside it says one thing and takes two lines. */}
              <FieldLabel>{PLANNING_TEXT.divisionPickManual}</FieldLabel>
              {/* THE PICKER IS A DRAWER, not 34 checkboxes on the page: the
                  list is long enough that the fields above scrolled away
                  before the last province arrived, and choosing provinces has
                  its own tools - search, the letter code, what each shipped
                  carve says. What stays on the page is the ANSWER. */}
              <div className="w-fit">
                <Button variant="secondary" disabled={pending} onClick={() => setPicking(true)}>
                  {PLANNING_TEXT.divisionPick}
                </Button>
              </div>
              <FieldDescription>
                {PLANNING_TEXT.divisionChosen(chosenList.length)}
              </FieldDescription>
            </Field>
          </div>
        </div>
      </div>

      {/* THE ANSWER, ACROSS THE FULL WIDTH. Tags wrap; this is the one part of
          the form that earns the page's width, and capping it at the reading
          measure above would have wrapped 34 provinces into a narrow column. */}
      <div className="gap-2xs mt-sm flex flex-wrap items-center">
        {chosenList.length === 0 ? (
          <span className="text-muted-foreground text-body-sm">
            {PLANNING_TEXT.divisionPickEmpty}
          </span>
        ) : (
          chosenList.map((p) => (
            <StatusBadge key={p} tone="neutral">
              {tagOf.get(p) ?? p}
            </StatusBadge>
          ))
        )}
      </div>

      <div className="gap-md flex flex-col">
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
                <Button onClick={() => setPicking(false)}>
                  {PLANNING_TEXT.divisionPickDone}
                </Button>
              </div>
            </div>
          }
        >
          <div className="gap-sm flex flex-col">
            {/* SEARCHES THE SHORT NAME TOO, because that is the name on the
                map and on every screen that has no room for 内蒙古自治区. */}
            <Input
              value={query}
              placeholder={PLANNING_TEXT.divisionSearch}
              onChange={(e) => setQuery(e.target.value)}
            />
            {matches.length === 0 ? (
              <p className="text-muted-foreground text-body-sm">
                {PLANNING_TEXT.divisionPickNone}
              </p>
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
                    {o.heldBy && !provinces.includes(o.province) ? (
                      <span className="text-warning text-body-sm shrink-0">{o.heldBy}</span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </Drawer>

        {takenFrom.length > 0 ? (
          <ul className="gap-2xs flex flex-col">
            {takenFrom.map((o) => (
              <li className="text-warning text-body-sm" key={o.province}>
                {PLANNING_TEXT.divisionTakenFrom(o.province, o.heldBy!)}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="gap-sm flex items-center">
          <Button onClick={submit} disabled={pending}>
            {PLANNING_TEXT.divisionSave}
          </Button>
          {/* REMOVAL IS OFFERED ONLY WHEN IT HOLDS NOTHING, which is the
              foreign key's own rule (ON DELETE RESTRICT) shown rather than
              enforced after the fact. The service refuses either way; not
              offering it saves the reader a refusal they can predict. */}
          {!isNew && provinces.length === 0 ? (
            <Button variant="secondary" disabled={pending} onClick={remove}>
              {PLANNING_TEXT.divisionRemove}
            </Button>
          ) : null}
          {!isNew && provinces.length > 0 ? (
            <span className="text-muted-foreground text-body-sm">
              {PLANNING_TEXT.divisionRemoveWhy}
            </span>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
