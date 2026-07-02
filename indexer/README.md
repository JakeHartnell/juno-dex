# Astroport Juno indexer API

Small dependency-free REST API skeleton for frontend metrics while ingestion/pricing storage is wired in.
By default it returns empty, correctly-shaped responses. Set `INDEXER_DEV_MOCKS=true` only for local development; mock responses include `dataSource: "mock"` and `isMock: true`.

## Run

```bash
cd indexer
npm test
PORT=8787 npm start
# local demo data only:
INDEXER_DEV_MOCKS=true PORT=8787 npm start
```

## Endpoints

- `GET /health` — probe status and whether responses are mock-backed.
- `GET /stats` — protocol totals: TVL, 24h/7d volume, 24h fees, pool counts.
- `GET /pools?limit=50&cursor=0` — pool list with `tvlUsd`, `volume24hUsd`, `feeApr`, `incentivesApr`, `totalApr`, fees and asset reserves.
- `GET /pools/:id` — detail by pool id or pair address.
- `GET /pools/:id/positions?limit=50&cursor=0` — paginated LP positions in a pool.
- `GET /wallets/:addr/positions?limit=50&cursor=0` — paginated LP positions for a wallet.
- `GET /wallets/:addr/history?limit=50&cursor=0` — paginated wallet transaction history.
- `GET /openapi.json` — compact OpenAPI entrypoint for typed client generation.

APR convention: trading fee APR is `(volume24hUsd * feeBps / 10000 * 365) / tvlUsd * 100`; incentive APR is `(emissionsPerDayUsd * 365) / tvlUsd * 100`; total APR is their sum.
