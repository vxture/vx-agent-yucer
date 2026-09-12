"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  DataTable,
  FilterBar,
  Icon,
  ListCard,
  ListCardGrid,
  ViewHeader,
  type ActionMenuItem,
  type FilterBarView,
  type IconName,
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
  SearchSlot,
  moveItems,
  rowClickSelection,
  useTableSort,
} from "./table-fittings";
import { Tag } from "./tag";
import type { MoveDirection } from "../../domains/shared/ordering";

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
  /** The XX of the row menu - 行业 / 单位 / 业务线: XX配置, 删除XX (ROW_OPS). */
  readonly noun: string;
  readonly add: string;
  readonly save: string;
  readonly codeLabel: string;
  readonly codeHint: string;
  readonly nameLabel: string;
  readonly colName: string;
  readonly deleteConsequence: string;
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
  icon,
  editable = true,
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
   * takes the ViewHeader (icon + count in `secondary`), and the add button
   * goes in a FilterBar of its own above the table - the same place
   * org-panel.tsx/division-panel.tsx put theirs (owner ruling, batch 2: a
   * page-level ViewHeader.action is for page-level controls, not "new row").
   * Stacked with others (产品配置 carries three) it is a Section instead,
   * because there the page header names the trio and each table has to say
   * which one it is.
   *
   * The panel owns the dialog, so it has to own whichever control opens it -
   * a server page cannot hand a Button its open state.
   */
  readonly page?: { readonly icon: NavIcon; readonly count: (n: number) => string };
  /**
   * The Section branch's OWN icon (owner ruling, batch 2: 标题邻近的堆叠场景
   * 也要有图标，互相用不同的图标区分；样式统一到 org-unit-form.tsx 的
   * 部门设置/关联区域 - level 2, 24px icon, 不单独降级). Only meaningful when
   * `page` is absent - given, it prints an invisible spacer icon of the same
   * name/size ahead of the content column, so the content lines up with the
   * TITLE text rather than the section's raw left edge, same device
   * org-unit-form.tsx uses. Omit to keep the old icon-less heading (e.g. a
   * caller that hasn't opted in yet).
   */
  readonly icon?: IconName;
  /**
   * Whether this vocabulary may be WRITTEN, not just seen (owner: 所有这些
   * 页面、按钮都需要权限点 - 复用各表已有的权限码). Defaults to `true` for
   * callers whose page already gates the whole route (a `redirect()` when the
   * upsert permission is missing, e.g. org-kinds/product/role-groups - there
   * is no "can see but not write" state to represent). `industry-config.tsx`/
   * `win-loss-reason-config.tsx` pass their own `can(..., "account.upsert" |
   * "pipeline.winloss.record", "ui")` result, because those two pages show
   * the table to anyone who can VIEW it. `false` disables (never hides) the
   * new-button and drops the rename/delete row actions, the same "greyed not
   * gone" contract `FilterBar.actions` documents for 新建.
   */
  readonly editable?: boolean;
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
  readonly onMove: (id: string, direction: MoveDirection) => Promise<VocabularyResult>;
  readonly onDelete: (id: string) => Promise<VocabularyResult>;
}) {
  const { DATA_TABLE_LABELS, ROW_OPS } = useMessages();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<
    { mode: "create" | "rename"; code: string; name: string; extra: E } | null
  >(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [view, setView] = useState<FilterBarView>("list");
  /* 搜索 (owner: 表头操作行参照 /admin/permissions 补齐, 筛选组的补齐) - by
     name or code, front-end only: every vocabulary here is a handful of rows
     to a few dozen, never enough to need a server round-trip. */
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  }, [rows, query]);
  const sorted = useTableSort<T>([], { name: (r: T) => r.name, ...sortOn });
  const select = rowClickSelection(filtered, (r) => r.id, selected, setSelected);
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
      disabled={!editable}
      onClick={() => setDialog({ mode: "create", code: "", name: "", extra: extraDefaults })}
    >
      {text.add}
    </Button>
  );

  /* Shared between the table row and the card - same menu either way (owner:
     表头操作行统一, list/card 切换补齐). rowIndex is computed against
     `filtered`, not the true stored order - moveItems' 上移/下移 greying
     reflects what a reader is currently looking at, the same "local to the
     view" choice search results carry everywhere else in this product. */
  const actionsFor = (r: T) => {
    const rowIndex = filtered.findIndex((x) => x.id === r.id);
    return (
      <RowActions
        disabled={pending}
        items={[
          /* THE ONE MENU EVERY PANEL HAS (owner, 2026-09-09): XX配置,
             the vocabulary's own verbs, the four moves, 删除XX - all gated
             on `editable`, since a reader with no write permission gets the
             read-only half of this menu, not a dialog the server refuses. */
          ...(editable
            ? [
                {
                  id: "rename",
                  label: ROW_OPS.configure(text.noun),
                  onSelect: () =>
                    setDialog({
                      mode: "rename",
                      code: r.code,
                      name: r.name,
                      extra: extraFromRow(r),
                    }),
                },
              ]
            : []),
          ...(editable && extraActions ? extraActions(r, run) : []),
          ...(editable ? moveItems(ROW_OPS, rowIndex, filtered.length, (d) => run(onMove(r.id, d))) : []),
          ...(deleteHiddenWhen?.(r) || !editable
            ? []
            : [
                {
                  id: "delete",
                  label: ROW_OPS.remove(text.noun),
                  danger: true as const,
                  separatorBefore: true,
                  disabled: deletableWhen ? !deletableWhen(r) : false,
                  confirm: {
                    verb: ROW_OPS.remove(text.noun),
                    target: r.name,
                    consequence: text.deleteConsequence,
                    onConfirm: () => run(onDelete(r.id)),
                  },
                },
              ]),
        ]}
      />
    );
  };

  const search = (
    <SearchSlot>
      <Input
        type="search"
        className="w-full"
        value={query}
        placeholder={ROW_OPS.searchPlaceholder}
        aria-label={ROW_OPS.searchLabel}
        onChange={(e) => setQuery(e.target.value)}
      />
    </SearchSlot>
  );
  const count =
    filtered.length === rows.length
      ? ROW_OPS.toolbarCount(rows.length, text.noun)
      : ROW_OPS.toolbarFilteredCount(filtered.length, rows.length, text.noun);
  /* 首列宽度按业务列数量分档 (owner, 表格列宽新一轮规则): 1-2 列→50%，
     3-4 列→40%，5+ 列→30%（跟 org-panel.tsx 7 列时的既有 30% 同档）。
     `columns` 是调用方在 name 列之外追加的列，+1 把 name 自己算进业务列
     总数里 - 8 个调用方共用这一处公式，不用每个文件各自算一遍。 */
  const businessColumns = columns.length + 1;
  /* Tailwind's scanner needs the full class string literal in source - a
     runtime-built `w-[${n}%]` never gets its CSS generated. Three named
     branches instead of interpolating the number. */
  const titleWidthClass =
    businessColumns <= 2
      ? "[&_thead_th:nth-child(3)]:w-[50%]"
      : businessColumns <= 4
        ? "[&_thead_th:nth-child(3)]:w-[40%]"
        : "[&_thead_th:nth-child(3)]:w-[30%]";

  return (
    <>
      {page ? (
        <ViewHeader
          icon={page.icon}
          title={text.title}
          description={text.why}
          secondary={<Tag>{page.count(rows.length)}</Tag>}
        />
      ) : null}
      {page ? (
        <FilterBar
          count={count}
          view={view}
          onViewChange={(v) => {
            setView(v);
            setSelected([]);
          }}
          search={search}
          actions={add}
        />
      ) : null}
    <Section
      title={page ? undefined : text.title}
      description={page ? undefined : text.why}
      icon={page ? undefined : icon}
    >
      {page ? null : (
        <FilterBar
          count={count}
          view={view}
          onViewChange={(v) => {
            setView(v);
            setSelected([]);
          }}
          search={search}
          actions={add}
        />
      )}
      {/* The same two constraints from outside every config table carries
          (TD-022), so they line up column for column. icon 缩进 (owner
          ruling, batch 2, 统一到 org-unit-form.tsx 的 部门设置/关联区域 同一
          个样式 - level 2, 24px icon, 不单独降级) - 一个跟标题同名同尺寸的
          隐形占位图标，让内容列跟标题文字对齐而不是跟 Section 左边缘对齐；
          没有 icon 的调用方(page 模式、或还没选图标的堆叠调用方) 这层 flex
          退化成单子元素，布局不变。 */}
      <div className="gap-lg flex">
        {!page && icon ? (
          <span className="invisible shrink-0" aria-hidden="true">
            <Icon name={icon} size="lg" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {view === "cards" ? (
            <ListCardGrid>
              {sorted.sortRows(filtered).map((r) => (
                <ListCard
                  key={r.id}
                  title={r.name}
                  description={r.code !== r.name ? r.code : undefined}
                  status={nameSuffix ? nameSuffix(r) : undefined}
                  actions={actionsFor(r)}
                  meta={
                    columns.length > 0 ? (
                      <div className="gap-xs flex flex-wrap items-center">
                        {columns.map((c) => (
                          <span key={c.id} className="text-muted-foreground text-body-sm">
                            {c.cell(r)}
                          </span>
                        ))}
                      </div>
                    ) : undefined
                  }
                />
              ))}
            </ListCardGrid>
          ) : (
            <div
              ref={select.ref}
              className={`[&_table]:table-fixed ${EDGE_COLUMNS} ${ACTION_COLUMN} ${titleWidthClass} ${select.className}`}
            >
              <DataTable
                labels={DATA_TABLE_LABELS}
                indexStart={1}
                selectedKeys={selected}
                onSelectionChange={setSelected}
                rowKey={(r: T) => r.id}
                rows={[...sorted.sortRows(filtered)]}
                sort={sorted.sort}
                onSortChange={sorted.onSortChange}
                columns={[
                  {
                    id: "name",
                    sortable: true,
                    header: text.colName,
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
                rowActions={actionsFor}
              />
            </div>
          )}
        </div>
      </div>

      <DialogForm
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={dialog?.mode === "rename" ? ROW_OPS.configure(text.noun) : text.add}
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
