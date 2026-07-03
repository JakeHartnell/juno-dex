# Astroport-Juno v1 operator tx checklist

Date: 2026-06-29T06:21:18Z

Purpose: make the uni-7 DeFi v1 deployment handoff boring. This checklist names the exact transaction JSON files an operator should save, the values each file must yield, and the single command that converts them into the deployment config fill command.

## Save these 16 tx JSON files

Run store/instantiate commands with `--output json`, then save the full tx response bodies under an ignored local directory such as `deployment/tx/uni-7/`. Do not paste mnemonics, keyring output, or private material into these files.

### Store txs → 9 code IDs

| File | Extracted config key |
| --- | --- |
| `deployment/tx/uni-7/store-astroport-factory.json` | `code_ids.astroport-factory` |
| `deployment/tx/uni-7/store-astroport-incentives.json` | `code_ids.astroport-incentives` |
| `deployment/tx/uni-7/store-astroport-native-coin-registry.json` | `code_ids.astroport-native-coin-registry` |
| `deployment/tx/uni-7/store-astroport-oracle.json` | `code_ids.astroport-oracle` |
| `deployment/tx/uni-7/store-astroport-pair.json` | `code_ids.astroport-pair` |
| `deployment/tx/uni-7/store-astroport-router.json` | `code_ids.astroport-router` |
| `deployment/tx/uni-7/store-astroport-tokenfactory-tracker.json` | `code_ids.astroport-tokenfactory-tracker` |
| `deployment/tx/uni-7/store-astroport-whitelist.json` | `code_ids.astroport-whitelist` |
| `deployment/tx/uni-7/store-cw20-base.json` | `code_ids.cw20-base` |

### Instantiate txs → 7 contract addresses

| File | Extracted config key |
| --- | --- |
| `deployment/tx/uni-7/instantiate-astroport-factory.json` | `addresses.astroport-factory` |
| `deployment/tx/uni-7/instantiate-astroport-incentives.json` | `addresses.astroport-incentives` |
| `deployment/tx/uni-7/instantiate-astroport-native-coin-registry.json` | `addresses.astroport-native-coin-registry` |
| `deployment/tx/uni-7/instantiate-astroport-oracle.json` | `addresses.astroport-oracle` |
| `deployment/tx/uni-7/instantiate-astroport-router.json` | `addresses.astroport-router` |
| `deployment/tx/uni-7/instantiate-astroport-tokenfactory-tracker.json` | `addresses.astroport-tokenfactory-tracker` |
| `deployment/tx/uni-7/instantiate-astroport-whitelist.json` | `addresses.astroport-whitelist` |

## Manual values to decide before rendering

Set these as environment variables from the actual deployment plan:

```sh
export JUNO_OWNER='juno...'
export JUNO_GUARDIAN='juno...'
export JUNO_TREASURY='juno...'
export JUNO_TOKENFACTORY_MODULE='juno...'
export FIRST_COUNTERPARTY_DENOM='ibc/...'
```

Keep v1 narrow: XYK pools, swaps, liquidity, native-denom incentives plumbing. No stable pools, LSTs, perps, yield theater, or new token scope.

## Build `tx-sets.txt`

```sh
mkdir -p deployment/tx/uni-7
python3 scripts/extract_juno_v1_tx_sets.py \
  --code-id astroport-factory=deployment/tx/uni-7/store-astroport-factory.json \
  --code-id astroport-incentives=deployment/tx/uni-7/store-astroport-incentives.json \
  --code-id astroport-native-coin-registry=deployment/tx/uni-7/store-astroport-native-coin-registry.json \
  --code-id astroport-oracle=deployment/tx/uni-7/store-astroport-oracle.json \
  --code-id astroport-pair=deployment/tx/uni-7/store-astroport-pair.json \
  --code-id astroport-router=deployment/tx/uni-7/store-astroport-router.json \
  --code-id astroport-tokenfactory-tracker=deployment/tx/uni-7/store-astroport-tokenfactory-tracker.json \
  --code-id astroport-whitelist=deployment/tx/uni-7/store-astroport-whitelist.json \
  --code-id cw20-base=deployment/tx/uni-7/store-cw20-base.json \
  --address astroport-factory=deployment/tx/uni-7/instantiate-astroport-factory.json \
  --address astroport-incentives=deployment/tx/uni-7/instantiate-astroport-incentives.json \
  --address astroport-native-coin-registry=deployment/tx/uni-7/instantiate-astroport-native-coin-registry.json \
  --address astroport-oracle=deployment/tx/uni-7/instantiate-astroport-oracle.json \
  --address astroport-router=deployment/tx/uni-7/instantiate-astroport-router.json \
  --address astroport-tokenfactory-tracker=deployment/tx/uni-7/instantiate-astroport-tokenfactory-tracker.json \
  --address astroport-whitelist=deployment/tx/uni-7/instantiate-astroport-whitelist.json \
  > deployment/tx/uni-7/tx-sets.txt
```

Quick sanity check before rendering:

```sh
wc -l deployment/tx/uni-7/tx-sets.txt
python3 scripts/extract_juno_v1_tx_sets.py --scan deployment/tx/uni-7/*.json
```

Expected: `tx-sets.txt` has 16 non-empty `--set ...` lines, each mapped file scans to exactly one relevant code ID or address, and no unrelated contract addresses leak into a mapped tx file.

## Render and validate final config

```sh
python3 scripts/build_juno_v1_deployment_command.py \
  --tx-sets deployment/tx/uni-7/tx-sets.txt \
  --owner "$JUNO_OWNER" \
  --guardian "$JUNO_GUARDIAN" \
  --treasury "$JUNO_TREASURY" \
  --tokenfactory-module "$JUNO_TOKENFACTORY_MODULE" \
  --counterparty-denom "$FIRST_COUNTERPARTY_DENOM" \
  --output deployment/juno-v1-testnet.json \
  --render
```

The final green line should include:

```text
OK: Juno v1 deployment template matches instantiate schema requirements
instantiate_msgs=7 code_ids=9 addresses=7 pair_type=xyk
```

## First-pool launch gate txs

Before opening public pair creation, keep the factory `xyk` pair config
`permissioned=true`. The owner should create only the official first pool from
`pair_create_msg_template`, seed initial liquidity, then smoke-check:

- `query_pair`/factory pair lookup returns the expected pair address for the two
  native denoms.
- `provide_liquidity` succeeds and pool balances are non-zero.
- A tiny direct pair swap and a tiny router swap both succeed with expected
  slippage bounds.

Generate the guarded create/seed/query/swap command sequence from the rendered
config so the first-pool denoms, factory/router addresses, and chain ID cannot
drift:

```sh
python3 scripts/build_juno_v1_first_pool_smoke_commands.py \
  --config deployment/juno-v1-testnet.json \
  --from "$JUNO_OWNER" \
  --pair-address '$PAIR_ADDR' \
  --fees 7500ujunox
```

Save the generated broadcast responses under
`deployment/tx/uni-7/first-pool-smoke-create-pair.json`,
`deployment/tx/uni-7/first-pool-smoke-provide-liquidity.json`,
`deployment/tx/uni-7/first-pool-smoke-tiny-swap.json`, and
`deployment/tx/uni-7/first-pool-smoke-router-tiny-swap.json`. Also save the
query/simulation evidence the helper redirects to
`deployment/tx/uni-7/first-pool-smoke-pair-lookup.json`,
`deployment/tx/uni-7/first-pool-smoke-pool-after-provide.json`,
`deployment/tx/uni-7/first-pool-smoke-pair-simulation.json`,
`deployment/tx/uni-7/first-pool-smoke-router-simulation.json`, and
`deployment/tx/uni-7/first-pool-smoke-pool-after-swaps.json`.

Do not run the open-XYK helper until these pass.

Only after those checks pass, broadcast `update_pair_config` with the same pair
code ID and fees to set `permissioned=false`. Generate the message and
copy/paste-safe `junod tx wasm execute` command from the rendered config so the
factory address, chain ID, and pair code ID cannot drift:

```sh
python3 scripts/build_juno_v1_open_pair_config_tx.py \
  --config deployment/juno-v1-testnet.json \
  --from "$JUNO_OWNER" \
  --fees 7500ujunox
```

The generated execute message should match this shape (with `code_id` taken from
`code_ids.astroport-pair` in the rendered config):

```json
{
  "update_pair_config": {
    "config": {
      "code_id": 123,
      "pair_type": { "xyk": {} },
      "total_fee_bps": 30,
      "maker_fee_bps": 0,
      "is_disabled": false,
      "is_generator_disabled": false,
      "permissioned": false,
      "whitelist": null
    }
  }
}
```

Save the opening tx JSON beside the other handoff files as
`deployment/tx/uni-7/update-pair-config-open-xyk.json`. Do not open stable,
custom, PCL, LST, perps, yield, or new-token surfaces while removing this gate.

## If extraction fails

- `missing tx JSON`: save the full `junod` tx response body at the expected path.
- `no code_id found` or `no contract address found`: run `--scan` against the file and confirm it is the final committed tx response, not an unsigned tx or broadcast stub.
- `multiple code_id` or `multiple contract addresses`: split the operation into one tx JSON per config key, or inspect manually before mapping.
- `tx sets missing required deployment values`: compare `deployment/tx/uni-7/tx-sets.txt` against the 16-row list above.

Forward. The DEX v1 handoff should be mechanical, not mystical.
