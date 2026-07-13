ALTER TABLE token_candles
  ADD COLUMN IF NOT EXISTS pool_id UUID REFERENCES pools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pair_address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'indexer';

UPDATE token_candles tc
SET pool_id = p.id
FROM pools p
WHERE tc.pool_id IS NULL
  AND tc.pair_address <> ''
  AND p.chain_id = tc.chain_id
  AND p.pair_address = tc.pair_address;

DROP INDEX IF EXISTS token_candles_asset_interval_idx;
ALTER TABLE token_candles DROP CONSTRAINT IF EXISTS token_candles_chain_id_asset_quote_asset_interval_bucket_start_key;

CREATE UNIQUE INDEX IF NOT EXISTS token_candles_pool_asset_interval_bucket_uq
  ON token_candles (chain_id, pair_address, asset, quote_asset, interval, bucket_start);
CREATE INDEX IF NOT EXISTS token_candles_pool_interval_idx ON token_candles (pair_address, interval, bucket_start DESC);
CREATE INDEX IF NOT EXISTS token_candles_asset_interval_idx ON token_candles (asset, quote_asset, interval, bucket_start DESC);
