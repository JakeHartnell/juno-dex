export function parseNonNegativeInteger(value, name) {
    if (!/^\d+$/.test(value))
        throw new Error(`${name} must be a non-negative integer`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed))
        throw new Error(`${name} must be a non-negative integer`);
    return parsed;
}
export function nextBlockRange(input) {
    const from = input.lastHeight + 1;
    const batchTo = input.lastHeight + Math.max(1, input.batchSize);
    const cappedTarget = input.maxHeight === undefined ? input.confirmedTarget : Math.min(input.confirmedTarget, input.maxHeight);
    const to = Math.min(cappedTarget, batchTo);
    return { from, to, empty: to < from };
}
