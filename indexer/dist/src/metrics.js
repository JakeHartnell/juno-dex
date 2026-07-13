export class IndexerMetrics {
    startedAtMs = Date.now();
    fetchBlocksTotal = 0;
    rpcRequestsInFlight = 0;
    rpcErrors = new Map();
    decodeBlocksTotal = 0;
    writerBlocksTotal = 0;
    writerCommitSeconds = null;
    writerEvents = new Map();
    reorgHalt = 0;
    recordFetchBlock() {
        this.fetchBlocksTotal += 1;
    }
    beginRpcRequest() {
        this.rpcRequestsInFlight += 1;
    }
    endRpcRequest() {
        this.rpcRequestsInFlight = Math.max(0, this.rpcRequestsInFlight - 1);
    }
    recordRpcError(status) {
        const key = String(status || "unknown");
        this.rpcErrors.set(key, (this.rpcErrors.get(key) ?? 0) + 1);
    }
    recordDecodedBlock() {
        this.decodeBlocksTotal += 1;
    }
    recordWriterBlock(commitSeconds) {
        this.writerBlocksTotal += 1;
        this.writerCommitSeconds = commitSeconds;
    }
    recordWriterEvents(counts) {
        for (const [kind, value] of Object.entries(counts)) {
            if (!value)
                continue;
            this.writerEvents.set(kind, (this.writerEvents.get(kind) ?? 0) + value);
        }
    }
    setReorgHalt(halted) {
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
