CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indexer_cursors (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL,
  last_height BIGINT NOT NULL DEFAULT 0,
  last_block_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processed_blocks (
  height BIGINT PRIMARY KEY,
  chain_id TEXT NOT NULL,
  block_hash TEXT NOT NULL,
  parent_hash TEXT,
  block_time TIMESTAMPTZ NOT NULL,
  tx_count INTEGER NOT NULL DEFAULT 0,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id TEXT NOT NULL,
  pair_address TEXT NOT NULL,
  factory_address TEXT NOT NULL,
  liquidity_token_address TEXT,
  pool_type TEXT,
  asset_infos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_height BIGINT,
  created_tx_hash TEXT,
  first_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, pair_address)
);
CREATE INDEX IF NOT EXISTS pools_factory_idx ON pools (factory_address);
CREATE INDEX IF NOT EXISTS pools_assets_gin_idx ON pools USING gin (asset_infos);

CREATE TABLE IF NOT EXISTS pool_state_snapshots (
  id BIGSERIAL PRIMARY KEY,
  pool_id UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  height BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  reserves JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_share NUMERIC(78,0),
  tvl_usd NUMERIC(38,12),
  source TEXT NOT NULL DEFAULT 'event',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pool_id, height, source)
);
CREATE INDEX IF NOT EXISTS pool_state_pool_height_idx ON pool_state_snapshots (pool_id, height DESC);

CREATE TABLE IF NOT EXISTS swaps (
  id BIGSERIAL PRIMARY KEY,
  chain_id TEXT NOT NULL,
  pool_id UUID REFERENCES pools(id) ON DELETE SET NULL,
  pair_address TEXT NOT NULL,
  height BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  tx_hash TEXT NOT NULL,
  msg_index INTEGER NOT NULL DEFAULT 0,
  event_index INTEGER NOT NULL DEFAULT 0,
  trader TEXT,
  offer_asset TEXT,
  offer_amount NUMERIC(78,0),
  ask_asset TEXT,
  return_amount NUMERIC(78,0),
  spread_amount NUMERIC(78,0),
  commission_amount NUMERIC(78,0),
  raw_event JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS swaps_pool_height_idx ON swaps (pair_address, height DESC);
CREATE INDEX IF NOT EXISTS swaps_block_time_idx ON swaps (block_time DESC);
CREATE INDEX IF NOT EXISTS swaps_pair_time_order_idx ON swaps (chain_id, pair_address, block_time, height, msg_index, event_index, id);
CREATE UNIQUE INDEX IF NOT EXISTS swaps_idempotency_idx
  ON swaps (chain_id, tx_hash, msg_index, event_index, pair_address, COALESCE(trader, ''));

DO $$
BEGIN
  CREATE TYPE liquidity_event_kind AS ENUM ('provide', 'withdraw');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS liquidity_events (
  id BIGSERIAL PRIMARY KEY,
  chain_id TEXT NOT NULL,
  pool_id UUID REFERENCES pools(id) ON DELETE SET NULL,
  pair_address TEXT NOT NULL,
  height BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  tx_hash TEXT NOT NULL,
  msg_index INTEGER NOT NULL DEFAULT 0,
  event_index INTEGER NOT NULL DEFAULT 0,
  kind liquidity_event_kind NOT NULL,
  provider TEXT,
  assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  share_amount NUMERIC(78,0),
  raw_event JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS liquidity_events_pool_height_idx ON liquidity_events (pair_address, height DESC);
CREATE INDEX IF NOT EXISTS liquidity_events_provider_idx ON liquidity_events (provider);
CREATE UNIQUE INDEX IF NOT EXISTS liquidity_events_idempotency_idx
  ON liquidity_events (chain_id, tx_hash, msg_index, event_index, pair_address, kind, COALESCE(provider, ''));

CREATE TABLE IF NOT EXISTS incentive_events (
  id BIGSERIAL PRIMARY KEY,
  chain_id TEXT NOT NULL,
  incentives_address TEXT NOT NULL,
  lp_token_address TEXT,
  user_address TEXT,
  action TEXT NOT NULL,
  amount NUMERIC(78,0),
  reward_asset TEXT,
  reward_amount NUMERIC(78,0),
  height BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  tx_hash TEXT NOT NULL,
  msg_index INTEGER NOT NULL DEFAULT 0,
  event_index INTEGER NOT NULL DEFAULT 0,
  raw_event JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incentive_events_user_idx ON incentive_events (user_address);
CREATE INDEX IF NOT EXISTS incentive_events_lp_idx ON incentive_events (lp_token_address);
CREATE UNIQUE INDEX IF NOT EXISTS incentive_events_idempotency_idx
  ON incentive_events (chain_id, tx_hash, msg_index, event_index, incentives_address, action, COALESCE(user_address, ''));

CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id TEXT NOT NULL,
  pool_id UUID REFERENCES pools(id) ON DELETE CASCADE,
  pair_address TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  lp_token_address TEXT,
  lp_balance NUMERIC(78,0) NOT NULL DEFAULT 0,
  bonded_balance NUMERIC(78,0) NOT NULL DEFAULT 0,
  last_height BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, pair_address, owner_address)
);
CREATE INDEX IF NOT EXISTS positions_owner_idx ON positions (owner_address);

CREATE TABLE IF NOT EXISTS token_prices (
  id BIGSERIAL PRIMARY KEY,
  chain_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  price_usd NUMERIC(38,18) NOT NULL,
  source TEXT NOT NULL,
  height BIGINT,
  block_time TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, asset, source, observed_at)
);
CREATE INDEX IF NOT EXISTS token_prices_asset_time_idx ON token_prices (asset, observed_at DESC);

CREATE TABLE IF NOT EXISTS token_candles (
  id BIGSERIAL PRIMARY KEY,
  chain_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  quote_asset TEXT NOT NULL DEFAULT 'uusd',
  interval TEXT NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  open NUMERIC(38,18) NOT NULL,
  high NUMERIC(38,18) NOT NULL,
  low NUMERIC(38,18) NOT NULL,
  close NUMERIC(38,18) NOT NULL,
  volume NUMERIC(78,0) NOT NULL DEFAULT 0,
  volume_usd NUMERIC(38,12),
  trade_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, asset, quote_asset, interval, bucket_start)
);
CREATE INDEX IF NOT EXISTS token_candles_asset_interval_idx ON token_candles (asset, interval, bucket_start DESC);
