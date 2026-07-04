# IDX-PERF-10: Rust hot-path benchmark decision record

Date: 2026-07-04
Issue: [#118](https://github.com/JakeHartnell/juno-dex/issues/118)
Scope: `services/indexer/` ingestion hot path only. No production Rust rewrite, TypeScript API replacement, or schema changes.

## Decision

**Recommendation: stay TypeScript for now.**

The current evidence does not justify introducing Rust into the production ingestion path. The only available real Juno data in-repo is a slim set of public transaction event fixtures, and TypeScript event normalization over those fixtures is already far above expected Juno DEX block/event volume on this runner. The unmeasured and more likely bottlenecks are source RPC/LCD throughput, ordered persistence, reserve snapshot enrichment, and Postgres merge/index behavior. Rust should be reconsidered only after concurrent fetch, deferred enrichment, and bulk/staging database writes are implemented and benchmarked against captured block bundles.

## Existing fixture data

Real Juno v1 fixture data exists under:

- `services/indexer/test/fixtures/juno-v1/create-pair.json`
- `services/indexer/test/fixtures/juno-v1/seed-liquidity.json`
- `services/indexer/test/fixtures/juno-v1/smoke-swap.json`
- `services/indexer/test/fixtures/juno-v1/smoke-add-liquidity.json`
- `services/indexer/test/fixtures/juno-v1/smoke-withdraw-liquidity.json`

These fixtures are useful for parser correctness and a decode microbenchmark. They are not enough to measure the full hot path because they do not include contiguous block bundles, empty blocks, multi-tx blocks, RPC response sizes, or a staging database volume distribution.

### Fixture gap and exact capture procedure

Before revisiting Rust, capture a benchmark bundle that is safe to commit or store as a CI artifact:

1. Select three height ranges from the Juno v1 deployment window:
   - quiet baseline: `39381297..39381320`;
   - first-pair activity: `39381305..39381360`;
   - a later production/high-activity range identified from staging logs.
2. For each height, save both CometBFT endpoints:
   - `GET $JUNO_RPC_URL/block?height=$HEIGHT`
   - `GET $JUNO_RPC_URL/block_results?height=$HEIGHT`
3. Redact nothing from public chain data, but do not include private provider URLs, API keys, or operator archives.
4. Store as newline-delimited JSON or one JSON file per height under an isolated path such as `services/indexer/bench/fixtures/juno-v1-block-bundles/` only if the bundle is small enough for the repo; otherwise store externally and commit only a manifest with SHA256 checksums.
5. Record bundle metadata: height range, endpoint host, capture timestamp, response byte totals, block count, tx count, wasm event count, and normalized event count.

Example capture command:

```bash
cd services/indexer
export JUNO_RPC_URL=https://<provider-rpc>
mkdir -p bench/fixtures/juno-v1-block-bundles
for h in $(seq 39381297 39381360); do
  curl -fsS "$JUNO_RPC_URL/block?height=$h" \
    -o "bench/fixtures/juno-v1-block-bundles/$h.block.json"
  curl -fsS "$JUNO_RPC_URL/block_results?height=$h" \
    -o "bench/fixtures/juno-v1-block-bundles/$h.block_results.json"
done
sha256sum bench/fixtures/juno-v1-block-bundles/*.json \
  > bench/fixtures/juno-v1-block-bundles/SHA256SUMS
```

## Measurements collected in this worktree

Environment used for local measurements:

- Node: `v22.22.3`
- Package: `services/indexer`
- Input: the five real Juno v1 transaction fixtures listed above
- Command executed from `services/indexer` after `npm ci`:

```bash
node --expose-gc --import tsx - <<'TS'
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { normalizeBlockEvents } from './src/events.ts';
const dir = join(process.cwd(), 'test/fixtures/juno-v1');
const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const contracts = {
  factoryAddress: 'juno1n5ettlqdt06nd346mnqy65fahcvmncaazpwn8s3m0df3ldv0d2yqjqelca',
  incentivesAddress: 'juno1h0auy2knfyhkcn877cqun0fu00safgsjwvt82d4cvd0slv8q7wtsk59598',
};
const loops = 200000;
let eventCount = 0;
let normCount = 0;
global.gc?.();
const before = process.memoryUsage();
const cpu0 = process.cpuUsage();
const t0 = performance.now();
for (let i = 0; i < loops; i += 1) {
  const tx = fixtures[i % fixtures.length];
  eventCount += tx.events.length;
  const normalized = normalizeBlockEvents(
    tx.events,
    { chainId: 'juno-1', height: tx.height, blockTime: tx.timestamp, txHash: tx.txhash },
    contracts,
  );
  normCount += normalized.length;
}
const elapsed = (performance.now() - t0) / 1000;
const cpu = process.cpuUsage(cpu0);
global.gc?.();
const after = process.memoryUsage();
console.log(JSON.stringify({
  node: process.version,
  fixtures: fixtures.length,
  loops,
  sourceEvents: eventCount,
  normalizedEvents: normCount,
  seconds: elapsed,
  fixtureTxPerSec: loops / elapsed,
  sourceEventsPerSec: eventCount / elapsed,
  normalizedEventsPerSec: normCount / elapsed,
  cpuUserSeconds: cpu.user / 1e6,
  cpuSystemSeconds: cpu.system / 1e6,
  rssDeltaMiB: (after.rss - before.rss) / 1048576,
  heapUsedDeltaMiB: (after.heapUsed - before.heapUsed) / 1048576,
}, null, 2));
TS
```

Result:

| Metric | Value |
| --- | ---: |
| Fixture tx loops | 200,000 |
| Source fixture events decoded | 520,000 |
| Normalized events emitted | 200,000 |
| Elapsed wall time | 0.413 s |
| Fixture tx/s | 484,695 |
| Source events/s | 1,260,207 |
| Normalized events/s | 484,695 |
| CPU user time | 0.468 s |
| CPU system time | 0.000 s |
| RSS delta after GC | 1.54 MiB |
| Heap-used delta after GC | 0.11 MiB |

Interpretation: pure TypeScript fixture decode is not currently the bottleneck. Even allowing for a large slowdown when processing full RPC block bundles, JSON parse, writes, logs, and reserve snapshots, the parser has substantial headroom relative to Juno block cadence. This microbenchmark does not prove the whole ingestion pipeline is fast; it only argues against a Rust parser rewrite before source and database measurements exist.

## Benchmark comparison matrix

| Area | Current result | Bottleneck read | Rust implication |
| --- | --- | --- | --- |
| TypeScript decode throughput | Measured from real tx fixtures at ~1.26M source events/s and ~485k normalized events/s. | Not a bottleneck at fixture scale. Need full block bundles for a realistic JSON parse + decode result. | Rust fetch/decode is not justified yet. |
| TypeScript fetch throughput | Attempted against default `https://rpc-juno.itastakers.com`; DNS failed in this runner with `getaddrinfo ENOTFOUND`. | No source ceiling was measured. Provider rate limits and latency are likely to dominate before parser CPU. | Do not use Rust to solve an unmeasured provider bottleneck. Add concurrent fetch/backoff first. |
| TypeScript write throughput | Not measured here because the Docker daemon was unavailable (`Cannot connect to the Docker daemon at unix:///var/run/docker.sock`) and no Postgres service was already listening on `127.0.0.1:5432`. | Ordered DB writes, indexes, and candle upserts are more likely to cap backfill throughput than decode. | A Rust writer should not be built until Postgres staging merge throughput is measured and bulk SQL shape is known. |
| Source endpoint max throughput | Not measured due DNS/network availability in this runner. | Needs provider-specific benchmark with agreed rate limits. | If source endpoint caps below target, Rust provides no benefit. |
| CPU/memory under high concurrency | Decode-only CPU was ~1.13 CPU seconds per wall second and memory delta after GC was small. High-concurrency fetch/write profile still missing. | Need `node --cpu-prof`, `--heap-prof`, and process RSS sampling during concurrent fetch + write. | Consider Rust only if profiles show sustained Node CPU/GC saturation after DB/source bottlenecks are removed. |

## Commands and metrics to collect before revisiting

### 1. Source endpoint maximum throughput

Purpose: determine the block-bundle fetch ceiling for each candidate RPC provider without database writes.

```bash
cd services/indexer
export JUNO_RPC_URL=https://<provider-rpc>
export FROM_HEIGHT=39381297
export TO_HEIGHT=39381360
export CONCURRENCY=4
node --import tsx - <<'TS'
import { performance } from 'node:perf_hooks';
import { JunoRpcClient } from './src/rpc.ts';
const rpc = new JunoRpcClient(process.env.JUNO_RPC_URL!);
const from = Number(process.env.FROM_HEIGHT);
const to = Number(process.env.TO_HEIGHT);
const concurrency = Number(process.env.CONCURRENCY ?? 4);
const heights = Array.from({ length: to - from + 1 }, (_, i) => from + i);
let index = 0;
let ok = 0;
let failed = 0;
let txs = 0;
let events = 0;
const t0 = performance.now();
async function worker() {
  for (;;) {
    const h = heights[index++];
    if (h === undefined) return;
    try {
      const block = await rpc.block(h);
      ok += 1;
      txs += block.txCount;
      events += block.txEvents.reduce((n, tx) => n + tx.events.length, 0);
    } catch {
      failed += 1;
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
const seconds = (performance.now() - t0) / 1000;
console.log({ ok, failed, seconds, blocksPerSec: ok / seconds, txs, events, eventsPerSec: events / seconds });
TS
```

Collect: blocks/s, tx/s, event/s, p50/p95/p99 request latency, bytes/s, HTTP 429/5xx rate, retry count, and provider advertised limits. Repeat at concurrency `1,2,4,8,16` and stop increasing when errors or p99 latency rise sharply.

### 2. TypeScript fetch/decode throughput without writes

Purpose: isolate JSON decode and event normalization after source responses are available.

```bash
cd services/indexer
node --cpu-prof --heap-prof --import tsx bench/decode-block-bundles.ts \
  --fixtures=bench/fixtures/juno-v1-block-bundles \
  --loops=100 \
  --concurrency=8
```

If no benchmark helper exists yet, implement it under `services/indexer/bench/` with `tsx` only and keep it out of production build/start scripts.

Collect: block bundles/s, source events/s, normalized events/s, CPU profile top functions, RSS peak, heap peak, GC time, and event-loop delay.

### 3. Postgres staging merge/write throughput

Purpose: measure ordered persistence independently from RPC.

```bash
cd services/indexer
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/astroport_indexer
npm run migrate
node --import tsx bench/write-normalized-events.ts \
  --fixtures=bench/fixtures/juno-v1-block-bundles \
  --mode=ordered-per-block \
  --repeat=100
node --import tsx bench/write-normalized-events.ts \
  --fixtures=bench/fixtures/juno-v1-block-bundles \
  --mode=staging-bulk-merge \
  --repeat=100
```

Collect: blocks/s, rows/s by table, transaction time p50/p95/p99, rows skipped by idempotency, Postgres CPU, WAL bytes, index size growth, lock waits, `pg_stat_statements` top queries, and connection pool utilization.

### 4. End-to-end high-concurrency profile

Purpose: find the actual bottleneck with realistic source, decode, ordered write, and deferred reserve snapshot behavior.

```bash
cd services/indexer
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/astroport_indexer
export JUNO_RPC_URL=https://<provider-rpc>
export JUNO_REST_URL=https://<provider-lcd>
export START_HEIGHT=39381297
export BATCH_SIZE=100
node --cpu-prof --heap-prof --trace-gc --import tsx src/backfill-range.ts \
  --to-height=39382300 \
  --fetch-concurrency=8 \
  --defer-reserve-snapshots=true
```

Collect: confirmed block lag catch-up rate, blocks/s, normalized rows/s, reserve snapshot queue depth, API responsiveness if co-hosted, RSS peak, heap peak, GC pause p99, CPU utilization per core, Postgres CPU/IO, and provider error rate.

## Acceptance thresholds for revisiting Rust

Revisit the decision only if all of these are true:

1. Source RPC/LCD and Postgres have been benchmarked and are not the limiting factor for the target deployment.
2. The TypeScript implementation already uses bounded concurrent fetch, bulk/staging DB merge or equivalent batched writes, deferred reserve enrichment, and minimal synchronous logging.
3. Profiling shows Node CPU or GC is the dominant bottleneck for at least 30 minutes of sustained backfill or a representative high-traffic replay.
4. The observed performance misses target thresholds by a material margin:
   - backfill target: at least **50 confirmed blocks/s** over captured fixtures or staging replay;
   - live target: cursor remains within **50 confirmed blocks** of head with p95 block processing below **1 second**;
   - resource target: process RSS below **1 GiB** and GC p99 pause below **100 ms** during sustained ingestion;
   - reliability target: no increase in missed/retried writes or ordering violations under concurrency.
5. A Rust prototype against the same captured bundle demonstrates at least **2x end-to-end hot-path improvement** after including FFI/process-boundary overhead and operational complexity.

## What a Rust prototype may include later

If thresholds are missed, keep any Rust experiment isolated:

- allowed: a standalone decoder benchmark reading captured block bundles and writing NDJSON normalized events;
- allowed: an isolated ordered-writer prototype that writes to a disposable benchmark database;
- not allowed: replacing production TypeScript API routes;
- not allowed: changing schema solely for Rust;
- not allowed: making production builds depend on Rust without a separate approved issue.

Potential follow-up recommendations if future benchmarks justify them:

- **move only fetch/decode to Rust** if Node CPU is dominated by JSON/RPC decode while Postgres has headroom;
- **move fetch/decode/ordered-writer to Rust** only if Node remains CPU/GC-bound after bulk staging and ordered write improvements;
- **revisit after database/source bottlenecks are removed** if provider or Postgres throughput is below target.

## Conclusion

Stay TypeScript for now. The current parser is fast on available real fixtures, and the missing measurements are exactly the areas Rust cannot automatically fix: RPC/LCD throughput and Postgres merge behavior. The next performance work should capture full block bundles, add isolated benchmark helpers, and measure source, decode, write, and end-to-end profiles before any production Rust work is proposed.
