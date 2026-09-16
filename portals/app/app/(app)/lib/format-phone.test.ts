import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhone } from "./format-phone";

test("strips +86 and groups an 11-digit mobile number 3-4-4", () => {
  assert.equal(formatPhone("+8618092907523"), "180 9290 7523");
});

test("groups a bare 11-digit number the same way, no +86 to strip", () => {
  assert.equal(formatPhone("18092907523"), "180 9290 7523");
});

test("verbatim when it is not an 11-digit CN mobile shape", () => {
  assert.equal(formatPhone("+1 555 0100"), "+1 555 0100");
  assert.equal(formatPhone("010-12345678"), "010-12345678");
  assert.equal(formatPhone("+861234"), "+861234");
});
