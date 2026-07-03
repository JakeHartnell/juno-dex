# Juno DEX Indexer Production Architecture

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** make `services/indexer/` the canonical production indexer/API service for Juno DEX: realtime ingestion, Postgres-backed analytics, frontend-compatible HTTP API, honest pricing, and observable operations.

**Architecture:** keep the production service in TypeScript/Node for the first production cut because the repo already has a working TS ingestion foundation, Vitest tests, migrations, and frontend contract alignment. Split the code internally into ingestion, API/store, pricing, and ops modules while shipping one Docker image that can run migrations, poller, and HTTP API. Revisit Rust only after event coverage and API parity are proven; the bottleneck now is correctness/backfill semantics, not JavaScript CPU.

**Tech Stack Recommendation:** TypeScript Node 22 + `pg` + Postgres 16+ managed service + CometBFT RPC/WebSocket + LCD contract queries + Vite/frontend existing types. Use TimescaleDB or native partitioning later if candle/history volume demands it; do not add a framework or hosted indexer dependency until the custom contract/event semantics are stable.

---

## Final decision

Ship a custom Postgres-backed TypeScript indexer first.

| Option | Verdict | Why |
|---|---:|---|
| TypeScript Node service in `services/indexer` | **Chosen now** | Existing code, fastest path to API parity, easy frontend type sharing, enough performance for Juno DEX volume with batched RPC + Postgres indexes. |
| Rust service | Later optimization | Better CPU/memory ceiling, but higher rewrite cost before event semantics are proven. Use only if profiling shows Node is the bottleneck. |
| Go service | Not now | Good ops profile, but no repo leverage over TS and still a rewrite. |
| SubQuery/Subsquid/Hasura-first | Not now | Useful references, but contract-specific pricing/candles/reorg behavior and frontend response shapes need custom control. |
| Kafka/queue architecture | Not first cut | Adds ops surface. Add only after poller/API contention or multi-consumer needs appear. |

## Performance/realtime model

1. **Ingestion mode**
   - Poll confirmed CometBFT blocks with `confirmationDepth >= 2` for correctness.
   - Add WebSocket head subscription as an optimization for wakeups, not source of truth.
   - Process contiguous height ranges with idempotent writes and cursor advancement inside one DB transaction per block.
   - Track `processed_blocks(height, block_hash, parent_hash)` and halt on hash mismatch until rollback is implemented.

2. **Backfill mode**
   - Derive `START_HEIGHT` from factory instantiate/create-pair deployment transactions.
   - Backfill in bounded batches by height range.
   - Use replayable commands for candles/materialized aggregates.
   - Never default production to height `1` unless a full-chain scan is explicitly requested.

3. **Database model**
   - Raw normalized facts: pools, swaps, liquidity events, incentive events, processed blocks.
   - Latest state snapshots: reserves, total LP share, TVL USD/JUNO.
   - Query surfaces: views/materialized views for latest pools, stats, wallet history, positions, hourly/daily aggregates.
   - Prices store both `price_usd` and `price_juno` with explicit `status` (`fresh`, `stale`, `missing`) and source metadata.

4. **API model**
   - Expose `/health` for process/cursor/lag.
   - Expose `/ready` for DB/migrations/RPC readiness.
   - Keep routes compatible with `frontend/src/lib/indexer/types.ts`.
   - Production empty tables return honest empty arrays/nulls. Mock data remains opt-in dev only.
   - Errors are structured and do not leak raw DB internals to clients.

## Implementation sequence

### Task 1: Production API skeleton in `services/indexer`

**Objective:** Port the old REST contract into the canonical package with Postgres-backed store boundaries.

**Files:**
- Create: `services/indexer/src/api.ts`
- Create: `services/indexer/src/api-store.ts`
- Create: `services/indexer/src/openapi.ts`
- Modify: `services/indexer/src/index.ts`
- Test: `services/indexer/test/api.test.ts`

**Verification:**
- `cd services/indexer && npm test`
- `cd services/indexer && npm run typecheck`

### Task 2: Pricing/schema readiness

**Objective:** Support explicit missing/stale/USD/JUNO price states without fabricated USD.

**Files:**
- Create: `services/indexer/migrations/003_api_pricing_readiness.sql`
- Modify: `frontend/src/lib/indexer/types.ts`

**Verification:**
- TypeScript typecheck passes.
- API price response can return `{ priceUsd: null, priceJuno: 1, status: "fresh" }`.

### Task 3: Real tx fixtures and event hardening

**Objective:** Lock parser correctness against deployment transactions.

**Files:**
- Add fixtures under `services/indexer/test/fixtures/juno-v1/*.json`.
- Extend `services/indexer/test/events.test.ts`.

**Verification:**
- create-pair, seed-liquidity, swap, add-liquidity, withdraw-liquidity fixtures normalize to stable shapes.

### Task 4: Pool reserve snapshots

**Objective:** Query pair contracts after relevant events and persist reserves/total share.

**Files:**
- Modify: `services/indexer/src/rpc.ts`
- Modify: `services/indexer/src/indexer.ts`
- Modify: `services/indexer/src/db.ts`
- Test: `services/indexer/test/reserves.test.ts`

**Verification:**
- snapshot writes are idempotent by `(pool_id,height,source)`.
- latest pool API includes reserve-backed assets.

### Task 5: Aggregates/materialized views

**Objective:** Serve pool list/stats from DB without scanning raw events per request.

**Files:**
- Add migration for hourly/daily aggregates or materialized views.
- Update `PostgresApiStore.stats()` and `pools()`.

**Verification:**
- API tests cover TVL/JUNO fallback and 24h/7d metrics.

### Task 6: Wallet positions/history

**Objective:** Combine LP balances, bonded balances, liquidity events, swaps, and incentives.

**Files:**
- Add views for wallet history and positions.
- Update `PostgresApiStore.walletPositions()`, `poolPositions()`, `walletHistory()`.

**Verification:**
- Wallet endpoints return frontend-compatible empty pages on empty DB and real rows from fixtures.

### Task 7: Ops readiness

**Objective:** Make the service deployable and observable.

**Files:**
- Update `services/indexer/README.md`, `.env.example`, `Dockerfile`, `docker-compose.yml`.
- Add runbook under `deployment/`.

**Verification:**
- local Postgres compose: migrate, run, ingest dry range, serve API.
- logs include block range, head, target, lag, event counts.

## Current PR scope

This PR implements Tasks 1–2: API skeleton, Postgres store boundary, `/ready`, OpenAPI parity, pricing/JUNO schema readiness, frontend optional JUNO fields, and tests. It intentionally does not claim full production ingestion/backfill is complete.

## Acceptance criteria for production cutover

- `services/indexer` can run migrations, ingest confirmed blocks, and serve API from the same Docker image.
- Staging API contains non-mock pool data before `VITE_DEX_INDEXER_URL` points production frontend to it.
- USD is only returned when backed by configured provider policy; otherwise USD fields are null and JUNO fields are explicit.
- Reorg mismatch halts ingestion with alerting until rollback is implemented.
- Backfill/candle rebuild commands are replayable and idempotent.
- Old `indexer/` is deleted only after parity tests pass against `services/indexer`.
