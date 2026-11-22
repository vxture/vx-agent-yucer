import { SEGMENT_TEXT_LIMITS } from "../../strategy/lib/segment-text-limits";
import { CATALOG_TEXT_LIMITS } from "../../catalog/lib/text-limits";
import { validStrategyResult } from "../../strategy/lib/strategy-result";
import { UUID, type TaskSource } from "./task-contract";
export const BUSINESS_FORM_CONTRACT = "business-form/1";
export const FORM_MODULES = [
  "segment",
  "solution",
  "strategy",
  "sales_plan",
] as const;
export type FormModule = (typeof FORM_MODULES)[number];
export const FORM_FIELDS: Record<FormModule, readonly string[]> = {
  segment: [
    "name",
    "priority",
    "status",
    "criteria",
    "solutionIds",
    "productIds",
  ],
  solution: ["name", "summary", "scenario", "novelty", "items"],
  strategy: [
    "name",
    "period",
    "ownerSub",
    "objective",
    "strategyTypeId",
    "result",
    "changeReason",
    "targetMarkets",
    "solutionIds",
    "productIds",
  ],
  sales_plan: ["year", "content"],
};
export type FormFields = Record<string, unknown>;
export interface BusinessForm {
  module: FormModule;
  targetId: string | null;
  baseVersion: string | null;
  baseline?: FormFields;
  fields: FormFields;
  manualFields: string[];
  sources: TaskSource[];
}
export function isFormModule(v: unknown): v is FormModule {
  return (
    typeof v === "string" && (FORM_MODULES as readonly string[]).includes(v)
  );
}
export function fieldsFor(module: FormModule, value: unknown): FormFields {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("invalid_form_fields");
  const fields = value as FormFields;
  if (
    !Object.keys(fields).every((k) => FORM_FIELDS[module].includes(k)) ||
    JSON.stringify(fields).length > 20000
  )
    throw Error("invalid_form_fields");
  if (
    "name" in fields &&
    (typeof fields.name !== "string" ||
      fields.name.length >
        (module === "segment"
          ? SEGMENT_TEXT_LIMITS.name
          : module === "solution"
            ? CATALOG_TEXT_LIMITS.name
            : 200))
  )
    throw Error("invalid_form_fields");
  for (const key of [
    "summary",
    "scenario",
    "objective",
    "changeReason",
    "period",
    "ownerSub",
    "strategyTypeId",
  ]) {
    if (
      key in fields &&
      fields[key] !== null &&
      typeof fields[key] !== "string"
    )
      throw Error("invalid_form_fields");
  }
  const invalid = () => {
    throw Error("invalid_form_fields");
  };
  if (module === "segment") {
    if (
      "priority" in fields &&
      (!Number.isInteger(fields.priority) ||
        Number(fields.priority) < 0 ||
        Number(fields.priority) > 9999)
    )
      invalid();
    if (
      "status" in fields &&
      !["active", "paused", "retired"].includes(String(fields.status))
    )
      invalid();
  }
  if (module === "solution") {
    if (
      "novelty" in fields &&
      ![null, "existing", "new"].includes(fields.novelty as null)
    )
      invalid();
    for (const k of ["summary", "scenario"] as const)
      if (
        fields[k] !== undefined &&
        fields[k] !== null &&
        (typeof fields[k] !== "string" ||
          fields[k].length > CATALOG_TEXT_LIMITS[k])
      )
        invalid();
  }
  if (
    "year" in fields &&
    (!Number.isInteger(fields.year) ||
      Number(fields.year) < 2000 ||
      Number(fields.year) > 2200)
  )
    invalid();
  if (fields.result !== undefined && !validStrategyResult(fields.result))
    throw Error("invalid_form_fields");
  if (
    fields.content !== undefined &&
    (!fields.content ||
      typeof fields.content !== "object" ||
      Array.isArray(fields.content))
  )
    invalid();
  if (fields.criteria !== undefined) {
    if (
      !fields.criteria ||
      typeof fields.criteria !== "object" ||
      Array.isArray(fields.criteria)
    )
      throw Error("invalid_form_fields");
    const c = fields.criteria as Record<string, unknown>;
    for (const [key, value] of Object.entries(c)) {
      if (["industries", "regions", "sizes"].includes(key)) {
        if (!Array.isArray(value) || !value.every((v) => typeof v === "string"))
          throw Error("invalid_form_fields");
      } else if (
        ![
          "needSummary",
          "customerNeed",
          "buyingScenario",
          "expectedOutcome",
          "entryBarrier",
        ].includes(key) ||
        typeof value !== "string" ||
        value.length >
          SEGMENT_TEXT_LIMITS[key as keyof typeof SEGMENT_TEXT_LIMITS]
      )
        throw Error("invalid_form_fields");
    }
  }
  if (
    fields.items !== undefined &&
    (!Array.isArray(fields.items) ||
      !fields.items.every(
        (i) =>
          i &&
          typeof i === "object" &&
          typeof i.productId === "string" &&
          Number.isFinite(i.quantity) &&
          i.quantity > 0 &&
          UUID.test(i.productId) &&
          typeof i.optional === "boolean" &&
          (i.note === null ||
            (typeof i.note === "string" &&
              i.note.length <= CATALOG_TEXT_LIMITS.note)),
      ))
  )
    throw Error("invalid_form_fields");
  for (const key of ["solutionIds", "productIds"]) {
    if (
      fields[key] !== undefined &&
      (!Array.isArray(fields[key]) ||
        fields[key].length > 100 ||
        !fields[key].every((id) => typeof id === "string" && UUID.test(id)))
    )
      invalid();
  }
  return fields;
}
export function mergeForm(
  previous: BusinessForm | null,
  module: FormModule,
  targetId: string | null,
  patch: unknown,
  human = false,
): BusinessForm {
  if (targetId !== null && !UUID.test(targetId))
    throw Error("invalid_form_target");
  if (
    previous &&
    (previous.module !== module || previous.targetId !== targetId)
  )
    throw Error("form_target_changed");
  const next = fieldsFor(module, patch),
    manual = new Set(previous?.manualFields ?? []);
  const fields = mergeFormFields(previous?.fields ?? {}, next, manual, human);
  return {
    module,
    targetId,
    baseVersion: previous?.baseVersion ?? null,
    ...(previous?.baseline ? {baseline: previous.baseline} : {}),
    fields,
    manualFields: [...manual],
    sources: previous?.sources ?? [],
  };
}
function object(v: unknown): v is FormFields {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
/** Nested text fields are independent; ordered relation/goal arrays stay atomic. */
export function mergeFormFields(
  previous: FormFields,
  patch: FormFields,
  manual = new Set<string>(),
  human = false,
  parent = "",
): FormFields {
  const fields = { ...previous };
  for (const [key, value] of Object.entries(patch)) {
    const path = parent ? `${parent}.${key}` : key;
    if (!human && manual.has(path)) continue;
    if (object(value) && (fields[key] === undefined || object(fields[key]))) {
      fields[key] = mergeFormFields(
        (fields[key] ?? {}) as FormFields,
        value,
        manual,
        human,
        path,
      );
    } else if (human || ![...manual].some((p) => p.startsWith(`${path}.`))) {
      if (human && JSON.stringify(fields[key]) !== JSON.stringify(value))
        manual.add(path);
      fields[key] = value;
    }
  }
  return fields;
}
export function readBusinessForm(text: string): BusinessForm {
  const v = JSON.parse(text);
  if (
    !isFormModule(v.module) ||
    !Array.isArray(v.manualFields) ||
    !Array.isArray(v.sources) ||
    (v.targetId !== null &&
      (typeof v.targetId !== "string" || !UUID.test(v.targetId))) ||
    (v.baseVersion !== null && typeof v.baseVersion !== "string") ||
    !v.manualFields.every(
      (k: unknown) =>
        typeof k === "string" &&
        FORM_FIELDS[v.module as FormModule].includes(k.split(".")[0]!),
    )
  )
    throw Error("invalid_form_fields");
  fieldsFor(v.module, v.fields);
  if (v.baseline !== undefined && (!object(v.baseline) || JSON.stringify(v.baseline).length > 100000)) throw Error("invalid_form_fields");
  return v as BusinessForm;
}
export function formHref(form: BusinessForm, taskId: string, key: string) {
  const route = {
    segment: "/segment/new",
    solution: "/solution/new",
    strategy: "/strategy/new",
    sales_plan: "/planning",
  }[form.module];
  const query = new URLSearchParams({ xyTask: taskId, xyForm: key });
  if (form.targetId)
    query.set("id", form.targetId);
  if (form.module === "sales_plan" && Number.isInteger(form.fields.year))
    query.set("year", String(form.fields.year));
  return `${route}?${query}`;
}

export interface FormChange { path: string; before: unknown; after: unknown; changed: boolean }
export function formChanges(form: BusinessForm): FormChange[] {
  const changes: FormChange[] = [];
  function visit(next: FormFields, old: FormFields, prefix: string) {
    for (const [key, value] of Object.entries(next)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (object(value)) visit(value, object(old[key]) ? old[key] as FormFields : {}, path);
      else changes.push({path, before: old[key], after: value, changed: JSON.stringify(old[key]) !== JSON.stringify(value)});
    }
  }
  visit(form.fields, form.baseline ?? {}, "");
  return changes;
}
