# Astroport Core Juno DEX Frontend

From-scratch Vite/React/TypeScript frontend for the in-repo Astroport-Juno deployment lane.

## Commands

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

## Scope

V1 is intentionally narrow: a Juno-native read-only DEX surface with Keplr connection, one strict preview pool registry, pool reserve queries, direct pair quote queries, and transaction hooks for direct swap/provide/withdraw flows. The first TokenFactory counterparty is marked preview/test and thin-liquidity until launch assets and ownership posture are confirmed.

## Registry rules

`src/data/registry.juno-1.json` is the source for the app shell. `src/config/registry.ts` validates that it is `juno-1`, contains only enabled XYK pools, has real-looking Juno addresses, has explorer links, and does not contain placeholder strings.
