import { PAGE_SURFACES } from "./page-surfaces";
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
  surface?: string;
  filters?: Record<string,string>;
  selection?: TaskObject[];
  form?: { module: string; fields: string[]; dirty: boolean; revision?: number };
}
export type TaskFocus = { mode: "auto" } | { mode: "none" } | { mode: "manual"; object: TaskObject };
const kinds: Partial<Record<PageModule, TaskObject["kind"]>> = {
  account: "account", named: "account", pipeline: "opportunity", lead: "lead", strategy: "strategy",
  segment: "segment", catalog: "product", solution: "solution", campaign: "campaign", delivery: "project", planning: "sales_plan",
};

export const PAGE_FILTERS = ["status","year","period","scope","region","owner","sort","dir","revision","query","level","health","stage","forecast","priority","type","plan","view","planRevision","perspective","evidence","outcome","reason","dates","q"] as const;
export const validPageFilter = (key: string, value: unknown): value is string => {
  if (!(PAGE_FILTERS as readonly string[]).includes(key) || typeof value !== "string") return false;
  if (key === "query" || key === "q") return value.length <= 160 && !/[\x00-\x1f]/.test(value);
  if (key === "planRevision") return UUID.test(value);
  // A display focus only: reporting services still resolve and authorize scope.
  if (key === "scope") return /^(workspace|team|personal|(?:owner|territory):[a-zA-Z0-9_-]{1,80})$/.test(value);
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value);
};

/** Only routing metadata, never an arbitrary URL, DOM snapshot or authority. */
export function routePageContext(path: string, search = ""): TaskPageContext | null {
  const [head, id] = path.split("/").filter(Boolean);
  const surface = PAGE_SURFACES.find(row=>row.route===path) ?? PAGE_SURFACES.find(row=>new RegExp("^"+row.route.replace(/\[[^\]]+\]/g,"[^/]+")+"/?$").test(path));
  const module = (surface?.module ?? head ?? "home") as PageModule;
  if (!PAGE_MODULES.includes(module)) return null;
  const params = new URLSearchParams(search);
  const candidate = [id, params.get("id"), params.get("edit")].find(value => value && UUID.test(value));
  const object = candidate && kinds[module] ? { kind: kinds[module]!, id: candidate } : null;
  const tail = path.split("/").filter(Boolean).at(-1);
  const create = tail === "new" || tail === "create" || tail === "complete";
  const filters=Object.fromEntries(PAGE_FILTERS.flatMap(key=>{const value=params.get(key);return value && validPageFilter(key,value)?[[key,value]]:[];}));
  return { contractVersion: PAGE_CONTEXT_VERSION, module,...(surface?{surface:surface.route}:{}),...(Object.keys(filters).length?{filters}:{}),
    view: create ? object ? "edit" : "create" : object ? "detail" : ["home", "copilot", "domain"].includes(module) ? "overview" : "list", object };
}

/** Strict wire boundary: no scope, permissions, field values or instructions. */
export function isTaskPageContext(value: unknown): value is TaskPageContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !["contractVersion", "module", "view", "object", "form", "surface", "filters", "selection"].includes(k)) ||
    v.contractVersion !== PAGE_CONTEXT_VERSION || !PAGE_MODULES.includes(v.module as PageModule) ||
    !["overview", "list", "detail", "create", "edit"].includes(String(v.view)) ||
    (v.object !== null && !isTaskObject(v.object))) return false;
  if (v.object && (v.object as TaskObject).kind !== kinds[v.module as PageModule]) return false;
  if(v.surface!==undefined && !PAGE_SURFACES.some(s=>s.route===v.surface && s.module===v.module))return false;
  if(v.filters!==undefined){
    if(!v.filters || typeof v.filters!=="object" || Array.isArray(v.filters) || Object.entries(v.filters).some(([key,value])=>!validPageFilter(key,value)))return false;
  }
  if(v.selection!==undefined && (!Array.isArray(v.selection) || v.selection.length>20 || !v.selection.every(isTaskObject)))return false;
  if (v.form !== undefined) {
    if (!v.form || typeof v.form !== "object" || Array.isArray(v.form)) return false;
    const f = v.form as Record<string, unknown>;
    if (Object.keys(f).some(k => !["module", "fields", "dirty", "revision"].includes(k)) ||
      !["account", "segment", "strategy", "solution", "sales_plan"].includes(String(f.module)) ||
      ((f.module === "sales_plan" ? "planning" : f.module) !== v.module && v.module !== "copilot") ||
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
