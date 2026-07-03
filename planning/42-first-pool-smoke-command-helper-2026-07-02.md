# First-pool smoke command helper — 2026-07-02

## Goal

Make the permissioned first-pool launch gate mechanical before operators open
public XYK pair creation.

## Change

Added `scripts/build_juno_v1_first_pool_smoke_commands.py`, a dependency-free
helper that reads a rendered `deployment/juno-v1-testnet.json` and emits guarded
`junod` snippets for:

1. creating only the official XYK first pool from `pair_create_msg_template`,
2. querying the factory `pair` endpoint and exporting the pair address,
3. seeding non-zero native liquidity and saving the provide-liquidity tx JSON,
4. querying `pool` and saving the post-provide evidence,
5. simulating and broadcasting one tiny native swap directly through the pair,
6. simulating and broadcasting the same single-hop native swap through the
   router, and
7. re-querying `pool` before the post-smoke `update_pair_config` open step.

Added `scripts/check_juno_v1_first_pool_smoke_commands.py` and wired it into the
pre-Rust CI launch guards plus the CI wiring self-check.

## Guardrails

- Requires factory instantiate config to stay `permissioned=true` during smoke.
- Requires `pair_create_msg_template` to stay XYK-only with exactly two native
  assets and no init params.
- Saves factory pair lookup, post-provide pool, pair simulation, router
  simulation, and post-swap pool query evidence beside the tx JSON under
  `deployment/tx/<chain>/first-pool-smoke-*.json`.
- Requires the rendered router address and emits router smoke evidence at
  `deployment/tx/<chain>/first-pool-smoke-router-tiny-swap.json`.
- Emits commands only; it never broadcasts transactions.
- Keeps generated tx JSON under ignored `deployment/tx/<chain>/` paths.

## Verification

Run:

```sh
python3 scripts/check_juno_v1_first_pool_smoke_commands.py
python3 scripts/check_juno_v1_ci_wiring.py
```

Expected result: the smoke helper prints create/seed/query/swap snippets from a
rendered fixture, rejects permissioned=false / non-XYK / non-native drift, and CI
wiring confirms the guard runs before Rust setup.
