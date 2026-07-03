# First-pool query evidence capture — 2026-07-03

## Goal

Make the permissioned first-pool launch gate auditable from local files before
operators open public XYK pair creation.

## Change

Updated `scripts/build_juno_v1_first_pool_smoke_commands.py` so the generated
`junod` smoke sequence redirects every non-broadcast verification query to an
ignored evidence file under `deployment/tx/<chain>/`:

- `first-pool-smoke-pair-lookup.json` — factory pair discovery for the two
  rendered first-pool denoms.
- `first-pool-smoke-pool-after-provide.json` — pool state after initial
  liquidity is seeded.
- `first-pool-smoke-pair-simulation.json` — direct pair swap simulation.
- `first-pool-smoke-router-simulation.json` — router single-hop swap simulation.
- `first-pool-smoke-pool-after-swaps.json` — final pool state after direct and
  router tiny swaps.

The existing tx evidence files remain unchanged:
`first-pool-smoke-create-pair.json`,
`first-pool-smoke-provide-liquidity.json`,
`first-pool-smoke-tiny-swap.json`, and
`first-pool-smoke-router-tiny-swap.json`.

## Guardrails

- The helper still refuses non-XYK, non-native, duplicate-denom, or
  `permissioned=false` first-pool configs.
- The helper emits commands only; it never broadcasts transactions.
- Operator docs now name the query evidence files alongside tx broadcast files,
  so the open-XYK step is blocked on reviewed pair lookup, liquidity, direct
  swap, and router swap evidence.

## Verification

Run:

```sh
python3 scripts/check_juno_v1_first_pool_smoke_commands.py
python3 scripts/check_juno_v1_operator_checklist.py
python3 scripts/check_juno_v1_deployment_readme.py
python3 scripts/check_juno_v1_ci_wiring.py
git diff --check
```

Expected result: all commands pass, and the smoke helper guard confirms the new
query evidence paths are present in generated commands and operator docs.
