import { refreshApiReadModels, type PgPool } from "./db.js";

export class ReadModelRefresher {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly pool: PgPool,
    private readonly options: { chainId: string; intervalMs: number },
  ) {}

  async refreshOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const client = await this.pool.connect();
    try {
      const results = await refreshApiReadModels(client, { chainId: this.options.chainId });
      console.log(JSON.stringify({
        msg: "indexer_read_models_refreshed",
        role: "indexer",
        models: results,
      }));
    } finally {
      client.release();
      this.running = false;
    }
  }

  start(): void {
    if (this.options.intervalMs <= 0 || this.timer) return;
    this.timer = setInterval(() => {
      this.refreshOnce().catch((error) => {
        console.warn("indexer_read_models_refresh_failed", { error: error instanceof Error ? error.message : String(error) });
      });
    }, this.options.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
