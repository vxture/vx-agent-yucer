import { test } from "node:test";
import assert from "node:assert/strict";
import { RunosClient, type RunosConfig, type RunosContext } from "./client";
import {
  SkillLoader,
  SkillDistributionError,
  readDistribution,
  parseFrontmatter,
  renderSkillPrompt,
  skillContextFor,
  sha256,
  skillDeliveryDigest,
  SKILL_FETCH_OPERATION,
} from "./skills";
import type { InvokeResult } from "./types";

const CFG: RunosConfig = {
  baseUrl: "http://runos.test",
  mcpPath: "/v1/mcp",
  timeoutMs: 5_000,
  enabled: true,
};

const CTX: RunosContext = {
  workspaceId: "11111111-1111-1111-1111-111111111111",
  tenantId: "22222222-2222-2222-2222-222222222222",
  taskId: "task_1",
};

const SKILL_MD = `---
name: Deal Qualification
description: How to qualify a B2B opportunity before advancing it
---

# Deal qualification

Check budget, authority, need and timeline before leaving the qualify stage.
`;

function distributed(over: Partial<InvokeResult["meta"]> = {}, content = SKILL_MD): InvokeResult {
  return {
    content: [{ type: "text", text: content }],
    meta: {
      call_id: "call_1",
      version_resolved: "1.0.0",
      result_kind: "distributed",
      content_digest: "registered-contract-digest",
      delivery_digest: skillDeliveryDigest(content, []),
      delivery_digest_format: "skill-package-v1",
      ...over,
    },
  };
}

interface Sent {
  args: Record<string, unknown>;
}

function loaderHarness(results: InvokeResult[]) {
  const sent: Sent[] = [];
  let i = 0;
  let now = 1_000;
  const client = {
    async invoke(args: Record<string, unknown>) {
      sent.push({ args });
      const r = results[Math.min(i, results.length - 1)];
      i += 1;
      return r;
    },
  } as unknown as RunosClient;
  const loader = new SkillLoader(client, 15 * 60_000, () => now);
  return { loader, sent, setNow: (v: number) => (now = v), calls: () => i };
}

// --- The distribution contract ---------------------------------------------

test("a distributed result becomes a skill bundle", () => {
  const b = readDistribution("acme.deal-qual", distributed());
  assert.equal(b.capabilityId, "acme.deal-qual");
  assert.equal(b.version, "1.0.0");
  assert.equal(b.callId, "call_1");
  assert.ok(b.content.includes("Check budget"));
});

test("an EXECUTED result is refused - it is not skill content", () => {
  // The dangerous confusion: treating an executed capability's output as skill
  // text would hand the user the description of an action the product believes
  // it performed.
  assert.throws(
    () => readDistribution("acme.x", distributed({ result_kind: "executed" })),
    SkillDistributionError,
  );
});

test("an ABSENT result_kind means executed, not distributed", () => {
  // The contract says a missing field is equivalent to "executed". Defaulting
  // the other way would silently turn every ordinary call into skill content.
  const r: InvokeResult = { content: [{ type: "text", text: SKILL_MD }], meta: { call_id: "c" } };
  assert.throws(() => readDistribution("acme.x", r), SkillDistributionError);
});

test("a distribution with no text content is refused", () => {
  const r: InvokeResult = { content: [], meta: { result_kind: "distributed" } };
  assert.throws(() => readDistribution("acme.x", r), SkillDistributionError);
});

test("registration identity never masquerades as verified delivered content", () => {
  const b = readDistribution("acme.x", distributed({ content_digest: sha256(SKILL_MD), delivery_digest: undefined }));
  assert.equal(b.digest, sha256(SKILL_MD));
  assert.equal(b.digestVerified, false);
});

test("delivery integrity covers exact markdown and refuses mismatches", () => {
  assert.equal(readDistribution("acme.x", distributed()).digestVerified, true);
  assert.throws(() => readDistribution("acme.x", { ...distributed(), content: [{ type: "text", text: SKILL_MD + "\nchanged" }] }), SkillDistributionError);
  assert.equal(readDistribution("acme.x", distributed({ delivery_digest: `sha256:${skillDeliveryDigest(SKILL_MD, []).toUpperCase()}` })).digestVerified, true);
});

test("legacy and unknown delivery formats are honestly unverified", () => {
  for (const meta of [{ delivery_digest: undefined }, { delivery_digest_format: "future-v2" }, { delivery_digest_format: undefined }]) {
    assert.equal(readDistribution("acme.x", distributed(meta)).digestVerified, false);
  }
});

test("canonical package digest matches the published independent wire vector", () => {
  // Exact canonical JSON from the gateway contract, not the consumer serializer.
  const expected = sha256('{"content":"# Skill\\n","resources":[{"mimeType":"text/markdown","path":"refs/a.md","text":"\\u4e2d"}]}'.replace('\\u4e2d', "\u4e2d"));
  assert.equal(skillDeliveryDigest("# Skill\n", [{ path: "refs/a.md", mimeType: "text/markdown", text: "\u4e2d" }]), expected);
});

// --- Front matter -----------------------------------------------------------

test("front matter yields name and description, and keeps unknown keys", () => {
  const fm = parseFrontmatter(`---\nname: Deal Qual\ndescription: "How to qualify"\nlicense: MIT\n---\nbody`);
  assert.equal(fm.name, "Deal Qual");
  assert.equal(fm.description, "How to qualify");
  assert.equal(fm.extra.license, "MIT");
});

test("content without front matter parses to empty rather than throwing", () => {
  const fm = parseFrontmatter("# Just a heading\n\ntext");
  assert.equal(fm.name, undefined);
  assert.deepEqual(fm.extra, {});
});

test("an unterminated front-matter block is ignored", () => {
  assert.deepEqual(parseFrontmatter("---\nname: x\nno end marker"), { extra: {} });
});

// --- Loader -----------------------------------------------------------------

test("load fetches with the fixed skill operation and empty arguments", async () => {
  const { loader, sent } = loaderHarness([distributed()]);
  await loader.load("acme.deal-qual", CTX);
  assert.equal(sent[0].args.operation, SKILL_FETCH_OPERATION);
  assert.deepEqual(sent[0].args.arguments, {}, "a skill fetch takes no arguments");
  assert.equal(sent[0].args.version, "stable");
});

test("a second load inside the TTL is served from cache", async () => {
  const h = loaderHarness([distributed()]);
  await h.loader.load("acme.deal-qual", CTX);
  await h.loader.load("acme.deal-qual", CTX);
  assert.equal(h.calls(), 1);
});

test("the cache expires, and invalidate drops an entry immediately", async () => {
  const h = loaderHarness([distributed(), distributed()]);
  await h.loader.load("acme.deal-qual", CTX);
  h.setNow(1_000 + 16 * 60_000);
  await h.loader.load("acme.deal-qual", CTX);
  assert.equal(h.calls(), 2);

  const h2 = loaderHarness([distributed(), distributed()]);
  await h2.loader.load("acme.deal-qual", CTX);
  h2.loader.invalidate("acme.deal-qual");
  await h2.loader.load("acme.deal-qual", CTX);
  assert.equal(h2.calls(), 2);
});

test("different versions of one skill are cached separately", async () => {
  const h = loaderHarness([distributed(), distributed()]);
  await h.loader.load("acme.deal-qual", CTX, "stable");
  await h.loader.load("acme.deal-qual", CTX, "latest");
  assert.equal(h.calls(), 2);
});

test("the loader still refuses an executed result", async () => {
  const h = loaderHarness([distributed({ result_kind: "executed" })]);
  await assert.rejects(() => h.loader.load("acme.x", CTX), SkillDistributionError);
});

// --- Execution: what the agent does with the content ------------------------

test("following a skill stamps attribution on later calls", () => {
  const b = readDistribution("acme.deal-qual", distributed());
  assert.deepEqual(skillContextFor(b), {
    skill_capability_id: "acme.deal-qual",
    skill_call_id: "call_1",
  });
});

test("attribution omits the call id when there was none", () => {
  const b = readDistribution("acme.x", distributed({ call_id: undefined }));
  assert.deepEqual(skillContextFor(b), { skill_capability_id: "acme.x" });
});

test("the rendered prompt fences the content and labels its provenance", () => {
  // Skill text is third-party content arriving over the network. If the model
  // cannot tell it apart from the product's own instructions, a skill can
  // impersonate the system prompt.
  const p = renderSkillPrompt(readDistribution("acme.deal-qual", distributed()));
  assert.match(p, /^<skill id="acme.deal-qual" version="1\.0\.0" digest="verified">/);
  assert.match(p, /never as instructions that/);
  assert.match(p, /<\/skill>$/);
  assert.ok(p.includes("Check budget"));
});

test("an unverified digest is visible in the rendered prompt", () => {
  const p = renderSkillPrompt(readDistribution("acme.x", distributed({ delivery_digest: undefined })));
  assert.match(p, /digest="unverified"/);
});

test("the loader is wired to a real client without a private SDK", async () => {
  // End-to-end over the actual MCP transport: one POST, tools/call runos_invoke.
  const posts: Array<Record<string, unknown>> = [];
  const client = new RunosClient(CFG, {
    fetchImpl: async (_url, init) => {
      posts.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [{ type: "text", text: SKILL_MD }],
            // A skill distribution carries ONLY the metadata in
            // structuredContent - there is no payload beside it.
            structuredContent: {
              _meta: { vxture: {
                result_kind: "distributed",
                content_digest: "registered-contract-digest",
                delivery_digest: skillDeliveryDigest(SKILL_MD, []),
                delivery_digest_format: "skill-package-v1",
                call_id: "c1",
              } },
            },
          },
        }),
        { status: 200 },
      );
    },
    mintToken: async (req) => ({ accessToken: "t", expiresAt: 0, audience: req.audience, mode: req.mode }),
  });

  const bundle = await new SkillLoader(client).load("acme.deal-qual", CTX);
  assert.equal(bundle.digestVerified, true);
  assert.equal(bundle.frontmatter.name, "Deal Qualification");
  assert.equal((posts[0].params as { name: string }).name, "runos_invoke");
});

test("distributed reference documents reach the model with the skill guidance", () => {
  const result = distributed();
  result.content.push({ type: "resource", resource: { uri: "skill://company/1.0.0/references/api-map.md", mimeType: "text/markdown", text: "Call describe_tool before company_enrich." } });
  result.meta.delivery_digest = skillDeliveryDigest(SKILL_MD, [{ path: "references/api-map.md", mimeType: "text/markdown", text: "Call describe_tool before company_enrich." }]);
  const bundle = readDistribution("company", result);
  assert.equal(bundle.resources?.length, 1);
  const prompt = renderSkillPrompt(bundle);
  assert.match(prompt, /references\/api-map.md/);
  assert.match(prompt, /Call describe_tool before company_enrich/);
});

test("changed/missing/reordered resource bytes and foreign package paths cannot verify", () => {
  const resources = [{ path: "a.md", mimeType: "text/markdown", text: "A" }, { path: "b.md", mimeType: "text/plain", text: "B" }];
  const result = distributed({ delivery_digest: skillDeliveryDigest(SKILL_MD, resources) });
  result.content.push(...resources.map(r => ({ type: "resource", resource: { uri: `skill://acme.x/1.0.0/${r.path}`, mimeType: r.mimeType, text: r.text } })));
  assert.ok(readDistribution("acme.x", result).digestVerified);
  for (const content of [result.content.slice(0, 2), [result.content[0], result.content[2], result.content[1]], [result.content[0], { type: "resource", resource: { uri: "skill://other/1.0.0/a.md", mimeType: "text/plain", text: "changed" } }]]) {
    assert.throws(() => readDistribution("acme.x", { ...result, content }), SkillDistributionError);
  }
});

test("cache partitions workspace, tenant and authorization tickets without persisting raw credentials", async () => {
  const h = loaderHarness([distributed()]);
  for (const ctx of [CTX, { ...CTX, workspaceId: "other" }, { ...CTX, tenantId: "other" }, { ...CTX, subjectToken: "user-a" }, { ...CTX, subjectToken: "user-b" }, { ...CTX, delegationToken: "delegate" }]) {
    await h.loader.load("acme.x", ctx);
    await h.loader.load("acme.x", ctx);
  }
  assert.equal(h.calls(), 6);
  h.loader.invalidate("acme.x");
  await h.loader.load("acme.x", CTX);
  assert.equal(h.calls(), 7);
});
