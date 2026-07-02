import type { TendermintEvent } from "./events.js";

export type ChainHead = { height: number; hash: string };
export type BlockBundle = {
  height: number;
  hash: string;
  parentHash?: string;
  time: string;
  txCount: number;
  txEvents: Array<{ txHash: string; events: TendermintEvent[] }>;
};

type Json = Record<string, unknown>;

export class JunoRpcClient {
  constructor(private readonly rpcUrl: string) {}

  async head(): Promise<ChainHead> {
    const json = await this.get("/status") as Json;
    const latest = (((json.result as Json).sync_info as Json));
    return { height: Number(latest.latest_block_height), hash: String(latest.latest_block_hash) };
  }

  async block(height: number): Promise<BlockBundle> {
    const [blockJson, resultsJson] = await Promise.all([
      this.get(`/block?height=${height}`) as Promise<Json>,
      this.get(`/block_results?height=${height}`) as Promise<Json>,
    ]);
    const block = (((blockJson.result as Json).block as Json));
    const header = block.header as Json;
    const data = block.data as Json;
    const results = resultsJson.result as Json;
    const txsResults = (results.txs_results ?? []) as Json[];
    const txs = (data.txs ?? []) as string[];
    return {
      height,
      hash: String((blockJson.result as Json).block_id ? ((blockJson.result as Json).block_id as Json).hash : header.last_block_id ?? ""),
      parentHash: String((((header.last_block_id as Json | undefined)?.hash) ?? "")) || undefined,
      time: String(header.time),
      txCount: txs.length,
      txEvents: txsResults.map((tx, index) => ({
        txHash: String(tx.hash ?? `height-${height}-tx-${index}`),
        events: convertEvents((tx.events ?? []) as Json[]),
      })),
    };
  }

  private async get(path: string): Promise<unknown> {
    const response = await fetch(`${this.rpcUrl}${path}`);
    if (!response.ok) throw new Error(`RPC ${path} failed: ${response.status} ${response.statusText}`);
    return response.json();
  }
}

function convertEvents(events: Json[]): TendermintEvent[] {
  return events.map((event) => ({
    type: String(event.type),
    attributes: ((event.attributes ?? []) as Json[]).map((attribute) => ({
      key: String(attribute.key),
      value: String(attribute.value),
      index: Boolean(attribute.index),
    })),
  }));
}
