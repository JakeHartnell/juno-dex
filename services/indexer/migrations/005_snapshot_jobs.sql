CREATE TABLE IF NOT EXISTS snapshot_jobs (
  id BIGSERIAL PRIMARY KEY,
  chain_id TEXT NOT NULL,
  pair_address TEXT NOT NULL,
  height BIGINT NOT NULL,
  block_time TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'leased', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  leased_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain_id, pair_address, height, reason)
);

CREATE INDEX IF NOT EXISTS snapshot_jobs_claim_idx
  ON snapshot_jobs (status, leased_until, id)
  WHERE status IN ('pending', 'leased');
CREATE INDEX IF NOT EXISTS snapshot_jobs_pair_height_idx
  ON snapshot_jobs (chain_id, pair_address, height DESC);
