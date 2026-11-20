import type { CustomerBudget, CustomerContribution, PlanAction, PlanRegion, PlanTarget, TeamAllocation } from "./plan-model";
export type FocusAccount = { id: string; name: string; accountNo: string; tier: string; ownerSub: string | null };
export type FocusContribution = CustomerContribution & { budget: Omit<CustomerBudget, "amount"> & { amount: string | null }; target: Pick<PlanTarget, "key" | "period" | "metric" | "currency"> };
export type FocusCoverage =
  | { state: "denied" | "unavailable" }
  | { state: "ready"; keyPeople: number; coveredRoles: number; requiredRoles: number; chains: number; totalChains: number; completeChains: number; unreachableChains: number };
export type FocusContacts = import("../account/contact-read").ContactRosterSummary;
export type FocusRow = FocusAccount & {
  coverage: FocusCoverage;
  contacts: FocusContacts;
  regions: Pick<PlanRegion, "id" | "name" | "ownerSub">[];
  contributions: FocusContribution[];
  unallocated: CustomerBudget[];
  actions: PlanAction[];
  revenue: { currency: string; amount: string }[];
};
export type FocusWorkspace = {
  year: number; period: string; regionId: string | null;
  revision: { id: string; version: number | null; draft: boolean; current: boolean; regionalVersion: number | null } | null;
  versions: { id: string; version: number | null; draft: boolean }[];
  draftId: string | null; companyDraft: boolean; eventNo: number; editToken: number | null;
  closed: boolean; canEdit: boolean; canTeam: boolean;
  regions: Pick<PlanRegion, "id" | "name">[];
  periods: { key: string; start: string; end: string }[];
  candidates: FocusAccount[];
  members: { sub: string; name: string }[];
  currentSub: string;
  rows: FocusRow[];
};
export type FocusChange =
  | { kind: "add"; accountIds: string[]; regionId: string; objective: string; ownerSub: string | null; due: string }
  | { kind: "action"; accountId: string; regionId: string; key?: string; objective: string; ownerSub: string | null; due: string }
  | { kind: "removeAction"; accountId: string; key: string }
  | { kind: "contribution"; accountId: string; regionId: string; targetKey: string; budget: string; amount: string; note: string; responsibility: "primary" | "support"; key?: string }
  | { kind: "remove"; accountId: string; regionId: string; period: string };
export type FocusSaveInput = { year: number; revisionId: string; editToken: number | null; expectedEventNo: number; requestKey: string; change: FocusChange };
export type FocusDetail = { row: FocusRow; regionTeams: { regionId: string; regionName: string; allocations: TeamAllocation[] }[] };
