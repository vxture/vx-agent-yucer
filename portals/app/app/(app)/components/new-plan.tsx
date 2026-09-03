"use client";

import { useState } from "react";
import { Field, FieldLabel, Input, Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { useSaveAction } from "../lib/use-save-action";
import { SaveRow } from "./save-row";

// Creating a GTM plan.
//
// `strategy.plan.create` was in the action catalogue from batch 1 with nothing
// behind it (TD-016). The port had list, get and update, and this page already
// moved plans through their lifecycle - so a plan could be approved, activated,
// closed and archived, and could not be created. Every plan in every workspace
// would have had to arrive by db-init.
//
// It is upstream of more than itself: sales_target.plan_id and campaign.plan_id
// both point at a plan, so with none there is nothing for a target or a
// campaign to hang off.
//
// NO STATUS FIELD. A new plan is a draft and the table below owns every move
// after that - including the approval that stamps approved_at. Offering a
// status here would be a way to reach "approved" without the transition that
// records it.

export interface NewPlanProps {
  readonly canCreate: boolean;
  readonly onCreate: (input: {
    planNo: string;
    name: string;
    period: string;
    objective: string | null;
    ownerSub: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export function NewPlan({ canCreate, onCreate }: NewPlanProps) {
  const { STRATEGY_TEXT, PLAN_ERROR } = useMessages();
  const [planNo, setPlanNo] = useState("");
  const [name, setName] = useState("");
  const [period, setPeriod] = useState("");
  const [objective, setObjective] = useState("");
  const [ownerSub, setOwnerSub] = useState("");
  const save = useSaveAction(PLAN_ERROR);

  if (!canCreate) return null;

  const ready = planNo.trim() !== "" && name.trim() !== "" && period.trim() !== "";

  return (
    <Section
      icon="plus"
      title={STRATEGY_TEXT.newPlanTitle}
      description={STRATEGY_TEXT.newPlanWhy}
    >
      <div className="flex flex-wrap items-end gap-sm">
        <Field>
          <FieldLabel>{STRATEGY_TEXT.newPlanNo}</FieldLabel>
          <Input value={planNo} onChange={(e) => setPlanNo(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{STRATEGY_TEXT.newPlanName}</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{STRATEGY_TEXT.newPlanPeriod}</FieldLabel>
          <Input value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{STRATEGY_TEXT.newPlanOwner}</FieldLabel>
          <Input value={ownerSub} onChange={(e) => setOwnerSub(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>{STRATEGY_TEXT.newPlanObjective}</FieldLabel>
          <Input value={objective} onChange={(e) => setObjective(e.target.value)} />
        </Field>
        <SaveRow
          action={save}
          label={STRATEGY_TEXT.newPlanSave}
          savedLabel={STRATEGY_TEXT.newPlanSaved}
          disabled={!ready}
          onSave={() =>
            save.run(
              () =>
                onCreate({
                  planNo: planNo.trim(),
                  name: name.trim(),
                  period: period.trim(),
                  objective: objective.trim() === "" ? null : objective.trim(),
                  ownerSub: ownerSub.trim() === "" ? null : ownerSub.trim(),
                }),
              () => {
                setPlanNo("");
                setName("");
                setObjective("");
              },
            )
          }
        />
      </div>
      {/* The number is the anchor: workspace-unique and with no UPDATE grant,
          so it cannot be corrected later. Said here rather than discovered on
          the second attempt. */}
      <p className="text-muted-foreground mt-sm text-body-sm">{STRATEGY_TEXT.newPlanAnchor}</p>
    </Section>
  );
}
