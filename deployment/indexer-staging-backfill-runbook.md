# Juno DEX indexer staging deployment runbook

Use this to try the indexer/API on staging before any public frontend production traffic depends on it.

## Decision

- **Goal:** prove the merged indexer can run against real Juno data, serve honest API responses, and support a frontend preview.
- **Scope:** staging database, staging API URL, bounded backfill, smoke checks, frontend preview env.
- **Non-goal:** production cutover. Do not point the public production frontend at the indexer until the pass criteria below are met.

## Preconditions

- `main` is at or after `bef1d519 fix: ignore unknown pair events (#108)`.
- GitHub CI is green for the commit being deployed.
- Managed or disposable staging Postgres is available.
- The RPC/LCD provider supports archive access from `START_HEIGHT=39381297` and height-pinned LCD smart queries.
- Staging has a stable HTTPS API URL, e.g. `https://juno-dex-indexer-staging.<domain>`.
- Secrets are set in the host secret manager; do not commit real credentials.

## Required environment

Set these for the indexer service/container:

```bash
DATABASE_URL='postgres://<user>:<password>@<host>:5432/<database>?sslmode=require'
JUNO_RPC_URL='https://<archive-rpc>'
JUNO_REST_URL='https://<archive-lcd>'
JUNO_WS_URL='wss://<archive-rpc>/websocket'
CHAIN_ID='juno-1'
FACTORY_ADDRESS='juno1n5ettlqdt06nd346mnqy65fahcvmncaazpwn8s3m0df3ldv0d2yqjqelca'
ROUTER_ADDRESS='juno1fppwfa2efpsahvwlqprrshjth2mfqyd8n80yd7z5kpjspq30s8ksrapa8s'
INCENTIVES_ADDRESS='juno1h0auy2knfyhkcn877cqun0fu00safgsjwvt82d4cvd0slv8q7wtsk59598'
ORACLE_ADDRESS='juno1szsxu32r7rnu5wq7yqlxq4x46g0fq7qpzyggcvgsh2cq554mcuqql6jw4p'
NATIVE_COIN_REGISTRY_ADDRESS='juno1qwer7jleluth33trk2ywqvp6vwjh4j4zar3ag6dw5d8derkpel0sq8vfh2'
START_HEIGHT='39381297'
CONFIRMATION_DEPTH='2'
POLL_INTERVAL_MS='5000'
BATCH_SIZE='20'
DRY_RUN='false'
API_PORT='8787'
PRICE_DEV_MOCKS='false'
```

Notes:

- `DATABASE_URL` should require TLS when the provider supports it.
- `START_HEIGHT=39381297` is the recorded Juno v1 factory deployment height. Do **not** use `1` for staging.
- USD pricing remains incomplete; USD TVL/volume/fees may be `null`. That is expected and preferable to fake zeroes.

## Local preflight from the deploy commit

Run before building/pushing the staging image:

```bash
git checkout main
git pull --ff-only origin main

cd services/indexer
npm ci
npm test
npm run typecheck
npm run build

# Proves built dist resolves ./migrations from runtime CWD.
node --input-type=module -e 'import("./dist/src/db.js").then(async (m) => console.log((await m.listMigrationFiles()).join(",")))'

cd ../../frontend
npm ci
npm run typecheck
```

Expected migration listing:

```text
001_init.sql,002_pool_candles.sql,003_api_pricing_readiness.sql,004_pool_state_source_precedence.sql
```

## Deploy staging indexer/API

Build from `services/indexer` using its Dockerfile. The container default command is:

```bash
node dist/src/migrate.js && node dist/src/index.js
```

Recommended host settings:

| Setting | Value |
|---|---|
| Build context | `services/indexer` |
| Dockerfile | `services/indexer/Dockerfile` |
| Exposed port | `8787` |
| Health path | `/health` |
| Readiness path | `/ready` |
| Metrics path | `/metrics` |
| Replicas | `1` for first staging run |

After deploy, check logs for successful migrations and startup:

```bash
# Host-specific command; examples:
# fly logs -a <app>
# railway logs --service <service>
# docker logs <container>
```

The service should start without migration path errors and listen on `API_PORT`.

## First bounded backfill

Run the bounded backfill as a one-off job with the same image/env. This proves the historical path before allowing the long-lived poller to catch up.

```bash
cd services/indexer
START_HEIGHT=39381297 CONFIRMATION_DEPTH=2 BATCH_SIZE=20 \
  npm run backfill:range -- --to-height=39381355
```

If running inside the built container image instead of source checkout, use:

```bash
node dist/src/migrate.js
START_HEIGHT=39381297 CONFIRMATION_DEPTH=2 BATCH_SIZE=20 \
  node dist/src/backfill-range.js --to-height=39381355
```

Verify the cursor reached the smoke-test height:

```bash
psql "$DATABASE_URL" -c \
  "select id, last_height, last_block_hash, updated_at from indexer_cursors where id = 'astroport-juno-v1' and last_height >= 39381355;"
```

Expected: one row for `astroport-juno-v1` with `last_height >= 39381355`.

## Optional candle repair/backfill

Run only after swaps exist. Use a narrow known pair/time window first:

```bash
npm run backfill:candles -- \
  --pair=<known_pair_address> \
  --from=2026-07-01T00:00:00Z \
  --to=2026-07-02T00:00:00Z \
  --limit=10000
```

Expected: candle rows may be skipped if decimal metadata is incomplete. Do not treat missing candles as success until `asset_metadata` coverage is verified.

## API smoke checks

Set:

```bash
INDEXER_URL='https://juno-dex-indexer-staging.<domain>'
```

Then run:

```bash
curl -fsS "$INDEXER_URL/health" | jq .
curl -fsS "$INDEXER_URL/ready" | jq .
curl -fsS "$INDEXER_URL/openapi.json" | jq '.paths | keys'
curl -fsS "$INDEXER_URL/metrics" | grep '^juno_indexer_'
curl -fsS "$INDEXER_URL/stats" | jq .
curl -fsS "$INDEXER_URL/prices" | jq .
curl -fsS "$INDEXER_URL/pools?limit=10" | jq .
```

For a pair returned by `/pools`, smoke detail/candles:

```bash
PAIR='<pair_address_from_pools_response>'
curl -fsS "$INDEXER_URL/pools/$PAIR" | jq .
curl -fsS "$INDEXER_URL/pools/$PAIR/candles?interval=1h&limit=10" | jq .
```

Wallet history smoke, using the Juno agent wallet as a low-risk test address:

```bash
curl -fsS "$INDEXER_URL/wallets/juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76/history?limit=10" | jq .
```

## Database smoke checks

Run against staging Postgres:

```sql
select version, applied_at from schema_migrations order by version;
select id, chain_id, last_height, last_block_hash, updated_at from indexer_cursors;
select height, block_hash, parent_hash, tx_count, processed_at from processed_blocks order by height desc limit 10;
select pair_address, created_height, created_tx_hash from pools order by created_height limit 10;
select pair_address, pool_id, height, offer_asset, ask_asset, offer_amount, return_amount from swaps order by height limit 10;
select pair_address, pool_id, kind, height, assets, share_amount from liquidity_events order by height limit 10;
select p.pair_address, s.height, s.source, s.reserves, s.total_share from pool_state_snapshots s join pools p on p.id = s.pool_id order by s.height desc limit 10;
select pair_address, pool_id, interval, bucket_start, volume, volume_quote, volume_usd from token_candles order by bucket_start desc limit 10;
```

Expected:

- `schema_migrations` includes all four migrations.
- Cursor advances and `updated_at` changes while the poller runs.
- `processed_blocks` rows have real block hashes and parent hashes.
- Pools have real pair addresses from factory events.
- Swap/liquidity rows, if present, have non-null `pool_id`.
- Unknown pair-like events are not persisted as swaps/liquidity.
- `pool_state_snapshots.source='lcd'` rows appear for touched known pairs when LCD supports the requested height.
- `volume_usd` remains `null` unless a USD pricing worker explicitly populates it.

## Frontend staging/preview

Set frontend preview env:

```bash
VITE_DEX_INDEXER_URL='https://juno-dex-indexer-staging.<domain>'
VITE_DEX_INDEXER_DISABLED='false'
```

Keep existing Juno RPC/REST/frontend env values unchanged.

Deploy a frontend preview and smoke:

1. Open the preview URL.
2. Confirm the app loads without console errors.
3. Confirm analytics panels do **not** show fake zeroes when indexer stats are unavailable/null.
4. Confirm pool list renders with indexer-backed metadata/reserves where present.
5. Open a pool detail page from a `/pools` result.
6. Connect or paste a wallet and check wallet history/positions degrade gracefully if empty.
7. Temporarily set `VITE_DEX_INDEXER_DISABLED=true` in a separate preview only if you need to compare fallback behavior.

Browser/API checks:

```bash
curl -I 'https://<frontend-preview-domain>/'
curl -fsS "$VITE_DEX_INDEXER_URL/health"
curl -fsS "$VITE_DEX_INDEXER_URL/ready"
```

## Pass criteria

Staging is considered ready for a limited production-candidate trial when all are true:

- `/ready` returns HTTP 200 with `status: "ready"`.
- `/health` reports non-null `cursorHeight`, `headHeight`, `confirmedTargetHeight`, and lag fields.
- Cursor continues advancing after the bounded backfill.
- `/metrics` exposes `juno_indexer_*` gauges and scrape does not error.
- `/pools` returns real pools with `dataSource: "indexer"` and `isMock: false`.
- At least one pool detail response includes reserves from persisted snapshots, or missing reserves are explainable by LCD/archive limitations.
- Swap/liquidity rows, if present, reference known pools via `pool_id`.
- USD TVL/volume/fee fields are `null` when not priced, not fabricated as `0`.
- Frontend preview works with the staging indexer URL and falls back gracefully for missing data.
- Logs do not show repeated migration failures, reorg/hash conflicts, LCD timeout storms, or RPC rate-limit loops.

## Stop / rollback triggers

Stop staging and investigate before continuing if any occur:

- Container fails before API startup due migration directory/path errors.
- `/ready` remains `not_ready` after migrations, DB, and RPC are expected valid.
- Cursor does not advance after several polling intervals.
- Bounded backfill exits before `last_height >= --to-height`.
- `processed_blocks` reports parent/hash conflicts.
- Event rows have synthetic-looking tx hashes for real transactions.
- Swap/liquidity rows have `pool_id IS NULL`.
- API returns mock data or fabricated zero USD aggregates.
- Frontend preview crashes or silently presents unavailable analytics as real data.
- RPC/LCD provider rate limits dominate logs.

## Production cutover rule

Only after staging passes: set production frontend `VITE_DEX_INDEXER_URL` to the stable production indexer URL, preferably behind a fallback/circuit-breaker rollout. Until then, production frontend should continue to treat the indexer as optional.