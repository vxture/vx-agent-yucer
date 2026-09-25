import type { ExitCriterionKind } from "./exit-criteria";

// The R1 factory exit criteria (YC-065 R1) - seed data, the same rows
// incr/0087 inserts for workspaces that already have a stage catalog. A new
// workspace gets these on the path that first seeds its catalog
// (listStageDefinitions). exit-criteria-vocab.test.ts parses the increment and
// fails if the two disagree.

export interface ExitCriterionSeed {
  readonly stageCode: string;
  readonly kind: ExitCriterionKind;
  readonly param: Readonly<Record<string, unknown>>;
  readonly name: string;
  readonly sortOrder: number;
}

export const DEFAULT_EXIT_CRITERIA: readonly ExitCriterionSeed[] = [
  { stageCode: "qualify", kind: "slot_filled", param: { slot: "pain" }, name: "痛点已写明", sortOrder: 1 },
  { stageCode: "qualify", kind: "role_present", param: { roles: [] }, name: "至少一位联系人在本单", sortOrder: 2 },
  { stageCode: "discover", kind: "role_present", param: { roles: ["economic"] }, name: "已标注经济决策人", sortOrder: 1 },
  { stageCode: "discover", kind: "slot_filled", param: { slot: "metrics" }, name: "量化价值已写明", sortOrder: 2 },
  { stageCode: "validate", kind: "role_reached", param: { roles: ["economic"], days: 30 }, name: "经济决策人 30 天内触达", sortOrder: 1 },
  { stageCode: "validate", kind: "role_present", param: { roles: ["coach", "technical"] }, name: "已有教练或技术评估人", sortOrder: 2 },
  { stageCode: "validate", kind: "slot_filled", param: { slot: "decision_process" }, name: "决策流程已写明", sortOrder: 3 },
  { stageCode: "propose", kind: "lines_priced", param: {}, name: "明细已定价", sortOrder: 1 },
  { stageCode: "propose", kind: "slot_filled", param: { slot: "paper_process" }, name: "签约流程已写明", sortOrder: 2 },
  { stageCode: "propose", kind: "their_commitments_clear", param: {}, name: "对方承诺无逾期", sortOrder: 3 },
  { stageCode: "negotiate", kind: "lines_priced", param: {}, name: "明细已定价", sortOrder: 1 },
  { stageCode: "negotiate", kind: "close_date_valid", param: {}, name: "成交日未过", sortOrder: 2 },
  { stageCode: "negotiate", kind: "their_commitments_clear", param: {}, name: "对方承诺无逾期", sortOrder: 3 },
];
