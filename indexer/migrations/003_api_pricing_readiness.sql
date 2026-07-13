ALTER TABLE token_prices ALTER COLUMN price_usd DROP NOT NULL;
ALTER TABLE token_prices ADD COLUMN IF NOT EXISTS price_juno NUMERIC(38,18);
ALTER TABLE token_prices ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'fresh';
ALTER TABLE token_prices ADD COLUMN IF NOT EXISTS stale_after TIMESTAMPTZ;
ALTER TABLE token_prices ADD COLUMN IF NOT EXISTS raw_payload JSONB;

CREATE INDEX IF NOT EXISTS token_prices_status_idx ON token_prices (chain_id, asset, status, observed_at DESC);

ALTER TABLE pool_state_snapshots ADD COLUMN IF NOT EXISTS tvl_juno NUMERIC(38,12);
ALTER TABLE pool_state_snapshots ADD COLUMN IF NOT EXISTS volume_24h_usd NUMERIC(38,12);
ALTER TABLE pool_state_snapshots ADD COLUMN IF NOT EXISTS volume_24h_juno NUMERIC(38,12);
ALTER TABLE pool_state_snapshots ADD COLUMN IF NOT EXISTS volume_7d_usd NUMERIC(38,12);
ALTER TABLE pool_state_snapshots ADD COLUMN IF NOT EXISTS volume_7d_juno NUMERIC(38,12);
ALTER TABLE pool_state_snapshots ADD COLUMN IF NOT EXISTS fees_24h_usd NUMERIC(38,12);
ALTER TABLE pool_state_snapshots ADD COLUMN IF NOT EXISTS fees_24h_juno NUMERIC(38,12);

ALTER TABLE token_candles ADD COLUMN IF NOT EXISTS volume_quote NUMERIC(78,18);

CREATE TABLE IF NOT EXISTS asset_metadata (
  chain_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  symbol TEXT,
  decimals INTEGER,
  logo_uri TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  ibc_trace JSONB,
  source TEXT NOT NULL DEFAULT 'registry',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, asset)
);

DROP VIEW IF EXISTS latest_pool_states;
CREATE VIEW latest_pool_states AS
SELECT DISTINCT ON (p.chain_id, p.pair_address)
  p.chain_id,
  p.id AS pool_id,
  p.pair_address,
  p.liquidity_token_address,
  p.pool_type,
  p.asset_infos,
  s.height,
  s.block_time,
  s.reserves,
  s.total_share,
  s.tvl_usd,
  s.tvl_juno,
  s.volume_24h_usd,
  s.volume_24h_juno,
  s.volume_7d_usd,
  s.volume_7d_juno,
  s.fees_24h_usd,
  s.fees_24h_juno,
  s.created_at AS state_updated_at
FROM pools p
LEFT JOIN pool_state_snapshots s ON s.pool_id = p.id
ORDER BY p.chain_id, p.pair_address, s.height DESC NULLS LAST;
