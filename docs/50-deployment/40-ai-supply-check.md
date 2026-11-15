# AI supply inspection

Tracking: [yucer #645](https://github.com/vxture/vx-agent-yucer/issues/645),
[Runos #130](https://github.com/vxture-foundation/vxture-runos/issues/130).

`ai-supply-check.yml` uses yucer's existing worker02 connection and the
`production` Environment approval. It runs only on a pinned `main` commit.
It cannot accept an arbitrary command, SQL, path, entity name or payload.
It does not deploy, restart containers, change configuration, register supply,
mint tokens, invoke tools or modify data. The Python script streams to the
host over SSH; no file is installed on the host.

The report includes configuration-presence booleans, validated build identity,
registered Connector operation/input-field names, dependency IDs, endpoint
states, credential class/binding states, direct product grants, model routes
and the last 100 yucer call metadata records from the last seven days.
Model tool-support values are configuration overrides; null is not a statement
that a model lacks tools. Workspace/user grants and actual consumer discovery
still require verification with the real consumer identity.

It does not return environment values, credential ciphertext, endpoint URLs,
request arguments, prompt text, payload samples, customer data or raw errors.
All database queries run in read-only transactions with a ten-second statement
timeout. Missing permissions, containers or schema fields report unavailable
and fail the workflow; no automatic changes are attempted. Independent
sections still complete. Output limits are not proof of catalog completeness;
500 Connector versions and 1,500 product grants are the inspection limits.

Run after merge:

```sh
gh workflow run ai-supply-check.yml --ref main -f expected_sha=<main-sha>
```

The owner approves `production` on GitHub. The agent never approves on the
owner's behalf. Record the run URL and safe findings in the linked Issues.
Diagnostics do not satisfy the real internet research acceptance in Runos's
`docs/60-operations/20-research-supply-acceptance.md`.

Local verification:

```sh
python3 -m unittest discover -s scripts/qa -p 'test_ai_supply_check.py'
git diff --check
```

Local execution cannot reach worker02: this Mac has no host SSH key or Docker.
Nine safety checks exercise redaction, failure handling and the actual workflow
pin step, including rejection cases. All nine SQL statements were also executed
against both repositories' full current baseline DDL in an isolated local
PostgreSQL 18 database, with the authored MarkItDown contract as a fixture.
An attempted INSERT inside the diagnostic transaction was rejected as read-only;
the temporary database was removed. This verifies SQL and transaction behavior,
not production connectivity or real research. Production schema and actual
supply remain subject to the gated host run.
