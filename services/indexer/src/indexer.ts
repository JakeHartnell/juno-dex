import type { IndexerConfig } from "./config.js";
import { fetchBlockRange } from "./block-fetcher.js";
import { advanceCursor, createPool, enqueueSnapshotJobs, getCursor, recordProcessedBlock, upsertPoolStateSnapshot, writeNormalizedEvents, type PgClient, type PgPool } from "./db.js";
import { normalizeBlockEvents, type NormalizedEvent } from "./events.js";
import { JunoRestClient, JunoRpcClient, type BlockBundle, type ChainHead } from "./rpc.js";
import { nextBlockRange } from "./ranges.js";

type PlannedRange = { head: ChainHead; target: number; lastHeight: number; from: number; to: number; empty: boolean };
type DecodedBlock = { block: BlockBundle; events: NormalizedEvent[] };

export class Indexer {
  private readonly rpc: JunoRpcClient;
  private readonly rest: JunoRestClient;
  private readonly pool?: PgPool;
  private readonly ownsPool: boolean;

  constructor(private readonly config: IndexerConfig, pool?: PgPool) {
    this.rpc = new JunoRpcClient(config.rpcUrl, { timeoutMs: config.rpcTimeoutMs, maxRetries: config.rpcMaxRetries });
    this.rest = new JunoRestClient(config.restUrl);
    this.pool = pool ?? (config.dryRun ? undefined : createPool(config));
    this.ownsPool = !pool && !config.dryRun;
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool?.end();
  }

  async runOnce(maxHeight?: number): Promise<{ processed: number; head: number; target: number; cursorHeight: number }> {
    const planned = await this.planRange(maxHeight);
    if (planned.empty) return { processed: 0, head: planned.head.height, target: planned.target, cursorHeight: planned.lastHeight };

    const blocks = await this.fetchRange(planned.from, planned.to);
    const decoded = blocks.map((block) => this.normalizeBlock(block));
    const processed = await this.writeBlocksInOrder(decoded);

    return { processed, head: planned.head.height, target: planned.target, cursorHeight: planned.to };
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

  private async planRange(maxHeight?: number): Promise<PlannedRange> {
    const head = await this.rpc.head();
    const target = Math.max(0, head.height - this.config.confirmationDepth);
    const lastHeight = this.config.dryRun
      ? Math.max(0, this.config.startHeight - 1)
      : await withClient(this.pool!, (client) => getCursor(client, this.config.cursorId, this.config.chainId, this.config.startHeight));
    const { from, to, empty } = nextBlockRange({ lastHeight, confirmedTarget: target, batchSize: this.config.batchSize, maxHeight });
    return { head, target, lastHeight, from, to, empty };
  }

  private fetchRange(from: number, to: number): Promise<BlockBundle[]> {
    return fetchBlockRange({
      rpc: this.rpc,
      from,
      to,
      concurrency: this.config.indexerMode === "catchup" ? this.config.fetchConcurrency : this.config.realtimeFetchConcurrency,
    });
  }

  private normalizeBlock(block: BlockBundle): DecodedBlock {
    const events = block.txEvents.flatMap((tx) =>
      normalizeBlockEvents(
        tx.events,
        { chainId: this.config.chainId, height: block.height, blockTime: block.time, txHash: tx.txHash },
        { factoryAddress: this.config.factoryAddress, incentivesAddress: this.config.incentivesAddress },
      ),
    );
    return { block, events };
  }

  private async writeBlocksInOrder(blocks: DecodedBlock[]): Promise<number> {
    let processed = 0;
    for (const { block, events } of blocks) {
      if (this.config.dryRun) {
        console.log(JSON.stringify({ height: block.height, hash: block.hash, events }, null, 2));
      } else {
        await this.writeBlock(block, events);
        if (this.config.ingestReserveSnapshotsInline) {
          await this.writeReserveSnapshots(events, block.height, block.time);
        }
      }
      processed += 1;
    }
    return processed;
  }

  private async writeBlock(block: BlockBundle, events: NormalizedEvent[]): Promise<void> {
    await withClient(this.pool!, async (client) => {
      await client.query("BEGIN");
      try {
        await recordProcessedBlock(client, {
          chainId: this.config.chainId,
          height: block.height,
          blockHash: block.hash,
          parentHash: block.parentHash,
          blockTime: block.time,
          txCount: block.txCount,
        });
        await writeNormalizedEvents(client, this.config.chainId, events, { writeCandlesInline: this.config.ingestCandlesInline });
        if (!this.config.ingestReserveSnapshotsInline) {
          await enqueueSnapshotJobs(client, {
            chainId: this.config.chainId,
            pairAddresses: touchedPairAddresses(events),
            height: block.height,
            blockTime: block.time,
            reason: "touched",
          });
        }
        await advanceCursor(client, { cursorId: this.config.cursorId, height: block.height, blockHash: block.hash });
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  private async writeReserveSnapshots(events: NormalizedEvent[], height: number, blockTime: string): Promise<void> {
    const touchedPairs = touchedPairAddresses(events);
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

function touchedPairAddresses(events: NormalizedEvent[]): string[] {
  return Array.from(new Set(events
    .filter(isPairStateEvent)
    .map((event) => event.pairAddress)
    .filter(Boolean)));
}

function isPairStateEvent(event: NormalizedEvent): event is Extract<NormalizedEvent, { kind: "swap" | "provide" | "withdraw" }> {
  return event.kind === "swap" || event.kind === "provide" || event.kind === "withdraw";
}

async function withClient<T>(pool: PgPool, fn: (client: PgClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
