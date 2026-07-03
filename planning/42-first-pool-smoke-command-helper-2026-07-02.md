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
4. querying `pool`,
5. simulating and broadcasting one tiny native swap, and
6. re-querying `pool` before the post-smoke `update_pair_config` open step.

Added `scripts/check_juno_v1_first_pool_smoke_commands.py` and wired it into the
pre-Rust CI launch guards plus the CI wiring self-check.

## Guardrails

- Requires factory instantiate config to stay `permissioned=true` during smoke.
- Requires `pair_create_msg_template` to stay XYK-only with exactly two native
  assets and no init params.
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
