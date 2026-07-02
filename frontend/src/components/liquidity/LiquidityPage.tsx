import { enabledPools } from "../../config/registry";
import { truncateAddress } from "../../lib/format/addresses";
import { useWallet } from "../../wallet/WalletContext";
import { EmptyState } from "../common";
import { WalletAddressActions } from "../wallet/WalletAddressActions";
import { LpPositionPanel } from "./LpPositionPanel";

export function LiquidityPage() {
  const { wallet } = useWallet();
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const walletCopy = wallet.status === "connected" && wallet.address
    ? `Connected wallet: ${wallet.name ?? truncateAddress(wallet.address)}. LP balances, shares, and underlying estimates refresh every 30 seconds and after successful add/remove transactions.`
    : "No wallet connected: connect to see LP balances, pool share, and underlying token estimates.";

  return (
    <section className="panel-page">
      <p className="eyebrow">Portfolio</p>
      <h2>Wallet LP overview</h2>
      <p>V1 does not assume an indexer, so this page checks the strict registry pools, each verified LP denom, and live pair reserves to estimate your position.</p>
      {walletAddress ? <div className="contract-strip"><span>Wallet</span><WalletAddressActions address={walletAddress} /></div> : null}
      <EmptyState title={walletAddress ? "LP position estimates" : "LP positions unavailable"}>{walletCopy}</EmptyState>
      <div className="lp-position-list">
        {enabledPools.map((pool) => <LpPositionPanel pool={pool} key={pool.id} />)}
      </div>
    </section>
  );
}
