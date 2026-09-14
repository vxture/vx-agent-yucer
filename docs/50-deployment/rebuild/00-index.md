# rebuild - Rebuild and branch-protection artifacts

Artifacts used to bring this repo to org standard and to protect `main`.

| File | Purpose |
|------|---------|
| `main-ruleset.json` | the branch-protection ruleset, copied verbatim from the platform standard. Applied via `gh api repos/vxture/<repo>/rulesets`. Requires the six status checks `quality-gate` / `build` / `test-coverage` / `audit` / `gitleaks` / `db-contract` (the sixth added 2026-09-01: it is the only check that proves anything about the database rather than about TypeScript); requires PR (0 approvals), blocks deletion and non-fast-forward, requires linear history, squash-only. Single-owner repos keep `required_approving_review_count=0`. |
| `production-environment.json` | the `production` GitHub Environment: reviewer = the owner (`stonesmoker`, id 163819449), self-review allowed (one-person repo), no wait timer, deployment branch policy `main` (branch) + `v*.*.*` (tag), admins cannot bypass. Apply: `jq .environment production-environment.json \| gh api -X PUT repos/vxture/vx-agent-yucer/environments/production --input -`, then one `gh api -X POST .../environments/production/deployment-branch-policies --input -` per entry of `.deployment_branch_policies`; `can_admins_bypass` is a page setting if the PUT ignores it. Approval itself is the owner's click - `../30-deploy-review-runbook.md`. |

Bootstrap order (empty repo): first-push `main` and let CI produce the required
checks once, THEN apply the ruleset - see `../20-github-bootstrap-checklist.md`.
