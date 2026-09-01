"use server";

import { revalidatePath } from "next/cache";
import { AtlasClient } from "../../../agent/atlas/client";
import { RunosClient } from "../../../agent/runos/client";
import {
  getCopilotStore,
  getPlanningStore,
  getStrategyStore,
} from "../../../domains/shared/registry";
import { accountCompleteness } from "../../../domains/account/service";
import { runCopilotTurn } from "../../../domains/copilot/turn-service";
import { resolveAppSession, tenantIdOf } from "../../lib/session";

// Ask the assistant to find what the data cannot.
//
// THE LAST MISSING LINK. The model could already propose a field fill, the
// queue could already hold it and - since #142 - accepting could already write
// it. What nothing did was ASK. This is the button that spends the turn.
//
// THE QUESTION IS BUILT HERE, NEVER SENT BY THE CLIENT, and that is two things
// at once. It is the trust boundary: a client-supplied prompt would let anybody
// ask the model anything at all on this workspace's meter, and Atlas bills per
// request. It is also the quality control - the question names the company and
// exactly which fields are missing, which is the difference between a useful
// answer and a paragraph.
//
// IT REFUSES TO SPEND A TURN ON NOTHING. If the record has no gaps the model
// could close, this returns without calling Atlas. A button that always costs
// money whether or not there is a question is a button people learn to avoid.
//
// THE ANSWER IS NOT WRITTEN ANYWHERE. It comes back as proposals in the queue,
// like everything else the machine suggests, and a person accepts them. That is
// ADR-003 and it is also why this action is safe to expose on a page: the worst
// case is a proposal somebody rejects.

export type AskCompleteResult =
  | { ok: true; asked: string[] }
  | { ok: false; error: string };

export async function askToComplete(accountId: string): Promise<AskCompleteResult> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  const tenantId = tenantIdOf(session);
  // Atlas hard-fails without a tenant, so this is refused here rather than
  // spent and lost - see tenantIdOf.
  if (!tenantId) return { ok: false, error: "no_active_tenant" };

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  // Re-read behind account.view rather than trusting anything from the client.
  // The gaps decide what is asked, so a caller that supplied them could steer
  // the question.
  const completeness = await accountCompleteness(
    {
      ...base,
      store: session.stores.account(),
      pipeline: session.stores.pipeline(),
      planning: getPlanningStore(),
      strategy: getStrategyStore(),
    },
    accountId,
  );
  if (!completeness.ok) {
    return { ok: false, error: completeness.violations[0]?.code ?? "denied" };
  }

  const askable = completeness.value.askable.map((g) => g.field);
  if (askable.length === 0) return { ok: false, error: "nothing_to_ask" };

  const account = await session.stores.account().getAccount(session.workspaceId, accountId);
  if (!account) return { ok: false, error: "not_found" };

  const result = await runCopilotTurn(
    { ...base, store: getCopilotStore() },
    {
      question: completionQuestion(account.name, askable),
      tenantId,
      subject: { type: "account", id: accountId, summary: account.name },
      // AUTOPILOT IS NOT ACTIVE FOR THIS TURN whatever the workspace's posture.
      // A fill the model is unsure of should reach a person, and this is the
      // one turn where the model is being asked about facts it may simply not
      // know - which is exactly when an unwatched write is worst.
      autopilotActive: false,
    },
    { atlasClient: new AtlasClient(), runosClient: new RunosClient() },
  );
  if (!result.ok) return { ok: false, error: result.violations[0]?.code ?? "denied" };

  // The proposals landed in the queue, which the shell counts.
  revalidatePath("/", "layout");
  return { ok: true, asked: askable };
}

/** The four fields, in the words the model should answer in. */
const FIELD_ASK: Record<string, string> = {
  industry: "industry",
  region: "the region of China its headquarters is in",
  segmentCode: "market segment",
  ownerSub: "owner",
};

/**
 * The question, assembled from the record rather than typed by anybody.
 *
 * IT NAMES THE ACTION TYPE, because `action_type` is free text and the model
 * would otherwise invent one - and an invented type is refused by the executor
 * as `not_executable_type`, which reads to the user as the assistant failing
 * rather than as a wording problem.
 *
 * IT ASKS FOR ABSTENTION EXPLICITLY. A model that does not recognise a company
 * will produce a plausible industry if nothing tells it not to, and a wrong
 * industry silently decides the segment, which decides the playbook. "Say you
 * do not know" has to be a permitted answer or it will not be given.
 */
function completionQuestion(name: string, fields: readonly string[]): string {
  const wanted = fields.map((f) => FIELD_ASK[f] ?? f).join(", ");
  return [
    `The customer record for "${name}" is missing: ${wanted}.`,
    `For each one you are confident about, propose it with ${"`propose_action`"} using`,
    `action_type "fill_account_field", subject_type "account", and a payload of`,
    `{ "field": <the field name>, "value": <the value> } where the field name is one of`,
    `${fields.join(", ")}.`,
    `Give one proposal per field, and put your confidence on each.`,
    `If you do not recognise this company, say so and propose nothing for that field -`,
    `a guessed industry decides the market segment and the playbook the team follows,`,
    `so a wrong answer is worse here than no answer.`,
  ].join(" ");
}
