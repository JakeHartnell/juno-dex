import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
const args = new Map();
for (const arg of process.argv.slice(2)) {
    const [key, value = ""] = arg.replace(/^--/, "").split("=");
    if (key)
        args.set(key, value);
}
function isRegistryAsset(value) {
    return typeof value === "object" && value !== null;
}
function collectAssets(registry) {
    const assets = new Map();
    const pools = Array.isArray(registry.pools) ? registry.pools : [];
    for (const pool of pools) {
        const poolAssets = Array.isArray(pool.assets) ? pool.assets : [];
        for (const asset of poolAssets) {
            if (!isRegistryAsset(asset) || typeof asset.id !== "string")
                continue;
            if (!Number.isInteger(asset.decimals) || Number(asset.decimals) < 0 || Number(asset.decimals) > 36)
                continue;
            assets.set(asset.id, {
                symbol: typeof asset.symbol === "string" ? asset.symbol : null,
                decimals: Number(asset.decimals),
                logoUri: typeof asset.logoURI === "string" ? asset.logoURI : null,
                verified: asset.verified === true,
            });
        }
    }
    return assets;
}
const config = loadConfig();
const registryPath = resolve(args.get("registry") ?? "../../frontend/src/data/registry.juno-1.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const chainId = args.get("chain-id") ?? (typeof registry.chainId === "string" ? registry.chainId : config.chainId);
const assets = collectAssets(registry);
const pool = createPool(config);
const client = await pool.connect();
try {
    let upserted = 0;
    for (const [asset, metadata] of assets) {
        const result = await client.query(`INSERT INTO asset_metadata(chain_id, asset, symbol, decimals, logo_uri, verified, source)
       VALUES ($1,$2,$3,$4,$5,$6,'registry')
       ON CONFLICT (chain_id, asset) DO UPDATE
       SET symbol = EXCLUDED.symbol,
           decimals = EXCLUDED.decimals,
           logo_uri = EXCLUDED.logo_uri,
           verified = EXCLUDED.verified,
           source = EXCLUDED.source,
           updated_at = now()`, [chainId, asset, metadata.symbol, metadata.decimals, metadata.logoUri, metadata.verified]);
        upserted += result.rowCount ?? 0;
    }
    console.log(`asset_metadata_seeded chain_id=${chainId} assets=${assets.size} rows=${upserted} registry=${registryPath}`);
}
finally {
    client.release();
    await pool.end();
}
