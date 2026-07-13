-- API read models for high-traffic endpoints. These are ordinary tables plus
-- explicit refresh helpers so deployments do not require TimescaleDB or external
-- USD price providers.

CREATE TABLE IF NOT EXISTS latest_pool_state (
  chain_id TEXT NOT NULL,
  pool_id UUID NOT NULL,
  pair_address TEXT NOT NULL,
  liquidity_token_address TEXT,
  pool_type TEXT,
  asset_infos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_height BIGINT,
  created_tx_hash TEXT,
  first_seen_at TIMESTAMPTZ,
  pool_updated_at TIMESTAMPTZ,
  state_height BIGINT,
  state_block_time TIMESTAMPTZ,
  reserves JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_share NUMERIC(78,0),
  tvl_usd NUMERIC(38,12),
  tvl_juno NUMERIC(38,12),
  volume_24h_usd NUMERIC(38,12),
  volume_24h_juno NUMERIC(38,12),
  volume_7d_usd NUMERIC(38,12),
  volume_7d_juno NUMERIC(38,12),
  fees_24h_usd NUMERIC(38,12),
  fees_24h_juno NUMERIC(38,12),
  snapshot_source TEXT,
  state_updated_at TIMESTAMPTZ,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, pair_address)
);
CREATE INDEX IF NOT EXISTS latest_pool_state_tvl_idx ON latest_pool_state (chain_id, tvl_usd DESC NULLS LAST, created_height DESC NULLS LAST);
CREATE UNIQUE INDEX IF NOT EXISTS latest_pool_state_pool_uq ON latest_pool_state (chain_id, pool_id);

CREATE TABLE IF NOT EXISTS pool_volume_windows (
  chain_id TEXT NOT NULL,
  pool_id UUID NOT NULL,
  pair_address TEXT NOT NULL,
  time_window TEXT NOT NULL CHECK (time_window IN ('24h', '7d')),
  volume_usd NUMERIC(38,12),
  volume_juno NUMERIC(38,12),
  fees_usd NUMERIC(38,12),
  fees_juno NUMERIC(38,12),
  swap_count INTEGER NOT NULL DEFAULT 0,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, pair_address, time_window)
);
CREATE INDEX IF NOT EXISTS pool_volume_windows_chain_window_idx ON pool_volume_windows (chain_id, time_window, volume_usd DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS pool_candle_buckets (
  chain_id TEXT NOT NULL,
  pool_id UUID,
  pair_address TEXT NOT NULL,
  asset TEXT NOT NULL,
  quote_asset TEXT NOT NULL,
  interval TEXT NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  open NUMERIC(38,18) NOT NULL,
  high NUMERIC(38,18) NOT NULL,
  low NUMERIC(38,18) NOT NULL,
  close NUMERIC(38,18) NOT NULL,
  volume NUMERIC(78,18) NOT NULL DEFAULT 0,
  volume_quote NUMERIC(78,18),
  volume_usd NUMERIC(38,12),
  trade_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'indexer',
  updated_at TIMESTAMPTZ,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, pair_address, asset, quote_asset, interval, bucket_start)
);
CREATE INDEX IF NOT EXISTS pool_candle_buckets_api_idx ON pool_candle_buckets (chain_id, pair_address, interval, bucket_start DESC);
CREATE INDEX IF NOT EXISTS pool_candle_buckets_asset_idx ON pool_candle_buckets (chain_id, asset, quote_asset, interval, bucket_start DESC);

CREATE TABLE IF NOT EXISTS wallet_history_flat (
  chain_id TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  pair_address TEXT,
  type TEXT NOT NULL,
  height BIGINT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  msg_index INTEGER NOT NULL DEFAULT 0,
  event_index INTEGER NOT NULL DEFAULT 0,
  offer_asset JSONB,
  ask_asset JSONB,
  amount_usd NUMERIC(38,12),
  fee_usd NUMERIC(38,12),
  success BOOLEAN NOT NULL DEFAULT true,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, wallet_address, tx_hash, type, msg_index, event_index)
);
CREATE INDEX IF NOT EXISTS wallet_history_flat_api_idx ON wallet_history_flat (chain_id, wallet_address, height DESC, timestamp DESC);

CREATE TABLE IF NOT EXISTS wallet_position_latest (
  chain_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  pool_id UUID,
  pair_address TEXT NOT NULL,
  lp_token_address TEXT,
  lp_balance NUMERIC(78,0) NOT NULL DEFAULT 0,
  bonded_balance NUMERIC(78,0) NOT NULL DEFAULT 0,
  last_height BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, wallet_address, pair_address)
);
CREATE INDEX IF NOT EXISTS wallet_position_latest_pool_idx ON wallet_position_latest (chain_id, pair_address, updated_at DESC);

CREATE TABLE IF NOT EXISTS protocol_stats_latest (
  chain_id TEXT PRIMARY KEY,
  pool_count INTEGER NOT NULL DEFAULT 0,
  incentivized_pools INTEGER NOT NULL DEFAULT 0,
  tvl_usd NUMERIC(38,12),
  tvl_juno NUMERIC(38,12),
  volume_24h_usd NUMERIC(38,12),
  volume_24h_juno NUMERIC(38,12),
  volume_7d_usd NUMERIC(38,12),
  volume_7d_juno NUMERIC(38,12),
  fees_24h_usd NUMERIC(38,12),
  fees_24h_juno NUMERIC(38,12),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION refresh_latest_pool_state(target_chain_id TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE affected INTEGER;
BEGIN
  WITH latest_snapshot AS (
    SELECT DISTINCT ON (p.chain_id, p.pair_address)
      p.chain_id, p.id AS pool_id, p.pair_address, p.liquidity_token_address, p.pool_type,
      p.asset_infos, p.created_height, p.created_tx_hash, p.first_seen_at, p.updated_at AS pool_updated_at,
      s.height AS state_height, s.block_time AS state_block_time, COALESCE(s.reserves, '[]'::jsonb) AS reserves,
      s.total_share, s.tvl_usd, COALESCE(s.tvl_juno, reserve_values.tvl_juno) AS tvl_juno,
      s.volume_24h_usd, COALESCE(s.volume_24h_juno, swap_values.volume_24h_juno) AS volume_24h_juno,
      s.volume_7d_usd, COALESCE(s.volume_7d_juno, swap_values.volume_7d_juno) AS volume_7d_juno,
      s.fees_24h_usd, COALESCE(s.fees_24h_juno, swap_values.fees_24h_juno) AS fees_24h_juno,
      s.source AS snapshot_source, s.created_at AS state_updated_at
    FROM pools p
    LEFT JOIN pool_state_snapshots s ON s.pool_id = p.id
    LEFT JOIN LATERAL (
      SELECT sum((reserve->>'amount')::numeric) / 1000000 AS tvl_juno
      FROM jsonb_array_elements(COALESCE(s.reserves, '[]'::jsonb)) reserve
      WHERE reserve->>'denom' = 'ujuno'
        AND reserve->>'amount' ~ '^[0-9]+(\.[0-9]+)?$'
    ) reserve_values ON true
    LEFT JOIN LATERAL (
      SELECT
        sum(CASE
          WHEN sw.block_time >= now() - interval '24 hours' AND sw.offer_asset = 'ujuno' THEN sw.offer_amount
          WHEN sw.block_time >= now() - interval '24 hours' AND sw.ask_asset = 'ujuno' THEN sw.return_amount
          ELSE NULL
        END) / 1000000 AS volume_24h_juno,
        sum(CASE
          WHEN sw.offer_asset = 'ujuno' THEN sw.offer_amount
          WHEN sw.ask_asset = 'ujuno' THEN sw.return_amount
          ELSE NULL
        END) / 1000000 AS volume_7d_juno,
        sum(CASE
          WHEN sw.block_time >= now() - interval '24 hours' AND sw.ask_asset = 'ujuno' THEN sw.commission_amount
          ELSE NULL
        END) / 1000000 AS fees_24h_juno
      FROM swaps sw
      WHERE sw.chain_id = p.chain_id
        AND sw.pair_address = p.pair_address
        AND sw.block_time >= now() - interval '7 days'
    ) swap_values ON true
    WHERE target_chain_id IS NULL OR p.chain_id = target_chain_id
    ORDER BY p.chain_id, p.pair_address, s.height DESC NULLS LAST,
      CASE s.source WHEN 'lcd' THEN 0 WHEN 'event' THEN 1 ELSE 2 END,
      s.created_at DESC
  )
  INSERT INTO latest_pool_state(
    chain_id, pool_id, pair_address, liquidity_token_address, pool_type, asset_infos, created_height, created_tx_hash,
    first_seen_at, pool_updated_at, state_height, state_block_time, reserves, total_share, tvl_usd, tvl_juno,
    volume_24h_usd, volume_24h_juno, volume_7d_usd, volume_7d_juno, fees_24h_usd, fees_24h_juno,
    snapshot_source, state_updated_at, refreshed_at
  )
  SELECT chain_id, pool_id, pair_address, liquidity_token_address, pool_type, asset_infos, created_height, created_tx_hash,
    first_seen_at, pool_updated_at, state_height, state_block_time, reserves, total_share, tvl_usd, tvl_juno,
    volume_24h_usd, volume_24h_juno, volume_7d_usd, volume_7d_juno, fees_24h_usd, fees_24h_juno,
    snapshot_source, state_updated_at, now()
  FROM latest_snapshot
  ON CONFLICT (chain_id, pair_address) DO UPDATE SET
    pool_id = EXCLUDED.pool_id,
    liquidity_token_address = EXCLUDED.liquidity_token_address,
    pool_type = EXCLUDED.pool_type,
    asset_infos = EXCLUDED.asset_infos,
    created_height = EXCLUDED.created_height,
    created_tx_hash = EXCLUDED.created_tx_hash,
    first_seen_at = EXCLUDED.first_seen_at,
    pool_updated_at = EXCLUDED.pool_updated_at,
    state_height = EXCLUDED.state_height,
    state_block_time = EXCLUDED.state_block_time,
    reserves = EXCLUDED.reserves,
    total_share = EXCLUDED.total_share,
    tvl_usd = EXCLUDED.tvl_usd,
    tvl_juno = EXCLUDED.tvl_juno,
    volume_24h_usd = EXCLUDED.volume_24h_usd,
    volume_24h_juno = EXCLUDED.volume_24h_juno,
    volume_7d_usd = EXCLUDED.volume_7d_usd,
    volume_7d_juno = EXCLUDED.volume_7d_juno,
    fees_24h_usd = EXCLUDED.fees_24h_usd,
    fees_24h_juno = EXCLUDED.fees_24h_juno,
    snapshot_source = EXCLUDED.snapshot_source,
    state_updated_at = EXCLUDED.state_updated_at,
    refreshed_at = now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_pool_volume_windows(target_chain_id TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE affected INTEGER;
BEGIN
  WITH windows AS (
    SELECT chain_id, pool_id, pair_address, '24h'::text AS time_window,
           volume_24h_usd AS volume_usd, volume_24h_juno AS volume_juno,
           fees_24h_usd AS fees_usd, fees_24h_juno AS fees_juno
    FROM latest_pool_state
    WHERE target_chain_id IS NULL OR chain_id = target_chain_id
    UNION ALL
    SELECT chain_id, pool_id, pair_address, '7d'::text AS time_window,
           volume_7d_usd, volume_7d_juno, NULL::numeric, NULL::numeric
    FROM latest_pool_state
    WHERE target_chain_id IS NULL OR chain_id = target_chain_id
  ), counts AS (
    SELECT lps.chain_id, lps.pair_address, w.time_window, count(s.id)::int AS swap_count
    FROM latest_pool_state lps
    CROSS JOIN (VALUES ('24h'), ('7d')) AS w(time_window)
    LEFT JOIN swaps s ON s.chain_id = lps.chain_id
      AND s.pair_address = lps.pair_address
      AND s.block_time >= now() - CASE w.time_window WHEN '24h' THEN interval '24 hours' ELSE interval '7 days' END
    WHERE target_chain_id IS NULL OR lps.chain_id = target_chain_id
    GROUP BY lps.chain_id, lps.pair_address, w.time_window
  )
  INSERT INTO pool_volume_windows(chain_id, pool_id, pair_address, time_window, volume_usd, volume_juno, fees_usd, fees_juno, swap_count, refreshed_at)
  SELECT w.chain_id, w.pool_id, w.pair_address, w.time_window, w.volume_usd, w.volume_juno, w.fees_usd, w.fees_juno, COALESCE(c.swap_count, 0), now()
  FROM windows w
  LEFT JOIN counts c ON c.chain_id = w.chain_id AND c.pair_address = w.pair_address AND c.time_window = w.time_window
  ON CONFLICT (chain_id, pair_address, time_window) DO UPDATE SET
    pool_id = EXCLUDED.pool_id,
    volume_usd = EXCLUDED.volume_usd,
    volume_juno = EXCLUDED.volume_juno,
    fees_usd = EXCLUDED.fees_usd,
    fees_juno = EXCLUDED.fees_juno,
    swap_count = EXCLUDED.swap_count,
    refreshed_at = now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_pool_candle_buckets(target_chain_id TEXT DEFAULT NULL, target_pair_address TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE affected INTEGER;
BEGIN
  INSERT INTO pool_candle_buckets(chain_id, pool_id, pair_address, asset, quote_asset, interval, bucket_start, open, high, low, close, volume, volume_quote, volume_usd, trade_count, source, updated_at, refreshed_at)
  SELECT chain_id, pool_id, pair_address, asset, quote_asset, interval, bucket_start, open, high, low, close, volume,
         volume_quote, volume_usd, trade_count, source, updated_at, now()
  FROM token_candles
  WHERE pair_address <> ''
    AND (target_chain_id IS NULL OR chain_id = target_chain_id)
    AND (target_pair_address IS NULL OR pair_address = target_pair_address)
  ON CONFLICT (chain_id, pair_address, asset, quote_asset, interval, bucket_start) DO UPDATE SET
    pool_id = EXCLUDED.pool_id,
    open = EXCLUDED.open,
    high = EXCLUDED.high,
    low = EXCLUDED.low,
    close = EXCLUDED.close,
    volume = EXCLUDED.volume,
    volume_quote = EXCLUDED.volume_quote,
    volume_usd = EXCLUDED.volume_usd,
    trade_count = EXCLUDED.trade_count,
    source = EXCLUDED.source,
    updated_at = EXCLUDED.updated_at,
    refreshed_at = now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_wallet_history_flat(target_chain_id TEXT DEFAULT NULL, target_wallet_address TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE affected INTEGER;
BEGIN
  INSERT INTO wallet_history_flat(chain_id, tx_hash, wallet_address, pair_address, type, height, timestamp, msg_index, event_index, offer_asset, ask_asset, amount_usd, fee_usd, success, refreshed_at)
  SELECT chain_id, tx_hash, wallet_address, pair_address, type, height, timestamp, msg_index, event_index, offer_asset, ask_asset, amount_usd, fee_usd, success, now()
  FROM (
    SELECT chain_id, tx_hash, trader AS wallet_address, pair_address, 'swap'::text AS type, height, block_time AS timestamp, msg_index, event_index,
           jsonb_build_object('denom', offer_asset, 'amount', offer_amount::text) AS offer_asset,
           jsonb_build_object('denom', ask_asset, 'amount', return_amount::text) AS ask_asset,
           NULL::numeric AS amount_usd, NULL::numeric AS fee_usd, true AS success
    FROM swaps WHERE trader IS NOT NULL
    UNION ALL
    SELECT chain_id, tx_hash, provider AS wallet_address, pair_address, kind::text AS type, height, block_time AS timestamp, msg_index, event_index,
           NULL::jsonb AS offer_asset, NULL::jsonb AS ask_asset, NULL::numeric AS amount_usd, NULL::numeric AS fee_usd, true AS success
    FROM liquidity_events WHERE provider IS NOT NULL
    UNION ALL
    SELECT chain_id, tx_hash, user_address AS wallet_address, NULL::text AS pair_address, action AS type, height, block_time AS timestamp, msg_index, event_index,
           NULL::jsonb AS offer_asset,
           CASE WHEN reward_asset IS NOT NULL OR reward_amount IS NOT NULL THEN jsonb_build_object('denom', reward_asset, 'amount', reward_amount::text) ELSE NULL::jsonb END AS ask_asset,
           NULL::numeric AS amount_usd, NULL::numeric AS fee_usd, true AS success
    FROM incentive_events WHERE user_address IS NOT NULL
  ) events
  WHERE (target_chain_id IS NULL OR chain_id = target_chain_id)
    AND (target_wallet_address IS NULL OR wallet_address = target_wallet_address)
  ON CONFLICT (chain_id, wallet_address, tx_hash, type, msg_index, event_index) DO UPDATE SET
    pair_address = EXCLUDED.pair_address,
    height = EXCLUDED.height,
    timestamp = EXCLUDED.timestamp,
    offer_asset = EXCLUDED.offer_asset,
    ask_asset = EXCLUDED.ask_asset,
    amount_usd = EXCLUDED.amount_usd,
    fee_usd = EXCLUDED.fee_usd,
    success = EXCLUDED.success,
    refreshed_at = now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_wallet_position_latest(target_chain_id TEXT DEFAULT NULL, target_wallet_address TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE affected INTEGER;
BEGIN
  INSERT INTO wallet_position_latest(chain_id, wallet_address, pool_id, pair_address, lp_token_address, lp_balance, bonded_balance, last_height, updated_at, refreshed_at)
  SELECT chain_id, owner_address, pool_id, pair_address, lp_token_address, lp_balance, bonded_balance, last_height, updated_at, now()
  FROM positions
  WHERE (target_chain_id IS NULL OR chain_id = target_chain_id)
    AND (target_wallet_address IS NULL OR owner_address = target_wallet_address)
  ON CONFLICT (chain_id, wallet_address, pair_address) DO UPDATE SET
    pool_id = EXCLUDED.pool_id,
    lp_token_address = EXCLUDED.lp_token_address,
    lp_balance = EXCLUDED.lp_balance,
    bonded_balance = EXCLUDED.bonded_balance,
    last_height = EXCLUDED.last_height,
    updated_at = EXCLUDED.updated_at,
    refreshed_at = now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_protocol_stats_latest(target_chain_id TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE affected INTEGER;
BEGIN
  WITH stats AS (
    SELECT lps.chain_id,
           count(*)::int AS pool_count,
           count(DISTINCT ie.lp_token_address)::int AS incentivized_pools,
           max(COALESCE(lps.state_updated_at, lps.pool_updated_at, lps.refreshed_at)) AS updated_at,
           sum(lps.tvl_usd) FILTER (WHERE lps.tvl_usd IS NOT NULL) AS tvl_usd,
           sum(lps.tvl_juno) FILTER (WHERE lps.tvl_juno IS NOT NULL) AS tvl_juno,
           sum(lps.volume_24h_usd) FILTER (WHERE lps.volume_24h_usd IS NOT NULL) AS volume_24h_usd,
           sum(lps.volume_24h_juno) FILTER (WHERE lps.volume_24h_juno IS NOT NULL) AS volume_24h_juno,
           sum(lps.volume_7d_usd) FILTER (WHERE lps.volume_7d_usd IS NOT NULL) AS volume_7d_usd,
           sum(lps.volume_7d_juno) FILTER (WHERE lps.volume_7d_juno IS NOT NULL) AS volume_7d_juno,
           sum(lps.fees_24h_usd) FILTER (WHERE lps.fees_24h_usd IS NOT NULL) AS fees_24h_usd,
           sum(lps.fees_24h_juno) FILTER (WHERE lps.fees_24h_juno IS NOT NULL) AS fees_24h_juno
    FROM latest_pool_state lps
    LEFT JOIN (SELECT DISTINCT chain_id, lp_token_address FROM incentive_events WHERE lp_token_address IS NOT NULL) ie
      ON ie.chain_id = lps.chain_id AND ie.lp_token_address = lps.liquidity_token_address
    WHERE target_chain_id IS NULL OR lps.chain_id = target_chain_id
    GROUP BY lps.chain_id
  )
  INSERT INTO protocol_stats_latest(chain_id, pool_count, incentivized_pools, tvl_usd, tvl_juno, volume_24h_usd, volume_24h_juno, volume_7d_usd, volume_7d_juno, fees_24h_usd, fees_24h_juno, updated_at, refreshed_at)
  SELECT chain_id, pool_count, incentivized_pools, tvl_usd, tvl_juno, volume_24h_usd, volume_24h_juno, volume_7d_usd, volume_7d_juno, fees_24h_usd, fees_24h_juno, COALESCE(updated_at, now()), now()
  FROM stats
  ON CONFLICT (chain_id) DO UPDATE SET
    pool_count = EXCLUDED.pool_count,
    incentivized_pools = EXCLUDED.incentivized_pools,
    tvl_usd = EXCLUDED.tvl_usd,
    tvl_juno = EXCLUDED.tvl_juno,
    volume_24h_usd = EXCLUDED.volume_24h_usd,
    volume_24h_juno = EXCLUDED.volume_24h_juno,
    volume_7d_usd = EXCLUDED.volume_7d_usd,
    volume_7d_juno = EXCLUDED.volume_7d_juno,
    fees_24h_usd = EXCLUDED.fees_24h_usd,
    fees_24h_juno = EXCLUDED.fees_24h_juno,
    updated_at = EXCLUDED.updated_at,
    refreshed_at = now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_api_read_models(target_chain_id TEXT DEFAULT NULL)
RETURNS TABLE(model TEXT, rows_affected INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY SELECT 'latest_pool_state'::text, refresh_latest_pool_state(target_chain_id);
  RETURN QUERY SELECT 'pool_volume_windows'::text, refresh_pool_volume_windows(target_chain_id);
  RETURN QUERY SELECT 'pool_candle_buckets'::text, refresh_pool_candle_buckets(target_chain_id, NULL);
  RETURN QUERY SELECT 'wallet_history_flat'::text, refresh_wallet_history_flat(target_chain_id, NULL);
  RETURN QUERY SELECT 'wallet_position_latest'::text, refresh_wallet_position_latest(target_chain_id, NULL);
  RETURN QUERY SELECT 'protocol_stats_latest'::text, refresh_protocol_stats_latest(target_chain_id);
END;
$$;
