"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Banner,
  Button,
  Drawer,
  EmptyState,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  NativeSelect,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@vxture/design-ui";
import {
  divisionCode,
  localCode,
  scopePrefix,
  type MarketScope,
} from "../../domains/shared/market-division";
import { useMessages } from "../lib/i18n/provider";
import { frameIncludes, frameNoun } from "../lib/frame-copy";
import { removeDivisionAction, saveDivision } from "../admin/division/actions";
import { Tag } from "./tag";

/* 配置区域 - TWO COLUMNS (owner, 2026-09-09: 改为左右布局).
 *
 * LEFT IS WHAT THE PERSON DOES, RIGHT IS WHAT THEY HAVE DONE. The left column
 * holds only controls somebody can act on - the code, the name, a preset to
 * start from, the door to the picker, save and delete - and nothing that
 * merely informs. The right column is the region's roster as it stands: a
 * plain list, numbered, one name per row, no operations. The one operation a
 * member has is "be picked", and that is the button on the left.
 *
 * WHAT LEFT THE FORM. A read-only 包括范围 input, a sentence under the preset
 * select, and an 已选 N 个 line under the picker button were all things the
 * person could read but not use. The frame's ground (陕西省 · 包括为市级) is
 * the LIST's own heading now, and the count sits beside it, which is where a
 * reader looks for how many rows a list has.
 *
 * WARNINGS SIT WITH WHAT THEY ARE ABOUT. A member about to be taken off
 * another region is a fact about the roster, so its banner is under the
 * list; a save that failed is a fact about the form, so its banner is under
 * the save button. Both are absent in the normal case.
 *
 * A MEMBER ALREADY IN ANOTHER 大区 CAN STILL BE TICKED (owner). It moves here
 * and drops out of the other one - the primary key means it could never have
 * been in two places, so refusing would only send the reader to a second
 * screen to say one thing. What it must not do is move something quietly:
 * the banner names each one, before saving.
 */

export interface MemberOption {
  /** What the store keys on: the province name, or the city's adcode. */
  readonly key: string;
  /** `JS 江苏` / `西安` - the one shape a member takes in configuration. */
  readonly label: string;
  /** The 大区 it sits in now, or null. */
  readonly heldBy: string | null;
  /** Where each shipped carve of this frame puts it - `五分法 中部 · 七分法 华中`. */
  readonly hint: string;
}

/** One division out of a shipped carve, offered as a starting point. */
export interface PresetOption {
  readonly key: string;
  readonly code: string;
  readonly name: string;
  readonly members: readonly string[];
  /** Which carve it comes from - 五分法 / 七分法 - so two 华东s are distinguishable. */
  readonly from: string;
}

export function DivisionForm({
  scope,
  code,
  name,
  members,
  options,
  presets,
  isNew,
}: {
  /** The frame this region is carved inside (incr/0043). */
  readonly scope: MarketScope;
  readonly code: string;
  readonly name: string;
  readonly members: readonly string[];
  readonly options: readonly MemberOption[];
  /** Empty when editing: referencing a preset is a way to START one. */
  readonly presets: readonly PresetOption[];
  readonly isNew: boolean;
}) {
  const { PLANNING_TEXT, TERRITORY_ERROR } = useMessages();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const prefix = scopePrefix(scope);
  const noun = frameNoun(scope, PLANNING_TEXT);
  const includes = frameIncludes(scope, PLANNING_TEXT);
  const [local, setLocal] = useState(localCode(scope, code));
  const [nameValue, setName] = useState(name);
  const [chosen, setChosen] = useState<Set<string>>(new Set(members));
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  /* ORDERED BY THE OPTION LIST, not by the click order: the roster reads as a
     stable list of what this 大区 holds, and one that reshuffled every time
     somebody unticked a row would be unreadable. */
  const chosenList = useMemo(
    () => options.filter((o) => chosen.has(o.key)),
    [options, chosen],
  );
  const matches = useMemo(() => {
    const q = query.trim();
    if (q === "") return options;
    return options.filter(
      (o) =>
        o.key.includes(q) ||
        o.label.toUpperCase().includes(q.toUpperCase()) ||
        o.hint.includes(q),
    );
  }, [options, query]);

  const toggle = (p: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  /* Which ticks would take a member off another 大区. Shown BEFORE saving,
     because reorganising somebody else's division is exactly the kind of thing
     that should not be a surprise. */
  const takenFrom = useMemo(
    () =>
      chosenList.filter((o) => o.heldBy !== null && !members.includes(o.key)),
    [chosenList, members],
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
        members: [...chosen],
      });
      if (!r.ok) setError(TERRITORY_ERROR[r.error] ?? r.error);
      else router.push("/admin/division");
    });
  };

  return (
    /* A CONTAINER QUERY, NOT A VIEWPORT BREAKPOINT - the argument form-page.tsx
       makes: what decides whether two columns fit is the room this page has
       beside the sidebar, and the viewport does not know that. @3xl = 48rem
       of container: two columns only when each still gets ~24rem. Narrower,
       the list drops under the form - the form is the errand. */
    <div className="@container">
      <div className="grid items-start gap-lg @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* LEFT - the controls, and only the controls, ONE UNDER THE OTHER
            (owner: 操作区全部纵向排列, not the two-a-row FormFields grid the
            full-width forms use - this column is half a page, and a stack
            reads top to bottom the way the person fills it in). NO
            DESCRIPTION: the page's ViewHeader already says what this form is
            for. The measure caps each control at a reading width. */}
        <Section title={PLANNING_TEXT.divisionFormTitle}>
          <div className="gap-lg flex flex-col *:max-w-(--vx-container-lg)">
            <Field>
              <FieldLabel>{PLANNING_TEXT.divisionCode}</FieldLabel>
              {/* THE PREFIX IS THE FRAME'S, NOT THE PERSON'S. SN- sits in the
                    addon as a fact; the input holds the half that is theirs.
                    The database CHECKs the same composition, so nothing typed
                    here can land a code in the wrong frame. */}
              <InputGroup>
                <InputGroupAddon align="start">{prefix}</InputGroupAddon>
                <InputGroupInput
                  value={local}
                  onChange={(e) => setLocal(e.target.value.toUpperCase())}
                  /* The anchor. Editable only while creating: every import
                       and every mapping row keys on it, and a division whose
                       code changed is a new division wearing an old one's
                       history. */
                  disabled={!isNew || pending}
                />
              </InputGroup>
              {/* The one line under a control that earns its place: it
                    tells the person what to TYPE (new) or why they cannot. */}
              <FieldDescription>
                {isNew
                  ? PLANNING_TEXT.divisionCodePrefixHint
                  : PLANNING_TEXT.divisionCodeHint}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{PLANNING_TEXT.divisionNameLabel}</FieldLabel>
              <Input
                value={nameValue}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
              />
            </Field>

            {/* THE TWO WAYS TO FILL THE LIST: take a shipped region wholesale,
                or open the picker. Both are actions. */}
            {isNew && presets.length > 0 ? (
              <Field>
                <FieldLabel>{PLANNING_TEXT.templateRef}</FieldLabel>
                <NativeSelect
                  disabled={pending}
                  defaultValue=""
                  onChange={(e) => {
                    const p = presets.find(
                      (x) => `${x.key}:${x.code}` === e.target.value,
                    );
                    if (!p) return;
                    setLocal(localCode(scope, p.code));
                    setName(p.name);
                    setChosen(new Set(p.members));
                  }}
                >
                  <option value="">{PLANNING_TEXT.templateRefNone}</option>
                  {/* 五分法-中部, and nothing else: the carve's own list of
                        names belongs in the reset dialog, not in every option. */}
                  {presets.map((p) => (
                    <option
                      key={`${p.key}:${p.code}`}
                      value={`${p.key}:${p.code}`}
                    >
                      {PLANNING_TEXT.presetOption(p.from, p.name)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : null}
            <Field>
              <FieldLabel>{PLANNING_TEXT.divisionPickManual}</FieldLabel>
              {/* THE PICKER IS A DRAWER, not 34 checkboxes on the page: the
                    list is long enough that the fields above scrolled away
                    before the last province arrived. */}
              <div className="w-fit">
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setPicking(true)}
                >
                  {PLANNING_TEXT.divisionPick(noun)}
                </Button>
              </div>
            </Field>

            <div className="gap-sm flex items-center">
              <Button onClick={submit} disabled={pending}>
                {PLANNING_TEXT.divisionSave}
              </Button>
              {/* REMOVAL IS OFFERED ONLY WHEN IT HOLDS NOTHING, which is the
                  foreign key's own rule (ON DELETE RESTRICT) shown rather than
                  enforced after the fact. */}
              {!isNew && members.length === 0 ? (
                <Button variant="secondary" disabled={pending} onClick={remove}>
                  {PLANNING_TEXT.divisionRemove}
                </Button>
              ) : null}
            </div>

            {error ? (
              <Banner
                tone="danger"
                title={PLANNING_TEXT.divisionSaveFailed}
                description={error}
              />
            ) : null}
          </div>
        </Section>

        {/* RIGHT - the roster as it stands. The heading carries the frame's
            ground and the count; the rows carry a number and a name; nothing
            else, and no operations column (owner: 保留序号，名称，移除操作) -
            the DS's own table primitives rather than DataTable, whose three
            fittings are for tables somebody acts IN. */}
        <Section
          title={PLANNING_TEXT.divisionIncludes}
          description={PLANNING_TEXT.divisionListMeta(
            includes,
            chosenList.length,
            noun,
          )}
        >
          <div className="gap-md flex flex-col">
            {chosenList.length === 0 ? (
              <EmptyState
                title={PLANNING_TEXT.divisionPickEmpty(noun)}
                description={PLANNING_TEXT.divisionPickEmptyWhy(noun)}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[4rem] text-center">#</TableHead>
                    <TableHead>{noun}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chosenList.map((o, i) => (
                    <TableRow key={o.key}>
                      <TableCell className="text-muted-foreground text-center tabular-nums">
                        {i + 1}
                      </TableCell>
                      <TableCell>{o.label}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {takenFrom.length > 0 ? (
              <Banner
                tone="warning"
                title={PLANNING_TEXT.divisionMovedTitle(takenFrom.length, noun)}
                description={
                  <ul className="gap-2xs flex flex-col">
                    {takenFrom.map((o) => (
                      <li key={o.key}>
                        {PLANNING_TEXT.divisionTakenFrom(o.label, o.heldBy!)}
                      </li>
                    ))}
                  </ul>
                }
              />
            ) : null}
          </div>
        </Section>
      </div>

      <Drawer
        open={picking}
        onClose={() => setPicking(false)}
        width="lg"
        title={PLANNING_TEXT.divisionPickTitle(noun)}
        description={PLANNING_TEXT.divisionPickWhy(noun)}
        closeLabel={PLANNING_TEXT.divisionPickDone}
        footer={
          <div className="gap-sm flex items-center justify-between">
            <span className="text-muted-foreground text-body-sm">
              {PLANNING_TEXT.divisionChosen(chosenList.length, noun)}
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
          {/* SEARCHES THE SHORT NAME TOO, because that is the name on the map
              and on every screen that has no room for 内蒙古自治区. */}
          <Input
            value={query}
            placeholder={PLANNING_TEXT.divisionSearch(noun)}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length === 0 ? (
            <p className="text-muted-foreground text-body-sm">
              {PLANNING_TEXT.divisionPickNone(noun)}
            </p>
          ) : null}
          <ul className="gap-2xs flex flex-col">
            {matches.map((o) => (
              <li key={o.key}>
                <label className="gap-sm hover:bg-muted flex items-center rounded-sm px-2xs py-2xs">
                  <input
                    type="checkbox"
                    checked={chosen.has(o.key)}
                    onChange={() => toggle(o.key)}
                  />
                  {/* THE LABEL IS THE TAG: `JS 江苏`, or `西安`. The province's
                      letters lead so the names line up down the list. */}
                  <span className="text-body-sm grow font-medium">
                    {o.label}
                  </span>
                  {/* 后缀: what each standard carve of this frame says about it. */}
                  <span className="text-muted-foreground text-body-sm shrink-0">
                    {o.hint}
                  </span>
                  {/* Held elsewhere: a warning-toned tag, the DS's own shape
                      for "this has a state you should notice". */}
                  {o.heldBy && !members.includes(o.key) ? (
                    <Tag tone="warning">{o.heldBy}</Tag>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </Drawer>
    </div>
  );
}
