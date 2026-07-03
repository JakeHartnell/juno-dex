# First-pool smoke evidence validator

Date: 2026-07-03

## Decision

Add an offline validator for the saved first-pool smoke JSON evidence before the
operator opens public XYK pair creation.

The existing smoke command helper prints the right `junod` commands and redirects
evidence to `deployment/tx/<chain>/first-pool-smoke-*.json`. This slice closes the
handoff loop by checking those saved files locally before `update_pair_config`
sets `permissioned=false`.

## Scope

The validator checks only the v1 first-pool launch gate:

- four broadcast tx responses exist and have successful code / tx hashes:
  - create pair
  - provide liquidity
  - direct tiny swap
  - router tiny swap
- five query/simulation evidence files exist:
  - factory pair lookup with a Juno pair address
  - pool after provide with two positive native asset balances
  - pair simulation with positive return amount
  - router simulation with positive return amount
  - pool after swaps with two positive native asset balances
- optional rendered config still has exactly one factory pair config and it is
  `permissioned=true` / XYK-only while the evidence is being reviewed.

Non-goals: no chain queries, no tx broadcast, no frontend changes, and no new
DEX token/stable/LST/perps/yield scope.

## Operator command

```sh
python3 scripts/validate_juno_v1_first_pool_smoke_evidence.py \
  --dir deployment/tx/uni-7 \
  --config deployment/juno-v1-testnet.json \
  --pair-address "$PAIR_ADDR"
```

Expected success line:

```text
first_pool_smoke_evidence=true tx_files=4 query_files=5
```

## Verification

`python3 scripts/check_juno_v1_first_pool_smoke_evidence.py` exercises complete
fixtures and failure cases for failed tx code, zero liquidity, pair-address
mismatch, and an already-open/non-permissioned factory config.
