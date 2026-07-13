DROP VIEW IF EXISTS latest_pool_states;
CREATE VIEW latest_pool_states AS
SELECT DISTINCT ON (p.chain_id, p.pair_address)
  p.chain_id,
  p.id AS pool_id,
  p.pair_address,
  p.liquidity_token_address,
  p.pool_type,
  p.asset_infos,
  p.created_height,
  p.created_tx_hash,
  p.first_seen_at,
  p.updated_at,
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
ORDER BY p.chain_id, p.pair_address, s.height DESC NULLS LAST,
  CASE s.source
    WHEN 'lcd' THEN 0
    WHEN 'event' THEN 1
    ELSE 2
  END,
  s.created_at DESC;
