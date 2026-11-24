import { isTaskObject, UUID, type TaskObject } from "./task-contract";

export const PAGE_CONTEXT_VERSION = "page-context/1";
export const COMPOSER_DRAFT_KEY = "conversation-input";
export const PAGE_MODULES = ["home", "copilot", "strategy", "segment", "catalog", "solution", "planning", "named", "attainment", "winloss", "account", "contact", "capture", "pipeline", "quote", "campaign", "signal", "lead", "funnel", "delivery", "collection", "renewal", "domain", "admin", "upgrade"] as const;
export type PageModule = typeof PAGE_MODULES[number];
export interface TaskPageContext {
  contractVersion: typeof PAGE_CONTEXT_VERSION;
  module: PageModule;
  view: "overview" | "list" | "detail" | "create" | "edit";
  object: TaskObject | null;
  form?: { module: string; fields: string[]; dirty: boolean; revision?: number };
}
export type TaskFocus = { mode: "auto" } | { mode: "none" } | { mode: "manual"; object: TaskObject };
const kinds: Partial<Record<PageModule, TaskObject["kind"]>> = {
  account: "account", named: "account", pipeline: "opportunity", lead: "lead", strategy: "strategy",
  segment: "segment", catalog: "product", solution: "solution", campaign: "campaign", delivery: "project", planning: "sales_plan",
};

/** Only routing metadata, never an arbitrary URL, DOM snapshot or authority. */
export function routePageContext(path: string, search = ""): TaskPageContext | null {
  const [head, id] = path.split("/").filter(Boolean);
  const module = (head ?? "home") as PageModule;
  if (!PAGE_MODULES.includes(module)) return null;
  const params = new URLSearchParams(search);
  const candidate = [id, params.get("id"), params.get("edit")].find(value => value && UUID.test(value));
  const object = candidate && kinds[module] ? { kind: kinds[module]!, id: candidate } : null;
  const create = id === "new" || id === "create" || id === "complete";
  return { contractVersion: PAGE_CONTEXT_VERSION, module,
    view: create ? object ? "edit" : "create" : object ? "detail" : ["home", "copilot", "domain"].includes(module) ? "overview" : "list", object };
}

/** Strict wire boundary: no scope, permissions, field values or instructions. */
export function isTaskPageContext(value: unknown): value is TaskPageContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !["contractVersion", "module", "view", "object", "form"].includes(k)) ||
    v.contractVersion !== PAGE_CONTEXT_VERSION || !PAGE_MODULES.includes(v.module as PageModule) ||
    !["overview", "list", "detail", "create", "edit"].includes(String(v.view)) ||
    (v.object !== null && !isTaskObject(v.object))) return false;
  if (v.object && (v.object as TaskObject).kind !== kinds[v.module as PageModule]) return false;
  if (v.form !== undefined) {
    if (!v.form || typeof v.form !== "object" || Array.isArray(v.form)) return false;
    const f = v.form as Record<string, unknown>;
    if (Object.keys(f).some(k => !["module", "fields", "dirty", "revision"].includes(k)) ||
      !["segment", "strategy", "solution", "sales_plan"].includes(String(f.module)) ||
      (f.module === "sales_plan" ? "planning" : f.module) !== v.module ||
      typeof f.dirty !== "boolean" || !Array.isArray(f.fields) || f.fields.length > 100 ||
      !f.fields.every(k => typeof k === "string" && /^[a-zA-Z][a-zA-Z0-9_.]{0,63}$/.test(k)) ||
      (f.revision !== undefined && (!Number.isSafeInteger(f.revision) || Number(f.revision) < 1))) return false;
  }
  return true;
}

export function isTaskFocus(value: unknown): value is TaskFocus {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return v.mode === "manual" ? Object.keys(v).every(k => ["mode", "object"].includes(k)) && isTaskObject(v.object)
    : ["auto", "none"].includes(String(v.mode)) && Object.keys(v).length === 1;
}
