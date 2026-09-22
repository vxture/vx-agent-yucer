"use server";

import { revalidatePath } from "next/cache";
import { AtlasClient } from "../../../agent/atlas/client";
import { RunosClient } from "../../../agent/runos/client";
import { getCopilotStore, getFieldStore } from "../../../domains/shared/registry";
import { evidenceForPrompt } from "../../../domains/account/field-service";
import { runCopilotTurn } from "../../../domains/copilot/turn-service";
import { resolveAppSession, tenantIdOf } from "../../lib/session";

export type PasteNotesResult =
  | { ok: true; proposalCount: number }
  | { ok: false; error: string };

export async function structureMeetingNotes(
  accountId: string,
  rawText: string,
): Promise<PasteNotesResult> {
  if (!rawText.trim()) return { ok: false, error: "empty_text" };

  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const account = await session.stores.account().getAccount(session.workspaceId, accountId);
  if (!account) return { ok: false, error: "not_found" };

  const evidenceResult = await evidenceForPrompt(
    { ...base, store: getFieldStore() },
    accountId,
    account.name,
  );

  const result = await runCopilotTurn(
    { ...base, store: getCopilotStore() },
    {
      question: structureQuestion(account.name, rawText),
      tenantId,
      subject: { type: "account", id: accountId, summary: account.name },
      evidence: evidenceResult.ok ? evidenceResult.value : undefined,
      autopilotActive: false,
    },
    { atlasClient: new AtlasClient(), runosClient: new RunosClient() },
  );
  if (!result.ok) {
    return { ok: false, error: result.violations[0]?.code ?? "denied" };
  }

  revalidatePath("/", "layout");
  return { ok: true, proposalCount: result.value.proposals.length };
}

function structureQuestion(accountName: string, rawText: string): string {
  return [
    `The following is a pasted meeting transcript or notes from a conversation`,
    `with the customer "${accountName}". Extract the structured interaction`,
    `and propose it with \`propose_action\` using action_type "record_interaction",`,
    `subject_type "account".`,
    ``,
    `The payload must include:`,
    `- "channel": one of "meeting", "call", "visit", "email", "im", "event", "other"`,
    `- "occurredAt": an ISO 8601 date string (infer from the text, or use today)`,
    `- "rawNote": the original pasted text verbatim (do not rewrite it)`,
    `- "summary": a concise structured summary you draft from the content`,
    `- "subject": a short title for the interaction (e.g. "Q4 planning review")`,
    `- "participants": an array of { "externalName": "...", "roleAtTime": "..." }`,
    `  for each external person mentioned`,
    ``,
    `If the text mentions multiple distinct meetings or calls, propose one`,
    `record_interaction per meeting. Put your confidence on each proposal.`,
    `If the text is too vague to extract meaningful structure, say so and`,
    `propose nothing rather than inventing details.`,
    ``,
    `--- BEGIN PASTED TEXT ---`,
    rawText.slice(0, 8000),
    `--- END PASTED TEXT ---`,
  ].join("\n");
}
