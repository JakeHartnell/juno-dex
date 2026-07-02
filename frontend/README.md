# Astroport Core Juno DEX Frontend

From-scratch Vite/React/TypeScript frontend for the in-repo Astroport-Juno deployment lane.

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

Typed Astroport contract clients, message composers, and schema types are generated with `@cosmwasm/ts-codegen` into `src/lib/generated/`. Regenerate them after schema changes with:

```sh
npm run codegen
```

The generator reads the committed Astroport schema directories under `../schemas/astroport-*/raw/` and currently emits SDKs for factory, pair, router, incentives, oracle, and native-coin-registry. Pair stable and pair concentrated clients will be emitted automatically once their schema directories are committed.

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
