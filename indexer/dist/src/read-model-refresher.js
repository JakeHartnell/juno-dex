import { refreshApiReadModels } from "./db.js";
export class ReadModelRefresher {
    pool;
    options;
    timer;
    running = false;
    constructor(pool, options) {
        this.pool = pool;
        this.options = options;
    }
    async refreshOnce() {
        if (this.running)
            return;
        this.running = true;
        const client = await this.pool.connect();
        try {
            const results = await refreshApiReadModels(client, { chainId: this.options.chainId });
            console.log(JSON.stringify({
                msg: "indexer_read_models_refreshed",
                role: "indexer",
                models: results,
            }));
        }
        finally {
            client.release();
            this.running = false;
        }
    }
    start() {
        if (this.options.intervalMs <= 0 || this.timer)
            return;
        this.timer = setInterval(() => {
            this.refreshOnce().catch((error) => {
                console.warn("indexer_read_models_refresh_failed", { error: error instanceof Error ? error.message : String(error) });
            });
        }, this.options.intervalMs);
        this.timer.unref();
    }
    stop() {
        if (!this.timer)
            return;
        clearInterval(this.timer);
        this.timer = undefined;
    }
}
