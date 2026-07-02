import type { RegistryPool } from "../../config/registry";
import { getWalletBalanceAmount, useWalletBalances } from "../../queries/useWalletBalances";
import { useWallet } from "../../wallet/WalletContext";
import { TokenAmountInput } from "../common";

export function AddLiquidityForm({ pool }: { pool: RegistryPool }) {
  const { wallet } = useWallet();
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, [pool]);

  return (
    <section className="action-card">
      <h3>Add liquidity</h3>
      <p>Broadcast hook is scaffolded for direct `provide_liquidity`; enable after smoke wallet testing.</p>
      {pool.assets.map((asset) => (
        <TokenAmountInput
          key={asset.id}
          label={asset.symbol}
          value=""
          decimals={asset.decimals}
          symbol={asset.symbol}
          balanceBaseAmount={getWalletBalanceAmount(balances.data, asset.id)}
          onChange={() => undefined}
          disabled
        />
      ))}
      <button type="button" disabled>Preview add liquidity</button>
    </section>
  );
}
