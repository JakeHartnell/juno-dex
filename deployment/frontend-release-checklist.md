# Astroport-Juno v1 frontend release checklist

Use this when real uni-7 values exist and the UI repo is ready to consume the DEX handoff. This is deliberately narrow: publish the rendered contract map and generated type, then verify the UI discovers pools through the factory.

## Release files to hand to the UI repo

Copy these files together from `deployment/`:

- `juno-v1-testnet.json` — rendered uni-7 config produced from real upload/instantiate tx output; keep local/private until stewards choose to publish.
- `juno-v1-frontend-config.d.ts` — generated TypeScript contract for the frontend handoff.
- `juno-v1-frontend-config.example.ts` — optional fixture showing the address map and first XYK pair create helper.

Do not copy `juno-v1-testnet.template.json` as the live config.

## Pre-copy verification

Run from repo root before handing files to the UI repo:

```sh
python3 scripts/check_juno_v1_deployment_template.py deployment/juno-v1-testnet.json
python3 scripts/check_juno_v1_frontend_config.py deployment/juno-v1-testnet.json
python3 scripts/generate_juno_v1_frontend_types.py --check
python3 scripts/check_juno_v1_frontend_example.py
python3 scripts/check_juno_v1_frontend_handoff_sync.py
python3 scripts/build_juno_v1_frontend_release_bundle.py \
  --config deployment/juno-v1-testnet.json \
  --output deployment/juno-v1-frontend-release.zip
```

The first two commands require the rendered `deployment/juno-v1-testnet.json`; rehearse without chain output via `python3 scripts/check_juno_v1_dry_run_txs.py`.
The bundle helper reruns the same template/frontend/type/example/sync checks, rejects placeholder config, and writes an ignored zip containing only the rendered config, generated declaration, optional example, and `MANIFEST.json` hashes.

## Frontend address surface

Required frontend addresses: `astroport-factory`, `astroport-router`, `astroport-native-coin-registry`, `astroport-incentives`.
Optional frontend addresses: `astroport-oracle`.

Use `config.addresses` as the canonical contract map. Use `config.pair_create_msg_template` only to seed the first XYK create-pair form; discover existing pools by querying the factory contract. Do not hardcode pools or pair addresses in the UI repo.

## Scope guardrails

- v1 is XYK-only and permissionless.
- No new DEX token is introduced; incentives use the configured native denom.
- Do not add stable pairs, PCL, LSTs, perps, or yield surfaces to this handoff.
- Release blockers are missing real code IDs/addresses, stale generated types, or UI code that bypasses factory pair discovery.
