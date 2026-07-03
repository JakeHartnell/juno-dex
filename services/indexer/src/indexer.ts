import type { IndexerConfig } from "./config.js";
import { advanceCursor, createPool, getCursor, recordProcessedBlock, writeNormalizedEvent, type PgPool } from "./db.js";
import { normalizeBlockEvents } from "./events.js";
import { JunoRpcClient } from "./rpc.js";

export class Indexer {
  private readonly rpc: JunoRpcClient;
  private readonly pool?: PgPool;
  private readonly ownsPool: boolean;

  constructor(private readonly config: IndexerConfig, pool?: PgPool) {
    this.rpc = new JunoRpcClient(config.rpcUrl);
    this.pool = pool ?? (config.dryRun ? undefined : createPool(config));
    this.ownsPool = !pool && !config.dryRun;
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool?.end();
  }

  async runOnce(): Promise<{ processed: number; head: number; target: number }> {
    const head = await this.rpc.head();
    const target = Math.max(0, head.height - this.config.confirmationDepth);
    const lastHeight = this.config.dryRun
      ? Math.max(0, this.config.startHeight - 1)
      : await withClient(this.pool!, (client) => getCursor(client, this.config.cursorId, this.config.chainId, this.config.startHeight));
    const from = lastHeight + 1;
    const to = Math.min(target, lastHeight + this.config.batchSize);
    if (to < from) return { processed: 0, head: head.height, target };

    let processed = 0;
    for (let height = from; height <= to; height += 1) {
      const block = await this.rpc.block(height);
      const normalized = block.txEvents.flatMap((tx) =>
        normalizeBlockEvents(
          tx.events,
          { chainId: this.config.chainId, height, blockTime: block.time, txHash: tx.txHash },
          { factoryAddress: this.config.factoryAddress, incentivesAddress: this.config.incentivesAddress },
        ),
      );

      if (this.config.dryRun) {
        console.log(JSON.stringify({ height, hash: block.hash, events: normalized }, null, 2));
      } else {
        await withClient(this.pool!, async (client) => {
          await client.query("BEGIN");
          try {
            await recordProcessedBlock(client, {
              chainId: this.config.chainId,
              height,
              blockHash: block.hash,
              parentHash: block.parentHash,
              blockTime: block.time,
              txCount: block.txCount,
            });
            for (const event of normalized) await writeNormalizedEvent(client, this.config.chainId, event);
            await advanceCursor(client, { cursorId: this.config.cursorId, height, blockHash: block.hash });
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }
        });
      }
      processed += 1;
    }
    return { processed, head: head.height, target };
  }

  async runForever(): Promise<void> {
    for (;;) {
      const result = await this.runOnce();
      console.log(`indexer loop processed=${result.processed} head=${result.head} target=${result.target}`);
      await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
    }
  }
}

async function withClient<T>(pool: PgPool, fn: (client: import("./db.js").PgClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
