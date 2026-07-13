import http from "node:http";
import { URL } from "node:url";
import { openApiDocument } from "./openapi.js";
function baseHeaders(extraHeaders = {}) {
    return {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
        ...extraHeaders,
    };
}
function jsonResponse(res, status, body, extraHeaders = {}) {
    const payload = status === 204 ? "" : JSON.stringify(body);
    res.writeHead(status, baseHeaders({
        "content-type": "application/json; charset=utf-8",
        "cache-control": status === 200 ? "public, max-age=15, stale-while-revalidate=30" : "no-store",
        ...extraHeaders,
    }));
    res.end(payload);
}
function textResponse(res, status, body, extraHeaders = {}) {
    res.writeHead(status, baseHeaders({
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
        "cache-control": "no-store",
        ...extraHeaders,
    }));
    res.end(body);
}
function query(searchParams) {
    return {
        limit: searchParams.get("limit") ?? undefined,
        cursor: searchParams.get("cursor") ?? undefined,
        pair: searchParams.get("pair") ?? undefined,
        interval: searchParams.get("interval") ?? undefined,
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
        baseAsset: searchParams.get("baseAsset") ?? searchParams.get("base_asset") ?? undefined,
        quoteAsset: searchParams.get("quoteAsset") ?? searchParams.get("quote_asset") ?? undefined,
    };
}
function assets(searchParams, pathAsset) {
    const values = [];
    if (pathAsset)
        values.push(pathAsset);
    for (const key of ["asset", "assets", "denom", "denoms"]) {
        const value = searchParams.get(key);
        if (value)
            values.push(...value.split(","));
    }
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
function metricHelp(name, help, type = "gauge") {
    return [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`];
}
function metricValue(value) {
    if (typeof value === "boolean")
        return value ? 1 : 0;
    if (value === null || value === undefined)
        return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
function labelValue(value) {
    return String(value ?? "unknown").replace(/[\\"\n]/g, "_");
}
function metricLine(name, value, labels = {}) {
    const number = metricValue(value);
    if (number === null)
        return null;
    const labelEntries = Object.entries(labels);
    const renderedLabels = labelEntries.length > 0 ? `{${labelEntries.map(([key, label]) => `${key}="${labelValue(label)}"`).join(",")}}` : "";
    return `${name}${renderedLabels} ${number}`;
}
async function metricsBody(store, metrics) {
    const { health, ready } = await store.opsStatus();
    const labels = { chain_id: health.chainId ?? "unknown" };
    const lines = [
        ...metricHelp("juno_indexer_ready", "Indexer readiness status: 1 when /ready is ready, otherwise 0."),
        metricLine("juno_indexer_ready", ready.status === "ready", labels),
        ...metricHelp("juno_indexer_rpc_configured", "Whether this API store has an RPC endpoint configured for chain head checks."),
        metricLine("juno_indexer_rpc_configured", health.rpcConfigured, labels),
        ...metricHelp("juno_indexer_rpc_reachable", "RPC reachability; meaningful when juno_indexer_rpc_configured is 1."),
        metricLine("juno_indexer_rpc_reachable", health.rpcReachable, labels),
        ...metricHelp("juno_indexer_cursor_height", "Last block height committed to the indexer cursor."),
        metricLine("juno_indexer_cursor_height", health.cursorHeight, labels),
        ...metricHelp("juno_indexer_head_height", "Latest chain head height observed by the indexer API."),
        metricLine("juno_indexer_head_height", health.headHeight, labels),
        ...metricHelp("juno_indexer_confirmed_target_height", "Latest chain height considered safe after confirmation depth."),
        metricLine("juno_indexer_confirmed_target_height", health.confirmedTargetHeight, labels),
        ...metricHelp("juno_indexer_lag_blocks", "Difference between observed chain head and indexer cursor height."),
        metricLine("juno_indexer_lag_blocks", health.lag, labels),
        ...metricHelp("juno_indexer_confirmed_lag_blocks", "Difference between confirmed target height and indexer cursor height."),
        metricLine("juno_indexer_confirmed_lag_blocks", health.confirmedLag, labels),
        ...metricHelp("juno_indexer_cursor_age_ms", "Milliseconds since the indexer cursor row was last updated."),
        metricLine("juno_indexer_cursor_age_ms", health.cursorAgeMs, labels),
        ...metricHelp("juno_indexer_migrations_applied", "Number of schema migrations recorded as applied."),
        metricLine("juno_indexer_migrations_applied", ready.migrationsApplied, labels),
        ...metricHelp("juno_indexer_expected_migrations", "Expected schema migration count when configured."),
        metricLine("juno_indexer_expected_migrations", ready.expectedMigrations, labels),
    ];
    if (metrics) {
        const snapshot = metrics.snapshot();
        lines.push(...metricHelp("juno_indexer_fetch_blocks_total", "Blocks fetched by the in-process indexer fetcher.", "counter"), metricLine("juno_indexer_fetch_blocks_total", snapshot.fetchBlocksTotal), ...metricHelp("juno_indexer_fetch_blocks_per_second", "Average block fetch throughput since process start."), metricLine("juno_indexer_fetch_blocks_per_second", snapshot.fetchBlocksPerSecond), ...metricHelp("juno_indexer_fetch_rpc_requests_in_flight", "RPC requests currently in flight."), metricLine("juno_indexer_fetch_rpc_requests_in_flight", snapshot.rpcRequestsInFlight), ...metricHelp("juno_indexer_fetch_rpc_error_total", "RPC fetch errors by low-cardinality status.", "counter"));
        for (const [status, count] of snapshot.rpcErrors)
            lines.push(metricLine("juno_indexer_fetch_rpc_error_total", count, { status }));
        lines.push(...metricHelp("juno_indexer_decode_blocks_total", "Blocks decoded by the in-process indexer.", "counter"), metricLine("juno_indexer_decode_blocks_total", snapshot.decodeBlocksTotal), ...metricHelp("juno_indexer_writer_blocks_total", "Blocks committed by the indexer writer.", "counter"), metricLine("juno_indexer_writer_blocks_total", snapshot.writerBlocksTotal), ...metricHelp("juno_indexer_writer_commit_seconds", "Most recent block writer commit duration in seconds."), metricLine("juno_indexer_writer_commit_seconds", snapshot.writerCommitSeconds), ...metricHelp("juno_indexer_writer_events_total", "Events committed by the indexer writer by normalized kind.", "counter"));
        for (const [kind, count] of snapshot.writerEvents)
            lines.push(metricLine("juno_indexer_writer_events_total", count, { kind }));
        lines.push(...metricHelp("juno_indexer_reorg_halt", "Whether ingestion is halted because of reorg protection."), metricLine("juno_indexer_reorg_halt", snapshot.reorgHalt));
    }
    return `${lines.filter((line) => line !== null).join("\n")}\n`;
}
export function createIndexerApi(store, metrics) {
    return http.createServer(async (req, res) => {
        if (req.method === "OPTIONS")
            return jsonResponse(res, 204, {});
        if (req.method !== "GET")
            return jsonResponse(res, 405, { error: "method_not_allowed" });
        const url = new URL(req.url ?? "/", "http://localhost");
        const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        const parsedQuery = query(url.searchParams);
        try {
            if (url.pathname === "/health")
                return jsonResponse(res, 200, await store.health(), { "cache-control": "no-store" });
            if (url.pathname === "/ready") {
                const body = await store.ready();
                return jsonResponse(res, body.status === "ready" ? 200 : 503, body, { "cache-control": "no-store" });
            }
            if (url.pathname === "/metrics")
                return textResponse(res, 200, await metricsBody(store, metrics));
            if (url.pathname === "/openapi.json")
                return jsonResponse(res, 200, openApiDocument);
            if (url.pathname === "/stats")
                return jsonResponse(res, 200, await store.stats());
            if (parts[0] === "prices" && parts.length <= 2) {
                const ids = assets(url.searchParams, parts[1]);
                if (ids.length === 0)
                    return jsonResponse(res, 400, { error: "asset_required" });
                const prices = await store.prices(ids);
                return jsonResponse(res, 200, parts[1] ? prices[0] ?? null : { data: prices });
            }
            if (parts[0] === "pools" && parts.length === 1)
                return jsonResponse(res, 200, await store.pools(parsedQuery));
            if (parts[0] === "pools" && parts.length === 2) {
                const pool = await store.pool(parts[1]);
                return pool ? jsonResponse(res, 200, pool) : jsonResponse(res, 404, { error: "pool_not_found" });
            }
            if (parts[0] === "pools" && parts.length === 3 && parts[2] === "candles") {
                const page = await store.candles(parts[1], parsedQuery);
                return page ? jsonResponse(res, 200, page) : jsonResponse(res, 404, { error: "pool_not_found" });
            }
            if (parts[0] === "pools" && parts.length === 3 && parts[2] === "positions")
                return jsonResponse(res, 200, await store.poolPositions(parts[1], parsedQuery));
            if (parts[0] === "wallets" && parts.length === 3 && parts[2] === "positions")
                return jsonResponse(res, 200, await store.walletPositions(parts[1], parsedQuery));
            if (parts[0] === "wallets" && parts.length === 3 && parts[2] === "history")
                return jsonResponse(res, 200, await store.walletHistory(parts[1], parsedQuery));
            return jsonResponse(res, 404, { error: "not_found" });
        }
        catch (error) {
            if (error instanceof RangeError)
                return jsonResponse(res, 400, { error: "bad_request", message: error.message });
            console.error("indexer_api_error", error);
            return jsonResponse(res, 500, { error: "internal_error" });
        }
    });
}
