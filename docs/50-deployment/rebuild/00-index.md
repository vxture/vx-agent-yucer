# rebuild - Rebuild and branch-protection artifacts

Artifacts used to bring this repo to org standard and to protect `main`.

| File | Purpose |
|------|---------|
| `main-ruleset.json` | the branch-protection ruleset, copied verbatim from the platform standard. Applied via `gh api repos/vxture/<repo>/rulesets`. Requires the five status checks `quality-gate` / `build` / `test-coverage` / `audit` / `gitleaks`; requires PR (0 approvals), blocks deletion and non-fast-forward, requires linear history, squash-only. Single-owner repos keep `required_approving_review_count=0`. |

Bootstrap order (empty repo): first-push `main` and let CI produce the required
checks once, THEN apply the ruleset - see `../20-github-bootstrap-checklist.md`.
