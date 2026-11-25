import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichSignals, filterSignalInbox } from "./signal-inbox";
import type { SignalRecord } from "../../domains/signal/store";
const now = new Date("2026-11-25T12:00:00Z");
const signal = (id: string, status: SignalRecord["status"]): SignalRecord => ({ id, workspaceId: "ws", source: "manual", sourceRef: id,
  subject: "Subscription upgrade", signalType: "intent", detectedAt: now, payload: { company_name: "Acme", summary: "GIS platform renewal" },
  status, score: status === "new" ? null : 80, accountId: null, targeting: null });
const filter = { scope: "pending" as const, query: "", type: "", match: "" };

test("terminal outcomes are excluded from pending but remain findable", () => {
  const rows = enrichSignals(["new", "scored", "promoted", "dismissed", "duplicate"].map(s => signal(s, s as SignalRecord["status"])), now);
  assert.deepEqual(filterSignalInbox(rows, filter, {}).map(s => s.record.status), ["new", "scored"]);
  assert.equal(filterSignalInbox(rows, { ...filter, scope: "processed" }, {}).length, 3);
  assert.equal(filterSignalInbox(rows, { ...filter, scope: "all" }, {}).length, 5);
});
test("pending selection and search include records beyond the old 100-row cap", () => {
  const rows = enrichSignals([...Array.from({ length: 120 }, (_, i) => signal(String(i), "promoted")), signal("fresh", "new")], now);
  assert.equal(filterSignalInbox(rows, filter, {})[0].record.id, "fresh");
  assert.equal(filterSignalInbox(rows, { ...filter, query: "gIs" }, {}).length, 1);
});
test("customer matching filter and search use readable names, not ids", () => {
  const rows = enrichSignals([{ ...signal("one", "scored"), accountId: "customer-id" }, signal("two", "new")], now);
  assert.equal(filterSignalInbox(rows, { ...filter, query: "Geodata" }, { "customer-id": "Geodata" }).length, 1);
  assert.equal(filterSignalInbox(rows, { ...filter, query: "customer-id" }, {}).length, 0);
  assert.equal(filterSignalInbox(rows, { ...filter, match: "unmatched" }, {}).length, 1);
});
test("time decay is recomputed without changing original evidence or saved score", () => {
  const record = { ...signal("old", "scored"), detectedAt: new Date(now.getTime() - 60 * 86_400_000) };
  const row = enrichSignals([record], now)[0];
  assert.ok(row.recomputed! < record.score!);
  assert.equal(record.score, 80);
  assert.equal(record.status, "scored");
});
