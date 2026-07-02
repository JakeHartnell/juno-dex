# Juno DEX Frontend

From-scratch Vite/React/TypeScript frontend for the in-repo Juno DEX deployment lane.

## Commands

```sh
npm install
npm run codegen
npm run typecheck
npm test
npm run build
npm run dev
```

## Contract code generation

Typed contract clients, message composers, and schema types are generated with `@cosmwasm/ts-codegen` into `src/lib/generated/`. Regenerate them after schema changes with:

```sh
npm run codegen
```

The generator reads the committed schema directories under `../schemas/astroport-*/raw/` and currently emits SDKs for factory, pair, router, incentives, oracle, and native-coin-registry. Pair stable and pair concentrated clients will be emitted automatically once their schema directories are committed.

## Scope

V1 is intentionally narrow: a Juno-native read-only DEX surface with Keplr connection, one strict preview pool registry, pool reserve queries, direct pair quote queries, and transaction hooks for direct swap/provide/withdraw flows. The first TokenFactory counterparty is marked preview/test and thin-liquidity until launch assets and ownership posture are confirmed.

## Theme and design system

The frontend is wrapped in `@interchain-ui/react`'s `ThemeProvider` from `src/main.tsx` with `themeMode="dark"`; there is intentionally no light-mode surface. Juno brand tokens live in `src/theme/junoTheme.ts` and are the source of truth for the app palette, radii, spacing, typography, and shadows.

- `interchainJunoTheme` maps the Juno palette into Interchain UI theme variables.
- `junoCssVars` exposes the same tokens as CSS custom properties for legacy/local surfaces that Interchain UI primitives do not cover yet.
- `src/styles/theme.css` should stay thin and reference those variables rather than hard-coded colors.
- Brand artwork is local, original SVG under `src/assets/`; do not fetch or commit third-party/copyrighted logo files unless their license is explicit.

New UI work should prefer Interchain UI primitives (`Box`, `Stack`, `Text`, `Button`, etc.) and use local CSS only for DEX-specific composition.

## Registry rules

`src/data/registry.juno-1.json` is the source for the app shell. `src/config/registry.ts` validates that it is `juno-1`, contains only enabled XYK pools, has real-looking Juno addresses, has explorer links, and does not contain placeholder strings.

## Runtime configuration

The static build reads public Vite variables at build time. Copy `.env.example` to `.env.local` for local overrides, and set the same names in the static host for preview and production environments:

| Variable | Purpose |
| --- | --- |
| `VITE_DEX_RPC_URL` | Public Juno RPC endpoint shown in status and used by on-chain reads. |
| `VITE_DEX_REST_URL` | Public Juno REST/LCD endpoint used for smart queries. |
| `VITE_DEX_EXPLORER_URL` | Explorer base URL for contract/account links. |
| `VITE_DEX_INDEXER_URL` | Stable HTTPS indexer/API origin consumed by analytics, candles, and wallet history. |
| `VITE_DEX_INDEXER_DISABLED` | Set `true` to force on-chain fallback while keeping the UI deployable. |
| `VITE_DEX_INDEXER_TIMEOUT_MS`, `VITE_DEX_INDEXER_RETRY`, `VITE_DEX_INDEXER_STALE_AFTER_MS`, `VITE_DEX_INDEXER_CIRCUIT_BREAKER_MS` | Client-side indexer resilience knobs. |

`VITE_DEX_RPC_URL`, `VITE_DEX_REST_URL`, and `VITE_DEX_EXPLORER_URL` override the committed registry endpoints during `npm run build`; contract addresses and pool metadata still come from `src/data/registry.juno-1.json`.

## Static hosting and CI/CD

The frontend is configured for Vercel static hosting via `vercel.json`:

- Pull requests receive Vercel preview deployments when the repository or Vercel Git integration is enabled.
- Pushes/merges to `main` deploy the production frontend.
- The GitHub Actions deployment workflow is gated by repository variable `VERCEL_ENABLED=true` and uses `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets. Keep API keys and deployment tokens in GitHub/Vercel secrets only.
- Vercel project root should be `frontend`, install command `npm ci`, build command `npm run build`, output directory `dist`.

Recommended release flow:

1. Open a PR and wait for `Frontend CI` (`npm ci`, typecheck, lint, unit tests, E2E, build) and the Vercel preview to pass.
2. Verify the preview points at the intended preview indexer URL and that indexer-dependent panels gracefully fall back if `/health` is unavailable.
3. Set production Vercel env vars, especially `VITE_DEX_INDEXER_URL`, to the stable indexer/API HTTPS URL before merging.
4. Merge to `main`; the production deploy should run automatically.
5. Smoke-check the production domain over TLS: app loads, wallet connection opens, RPC status reports a Juno block, and the configured indexer `/health` returns `status: ok` or UI fallback is intentional.

## Domain and TLS

Use the static host's managed TLS. Point the production DNS record at the host target only after a successful preview/prod deployment, then verify:

```sh
curl -I https://<frontend-domain>/
curl -fsS "$VITE_DEX_INDEXER_URL/health"
```

Do not commit DNS provider credentials, Vercel tokens, or private deployment material.
