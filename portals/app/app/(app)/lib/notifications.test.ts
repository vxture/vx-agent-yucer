import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationItems, notificationTotal } from "./notifications";

test("empty queues are omitted, not listed as zero", () => {
  const items = notificationItems({ overdueCommitments: 2, pendingReviews: 0, downgradedProjects: 1 });
  assert.deepEqual(items.map((i) => i.key), ["overdue", "downgraded"]);
  assert.equal(notificationTotal(items), 3);
});

test("all quiet means no items and a zero badge", () => {
  const items = notificationItems({ overdueCommitments: 0, pendingReviews: 0, downgradedProjects: 0 });
  assert.deepEqual(items, []);
  assert.equal(notificationTotal(items), 0);
});

test("each item lands on the page that owns its queue", () => {
  const items = notificationItems({ overdueCommitments: 1, pendingReviews: 1, downgradedProjects: 1 });
  assert.deepEqual(items.map((i) => i.href), ["/account", "/pipeline", "/delivery"]);
});
