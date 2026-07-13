export type WriterEventKind = "pool_created" | "swap" | "provide" | "withdraw" | "incentive";

export type RangeMetrics = {
  from: number;
  to: number;
  cursor: number;
  head: number;
  target: number;
  blocks: number;
  swaps: number;
  liquidityEvents: number;
  incentiveEvents: number;
  durationMs: number;
  dbDurationMs: number;
};

type RpcErrorCounts = Map<string, number>;
type WriterEventCounts = Map<WriterEventKind, number>;

export class IndexerMetrics {
  private readonly startedAtMs = Date.now();
  private fetchBlocksTotal = 0;
  private rpcRequestsInFlight = 0;
  private readonly rpcErrors: RpcErrorCounts = new Map();
  private decodeBlocksTotal = 0;
  private writerBlocksTotal = 0;
  private writerCommitSeconds: number | null = null;
  private readonly writerEvents: WriterEventCounts = new Map();
  private reorgHalt = 0;

  recordFetchBlock(): void {
    this.fetchBlocksTotal += 1;
  }

  beginRpcRequest(): void {
    this.rpcRequestsInFlight += 1;
  }

  endRpcRequest(): void {
    this.rpcRequestsInFlight = Math.max(0, this.rpcRequestsInFlight - 1);
  }

  recordRpcError(status: string | number): void {
    const key = String(status || "unknown");
    this.rpcErrors.set(key, (this.rpcErrors.get(key) ?? 0) + 1);
  }

  recordDecodedBlock(): void {
    this.decodeBlocksTotal += 1;
  }

  recordWriterBlock(commitSeconds: number): void {
    this.writerBlocksTotal += 1;
    this.writerCommitSeconds = commitSeconds;
  }

  recordWriterEvents(counts: Partial<Record<WriterEventKind, number>>): void {
    for (const [kind, value] of Object.entries(counts) as Array<[WriterEventKind, number | undefined]>) {
      if (!value) continue;
      this.writerEvents.set(kind, (this.writerEvents.get(kind) ?? 0) + value);
    }
  }

  setReorgHalt(halted: boolean): void {
    this.reorgHalt = halted ? 1 : 0;
  }

  snapshot() {
    const elapsedSeconds = Math.max((Date.now() - this.startedAtMs) / 1000, 0);
    const fetchBlocksPerSecond = elapsedSeconds > 0 ? this.fetchBlocksTotal / elapsedSeconds : 0;
    return {
      fetchBlocksTotal: this.fetchBlocksTotal,
      fetchBlocksPerSecond,
      rpcRequestsInFlight: this.rpcRequestsInFlight,
      rpcErrors: new Map(this.rpcErrors),
      decodeBlocksTotal: this.decodeBlocksTotal,
      writerBlocksTotal: this.writerBlocksTotal,
      writerCommitSeconds: this.writerCommitSeconds,
      writerEvents: new Map(this.writerEvents),
      reorgHalt: this.reorgHalt,
    };
  }
}

export const indexerMetrics = new IndexerMetrics();
