import type { RegistryPool } from "../../config/registry";
import { getWalletBalanceAmount, resolveDenom, useWalletBalances } from "../../queries/useWalletBalances";
import { useWallet } from "../../wallet/WalletContext";
import { TokenAmountInput } from "../common";

export function RemoveLiquidityForm({ pool }: { pool: RegistryPool }) {
  const { wallet } = useWallet();
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, [pool]);
  const lp = resolveDenom(pool.lpToken, [pool]);

  return (
    <section className="action-card">
      <h3>Remove liquidity</h3>
      <p>Uses TokenFactory LP denom funds when wallet execution is enabled.</p>
      <TokenAmountInput
        label="LP amount"
        value=""
        decimals={lp.decimals}
        symbol={lp.symbol}
        balanceBaseAmount={getWalletBalanceAmount(balances.data, pool.lpToken)}
        onChange={() => undefined}
        disabled
      />
      <div className="quick-fill-row" aria-label="LP withdrawal percentages">
        {[25, 50, 75, 100].map((percent) => <button type="button" disabled key={percent}>{percent}%</button>)}
      </div>
      <code>{pool.lpToken}</code>
      <button type="button" disabled>Preview withdraw</button>
    </section>
  );
}
