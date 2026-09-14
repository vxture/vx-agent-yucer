# 50-deployment - Infra, CI/CD, environments, bootstrap

Deployment and bootstrap material for this repo.

| File / dir | Purpose |
|------------|---------|
| `10-platform-registration-checklist.md` | platform-side registration actions (owner / platform line) when instantiating a product repo |
| `20-github-bootstrap-checklist.md` | one-time GitHub bootstrap: create public repo, enable scanning, first-push main, run CI once, apply the ruleset (in that order) |
| `30-deploy-review-runbook.md` | production 部署审批：谁审、在哪点、批前按工作流核对什么、Environment 配置；agent 不代批 |
| `rebuild/` | rebuild artifacts; holds `main-ruleset.json` (the branch-protection ruleset) and `production-environment.json` (the production Environment: reviewer, branch policy) |

The tag-to-env CD pipeline (deploy/build/rollback/db-init workflows and the
`tailnet-ssh-connect` composite action) is batch E and is not present in the
governance-shell batch.
