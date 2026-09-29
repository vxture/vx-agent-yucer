"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusBadge } from "@vxture/design-ui";
import type { ProductRecord, ProductTypeRecord } from "../../domains/catalog/store";
import { typeLabel, typesInOrder } from "../../domains/catalog/lib/type-vocab";
import { useMessages } from "../lib/i18n/provider";
import { Tag } from "./tag";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import { ProductTypeDialog, type ProductTypeDialogOpen } from "./product-type-dialog";

// 产品类型, two levels (incr/0100; owner, 2026-09-29).
//
// THE LIST IS FLAT: one row per complete category - 01-01 软件产品-基础软件,
// 02 订阅服务. A 一级类 with 二级类 under it has no row of its own; it is
// edited on the first line of any of its children's dialogs. A 一级类 with
// none is its own row, as before (single level still valid).
//
// NO MANUAL ORDER: the number is the order. 上移/下移 would move a row while
// its number said something else.

type TypeRow = ProductTypeRecord & { readonly code: string; readonly no: string; readonly fullName: string };

interface TypeRowInput {
  id?: string;
  typeNo: string;
  name: string;
  typeCode: string;
}

export interface CatalogTypeConfigProps {
  readonly types: readonly ProductTypeRecord[];
  readonly products: readonly ProductRecord[];
  readonly onSave: (input: { level1: TypeRowInput; level2?: TypeRowInput | null }) => Promise<VocabularyResult>;
  readonly onStatus: (typeId: string, status: "active" | "retired") => Promise<VocabularyResult>;
  readonly onDelete: (id: string) => Promise<VocabularyResult>;
}

export function CatalogTypeConfig({ types, products, onSave, onStatus, onDelete }: CatalogTypeConfigProps) {
  const { CATALOG_TEXT, CATALOG_ERROR } = useMessages();
  const router = useRouter();
  const [dialog, setDialog] = useState<ProductTypeDialogOpen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const hasChildren = (id: string) => types.some((t) => t.parentId === id);
  const rows: TypeRow[] = typesInOrder(types)
    .filter((t) => !hasChildren(t.id))
    .map((t) => {
      const label = typeLabel(types, t.id)!;
      return {
        ...t,
        // The vocabulary table reads `name` and `code`: the full name, and the
        // codes joined the same way (software-basic).
        name: label.name,
        fullName: label.name,
        no: label.no,
        // Its OWN code: a 二级类's code already reads as itself
        // (software-basic); prefixing the parent's repeated it and wrapped.
        code: t.typeCode,
      };
    });
  const inUse = (typeId: string) => products.filter((p) => p.typeId === typeId).length;

  return (
    <>
      <VocabularyConfig
        rows={rows}
        idPrefix="type"
        /* squares-four, not package/cube (owner: 产品配置页头跟产品类型这两个
           相邻标题图标撞了 - 都是"箱子"轮廓，视觉上分不清). */
        icon="squares-four"
        errors={CATALOG_ERROR}
        text={{
          title: CATALOG_TEXT.typesTitle,
          noun: CATALOG_TEXT.typeNoun,
          why: CATALOG_TEXT.typesWhy,
          add: CATALOG_TEXT.addType,
          save: CATALOG_TEXT.saveType,
          codeLabel: CATALOG_TEXT.typeCode,
          codeHint: CATALOG_TEXT.typeCodeHint,
          nameLabel: CATALOG_TEXT.colTypeName,
          colName: CATALOG_TEXT.colTypeName,
          deleteConsequence: CATALOG_TEXT.typeDeleteConsequence,
        }}
        nameSuffix={(t) => <Tag>{t.no}</Tag>}
        columns={[
          {
            id: "code",
            header: CATALOG_TEXT.typeCodeLabel,
            width: "md",
            cell: (t) => <span className="text-muted-foreground whitespace-nowrap text-body-sm">{t.code}</span>,
          },
          {
            id: "linked",
            header: CATALOG_TEXT.colLinkedProducts,
            width: "sm",
            cell: (t) => <span className="tabular-nums">{CATALOG_TEXT.linkedCount(inUse(t.id))}</span>,
          },
          {
            id: "status",
            header: CATALOG_TEXT.colTypeStatus,
            width: "lg",
            cell: (t) =>
              t.status === "retired" ? (
                <Tag>{CATALOG_TEXT.typeRetiredBadge}</Tag>
              ) : (
                <StatusBadge tone="success">{CATALOG_TEXT.typeEffectiveBadge}</StatusBadge>
              ),
          },
        ]}
        sortOn={{ name: (t) => t.no, linked: (t) => inUse(t.id) }}
        extraActions={(t, run) => [
          {
            id: "toggle",
            label: t.status === "active" ? CATALOG_TEXT.typeRetire : CATALOG_TEXT.typeReinstate,
            onSelect: () => run(onStatus(t.id, t.status === "active" ? "retired" : "active")),
          },
        ]}
        extraDefaults={{}}
        extraFromRow={() => ({})}
        customDialog={{
          onAdd: () => {
            setError(null);
            setDialog({ mode: "create" });
          },
          onEdit: (t) => {
            setError(null);
            setDialog({ mode: "edit", typeId: t.id });
          },
        }}
        // Never reached: customDialog owns creating and editing.
        onSave={async () => ({ ok: true })}
        onDelete={onDelete}
      />
      <ProductTypeDialog
        types={types}
        open={dialog}
        pending={pending}
        error={error}
        onClose={() => setDialog(null)}
        onSubmit={(input) =>
          start(async () => {
            const r = await onSave(input);
            if (r.ok) {
              setDialog(null);
              router.refresh();
            } else {
              setError(CATALOG_ERROR[r.error ?? "denied"] ?? CATALOG_ERROR.denied);
            }
          })
        }
      />
    </>
  );
}
