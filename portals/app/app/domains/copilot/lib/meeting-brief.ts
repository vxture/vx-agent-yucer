// 会议准备包 - "I am seeing this customer in half an hour" (L6 batch five).
//
// Pure synthesis over facts the page already owns (design P1 会前准备):
//   who is coming       - the attendees THE PERSON PICKED, with their role and
//                         stance on each open deal. Never inferred: there is no
//                         calendar integration (对标与取舍 P2: 暂不), and a
//                         brief that guessed who attends would be believed.
//   what we still owe   - commitments open past due, missed, or due soon,
//                         split by who owes whom.
//   money in the air    - instalments overdue or falling due soon.
//   what to walk out with - the health score's primary concern and the
//                         proposals awaiting a decision.
//
// EACH PART STANDS ALONE. One read failing blanks that part with its own
// sentence; the other three still render (read model T3). A part is `ok`,
// `refused` (the reader may not see it) or `failed` (it could not be read) -
// three different things to say, never one "no data".

export const BRIEF_SOON_DAYS = 14;
export const BRIEF_MONEY_SOON_DAYS = 30;
export const BRIEF_MAX_PROPOSALS = 3;

const DAY = 86_400_000;

export type Part<T> =
  | { readonly state: "ok"; readonly items: readonly T[] }
  | { readonly state: "refused" }
  | { readonly state: "failed" };

export interface AttendeeInput {
  contactId: string;
  name: string;
  title: string | null;
  /** One row per open deal whose chain names this person. */
  roles: Array<{ dealName: string; role: string; stance: string | null }>;
}

export interface CommitmentInput {
  id: string;
  direction: string;
  statement: string;
  dueAt: Date;
  status: string;
}

export interface InstalmentInput {
  id: string;
  label: string;
  status: string;
  dueAt: Date | null;
  amount: number;
  currency: string;
}

export interface ConclusionInput {
  /** Null when the reader may not recompute health - not the same as "healthy". */
  health: { score: number; concernCode: string | null; concernDays?: number; concernCount?: number } | null;
  proposals: Array<{ id: string; title: string; rationale: string | null; confidence: number | null }>;
}

export interface BriefCommitment extends CommitmentInput {
  /** Negative when overdue. */
  daysToDue: number;
  urgency: "missed" | "overdue" | "soon";
}

export interface BriefInstalment extends InstalmentInput {
  daysToDue: number | null;
  overdue: boolean;
}

export interface MeetingBrief {
  attendees: readonly AttendeeInput[];
  commitments: Part<BriefCommitment>;
  money: Part<BriefInstalment>;
  conclusion: Part<ConclusionInput["proposals"][number]> & { health?: ConclusionInput["health"] };
}

type Read<T> = { state: "ok"; value: T } | { state: "refused" } | { state: "failed" };

export function buildMeetingBrief(
  input: {
    attendees: readonly AttendeeInput[];
    commitments: Read<readonly CommitmentInput[]>;
    instalments: Read<readonly InstalmentInput[]>;
    conclusion: Read<ConclusionInput>;
  },
  now: Date,
): MeetingBrief {
  const days = (d: Date) => Math.floor((d.getTime() - now.getTime()) / DAY);

  const commitments: Part<BriefCommitment> =
    input.commitments.state !== "ok"
      ? input.commitments
      : {
          state: "ok",
          items: input.commitments.value
            .flatMap((c): BriefCommitment[] => {
              const daysToDue = days(c.dueAt);
              if (c.status === "missed") return [{ ...c, daysToDue, urgency: "missed" }];
              if (c.status !== "open") return [];
              if (daysToDue < 0) return [{ ...c, daysToDue, urgency: "overdue" }];
              if (daysToDue <= BRIEF_SOON_DAYS) return [{ ...c, daysToDue, urgency: "soon" }];
              return [];
            })
            // What is most behind first.
            .sort((a, b) => a.daysToDue - b.daysToDue),
        };

  const money: Part<BriefInstalment> =
    input.instalments.state !== "ok"
      ? input.instalments
      : {
          state: "ok",
          items: input.instalments.value
            .filter((i) => i.status !== "settled" && i.status !== "written_off")
            .map((i) => {
              const daysToDue = i.dueAt ? days(i.dueAt) : null;
              return { ...i, daysToDue, overdue: i.status === "overdue" || (daysToDue !== null && daysToDue < 0) };
            })
            .filter((i) => i.overdue || (i.daysToDue !== null && i.daysToDue <= BRIEF_MONEY_SOON_DAYS))
            .sort((a, b) => (a.daysToDue ?? 0) - (b.daysToDue ?? 0)),
        };

  const conclusion: MeetingBrief["conclusion"] =
    input.conclusion.state !== "ok"
      ? input.conclusion
      : {
          state: "ok",
          health: input.conclusion.value.health,
          items: [...input.conclusion.value.proposals]
            .sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1))
            .slice(0, BRIEF_MAX_PROPOSALS),
        };

  return { attendees: input.attendees, commitments, money, conclusion };
}
