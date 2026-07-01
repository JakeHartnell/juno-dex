import type { OfflineSigner } from "@cosmjs/proto-signing";
import { dexRegistry } from "../../config/registry";

export async function getSigningClient(signer: OfflineSigner) {
  const [{ SigningCosmWasmClient }, { GasPrice }] = await Promise.all([
    import("@cosmjs/cosmwasm-stargate"),
    import("@cosmjs/stargate"),
  ]);
  return SigningCosmWasmClient.connectWithSigner(dexRegistry.rpcEndpoint, signer, {
    gasPrice: GasPrice.fromString("0.075ujuno"),
  });
}
