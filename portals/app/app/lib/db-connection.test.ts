import { test } from "node:test";
import assert from "node:assert/strict";
import { utcConnectionString } from "./db";

test("Prisma sessions use UTC without dropping connection or role options", () => {
  const plain = new URL(
    utcConnectionString(
      "postgresql://test@localhost:5432/scratch?sslmode=require",
    ),
  );
  assert.equal(plain.searchParams.get("sslmode"), "require");
  assert.equal(plain.searchParams.get("options"), "-c timezone=UTC");
  const scoped = new URL(
    utcConnectionString(
      "postgresql://test@localhost/scratch?options=-c%20role%3Dyucer_svc%20-c%20timezone%3DAmerica%2FLos_Angeles",
    ),
  );
  assert.equal(
    scoped.searchParams.get("options"),
    "-c role=yucer_svc -c timezone=America/Los_Angeles -c timezone=UTC",
  );
  assert.equal(scoped.pathname, "/scratch");
});
