CREATE TABLE IF NOT EXISTS candle_jobs (
  id BIGSERIAL PRIMARY KEY,
  chain_id TEXT NOT NULL,
  pair_address TEXT NOT NULL,
  from_time TIMESTAMPTZ NOT NULL,
  to_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  worker_id TEXT,
  last_error TEXT,
  claimed_at TIMESTAMPTZ,
  run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_swaps INTEGER NOT NULL DEFAULT 0,
  rerun_requested BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  CHECK (to_time > from_time),
  UNIQUE (chain_id, pair_address, from_time, to_time)
);

CREATE INDEX IF NOT EXISTS candle_jobs_claim_idx
  ON candle_jobs (status, run_after, created_at);
CREATE INDEX IF NOT EXISTS candle_jobs_pair_range_idx
  ON candle_jobs (chain_id, pair_address, from_time, to_time);

CREATE INDEX IF NOT EXISTS swaps_pair_time_order_idx
  ON swaps (chain_id, pair_address, block_time, height, msg_index, event_index, id);