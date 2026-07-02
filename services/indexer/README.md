# Astroport Juno Indexer

Minimal event-ingestion and Postgres schema foundation for Juno Astroport pool metrics, history, LP positions, and future API work.

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
- Unit-tested event normalization for factory, pair, and incentives events.

## Configuration

Copy `.env.example` to `.env` or export variables:

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/astroport_indexer` | Postgres connection string. |
| `JUNO_RPC_URL` | `https://rpc-juno.itastakers.com` | Tendermint RPC endpoint. |
| `JUNO_REST_URL` | `https://lcd-juno.itastakers.com` | Cosmos REST endpoint for future queries. |
| `JUNO_WS_URL` | derived from RPC | WebSocket endpoint for future tailing. |
| `CHAIN_ID` | `juno-1` | Expected chain id. |
| `FACTORY_ADDRESS` | deployed Juno v1 factory | Astroport factory contract. |
| `ROUTER_ADDRESS` | deployed Juno v1 router | Router contract, retained for downstream API context. |
| `INCENTIVES_ADDRESS` | deployed Juno v1 incentives | Incentives contract to watch. |
| `ORACLE_ADDRESS` | deployed Juno v1 oracle | Oracle contract for price/candle work. |
| `NATIVE_COIN_REGISTRY_ADDRESS` | deployed Juno v1 native registry | Native registry contract. |
| `START_HEIGHT` | `1` | Backfill start height; set to factory deployment height when known. |
| `CONFIRMATION_DEPTH` | `2` | Blocks to lag chain head for reorg safety. |
| `POLL_INTERVAL_MS` | `5000` | Poll cadence. |
| `BATCH_SIZE` | `20` | Max blocks per polling loop. |
| `DRY_RUN` | `false` | If true, normalizes and logs without DB writes. |

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

A live RPC is only needed for `npm run dev`. Typecheck, tests, build, and SQL migration review do not need chain or database access.

## Docker

```bash
cd services/indexer
docker compose up --build
```

The `indexer` container waits on Postgres via Compose dependency and runs migrations before starting the poller.

## Ingestion model

1. Read the `indexer_cursors` row for `astroport-juno-v1`.
2. Fetch the current chain head from `/status`.
3. Process blocks up to `head - CONFIRMATION_DEPTH` in bounded batches.
4. Fetch block metadata and block results via Tendermint RPC.
5. Normalize wasm events emitted by the factory, pairs, and incentives contracts.
6. Upsert pools, append immutable event rows, update position deltas, and advance the cursor in one transaction.
7. On restart, unique constraints make replay safe; block hashes in `processed_blocks` provide the basis for future rollback if a reorg is detected inside the confirmation window.

## Notes for follow-up issues

- `START_HEIGHT` should be updated to the actual factory deployment height before a production backfill.
- Pool state snapshots, prices, and candles are schema-ready but need pricing/oracle logic in the metrics/API issues.
- The frontend currently reads `VITE_DEX_INDEXER_URL`; this service intentionally exposes ingestion/schema first and does not add an HTTP API yet.
