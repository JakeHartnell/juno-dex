import { Link, useParams } from "react-router-dom";
import type { RegistryAsset, RegistryPool } from "../../config/registry";
import type { PoolResponse } from "../../lib/astroport/queries";
import { dataSourceLabel } from "../../lib/data-access/indexerFallback";
import { formatAmount } from "../../lib/format/amounts";
import { getPoolTotalApr } from "../../lib/pools/poolList";
import type { PoolMetrics } from "../../lib/pools/poolList";
import { getPoolTypeMetadata } from "../../lib/pools/poolTypes";
import { assessPoolRisk } from "../../lib/risk";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { usePoolMetrics, usePoolReserves, useWalletIndexerData } from "../../queries/usePools";
import { useWallet } from "../../wallet/WalletContext";
import { ExplorerLink, RiskBadgeList, TokenLogo } from "../common";
import { AddLiquidityForm } from "../liquidity/AddLiquidityForm";
import { LpPositionPanel } from "../liquidity/LpPositionPanel";
import { RemoveLiquidityForm } from "../liquidity/RemoveLiquidityForm";
import { WalletTransactionHistory } from "../wallet/WalletTransactionHistory";

export function PoolDetailPage() {
  const { pairAddress } = useParams();
  const { registry, pools, discovery } = useDexRegistry();
  const { wallet } = useWallet();
  const pool = pools.find((candidate) => candidate.pair === pairAddress);
  const poolMetrics = usePoolMetrics(pool ? [pool] : []);
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const walletIndexerData = useWalletIndexerData(walletAddress);
  const reserves = usePoolReserves(pool);
  const risk = pool ? assessPoolRisk(pool, reserves.data) : undefined;
  const metrics = pool ? poolMetrics.data?.[pool.pair] : undefined;
  const poolType = pool ? getPoolTypeMetadata(pool.type) : undefined;

  if (!pool) {
    return <section className="panel-page"><h2>Pool not found</h2><p className="empty-state">This pair was not found in factory discovery or the curated Juno registry.{discovery.isError ? " Factory discovery is currently degraded." : ""}</p><Link to="/pools">Back to pools</Link></section>;
  }

  const pairExplorer = pool.explorer || `${registry.explorerBaseUrl}/wasm/contract/${pool.pair}`;
  const lpExplorer = `${registry.explorerBaseUrl}/assets/${encodeURIComponent(pool.lpToken)}`;
  const poolStatus = reserves.isFetching ? "Refreshing" : reserves.data ? "Live reserves" : "Reserve query unavailable";

  return (
    <section className="panel-page pool-detail-page">
      <div className="pool-detail-header">
        <div>
          <p className="eyebrow">Pool detail</p>
          <h2>{pool.label}</h2>
          <p className="risk-copy">{pool.assets.map((asset) => asset.symbol).join(" / ")} analytics use live pair contract reserves plus indexer metrics when configured. Verify every denom and pair address before providing or removing liquidity. {poolType?.detailCopy}</p>
          {risk ? <RiskBadgeList assessment={risk} max={6} /> : null}
        </div>
        <div className="pool-actions pool-detail-actions" aria-label="Pool actions">
          <Link to="/swap">Swap</Link>
          <a href="#add-liquidity">Add liquidity</a>
          <a href="#remove-liquidity">Remove liquidity</a>
        </div>
      </div>

      <div className="contract-strip"><span>Pair</span><code>{pool.pair}</code><button type="button" onClick={() => navigator.clipboard?.writeText(pool.pair)}>Copy</button><ExplorerLink href={pairExplorer}>Mintscan</ExplorerLink></div>
      <div className="contract-strip"><span>LP denom</span><code>{pool.lpToken}</code><button type="button" onClick={() => navigator.clipboard?.writeText(pool.lpToken)}>Copy</button><ExplorerLink href={lpExplorer}>Mintscan asset</ExplorerLink></div>
      {reserves.isError ? <p className="error-text">Live reserve query failed: {reserves.error instanceof Error ? reserves.error.message : String(reserves.error)}</p> : null}
      {poolMetrics.access?.error ? <p className="error-text">Indexer metrics unavailable ({poolMetrics.access.error.message}); TVL, 24h volume, APR, charts, and recent transactions are shown as honest placeholders rather than estimates.</p> : null}

      <div className="metrics-grid" aria-label="Pool analytics cards">
        <MetricCard label="TVL" value={formatUsd(metrics?.tvlUsd) ?? "Metrics unavailable"} hint={metrics?.tvlUsd ? dataSourceLabel(poolMetrics.access) : `${dataSourceLabel(poolMetrics.access)} · requires pricing`} />
        <MetricCard label="24h volume" value={formatUsd(metrics?.volume24hUsd) ?? "Metrics unavailable"} hint={metrics?.volume24hUsd ? dataSourceLabel(poolMetrics.access) : `${dataSourceLabel(poolMetrics.access)} · requires indexer volume feed`} />
        <MetricCard label="APR" value={formatApr(getPoolTotalApr(metrics)) ?? "Metrics unavailable"} hint={metrics ? aprHint(metrics) : "Requires fee and incentives indexing"} />
        <MetricCard label="Pool type" value={poolType?.label ?? pool.type.toUpperCase()} hint={`${pool.feeBps} bps fee tier · ${poolType?.feeCopy ?? "pool fee"}`} />
        <MetricCard label="Total share" value={reserves.data ? formatAmount(reserves.data.total_share, 6) : "—"} hint={pool.lpToken} />
        <MetricCard label="Query status" value={poolStatus} hint={reserves.data ? "Pair contract queried through RPC" : "RPC degraded or not queried"} />
      </div>

      {!metrics ? (
        <p className="pool-metrics-copy">TVL, 24h volume, and APR are unavailable from {dataSourceLabel(poolMetrics.access).toLowerCase()} for this pool; no fake USD metrics are displayed.</p>
      ) : null}

      <section className="pool-detail-section" aria-labelledby="composition-title">
        <h3 id="composition-title">Reserve composition</h3>
        <div className="metrics-grid">
          {pool.assets.map((asset, index) => (
            <ReserveCard key={asset.id} asset={asset} index={index} pool={pool} reserves={reserves.data} />
          ))}
          <MetricCard label="Current price" value={formatCurrentPrice(pool, reserves.data)} hint={`${poolType?.swapCopy ?? "Spot ratio from reserves"} Spot ratio from ${pool.assets[0].symbol} and ${pool.assets[1].symbol} reserves`} />
        </div>
      </section>

      <section className="pool-detail-section" aria-labelledby="share-math-title">
        <h3 id="share-math-title">Share math</h3>
        <dl className="quote-details lp-underlying-list">
          <div><dt>Total LP shares</dt><dd className="quote-detail-value">{reserves.data ? formatAmount(reserves.data.total_share, 6) : "Unavailable until reserve query succeeds"}</dd></div>
          <div><dt>LP accounting</dt><dd className="quote-detail-value">Your pool share = wallet LP balance ÷ total LP shares. Underlying estimates in the position panel multiply that share by each reserve.</dd></div>
          <div><dt>Pricing caveat</dt><dd className="quote-detail-value">USD value, volume, and APR require external pricing/indexer data and are never inferred from reserves alone. {poolType?.withdrawCopy}</dd></div>
        </dl>
      </section>

      <section className="pool-detail-section" aria-labelledby="params-title">
        <h3 id="params-title">Type-specific parameters</h3>
        <dl className="quote-details lp-underlying-list">
          <div><dt>Pair type</dt><dd className="quote-detail-value">{poolType?.label ?? pool.type.toUpperCase()}</dd></div>
          <div><dt>Fee tier</dt><dd className="quote-detail-value">{pool.feeBps} bps · {poolType?.feeCopy}</dd></div>
          <div><dt>{pool.type === "stable" ? "Stable amp" : pool.type === "concentrated" ? "PCL parameters" : "XYK parameters"}</dt><dd className="quote-detail-value">{typeSpecificCopy(pool)}</dd></div>
        </dl>
      </section>

      <section className="pool-detail-section" aria-labelledby="chart-title">
        <h3 id="chart-title">Price chart</h3>
        <p className="empty-state">Price charts depend on the pool indexer/charting service. Current source: {dataSourceLabel(poolMetrics.access)}.</p>
      </section>

      <section id="position"><LpPositionPanel pool={pool} compact /></section>

      <div className="mode-tabs pool-detail-tabs" aria-label="Liquidity sections">
        <a className="mode-tab active" href="#add-liquidity">Add</a>
        <a className="mode-tab" href="#remove-liquidity">Remove</a>
        <a className="mode-tab" href="#position">Position</a>
      </div>
      <div className="liquidity-grid">
        <section id="add-liquidity"><AddLiquidityForm pool={pool} /></section>
        <section id="remove-liquidity"><RemoveLiquidityForm pool={pool} /></section>
      </div>

      <section className="pool-detail-section" aria-label="Recent wallet transactions">
        <WalletTransactionHistory
          title="Your recent pool transactions"
          emptyTitle="No indexed transactions for this pool"
          history={walletIndexerData.data.history}
          access={walletIndexerData.access}
          explorerBaseUrl={registry.explorerBaseUrl}
          walletConnected={Boolean(walletAddress)}
          isLoading={walletIndexerData.isLoading}
          pairAddress={pool.pair}
        />
      </section>
    </section>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong>{hint ? <code>{hint}</code> : null}</div>;
}

function ReserveCard({ asset, index, pool, reserves }: { asset: RegistryAsset; index: number; pool: RegistryPool; reserves: PoolResponse | undefined }) {
  const reserve = reserves?.assets[index]?.amount;
  const share = reserveCompositionPercent(pool, reserves, index);
  return (
    <div className="metric-card">
      <span className="pool-asset-heading"><TokenLogo asset={asset} size="sm" /> {asset.name ?? asset.symbol}</span>
      <strong>{reserve ? `${formatAmount(reserve, asset.decimals)} ${asset.symbol}` : "—"}</strong>
      <code>{share ?? "Composition unavailable"}</code>
      {asset.denomTrace ? <small>{asset.denomTrace}</small> : null}
      <code>{asset.id}</code>
    </div>
  );
}

function typeSpecificCopy(pool: RegistryPool) {
  const metadata = getPoolTypeMetadata(pool.type);
  if (pool.type === "stable") return `${metadata.detailCopy} Amp is not exposed by the current registry/discovery query; contract config wiring is required before showing it.`;
  if (pool.type === "concentrated") return `${metadata.detailCopy} PCL parameters are not exposed by the current registry/discovery query; contract config wiring is required before showing them.`;
  return metadata.detailCopy;
}

function reserveCompositionPercent(pool: RegistryPool, reserves: PoolResponse | undefined, index: number) {
  if (!reserves) return undefined;
  const normalized = pool.assets.map((asset, assetIndex) => normalizedNumber(reserves.assets[assetIndex]?.amount, asset.decimals));
  const total = normalized.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) return undefined;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format((normalized[index] / total) * 100)}% of token units`;
}

function formatCurrentPrice(pool: RegistryPool, reserves: PoolResponse | undefined) {
  if (!reserves) return "—";
  const base = normalizedNumber(reserves.assets[0]?.amount, pool.assets[0].decimals);
  const quote = normalizedNumber(reserves.assets[1]?.amount, pool.assets[1].decimals);
  if (!Number.isFinite(base) || !Number.isFinite(quote) || base <= 0 || quote <= 0) return "Unavailable";
  const price = quote / base;
  const inverse = base / quote;
  return `1 ${pool.assets[0].symbol} ≈ ${formatRatio(price)} ${pool.assets[1].symbol} · 1 ${pool.assets[1].symbol} ≈ ${formatRatio(inverse)} ${pool.assets[0].symbol}`;
}

function normalizedNumber(amount: string | undefined, decimals: number) {
  if (!amount || !/^\d+$/.test(amount)) return 0;
  return Number(amount) / 10 ** decimals;
}

function formatRatio(value: number) {
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 }).format(value);
}

function formatUsd(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatApr(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}

function aprHint(metrics: PoolMetrics) {
  const parts = [];
  if (typeof metrics.feeApr === "number") parts.push(`fees ${formatApr(metrics.feeApr)}`);
  if (typeof metrics.incentivesApr === "number") parts.push(`incentives ${formatApr(metrics.incentivesApr)}`);
  return parts.length > 0 ? parts.join(" + ") : "From configured indexer";
}
