# Operator first-pool gate checklist — 2026-07-02

## Slice

The deployment template and factory docs now require a permissioned first-pool
launch gate, but the operator tx checklist stopped after rendering the final
config. That left the highest-risk human handoff implicit: when to remove
`permissioned=true` and what evidence should exist first.

## Change

- Added a first-pool launch gate section to `deployment/operator-tx-checklist.md`.
- Documented the minimum pre-open smoke checks: factory pair lookup,
  `provide_liquidity` with non-zero balances, and a tiny round-trip swap through
  the pair/router path.
- Added the narrow `update_pair_config` JSON shape that opens only the existing
  `xyk` config by setting `permissioned=false` with the same code ID and fees.
- Extended `scripts/check_juno_v1_operator_checklist.py` so CI fails if the
  operator checklist loses the first-pool gate text or the saved opening tx path.

## Verification

Run:

```bash
python3 scripts/check_juno_v1_operator_checklist.py
python3 scripts/check_juno_v1_deployment_template.py
python3 scripts/check_juno_v1_deployment_command.py
python3 scripts/check_juno_v1_factory_docs.py
git diff --check -- deployment/operator-tx-checklist.md scripts/check_juno_v1_operator_checklist.py planning/00-overview.md planning/40-operator-first-pool-gate-2026-07-02.md
```

Expected result: all commands pass with no diff whitespace errors.
