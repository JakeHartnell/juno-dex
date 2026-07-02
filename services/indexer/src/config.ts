export const DEFAULT_CONTRACTS = {
  factory: "juno1n5ettlqdt06nd346mnqy65fahcvmncaazpwn8s3m0df3ldv0d2yqjqelca",
  router: "juno1fppwfa2efpsahvwlqprrshjth2mfqyd8n80yd7z5kpjspq30s8ksrapa8s",
  incentives: "juno1h0auy2knfyhkcn877cqun0fu00safgsjwvt82d4cvd0slv8q7wtsk59598",
  oracle: "juno1szsxu32r7rnu5wq7yqlxq4x46g0fq7qpzyggcvgsh2cq554mcuqql6jw4p",
  nativeCoinRegistry: "juno1qwer7jleluth33trk2ywqvp6vwjh4j4zar3ag6dw5d8derkpel0sq8vfh2",
} as const;

export type IndexerConfig = {
  databaseUrl: string;
  rpcUrl: string;
  restUrl: string;
  wsUrl: string;
  chainId: string;
  factoryAddress: string;
  routerAddress: string;
  incentivesAddress: string;
  oracleAddress: string;
  nativeCoinRegistryAddress: string;
  startHeight: number;
  confirmationDepth: number;
  pollIntervalMs: number;
  batchSize: number;
  dryRun: boolean;
  cursorId: string;
};

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function intEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

function boolEnv(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function deriveWsUrl(rpcUrl: string): string {
  const url = new URL(rpcUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/websocket";
  return url.toString();
}

export function loadConfig(): IndexerConfig {
  const rpcUrl = env("JUNO_RPC_URL", "https://rpc-juno.itastakers.com").replace(/\/$/, "");
  return {
    databaseUrl: env("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/astroport_indexer"),
    rpcUrl,
    restUrl: env("JUNO_REST_URL", "https://lcd-juno.itastakers.com").replace(/\/$/, ""),
    wsUrl: env("JUNO_WS_URL", deriveWsUrl(rpcUrl)),
    chainId: env("CHAIN_ID", "juno-1"),
    factoryAddress: env("FACTORY_ADDRESS", DEFAULT_CONTRACTS.factory),
    routerAddress: env("ROUTER_ADDRESS", DEFAULT_CONTRACTS.router),
    incentivesAddress: env("INCENTIVES_ADDRESS", DEFAULT_CONTRACTS.incentives),
    oracleAddress: env("ORACLE_ADDRESS", DEFAULT_CONTRACTS.oracle),
    nativeCoinRegistryAddress: env("NATIVE_COIN_REGISTRY_ADDRESS", DEFAULT_CONTRACTS.nativeCoinRegistry),
    startHeight: intEnv("START_HEIGHT", 1),
    confirmationDepth: intEnv("CONFIRMATION_DEPTH", 2),
    pollIntervalMs: intEnv("POLL_INTERVAL_MS", 5_000),
    batchSize: Math.max(1, intEnv("BATCH_SIZE", 20)),
    dryRun: boolEnv("DRY_RUN"),
    cursorId: env("CURSOR_ID", "astroport-juno-v1"),
  };
}
