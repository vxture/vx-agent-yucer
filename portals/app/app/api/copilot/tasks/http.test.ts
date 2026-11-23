import assert from "node:assert/strict";
import { test } from "node:test";
import { privateRequest } from "./http";

const PUBLIC = "https://yucer.vxture.com";
function configured(
  values: Record<string, string | undefined>,
  run: () => void,
) {
  const saved = { ...process.env };
  try {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.OIDC_REDIRECT_URI;
    process.env.DEPLOY_STAGE = "dev";
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const key of ["NEXT_PUBLIC_APP_URL", "OIDC_REDIRECT_URI", "DEPLOY_STAGE"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}
function mutation(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://yucer-app:4060/api/copilot/${path}`, {
    method: "POST",
    headers: { origin: PUBLIC, "sec-fetch-site": "same-origin", ...headers },
    body: "{}",
  });
}

test("TLS-proxied private mutations use the registered public origin across all Xiaoyu routes", () => {
  configured({ DEPLOY_STAGE: "production", OIDC_REDIRECT_URI: `${PUBLIC}/api/auth/oidc/callback` }, () => {
    for (const path of ["tasks", "tasks/task", "tasks/task/turn", "tasks/task/execution", "memory", "knowledge", "topics/topic"])
      assert.equal(privateRequest(mutation(path)), null, path);
    assert.equal(privateRequest(mutation("tasks", { "content-length": "40000" }))?.status, 413);
  });
});

test("a configured public URL takes precedence and normalizes its path and trailing slash", () => {
  configured({ DEPLOY_STAGE: "production", NEXT_PUBLIC_APP_URL: `${PUBLIC}/`, OIDC_REDIRECT_URI: "https://other.example/auth/callback" }, () => {
    assert.equal(privateRequest(mutation("tasks")), null);
    assert.equal(privateRequest(mutation("tasks", { origin: "https://other.example" }))?.status, 403);
  });
});

test("proxy handling rejects internal, sibling, downgraded and forged origins", () => {
  configured({ DEPLOY_STAGE: "production", NEXT_PUBLIC_APP_URL: PUBLIC }, () => {
    for (const origin of ["http://yucer-app:4060", "https://accounts.vxture.com", "http://yucer.vxture.com", `${PUBLIC}:444`, `${PUBLIC}.evil.example`, "null", `${PUBLIC}/path`])
      assert.equal(privateRequest(mutation("tasks", {
        origin,
        host: "evil.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      }))?.status, 403, origin);
    assert.equal(privateRequest(mutation("tasks", { "sec-fetch-site": "cross-site" }))?.status, 403);
    assert.equal(privateRequest(mutation("tasks", { "x-forwarded-host": "evil.example" })), null);
  });
});

test("missing or invalid deployed configuration cannot trust Request.url or forwarded headers", () => {
  for (const value of [undefined, "not-a-url", "file:///tmp/app", "https://user:password@yucer.vxture.com"])
    configured({ DEPLOY_STAGE: "production", NEXT_PUBLIC_APP_URL: value }, () => {
      assert.equal(privateRequest(new Request(`${PUBLIC}/api/copilot/tasks`, {
        method: "POST", headers: { origin: PUBLIC, "x-forwarded-host": "yucer.vxture.com", "x-forwarded-proto": "https" },
      }))?.status, 403);
    });
});

test("unconfigured local preview keeps direct same-origin requests and rejects foreign origins", () => {
  configured({}, () => {
    assert.equal(privateRequest(new Request("http://localhost:16414/api/copilot/tasks", {
      method: "POST", headers: { origin: "http://localhost:16414" },
    })), null);
    assert.equal(privateRequest(new Request("http://localhost:16414/api/copilot/tasks", {
      method: "POST", headers: { origin: PUBLIC },
    }))?.status, 403);
  });
});
