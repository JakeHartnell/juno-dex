import registryJson from "../data/registry.juno-1.json";

export type RegistryAsset = {
  kind: "native" | "ibc" | "cw20";
  id: string;
  symbol: string;
  decimals: number;
  denomTrace?: string;
  logoURI?: string;
};

export type RegistryPool = {
  id: string;
  label: string;
  pair: string;
  lpToken: string;
  type: "xyk";
  feeBps: number;
  assets: [RegistryAsset, RegistryAsset];
  explorer: string;
  enabled: boolean;
  featured?: boolean;
  notes?: string;
};

export type DexRegistry = {
  chainId: "juno-1";
  chainName: string;
  rpcEndpoint: string;
  restEndpoint: string;
  explorerBaseUrl: string;
  factory: string;
  nativeCoinRegistry: string;
  router?: string;
  incentives?: string;
  oracle?: string;
  updatedAt: string;
  pools: RegistryPool[];
};

const PLACEHOLDER_PATTERN = /replace|placeholder|todo|example|changeme|xxx|000000000000/i;
const JUNO_ADDRESS_PATTERN = /^juno1[ac-hj-np-z02-9]{38,58}$/;

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(`${label} contains a placeholder value`);
  }
}

function assertJunoAddress(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  if (!JUNO_ADDRESS_PATTERN.test(value)) {
    throw new Error(`${label} must be a juno bech32 address`);
  }
}

function parseAsset(value: unknown, label: string): RegistryAsset {
  assertRecord(value, label);
  if (value.kind !== "native" && value.kind !== "ibc" && value.kind !== "cw20") {
    throw new Error(`${label}.kind must be native, ibc, or cw20`);
  }
  assertString(value.id, `${label}.id`);
  assertString(value.symbol, `${label}.symbol`);
  if (typeof value.decimals !== "number" || !Number.isInteger(value.decimals) || value.decimals < 0) {
    throw new Error(`${label}.decimals must be a non-negative integer`);
  }
  if (value.kind === "cw20") {
    assertJunoAddress(value.id, `${label}.id`);
  }
  if (typeof value.logoURI !== "undefined") assertString(value.logoURI, `${label}.logoURI`);
  if (typeof value.denomTrace !== "undefined") assertString(value.denomTrace, `${label}.denomTrace`);
  return value as RegistryAsset;
}

function parsePool(value: unknown, index: number): RegistryPool {
  const label = `pools[${index}]`;
  assertRecord(value, label);
  assertString(value.id, `${label}.id`);
  assertString(value.label, `${label}.label`);
  assertJunoAddress(value.pair, `${label}.pair`);
  assertString(value.lpToken, `${label}.lpToken`);
  if (value.type !== "xyk") throw new Error(`${label}.type must be xyk for v1`);
  if (typeof value.feeBps !== "number" || value.feeBps < 0 || value.feeBps > 10_000) {
    throw new Error(`${label}.feeBps must be between 0 and 10000`);
  }
  if (!Array.isArray(value.assets) || value.assets.length !== 2) {
    throw new Error(`${label}.assets must contain exactly two assets`);
  }
  assertString(value.explorer, `${label}.explorer`);
  if (!value.explorer.startsWith("https://")) throw new Error(`${label}.explorer must be https`);
  if (typeof value.enabled !== "boolean") throw new Error(`${label}.enabled must be boolean`);
  return {
    ...value,
    assets: [parseAsset(value.assets[0], `${label}.assets[0]`), parseAsset(value.assets[1], `${label}.assets[1]`)],
  } as RegistryPool;
}

export function parseDexRegistry(value: unknown): DexRegistry {
  assertRecord(value, "registry");
  if (value.chainId !== "juno-1") throw new Error("registry.chainId must be juno-1");
  assertString(value.chainName, "registry.chainName");
  assertString(value.rpcEndpoint, "registry.rpcEndpoint");
  assertString(value.restEndpoint, "registry.restEndpoint");
  assertString(value.explorerBaseUrl, "registry.explorerBaseUrl");
  assertJunoAddress(value.factory, "registry.factory");
  assertJunoAddress(value.nativeCoinRegistry, "registry.nativeCoinRegistry");
  if (value.router) assertJunoAddress(value.router, "registry.router");
  if (value.incentives) assertJunoAddress(value.incentives, "registry.incentives");
  if (value.oracle) assertJunoAddress(value.oracle, "registry.oracle");
  assertString(value.updatedAt, "registry.updatedAt");
  if (!Array.isArray(value.pools)) throw new Error("registry.pools must be an array");
  const pools = value.pools.map(parsePool);
  const ids = new Set<string>();
  for (const pool of pools) {
    if (ids.has(pool.id)) throw new Error(`duplicate pool id: ${pool.id}`);
    ids.add(pool.id);
  }
  return { ...value, pools } as DexRegistry;
}

export const dexRegistry = parseDexRegistry(registryJson);
export const enabledPools = dexRegistry.pools.filter((pool) => pool.enabled);
