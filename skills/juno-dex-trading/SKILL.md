---
name: juno-dex-trading
description: Plan, verify, execute, and monitor swaps and liquidity actions on the Juno DEX using live pool, route, wallet, and indexer data. Use for Juno DEX trading, token swaps, route quotes, slippage checks, liquidity management, LP staking, reward claims, transaction review, or Juno asset and contract verification.
---

# Trade on Juno DEX

Use live Juno mainnet data to prepare and, only when explicitly authorized, execute swaps and liquidity transactions. Treat curated metadata as identity information, not proof of price or liquidity.

## Follow the trading workflow

1. Confirm the requested action, assets, amount, and acceptable slippage. Distinguish an informational quote from authorization to broadcast.
2. Read the current deployment and asset metadata from `frontend/src/data/registry.juno-1.json`. Do not copy contract addresses from memory.
3. Confirm the connected chain is `juno-1`. Keep read-only analysis available when no wallet is connected, but do not construct a claim of execution.
4. Resolve each ticker to its full native denom, TokenFactory denom, IBC hash, or CW20 address. Show the ticker to the user and retain the full identifier for verification and message construction.
5. Query current pools and simulate the route immediately before execution. Prefer the best live route; never invent reserves, prices, candles, volume, APR, or recent activity.
6. Normalize display amounts with each asset's configured decimals. Keep base-unit integers for contract messages. Treat `ujuno` as 6-decimal JUNO.
7. Report expected output, minimum received, route hops, fees, price impact when supported, and material asset or liquidity risks. Require explicit acknowledgement for unverified assets or routes.
8. Requote if the amount, assets, route, slippage, or quote age changes. Disable execution while route simulation is pending or unavailable.
9. Broadcast only after explicit user authorization. Respect wallet rejection as final; do not retry or increase slippage automatically.
10. Return the transaction hash, explorer link, and final chain result. Refresh balances, pool state, quote, and indexed activity after success.

## Apply safety rules

- Never request, expose, store, or transmit a seed phrase or private key.
- Never infer trade authorization from a request to research, quote, explain, diagnose, or review.
- Never substitute a similarly named token. Compare the complete denom or contract address.
- Never silently route through an unverified or thin-liquidity pool.
- Never use stale or placeholder market figures when live data is absent. State that the data is unavailable.
- Never convert a wallet rejection into an automatic retry.
- Never claim success from broadcast intent alone. Verify the returned transaction result.

## Use repository-native interfaces

- Use `frontend/src/lib/astroport/routes.ts` and `frontend/src/queries/useSwapQuote.ts` for route construction and simulation behavior.
- Use `frontend/src/lib/astroport/messages.ts` for direct pair swaps and liquidity messages.
- Use `frontend/src/lib/indexer/client.ts` for candles, metrics, positions, and activity.
- Use `frontend/src/lib/format/amounts.ts` for base/display unit conversion.
- Use `frontend/src/lib/risk.ts` for verification and route-risk policy.
- Use `frontend/src/tx/useTxRunner.tsx` for transaction lifecycle, error decoding, and post-success invalidation.

Inspect these files at execution time because deployment addresses, enabled pools, and application behavior can change.

## Present a trade review

Before an authorized broadcast, summarize:

- network and wallet readiness;
- offered and requested assets with full identifiers;
- display amount and base-unit amount;
- route and pool addresses;
- expected and minimum received;
- max slippage and known price impact;
- warnings requiring acknowledgement.

After broadcast, summarize the confirmed status and provide a copyable transaction hash and explorer link.
