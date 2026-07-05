# Indexer staging performance benchmark runbook

This runbook measures catch-up throughput for the active TypeScript indexer in `services/indexer/` against a staging Postgres database and non-public archive RPC/LCD endpoints. It is intentionally manual: it does not provision infrastructure, cut production traffic over, or publish fabricated acceptance metrics.

## Scope and acceptance evidence

Collect one JSON summary for each benchmark range and attach the raw output to the release/issue. Each summary must include:

- block range (`blockRange.from`, `blockRange.to`)
- duration (`durationMs`, `durationSeconds`)
- blocks/sec (`blocksPerSecond`)
- cursor, head, target, and lag (`cursor`, `head`, `target`, `lag`)
- fatal RPC/LCD error count observed by the harness (`rpcErrorCount`)
- indexed event counts where available (`eventCounts.*`); use `null` rather than inventing unavailable values

The lightweight harness added in this branch prints exactly one machine-readable JSON object per run. Non-fatal reserve snapshot LCD failures are currently logged by the indexer as `indexer_reserve_snapshot_failed`; review stderr/log output alongside the JSON summary until snapshot workers expose first-class counters.

## Required staging inputs

Use an isolated staging environment. Do not run this against production tables or public/free RPC endpoints.

Required environment:

```bash
export DATABASE_URL='postgres://<user>:<password>@<staging-host>:5432/<staging-db>'
export JUNO_RPC_URL='https://<paid-or-self-hosted-archive-rpc>'
export JUNO_REST_URL='https://<paid-or-self-hosted-archive-lcd>'
export CHAIN_ID='juno-1'
export CURSOR_ID='astroport-juno-v1-benchmark'
export INDEXER_MODE='catchup'

# Runtime knobs from IDX-PERF-01. Use the same names in staging and CI.
export RANGE_SIZE='10000'
export FETCH_WINDOW_SIZE='250'
export FETCH_CONCURRENCY='32'
export REALTIME_FETCH_CONCURRENCY='8'
export RPC_TIMEOUT_MS='10000'
export RPC_MAX_RETRIES='5'
export INGEST_RESERVE_SNAPSHOTS_INLINE='false'
export INGEST_CANDLES_INLINE='false'
export INGEST_AGGREGATES_INLINE='false'
export PRICE_DEV_MOCKS='false'
export CONFIRMATION_DEPTH='2'
export BATCH_SIZE='50'
```

Current-branch notes:

- `INDEXER_MODE`, `INGEST_RESERVE_SNAPSHOTS_INLINE`, and `INGEST_CANDLES_INLINE` are the intended staging contract from IDX-PERF-01. If this benchmark branch is run before IDX-PERF-01 lands, those flags may be documented but not yet consumed by `loadConfig()`.
- Inline reserve snapshots are still attempted after swap/provide/withdraw events until the deployed build wires `INGEST_RESERVE_SNAPSHOTS_INLINE` through the `Indexer`; use event-light ranges for low-event throughput and record LCD behavior honestly.
- Candle writes are currently performed inline when complete asset decimals are present until the deployed build wires `INGEST_CANDLES_INLINE` through the DB writer. If disabling inline candles is not available in the deployed build, note that in the benchmark evidence.
- Use a dedicated `CURSOR_ID` per run or range family so benchmark cursor rewinds do not affect other staging workers.

## Install and migrate

```bash
cd services/indexer
npm ci
npm run migrate
```

## Select ranges

Pick and record exact heights before running. Use known historical chain data, provider dashboards, or prior staging observations.

1. **Low-event range:** 10,000 consecutive finalized blocks with few/no Astroport events.
2. **Event-heavy range:** a known range containing swaps, provide/withdraw liquidity, pool creation, or incentive events.
3. **Realtime catch-up:** after historical benchmarks, restart normal catch-up and measure lag trending back toward zero.

Example placeholders below must be replaced with real heights:

```bash
export LOW_FROM=<low_event_start_height>
export LOW_TO=$((LOW_FROM + 9999))
export HEAVY_FROM=<known_event_heavy_start_height>
export HEAVY_TO=<known_event_heavy_end_height>
```

## Benchmark commands

The harness rewinds the configured benchmark cursor to `from-height - 1`, runs until `to-height`, then prints one JSON summary. Keep stdout/stderr logs with the issue evidence.

### 1. 10,000-block low-event range

```bash
cd services/indexer
npm --silent run benchmark:range -- --from-height="$LOW_FROM" --to-height="$LOW_TO" | tee benchmark-low-event.json
```

### 2. Known event-heavy range

```bash
cd services/indexer
npm --silent run benchmark:range -- --from-height="$HEAVY_FROM" --to-height="$HEAVY_TO" | tee benchmark-event-heavy.json
```

### 3. Realtime catch-up after benchmark

Use a fresh cursor or explicitly set the benchmark cursor near the current staging cursor before starting the normal indexer. Then watch lag until it stabilizes near the configured confirmation depth.

```bash
cd services/indexer
npm run dev 2>&1 | tee benchmark-realtime-catchup.log
```

In another shell, sample cursor/head/target and backlog with the SQL snippets below. Record at least start, 5-minute, and 15-minute samples, or until lag is stable.

## SQL snippets

Run with `psql "$DATABASE_URL"`. Set variables first:

```sql
\set chain_id 'juno-1'
\set cursor_id 'astroport-juno-v1-benchmark'
\set from_height 39381297
\set to_height 39391296
```

### Cursor height

```sql
SELECT id, chain_id, last_height, last_block_hash, updated_at
FROM indexer_cursors
WHERE id = :'cursor_id';
```

### Processed block count for a range

```sql
SELECT count(*) AS processed_blocks,
       min(height) AS min_height,
       max(height) AS max_height
FROM processed_blocks
WHERE chain_id = :'chain_id'
  AND height BETWEEN :from_height AND :to_height;
```

### Swaps and liquidity counts for a range

```sql
SELECT 'swaps' AS table_name, count(*) AS rows
FROM swaps
WHERE chain_id = :'chain_id'
  AND height BETWEEN :from_height AND :to_height
UNION ALL
SELECT 'liquidity_events' AS table_name, count(*) AS rows
FROM liquidity_events
WHERE chain_id = :'chain_id'
  AND height BETWEEN :from_height AND :to_height
UNION ALL
SELECT 'liquidity_provides' AS table_name, count(*) AS rows
FROM liquidity_events
WHERE chain_id = :'chain_id'
  AND kind = 'provide'
  AND height BETWEEN :from_height AND :to_height
UNION ALL
SELECT 'liquidity_withdraws' AS table_name, count(*) AS rows
FROM liquidity_events
WHERE chain_id = :'chain_id'
  AND kind = 'withdraw'
  AND height BETWEEN :from_height AND :to_height;
```

### Job backlog depth / lag proxy

There is no separate job queue table in the current indexer schema. Use cursor-to-target lag as the backlog proxy:

```sql
WITH cursor_row AS (
  SELECT last_height
  FROM indexer_cursors
  WHERE id = :'cursor_id'
), target AS (
  SELECT max(height) AS latest_processed_height
  FROM processed_blocks
  WHERE chain_id = :'chain_id'
)
SELECT cursor_row.last_height AS cursor_height,
       target.latest_processed_height,
       GREATEST(target.latest_processed_height - cursor_row.last_height, 0) AS processed_block_backlog_proxy
FROM cursor_row, target;
```

For realtime catch-up, compare `last_height` from the cursor query to the node head reported in harness output or `/status`, then subtract `CONFIRMATION_DEPTH` to compute target lag.

### Staging cleanup

Only run cleanup on isolated staging data and only for the benchmark cursor/range. Take a database snapshot first if the data may be needed for debugging.

```sql
BEGIN;

DELETE FROM token_candles
WHERE chain_id = :'chain_id'
  AND bucket_start IN (
    SELECT DISTINCT date_trunc('minute', block_time)
    FROM processed_blocks
    WHERE chain_id = :'chain_id'
      AND height BETWEEN :from_height AND :to_height
  );

DELETE FROM pool_state_snapshots
WHERE height BETWEEN :from_height AND :to_height;

DELETE FROM incentive_events
WHERE chain_id = :'chain_id'
  AND height BETWEEN :from_height AND :to_height;

DELETE FROM liquidity_events
WHERE chain_id = :'chain_id'
  AND height BETWEEN :from_height AND :to_height;

DELETE FROM swaps
WHERE chain_id = :'chain_id'
  AND height BETWEEN :from_height AND :to_height;

DELETE FROM pools
WHERE chain_id = :'chain_id'
  AND created_height BETWEEN :from_height AND :to_height;

DELETE FROM processed_blocks
WHERE chain_id = :'chain_id'
  AND height BETWEEN :from_height AND :to_height;

DELETE FROM indexer_cursors
WHERE id = :'cursor_id';

COMMIT;
```

If staging contains pre-existing rows in the same range, prefer restoring a staging snapshot over manual deletes.

## Interpreting results

Provider throttling symptoms:

- `rpcErrorCount` is greater than zero, or logs contain HTTP 429/5xx, fetch timeouts, `/block`, `/block_results`, `/status`, or `indexer_reserve_snapshot_failed` LCD smart-query failures.
- Throughput falls while database CPU, locks, and connection utilization remain low.
- Increasing `BATCH_SIZE` does not improve blocks/sec, or makes errors worse.

Database saturation symptoms:

- Fatal RPC/LCD errors remain zero and logs do not show repeated non-fatal LCD failures, but blocks/sec drops as Postgres CPU, I/O wait, lock waits, or connection pool wait time rises.
- Heavy ranges are disproportionately slower than low-event ranges because inserts/upserts dominate.
- Swaps/liquidity/candle/snapshot writes increase sharply during the slow window.

When results are ambiguous, rerun the low-event range with a lower `BATCH_SIZE` and compare with the heavy range. Do not average away throttling spikes; report p50/p95 samples or the raw run JSON/logs if collected.
