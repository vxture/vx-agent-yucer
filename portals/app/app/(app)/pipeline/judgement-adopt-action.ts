"use server";

import { revalidatePath } from "next/cache";
import { resolveAppSession } from "../lib/session";
import { getCopilotStore, getFieldStore } from "../../domains/shared/registry";
import { createCommitment } from "../../domains/account/field-service";
import { snoozeJudgement } from "../../domains/judgement/service";
import type { Urgency } from "../../domains/judgement/lib/judgement";

// 采纳一条判断 (owner 2026-09-26: 判断和分析这一单放在一起，结果都是工作的进一步
// 推进和处置 - 采纳、重新分析、忽略). Adopting a judgement makes it work: a
// 我方承诺 on this deal - a dated step in 推进计划 - in the person's own words,
// and the judgement leaves the list the way 忽略 takes it out (snoozed at its
// urgency), because it has been handled. Both through their own services and
// gates; the person, not the model, wrote the step (ADR-003).

export async function adoptJudgement(
  input: {
    opportunityId: string;
    accountId: string;
    judgementId: string;
    urgency: Urgency;
    statement: string;
    /** YYYY-MM-DD */
    dueOn: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const due = new Date(`${input.dueOn}T00:00:00`);
  if (Number.isNaN(due.getTime())) return { ok: false, error: "due_invalid" };
  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const made = await createCommitment(
    { ...base, store: getFieldStore() },
    {
      accountId: input.accountId,
      opportunityId: input.opportunityId,
      direction: "we_owe",
      statement: input.statement.trim(),
      dueAt: due,
    },
  );
  if (!made.ok) return { ok: false, error: made.violations[0]?.code ?? "denied" };
  // Handled - out of the list. A failed snooze leaves the step written; the
  // judgement simply shows once more, which is the honest failure.
  await snoozeJudgement({ ...base, store: getCopilotStore() }, { judgementId: input.judgementId, urgency: input.urgency });
  revalidatePath(`/pipeline/${input.opportunityId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}
