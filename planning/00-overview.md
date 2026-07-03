# Astroport-Juno fork — overview

This `planning/` folder is the canonical record of the work to take
`astroport-fi/astroport-core@v5.13.1` and ship it as the contract layer of a
sovereign Juno DEX. Each document is either a decision-of-record (ADR) or a
runbook.

## What this fork is

Astroport core, stripped down to the contract subset Juno needs, with the
smallest possible patch surface so we can inherit the upstream audit corpus
rather than re-audit from scratch.

Out of scope here: the UI, the strategic rationale, the cost model — those
live in the meta-repo's `memory/` folder (`memory/astroport-juno-deployment-plan.md`,
`memory/juno-defi-direction.md`, `memory/abc-graduation-architecture-astroport.md`).
This folder is contracts-only.

## Status at a glance

| Phase | State |
|---|---|
| P0 — Strip-and-green | ✅ Complete (tagged `v0.1.0-juno-rc0` @ `4f7e63a9`) |
| P1 — CI port | ✅ Complete (folded into rc0 commit `e32053da`) |
| P2 — Patches (`pool_unpause_at`, types shim) | ✅ Complete (tagged `v0.1.1-juno-rc1` @ `84446eda`) |
| P3 — Integration tests | ✅ Complete (5 commits @ `0e225a15..87c256ec`; 4 new tests in `integration-tests/`) |
| P2.5 — Incentives re-add + Juno strip | ✅ Complete (tagged `v0.1.2-juno-rc2` @ `15233816`; 6 commits; 4 new integration tests incl. cw20-reward AUDIT GATE; ADR D6) |
| P2.5.9 — DAO DAO gauge adapter (dao-contracts side) | Pending — separate workstream on `feat/gauges` branch |
| P4 — AI audit (3 diffs: A mechanical / B pool_unpause_at / C incentives) | ✅ Complete (audit-of-record `v0.1.4-juno-rc4` @ `d218c1af`). Three-pass convergence 2026-06-22: Run 1 (rc2) 16 findings → Run 2 (rc3) 12 → Run 3 (rc4) 5; ≥-medium count 12 → 1 → 0. All Run 2 items closed; only 1 LOW + 4 INFO remain (polish, non-blocking). See `memory/astroport-juno-ai-audit-findings.md` + `planning/07-audit-scope.md`. |
| P5 — Deploy infra | 🟢 Unblocked (P4 audit-of-record) |
| P6 — uni-7 bakeoff | Pending |
| P7 — juno-1 mainnet | Pending (DAO gate) |

## The two tags

- **`v0.1.0-juno-rc0`** — strip + Neutron-strip + CI ports. Zero functional
  change to kept contracts. Audit diff A target.
- **`v0.1.1-juno-rc1`** — `pool_unpause_at` patch + `astroport-juno-types`
  MIT shim crate. Audit diff B target.
- **`v0.1.2-juno-rc2`** *(planned, P2.5)* — re-introduce stripped
  `astroport-incentives` from upstream `v5.13.1` + extend MIT shim with
  incentives wire types. Audit diff C target. See `11-incentives-and-gauges.md`.

Three diffs to the AI audit; one mechanical (A), two functional (B, C). See
`07-audit-scope.md`.

## Operating posture (settled 2026-05-13)

- **Audit:** AI audit, not a paid-firm engagement. The two-diff packaging
  still applies — LLM review is cheaper but benefits from the same surface
  segregation (mechanical strip vs functional patch). Upstream Astroport
  audit PDFs are still useful priors but not on the critical path.
- **First-pool launch gate:** v1 starts with the factory `xyk` pair config
  `permissioned: true` so operators can create, seed, and smoke-check the
  official first pool before public pair creation opens. After the first pool
  is registered and liquidity/swap checks pass, owner/governance executes
  `update_pair_config` with the same code ID/fees and `permissioned: false`.
  No stable/PCL/custom pair types are in v1 scope.
- **Working location:** local only. Trunk lives in
  `/workspace/astroport-core` on branch `juno/main`. No remote push until
  fork-home identity is settled (`memory/juno-ai-github-identity.md`).
- **DEX-ecosystem coordination:** none required. JunoClaw / Junoswap v2
  coordination explicitly out of scope. Astroport-Juno is sovereign.

## Document index

| File | Purpose |
|---|---|
| `00-overview.md` | This file. |
| `01-strip-list.md` | Canonical table of deleted / deferred / kept contracts. |
| `02-juno-patches.md` | (P2) Line-by-line spec for the functional patches. |
| `03-whitelist-decision.md` | ADR D2 — why we Neutron-strip the whitelist instead of replacing with stock cw1. |
| `04-incentives-types-decision.md` | ADR D1 — why `packages/astroport/src/incentives.rs` stays as types-only. |
| `05-toolchain-and-ci.md` | Rust pin, optimizer image, cw-multi-test fork policy, capability flags. |
| `06-deploy-runbook.md` | (P5) uni-7 → juno-1 sequence. |
| `07-audit-scope.md` | (P4) Two-diff handoff + upstream audit-corpus inventory. |
| `08-test-matrix.md` | (P3) Gates per phase. |
| `09-roadmap-v1.1-v1.2.md` | Stable pair re-add, PCL re-add, post-v1 surfaces. |
| `10-open-questions.md` | Running list. |
| `11-incentives-and-gauges.md` | (P2.5) Re-introduce `astroport-incentives`; bind to DAO DAO gauge for community-voted emissions; permissionless external incentives. |
| `12-incentives-strip-decisions.md` | (P2.5) ADR D6 — per-decision rationale for the rc1→rc2 strip (vesting, cw20 axes, naming, MAX_REWARD_TOKENS, generator_controller, bech32 test mode). |
| `13-scope-guard-verification-2026-06-28.md` | Scope guard verification notes for the Juno v1 contract set. |
| `14-schema-scope-guard-2026-06-28.md` | Schema pruning and schema-set guard notes. |
| `15-juno-v1-guard-readiness-2026-06-29.md` | Readiness check notes for the Juno v1 guards. |
| `16-ci-artifact-guard-2026-06-29.md` | CI artifact-set guard notes for optimized wasm output. |
| `17-frontend-schema-surface-2026-06-29.md` | Frontend integration map generated from committed v1 JSON schemas. |
| `18-deployment-template-guard-2026-06-29.md` | Testnet deployment config template and schema-derived guard. |
| `19-ci-deployment-template-guard-2026-06-29.md` | CI wiring for the deployment template guard. |
| `20-ci-wiring-guard-2026-06-29.md` | Dependency-free guard that verifies the Juno v1 CI guard ordering. |
| `21-deployment-fill-script-2026-06-29.md` | Renderer for turning the uni-7 deployment template into a concrete config once code IDs/addresses are known. |
| `22-deployment-readme-2026-06-29.md` | Operator/frontend handoff README for filling and validating uni-7 deployment config values. |
| `23-tx-json-extraction-helper-2026-06-29.md` | Helper for extracting deployment `--set` values from `junod -o json` store/instantiate tx responses. |
| `24-tx-extractor-fixture-guard-2026-06-29.md` | CI fixture guard for the tx JSON extraction helper and launch-guard ordering. |
| `25-deployment-command-bundle-2026-06-29.md` | Final deployment command bundler that combines tx-derived values with manual operator values and validates rendered config. |
| `26-operator-tx-checklist-guard-2026-06-29.md` | Operator tx filename checklist plus CI guard for the uni-7 deployment handoff. |
| `27-dry-run-tx-fixtures-2026-06-29.md` | Dry-run tx fixture generator and rehearsal guard for the uni-7 handoff. |
| `28-dry-run-ci-wiring-2026-06-29.md` | CI wiring for the dry-run tx rehearsal guard. |
| `29-deployment-gitignore-guard-2026-06-29.md` | Gitignore guard that keeps local tx JSON and rendered deployment configs out of commits. |
| `30-frontend-config-guard-2026-06-29.md` | Frontend handoff guard that verifies rendered config address wiring and first XYK pair template without chain access. |
| `31-dry-run-frontend-validation-2026-06-29.md` | Dry-run deployment rehearsal now validates the temp rendered config with both deployment and frontend guards. |
| `32-frontend-types-handoff-2026-06-29.md` | Generated TypeScript frontend handoff type and CI guard tied to the deployment template. |
| `33-frontend-example-guard-2026-06-29.md` | TypeScript frontend consumer example plus CI guard for the generated handoff type. |
| `34-frontend-readme-consumption-2026-06-29.md` | Frontend README snippet showing how to import rendered JSON with the generated handoff type. |
| `35-deployment-readme-guard-2026-06-29.md` | Deployment README guard that keeps operator/frontend handoff docs aligned with helper scripts. |
| `36-frontend-handoff-sync-guard-2026-06-29.md` | Frontend address key sync guard across template, TypeScript, example, README, and CI. |
| `37-frontend-release-checklist-guard-2026-06-29.md` | Frontend release checklist and guard for copying rendered deployment files into the UI repo. |
| `38-frontend-release-bundle-ci-2026-07-02.md` | Frontend release bundle helper wired into CI with ignored zip output guardrails. |
| `39-factory-docs-launch-gate-2026-07-02.md` | Factory/operator docs guard for the permissioned first-pool launch gate and XYK-only v1 scope. |
| `40-operator-first-pool-gate-2026-07-02.md` | Operator tx checklist update that makes first-pool smoke checks and permissioned gate removal explicit. |
| `41-open-pair-config-tx-helper-2026-07-02.md` | Generated `junod tx wasm execute` helper for the post-smoke `update_pair_config` open-XYK step. |
| `42-first-pool-smoke-command-helper-2026-07-02.md` | Generated permissioned first-pool create/seed/query/tiny-swap command helper and CI guard. |
| `43-first-pool-query-evidence-2026-07-03.md` | First-pool smoke helper now saves pair lookup, pool, and simulation query evidence before opening public XYK creation. |
| `44-first-pool-smoke-evidence-validator-2026-07-03.md` | Offline validator for saved first-pool smoke tx/query evidence before opening public XYK creation. |
| `45-first-pool-smoke-evidence-strictness-2026-07-03.md` | Validator strictness for distinct first-pool smoke tx hashes and post-swap pool-query delta. |
| `46-first-pool-smoke-evidence-order-2026-07-03.md` | Validator strictness for tx-height launch ordering across first-pool smoke broadcasts. |
| `47-first-pool-smoke-denom-match-2026-07-03.md` | Validator strictness that ties saved first-pool pool-query evidence to the rendered first-pool denoms. |

Files marked "(P*)" are stubs until that phase begins.

## Branch + tag conventions

- Trunk: `juno/main`, branched from upstream `v5.13.1` tag.
- Linear history. Semantic-conventional commit messages.
- Local-only until fork-home GitHub identity resolves
  (`memory/juno-ai-github-identity.md`).
