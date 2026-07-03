import type { IndexerConfig } from "./config.js";
import { advanceCursor, createPool, getCursor, recordProcessedBlock, upsertPoolStateSnapshot, writeNormalizedEvents, type PgPool } from "./db.js";
import { normalizeBlockEvents, type NormalizedEvent } from "./events.js";
import { JunoRestClient, JunoRpcClient } from "./rpc.js";
import { nextBlockRange } from "./ranges.js";

export class Indexer {
  private readonly rpc: JunoRpcClient;
  private readonly rest: JunoRestClient;
  private readonly pool?: PgPool;
  private readonly ownsPool: boolean;

  constructor(private readonly config: IndexerConfig, pool?: PgPool) {
    this.rpc = new JunoRpcClient(config.rpcUrl);
    this.rest = new JunoRestClient(config.restUrl);
    this.pool = pool ?? (config.dryRun ? undefined : createPool(config));
    this.ownsPool = !pool && !config.dryRun;
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool?.end();
  }

  async runOnce(maxHeight?: number): Promise<{ processed: number; head: number; target: number; cursorHeight: number }> {
    const head = await this.rpc.head();
    const target = Math.max(0, head.height - this.config.confirmationDepth);
    const lastHeight = this.config.dryRun
      ? Math.max(0, this.config.startHeight - 1)
      : await withClient(this.pool!, (client) => getCursor(client, this.config.cursorId, this.config.chainId, this.config.startHeight));
    const { from, to, empty } = nextBlockRange({ lastHeight, confirmedTarget: target, batchSize: this.config.batchSize, maxHeight });
    if (empty) return { processed: 0, head: head.height, target, cursorHeight: lastHeight };

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
            await writeNormalizedEvents(client, this.config.chainId, normalized);
            await advanceCursor(client, { cursorId: this.config.cursorId, height, blockHash: block.hash });
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }
        });
        await this.writeReserveSnapshots(normalized, height, block.time);
      }
      processed += 1;
    }
    return { processed, head: head.height, target, cursorHeight: to };
  }

  async runForever(): Promise<void> {
    for (;;) {
      const result = await this.runOnce();
      console.log(`indexer loop processed=${result.processed} head=${result.head} target=${result.target}`);
      await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
    }
  }

  async runUntilHeight(maxHeight: number): Promise<{ processed: number; head: number; target: number; cursorHeight: number; done: boolean }> {
    const result = await this.runOnce(maxHeight);
    if (result.cursorHeight < maxHeight && result.processed === 0) {
      throw new Error(`confirmed target ${result.target} is below requested to-height ${maxHeight}; cursor is at ${result.cursorHeight}`);
    }
    return { ...result, done: result.cursorHeight >= maxHeight };
  }

  private async writeReserveSnapshots(events: NormalizedEvent[], height: number, blockTime: string): Promise<void> {
    const touchedPairs = Array.from(new Set(events
      .filter(isPairStateEvent)
      .map((event) => event.pairAddress)
      .filter(Boolean)));
    if (touchedPairs.length === 0) return;

    const knownPairs = await withClient(this.pool!, async (client) => {
      const result = await client.query<{ pair_address: string }>(
        `SELECT pair_address FROM pools WHERE chain_id = $1 AND pair_address = ANY($2::text[])`,
        [this.config.chainId, touchedPairs],
      );
      return new Set(result.rows.map((row) => row.pair_address));
    });

    for (const pairAddress of touchedPairs) {
      if (!knownPairs.has(pairAddress)) continue;
      try {
        const state = await this.rest.poolState(pairAddress, height);
        await withClient(this.pool!, async (client) => upsertPoolStateSnapshot(client, {
          chainId: this.config.chainId,
          pairAddress,
          height,
          blockTime,
          reserves: state.reserves,
          totalShare: state.totalShare,
          source: "lcd",
        }));
      } catch (error) {
        console.warn("indexer_reserve_snapshot_failed", { pairAddress, height, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

function isPairStateEvent(event: NormalizedEvent): event is Extract<NormalizedEvent, { kind: "swap" | "provide" | "withdraw" }> {
  return event.kind === "swap" || event.kind === "provide" || event.kind === "withdraw";
}

async function withClient<T>(pool: PgPool, fn: (client: import("./db.js").PgClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
