const errorResponse = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
  required: ["error"],
};

const pagination = {
  type: "object",
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 500 },
    nextCursor: { type: ["string", "null"] },
  },
  required: ["limit", "nextCursor"],
};

const assetAmount = {
  type: "object",
  properties: {
    denom: { type: "string" },
    amount: { type: "string" },
    valueUsd: { type: ["number", "null"] },
    valueJuno: { type: ["number", "null"] },
    priceUsd: { type: ["number", "null"] },
    priceJuno: { type: ["number", "null"] },
    priceStatus: { type: "string", enum: ["fresh", "stale", "missing"] },
  },
};

const pool = {
  type: "object",
  properties: {
    id: { type: "string" },
    pair: { type: "string" },
    pairAddress: { type: "string" },
    lpToken: { type: ["string", "null"] },
    poolType: { type: ["string", "null"] },
    assets: { type: "array", items: assetAmount },
    tvlUsd: { type: ["number", "null"], description: "Null when valuation is unavailable; never fabricated as zero." },
    tvlJuno: { type: ["number", "null"] },
    volume24hUsd: { type: ["number", "null"] },
    volume24hJuno: { type: ["number", "null"] },
    volume7dUsd: { type: ["number", "null"] },
    volume7dJuno: { type: ["number", "null"] },
    fees24hUsd: { type: ["number", "null"] },
    fees24hJuno: { type: ["number", "null"] },
    feeBps: { type: ["number", "null"] },
    feeApr: { type: "number" },
    incentivesApr: { type: "number" },
    totalApr: { type: "number" },
    incentivized: { type: "boolean" },
    updatedAt: { type: "string", format: "date-time" },
    dataSource: { type: "string", const: "indexer" },
    isMock: { type: "boolean", const: false },
  },
  required: ["id", "pairAddress", "assets", "dataSource", "isMock"],
};

const price = {
  type: "object",
  properties: {
    asset: { type: "string" },
    priceUsd: { type: ["number", "null"] },
    priceJuno: { type: ["number", "null"] },
    source: { type: ["string", "null"] },
    status: { type: "string", enum: ["fresh", "stale", "missing"] },
    stale: { type: "boolean" },
    observedAt: { type: ["string", "null"], format: "date-time" },
    ageMs: { type: ["integer", "null"] },
    isMock: { type: "boolean", const: false },
  },
  required: ["asset", "priceUsd", "priceJuno", "status", "stale", "isMock"],
};

const candle = {
  type: "object",
  properties: {
    poolId: { type: "string" },
    pairAddress: { type: "string" },
    baseAsset: { type: "string" },
    quoteAsset: { type: "string" },
    interval: { type: "string", enum: ["5m", "1h", "1d"] },
    bucketStart: { type: "string", format: "date-time" },
    open: { type: ["number", "null"] },
    high: { type: ["number", "null"] },
    low: { type: ["number", "null"] },
    close: { type: ["number", "null"] },
    volume: { type: ["number", "null"] },
    volumeQuote: { type: ["number", "null"], description: "Quote-asset volume, stored separately from USD volume." },
    tradeCount: { type: "integer" },
    dataSource: { type: "string", const: "indexer" },
    isMock: { type: "boolean", const: false },
  },
};

const walletTransaction = {
  type: "object",
  properties: {
    txHash: { type: "string" },
    walletAddress: { type: ["string", "null"] },
    poolId: { type: ["string", "null"] },
    pairAddress: { type: ["string", "null"] },
    type: { type: "string" },
    height: { type: "integer" },
    timestamp: { type: "string", format: "date-time" },
    offerAsset: { type: ["object", "null"] },
    askAsset: { type: ["object", "null"] },
    amountUsd: { type: ["number", "null"] },
    feeUsd: { type: ["number", "null"] },
    success: { type: "boolean" },
    dataSource: { type: "string", const: "indexer" },
    isMock: { type: "boolean", const: false },
  },
};

const limitParam = { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500 }, required: false };
const cursorParam = { name: "cursor", in: "query", schema: { type: "string" }, required: false };
const assetQueryParam = { name: "assets", in: "query", schema: { type: "string" }, required: false, description: "Comma-separated native denoms, IBC denoms, or CW20 contract addresses." };
const assetPathParam = { name: "asset", in: "path", schema: { type: "string" }, required: true };
const idPathParam = { name: "id", in: "path", schema: { type: "string" }, required: true, description: "Pool UUID or pair address." };
const walletPathParam = { name: "addr", in: "path", schema: { type: "string" }, required: true, description: "Juno wallet address." };
const candleQueryParams = [
  { name: "interval", in: "query", schema: { type: "string", enum: ["5m", "1h", "1d"] }, required: false },
  { name: "from", in: "query", schema: { type: "string", format: "date-time" }, required: false },
  { name: "to", in: "query", schema: { type: "string", format: "date-time" }, required: false },
  { name: "baseAsset", in: "query", schema: { type: "string" }, required: false },
  { name: "quoteAsset", in: "query", schema: { type: "string" }, required: false },
];

function ok(schema: unknown, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    responses: {
      "200": { description: "OK", content: { "application/json": { schema } } },
      "400": { description: "Bad request", content: { "application/json": { schema: errorResponse } } },
      "404": { description: "Not found", content: { "application/json": { schema: errorResponse } } },
      "503": { description: "Not ready", content: { "application/json": { schema } } },
      "500": { description: "Internal error", content: { "application/json": { schema: errorResponse } } },
    },
  };
}

export const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "Astroport Juno Production Indexer API", version: "0.1.0" },
  servers: [{ url: "/" }],
  paths: {
    "/health": { get: ok({ type: "object", properties: { status: { type: "string", const: "ok" }, service: { type: "string" }, chainId: { type: "string" }, confirmationDepth: { type: "number" }, cursorHeight: { type: ["number", "null"] }, cursorAgeMs: { type: ["number", "null"] }, headHeight: { type: ["number", "null"] }, confirmedTargetHeight: { type: ["number", "null"] }, lag: { type: ["number", "null"] }, confirmedLag: { type: ["number", "null"] }, rpcConfigured: { type: "boolean" }, rpcReachable: { type: "boolean" }, dataSource: { type: "string", const: "indexer" }, isMock: { type: "boolean", const: false } } }) },
    "/ready": { get: ok({ type: "object", properties: { status: { type: "string", enum: ["ready", "not_ready"] }, checks: { type: "object", properties: { database: { type: "boolean" }, migrations: { type: "boolean" }, rpc: { type: "boolean" } } }, migrationsApplied: { type: "integer" }, expectedMigrations: { type: ["integer", "null"] }, rpcConfigured: { type: "boolean" }, rpcReachable: { type: "boolean" }, dataSource: { type: "string", const: "indexer" }, isMock: { type: "boolean", const: false } } }) },
    "/openapi.json": { get: ok({ type: "object" }) },
    "/metrics": { get: { responses: { "200": { description: "Prometheus text exposition metrics for indexer readiness, lag, cursor, RPC, and migration status.", content: { "text/plain": { schema: { type: "string" } } } }, "500": { description: "Internal error", content: { "application/json": { schema: errorResponse } } } } } },
    "/stats": { get: ok({ type: "object", properties: { poolCount: { type: "integer" }, tvlUsd: { type: ["number", "null"] }, tvlJuno: { type: ["number", "null"] }, volume24hUsd: { type: ["number", "null"] }, volume24hJuno: { type: ["number", "null"] }, volume7dUsd: { type: ["number", "null"] }, volume7dJuno: { type: ["number", "null"] }, fees24hUsd: { type: ["number", "null"] }, fees24hJuno: { type: ["number", "null"] }, incentivizedPools: { type: "integer" }, updatedAt: { type: "string", format: "date-time" }, dataSource: { type: "string", const: "indexer" }, isMock: { type: "boolean", const: false } } }) },
    "/prices": { get: ok({ type: "object", properties: { data: { type: "array", items: price } }, required: ["data"] }, { parameters: [assetQueryParam] }) },
    "/prices/{asset}": { get: ok(price, { parameters: [assetPathParam] }) },
    "/pools": { get: ok({ type: "object", properties: { data: { type: "array", items: pool }, pagination }, required: ["data", "pagination"] }, { parameters: [limitParam, cursorParam, { name: "pair", in: "query", schema: { type: "string" }, required: false }] }) },
    "/pools/{id}": { get: ok(pool, { parameters: [idPathParam] }) },
    "/pools/{id}/candles": { get: ok({ type: "object", properties: { data: { type: "array", items: candle }, pagination, meta: { type: "object" } }, required: ["data", "pagination", "meta"] }, { parameters: [idPathParam, limitParam, cursorParam, ...candleQueryParams] }) },
    "/pools/{id}/positions": { get: ok({ type: "object", properties: { data: { type: "array" }, pagination }, required: ["data", "pagination"] }, { parameters: [idPathParam, limitParam, cursorParam] }) },
    "/wallets/{addr}/positions": { get: ok({ type: "object", properties: { data: { type: "array" }, pagination }, required: ["data", "pagination"] }, { parameters: [walletPathParam, limitParam, cursorParam] }) },
    "/wallets/{addr}/history": { get: ok({ type: "object", properties: { data: { type: "array", items: walletTransaction }, pagination }, required: ["data", "pagination"] }, { parameters: [walletPathParam, limitParam, cursorParam] }) },
  },
};
