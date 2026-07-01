# Astroport-Core DEX Frontend From-Scratch Architecture

Date: 2026-07-01
Task: `t_9177c2ad`
Target repo: `JakeHartnell/astroport-core`
Target app path: `frontend/`

## Decision

Build the new Juno DEX frontend from scratch inside this repo under `frontend/` as an isolated Vite + React + TypeScript app.

Why `frontend/`:

- The repo root is a Rust/CosmWasm workspace (`Cargo.toml`) with `contracts/`, `packages/`, `schemas/`, `deployment/`, and `planning/`; a sibling `frontend/` keeps UI code separate from contracts while still versioning it with the deployment handoff.
- There is no existing `package.json`, so a standalone JS app avoids contaminating the Rust workspace and CI until the frontend lane is ready.
- `deployment/` already owns the frontend handoff (`juno-v1-frontend-config.d.ts`, release checklist, config example), so `frontend/` can consume repo-local deployment/record artifacts without moving back to `juno-website`.

Do not revive the superseded `juno-website` implementation. Treat earlier Juno DEX docs as product input only.

## Product frame

V1 is a boring, trustable Juno-native DEX surface:

- Swap verified Astroport-Juno XYK pools.
- Browse pools.
- Inspect a pool.
- Add/remove liquidity.
- Show wallet, quote, tx, explorer, and error states clearly.

Explicit non-goals for V1:

- no DEX token,
- no stablecoin/LST/perps/lending/vaults/launchpad,
- no stable/PCL pool launch dependency,
- no charts, volume, TVL USD, APY, rewards dashboard, or recent-trade feed unless a later indexer/API lane supplies it,
- no public liquidity recommendation; label the first pool thin-liquidity experimental.

## Current deployment inputs

Local `deployment/records/` is not present in this checkout, but PR #9 on `JakeHartnell/astroport-core` is open and adds:

- `deployment/records/README.md`
- `deployment/records/juno-v1-mainnet-deployment-2026-07-01.md`

PR #9 records a live `juno-1` Astroport-Juno v1 deployment:

- factory: `juno1n5ettlqdt06nd346mnqy65fahcvmncaazpwn8s3m0df3ldv0d2yqjqelca`
- first pair: `juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv`
- native coin registry: `juno1qwer7jleluth33trk2ywqvp6vwjh4j4zar3ag6dw5d8derkpel0sq8vfh2`
- router: `juno1fppwfa2efpsahvwlqprrshjth2mfqyd8n80yd7z5kpjspq30s8ksrapa8s`
- incentives: `juno1h0auy2knfyhkcn877cqun0fu00safgsjwvt82d4cvd0slv8q7wtsk59598`
- oracle: `juno1szsxu32r7rnu5wq7yqlxq4x46g0fq7qpzyggcvgsh2cq554mcuqql6jw4p`
- first pool assets: `ujuno` / `factory/juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76/junoagenttest202607010323`
- LP denom: `factory/juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv/astroport/share`

The PR says factory pair, pair pool, pair simulation, router config, native registry, and smoke swap/add/withdraw checks all passed. Use these as preview/test data, not as broad public-launch copy.

## Proposed stack

Use:

- Vite
- React
- TypeScript
- React Router or TanStack Router
- TanStack Query for async chain reads/mutations
- CosmJS: `@cosmjs/cosmwasm-stargate`, `@cosmjs/stargate`, `@cosmjs/proto-signing`
- Keplr wallet first; Leap can be added behind the same adapter if trivial
- CSS modules or a tiny local CSS system; defer Tailwind unless the frontend lane wants a heavier design-token setup
- Vitest + React Testing Library for pure logic/components
- Playwright only after routes exist

Do not introduce Next/Nuxt/Storyblok. The app should be static-hostable and independent of CMS availability.

## Route map

- `/` — redirect or link to `/swap` inside the frontend app.
- `/swap` — default swap screen for direct XYK pair swaps.
- `/pools` — pool list from strict registry plus live pair queries.
- `/pools/:pairAddress` — pool detail, reserves, LP denom, add/remove liquidity tabs.
- `/liquidity` — wallet-centric LP overview; in V1 it may link users to pool detail pages if no wallet-position indexer exists.
- Settings should be a modal, not a route, for slippage and endpoint display.

If the app is hosted under a larger site later, mount it at `/dex/*` with the same internal route names.

## Frontend directory layout

```text
frontend/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    app/App.tsx
    app/routes.tsx
    config/chains.ts
    config/registry.ts
    config/deployment.ts
    data/registry.juno-1.json
    lib/astroport/assetInfo.ts
    lib/astroport/messages.ts
    lib/astroport/queries.ts
    lib/cosmjs/clients.ts
    lib/format/amounts.ts
    lib/format/addresses.ts
    wallet/keplr.ts
    wallet/types.ts
    queries/useDexRegistry.ts
    queries/usePools.ts
    queries/useSwapQuote.ts
    queries/useWalletBalances.ts
    mutations/useSwapTx.ts
    mutations/useProvideLiquidityTx.ts
    mutations/useWithdrawLiquidityTx.ts
    components/layout/DexShell.tsx
    components/wallet/WalletConnectButton.tsx
    components/wallet/ChainStatusBadge.tsx
    components/swap/SwapPage.tsx
    components/swap/SwapForm.tsx
    components/swap/TokenSelect.tsx
    components/swap/QuoteCard.tsx
    components/pools/PoolsPage.tsx
    components/pools/PoolTable.tsx
    components/pools/PoolDetailPage.tsx
    components/liquidity/AddLiquidityForm.tsx
    components/liquidity/RemoveLiquidityForm.tsx
    components/tx/TxStatusDialog.tsx
    components/common/ExplorerLink.tsx
    components/common/RiskNotice.tsx
    styles/theme.css
```

## Registry/config source

V1 should use a strict static registry committed under `frontend/src/data/registry.juno-1.json`, generated from deployment records when possible.

Required registry shape:

- top level: `chainId`, `rpcEndpoint`, `restEndpoint`, `factory`, `nativeCoinRegistry`, optional `router`, optional `incentives`, optional `oracle`, `updatedAt`, `pools[]`
- pool: `id`, `label`, `pair`, `lpToken`, `type: "xyk"`, `feeBps`, `assets`, `explorer`, `enabled`, optional `featured`, optional `notes`
- asset: `kind: "native" | "ibc" | "cw20"`, `id`, `symbol`, `decimals`, optional `denomTrace`, optional `logoURI`

Initial preview registry can include only the PR #9 test pool, marked clearly as experimental/thin-liquidity. Do not show placeholder pools.

Future improvement: add a repo-local generator that reads `deployment/records/*.md` or rendered deployment JSON and emits `frontend/src/data/registry.juno-1.json`, then validates no placeholder addresses or unsupported pool types are present.

## Chain query and wallet strategy

Read-only mode:

- Load strict registry first.
- Query factory `pairs` and/or `pair` to verify registry pairs.
- Query pair `pool` for reserves and total share.
- Query pair `simulation` for quotes.
- Query native coin registry `native_token` / `native_tokens` for denom precision checks.
- Hide TVL, volume, APR, and charts unless separately backed by an API/indexer.

Wallet mode:

- Detect Keplr.
- Suggest/enable `juno-1`.
- Create `SigningCosmWasmClient` from configured RPC.
- Query native balances through Stargate/CosmWasm client.
- Direct swap: execute pair `swap` with native funds and slippage-derived `belief_price`/`max_spread` or `minimum_receive` fields supported by the schema path.
- Add liquidity: execute pair `provide_liquidity` with native funds, slippage tolerance, and optional `min_lp_to_receive` when available.
- Remove liquidity: execute pair `withdraw_liquidity`; for TokenFactory LP denoms, send the LP denom as funds if required by the contract flow.

Router/multi-hop:

- Keep router config available but disabled by default.
- Add router only after direct pair swaps are tested in the app.
- Use `astro_swap` operations; do not rely on `native_swap` until verified against this Juno router implementation.

## Styling/design posture

Direction: "Juno utility terminal," not generic DeFi casino.

- Dark background, high-contrast panels, restrained cyan/salmon accents.
- Contract addresses, denoms, LP denom, and explorer links must be visible/copyable.
- Always show an experimental/thin-liquidity risk notice before first swap/liquidity action.
- Mobile-first swap card; pools can collapse to cards.
- Empty/error states are part of the product: registry missing, RPC degraded, no wallet, wrong network, no pair, quote failure, insufficient funds, user rejection, tx failure.

## First implementation slices

### Slice 1 — app skeleton and static registry

Files:

- create `frontend/package.json`, Vite config, TS config, `index.html`
- create `frontend/src/app/App.tsx`, `frontend/src/main.tsx`, route shell
- create `frontend/src/data/registry.juno-1.json` with the PR #9 preview pool
- create `frontend/src/config/registry.ts` with strict parsing and placeholder rejection

Verification:

```sh
cd frontend
npm install
npm run typecheck
npm run build
```

Acceptance:

- `/swap`, `/pools`, and `/pools/:pairAddress` render from local registry data.
- Placeholder addresses fail a unit test.

### Slice 2 — read-only contract queries

Files:

- `src/lib/cosmjs/clients.ts`
- `src/lib/astroport/assetInfo.ts`
- `src/lib/astroport/queries.ts`
- `src/queries/usePools.ts`
- `src/queries/useSwapQuote.ts`

Verification:

```sh
cd frontend
npm test
npm run typecheck
npm run build
```

Acceptance:

- Pool page displays live reserves from pair `pool` or a clear RPC error.
- Swap page can quote the direct PR #9 pair through pair `simulation` in read-only mode.

### Slice 3 — wallet connect and network guard

Files:

- `src/wallet/types.ts`
- `src/wallet/keplr.ts`
- `src/components/wallet/WalletConnectButton.tsx`
- `src/components/wallet/ChainStatusBadge.tsx`

Acceptance:

- No wallet: read-only mode remains usable.
- Wrong network: app offers `juno-1` suggest/enable recovery.
- Connected wallet shows address and native balances.

### Slice 4 — direct swap execution

Files:

- `src/lib/astroport/messages.ts`
- `src/mutations/useSwapTx.ts`
- `src/components/swap/SwapForm.tsx`
- `src/components/tx/TxStatusDialog.tsx`

Acceptance:

- Direct native-token swap can broadcast against the preview pool.
- UI shows pending/success/failure and Mintscan tx link.
- Quote failures and slippage warnings disable submit.

### Slice 5 — pool detail and liquidity operations

Files:

- `src/components/pools/PoolDetailPage.tsx`
- `src/components/liquidity/AddLiquidityForm.tsx`
- `src/components/liquidity/RemoveLiquidityForm.tsx`
- `src/mutations/useProvideLiquidityTx.ts`
- `src/mutations/useWithdrawLiquidityTx.ts`

Acceptance:

- Pool detail shows reserves, LP denom, and explorer links.
- Add/remove forms simulate where possible and broadcast small smoke txs against the preview pool.
- User LP balance and post-tx refresh work.

### Slice 6 — release hardening

Files:

- add CI job for `frontend/` install, typecheck, tests, build
- add registry validation script or test
- add `frontend/README.md` with runbook and risk copy

Acceptance:

- Frontend CI runs independently of Rust contract checks.
- Registry strict mode blocks placeholders, non-`juno-1`, non-XYK V1 pools, missing explorer links, duplicate IDs, and missing required deployment addresses.

## Open questions / blockers for implementation lane

- Confirm package manager preference (`npm`, `pnpm`, or `yarn`). Default to npm unless the repo adopts a JS package manager standard.
- Confirm whether PR #9 deployment records will be merged before the first frontend PR. If not, copy the required public summary values into the frontend registry with a comment pointing to PR #9.
- Confirm owner/admin transfer posture before public copy: PR #9 says hot wallet owns/guards/treasury for thin-liquidity testing; broader public promotion should prefer DAO-controlled owner/admin roles.
- Confirm first counterparty asset naming: the first pool counterparty is a TokenFactory test denom, so UI copy should label it as test/preview until real launch assets are approved.

## Evidence inspected

Repo-local:

- `Cargo.toml` — Rust workspace only; no frontend package exists.
- `README.md` — upstream Astroport contract repo shape.
- `deployment/README.md` — frontend consumption handoff and no-hardcoded-pools guidance.
- `deployment/juno-v1-readiness-plan.md` — XYK-only deployment and frontend readiness gates.
- `deployment/MAINNET_DEPLOYMENT.md` — mainnet/frontend handoff and smoke requirements.
- `deployment/frontend-release-checklist.md` — frontend address surface and release blockers.
- `deployment/juno-v1-frontend-config.d.ts` and `.example.ts` — generated frontend type/address contract.
- `planning/17-frontend-schema-surface-2026-06-29.md` — contract query/execute surface.
- `schemas/astroport-factory/raw/query.json` — `pair`, `pairs`, `fee_info` queries.
- `schemas/astroport-pair/raw/query.json` and `execute.json` — `pool`, `simulation`, `simulate_provide`, `simulate_withdraw`, `swap`, `provide_liquidity`, `withdraw_liquidity`.
- `schemas/astroport-router/raw/query.json` — router simulation surface.
- `schemas/astroport-native-coin-registry/raw/query.json` — denom metadata surface.

Prior DEX notes:

- `/opt/data/repos/juno-dex-v1-product-architecture-spec.md`
- `/opt/data/repos/juno-dex-v1-data-layer-spec.md`
- `/opt/data/repos/juno-dex-frontend-v1-design.md`

Remote PR evidence:

- `https://github.com/JakeHartnell/astroport-core/pull/9` — open PR adding `deployment/records/` with real mainnet deployment summary.

## Recommended next Kanban tasks

1. Frontend engineer: create `frontend/` Vite React skeleton and strict registry using this plan.
2. Frontend/data engineer: implement read-only CosmWasm queries against the PR #9 preview pool.
3. QA/reviewer: verify registry copy against PR #9 and smoke query pool/simulation from the UI runtime before any swap execution work.
