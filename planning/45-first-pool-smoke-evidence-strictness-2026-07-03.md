# First-pool smoke evidence strictness

Date: 2026-07-03

## Context

The first-pool smoke evidence validator already checked that the operator saved the
expected four tx responses and five query/simulation JSON files before opening
public XYK pair creation. A copied or reused JSON file could still satisfy the
shape checks if tx hashes were duplicated or if the post-swap pool query was a
copy of the post-provide pool query.

## Change

Tightened `scripts/validate_juno_v1_first_pool_smoke_evidence.py` so it now also
requires:

- all four broadcast evidence files (`create-pair`, `provide-liquidity`, direct
  tiny swap, router tiny swap) to contain distinct tx hashes; and
- `first-pool-smoke-pool-after-swaps.json` to differ from
  `first-pool-smoke-pool-after-provide.json`, proving the final pool query was
  captured after swap execution instead of copied from the earlier liquidity
  check.

The fixture guard now covers both failure modes and reports:

```text
first_pool_smoke_evidence_validator=true tx_files=4 query_files=5 failure_cases=6 txhash_uniqueness=true post_swap_pool_delta=true
```

## Verification

Ran the focused smoke evidence guard plus launch guard regression set:

```sh
python3 scripts/check_juno_v1_first_pool_smoke_evidence.py
python3 scripts/check_juno_v1_ci_wiring.py
python3 scripts/check_juno_v1_deployment_readme.py
python3 scripts/check_juno_v1_operator_checklist.py
python3 scripts/check_juno_v1_first_pool_smoke_commands.py
python3 scripts/check_juno_v1_deployment_template.py
python3 scripts/check_juno_v1_scope.py
python3 scripts/check_juno_v1_schemas.py
git diff --check
```

## Next bounded slice

Run the smoke helper plus evidence validator against the first real rendered
uni-7 config and saved tx/query JSON once upload/instantiate outputs exist.
