# Astroport Juno Indexer

Production indexer/API foundation for Juno Astroport pool metrics, history, LP positions, candles, and frontend-facing market data.

## Stack decision

This service uses a small TypeScript/Node block poller over Juno Tendermint RPC/REST instead of SubQuery. The repo already ships a TypeScript frontend, and a lightweight poller keeps the foundational service easy to run locally, test without chain or DB infrastructure, and evolve into the API/metrics work in issues #39-#42. The ingestion core is split into pure event-normalization helpers plus a Postgres writer so unit tests do not require live infra.

## What is included

- Postgres migration for:
  - resumable cursors and block processing ledger
  - pools and pool state snapshots
  - swaps and liquidity events
  - incentive events
  - LP positions/balances
  - token prices and OHLC candles
- Idempotent transaction/event shape based on `(tx_hash, msg_index, event_index, action)` uniqueness.
- Reorg-aware block ledger fields (`height`, `block_hash`, `parent_hash`) and configurable confirmation depth.
- Juno RPC/REST/WebSocket configuration placeholders for poll/backfill/live modes.
- Height-safe LCD pool-state queries after swap/provide/withdraw events, persisted as reserve snapshots keyed by `(pool_id, height, source)`.
- Unit-tested event normalization for factory, pair, and incentives events.
- Swap-derived pool OHLC candle writes for `5m`, `1h`, and `1d` intervals plus a replayable candle backfill command.
- HTTP API routes for `/health`, `/ready`, `/openapi.json`, `/stats`, `/prices`, `/pools`, pool candles, pool positions, wallet positions, and wallet history.
- Pool API responses expose latest persisted reserves and total LP share from `pool_state_snapshots` when snapshot rows exist.
- Optional JUNO-denominated value fields alongside honest nullable USD fields.

## Configuration

Copy `.env.example` to `.env` or export variables:

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/astroport_indexer` | Postgres connection string. Use host-managed secrets in production. |
| `JUNO_RPC_URL` | `https://rpc-juno.itastakers.com` | Tendermint RPC endpoint. |
| `JUNO_REST_URL` | `https://lcd-juno.itastakers.com` | Cosmos REST endpoint used for height-pinned pair pool-state smart queries. |
| `JUNO_WS_URL` | derived from RPC | WebSocket endpoint for future tailing. |
| `CHAIN_ID` | `juno-1` | Expected chain id. |
| `FACTORY_ADDRESS` | deployed Juno v1 factory | Astroport factory contract. |
| `ROUTER_ADDRESS` | deployed Juno v1 router | Router contract, retained for downstream API context. |
| `INCENTIVES_ADDRESS` | deployed Juno v1 incentives | Incentives contract to watch. |
| `ORACLE_ADDRESS` | deployed Juno v1 oracle | Oracle contract for price/candle work. |
| `NATIVE_COIN_REGISTRY_ADDRESS` | deployed Juno v1 native registry | Native registry contract. |
| `START_HEIGHT` | `39381297` | Juno v1 factory deployment height. Override only for intentional archive/full-chain replays. |
| `CONFIRMATION_DEPTH` | `2` | Blocks to lag chain head for reorg safety. |
| `POLL_INTERVAL_MS` | `5000` | Poll cadence. |
| `BATCH_SIZE` | `20` | Max blocks per polling loop. |
| `DRY_RUN` | `false` | If true, normalizes and logs without DB writes. |
| `API_PORT` | `8787` | Port for the HTTP API served by the same production process as the poller. |
| `PRICE_PROVIDER_BASE_URL` | unset | Reserved for a future provider worker. Current API only serves persisted `token_prices` rows. |
| `PRICE_PROVIDER_API_KEY` | unset | Reserved for future provider credentials; never commit real keys. |
| `PRICE_PROVIDER_NAME` | `provider` | Reserved source label for persisted provider writes. |
| `PRICE_CACHE_TTL_MS` | `300000` | Reserved for future provider/cache worker. |
| `PRICE_STALE_AFTER_MS` | `1800000` | Target age threshold for persisted price status. Current API returns stored `status`. |
| `PRICE_ALLOW_STALE` | `true` | Reserved for future resolver policy; current API never fabricates replacement prices. |
| `PRICE_DEV_MOCKS` | `false` | Reserved for local development only; production API in this package does not serve mocks. |

## Local development

```bash
cd services/indexer
npm ci
npm run typecheck
npm test
npm run build
```

Start Postgres and run migrations:

```bash
cd services/indexer
docker compose up -d postgres
cp .env.example .env
npm run migrate
npm run dev
```

Run a bounded staging backfill from `START_HEIGHT` through a known smoke-test height, verify the cursor reached that height, then rebuild candles from ingested swaps:

```bash
cd services/indexer
npm run backfill:range -- --to-height=39381355
psql "$DATABASE_URL" -c "select id, last_height from indexer_cursors where id = 'astroport-juno-v1' and last_height >= 39381355;"
npm run backfill:candles -- --pair=juno1... --from=2026-07-01T00:00:00Z --to=2026-07-02T00:00:00Z --limit=10000
```

The backfill reuses `token_candles`, keyed by `(chain_id, pair_address, asset, quote_asset, interval, bucket_start)`, and is idempotent with respect to inserted swap rows. Prices are derived from swap input/output amounts using a deterministic base/quote asset ordering; pass decimal metadata into the pure helpers when available for off-chain recalculation.

A live RPC is only needed for `npm run dev`. Typecheck, tests, build, and SQL migration review do not need chain or database access.

## Docker

```bash
cd services/indexer
docker compose up --build
```

The `indexer` container waits on Postgres via Compose dependency, runs migrations, then starts the poller and API in one process.

## Production deploy readiness

This repository does not perform external deployment, DNS changes, or secret setup. The intended production shape is a containerized indexer/API service plus managed Postgres, exposed at one stable HTTPS origin that the frontend consumes through `VITE_DEX_INDEXER_URL`.

Recommended platform settings:

| Setting | Value |
| --- | --- |
| Build context | `services/indexer` |
| Dockerfile | `services/indexer/Dockerfile` |
| Start command | image default: `node dist/src/migrate.js && node dist/src/index.js` |
| Database | Managed Postgres with backups and point-in-time recovery enabled |
| Public URL | Stable HTTPS API origin, for example `https://indexer.<domain>` |
| Frontend config | Set `VITE_DEX_INDEXER_URL` in Vercel preview/production envs to this origin |

Production environment variables should mirror `.env.example`, with these deployment-specific values set by the host secret manager:

- `DATABASE_URL`: managed Postgres connection string; require TLS if the provider supports `?sslmode=require`.
- `START_HEIGHT`: factory deployment height for first backfill (`39381297` for the recorded Juno v1 deployment), not `1` unless a full-chain backfill is intentional.
- `JUNO_RPC_URL`, `JUNO_REST_URL`, `JUNO_WS_URL`: provider endpoints with agreed rate limits.
- `PRICE_PROVIDER_*`: reserved for future persisted price-worker integration; never commit real keys.

Runbook for a release:

1. Build and push the Docker image from `services/indexer` after `Indexer CI` passes.
2. Provision/attach managed Postgres and set the environment variables above.
3. Deploy one replica first; container startup runs migrations before the poller starts.
4. Confirm ingestion advances by checking logs for processed block ranges and by inspecting `indexer_cursors` in Postgres.
5. Expose the API/indexer service at the stable HTTPS URL, then set frontend `VITE_DEX_INDEXER_URL` for preview and production.
6. Smoke-check the frontend preview and production domains after the Vercel deploy completes.

## Health checks and monitoring

Use platform process health plus database/RPC smoke checks for the worker container:

```bash
# Database connectivity from a one-off job/container with the same DATABASE_URL.
npm run migrate

# Cursor freshness: should move over time once the poller is running.
psql "$DATABASE_URL" -c "select id, last_height, updated_at from indexer_cursors order by updated_at desc limit 5;"
```

Expose `GET /health`, `GET /ready`, and `GET /metrics` at the same stable origin used by `VITE_DEX_INDEXER_URL`. The frontend client probes `/health` before reading `/stats`, `/pools`, `/prices`, `/wallets/:address/*`, and candle endpoints. Prometheus-compatible scrapers should use `/metrics` for readiness, cursor height, head height, confirmed target height, lag, confirmed lag, cursor age, RPC configured/reachable state, and migration count gauges. Treat `juno_indexer_rpc_reachable` as meaningful when `juno_indexer_rpc_configured` is `1`; local tests may omit RPC while production config should set `JUNO_RPC_URL`. The health response is JSON with at least:

```json
{ "status": "ok", "chainId": "juno-1", "confirmationDepth": 2, "cursorHeight": 123456, "headHeight": 123500, "confirmedTargetHeight": 123498, "lag": 44, "confirmedLag": 42 }
```

Alert on:

- container restart loops or non-zero exits;
- migration failures during deploy;
- Postgres CPU/storage/connection saturation;
- cursor lag above the agreed SLO, e.g. indexed height more than 50 confirmed blocks behind RPC head;
- repeated RPC rate-limit/network failures;
- API `/health` not returning `status: ok` or `/ready` not returning `status: ready`.

## Ingestion model

1. Read the `indexer_cursors` row for `astroport-juno-v1`.
2. Fetch the current chain head from `/status`.
3. Process blocks up to `head - CONFIRMATION_DEPTH` in bounded batches.
4. Fetch block metadata and block results via Tendermint RPC.
5. Normalize wasm events emitted by the factory, pairs, and incentives contracts.
6. Upsert pools, append immutable event rows, update position deltas, and advance the cursor in one core block transaction.
7. After the cursor advances, run best-effort height-pinned LCD reserve snapshot writes for known touched pairs. Snapshot failures are logged and can be repaired by later snapshot/backfill tooling; they do not roll back block/event persistence.
8. On restart, unique constraints make replay safe; block hashes in `processed_blocks` provide the basis for future rollback if a reorg is detected inside the confirmation window.

## Notes for follow-up issues

- Pool state snapshots are captured from height-pinned LCD smart queries when touched pairs emit swap/provide/withdraw events; USD/JUNO valuation logic still needs production-quality pricing and aggregate writes. API totals stay `null` until persisted aggregate data exists rather than returning synthetic zeroes.
- Candles are swap-derived from asset decimal metadata and store quote volume in `volume_quote`, not `volume_usd`.
- The frontend reads `VITE_DEX_INDEXER_URL`; point it at this service only after staging has backfilled real transaction data and `/ready` reports `ready`.
