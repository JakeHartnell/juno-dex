# Astroport-Juno v1 deployment handoff

This folder is the narrow handoff between contract upload/instantiate output and the frontend config for the uni-7 bakeoff.

## Files

- `juno-v1-testnet.template.json` — canonical placeholder template for the v1 surface.
- `juno-v1-testnet.json` — suggested rendered output path; do not commit real values until the DAO/stewards choose to publish them.
- `juno-v1-mainnet.json` — rendered mainnet output path; do not commit real values until the DAO/stewards choose to publish them.
- `juno-v1-readiness-plan.md` — operator deployment/readiness plan with instantiate order, no-broadcast dry-run commands, safety checks, rollback/freeze risks, and exact blockers.
- `MAINNET_DEPLOYMENT.md` — mainnet `juno-1` operator runbook for approvals, artifact checks, tx capture, config rendering, frontend handoff, smoke tests, and rollback/freeze actions.
- `frontend-release-checklist.md` — final copy/verification checklist for moving the rendered handoff into the UI repo.
- `juno-v1-frontend-release.zip` — optional generated UI handoff bundle; do not commit it because it contains rendered environment-specific config.

## Required values after upload / instantiate

Collect these from the real uni-7 transaction output before rendering:

### Accounts

- `accounts.owner` — DAO/steward admin for owned contracts.
- `accounts.guardian` — incentives guardian.
- `accounts.treasury` — fee destination and incentives vesting placeholder for v1 native rewards.
- `accounts.tokenfactory_module` — chain tokenfactory module address used by tracker/factory config.

### Code IDs

- `code_ids.astroport-factory`
- `code_ids.astroport-incentives`
- `code_ids.astroport-native-coin-registry`
- `code_ids.astroport-oracle`
- `code_ids.astroport-pair`
- `code_ids.astroport-router`
- `code_ids.astroport-tokenfactory-tracker`
- `code_ids.astroport-whitelist`
- `code_ids.cw20-base`

### Instantiated addresses

- `addresses.astroport-factory`
- `addresses.astroport-incentives`
- `addresses.astroport-native-coin-registry`
- `addresses.astroport-oracle`
- `addresses.astroport-router`
- `addresses.astroport-tokenfactory-tracker`
- `addresses.astroport-whitelist`

### First pool counterpart denom

- `pair_create_msg_template.asset_infos.1.native_token.denom` — real `ibc/...` denom for the non-`ujunox` side of the first test pool.

## Extract values from tx JSON

For the complete operator handoff, use [`operator-tx-checklist.md`](operator-tx-checklist.md). It names the 16 expected `junod -o json` tx files, builds `deployment/tx/uni-7/tx-sets.txt`, and feeds the deployment command builder.

To rehearse the full handoff without chain txs, generate harmless synthetic fixtures in an ignored directory:

```sh
python3 scripts/generate_juno_v1_dry_run_txs.py --output-dir deployment/tx/uni-7-dry-run
python3 scripts/check_juno_v1_dry_run_txs.py
```

For one-off inspection, use the extractor directly:

```sh
python3 scripts/extract_juno_v1_tx_sets.py \
  --code-id astroport-factory=store-factory.json \
  --address astroport-factory=instantiate-factory.json
```

Use `--scan tx.json` first when a tx response shape is unfamiliar; it prints discovered `code_id` and contract address values without mapping them.

## Render command shape

Set shell variables from real uni-7 outputs, then render and validate:

```sh
python3 scripts/fill_juno_v1_deployment_config.py \
  --output deployment/juno-v1-testnet.json \
  --require-complete \
  --set accounts.owner="$JUNO_OWNER" \
  --set accounts.guardian="$JUNO_GUARDIAN" \
  --set accounts.treasury="$JUNO_TREASURY" \
  --set accounts.tokenfactory_module="$JUNO_TOKENFACTORY_MODULE" \
  --set code_ids.astroport-factory="$CODE_ID_FACTORY" \
  --set code_ids.astroport-incentives="$CODE_ID_INCENTIVES" \
  --set code_ids.astroport-native-coin-registry="$CODE_ID_NATIVE_COIN_REGISTRY" \
  --set code_ids.astroport-oracle="$CODE_ID_ORACLE" \
  --set code_ids.astroport-pair="$CODE_ID_PAIR" \
  --set code_ids.astroport-router="$CODE_ID_ROUTER" \
  --set code_ids.astroport-tokenfactory-tracker="$CODE_ID_TOKENFACTORY_TRACKER" \
  --set code_ids.astroport-whitelist="$CODE_ID_WHITELIST" \
  --set code_ids.cw20-base="$CODE_ID_CW20_BASE" \
  --set addresses.astroport-factory="$ADDR_FACTORY" \
  --set addresses.astroport-incentives="$ADDR_INCENTIVES" \
  --set addresses.astroport-native-coin-registry="$ADDR_NATIVE_COIN_REGISTRY" \
  --set addresses.astroport-oracle="$ADDR_ORACLE" \
  --set addresses.astroport-router="$ADDR_ROUTER" \
  --set addresses.astroport-tokenfactory-tracker="$ADDR_TOKENFACTORY_TRACKER" \
  --set addresses.astroport-whitelist="$ADDR_WHITELIST" \
  --set pair_create_msg_template.asset_infos.1.native_token.denom="$FIRST_COUNTERPARTY_DENOM"

python3 scripts/check_juno_v1_deployment_template.py deployment/juno-v1-testnet.json
```

The fill script rewires dependent instantiate fields from the top-level values, including factory pair code ID, whitelist/tracker config, router factory address, native incentives denom, and oracle asset info.

## Frontend consumption

After rendering `deployment/juno-v1-testnet.json`, copy or import it alongside the generated declaration file:

```ts
import deployment from "./juno-v1-testnet.json";
import type { JunoV1FrontendDeploymentConfig } from "./juno-v1-frontend-config";

const config = deployment satisfies JunoV1FrontendDeploymentConfig;
```

Use `config.addresses` for the canonical contract map. For launch UX, the first pool form can start from `config.pair_create_msg_template`, but existing pools must be discovered by querying the factory; do not bake pool addresses into frontend config.

Required frontend addresses: `astroport-factory`, `astroport-router`, `astroport-native-coin-registry`, `astroport-incentives`.
Optional frontend addresses: `astroport-oracle`.

See `juno-v1-frontend-config.example.ts` for a dependency-free fixture that demonstrates the exact address map and first XYK pair-create helper.

## Scope guardrails

- v1 is XYK-only and permissionless.
- No new DEX token is introduced; incentives use the configured native denom.
- Do not add stable pairs, LSTs, perps, or yield surfaces to this config.
- Frontend should read canonical contract addresses from `addresses` and discover pools through factory queries.
