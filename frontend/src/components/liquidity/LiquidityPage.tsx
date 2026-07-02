import { Link } from "react-router-dom";
import { enabledPools } from "../../config/registry";
import { formatAmount } from "../../lib/format/amounts";
import { truncateAddress } from "../../lib/format/addresses";
import { getWalletBalanceAmount, resolveDenom, useWalletBalances } from "../../queries/useWalletBalances";
import { useWallet } from "../../wallet/WalletContext";
import { EmptyState } from "../common";
import { WalletAddressActions } from "../wallet/WalletAddressActions";

export function LiquidityPage() {
  const { wallet } = useWallet();
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress);
  const walletCopy = wallet.status === "connected" && wallet.address
    ? `Connected wallet: ${wallet.name ?? truncateAddress(wallet.address)}. Known LP balances refresh every 30 seconds and after successful transactions.`
    : "No wallet connected: LP balances are unknown, not empty.";

  return (
    <section className="panel-page">
      <p className="eyebrow">Liquidity</p>
      <h2>Wallet LP overview</h2>
      <p>V1 does not assume an indexer, so this page only checks native/IBC/TokenFactory balances for denoms listed in the strict registry and each verified LP denom.</p>
      {walletAddress ? <div className="contract-strip"><span>Wallet</span><WalletAddressActions address={walletAddress} /></div> : null}
      <EmptyState title={walletAddress ? "Known LP balances" : "LP balances unavailable"}>{walletCopy}</EmptyState>
      <div className="pool-table">
        {enabledPools.map((pool) => {
          const lp = resolveDenom(pool.lpToken, [pool]);
          const lpAmount = getWalletBalanceAmount(balances.data, pool.lpToken);
          return (
            <Link className="liquidity-row" to={`/pools/${pool.pair}`} key={pool.id}>
              <strong>{pool.label}</strong>
              <span>{pool.assets.map((asset) => asset.symbol).join(" / ")}</span>
              <span>LP balance: {typeof lpAmount === "string" ? `${formatAmount(lpAmount, lp.decimals)} ${lp.symbol}` : "—"}</span>
              <code>{pool.lpToken}</code>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
