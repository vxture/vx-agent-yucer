"use client";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  PanelCard,
  Section,
  Textarea,
} from "@vxture/design-ui";
import { RowActions } from "../components/table-fittings";
import { useMessages } from "../lib/i18n/provider";
import type { PlanContent } from "../../domains/planning/plan-model";
import {
  prerequisiteGroups,
  readPrerequisites,
  writePrerequisites,
  type PrerequisiteGroup,
} from "../../domains/planning/plan-prerequisites";

export function PlanAssumptions({
  content,
  edit,
  disabled,
  onReview,
}: {
  content: PlanContent;
  edit: ((c: PlanContent) => void) | null;
  disabled: boolean;
  onReview: () => void;
}) {
  const { PLAN_VERSION_TEXT: T } = useMessages();
  const groups = readPrerequisites(content.assumptions);
  const update = (group: PrerequisiteGroup, items: string[]) =>
    edit?.({
      ...content,
      assumptions: writePrerequisites({ ...groups, [group]: items }),
    });
  return (
    <Section
      icon="file-text"
      title={T.assumptions}
      description={T.assumptionsHint}
      action={
        <RowActions
          label={`${T.assumptions} · ${T.diff}`}
          items={[
            {
              id: "diff",
              label: T.diff,
              icon: "git-branch",
              onSelect: onReview,
            },
          ]}
        />
      }
    >
      <div className="flex flex-col gap-lg">
        {edit && content.assumptions.length > 8000 ? (
          <FieldError id="plan-prerequisites-error">
            {T.prerequisitesTooLong}
          </FieldError>
        ) : null}
        <FieldGroup columns={2}>
          {prerequisiteGroups
            .filter((group) => group !== "general" || groups.general.length > 0)
            .map((group) => (
              <Field
                key={group}
                span={group === "general" ? "full" : undefined}
              >
                <PanelCard
                  title={T.prerequisiteLabels[group]}
                  description={T.prerequisiteHints[group]}
                  action={
                    edit ? (
                      <RowActions
                        label={`${T.prerequisiteLabels[group]} · ${T.addPrerequisite}`}
                        disabled={disabled}
                        items={[
                          {
                            id: "add",
                            label: T.addPrerequisite,
                            icon: "plus",
                            onSelect: () =>
                              update(group, [...groups[group], ""]),
                          },
                        ]}
                      />
                    ) : undefined
                  }
                >
                  <div className="flex w-full min-w-0 flex-col gap-md">
                    {groups[group].length ? (
                      edit ? (
                        groups[group].map((item, i) => (
                          <Field key={i}>
                            <div className="flex items-center justify-between gap-sm">
                              <FieldLabel
                                htmlFor={`prerequisite-${group}-${i}`}
                              >
                                {T.prerequisiteItem(i + 1)}
                              </FieldLabel>
                              <Button
                                size="md"
                                variant="ghost"
                                disabled={disabled}
                                aria-label={`${T.remove} ${T.prerequisiteLabels[group]} ${i + 1}`}
                                onClick={() =>
                                  update(
                                    group,
                                    groups[group].filter(
                                      (_, index) => index !== i,
                                    ),
                                  )
                                }
                              >
                                {T.remove}
                              </Button>
                            </div>
                            <Textarea
                              id={`prerequisite-${group}-${i}`}
                              value={item}
                              rows={2}
                              aria-invalid={
                                content.assumptions.length > 8000 || undefined
                              }
                              aria-describedby={
                                content.assumptions.length > 8000
                                  ? "plan-prerequisites-error"
                                  : undefined
                              }
                              disabled={disabled}
                              placeholder={T.prerequisitePlaceholder}
                              onChange={(e) =>
                                update(
                                  group,
                                  groups[group].map((x, index) =>
                                    index === i ? e.target.value : x,
                                  ),
                                )
                              }
                            />
                          </Field>
                        ))
                      ) : (
                        <ul className="list-disc space-y-sm pl-lg text-body-small">
                          {groups[group].map((item, i) => (
                            <li key={i} className="whitespace-pre-wrap">
                              {item || T.empty}
                            </li>
                          ))}
                        </ul>
                      )
                    ) : (
                      <p className="text-body-small text-muted-foreground">
                        {T.prerequisiteEmpty}
                      </p>
                    )}
                  </div>
                </PanelCard>
              </Field>
            ))}
        </FieldGroup>
        <FieldGroup columns={2}>
          {(["allocationNote", "capacityNote"] as const).map((field) => (
            <Field key={field}>
              <FieldLabel htmlFor={`plan-${field}`}>{T[field]}</FieldLabel>
              <FieldDescription>
                {field === "allocationNote" ? T.allocationHint : T.capacityHint}
              </FieldDescription>
              {edit ? (
                <Textarea
                  id={`plan-${field}`}
                  value={content[field]}
                  maxLength={8000}
                  rows={3}
                  disabled={disabled}
                  onChange={(e) =>
                    edit({ ...content, [field]: e.target.value })
                  }
                />
              ) : (
                <p className="whitespace-pre-wrap text-body-small text-muted-foreground">
                  {content[field] || T.empty}
                </p>
              )}
            </Field>
          ))}
        </FieldGroup>
      </div>
    </Section>
  );
}
