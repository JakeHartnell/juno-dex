export function parseNonNegativeInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

export type BlockRangeInput = {
  lastHeight: number;
  confirmedTarget: number;
  batchSize: number;
  maxHeight?: number;
};

export type BlockRange = {
  from: number;
  to: number;
  empty: boolean;
};

export function nextBlockRange(input: BlockRangeInput): BlockRange {
  const from = input.lastHeight + 1;
  const batchTo = input.lastHeight + Math.max(1, input.batchSize);
  const cappedTarget = input.maxHeight === undefined ? input.confirmedTarget : Math.min(input.confirmedTarget, input.maxHeight);
  const to = Math.min(cappedTarget, batchTo);
  return { from, to, empty: to < from };
}
