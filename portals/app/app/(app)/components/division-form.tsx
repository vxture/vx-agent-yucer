"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, Section } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";
import { removeDivisionAction, saveDivision } from "../territory/actions";

/* 配置大区 - 编辑面. Separate from the roster on purpose: the list answers
 * "how is the market carved", this answers "carve it differently", and putting
 * a picker inside a row made the page do both at once.
 *
 * A PROVINCE ALREADY IN ANOTHER 大区 CAN STILL BE TICKED (owner). It moves
 * here and drops out of the other one - the primary key means it could never
 * have been in two places, so refusing would only send the reader to a second
 * screen to say one thing. What it must not do is move something quietly: each
 * such province is labelled with where it currently sits, before saving.
 */

export interface ProvinceOption {
  readonly province: string;
  /** The 大区 it sits in now, or null. */
  readonly heldBy: string | null;
}

export function DivisionForm(
  { code, name, provinces, options, isNew }:
  {
    readonly code: string;
    readonly name: string;
    readonly provinces: readonly string[];
    readonly options: readonly ProvinceOption[];
    readonly isNew: boolean;
  },
) {
  const { PLANNING_TEXT, TERRITORY_ERROR } = useMessages();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [codeValue, setCode] = useState(code);
  const [nameValue, setName] = useState(name);
  const [chosen, setChosen] = useState<Set<string>>(new Set(provinces));

  const toggle = (p: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  /* Which ticks would take a province off another 大区. Shown BEFORE saving,
     because reorganising somebody else's division is exactly the kind of thing
     that should not be a surprise. */
  const takenFrom = useMemo(
    () =>
      options.filter(
        (o) => chosen.has(o.province) && o.heldBy !== null && !provinces.includes(o.province),
      ),
    [options, chosen, provinces],
  );

  const remove = () => {
    setError(null);
    start(async () => {
      const r = await removeDivisionAction(code);
      if (!r.ok) setError(TERRITORY_ERROR[r.error] ?? r.error);
      else router.push("/territory");
    });
  };

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await saveDivision({
        code: codeValue.trim(),
        name: nameValue.trim(),
        provinces: [...chosen],
      });
      if (!r.ok) setError(TERRITORY_ERROR[r.error] ?? r.error);
      else router.push("/territory");
    });
  };

  return (
    <Section title={PLANNING_TEXT.divisionFormTitle} description={PLANNING_TEXT.divisionFormWhy}>
      {error ? <p className="text-destructive text-body-sm" role="alert">{error}</p> : null}

      <div className="gap-md flex flex-col">
        <label className="gap-2xs flex flex-col">
          <span className="text-body-sm font-medium">{PLANNING_TEXT.divisionCode}</span>
          <input
            className="border-input bg-background h-control-md rounded-sm border px-sm"
            value={codeValue}
            onChange={(e) => setCode(e.target.value)}
            /* The anchor. Editable only while creating: every import and every
               mapping row keys on it, and a division whose code changed is a
               new division wearing an old one's history. */
            disabled={!isNew || pending}
          />
          <span className="text-muted-foreground text-body-sm">
            {PLANNING_TEXT.divisionCodeHint}
          </span>
        </label>

        <label className="gap-2xs flex flex-col">
          <span className="text-body-sm font-medium">{PLANNING_TEXT.divisionNameLabel}</span>
          <input
            className="border-input bg-background h-control-md rounded-sm border px-sm"
            value={nameValue}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
          />
        </label>

        <div className="gap-2xs flex flex-col">
          <span className="text-body-sm font-medium">
            {PLANNING_TEXT.divisionProvincesLabel}
          </span>
          <div className="gap-2xs md:grid-cols-3 grid grid-cols-2 xl:grid-cols-4">
            {options.map((o) => (
              <label className="gap-2xs flex items-center" key={o.province}>
                <input
                  type="checkbox"
                  checked={chosen.has(o.province)}
                  onChange={() => toggle(o.province)}
                  disabled={pending}
                />
                <span className="text-body-sm">{o.province}</span>
                {/* Where it sits now, so a tick that moves it says so. */}
                {o.heldBy && !provinces.includes(o.province) ? (
                  <span className="text-muted-foreground text-body-sm">({o.heldBy})</span>
                ) : null}
              </label>
            ))}
          </div>
        </div>

        {takenFrom.length > 0 ? (
          <ul className="gap-2xs flex flex-col">
            {takenFrom.map((o) => (
              <li className="text-warning text-body-sm" key={o.province}>
                {PLANNING_TEXT.divisionTakenFrom(o.province, o.heldBy!)}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="gap-sm flex items-center">
          <Button onClick={submit} disabled={pending}>
            {PLANNING_TEXT.divisionSave}
          </Button>
          {/* REMOVAL IS OFFERED ONLY WHEN IT HOLDS NOTHING, which is the
              foreign key's own rule (ON DELETE RESTRICT) shown rather than
              enforced after the fact. The service refuses either way; not
              offering it saves the reader a refusal they can predict. */}
          {!isNew && provinces.length === 0 ? (
            <Button variant="secondary" disabled={pending} onClick={remove}>
              {PLANNING_TEXT.divisionRemove}
            </Button>
          ) : null}
          {!isNew && provinces.length > 0 ? (
            <span className="text-muted-foreground text-body-sm">
              {PLANNING_TEXT.divisionRemoveWhy}
            </span>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
