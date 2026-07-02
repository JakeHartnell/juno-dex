import type { RegistryPool } from "../../config/registry";

export type PoolType = RegistryPool["type"];

export type PoolTypeMetadata = {
  label: string;
  shortLabel: string;
  badgeClass: "status-ok" | "status-warn" | "status-danger";
  description: string;
  swapCopy: string;
  feeCopy: string;
  provideCopy: string;
  withdrawCopy: string;
  detailCopy: string;
  createCopy: string;
  supportsSwapSimulation: boolean;
  supportsExactOutSimulation: boolean;
  supportsLocalPriceImpact: boolean;
  supportsProvideLiquidity: boolean;
  supportsProvideSimulation: boolean;
  supportsWithdrawSimulation: boolean;
};

const POOL_TYPE_METADATA: Record<PoolType, PoolTypeMetadata> = {
  xyk: {
    label: "XYK constant product",
    shortLabel: "XYK",
    badgeClass: "status-ok",
    description: "Standard Astroport x*y=k pair for volatile assets.",
    swapCopy: "Direct pair simulation returns contract pricing, spread, and fee for this XYK pool.",
    feeCopy: "Constant-product fee tier",
    provideCopy: "Two-sided deposits are balanced to the live XYK reserve ratio. Single-sided add liquidity is not enabled.",
    withdrawCopy: "Withdraw estimates burn LP shares for the two pool assets proportionally.",
    detailCopy: "Volatile-pair pricing uses the constant product invariant; local provide estimates are enabled for proportional two-sided deposits.",
    createCopy: "XYK creation will use the factory xyk pair type once create transactions are enabled.",
    supportsSwapSimulation: true,
    supportsExactOutSimulation: true,
    supportsLocalPriceImpact: true,
    supportsProvideLiquidity: true,
    supportsProvideSimulation: true,
    supportsWithdrawSimulation: true,
  },
  stable: {
    label: "Stableswap",
    shortLabel: "Stable",
    badgeClass: "status-warn",
    description: "Stable invariant pair for closely-pegged assets.",
    swapCopy: "Swaps use on-chain stable pair simulation. The UI does not reimplement the stable invariant locally.",
    feeCopy: "Stable fee tier",
    provideCopy: "Stable provide math depends on amplification and pool parameters. The UI does not simulate stable deposits yet, so add liquidity is disabled here.",
    withdrawCopy: "Withdrawal output is shown as a proportional LP estimate only; confirm final assets in the wallet before signing.",
    detailCopy: "Stable pool parameters are contract-defined. Treat local price impact and liquidity estimates as caveated unless returned directly by pair/router simulation.",
    createCopy: "Stable creation needs amplification and stable-pair params; the transaction builder is not exposed yet.",
    supportsSwapSimulation: true,
    supportsExactOutSimulation: true,
    supportsLocalPriceImpact: false,
    supportsProvideLiquidity: false,
    supportsProvideSimulation: false,
    supportsWithdrawSimulation: false,
  },
  concentrated: {
    label: "PCL concentrated liquidity",
    shortLabel: "PCL",
    badgeClass: "status-warn",
    description: "Passive concentrated liquidity pair with PCL-specific parameters.",
    swapCopy: "Swaps use on-chain PCL pair simulation. The UI does not reimplement PCL math locally.",
    feeCopy: "PCL fee tier",
    provideCopy: "PCL provide rules depend on concentration parameters and live contract math. Add liquidity is disabled until PCL provide simulation is wired.",
    withdrawCopy: "Withdrawal output is shown as a proportional LP estimate only; confirm final assets in the wallet before signing.",
    detailCopy: "PCL pools have concentration parameters not modeled locally. Use contract quotes and verify slippage carefully.",
    createCopy: "PCL creation needs concentration parameters; the transaction builder is not exposed yet.",
    supportsSwapSimulation: true,
    supportsExactOutSimulation: true,
    supportsLocalPriceImpact: false,
    supportsProvideLiquidity: false,
    supportsProvideSimulation: false,
    supportsWithdrawSimulation: false,
  },
};

export function getPoolTypeMetadata(type: PoolType): PoolTypeMetadata {
  return POOL_TYPE_METADATA[type];
}

export function getPoolTypeLabel(type: PoolType): string {
  return getPoolTypeMetadata(type).shortLabel;
}

export function hasCaveatedLocalMath(pool: RegistryPool): boolean {
  const metadata = getPoolTypeMetadata(pool.type);
  return !metadata.supportsLocalPriceImpact || !metadata.supportsProvideSimulation || !metadata.supportsWithdrawSimulation;
}
