import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { StargateClient } from "@cosmjs/stargate";
import { dexRegistry } from "../../config/registry";

let readonlyStargateClientPromise: Promise<StargateClient> | undefined;

export function getReadonlyStargateClient() {
  readonlyStargateClientPromise ??= import("@cosmjs/stargate").then(({ StargateClient }) => StargateClient.connect(dexRegistry.rpcEndpoint));
  return readonlyStargateClientPromise;
}

export async function getSigningClient(signer: OfflineSigner) {
  const [{ SigningCosmWasmClient }, { GasPrice }] = await Promise.all([
    import("@cosmjs/cosmwasm-stargate"),
    import("@cosmjs/stargate"),
  ]);
  return SigningCosmWasmClient.connectWithSigner(dexRegistry.rpcEndpoint, signer, {
    gasPrice: GasPrice.fromString("0.075ujuno"),
  });
}
