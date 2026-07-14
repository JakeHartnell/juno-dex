import { truncateAddress } from "../../lib/format/addresses";

import { useDexRegistry } from "../../queries/useDexRegistry";
import { useWalletIndexerData } from "../../queries/usePools";
import { useWallet } from "../../wallet/WalletContext";
import { EmptyState, OptionalDataState, Skeleton } from "../common";
import { WalletAddressActions } from "../wallet/WalletAddressActions";
import { WalletTransactionHistory } from "../wallet/WalletTransactionHistory";
import { LpPositionPanel } from "./LpPositionPanel";

export function LiquidityPage() {
  const { wallet } = useWallet();
  const { registry, pools, discovery } = useDexRegistry();
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const indexerData = useWalletIndexerData(walletAddress);
  const walletCopy = wallet.status === "connected" && wallet.address
    ? `Connected wallet: ${wallet.name ?? truncateAddress(wallet.address)}. LP balances, shares, and underlying estimates refresh every 30 seconds and after successful add/remove transactions.`
    : "No wallet connected: connect to see LP balances, pool share, and underlying token estimates.";

  return (
    <section className="panel-page liquidity-page">
      <p className="eyebrow">Liquidity · Positions</p>
      <h2>Wallet LP overview</h2>
      <p>See the pools this wallet has joined, the tokens represented by each position, and recent liquidity activity.</p>
      {discovery.isError ? <OptionalDataState title="Some pools may be missing" onRetry={() => void discovery.refetch()}>Known positions remain available. Try again before concluding that a newer position is absent.</OptionalDataState> : null}
      {discovery.isFetching ? <div className="lp-position-skeleton" role="status" aria-label="Refreshing liquidity pools"><Skeleton width="13rem" /><Skeleton width="20rem" /></div> : null}
      {walletAddress ? <p className="pool-metrics-copy">Manage LP positions and recent activity for the connected wallet.</p> : null}
      {walletAddress && indexerData.access?.error ? <OptionalDataState title="Recent liquidity activity is unavailable" onRetry={() => void indexerData.refetch()}>Current positions remain available.</OptionalDataState> : null}
      {walletAddress ? <div className="contract-strip"><span>Wallet</span><WalletAddressActions address={walletAddress} /></div> : null}
      {!walletAddress ? <EmptyState title="LP positions unavailable">{walletCopy}</EmptyState> : null}
      {walletAddress && !indexerData.isLoading && !indexerData.access?.error && indexerData.data.positions.length === 0 ? <EmptyState title="No saved positions found">Balances for each available pool are still checked below.</EmptyState> : null}
      {pools.length === 0 ? <EmptyState title="No pools available">Pool information could not be loaded. Try again later.</EmptyState> : <div className="lp-position-list">{pools.map((pool) => <LpPositionPanel pool={pool} key={pool.id} />)}</div>}
      <WalletTransactionHistory
        history={indexerData.data.history}
        access={indexerData.access}
        explorerBaseUrl={registry.explorerBaseUrl}
        walletConnected={Boolean(walletAddress)}
        isLoading={indexerData.isLoading}
      />
    </section>
  );
}
