import { Link } from "react-router-dom";
import { enabledPools } from "../../config/registry";
import { truncateAddress } from "../../lib/format/addresses";
import { useWallet } from "../../wallet/WalletContext";
import { EmptyState } from "../common";

export function LiquidityPage() {
  const { wallet } = useWallet();
  const walletCopy = wallet.status === "connected" && wallet.address
    ? `Connected wallet: ${wallet.name ?? truncateAddress(wallet.address)} · LP balances are unknown until queried from verified pool denoms.`
    : "No wallet connected: LP balances are unknown, not empty.";

  return (
    <section className="panel-page">
      <p className="eyebrow">Liquidity</p>
      <h2>Wallet LP overview</h2>
      <p>V1 does not assume an indexer, so this page does not pretend unknown positions are zero. Connected wallet support can query known LP denoms from the strict registry; until then, choose a verified pool to inspect reserves and add/remove flows.</p>
      <EmptyState title="LP balances unavailable">{walletCopy}</EmptyState>
      <div className="pool-table">
        {enabledPools.map((pool) => <Link className="liquidity-row" to={`/pools/${pool.pair}`} key={pool.id}><strong>{pool.label}</strong><span>{pool.assets.map((asset) => asset.symbol).join(" / ")}</span><code>{pool.lpToken}</code></Link>)}
      </div>
    </section>
  );
}
