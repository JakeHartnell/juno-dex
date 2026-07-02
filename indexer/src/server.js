import http from "node:http";
import { URL } from "node:url";
import { createDevMockStore, createEmptyStore } from "./store.js";
import { openApiDocument } from "./openapi.js";

const DEFAULT_PORT = 8787;
const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT = 120;

function jsonResponse(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "cache-control": status === 200 ? "public, max-age=15, stale-while-revalidate=30" : "no-store",
    ...extraHeaders,
  });
  res.end(payload);
}

function parseQuery(searchParams) {
  return {
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    pair: searchParams.get("pair") ?? undefined,
  };
}

function createRateLimiter({ limit = DEFAULT_RATE_LIMIT, windowMs = RATE_LIMIT_WINDOW_MS } = {}) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }
    bucket.count += 1;
    return { allowed: bucket.count <= limit, remaining: Math.max(limit - bucket.count, 0), resetAt: bucket.resetAt };
  };
}

export function createIndexerApi({ store = createEmptyStore(), rateLimit = DEFAULT_RATE_LIMIT } = {}) {
  const checkRateLimit = createRateLimiter({ limit: rateLimit });
  return http.createServer((req, res) => {
    if (req.method === "OPTIONS") return jsonResponse(res, 204, {});
    if (req.method !== "GET") return jsonResponse(res, 405, { error: "method_not_allowed" });

    const rate = checkRateLimit(req.socket.remoteAddress ?? "unknown");
    if (!rate.allowed) {
      return jsonResponse(res, 429, { error: "rate_limited" }, { "retry-after": "60" });
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const pathParts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const query = parseQuery(url.searchParams);

    try {
      if (url.pathname === "/health") {
        return jsonResponse(res, 200, {
          status: "ok",
          service: "astroport-juno-indexer-api",
          dataSource: store.getProtocolStats().dataSource,
          isMock: store.getProtocolStats().isMock,
        }, { "cache-control": "no-store" });
      }
      if (url.pathname === "/openapi.json") return jsonResponse(res, 200, openApiDocument);
      if (url.pathname === "/stats") return jsonResponse(res, 200, store.getProtocolStats());
      if (pathParts[0] === "pools" && pathParts.length === 1) return jsonResponse(res, 200, store.listPools(query));
      if (pathParts[0] === "pools" && pathParts.length === 2) {
        const pool = store.getPool(pathParts[1]);
        return pool ? jsonResponse(res, 200, pool) : jsonResponse(res, 404, { error: "pool_not_found" });
      }
      if (pathParts[0] === "pools" && pathParts[2] === "positions") return jsonResponse(res, 200, store.listPoolPositions(pathParts[1], query));
      if (pathParts[0] === "wallets" && pathParts[2] === "positions") return jsonResponse(res, 200, store.listWalletPositions(pathParts[1], query));
      if (pathParts[0] === "wallets" && pathParts[2] === "history") return jsonResponse(res, 200, store.listWalletHistory(pathParts[1], query));
      return jsonResponse(res, 404, { error: "not_found" });
    } catch (error) {
      return jsonResponse(res, 500, { error: "internal_error", message: error instanceof Error ? error.message : String(error) });
    }
  });
}

export function storeFromEnv(env = process.env) {
  return env.INDEXER_DEV_MOCKS === "true" ? createDevMockStore() : createEmptyStore();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const server = createIndexerApi({ store: storeFromEnv() });
  server.listen(port, () => {
    const mode = process.env.INDEXER_DEV_MOCKS === "true" ? "mock-dev" : "empty";
    console.log(`astroport juno indexer api listening on :${port} (${mode} data source)`);
  });
}
