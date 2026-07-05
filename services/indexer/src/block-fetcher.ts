import type { BlockBundle, JunoRpcClient } from "./rpc.js";

export type FetchBlockRangeParams = {
  rpc: JunoRpcClient;
  from: number;
  to: number;
  concurrency: number;
};

export async function fetchBlockRange({ rpc, from, to, concurrency }: FetchBlockRangeParams): Promise<BlockBundle[]> {
  if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error("block range bounds must be integer heights");
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("block range concurrency must be an integer greater than or equal to 1");
  if (to < from) return [];

  const heights = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const bundles = new Map<number, BlockBundle>();
  let nextIndex = 0;
  let failed = false;

  async function worker(): Promise<void> {
    for (;;) {
      if (failed) return;
      const index = nextIndex;
      nextIndex += 1;
      const height = heights[index];
      if (height === undefined) return;
      try {
        bundles.set(height, await rpc.block(height));
      } catch (error) {
        failed = true;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`failed to fetch block ${height}: ${message}`, { cause: error });
      }
    }
  }

  const workerCount = Math.min(concurrency, heights.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return heights.map((height) => {
    const bundle = bundles.get(height);
    if (!bundle) throw new Error(`missing fetched block ${height}`);
    return bundle;
  });
}
