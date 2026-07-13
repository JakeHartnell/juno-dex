import { createHash } from "node:crypto";
export class JunoRestClient {
    restUrl;
    timeoutMs;
    maxRetries;
    constructor(restUrl, timeoutMs = 5_000, maxRetries = 2) {
        this.restUrl = restUrl;
        this.timeoutMs = timeoutMs;
        this.maxRetries = maxRetries;
    }
    async poolState(pairAddress, height) {
        const encodedQuery = encodeURIComponent(Buffer.from(JSON.stringify({ pool: {} })).toString("base64"));
        const headers = {};
        if (height !== undefined)
            headers["x-cosmos-block-height"] = String(height);
        const path = `/cosmwasm/wasm/v1/contract/${pairAddress}/smart/${encodedQuery}`;
        const json = await this.getJson(path, headers);
        return normalizePoolState(json.data ?? json);
    }
    async getJson(path, headers) {
        let lastError;
        for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                const response = await fetch(`${this.restUrl}${path}`, { headers, signal: controller.signal });
                if (response.ok)
                    return await response.json();
                if (!isTransientStatus(response.status) || attempt === this.maxRetries) {
                    throw new Error(`LCD smart query failed: ${response.status} ${response.statusText}`);
                }
                lastError = new Error(`LCD smart query failed: ${response.status} ${response.statusText}`);
            }
            catch (error) {
                lastError = error;
                if (attempt === this.maxRetries || !isTransientFetchError(error))
                    throw error;
            }
            finally {
                clearTimeout(timeout);
            }
            await delay(100 * 2 ** attempt);
        }
        throw lastError instanceof Error ? lastError : new Error("LCD smart query failed");
    }
}
export class JunoRpcClient {
    rpcUrl;
    metrics;
    timeoutMs;
    maxRetries;
    constructor(rpcUrl, options = {}) {
        this.rpcUrl = rpcUrl;
        this.metrics = options.metrics;
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.maxRetries = options.maxRetries ?? 5;
    }
    async head() {
        const json = await this.get("/status");
        const latest = json.result.sync_info;
        return { height: Number(latest.latest_block_height), hash: String(latest.latest_block_hash) };
    }
    async block(height) {
        const [blockJson, resultsJson] = await Promise.all([
            this.get(`/block?height=${height}`),
            this.get(`/block_results?height=${height}`),
        ]);
        const block = blockJson.result.block;
        const header = block.header;
        const data = block.data;
        const results = resultsJson.result;
        const txsResults = (results.txs_results ?? []);
        const txs = (data.txs ?? []);
        const bundle = {
            height,
            hash: String(blockJson.result.block_id ? blockJson.result.block_id.hash : header.last_block_id ?? ""),
            parentHash: String(((header.last_block_id?.hash) ?? "")) || undefined,
            time: String(header.time),
            txCount: txs.length,
            txEvents: txsResults.map((tx, index) => ({
                txHash: String(tx.hash ?? txHashFromBase64(txs[index]) ?? `height-${height}-tx-${index}`),
                events: convertEvents((tx.events ?? [])),
            })),
        };
        this.metrics?.recordFetchBlock();
        return bundle;
    }
    async get(path) {
        let lastError;
        for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
            this.metrics?.beginRpcRequest();
            try {
                const response = await fetch(`${this.rpcUrl}${path}`, { signal: controller.signal });
                if (response.ok)
                    return await response.json();
                const error = new Error(`RPC ${path} failed: ${response.status} ${response.statusText}`);
                this.metrics?.recordRpcError(response.status);
                if (!isTransientStatus(response.status) || attempt === this.maxRetries)
                    throw error;
                lastError = error;
            }
            catch (error) {
                lastError = error;
                if (!(error instanceof Error && error.message.startsWith(`RPC ${path} failed:`)))
                    this.metrics?.recordRpcError("network");
                if (attempt === this.maxRetries || !isTransientFetchError(error))
                    throw error;
            }
            finally {
                clearTimeout(timeout);
                this.metrics?.endRpcRequest();
            }
            await delay(100 * 2 ** attempt);
        }
        throw lastError instanceof Error ? lastError : new Error(`RPC ${path} failed`);
    }
}
function isTransientStatus(status) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
}
function isTransientFetchError(error) {
    return error instanceof Error && (error.name === "AbortError" || error.name === "TypeError");
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function normalizePoolState(value) {
    if (!value || typeof value !== "object")
        throw new Error("LCD pool query returned non-object data");
    const raw = value;
    const assets = Array.isArray(raw.assets) ? raw.assets : [];
    const reserves = assets.map(normalizePoolAsset).filter((asset) => asset !== null);
    if (reserves.length === 0)
        throw new Error("LCD pool query returned no reserves");
    return { reserves, totalShare: raw.total_share === null || raw.total_share === undefined ? null : String(raw.total_share) };
}
function normalizePoolAsset(value) {
    if (!value || typeof value !== "object")
        return null;
    const raw = value;
    const denom = normalizeAssetInfo(raw.info ?? raw.asset_info ?? raw.denom ?? raw.asset);
    if (!denom || raw.amount === null || raw.amount === undefined)
        return null;
    return { denom, amount: String(raw.amount) };
}
function normalizeAssetInfo(value) {
    if (typeof value === "string")
        return value;
    if (!value || typeof value !== "object")
        return "";
    const raw = value;
    const native = raw.native_token;
    if (native && typeof native === "object")
        return String(native.denom ?? "");
    const token = raw.token;
    if (token && typeof token === "object")
        return String(token.contract_addr ?? "");
    return String(raw.denom ?? raw.asset ?? "");
}
function txHashFromBase64(tx) {
    if (!tx)
        return undefined;
    return createHash("sha256").update(Buffer.from(tx, "base64")).digest("hex").toUpperCase();
}
function convertEvents(events) {
    return events.map((event) => ({
        type: String(event.type),
        attributes: (event.attributes ?? []).map((attribute) => ({
            key: String(attribute.key),
            value: String(attribute.value),
            index: Boolean(attribute.index),
        })),
    }));
}
