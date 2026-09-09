"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  DataTable,
  ViewHeader,
  type ActionMenuItem,
  DialogForm,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Section,
  TableTitleCell,
  useToast,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import type { NavIcon } from "../lib/navigation";
import {
  ACTION_COLUMN,
  EDGE_COLUMNS,
  RowActions,
  rowClickSelection,
  useTableSort,
} from "./table-fittings";
import { Tag } from "./tag";

// 词表配置面板 - the one table every vocabulary is configured through.
//
// WHY IT IS ONE COMPONENT. 产品类型, 产品状态, 计价单位, 赢丢原因 and 行业分类
// are five independent vocabularies - none of them knows about the others, and
// that separation is deliberate (owner, 2026-09-05). Their SCREEN is not
// independent: every one of them is an anchor code, a display name, an order,
// a count of what points at it, and a delete that is refused while anything
// does. Three copies of that screen had already drifted apart - one showed its
// failure in a badge, the others in a toast - and a fourth copy was about to
// be written for 行业分类.
//
// WHAT STAYS WITH THE CALLER: the copy, the extra columns a particular
// vocabulary needs, the extra fields its dialog collects, and the one or two
// row operations only it has (a type is retired and reinstated; nothing else
// is). Those are the parts that are actually about the subject; everything
// else here is the same table five times.
//
// 产品类型 and 产品状态 were the last two hand-rolled copies (2026-09-09).
// They stayed apart for a real reason - the owner's ruling that the two
// vocabularies know nothing of each other - but that is a rule about the
// DATA, and it survives untouched: each binding still imports only its own
// domain module. Sharing the table is not sharing the vocabulary.

/** What every vocabulary row has, whatever its own table calls the columns. */
export interface VocabRow {
  readonly id: string;
  /** The anchor - `unit_code`, `reason_code`, `industry_code`. Immutable. */
  readonly code: string;
  readonly name: string;
}

export interface VocabularyText {
  readonly title: string;
  readonly why: string;
  readonly add: string;
  readonly edit: string;
  readonly save: string;
  readonly codeLabel: string;
  readonly codeHint: string;
  readonly nameLabel: string;
  readonly colName: string;
  readonly deleteConsequence: string;
  readonly opUp: string;
  readonly opDown: string;
  readonly opDelete: string;
}

export interface VocabularyColumn<T> {
  readonly id: string;
  readonly header: string;
  readonly width?: "sm" | "md" | "lg";
  readonly align?: "numeric";
  readonly sortable?: boolean;
  readonly cell: (row: T) => ReactNode;
}

export interface VocabularyResult {
  ok: boolean;
  error?: string;
}

export function VocabularyConfig<T extends VocabRow, E extends object>({
  rows,
  text,
  errors,
  idPrefix,
  page,
  columns = [],
  sortOn = {},
  nameSuffix,
  extraActions,
  deletableWhen,
  deleteHiddenWhen,
  extraDefaults,
  extraFromRow,
  renderExtra,
  onSave,
  onMove,
  onDelete,
}: {
  readonly rows: readonly T[];
  readonly text: VocabularyText;
  /**
   * Render the page's own header, with the add button in its action slot.
   *
   * TWO SHAPES, BECAUSE THERE ARE TWO SITUATIONS. On a page that is only this
   * table (/admin/industry, /admin/winloss) the vocabulary IS the page: it
   * takes the ViewHeader, and its add button goes where the DS puts a page's
   * actions - the same call /admin/division already made. Stacked with others
   * (产品配置 carries three) it is a Section instead, because there the page
   * header names the trio and each table has to say which one it is.
   *
   * The panel owns the dialog, so it has to own whichever control opens it -
   * a server page cannot hand a Button its open state.
   */
  readonly page?: { readonly icon: NavIcon; readonly count: (n: number) => string };
  /** The violation-code dictionary this vocabulary renders through (TD-010). */
  readonly errors: Record<string, string>;
  /** Prefixes the dialog's field ids, so two panels on one page stay distinct. */
  readonly idPrefix: string;
  /** Columns between the name and the actions - the count, and anything else. */
  readonly columns?: readonly VocabularyColumn<T>[];
  readonly sortOn?: Record<string, (row: T) => string | number>;
  /**
   * Something to show beside the name INSTEAD of the code underneath it.
   *
   * The default prints the code as a second line. A vocabulary whose code
   * carries a tone - a product status, whose code says which lifecycle stage
   * it is - shows it as a coloured tag on the title line and prints nothing
   * underneath, or the code would appear twice.
   */
  readonly nameSuffix?: (row: T) => ReactNode;
  /**
   * Row operations this vocabulary has and the others do not, placed right
   * after 编辑. A type is retired and reinstated; a status is not; a unit is
   * not. The shared table cannot know that, so the binding says.
   *
   * `run` is the panel's own dispatcher - transition plus the failure toast -
   * so an extra operation fails the way every other one does, rather than
   * silently because the binding forgot to say something.
   */
  readonly extraActions?: (
    row: T,
    run: (p: Promise<VocabularyResult>) => void,
  ) => readonly ActionMenuItem[];
  /**
   * Whether the delete control is ENABLED. Greyed means "not while something
   * points at it" - a refusal that goes away once the pointers do. The rule
   * refuses either way; a control whose refusal is predictable should not be
   * a live control. Absent means always enabled.
   */
  readonly deletableWhen?: (row: T) => boolean;
  /**
   * Whether the delete control is OFFERED. Hidden means "never": the three
   * canonical product statuses cannot be deleted in any world, because the
   * roster and its 上线/退役 operations are wired to them, and a greyed control
   * would say "not yet" about something that is "not ever".
   */
  readonly deleteHiddenWhen?: (row: T) => boolean;
  readonly extraDefaults: E;
  readonly extraFromRow: (row: T) => E;
  readonly renderExtra?: (value: E, set: (next: E) => void, disabled: boolean) => ReactNode;
  readonly onSave: (input: { code: string; name: string } & E) => Promise<VocabularyResult>;
  readonly onMove: (id: string, direction: "up" | "down") => Promise<VocabularyResult>;
  readonly onDelete: (id: string) => Promise<VocabularyResult>;
}) {
  const { DATA_TABLE_LABELS } = useMessages();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<
    { mode: "create" | "rename"; code: string; name: string; extra: E } | null
  >(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const sorted = useTableSort<T>([], { name: (r: T) => r.name, ...sortOn });
  const select = rowClickSelection(rows, (r) => r.id, selected, setSelected);
  const { toast } = useToast();
  const router = useRouter();

  /* REFRESH EXPLICITLY AFTER A WRITE THAT LANDED (2026-09-09). The action
     revalidates its path, and the RSC payload that rides back on the action
     response is what usually re-draws the table - usually. The owner moved
     four groups and watched nothing happen while the server had re-ordered
     every one of them: the response stream was cut before the client read
     it, and the page stayed on what it had. A refresh is one more request
     and makes the table read what was written, every time. */
  const run = (p: Promise<VocabularyResult>) =>
    start(async () => {
      const r = await p;
      if (!r.ok) toast({ tone: "danger", title: errors[r.error ?? "denied"] ?? r.error ?? "" });
      else {
        setDialog(null);
        router.refresh();
      }
    });

  const add = (
    <Button
      onClick={() => setDialog({ mode: "create", code: "", name: "", extra: extraDefaults })}
    >
      {text.add}
    </Button>
  );

  return (
    <>
      {page ? (
        <ViewHeader
          icon={page.icon}
          title={text.title}
          description={text.why}
          secondary={<Tag>{page.count(rows.length)}</Tag>}
          action={add}
        />
      ) : null}
    <Section
      title={page ? undefined : text.title}
      description={page ? undefined : text.why}
      action={page ? undefined : add}
    >
      {/* The same two constraints from outside every config table carries
          (TD-022), so they line up column for column. */}
      <div
        ref={select.ref}
        className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN} ${select.className}`}
      >
        <DataTable
          labels={DATA_TABLE_LABELS}
          indexStart={1}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          rowKey={(r: T) => r.id}
          rows={[...sorted.sortRows(rows)]}
          sort={sorted.sort}
          onSortChange={sorted.onSortChange}
          columns={[
            {
              id: "name",
              sortable: true,
              header: text.colName,
              width: "md" as const,
              /* The code is omitted when it equals the name - a second line
                 repeating the first costs height and says nothing. */
              cell: (r: T) =>
                nameSuffix ? (
                  <TableTitleCell title={r.name} tooltip={r.name} titleSuffix={nameSuffix(r)} />
                ) : (
                  <TableTitleCell
                    title={r.name}
                    description={r.code !== r.name ? r.code : undefined}
                    tooltip={r.name}
                  />
                ),
            },
            ...columns,
          ]}
          rowActions={(r: T, rowIndex: number) => (
            <RowActions
              disabled={pending}
              items={[
                {
                  id: "rename",
                  label: text.edit,
                  onSelect: () =>
                    setDialog({
                      mode: "rename",
                      code: r.code,
                      name: r.name,
                      extra: extraFromRow(r),
                    }),
                },
                ...(extraActions ? extraActions(r, run) : []),
                {
                  id: "up",
                  label: text.opUp,
                  disabled: rowIndex === 0,
                  separatorBefore: true,
                  onSelect: () => run(onMove(r.id, "up")),
                },
                {
                  id: "down",
                  label: text.opDown,
                  disabled: rowIndex === rows.length - 1,
                  onSelect: () => run(onMove(r.id, "down")),
                },
                ...(deleteHiddenWhen?.(r)
                  ? []
                  : [
                      {
                        id: "delete",
                        label: text.opDelete,
                        danger: true as const,
                        separatorBefore: true,
                        disabled: deletableWhen ? !deletableWhen(r) : false,
                        confirm: {
                          verb: text.opDelete,
                          target: r.name,
                          consequence: text.deleteConsequence,
                          onConfirm: () => run(onDelete(r.id)),
                        },
                      },
                    ]),
              ]}
            />
          )}
        />
      </div>

      <DialogForm
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={dialog?.mode === "rename" ? text.edit : text.add}
        submitLabel={text.save}
        submitting={pending}
        onSubmit={(e) => {
          e.preventDefault();
          if (dialog) {
            run(onSave({ code: dialog.code.trim(), name: dialog.name.trim(), ...dialog.extra }));
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-code`}>{text.codeLabel}</FieldLabel>
            <Input
              id={`${idPrefix}-code`}
              value={dialog?.code ?? ""}
              /* The anchor: everything points at this row by uuid, but the code
                 is what an import matches on. Locked after creation. */
              disabled={pending || dialog?.mode === "rename"}
              onChange={(e) => setDialog((d) => (d ? { ...d, code: e.target.value } : d))}
            />
            <FieldDescription>{text.codeHint}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-name`}>{text.nameLabel}</FieldLabel>
            <Input
              id={`${idPrefix}-name`}
              value={dialog?.name ?? ""}
              disabled={pending}
              onChange={(e) => setDialog((d) => (d ? { ...d, name: e.target.value } : d))}
            />
          </Field>
          {renderExtra && dialog
            ? renderExtra(
                dialog.extra,
                (next) => setDialog((d) => (d ? { ...d, extra: next } : d)),
                pending,
              )
            : null}
        </FieldGroup>
      </DialogForm>
    </Section>
    </>
  );
}
