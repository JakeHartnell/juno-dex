import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import type { RegistryAsset, RegistryPool } from "../../config/registry";
import type { PoolResponse } from "../../lib/astroport/queries";
import { formatAmount } from "../../lib/format/amounts";
import { assessPoolRisk } from "../../lib/risk";
import { getPoolTotalApr } from "../../lib/pools/poolList";
import type { PoolMetrics } from "../../lib/pools/poolList";
import { getPoolTypeMetadata } from "../../lib/pools/poolTypes";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { usePoolActivity, usePoolMetrics, usePoolReserves } from "../../queries/usePools";
import { PriceCandleChart } from "../charts/PriceCandleChart";
import { Modal, RiskBadgeList, TokenLogo } from "../common";
import { IncentivesPanel } from "../incentives/IncentivesPanel";
import { AddLiquidityForm } from "../liquidity/AddLiquidityForm";
import { LpPositionPanel } from "../liquidity/LpPositionPanel";
import { RemoveLiquidityForm } from "../liquidity/RemoveLiquidityForm";
import { WalletTransactionHistory } from "../wallet/WalletTransactionHistory";

export function PoolDetailPage() {
  const { pairAddress } = useParams();
  const { pools, discovery, registry } = useDexRegistry();
  const [manageAction, setManageAction] = useState<"add" | "remove" | "stake" | null>(null);
  const pool = pools.find((candidate) => candidate.pair === pairAddress);
  const poolMetrics = usePoolMetrics(pool ? [pool] : []);
  const poolActivity = usePoolActivity(pool, 50);
  const reserves = usePoolReserves(pool);
  const metrics = pool ? poolMetrics.data?.[pool.pair] : undefined;
  const poolType = pool ? getPoolTypeMetadata(pool.type) : undefined;

  if (!pool) {
    return <section className="panel-page"><h2>Pool not found</h2><p className="empty-state">This pool is not in the current pool list.{discovery.isError ? " Some pools could not be loaded, so try again before concluding it is unavailable." : ""}</p><Link to="/pools">Back to pools</Link></section>;
  }

  const risk = assessPoolRisk(pool, reserves.data);

  return (
    <section className="panel-page pool-detail-page">
      <header className="pool-detail-header">
        <div className="pool-detail-lead">
          <p className="eyebrow pool-detail-eyebrow">Pool · {pool.assets.map((asset) => asset.symbol).join(" / ")}</p>
          <h2>{pool.label}</h2>
          <p className="pool-detail-meta">{poolType?.label ?? pool.type.toUpperCase()} · {pool.feeBps} bps fee</p>
          <RiskBadgeList assessment={risk} max={6} />
        </div>
        <Link className="pool-detail-back" to="/pools">← Back to pools</Link>
      </header>

      <section id="position"><LpPositionPanel pool={pool} compact onAdd={() => setManageAction("add")} onRemove={() => setManageAction("remove")} onStake={() => setManageAction("stake")} /></section>

      <Modal open={manageAction === "add"} title={`Add liquidity · ${pool.label}`} onClose={() => setManageAction(null)}><AddLiquidityForm pool={pool} /></Modal>
      <Modal open={manageAction === "remove"} title={`Remove liquidity · ${pool.label}`} onClose={() => setManageAction(null)}><RemoveLiquidityForm pool={pool} /></Modal>
      <Modal open={manageAction === "stake"} title={`LP incentives · ${pool.label}`} onClose={() => setManageAction(null)}><IncentivesPanel pool={pool} metrics={metrics} /></Modal>

      <section className="pool-detail-section" aria-labelledby="analytics-title">
        <h3 id="analytics-title">Performance</h3>
        <div className="metrics-grid" aria-label="Pool analytics cards">
          <MetricCard label="TVL" value={formatMarketValue(metrics?.tvlUsd, metrics?.tvlJuno) ?? "Metrics unavailable"} hint={hasMarketValue(metrics?.tvlUsd, metrics?.tvlJuno) ? "Updated market data" : "Requires pricing data"} />
          <MetricCard label="24h volume" value={formatMarketValue(metrics?.volume24hUsd, metrics?.volume24hJuno) ?? "Metrics unavailable"} hint={hasMarketValue(metrics?.volume24hUsd, metrics?.volume24hJuno) ? "Updated market data" : "Requires volume data"} />
          <MetricCard label="APR" value={formatApr(getPoolTotalApr(metrics)) ?? "Metrics unavailable"} hint={metrics ? aprHint(metrics) : "Requires fee and incentives data"} />
        </div>
        {!metrics ? (
          <p className="pool-metrics-copy">TVL, 24h volume, and APR are unavailable for this pool.</p>
        ) : null}
        {metrics && poolMetrics.access?.updatedAt ? <p className="optional-data-timestamp">{poolMetrics.access.isStale ? "Last available" : "Updated"} {formatDataTime(poolMetrics.access.updatedAt)}</p> : null}
      </section>

      <section className="pool-detail-section" aria-labelledby="composition-title">
        <h3 id="composition-title">Pool reserves</h3>
        {reserves.isError ? <p className="pool-service-note">Current balances are unavailable. Position estimates and reserves may be incomplete.</p> : null}
        <div className="metrics-grid">
          {pool.assets.map((asset, index) => (
            <ReserveCard key={asset.id} asset={asset} index={index} reserves={reserves.data} />
          ))}
          <MetricCard label="Current price" value={formatCurrentPrice(pool, reserves.data)} hint={`Spot ratio from ${pool.assets[0].symbol} and ${pool.assets[1].symbol} reserves`} />
        </div>
      </section>

      <section className="pool-detail-section">
        <PriceCandleChart pool={pool} title="Price chart" />
      </section>

      <section className="pool-detail-section" aria-label="Recent pool transactions">
        <WalletTransactionHistory
          title="Recent pool activity"
          emptyTitle="No indexed transactions for this pool"
          history={poolActivity.data}
          access={poolActivity.access}
          walletConnected
          isLoading={poolActivity.isLoading}
          pairAddress={pool.pair}
          pool={pool}
          explorerBaseUrl={registry.explorerBaseUrl}
        />
      </section>

      <details className="pool-technical-details">
        <summary>Technical pool details</summary>
        <div className="pool-detail-identity" aria-label="Contract identity">
          <div className="pool-identity-row"><span className="pool-identity-label">Pool contract</span><code>{pool.pair}</code><button type="button" onClick={() => navigator.clipboard?.writeText(pool.pair)}>Copy</button></div>
          <div className="pool-identity-row"><span className="pool-identity-label">LP token</span><code>{pool.lpToken}</code><button type="button" onClick={() => navigator.clipboard?.writeText(pool.lpToken)}>Copy</button></div>
        </div>
        <dl className="quote-details lp-underlying-list">
          <div><dt>Total LP shares</dt><dd className="quote-detail-value">{reserves.data ? formatAmount(reserves.data.total_share, 6) : "Unavailable"}</dd></div>
          <div><dt>How estimates work</dt><dd className="quote-detail-value">Your pool percentage is your LP balance divided by all LP shares. Estimated token amounts use that percentage of each pool balance.</dd></div>
          <div><dt>Pool model</dt><dd className="quote-detail-value">{poolType?.label ?? pool.type.toUpperCase()} · {pool.feeBps} bps fee. {typeSpecificCopy(pool)}</dd></div>
          <div><dt>Data limits</dt><dd className="quote-detail-value">USD value, volume, and APR require market data and are not inferred from token balances. {poolType?.withdrawCopy}</dd></div>
        </dl>
      </details>
    </section>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const muted = value === "Metrics unavailable" || value === "—" || value === "Unavailable";
  const long = value.length > 22;
  const valueClass = [muted ? "metric-value-muted" : "", long ? "metric-value-long" : ""].filter(Boolean).join(" ") || undefined;
  return <div className="metric-card"><span>{label}</span><strong className={valueClass}>{value}</strong>{hint ? <code>{hint}</code> : null}</div>;
}

function ReserveCard({ asset, index, reserves }: { asset: RegistryAsset; index: number; reserves: PoolResponse | undefined }) {
  const reserve = reserves?.assets[index]?.amount;
  return (
    <div className="metric-card">
    <span className="pool-asset-heading"><TokenLogo asset={asset} size="sm" /> {asset.name ?? asset.symbol}</span>
    <strong>{reserve ? `${formatAmount(reserve, asset.decimals)} ${asset.symbol}` : "—"}</strong>
    <details className="identifier-disclosure"><summary>Asset identifier</summary><code>{asset.id}</code>{asset.denomTrace ? <small>{asset.denomTrace}</small> : null}</details>
    </div>
  );
}

function typeSpecificCopy(pool: RegistryPool) {
  const metadata = getPoolTypeMetadata(pool.type);
  if (pool.type === "stable") return `${metadata.detailCopy} The amplification setting is not available from this pool's current data.`;
  if (pool.type === "concentrated") return `${metadata.detailCopy} Concentration settings are not available from this pool's current data.`;
  return metadata.detailCopy;
}

function formatCurrentPrice(pool: RegistryPool, reserves: PoolResponse | undefined) {
  if (!reserves) return "—";
  const base = normalizedNumber(reserves.assets[0]?.amount, pool.assets[0].decimals);
  const quote = normalizedNumber(reserves.assets[1]?.amount, pool.assets[1].decimals);
  if (!Number.isFinite(base) || !Number.isFinite(quote) || base <= 0 || quote <= 0) return "Unavailable";
  return `1 ${pool.assets[0].symbol} ≈ ${formatRatio(quote / base)} ${pool.assets[1].symbol}`;
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

function formatJuno(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} JUNO`;
}

function formatMarketValue(usdValue: number | null | undefined, junoValue: number | null | undefined) {
  return formatUsd(usdValue) ?? formatJuno(junoValue);
}

function hasMarketValue(usdValue: number | null | undefined, junoValue: number | null | undefined) {
  return formatMarketValue(usdValue, junoValue) !== undefined;
}

function formatApr(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}

function aprHint(metrics: PoolMetrics) {
  const parts = [];
  if (typeof metrics.feeApr === "number") parts.push(`fees ${formatApr(metrics.feeApr)}`);
  if (typeof metrics.incentivesApr === "number") parts.push(`incentives ${formatApr(metrics.incentivesApr)}`);
  return parts.length > 0 ? parts.join(" + ") : "Market data";
}

function formatDataTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "at an unknown time";
  return parsed.toLocaleString();
}
