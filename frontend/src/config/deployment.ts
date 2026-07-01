import { dexRegistry } from "./registry";

export const junoDeployment = {
  chainId: dexRegistry.chainId,
  rpcEndpoint: dexRegistry.rpcEndpoint,
  restEndpoint: dexRegistry.restEndpoint,
  explorerBaseUrl: dexRegistry.explorerBaseUrl,
  contracts: {
    factory: dexRegistry.factory,
    nativeCoinRegistry: dexRegistry.nativeCoinRegistry,
    router: dexRegistry.router,
    incentives: dexRegistry.incentives,
    oracle: dexRegistry.oracle,
  },
} as const;
