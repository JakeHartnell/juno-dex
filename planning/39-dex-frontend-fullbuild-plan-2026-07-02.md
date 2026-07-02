# Juno DEX — full-build frontend plan

Date: 2026-07-02
Working title: **Juno DEX**
Target repo: `JakeHartnell/astroport-core`
App path: `frontend/` · new service: `services/indexer/`

This doc is the canonical plan for taking the Juno DEX from a read-only preview
UI to a **fully featured, production-ready DEX** on top of the forked
`astroport-core` contracts. It supersedes the deliberately-minimal scope of
`38-dex-frontend-from-scratch-architecture-2026-07-01.md` (which framed V1 as a
"boring, trustable" XYK-only preview with many non-goals). The directional
decisions below were made with the owner on 2026-07-02.

## Directive

Build a fully featured production-ready DEX UI. **No features disabled, no
hacks or shortcuts.** Branding roughly off Juno Network (purple/indigo, Juno
logos). Draw from Interchain UI (`@interchain-ui/react`) as the component base.

## Scope decisions (settled 2026-07-02)

| Area | Decision |
|---|---|
| Analytics/data | **Dedicated indexer + API** workstream — real TVL, 24h volume, APR, OHLC price charts, positions, tx history. The chain only exposes current reserves; everything historical needs indexing. |
| Pool types | **All three** — XYK + Stableswap + PCL — *including deploying* the stable/PCL pair codes (only XYK code `5133` is live today). |
| Theme | **Dark-only "Juno utility terminal"** with Juno purple/indigo branding + logos. No light mode. |
| Wallets | **cosmos-kit** multi-wallet (Keplr, Leap, Cosmostation, Station, WalletConnect). Replaces the hand-rolled Keplr adapter. |
| Design system | **Interchain UI** (`@interchain-ui/react`) as the primitive/design-token base; pairs with cosmos-kit. |
| Contract clients | Typed via `@cosmwasm/ts-codegen` from committed `schemas/`. |

## Starting point (as of this doc)

**Contracts — done, live on `juno-1`.** Factory `juno1n5ettlqdt06nd346mnqy65fahcvmncaazpwn8s3m0df3ldv0d2yqjqelca`,
XYK pair code `5133`, router `juno1fppwfa2efpsahvwlqprrshjth2mfqyd8n80yd7z5kpjspq30s8ksrapa8s`,
incentives `juno1h0auy2knfyhkcn877cqun0fu00safgsjwvt82d4cvd0slv8q7wtsk59598`,
oracle `juno1szsxu32r7rnu5wq7yqlxq4x46g0fq7qpzyggcvgsh2cq554mcuqql6jw4p`,
native-coin-registry `juno1qwer7jleluth33trk2ywqvp6vwjh4j4zar3ag6dw5d8derkpel0sq8vfh2`.
Permissionless pair creation is open. Test pair `juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv`
(JUNO / TokenFactory test denom). `pair_stable` + `pair_concentrated` exist
in-repo but are **not deployed**. Details: `deployment/records/juno-v1-mainnet-deployment-2026-07-01.md`.

**Frontend — the gap.** `frontend/` is a Vite + React 19 + TS app (~1,200 LOC)
with solid chain plumbing (CosmJS, TanStack Query, live `simulation`/`pool`
reads, strict registry validation, scaffolded mutations) but **every
user-facing action is disabled or stubbed**:

- Swap button hardcoded to `"Swap disabled: preview mode"`; slippage fixed at
  0.5% / `max_spread` "0.01"; router disabled.
- Add/Remove liquidity forms fully disabled; no LP balance queries.
- Registry has 1 pool, XYK-only, no dynamic discovery.
- Keplr-only hand-rolled adapter; ad-hoc dark CSS; no Interchain UI / cosmos-kit.
- No token logos, no TVL/volume/APR, no charts, no portfolio, no tx history.
- ~7% test coverage.

**Approach: build on the skeleton, do not rewrite.** The plumbing is sound;
we turn features on, layer the design system + wallets, add the data layer, and
extend to all pool types.

## Target architecture

```
                       ┌─────────────────────────────┐
                       │  Juno DEX frontend (Vite/React) │
                       │  @interchain-ui/react (dark)    │
                       │  cosmos-kit wallets             │
                       │  TanStack Query data layer      │
                       └───────┬─────────────┬───────────┘
                 prefers API   │             │  fallback (always works)
                               ▼             ▼
                 ┌─────────────────────┐   ┌──────────────────────┐
                 │  Indexer API        │   │  juno-1 RPC/REST      │
                 │  TVL/vol/APR/OHLC   │   │  CosmWasm queries     │
                 │  positions/history  │   │  (reserves, quotes)   │
                 └──────────┬──────────┘   └──────────────────────┘
                            │ ingests events
                 ┌──────────▼──────────┐
                 │  services/indexer   │  factory/pair/incentives events → Postgres
                 └─────────────────────┘
```

Key principles:

- **Graceful degradation.** The frontend prefers the indexer API but never
  hard-breaks when it's down: core trading/liquidity fall back to direct
  on-chain reads; analytics-only surfaces (charts/volume/APR) show an explicit
  "unavailable" state — never fake zeros.
- **Type safety end to end.** Contract messages generated from `schemas/`.
- **Honest risk UX.** Permissionless pools → verified/unverified signaling,
  thin-liquidity notices, high-price-impact confirmation.

## Epics

| Epic | Theme |
|---|---|
| E0 Foundations | Interchain UI + Juno dark theme, app shell, ts-codegen clients, frontend CI, shared UI kit |
| E1 Wallet | cosmos-kit multi-wallet, network guard, balances |
| E2 Swap | enable execution, slippage/price-impact, token select, reverse quote, multi-hop router, tx lifecycle |
| E3 Pools | dynamic discovery, list w/ TVL/vol/APR, detail, all pool types |
| E4 Liquidity | add/remove w/ simulation, LP positions, incentives staking/claim |
| E5 Pool creation | permissionless create + seed initial liquidity |
| E6 Portfolio | positions + rewards aggregate, tx history |
| E7 Indexer | ingestion, API, OHLC, USD pricing, frontend data layer |
| E8 Assets | chain-registry asset list + logos, verification/risk badges |
| E9 Analytics UI | price/candle charts, stats dashboard |
| E10 Contract ops | deploy stable/PCL, incentive programs + oracle, DAO ownership transfer |
| E11 Quality & release | E2E, state audit, a11y/perf, security review, hosting/CI-CD, launch checklist |

## Milestones

- **M1 — Usable core:** design system + brand, cosmos-kit wallets, real
  direct-pair swap, add/remove liquidity, LP positions. → a working DEX on the
  live pool.
- **M2 — Full trading:** multi-hop router, dynamic pool discovery, token lists +
  logos, all pool types in UI **+ deploy stable/PCL**, pool creation.
- **M3 — Analytics & farming:** indexer + API, TVL/volume/APR, charts, stats
  dashboard, incentives/rewards, portfolio + tx history.
- **M4 — Production hardening:** E2E + coverage, error/empty/a11y/perf, security
  review, DAO ownership transfer, hosting/CI-CD, mainnet launch checklist.

## Issue index

GitHub milestones: `M1 — Usable core` (1), `M2 — Full trading` (2),
`M3 — Analytics & farming` (3), `M4 — Production hardening` (4).

| # | Epic | Milestone | Title |
|---|---|---|---|
| [#12](https://github.com/JakeHartnell/astroport-core/issues/12) | E0 | M1 | Adopt @interchain-ui/react + Juno dark brand theme tokens |
| [#13](https://github.com/JakeHartnell/astroport-core/issues/13) | E0 | M1 | App shell, navigation & responsive layout on interchain-ui |
| [#14](https://github.com/JakeHartnell/astroport-core/issues/14) | E0 | M1 | Generate type-safe contract clients via ts-codegen |
| [#15](https://github.com/JakeHartnell/astroport-core/issues/15) | E0 | M1 | Frontend CI lane: typecheck, lint, test, build |
| [#16](https://github.com/JakeHartnell/astroport-core/issues/16) | E0 | M1 | Shared UI kit: token amount input, modal, toasts, skeletons, empty/error states |
| [#17](https://github.com/JakeHartnell/astroport-core/issues/17) | E1 | M1 | Integrate cosmos-kit multi-wallet; retire hand-rolled Keplr adapter |
| [#18](https://github.com/JakeHartnell/astroport-core/issues/18) | E1 | M1 | Network guard: juno-1 suggest/enable + wrong-network recovery |
| [#19](https://github.com/JakeHartnell/astroport-core/issues/19) | E1 | M1 | Wallet balances (native/IBC/LP) + address UX |
| [#20](https://github.com/JakeHartnell/astroport-core/issues/20) | E2 | M1 | Enable real direct-pair swap execution (remove preview gating) |
| [#21](https://github.com/JakeHartnell/astroport-core/issues/21) | E2 | M1 | Configurable slippage, price impact & minimum-received (settings modal) |
| [#22](https://github.com/JakeHartnell/astroport-core/issues/22) | E2 | M1 | Token selector: searchable list with logos, balances & favorites |
| [#23](https://github.com/JakeHartnell/astroport-core/issues/23) | E2 | M2 | Exact-out / reverse quoting + input debounce + quote refresh & expiry |
| [#24](https://github.com/JakeHartnell/astroport-core/issues/24) | E2 | M2 | Multi-hop routing via router contract |
| [#25](https://github.com/JakeHartnell/astroport-core/issues/25) | E2 | M1 | Swap tx lifecycle: pending/success/fail, error decoding, Mintscan links |
| [#26](https://github.com/JakeHartnell/astroport-core/issues/26) | E3 | M2 | Dynamic pool discovery from factory pairs + registry merge |
| [#27](https://github.com/JakeHartnell/astroport-core/issues/27) | E3 | M2 | Pool list: TVL / 24h volume / APR / fee tier with search, sort, filters |
| [#28](https://github.com/JakeHartnell/astroport-core/issues/28) | E3 | M2 | Pool detail page + per-pool analytics |
| [#29](https://github.com/JakeHartnell/astroport-core/issues/29) | E3 | M2 | Pool-type support in UI: XYK, Stableswap, PCL |
| [#30](https://github.com/JakeHartnell/astroport-core/issues/30) | E4 | M1 | Add liquidity: proportional + single-sided with simulation |
| [#31](https://github.com/JakeHartnell/astroport-core/issues/31) | E4 | M1 | Remove liquidity with simulation |
| [#32](https://github.com/JakeHartnell/astroport-core/issues/32) | E4 | M1 | LP position panel: balance, share %, underlying value, quick actions |
| [#33](https://github.com/JakeHartnell/astroport-core/issues/33) | E4 | M3 | Incentives: stake/unstake LP, reward APR, claim rewards |
| [#34](https://github.com/JakeHartnell/astroport-core/issues/34) | E5 | M2 | Permissionless Create Pool flow (type/assets/fee, guardrails) |
| [#35](https://github.com/JakeHartnell/astroport-core/issues/35) | E5 | M2 | Seed initial liquidity + first-provider warnings |
| [#36](https://github.com/JakeHartnell/astroport-core/issues/36) | E6 | M3 | Portfolio page: LP + staked positions, claimable rewards, aggregate value |
| [#37](https://github.com/JakeHartnell/astroport-core/issues/37) | E6 | M3 | Wallet transaction history (swaps/adds/withdraws/claims) |
| [#38](https://github.com/JakeHartnell/astroport-core/issues/38) | E7 | M3 | Stand up services/indexer: event ingestion + Postgres schema |
| [#39](https://github.com/JakeHartnell/astroport-core/issues/39) | E7 | M3 | Indexer API: TVL, volume, APR, pool stats, positions, tx history |
| [#40](https://github.com/JakeHartnell/astroport-core/issues/40) | E7 | M3 | OHLC / candle price history endpoint + backfill |
| [#41](https://github.com/JakeHartnell/astroport-core/issues/41) | E7 | M3 | USD pricing service + denom→USD resolver |
| [#42](https://github.com/JakeHartnell/astroport-core/issues/42) | E7 | M3 | Frontend data-access layer with graceful on-chain fallback |
| [#43](https://github.com/JakeHartnell/astroport-core/issues/43) | E8 | M2 | Chain-registry-backed asset list (logos, decimals, IBC denom traces) |
| [#44](https://github.com/JakeHartnell/astroport-core/issues/44) | E8 | M2 | Token verification/flagging + risk badges |
| [#45](https://github.com/JakeHartnell/astroport-core/issues/45) | E9 | M3 | Price / candle chart component (pool + swap widget) |
| [#46](https://github.com/JakeHartnell/astroport-core/issues/46) | E9 | M3 | Stats dashboard / home: protocol metrics + top pools |
| [#47](https://github.com/JakeHartnell/astroport-core/issues/47) | E10 | M2 | Deploy + register Stableswap and PCL pair codes on juno-1 |
| [#48](https://github.com/JakeHartnell/astroport-core/issues/48) | E10 | M3 | Configure incentive programs + oracle wiring + ops runbook |
| [#49](https://github.com/JakeHartnell/astroport-core/issues/49) | E10 | M4 | DAO ownership/admin transfer + production config hardening |
| [#50](https://github.com/JakeHartnell/astroport-core/issues/50) | E11 | M4 | Playwright E2E for swap / liquidity / create flows |
| [#51](https://github.com/JakeHartnell/astroport-core/issues/51) | E11 | M4 | Error / empty / loading state audit + retries |
| [#52](https://github.com/JakeHartnell/astroport-core/issues/52) | E11 | M4 | Accessibility + performance pass |
| [#53](https://github.com/JakeHartnell/astroport-core/issues/53) | E11 | M4 | Security review: frontend + indexer |
| [#54](https://github.com/JakeHartnell/astroport-core/issues/54) | E11 | M4 | Hosting + CI/CD deploy pipeline |
| [#55](https://github.com/JakeHartnell/astroport-core/issues/55) | E11 | M4 | Mainnet launch checklist + go-live runbook |

## Critical path & sequencing

1. **Foundations first** (#12–#16): theme + shell + ts-codegen + CI + UI kit
   unblock everything.
2. **Wallets** (#17–#19) unblock all execution.
3. **M1 trading loop:** swap execution (#20, #21, #25) + add/remove/positions
   (#30–#32). This yields a genuinely usable DEX on the live pool.
4. **M2 breadth:** discovery (#26) → router (#24) + pool-type UI (#29) +
   assets (#43, #44) + pools list/detail (#27, #28) + creation (#34, #35).
   Contract deploy (#47) gates stable/PCL in production.
5. **M3 data:** indexer (#38–#42) is the backbone for metrics/charts/portfolio
   (#27, #28, #36, #37, #45, #46) and incentives APR (#33, #48).
6. **M4 launch gates:** DAO ownership (#49), security review (#53), E2E (#50),
   hosting (#54), launch checklist (#55). `launch-blocker` label marks the
   hard gates.

## Launch-blocker issues

#47 (all pool types live), #49 (DAO ownership), #53 (security review), #55
(launch checklist) — all must clear before public promotion. Consistent with
the deployment record's recommendation to move owner/admin off the hot wallet
and keep thin-liquidity risk copy until real markets exist.

## Notes for implementation agents

- Every issue body carries context, the relevant contract surface (with schema
  paths + live addresses), files to touch, acceptance criteria, tests, and
  named dependencies. Start from the issue, not this doc.
- Labels: `epic:*` groups the workstream, `area:{frontend,indexer,contracts}`
  routes the skillset, `astroport-juno` scopes the program, `launch-blocker`
  marks hard gates.
- Do not re-disable features behind "preview mode." Keep honest risk UX
  (verified/unverified, thin-liquidity, price-impact) instead.
