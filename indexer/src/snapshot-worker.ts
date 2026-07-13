import { loadConfig, type IndexerConfig } from "./config.js";
import {
  claimSnapshotJobs,
  createPool,
  markSnapshotJobFailed,
  markSnapshotJobSucceeded,
  upsertPoolStateSnapshot,
  type PgClient,
  type PgPool,
  type SnapshotJob,
} from "./db.js";
import { JunoRestClient } from "./rpc.js";

export type SnapshotWorkerOptions = {
  batchSize?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  pollIntervalMs?: number;
  runForever?: boolean;
};

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 5;

export class SnapshotWorker {
  private readonly pool?: PgPool;
  private readonly ownsPool: boolean;
  private readonly rest: Pick<JunoRestClient, "poolState">;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private readonly maxAttempts: number;
  private readonly pollIntervalMs: number;

  constructor(private readonly config: IndexerConfig, pool?: PgPool, rest?: Pick<JunoRestClient, "poolState">, options: SnapshotWorkerOptions = {}) {
    this.pool = pool ?? createPool(config);
    this.ownsPool = !pool;
    this.rest = rest ?? new JunoRestClient(config.restUrl);
    this.batchSize = options.batchSize ?? intEnv("SNAPSHOT_WORKER_BATCH_SIZE", DEFAULT_BATCH_SIZE);
    this.leaseSeconds = options.leaseSeconds ?? intEnv("SNAPSHOT_JOB_LEASE_SECONDS", DEFAULT_LEASE_SECONDS);
    this.maxAttempts = options.maxAttempts ?? intEnv("SNAPSHOT_JOB_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS);
    this.pollIntervalMs = options.pollIntervalMs ?? config.pollIntervalMs;
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool?.end();
  }

  async processBatch(): Promise<number> {
    const jobs = await withClient(this.pool!, (client) => claimSnapshotJobs(client, {
      chainId: this.config.chainId,
      limit: this.batchSize,
      leaseSeconds: this.leaseSeconds,
      maxAttempts: this.maxAttempts,
    }));
    for (const job of jobs) await this.processJob(job);
    return jobs.length;
  }

  async runForever(): Promise<void> {
    for (;;) {
      const processed = await this.processBatch();
      console.log(`snapshot worker processed=${processed}`);
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  private async processJob(job: SnapshotJob): Promise<void> {
    try {
      const state = await this.rest.poolState(job.pairAddress, job.height);
      await withClient(this.pool!, async (client) => {
        await client.query("BEGIN");
        try {
          await upsertPoolStateSnapshot(client, {
            chainId: job.chainId,
            pairAddress: job.pairAddress,
            height: job.height,
            blockTime: job.blockTime,
            reserves: state.reserves,
            totalShare: state.totalShare,
            source: "lcd",
          });
          await markSnapshotJobSucceeded(client, { jobId: job.id, attempt: job.attempts });
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await withClient(this.pool!, (client) => markSnapshotJobFailed(client, {
        jobId: job.id,
        attempt: job.attempts,
        error: message,
        permanent: isPermanentSnapshotFailure(error),
        maxAttempts: this.maxAttempts,
      }));
    }
  }
}

export function isPermanentSnapshotFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.match(/LCD smart query failed: (\d{3})\b/)?.[1];
  if (status) {
    const code = Number(status);
    return code >= 400 && code < 500 && ![408, 425, 429].includes(code);
  }
  return /no reserves|non-object data|unknown pair/i.test(message);
}

function intEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be an integer greater than or equal to 1`);
  return parsed;
}

async function withClient<T>(pool: PgPool, fn: (client: PgClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = new SnapshotWorker(loadConfig());
  try {
    await worker.runForever();
  } finally {
    await worker.close();
  }
}
