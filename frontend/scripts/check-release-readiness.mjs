import { readFile } from "node:fs/promises";

const registryPath = new URL("../src/data/registry.juno-1.json", import.meta.url);
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const failures = [];

const requiredHttps = ["rpcEndpoint", "restEndpoint", "explorerBaseUrl"];
for (const field of requiredHttps) {
  if (typeof registry[field] !== "string" || !registry[field].startsWith("https://")) {
    failures.push(`${field} must be an HTTPS production endpoint`);
  }
}

const pools = Array.isArray(registry.pools) ? registry.pools : [];
const launchMarkets = pools.filter((pool) => pool.enabled === true && pool.status === "active");
if (launchMarkets.length === 0) {
  failures.push("at least one explicitly active launch market is required");
}

for (const pool of pools) {
  if (pool.featured === true && (pool.enabled !== true || pool.status !== "active" || pool.verified !== true)) {
    failures.push(`${pool.id}: featured markets must be enabled, active, and explicitly verified`);
  }
  if (pool.status === "active") {
    if (pool.verified !== true) failures.push(`${pool.id}: active launch markets must be explicitly verified`);
    if (!Array.isArray(pool.assets) || pool.assets.some((asset) => asset.verified !== true || asset.blocked === true)) {
      failures.push(`${pool.id}: active launch-market assets must be explicitly verified and unblocked`);
    }
  }
}

if (failures.length > 0) {
  console.error("JUNO DEX release readiness: BLOCKED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`JUNO DEX release readiness: registry checks passed (${launchMarkets.length} active market${launchMarkets.length === 1 ? "" : "s"})`);
}
