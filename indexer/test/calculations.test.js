import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateIncentiveApr, calculateTradingFeeApr, normalizePoolRecord } from "../src/calculations.js";

describe("indexer metric calculations", () => {
  it("calculates fee APR from 24h volume, pool fee and TVL", () => {
    assert.equal(calculateTradingFeeApr({ volume24hUsd: 1_000, feeBps: 30, tvlUsd: 10_000 }), 10.95);
  });

  it("calculates incentive APR from daily emissions value and TVL", () => {
    assert.equal(calculateIncentiveApr({ emissionsPerDayUsd: 10, tvlUsd: 10_000 }), 36.5);
  });

  it("normalizes snake_case pool rows and derives fees/APR", () => {
    const pool = normalizePoolRecord({
      pair_address: "juno1pair",
      tvl_usd: "10000",
      volume_24h_usd: "1000",
      fee_bps: "30",
      emissions_per_day_usd: "10",
    });
    assert.equal(pool.pairAddress, "juno1pair");
    assert.equal(pool.fees24hUsd, 3);
    assert.equal(pool.feeApr, 10.95);
    assert.equal(pool.incentivesApr, 36.5);
    assert.equal(pool.totalApr, 47.45);
  });

  it("returns zero APRs when TVL is unavailable", () => {
    const pool = normalizePoolRecord({ pairAddress: "juno1empty", volume24hUsd: 1000, feeBps: 30 });
    assert.equal(pool.feeApr, 0);
    assert.equal(pool.incentivesApr, 0);
    assert.equal(pool.totalApr, 0);
  });
});
