# First-pool smoke evidence denom matching

Date: 2026-07-03

## Decision

The offline first-pool smoke evidence validator now checks both saved pool query
responses against the two native denoms in the rendered
`pair_create_msg_template`.

If an operator accidentally validates pool evidence from a stale or wrong pair,
the validator fails before public XYK pair creation can be opened.

## Why this reduces launch risk

The first-pool launch gate is only useful if the smoke evidence proves the exact
official first pool from the deployment config was created, seeded, and swapped
through. Tx hash uniqueness and height ordering prove sequence; denom matching
proves the pool-state evidence belongs to the intended pair assets.

## Scope guard

This is an offline validation hardening only. It does not add stable pools, LSTs,
perps, yield, new tokens, or any broader v1 product surface.

## Verification

Run:

```sh
python3 scripts/check_juno_v1_first_pool_smoke_evidence.py
```

Expected output includes:

```text
first_pool_smoke_evidence_validator=true tx_files=4 query_files=5 failure_cases=8 txhash_uniqueness=true tx_height_order=true denom_match=true post_swap_pool_delta=true
```
