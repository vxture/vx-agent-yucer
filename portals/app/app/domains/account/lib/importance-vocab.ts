import type { ImportanceSubject } from "./importance";

// The shipped levels and matrix (YC-065 R11) - seed data, the same rows
// incr/0090 inserts for workspaces that already have customers or deals; a new
// workspace gets them from the service's first contact. importance.test.ts
// parses the increment and fails if the two disagree.

export interface ImportanceLevelSeed {
  readonly subject: ImportanceSubject;
  readonly levelCode: string;
  readonly name: string;
  readonly description: string;
  readonly rank: number;
  readonly isDefault: boolean;
}

export const DEFAULT_IMPORTANCE_LEVELS: readonly ImportanceLevelSeed[] = [
  { subject: "account", levelCode: "strategic", name: "战略级", description: "长期经营、高层互访的客户", rank: 1, isDefault: false },
  { subject: "account", levelCode: "key", name: "关键级", description: "重点跟进、有扩大空间的客户", rank: 2, isDefault: false },
  { subject: "account", levelCode: "standard", name: "普通级", description: "按常规节奏经营的客户", rank: 3, isDefault: true },
  { subject: "opportunity", levelCode: "core", name: "核心", description: "决定本期目标的单子", rank: 1, isDefault: false },
  { subject: "opportunity", levelCode: "major", name: "重点", description: "需要主管关注的单子", rank: 2, isDefault: false },
  { subject: "opportunity", levelCode: "normal", name: "一般", description: "按常规推进的单子", rank: 3, isDefault: true },
];

/** [account code, opportunity code, priority] - P1 P2 P4 / P2 P3 P5 / P3 P5 P6. */
export const DEFAULT_PRIORITY_MATRIX: readonly (readonly [string, string, number])[] = [
  ["strategic", "core", 1], ["strategic", "major", 2], ["strategic", "normal", 4],
  ["key", "core", 2], ["key", "major", 3], ["key", "normal", 5],
  ["standard", "core", 3], ["standard", "major", 5], ["standard", "normal", 6],
];
