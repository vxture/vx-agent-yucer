"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Banner,
  Button,
  ButtonGroup,
  Checkbox,
  DestructiveButton,
  DialogForm,
  Drawer,
  EmptyState,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  RadioGroup,
  RadioGroupItem,
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
import { frameNoun } from "../lib/frame-copy";
import { matchPreset } from "../lib/preset-match";
import { removeDivisionAction, saveDivision } from "../admin/division/actions";
import { FormActions } from "./form-page";
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
  /** 简称代号 (JS) - a province has one, a city does not. */
  readonly abbr: string | null;
  /** 全称 and 行政区划代码 - the roster's own columns. */
  readonly name: string;
  readonly adcode: string;
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
  const [local, setLocal] = useState(localCode(scope, code));
  const [nameValue, setNameValue] = useState(name);
  const [chosen, setChosen] = useState<Set<string>>(new Set(members));
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [applying, setApplying] = useState(false);
  const [presetChoice, setPresetChoice] = useState("");

  /* The preset that matches THIS region - what 应用模版 restores. By code
     AND name (preset-match.ts says why: CHINA-EAST is 五分法's 东部 and
     七分法's 华东, and matching on code alone reset one to the other). When
     the code alone is ambiguous, 应用模版 asks which carve. On a new region
     the match follows what has been typed; on an existing one the code is
     fixed. */
  const presetMatch = useMemo(
    () => matchPreset(presets, divisionCode(scope, local), nameValue),
    [presets, scope, local, nameValue],
  );
  const presetForCode = presetMatch.kind === "one" ? presetMatch.preset : null;
  /* Which presets the 应用预置 dialog lists: all of them, or - when 应用模版
     has to ask - only the carves that share this code. */
  const [presetPool, setPresetPool] = useState<readonly PresetOption[]>(presets);
  /* Lay a preset over the form. The CODE follows only while creating - it is
     the anchor, and on an existing region it stays. */
  const applyPreset = (p: PresetOption) => {
    if (isNew) setLocal(localCode(scope, p.code));
    setNameValue(p.name);
    setChosen(new Set(p.members));
  };

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
                {/* NO ADDON UNDER A PROVINCE FRAME (0045): the province is the
                    header's business, and the code is the unit's own - 610100, or
                    a word. */}
                {prefix ? <InputGroupAddon align="start">{prefix}</InputGroupAddon> : null}
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
                    ? prefix
                      ? PLANNING_TEXT.divisionCodePrefixHint
                      : PLANNING_TEXT.divisionCodeUnitHint
                    : PLANNING_TEXT.divisionCodeHint}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{PLANNING_TEXT.divisionNameLabel}</FieldLabel>
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                disabled={pending}
              />
            </Field>

            {/* 辖区配置 - FOUR WAYS TO FILL THE LIST, in one row (owner,
                2026-09-09: 手动选择只是其中一种方式，不能把手动选择作为 label).
                选择辖区 opens the picker; 应用预置 lays any preset region over
                this one; 应用模版 restores the preset that matches THIS code,
                and is greyed when none does; 清空选择 empties the list. Each
                is greyed when it could do nothing, so the row reads as what
                can be done right now. */}
            <Field>
              <FieldLabel>{PLANNING_TEXT.divisionMembersConfig}</FieldLabel>
              <ButtonGroup>
                <Button variant="secondary" disabled={pending} onClick={() => setPicking(true)}>
                  {PLANNING_TEXT.divisionPickMembers}
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending || presets.length === 0}
                  onClick={() => {
                    setPresetPool(presets);
                    setPresetChoice(presetForCode ? `${presetForCode.key}:${presetForCode.code}` : "");
                    setApplying(true);
                  }}
                >
                  {PLANNING_TEXT.divisionApplyPreset}
                </Button>
                {/* THE TWO THAT THROW AWAY WHAT IS ON SCREEN are destructive
                    and confirmed as such (owner, 2026-09-09: 危险操作，应该添加
                    危险确认框) - the DS's own contract: a verb, a target and a
                    consequence, and the button wears red so the row says
                    which of the four can cost you something. */}
                {presetMatch.kind === "ambiguous" ? (
                  /* SEVERAL CARVES SHARE THIS CODE and none matches the name:
                     ask which, through the same dialog, narrowed to them. Not
                     destructive yet - nothing is applied until a carve is
                     picked and confirmed there. */
                  <Button
                    variant="secondary"
                    disabled={pending}
                    title={PLANNING_TEXT.divisionResetPresetAmbiguous(presetMatch.candidates.length)}
                    onClick={() => {
                      setPresetPool(presetMatch.candidates);
                      const p = presetMatch.preferred;
                      setPresetChoice(p ? `${p.key}:${p.code}` : "");
                      setApplying(true);
                    }}
                  >
                    {PLANNING_TEXT.divisionResetPreset}
                  </Button>
                ) : (
                <DestructiveButton
                  disabled={pending || !presetForCode}
                  title={
                    presetForCode
                      ? PLANNING_TEXT.divisionResetPresetHint(presetForCode.from, presetForCode.name)
                      : PLANNING_TEXT.divisionResetPresetNone
                  }
                  confirm={{
                    verb: PLANNING_TEXT.divisionResetPreset,
                    target: presetForCode
                      ? PLANNING_TEXT.divisionResetTarget(presetForCode.from, presetForCode.name)
                      : "",
                    consequence: PLANNING_TEXT.divisionResetConsequence(chosenList.length, noun),
                    titleTemplate: PLANNING_TEXT.destructiveTitle,
                    /* OURS, not the DS default - which rendered "Cancel" in
                       the middle of a Chinese dialog. */
                    cancelLabel: PLANNING_TEXT.templateCancel,
                    onConfirm: () => {
                      if (presetForCode) applyPreset(presetForCode);
                    },
                  }}
                >
                  {PLANNING_TEXT.divisionResetPreset}
                </DestructiveButton>
                )}
                <DestructiveButton
                  disabled={pending || chosen.size === 0}
                  confirm={{
                    verb: PLANNING_TEXT.divisionClearMembers,
                    target: PLANNING_TEXT.divisionClearTarget(chosenList.length, noun),
                    consequence: PLANNING_TEXT.divisionClearConsequence,
                    titleTemplate: PLANNING_TEXT.destructiveTitle,
                    /* OURS, not the DS default - which rendered "Cancel" in
                       the middle of a Chinese dialog. */
                    cancelLabel: PLANNING_TEXT.templateCancel,
                    onConfirm: () => setChosen(new Set()),
                  }}
                >
                  {PLANNING_TEXT.divisionClearMembers}
                </DestructiveButton>
              </ButtonGroup>
            </Field>

            {/* REMOVAL IS OFFERED ONLY WHEN IT HOLDS NOTHING, which is the
                foreign key's own rule (ON DELETE RESTRICT) shown rather than
                enforced after the fact. It stays in the column: it is an
                operation on this region, not the way out of the page. */}
            {!isNew && members.length === 0 ? (
              <div className="w-fit">
                <Button variant="secondary" disabled={pending} onClick={remove}>
                  {PLANNING_TEXT.divisionRemove}
                </Button>
              </div>
            ) : null}
          </div>
        </Section>

        {/* RIGHT - the roster as it stands. A heading and the rows, and no
            line under the heading (owner, 2026-09-09: 纯粹垃圾信息，还影响了
            左右对齐 - the frame is the page header's business, the count is
            the table's). DS table primitives rather than DataTable, whose
            three fittings are for tables somebody acts IN. */}
        <Section
          title={PLANNING_TEXT.divisionIncludes}
        >
          <div className="gap-md flex flex-col">
            {chosenList.length === 0 ? (
              <EmptyState
                title={PLANNING_TEXT.divisionPickEmpty(noun)}
                description={PLANNING_TEXT.divisionPickEmptyWhy(noun)}
              />
            ) : (
              /* THE ROSTER'S COLUMNS (owner, 2026-09-09: 序号，简称代号，名称，
                 行政区划代码，操作). 简称代号 is the standard's two letters and
                 exists for a province, not for a city - the cell is blank
                 there rather than invented. 移除 unticks the row: the one
                 operation a member has here. */
              <Table className="table-fixed">
                {/* FIXED LAYOUT, PROPORTIONAL COLUMNS (owner: 列宽均衡一点). Auto
                    layout handed 名称 everything the others did not claim and
                    squeezed 行政区划代码 against the actions. Five shares that
                    add to the width, sized to their longest content: a
                    two-digit index, two letters, a long name, six digits, one
                    word. */}
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[12%] text-center">{PLANNING_TEXT.colIndex}</TableHead>
                    <TableHead className="w-[18%]">{PLANNING_TEXT.colAbbr}</TableHead>
                    <TableHead className="w-[30%]">{PLANNING_TEXT.colName}</TableHead>
                    <TableHead className="w-[24%]">{PLANNING_TEXT.colAdcode}</TableHead>
                    <TableHead className="w-[16%] text-center">{PLANNING_TEXT.colOps}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chosenList.map((o, i) => (
                    <TableRow key={o.key}>
                      <TableCell className="text-muted-foreground text-center tabular-nums">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">{o.abbr ?? ""}</TableCell>
                      <TableCell>{o.name}</TableCell>
                      <TableCell className="tabular-nums">{o.adcode}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => toggle(o.key)}
                        >
                          {PLANNING_TEXT.divisionRemoveMember}
                        </Button>
                      </TableCell>
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

      {/* THE WAY OUT, ACROSS BOTH COLUMNS (owner, 2026-09-09: 保存需要一个底部
          拉通的 section，并且需要上方分割线; 保存、放弃，主、辅). Saving commits
          what both columns say, so it belongs to neither: a full-width foot
          under a rule. Shared shell (owner, 2026-09-12: admin 按钮位置统一,
          放弃靠左、保存靠右 - DS's own DialogForm contract, "取消在左、
          提交在右") - no `destructive` here: 删除大区 stays inline in the
          left column above (its own comment already rules on that - "不是
          离开这页的方式，是对这个大区本身的操作"), this row only ever
          means save/discard. */}
      <FormActions
        saveLabel={PLANNING_TEXT.divisionSave}
        discardLabel={PLANNING_TEXT.divisionDiscard}
        onSave={submit}
        onDiscard={() => router.push("/admin/division")}
        pending={pending}
        error={error}
        errorTitle={PLANNING_TEXT.divisionSaveFailed}
      />

      <DialogForm
        open={applying}
        onOpenChange={setApplying}
        title={PLANNING_TEXT.divisionApplyPresetTitle}
        description={PLANNING_TEXT.divisionApplyPresetWhy(isNew)}
        submitLabel={PLANNING_TEXT.divisionApplyConfirm}
        cancelLabel={PLANNING_TEXT.divisionDiscard}
        submitDisabled={presetChoice === ""}
        onSubmit={(e) => {
          e.preventDefault();
          const p = presetPool.find((x) => `${x.key}:${x.code}` === presetChoice);
          if (p) applyPreset(p);
          setApplying(false);
        }}
      >
        {/* 五分法-中部, one per line: the carve's own list of names belongs
            in the roster's reset dialog, not beside every option. */}
        <RadioGroup value={presetChoice} onValueChange={setPresetChoice} className="gap-sm flex flex-col">
          {presetPool.map((p) => (
            <label className="gap-sm flex items-center" key={`${p.key}:${p.code}`} htmlFor={`preset-${p.key}-${p.code}`}>
              <RadioGroupItem id={`preset-${p.key}-${p.code}`} value={`${p.key}:${p.code}`} />
              <span className="text-body-md">{PLANNING_TEXT.presetOption(p.from, p.name)}</span>
            </label>
          ))}
        </RadioGroup>
      </DialogForm>

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
                {/* THE DS'S CHECKBOX, bound to its label by id. */}
                <label
                  className="gap-sm hover:bg-muted flex items-center rounded-sm px-2xs py-2xs"
                  htmlFor={`member-${o.key}`}
                >
                  <Checkbox
                    id={`member-${o.key}`}
                    checked={chosen.has(o.key)}
                    onCheckedChange={() => toggle(o.key)}
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
