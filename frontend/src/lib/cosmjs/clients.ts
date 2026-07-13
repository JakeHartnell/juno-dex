import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { Coin } from "@cosmjs/stargate";
import type { ExecuteResult } from "@cosmjs/cosmwasm-stargate/build/signingcosmwasmclient.js";
import type { StargateClient as ReadonlyStargateClient } from "@cosmjs/stargate/build/stargateclient.js";
import { dexRegistry } from "../../config/registry";
import type { CosmWasmClient as ReadonlyCosmWasmClient } from "@cosmjs/cosmwasm-stargate/build/cosmwasmclient.js";

type SigningCosmWasmClientModule = typeof import("@cosmjs/cosmwasm-stargate/build/signingcosmwasmclient.js");
type StargateClientModule = typeof import("@cosmjs/stargate/build/stargateclient.js");
type StargateFeeModule = typeof import("@cosmjs/stargate/build/fee.js");
type CosmWasmClientModule = typeof import("@cosmjs/cosmwasm-stargate/build/cosmwasmclient.js");

export type ExecuteClient = {
  execute: (
    senderAddress: string,
    contractAddress: string,
    msg: Record<string, unknown>,
    fee: "auto" | number,
    memo?: string,
    funds?: Coin[],
  ) => Promise<ExecuteResult>;
};

export type SigningClientGetter = () => Promise<ExecuteClient>;
export type SigningClientSource = OfflineSigner | SigningClientGetter | undefined;

let readonlyStargateClientPromise: Promise<ReadonlyStargateClient> | undefined;
let readonlyCosmWasmClientPromise: Promise<ReadonlyCosmWasmClient> | undefined;

function cjsExport<T>(module: unknown, key: string): T | undefined {
  if (!module || typeof module !== "object") return undefined;
  const namespace = module as Record<string, unknown>;
  const defaultExport = namespace.default && typeof namespace.default === "object"
    ? namespace.default as Record<string, unknown>
    : undefined;
  return (namespace[key] ?? defaultExport?.[key]) as T | undefined;
}

async function loadReadonlyStargateClient() {
  const module = await import("@cosmjs/stargate/build/stargateclient.js");
  return cjsExport<StargateClientModule["StargateClient"]>(module, "StargateClient");
}

async function loadSigningDependencies() {
  const [signingModule, feeModule] = await Promise.all([
    import("@cosmjs/cosmwasm-stargate/build/signingcosmwasmclient.js"),
    import("@cosmjs/stargate/build/fee.js"),
  ]);
  return {
    SigningCosmWasmClient: cjsExport<SigningCosmWasmClientModule["SigningCosmWasmClient"]>(signingModule, "SigningCosmWasmClient"),
    GasPrice: cjsExport<StargateFeeModule["GasPrice"]>(feeModule, "GasPrice"),
  };
}

export async function getReadonlyStargateClient() {
  const StargateClient = await loadReadonlyStargateClient();
  if (!StargateClient?.connect) {
    throw new Error("CosmJS readonly client failed to initialize");
  }
  readonlyStargateClientPromise ??= StargateClient.connect(dexRegistry.rpcEndpoint);
  return readonlyStargateClientPromise;
}

export async function getReadonlyCosmWasmClient() {
  const module = await import("@cosmjs/cosmwasm-stargate/build/cosmwasmclient.js");
  const CosmWasmClient = cjsExport<CosmWasmClientModule["CosmWasmClient"]>(module, "CosmWasmClient");
  if (!CosmWasmClient?.connect) throw new Error("CosmJS query client failed to initialize");
  readonlyCosmWasmClientPromise ??= CosmWasmClient.connect(dexRegistry.rpcEndpoint);
  return readonlyCosmWasmClientPromise;
}

export async function getSigningClient(signer: OfflineSigner) {
  const { SigningCosmWasmClient, GasPrice } = await loadSigningDependencies();
  if (!SigningCosmWasmClient?.connectWithSigner || !GasPrice?.fromString) {
    throw new Error("CosmJS signing client failed to initialize");
  }

  return SigningCosmWasmClient.connectWithSigner(dexRegistry.rpcEndpoint, signer, {
    gasPrice: GasPrice.fromString("0.075ujuno"),
  });
}

export async function resolveSigningClient(source: SigningClientSource): Promise<ExecuteClient | undefined> {
  if (!source) return undefined;
  if (typeof source === "function") return source();
  return getSigningClient(source);
}
