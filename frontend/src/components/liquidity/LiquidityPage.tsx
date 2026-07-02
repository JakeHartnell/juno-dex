import { truncateAddress } from "../../lib/format/addresses";
import { dataSourceLabel } from "../../lib/data-access/indexerFallback";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { useWalletIndexerData } from "../../queries/usePools";
import { useWallet } from "../../wallet/WalletContext";
import { EmptyState } from "../common";
import { WalletAddressActions } from "../wallet/WalletAddressActions";
import { LpPositionPanel } from "./LpPositionPanel";

export function LiquidityPage() {
  const { wallet } = useWallet();
  const { pools, discovery } = useDexRegistry();
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const indexerData = useWalletIndexerData(walletAddress);
  const walletCopy = wallet.status === "connected" && wallet.address
    ? `Connected wallet: ${wallet.name ?? truncateAddress(wallet.address)}. LP balances, shares, and underlying estimates refresh every 30 seconds and after successful add/remove transactions.`
    : "No wallet connected: connect to see LP balances, pool share, and underlying token estimates.";

  return (
    <section className="panel-page">
      <p className="eyebrow">Portfolio</p>
      <h2>Wallet LP overview</h2>
      <p>V1 prefers wallet position/history from the indexer when available, then falls back to factory-discovered pools, curated registry metadata, verified LP denoms, wallet balances, and live pair reserves.</p>
      {discovery.isError ? <p className="error-text">Factory discovery failed; showing curated registry fallback only.</p> : null}
      {walletAddress ? <p className="pool-metrics-copy">Portfolio data source: {dataSourceLabel(indexerData.access)}. {indexerData.access?.error ? `Indexer portfolio data unavailable (${indexerData.access.error.message}); reserve-based LP estimates remain available.` : `${indexerData.data.positions.length} indexed positions and ${indexerData.data.history.length} recent indexed transactions loaded.`}</p> : null}
      {walletAddress ? <div className="contract-strip"><span>Wallet</span><WalletAddressActions address={walletAddress} /></div> : null}
      <EmptyState title={walletAddress ? "LP position estimates" : "LP positions unavailable"}>{walletCopy}</EmptyState>
      <div className="lp-position-list">
        {pools.map((pool) => <LpPositionPanel pool={pool} key={pool.id} />)}
      </div>
    </section>
  );
}
