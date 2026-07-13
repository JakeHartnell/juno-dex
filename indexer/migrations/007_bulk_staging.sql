CREATE TABLE IF NOT EXISTS stage_processed_blocks (
  batch_id UUID NOT NULL,
  chain_id TEXT NOT NULL,
  height BIGINT NOT NULL,
  block_hash TEXT NOT NULL,
  parent_hash TEXT,
  block_time TIMESTAMPTZ NOT NULL,
  tx_count INTEGER NOT NULL DEFAULT 0,
  staged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  merged_at TIMESTAMPTZ,
  PRIMARY KEY (batch_id, chain_id, height)
);
CREATE INDEX IF NOT EXISTS stage_processed_blocks_chain_height_idx ON stage_processed_blocks (chain_id, height);
CREATE INDEX IF NOT EXISTS stage_processed_blocks_merged_at_idx ON stage_processed_blocks (merged_at) WHERE merged_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS stage_pools (
  batch_id UUID NOT NULL,
  chain_id TEXT NOT NULL,
  height BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  tx_hash TEXT NOT NULL,
  msg_index INTEGER NOT NULL DEFAULT 0,
  event_index INTEGER NOT NULL DEFAULT 0,
  factory_address TEXT NOT NULL,
  pair_address TEXT NOT NULL,
  liquidity_token_address TEXT,
  pool_type TEXT,
  asset_infos JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_event JSONB NOT NULL,
  staged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, chain_id, height, tx_hash, msg_index, event_index, pair_address)
);
CREATE INDEX IF NOT EXISTS stage_pools_batch_idx ON stage_pools (batch_id, chain_id, pair_address);

CREATE TABLE IF NOT EXISTS stage_swaps (
  batch_id UUID NOT NULL,
  chain_id TEXT NOT NULL,
  height BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  tx_hash TEXT NOT NULL,
  msg_index INTEGER NOT NULL DEFAULT 0,
  event_index INTEGER NOT NULL DEFAULT 0,
  pair_address TEXT NOT NULL,
  trader TEXT,
  offer_asset TEXT,
  offer_amount NUMERIC(78,0),
  ask_asset TEXT,
  return_amount NUMERIC(78,0),
  spread_amount NUMERIC(78,0),
  commission_amount NUMERIC(78,0),
  raw_event JSONB NOT NULL,
  staged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stage_swaps_batch_idx ON stage_swaps (batch_id, chain_id, pair_address);
CREATE UNIQUE INDEX IF NOT EXISTS stage_swaps_idempotency_idx
  ON stage_swaps (batch_id, chain_id, height, tx_hash, msg_index, event_index, pair_address, COALESCE(trader, ''));

CREATE TABLE IF NOT EXISTS stage_liquidity_events (
  batch_id UUID NOT NULL,
  chain_id TEXT NOT NULL,
  height BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  tx_hash TEXT NOT NULL,
  msg_index INTEGER NOT NULL DEFAULT 0,
  event_index INTEGER NOT NULL DEFAULT 0,
  pair_address TEXT NOT NULL,
  kind liquidity_event_kind NOT NULL,
  provider TEXT,
  assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  share_amount NUMERIC(78,0),
  raw_event JSONB NOT NULL,
  staged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stage_liquidity_events_batch_idx ON stage_liquidity_events (batch_id, chain_id, pair_address);
CREATE UNIQUE INDEX IF NOT EXISTS stage_liquidity_events_idempotency_idx
  ON stage_liquidity_events (batch_id, chain_id, height, tx_hash, msg_index, event_index, pair_address, kind, COALESCE(provider, ''));

CREATE TABLE IF NOT EXISTS stage_incentive_events (
  batch_id UUID NOT NULL,
  chain_id TEXT NOT NULL,
  height BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  tx_hash TEXT NOT NULL,
  msg_index INTEGER NOT NULL DEFAULT 0,
  event_index INTEGER NOT NULL DEFAULT 0,
  incentives_address TEXT NOT NULL,
  lp_token_address TEXT,
  user_address TEXT,
  action TEXT NOT NULL,
  amount NUMERIC(78,0),
  reward_asset TEXT,
  reward_amount NUMERIC(78,0),
  raw_event JSONB NOT NULL,
  staged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stage_incentive_events_batch_idx ON stage_incentive_events (batch_id, chain_id, incentives_address);
CREATE UNIQUE INDEX IF NOT EXISTS stage_incentive_events_idempotency_idx
  ON stage_incentive_events (batch_id, chain_id, height, tx_hash, msg_index, event_index, incentives_address, action, COALESCE(user_address, ''));
