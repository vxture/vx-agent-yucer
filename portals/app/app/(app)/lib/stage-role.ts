import type { IconName, StatusBadgeTone } from "@vxture/design-ui";
import type { StageRole } from "../../domains/pipeline/lib/stage-vocab";

// How a stage's place in the line looks (owner, 2026-09-30: 起点 / 过程 / 终点).
// One map for the stage table's 位置 tag and the 推进标准 cards, so the two
// read the same. The role itself is derived (stage-vocab.ts stageRoles).

export const STAGE_ROLE_TONE: Record<StageRole, StatusBadgeTone> = {
  start: "info",
  process: "neutral",
  won: "success",
  lost: "danger",
};

export const STAGE_ROLE_ICON: Record<StageRole, IconName> = {
  start: "play",
  process: "circle-dashed",
  won: "check-circle",
  lost: "stop",
};
