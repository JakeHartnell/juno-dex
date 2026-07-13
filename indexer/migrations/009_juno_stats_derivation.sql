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
