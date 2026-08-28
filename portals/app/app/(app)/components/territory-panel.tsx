"use client";

import { useState, useTransition } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Section,
  StatusBadge,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// The territory roster: who carries which patch of the market.
//
// This module was `planned` in the launcher while its FEATURE KEY was already
// being sold. `planning.territory` is one of the nineteen frozen keys, offered
// from the PRO tier up, and the only half of it that existed was the read - so
// a paying workspace could look at territories that nothing in the product
// could create. A territory-scoped target needs a territory_id, so regional
// targets were unreachable too.
//
// A SECTION ON /planning, not a route of its own. A section inherits its host's
// nav entry and the host here is /planning, which IS one - the same test that
// keeps 战略客户 planned, since its only host would be a detail page.
//
// THE CODE IS THE IDENTITY. Typing an existing code edits that territory;
// typing a new one creates it. That is upsert-by-anchor, the shape the
// catalogue settled on (ADR-017), and it is why the code field is not
// disabled while editing - retyping it is how you choose what you are editing.

export interface TerritoryRow {
  readonly id: string;
  readonly territoryCode: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly ownerSub: string | null;
  readonly status: string;
}

export interface TerritoryPanelProps {
  readonly rows: readonly TerritoryRow[];
  readonly canEdit: boolean;
  readonly onSave: (input: {
    territoryCode: string;
    name: string;
    parentId: string | null;
    ownerSub: string | null;
    status: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export function TerritoryPanel({ rows, canEdit, onSave }: TerritoryPanelProps) {
  const { DATA_TABLE_LABELS, PLANNING_TEXT, TERRITORY_ERROR } = useMessages();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [ownerSub, setOwnerSub] = useState("");
  const [status, setStatus] = useState("active");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const nameOf = new Map(rows.map((r) => [r.id, r.name]));
  const ready = code.trim() !== "" && name.trim() !== "";

  return (
    <Section
      id="territories"
      icon="map-pin"
      title={PLANNING_TEXT.territoryTitle}
      description={PLANNING_TEXT.territoryWhy}
    >
      {rows.length === 0 ? (
        <EmptyState
          title={PLANNING_TEXT.territoryNone}
          description={PLANNING_TEXT.territoryNoneWhy}
        />
      ) : (
        <DataTable
          labels={DATA_TABLE_LABELS}
          rowKey={(r: TerritoryRow) => r.id}
          rows={[...rows]}
          columns={[
            {
              id: "code",
              header: PLANNING_TEXT.territoryCode,
              cell: (r: TerritoryRow) => r.territoryCode,
            },
            {
              id: "name",
              header: PLANNING_TEXT.territoryName,
              cell: (r: TerritoryRow) => r.name,
            },
            {
              id: "parent",
              header: PLANNING_TEXT.territoryParent,
              // Blank, not "-", for a top-level region: most rows are top level
              // and a column of dashes reads as missing data rather than as the
              // ordinary case.
              cell: (r: TerritoryRow) =>
                r.parentId ? (nameOf.get(r.parentId) ?? r.parentId) : "",
            },
            {
              id: "owner",
              header: PLANNING_TEXT.territoryOwner,
              cell: (r: TerritoryRow) => r.ownerSub ?? PLANNING_TEXT.territoryNoOwner,
            },
            {
              id: "status",
              header: PLANNING_TEXT.territoryStatus,
              align: "center" as const,
              cell: (r: TerritoryRow) =>
                r.status === "active" ? null : (
                  <StatusBadge tone="neutral">{PLANNING_TEXT.territoryRetired}</StatusBadge>
                ),
            },
          ]}
        />
      )}

      {!canEdit ? (
        <p className="text-muted-foreground mt-sm text-xs">{PLANNING_TEXT.territoryDenied}</p>
      ) : (
        <div className="mt-md flex flex-wrap items-end gap-sm">
          <Field>
            <FieldLabel>{PLANNING_TEXT.territoryCode}</FieldLabel>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{PLANNING_TEXT.territoryName}</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{PLANNING_TEXT.territoryParent}</FieldLabel>
            <NativeSelect value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">{PLANNING_TEXT.territoryNoParent}</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>{PLANNING_TEXT.territoryOwner}</FieldLabel>
            <Input value={ownerSub} onChange={(e) => setOwnerSub(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{PLANNING_TEXT.territoryStatus}</FieldLabel>
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">{PLANNING_TEXT.territoryActive}</option>
              <option value="retired">{PLANNING_TEXT.territoryRetired}</option>
            </NativeSelect>
          </Field>
          <Button
            disabled={!ready || pending}
            onClick={() =>
              start(() => {
                void onSave({
                  territoryCode: code.trim(),
                  name: name.trim(),
                  parentId: parentId === "" ? null : parentId,
                  ownerSub: ownerSub.trim() === "" ? null : ownerSub.trim(),
                  status,
                }).then((r) => {
                  setErr(r.ok ? null : (TERRITORY_ERROR[r.error ?? "denied"] ?? r.error ?? ""));
                  setSaved(r.ok);
                  if (r.ok) {
                    setCode("");
                    setName("");
                  }
                });
              })
            }
          >
            {PLANNING_TEXT.territorySave}
          </Button>
          {err ? <StatusBadge tone="danger">{err}</StatusBadge> : null}
          {saved && !err ? (
            <StatusBadge tone="success">{PLANNING_TEXT.territorySaved}</StatusBadge>
          ) : null}
        </div>
      )}
    </Section>
  );
}
