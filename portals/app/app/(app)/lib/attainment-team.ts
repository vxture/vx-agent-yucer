import type { DataScope } from "../../authz/scope";
import { canReadReportingScope } from "../../authz/forecast-scope";
import { subtreeIds } from "../../domains/planning/lib/org";
import type { OrgUnitRecord } from "../../domains/planning/store";

// Membership defines a team; a shared region or a public deal does not.
export function attainmentTeamMembers(input: {
  sub: string;
  access: DataScope;
  units: readonly OrgUnitRecord[];
  placements: ReadonlyMap<string, string[]>;
  members: readonly {
    sub: string;
    displayName: string | null;
    status: string;
  }[];
}) {
  const { sub, access, units, placements, members } = input;
  const mine = placements.get(sub) ?? [];
  const frame = new Set(mine.flatMap((id) => subtreeIds(units, id)));
  const team = members.filter(
    (m) =>
      m.status === "active" &&
      (m.sub === sub ||
        (placements.get(m.sub) ?? []).some((id) => frame.has(id))) &&
      canReadReportingScope(
        access,
        { scopeType: "owner", ownerSub: m.sub, territoryId: null },
        sub,
      ),
  );
  return {
    placed: mine.length > 0,
    members: team.map((m) => ({
      sub: m.sub,
      name: m.displayName ?? m.sub,
      unit: (placements.get(m.sub) ?? [])
        .filter((id) => frame.has(id))
        .map((id) => units.find((u) => u.id === id)?.name)
        .filter(Boolean)
        .join(" / "),
    })),
  };
}
