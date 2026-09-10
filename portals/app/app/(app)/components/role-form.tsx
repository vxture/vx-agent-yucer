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
  NativeSelect,
  RadioGroup,
  RadioGroupItem,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { removeRoleAction, saveRoleAction } from "../admin/roles/actions";
import { Tag } from "./tag";

/* 配置角色 - TWO COLUMNS, the division form's shape (owner, 2026-09-09:
 * 基本遵循区域设定思路).
 *
 * LEFT IS WHAT THE PERSON DOES, RIGHT IS WHAT THEY HAVE DONE. The left column
 * holds only controls: the code, the name, the sentence, the four ways to
 * fill the permission list, and delete when it is allowed. The right column
 * is the role's grants as they stand - numbered, with the code, what it
 * allows, how many operations it unlocks, and 移除.
 *
 * 权限配置 IS FOUR BUTTONS, like 辖区配置: 选择权限 opens the picker (grouped by
 * module, each permission with the count of operations it unlocks); 应用预置
 * lays any preset over this role; 重置预置 restores the preset that matches
 * THIS code and is greyed when none does; 清空选择 empties the list. The two
 * that throw away what is on screen are destructive and confirmed as such.
 *
 * THE LAST-ADMINISTRATOR GUARD IS THE SERVICE'S. This form does not know who
 * holds what; it shows the refusal the service returns, in the dictionary's
 * words, under the save button.
 */

/** One permission the picker offers - the catalogue's 25, with copy. */
export interface PermissionOption {
  readonly code: string;
  readonly label: string;
  /** The module the code belongs to (its prefix), and that module's name. */
  readonly module: string;
  readonly moduleLabel: string;
  /** How many operations in the action catalogue need this permission. */
  readonly unlocks: number;
}

/** One preset, offered as a starting point or a reset. Its group by CODE -
 *  the form resolves it to this workspace's own row. */
export interface RolePreset {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly line: string;
  readonly rank: string;
  readonly permissions: readonly string[];
}

/** One row of a grouping vocabulary, as the two selects offer it (0047). */
export interface GroupOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export function RoleForm({
  isNew,
  code,
  name,
  description,
  lineId,
  rankId,
  lines,
  ranks,
  permissions,
  members,
  options,
  presets,
}: {
  readonly isNew: boolean;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  /** The role's group rows, by id; null for a role that has none yet. */
  readonly lineId: string | null;
  readonly rankId: string | null;
  /** The workspace's two vocabularies, in their order (0047). */
  readonly lines: readonly GroupOption[];
  readonly ranks: readonly GroupOption[];
  readonly permissions: readonly string[];
  /** How many members hold it - delete is offered only at zero. */
  readonly members: number;
  readonly options: readonly PermissionOption[];
  readonly presets: readonly RolePreset[];
}) {
  const { ROLE_ERROR, ROLE_TEXT } = useMessages();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [codeValue, setCodeValue] = useState(code);
  const [nameValue, setNameValue] = useState(name);
  const [descValue, setDescValue] = useState(description);
  /* BOTH REQUIRED, and neither guessed: a role without a line or a rung
     starts on the empty option and the service refuses the save until one is
     chosen (line_unknown / rank_unknown). */
  const [lineValue, setLineValue] = useState(lineId ?? "");
  const [rankValue, setRankValue] = useState(rankId ?? "");
  const [chosen, setChosen] = useState<Set<string>>(new Set(permissions));
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [applying, setApplying] = useState(false);
  const [presetChoice, setPresetChoice] = useState("");

  /* The preset that matches THIS code - what 重置预置 restores. Role codes
     are unique across the presets (unlike division codes across carves), so
     the match is by code alone and never ambiguous. */
  const presetForCode = useMemo(
    () => presets.find((p) => p.code === codeValue.trim()) ?? null,
    [presets, codeValue],
  );
  /* Lay a preset over the form. The CODE follows only while creating - it is
     the anchor, and on an existing role it stays. */
  const applyPreset = (p: RolePreset) => {
    if (isNew) setCodeValue(p.code);
    setNameValue(p.name);
    setDescValue(p.description);
    // The preset's group by code -> this workspace's row; a code the tenant
    // deleted leaves the select where it was rather than guessing.
    const line = lines.find((g) => g.code === p.line);
    const rank = ranks.find((g) => g.code === p.rank);
    if (line) setLineValue(line.id);
    if (rank) setRankValue(rank.id);
    setChosen(new Set(p.permissions));
  };

  /* ORDERED BY THE CATALOGUE, not by the click order: the roster reads as a
     stable list of what this role holds. */
  const chosenList = useMemo(() => options.filter((o) => chosen.has(o.code)), [options, chosen]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return options;
    return options.filter(
      (o) => o.code.includes(q) || o.label.toLowerCase().includes(q) || o.moduleLabel.includes(q),
    );
  }, [options, query]);
  /* The picker groups by module, in the order a module FIRST appears. The
     catalogue lists codes in arrival order - strategy.approve and
     account.record were appended by later increments - so a group has to
     collect its codes from wherever they sit, or 市场战略 shows up twice. */
  const modules = useMemo(() => {
    const out = new Map<string, { module: string; label: string; items: PermissionOption[] }>();
    for (const o of matches) {
      const group = out.get(o.module);
      if (group) group.items.push(o);
      else out.set(o.module, { module: o.module, label: o.moduleLabel, items: [o] });
    }
    return [...out.values()];
  }, [matches]);

  const toggle = (c: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const remove = () => {
    setError(null);
    start(async () => {
      const r = await removeRoleAction(code);
      if (!r.ok) setError(ROLE_ERROR[r.error] ?? r.error);
      else router.push("/admin/roles");
    });
  };

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await saveRoleAction({
        code: codeValue.trim(),
        name: nameValue.trim(),
        description: descValue.trim(),
        lineId: lineValue,
        rankId: rankValue,
        permissions: [...chosen],
      });
      if (!r.ok) setError(ROLE_ERROR[r.error] ?? r.error);
      else router.push("/admin/roles");
    });
  };

  return (
    <div className="@container">
      <div className="grid items-start gap-lg @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* LEFT - the controls, one under the other. */}
        <Section title={ROLE_TEXT.formTitle}>
          <div className="gap-lg flex flex-col *:max-w-(--vx-container-lg)">
            <Field>
              <FieldLabel>{ROLE_TEXT.code}</FieldLabel>
              <Input
                value={codeValue}
                onChange={(e) => setCodeValue(e.target.value.toLowerCase())}
                /* The anchor. Editable only while creating: every member
                   link keys on it, and the column is locked (0046). */
                disabled={!isNew || pending}
              />
              <FieldDescription>{isNew ? ROLE_TEXT.codeHint : ROLE_TEXT.codeLocked}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{ROLE_TEXT.nameLabel}</FieldLabel>
              <Input value={nameValue} onChange={(e) => setNameValue(e.target.value)} disabled={pending} />
            </Field>

            <Field>
              <FieldLabel>{ROLE_TEXT.descriptionLabel}</FieldLabel>
              <Textarea
                value={descValue}
                onChange={(e) => setDescValue(e.target.value)}
                rows={2}
                disabled={pending}
              />
              <FieldDescription>{ROLE_TEXT.descriptionHint}</FieldDescription>
            </Field>

            {/* THE TWO GROUPS (owner, 2026-09-09: 一个按业务，一个按层级), from
                the workspace's own lists - 角色分组 on the roster edits them. */}
            {/* SELECT + 配置 ON ONE LINE, THE COLUMN'S FULL SPAN (owner: 下拉框
                缩短一点，留出按钮位置，总体跨度一致). The pair sits inside the same
                measure every control here has; the select grows into what
                the button leaves, so both rows end where the inputs above
                them end. 配置 opens 分组管理 - the list is the workspace's,
                and the form is where somebody finds out it is one short. */}
            <Field>
              <FieldLabel>{ROLE_TEXT.lineField}</FieldLabel>
              <div className="gap-sm flex items-center">
                <div className="min-w-0 grow">
                  <NativeSelect value={lineValue} onChange={(e) => setLineValue(e.target.value)} disabled={pending}>
                    <option value="">{ROLE_TEXT.groupUnset}</option>
                    {lines.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </NativeSelect>
                </div>
                <Button asChild variant="secondary" className="shrink-0">
                  <a href="/admin/roles/groups">{ROLE_TEXT.groupConfigure}</a>
                </Button>
              </div>
            </Field>
            <Field>
              <FieldLabel>{ROLE_TEXT.rankField}</FieldLabel>
              <div className="gap-sm flex items-center">
                <div className="min-w-0 grow">
                  <NativeSelect value={rankValue} onChange={(e) => setRankValue(e.target.value)} disabled={pending}>
                    <option value="">{ROLE_TEXT.groupUnset}</option>
                    {ranks.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </NativeSelect>
                </div>
                <Button asChild variant="secondary" className="shrink-0">
                  <a href="/admin/roles/groups">{ROLE_TEXT.groupConfigure}</a>
                </Button>
              </div>
            </Field>

            <Field>
              <FieldLabel>{ROLE_TEXT.permsConfig}</FieldLabel>
              <ButtonGroup>
                <Button variant="secondary" disabled={pending} onClick={() => setPicking(true)}>
                  {ROLE_TEXT.pick}
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending || presets.length === 0}
                  onClick={() => {
                    setPresetChoice(presetForCode?.code ?? "");
                    setApplying(true);
                  }}
                >
                  {ROLE_TEXT.applyPreset}
                </Button>
                <DestructiveButton
                  disabled={pending || !presetForCode}
                  title={presetForCode ? ROLE_TEXT.resetHint(presetForCode.name) : ROLE_TEXT.resetNone}
                  confirm={{
                    verb: ROLE_TEXT.resetPreset,
                    target: presetForCode ? ROLE_TEXT.resetTarget(presetForCode.name) : "",
                    consequence: ROLE_TEXT.resetConsequence(chosenList.length),
                    titleTemplate: ROLE_TEXT.destructiveTitle,
                    cancelLabel: ROLE_TEXT.cancel,
                    onConfirm: () => {
                      if (presetForCode) applyPreset(presetForCode);
                    },
                  }}
                >
                  {ROLE_TEXT.resetPreset}
                </DestructiveButton>
                <DestructiveButton
                  disabled={pending || chosen.size === 0}
                  confirm={{
                    verb: ROLE_TEXT.clear,
                    target: ROLE_TEXT.clearTarget(chosenList.length),
                    consequence: ROLE_TEXT.clearConsequence,
                    titleTemplate: ROLE_TEXT.destructiveTitle,
                    cancelLabel: ROLE_TEXT.cancel,
                    onConfirm: () => setChosen(new Set()),
                  }}
                >
                  {ROLE_TEXT.clear}
                </DestructiveButton>
              </ButtonGroup>
            </Field>

          </div>
        </Section>

        {/* RIGHT - the grants as they stand. */}
        <Section title={ROLE_TEXT.includes}>
          <div className="gap-md flex flex-col">
            {chosenList.length === 0 ? (
              <EmptyState title={ROLE_TEXT.pickEmpty} description={ROLE_TEXT.pickEmptyWhy} />
            ) : (
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[10%] text-center">{ROLE_TEXT.colIndex}</TableHead>
                    <TableHead className="w-[28%]">{ROLE_TEXT.colCode}</TableHead>
                    <TableHead className="w-[36%]">{ROLE_TEXT.colName}</TableHead>
                    <TableHead className="w-[13%] text-center">{ROLE_TEXT.colUnlocks}</TableHead>
                    <TableHead className="w-[13%] text-center">{ROLE_TEXT.colOps}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chosenList.map((o, i) => (
                    <TableRow key={o.code}>
                      <TableCell className="text-muted-foreground text-center tabular-nums">{i + 1}</TableCell>
                      <TableCell className="font-medium">{o.code}</TableCell>
                      <TableCell>{o.label}</TableCell>
                      <TableCell className="text-center tabular-nums">{ROLE_TEXT.unlocks(o.unlocks)}</TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => toggle(o.code)}>
                          {ROLE_TEXT.removePerm}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Section>
      </div>

      {/* THE WAY OUT, ACROSS BOTH COLUMNS: 保存 primary, 放弃 secondary, and
          the failure banner beside the button that failed. 删除角色 SITS AFTER
          THEM (owner, 2026-09-09: 放到底部，保存角色后面) - it is a way out of
          the page too, not a control in the column - and is OFFERED ONLY
          WHEN NOBODY HOLDS IT, the foreign key's own rule (ON DELETE
          RESTRICT) shown rather than enforced after the fact. Red, and
          confirmed: it is the one button here that cannot be undone. */}
      <div className="border-border mt-lg flex flex-col gap-md border-t pt-md">
        <div className="gap-sm flex items-center">
          <Button onClick={submit} disabled={pending}>
            {ROLE_TEXT.save}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => router.push("/admin/roles")}>
            {ROLE_TEXT.discard}
          </Button>
          {!isNew && members === 0 ? (
            <DestructiveButton
              disabled={pending}
              confirm={{
                verb: ROLE_TEXT.remove,
                target: ROLE_TEXT.removeTarget(name),
                consequence: ROLE_TEXT.removeConsequence,
                titleTemplate: ROLE_TEXT.destructiveTitle,
                cancelLabel: ROLE_TEXT.cancel,
                onConfirm: remove,
              }}
            >
              {ROLE_TEXT.remove}
            </DestructiveButton>
          ) : null}
        </div>
        {error ? <Banner tone="danger" title={ROLE_TEXT.saveFailed} description={error} /> : null}
      </div>

      <DialogForm
        open={applying}
        onOpenChange={setApplying}
        title={ROLE_TEXT.applyPresetTitle}
        description={ROLE_TEXT.applyPresetWhy(isNew)}
        submitLabel={ROLE_TEXT.applyConfirm}
        cancelLabel={ROLE_TEXT.discard}
        submitDisabled={presetChoice === ""}
        onSubmit={(e) => {
          e.preventDefault();
          const p = presets.find((x) => x.code === presetChoice);
          if (p) applyPreset(p);
          setApplying(false);
        }}
      >
        <RadioGroup value={presetChoice} onValueChange={setPresetChoice} className="gap-sm flex flex-col">
          {presets.map((p) => (
            <label className="gap-sm flex items-start" key={p.code} htmlFor={`preset-${p.code}`}>
              <RadioGroupItem id={`preset-${p.code}`} value={p.code} className="mt-2xs" />
              <span className="gap-3xs flex flex-col">
                <span className="text-body-md">{ROLE_TEXT.presetOption(p.name, p.permissions.length)}</span>
                <span className="text-muted-foreground text-body-sm">{p.description}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </DialogForm>

      <Drawer
        open={picking}
        onClose={() => setPicking(false)}
        width="lg"
        title={ROLE_TEXT.pickTitle}
        description={ROLE_TEXT.pickWhy}
        closeLabel={ROLE_TEXT.pickDone}
        footer={
          <div className="gap-sm flex items-center justify-between">
            <span className="text-muted-foreground text-body-sm">{ROLE_TEXT.chosen(chosenList.length)}</span>
            <div className="gap-sm flex items-center">
              <Button variant="secondary" onClick={() => setChosen(new Set())}>
                {ROLE_TEXT.pickClear}
              </Button>
              <Button onClick={() => setPicking(false)}>{ROLE_TEXT.pickDone}</Button>
            </div>
          </div>
        }
      >
        <div className="gap-md flex flex-col">
          <Input value={query} placeholder={ROLE_TEXT.search} onChange={(e) => setQuery(e.target.value)} />
          {modules.length === 0 ? (
            <p className="text-muted-foreground text-body-sm">{ROLE_TEXT.pickNone}</p>
          ) : null}
          {modules.map((m) => (
            <div key={m.module} className="gap-2xs flex flex-col">
              {/* THE MODULE IS THE GROUP: the same word the sidebar uses. */}
              <span className="text-label-sm text-muted-foreground uppercase">{m.label}</span>
              <ul className="gap-2xs flex flex-col">
                {m.items.map((o) => (
                  <li key={o.code}>
                    <label
                      className="gap-sm hover:bg-muted flex items-center rounded-sm px-2xs py-2xs"
                      htmlFor={`perm-${o.code}`}
                    >
                      <Checkbox
                        id={`perm-${o.code}`}
                        checked={chosen.has(o.code)}
                        onCheckedChange={() => toggle(o.code)}
                      />
                      <span className="gap-3xs flex min-w-0 grow flex-col">
                        <span className="text-body-sm font-medium">{o.label}</span>
                        <span className="text-muted-foreground text-label-sm">{o.code}</span>
                      </span>
                      {/* 后缀: how many operations this one permission unlocks. */}
                      <Tag>{ROLE_TEXT.unlocks(o.unlocks)}</Tag>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Drawer>
    </div>
  );
}
