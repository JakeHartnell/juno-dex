#!/usr/bin/env node

const SOURCE_URL = "https://raw.githubusercontent.com/cosmos/chain-registry/master/juno/assetlist.json";
const OUT_PATH = new URL("../src/data/chain-registry-assets.juno-1.json", import.meta.url);

function logoURI(asset) {
  return asset.logo_URIs?.svg ?? asset.logo_URIs?.png ?? asset.images?.find((image) => image.svg)?.svg ?? asset.images?.find((image) => image.png)?.png;
}

function decimals(asset) {
  const display = asset.display;
  const unit = asset.denom_units?.find((candidate) => candidate.denom === display) ?? asset.denom_units?.find((candidate) => candidate.exponent > 0);
  return Number.isInteger(unit?.exponent) ? unit.exponent : 6;
}

function traceMetadata(asset) {
  const trace = asset.traces?.find((candidate) => candidate.type === "ibc") ?? asset.traces?.[0];
  if (!trace) return undefined;
  return {
    path: trace.chain?.path,
    channelId: trace.chain?.channel_id,
    counterpartyChainName: trace.counterparty?.chain_name,
    counterpartyBaseDenom: trace.counterparty?.base_denom,
    counterpartyChannelId: trace.counterparty?.channel_id,
  };
}

function normalize(asset) {
  const rawDenom = asset.base;
  if (typeof rawDenom !== "string" || rawDenom.length === 0) return undefined;
  const isCw20 = rawDenom.startsWith("cw20:");
  const denom = isCw20 ? rawDenom.slice("cw20:".length) : rawDenom;
  const trace = traceMetadata(asset);
  return {
    denom,
    aliases: isCw20 ? [rawDenom] : undefined,
    kind: isCw20 ? "cw20" : denom.startsWith("ibc/") ? "ibc" : denom.startsWith("factory/") ? "factory" : "native",
    symbol: asset.symbol,
    name: asset.name,
    display: asset.display,
    decimals: decimals(asset),
    logoURI: logoURI(asset),
    coingeckoId: asset.coingecko_id,
    denomTrace: trace?.path,
    trace,
  };
}

const response = await fetch(SOURCE_URL, { headers: { "user-agent": "astroport-core-juno-asset-updater" } });
if (!response.ok) throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status} ${response.statusText}`);
const source = await response.json();
const assets = source.assets.map(normalize).filter(Boolean).sort((a, b) => a.denom.localeCompare(b.denom));
const payload = {
  $schema: "./chain-registry-assets.schema.json",
  chainId: "juno-1",
  source: SOURCE_URL,
  generatedAt: new Date().toISOString(),
  assets,
};
await import("node:fs/promises").then((fs) => fs.writeFile(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`));
console.log(`Wrote ${assets.length} Juno chain-registry assets to ${OUT_PATH.pathname}`);
