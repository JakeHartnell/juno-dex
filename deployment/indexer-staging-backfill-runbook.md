# Juno DEX indexer staging backfill runbook

Use this after the fixture-validation PR lands and before any public frontend points at the production indexer API.

## Preconditions

- Managed or local Postgres is available and disposable for the first staging run.
- `services/indexer` image/checkout is built from a commit with CI green.
- RPC provider supports archive access at and after `START_HEIGHT=39381297`.
- `DATABASE_URL`, `JUNO_RPC_URL`, `CHAIN_ID=juno-1`, and Juno v1 contract addresses are configured.
- No production frontend uses this API until smoke checks pass.

## Runbook

```bash
cd services/indexer
npm ci
npm run typecheck
npm test
npm run build

# Empty/staging database only.
npm run migrate

# Start a bounded first staging backfill through the recorded smoke-test withdraw tx.
START_HEIGHT=39381297 \
CONFIRMATION_DEPTH=2 \
npm run backfill:range -- --to-height=39381355

# Verify the bounded command actually reached the requested smoke-test height.
psql "$DATABASE_URL" -c "select id, last_height, last_block_hash, updated_at from indexer_cursors where id = 'astroport-juno-v1' and last_height >= 39381355;"

# Then run the long-lived poller/API.
START_HEIGHT=39381297 \
CONFIRMATION_DEPTH=2 \
API_PORT=8787 \
npm run dev
```

## Smoke checks

In another shell/container with the same network access:

```bash
curl -fsS http://127.0.0.1:8787/health | jq .
curl -fsS http://127.0.0.1:8787/ready | jq .
curl -fsS http://127.0.0.1:8787/openapi.json | jq '.paths | keys'
curl -fsS http://127.0.0.1:8787/metrics | grep '^juno_indexer_'
curl -fsS 'http://127.0.0.1:8787/pools?limit=10' | jq .
curl -fsS 'http://127.0.0.1:8787/pools/juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv/candles?interval=1h&limit=10' | jq .
curl -fsS 'http://127.0.0.1:8787/wallets/juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76/history?limit=10' | jq .
```

## Database checks

```sql
select id, last_height, last_block_hash, updated_at from indexer_cursors;
select height, block_hash, tx_count, processed_at from processed_blocks order by height desc limit 10;
select pair_address, created_height, created_tx_hash from pools order by created_height limit 10;
select pair_address, height, offer_asset, ask_asset, offer_amount, return_amount from swaps order by height limit 10;
select pair_address, kind, height, assets, share_amount from liquidity_events order by height limit 10;
select pair_address, interval, bucket_start, volume, volume_quote, volume_usd from token_candles order by bucket_start limit 10;
```

## Pass criteria

- `/ready` returns HTTP 200 and `status: "ready"`.
- `/health` reports non-null cursor/head/lag fields after ingestion starts.
- `pools` contains the recorded first pair.
- Swap and liquidity rows exist for the smoke transactions.
- `token_candles.volume_quote` is populated from swap math and `volume_usd` remains null unless a USD pricing worker explicitly writes it.
- API responses use `dataSource: "indexer"` and `isMock: false`.
- No USD TVL/volume/fee fields are fabricated as zero when price coverage is missing.

## Stop / rollback triggers

Stop the staging run and investigate before continuing if any occur:

- `/ready` returns `not_ready` after migrations and RPC config are expected to be valid.
- Cursor does not advance after repeated polling loops.
- RPC errors/rate limits dominate logs.
- `processed_blocks.parent_hash` mismatch/reorg evidence appears.
- Event rows have synthetic tx hashes for real transactions.
- Candle quote volume is missing despite swap rows existing.
