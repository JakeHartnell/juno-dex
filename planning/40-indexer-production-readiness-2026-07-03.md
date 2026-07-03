# Juno DEX indexer production-readiness plan

Date: 2026-07-03
Scope: `services/indexer/`, frontend-facing API, Postgres data model, chart/analytics data
Deployment record: `deployment/records/juno-v1-mainnet-deployment-2026-07-01.md`

## Decisions

- `services/indexer/` is the canonical production indexer package.
- The older `indexer/` REST skeleton may be removed once its useful API contract, tests, and mock-safety behavior are ported.
- The deployable service should expose both ingestion and HTTP API from one production service backed by Postgres.
- USD pricing comes from an external provider. When USD is unavailable, values should fall back to JUNO-denominated pricing, not fabricated USD.
- Missing USD prices must remain explicit: `priceUsd: null`, `status: "missing"` or `"stale"`, and no silent zeroes.
- The frontend API response shapes should remain compatible with `frontend/src/lib/indexer/types.ts` and `frontend/src/lib/indexer/client.ts`.

## Juno v1 contract inputs

Use the 2026-07-01 deployment record as source of truth:

| Component | Value |
|---|---|
| Chain | `juno-1` |
| Factory | `juno1n5ettlqdt06nd346mnqy65fahcvmncaazpwn8s3m0df3ldv0d2yqjqelca` |
| Router | `juno1fppwfa2efpsahvwlqprrshjth2mfqyd8n80yd7z5kpjspq30s8ksrapa8s` |
| Incentives | `juno1h0auy2knfyhkcn877cqun0fu00safgsjwvt82d4cvd0slv8q7wtsk59598` |
| Oracle | `juno1szsxu32r7rnu5wq7yqlxq4x46g0fq7qpzyggcvgsh2cq554mcuqql6jw4p` |
| Native coin registry | `juno1qwer7jleluth33trk2ywqvp6vwjh4j4zar3ag6dw5d8derkpel0sq8vfh2` |
| First pair | `juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv` |
| First LP denom | `factory/juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv/astroport/share` |

Open input: derive the production `START_HEIGHT` from the factory instantiate/create-pair txs before the first backfill. Do not default to height `1` in production unless intentionally doing a full-chain scan.

## Required frontend features

The indexer must power these frontend surfaces:

- pool list sorting/filtering by TVL, 24h volume, fees, APR, pool type, incentives;
- pool detail metrics and price/volume candles;
- stats dashboard with protocol TVL, 24h/7d volume, fees, top pools, pool count;
- swap widget market data and recent activity;
- portfolio LP positions, including unstaked and incentives-bonded LP;
- wallet transaction history for swaps, adds, withdraws, incentive bonds/unbonds/claims;
- token prices in USD when available, otherwise JUNO-relative pricing.

## API contract

Port the useful `indexer/` API surface into `services/indexer/`:

- `GET /health`
- `GET /ready`
- `GET /openapi.json`
- `GET /stats`
- `GET /prices?assets=...`
- `GET /prices/:asset`
- `GET /pools?limit=&cursor=&pair=`
- `GET /pools/:id`
- `GET /pools/:id/candles?interval=5m|1h|1d&from=&to=&baseAsset=&quoteAsset=&limit=&cursor=`
- `GET /pools/:id/positions`
- `GET /wallets/:addr/positions`
- `GET /wallets/:addr/history`

Compatibility requirements:

- Preserve current frontend type names and field names.
- Keep mock data opt-in only for local development and mark it with `dataSource: "mock"` and `isMock: true`.
- Empty production tables should return honest empty arrays/nulls, not mocks.
- API errors should be structured and should not leak raw DB internals.

## Data model gaps

The current migrations are a good base, but production API support needs these additions or confirmations:

- asset metadata table: denom/contract, symbol, decimals, logo URI, verified status, IBC trace metadata;
- pair asset table or normalized view for fast pool lookup/filtering;
- latest pool state materialized view for reserves, total LP share, TVL in USD/JUNO, and update height;
- daily/hourly aggregate views for 24h/7d volume and fees;
- wallet transaction view combining swaps, liquidity events, and incentive events;
- LP position accounting that includes liquid LP balance and incentives-bonded LP balance;
- price table fields for both `price_usd` and `price_juno`, with source, status, observed time, and staleness.

## Ingestion work

1. Validate wasm event normalization against real tx fixtures from the deployment record:
   - create pair;
   - seed liquidity;
   - smoke swap;
   - smoke add liquidity;
   - smoke withdraw liquidity.
2. Add tx fixture tests for each normalized event shape.
3. Backfill from the derived factory deployment height.
4. Make pool discovery fully dynamic from factory events, with registry metadata enrichment.
5. Query pair contracts after relevant events or on a scheduled cadence to capture reserves and total share.
6. Track processed block hashes and halt/alert on reorg mismatch until rollback logic is implemented.
7. Keep idempotent writes for all event rows and candle updates.

## Pricing model

Priority order:

1. External USD provider for known assets.
2. JUNO-relative price from pool swaps/reserves.
3. Missing price state.

API behavior:

- If USD provider has a fresh price, return `priceUsd`, `status: "fresh"`, and source metadata.
- If USD provider is stale and stale values are allowed, return `status: "stale"`.
- If USD is unavailable but JUNO-relative price exists, expose JUNO-denominated fields in pool/stat calculations and leave USD fields null.
- Do not convert JUNO-relative prices into USD unless `ujuno` has a fresh/stale USD price according to provider policy.

Implementation note: frontend types currently only model `priceUsd`. Add backward-compatible fields such as `priceJuno`, `valueJuno`, `tvlJuno`, `volume24hJuno`, and `fees24hJuno` as optional extensions before relying on them in the UI.

## Candle/chart requirements

- Use `token_candles` keyed by chain, pair, base asset, quote asset, interval, and bucket start.
- Support `5m`, `1h`, and `1d`.
- `open` is first trade in the bucket.
- `close` is last trade in the bucket.
- `high` and `low` are price extrema.
- `volume` is base-asset volume.
- `volumeQuote` is quote-asset volume.
- Keep USD/JUNO chart overlays separate from pair-relative OHLC candles.
- Provide a replayable candle backfill command that can rebuild a pair/range idempotently.

## Operational readiness

- One Docker image for migrations, poller, and API.
- Managed Postgres with backups and point-in-time recovery.
- Separate liveness/readiness semantics:
  - `/health`: process is alive and reports chain/indexer lag.
  - `/ready`: DB reachable, migrations applied, RPC reachable, API can serve.
- Production logs must include block ranges processed, cursor height, head height, lag, event counts, and API errors.
- Alert on:
  - indexer lag above threshold;
  - repeated RPC/provider failures;
  - migration failure;
  - DB connection saturation;
  - stale price age above threshold;
  - API 5xx rate;
  - reorg/hash mismatch halt.

## Implementation sequence

1. Port `indexer/` REST API routes, response normalization, OpenAPI, and tests into `services/indexer/`.
2. Add a Postgres-backed API store in `services/indexer/`.
3. Implement `/health`, `/ready`, `/stats`, `/pools`, `/pools/:id`, and candles from Postgres.
4. Add asset metadata and USD/JUNO pricing schema changes.
5. Add wallet positions and wallet history views/endpoints.
6. Add real tx fixtures from the deployment record and harden event parsing.
7. Add reserve snapshotting and derived TVL/volume/APR materialized views.
8. Add staging seed/backfill runbook and smoke tests against the frontend.
9. Remove the old `indexer/` package after parity tests pass.
10. Wire production `VITE_DEX_INDEXER_URL` only after staging API has real non-mock data.

## Acceptance criteria

- `services/indexer` can run locally with Postgres, migrate, ingest, and serve the frontend API.
- Frontend can load pool list, pool detail, stats, charts, portfolio, and wallet history from the service.
- Production mode never serves mock data unless explicitly configured for dev.
- Chart candles are produced from real swaps and can be rebuilt by backfill.
- USD fields are present only when backed by external provider pricing.
- JUNO-denominated fallback fields are available when USD is missing.
- Indexer lag and DB/API health are visible from HTTP and logs.
- Old `indexer/` package is deleted or clearly deprecated after parity is complete.
