# Juno DEX: UX Improvement Plan

## 1. Diagnosis

Three structural causes, not forty small ones.

**(a) There is no progressive disclosure anywhere.** Every fact the app knows is rendered permanently, at the same visual weight, in the flow of the page. `QuoteCard.tsx:94-155` is a six-row telemetry table that never collapses. `PoolDetailPage.tsx:37-126` is ten stacked full-width sections. `DexShell.tsx:96-103` pins a five-row network diagnostics table into the chrome. Uniswap's swap card has one always-visible line (the rate) and one chevron; ours has six rows, then up to three consent checkboxes, then a badge strip, then a duplicate red error line, then the button.

**(b) Every concept has two-to-four owners, and nobody deleted the old one.** Slippage is settable in two places and displayed in four (`QuoteCard.tsx:122-148` + `SettingsPanel.tsx:40-81` + `SwapForm.tsx:295-298` + `AddLiquidityForm.tsx:198`, the last one being a button with no `onClick`). One transaction fires a toast AND an inline `TxStatusDialog` card AND a TransactionCenter row (`useTxRunner.tsx:110-164`). Pool detail renders the same three action buttons twice (`LpPositionPanel.tsx:100-104` + `PoolDetailPage.tsx:51-59`) and the same risk badges twice (`PoolDetailPage.tsx:44` + `:67`). `/liquidity` is a worse `/portfolio`. `/stats` is dead. Six of the seven reviewer lenses independently landed on this as the top complaint.

**(c) The styling layer is four overlapping half-systems with no scale.** `junoTokens` -> a dead `--juno-*` namespace (44 of 87 vars have zero consumers) -> a retrofitted short-alias namespace that CSS actually reads -> Interchain UI's own theme. On top of that: ~32 distinct font sizes, 18 gap values, 7 card paddings, an **inverted elevation ladder** (cards at `#230A0C` are *darker* than the `#270B0D` canvas they sit on, while carrying an 18px/40px drop shadow), coral used as brand AND accent AND link AND error, 81 `!important` flags fighting Interchain UI, and two undefined vars (`--ease-mech`) that silently kill five transitions.

Fix those three and it stops reading as ugly. Everything else in this document is a consequence.

---

## 2. The Swap page

### Current structure

```
+---------------------------- 980px, centered ---------------------------+
| [ 440px fixed ]                    | [ flex ]                          |
|  SWAP CARD                         |  PriceCandleChart (compact)       |
|   h2 "Swap"           [gear]       |  ---------------------------------|
|   "Sell exact · enter the amount   |  "Market activity"                |
|    you want to send"               |  h3 "Recent transactions"         |
|   [ You send   | TOKEN v ]         |  "Last 10"                        |
|          (flip)                    |  hand-rolled .transaction-list    |
|   [ You receive| TOKEN v ]         |  (10 rows, forked markup)         |
|   "Target output is an estimate…"  |                                   |
|   +--- QuoteCard (always open) --+ |                                   |
|   | Rate                         | |                                   |
|   | Route                        | |                                   |
|   | Price impact                 | |                                   |
|   | Minimum received             | |                                   |
|   | Max slippage [.1][.5][1.0]   | |  <- 2nd slippage control          |
|   | Quote status: expires in 27s | |  <- 1s interval, re-renders form  |
|   +------------------------------+ |                                   |
|   [!] elevated impact notice       |                                   |
|   [x] I understand high impact     |                                   |
|   [!] extreme impact BLOCKED       |                                   |
|   [x] I understand impact unavail. |                                   |
|   [x] I understand high slippage   |                                   |
|   RiskBadgeList (fires on the      |                                   |
|     happy path: "Verified · XYK")  |                                   |
|   [x] RiskAcknowledgement          |                                   |
|   red: "Enter amount"              |  <- duplicate of button label     |
|   [        Enter amount        ]   |                                   |
|   TxStatusDialog (never clears)    |                                   |
+------------------------------------+-----------------------------------+
```

### Proposed structure

```
+---------------------------- 980px, centered ---------------------------+
| [ 440px ]                          | [ flex ]                          |
|  SWAP CARD (raised, real card)     |  PriceCandleChart                 |
|   Swap                 [0.5% ⚙]    |  (keep. flatten its surface so    |
|                                    |   the swap card carries weight)   |
|   +------------------------------+ |                                   |
|   | 12.5              [JUNO v]   | |                                   |
|   | $41.20        Balance: 18.2  | |  <- balance IS the max button     |
|   +------------------------------+ |                                   |
|                (flip)              |                                   |
|   +------------------------------+ |                                   |
|   | 523.11            [USDC v]   | |                                   |
|   | $41.05                       | |                                   |
|   +------------------------------+ |                                   |
|                                    |                                   |
|   1 JUNO = 0.0421 USDC        (v)  |  <- one line + chevron            |
|     > Minimum received  520.4      |                                   |
|     > Price impact      0.12%      |                                   |
|     > Max slippage      0.50%      |                                   |
|     > Route             2 hops     |                                   |
|                                    |                                   |
|   [!] ONE hazard strip, ONE box:   |  <- only when hazards exist       |
|       - high price impact (8.2%)   |                                   |
|       - unverified asset FOO       |                                   |
|       [x] I understand and accept  |                                   |
|                                    |                                   |
|   [          Review swap        ]  |  <- the button IS the state       |
+------------------------------------+-----------------------------------+
```

### Deletions and merges

| What | Where | Action |
|---|---|---|
| Duplicate validation text | `SwapForm.tsx:375` | **Delete.** `actionCopy` (`:186`) already ends in `validationError ?? "Review swap"`, so the button already says it. Keep `:374` (wrong-network explanation, mutually exclusive with `:375`). |
| Mode subtitle + exact-out notice | `SwapForm.tsx:286-289`, `:348` | **Delete both.** Exact-out is already signalled at `:335` (label flips to "Target receive"), `:317` (fiat hint), and `:381` (review description). Four announcements of one mode. Also delete `.swap-mode-copy` (`theme.css:925-931`). |
| QuoteCard 6-row table | `QuoteCard.tsx:94-155` | **Collapse.** Always-visible: `rateLabel` (`:53-71`) + chevron. Inside `<details>`: Minimum received, Price impact, Max slippage (read-only), Route. |
| QuoteCard slippage chips + `SLIPPAGE_PRESETS` const | `QuoteCard.tsx:8-12, 122-148` | **Delete.** Hardcoded duplicate of `SLIPPAGE_PRESET_BPS` (`lib/swap/slippage.ts:3`). Drop the `onSlippageBps` prop (`:24, :36`) and its pass at `SwapForm.tsx:349`. Slippage becomes settable in **exactly one** place: the gear. |
| "Quote status" countdown row | `QuoteCard.tsx:149-154` | **Delete.** Expiry is enforced at `SwapForm.tsx:111/149` and re-checked at sign time (`:257-264`). Worse: the 15s refetch resets the counter before the 30s TTL, so it ticks 30 -> 16 -> 30 forever and can never fire. |
| 1-second `setInterval` | `useSwapQuote.ts:93-96` | **Delete.** Its only consumer was the countdown. It re-renders the entire SwapForm every second, even with an empty form. Replace with a single `setTimeout` scheduled at `quoteUpdatedAt + TTL` that flips `isExpired` once. Keep `isExpired` (load-bearing at `SwapForm.tsx:111/149/259`). |
| Dead `updatedAt` prop | `QuoteCard.tsx:32`, passed at `SwapForm.tsx:349` | **Delete the prop only.** `quote.quoteUpdatedAt` stays; `SwapForm.tsx:263` needs it. |
| "Selected slippage" `<dl>` | `SettingsPanel.tsx:79-81` | **Delete.** Restates the value the active preset button is already highlighting. |
| Raw contract param in tooltip | `SwapForm.tsx:298` | `title={`Swap max_spread ${maxSpread}`}` -> show `{formattedSlippagePercent}%` as a visible pill next to the gear. `max_spread` already lives in SettingsPanel's "Technical settings" `<details>` (`:85`). |
| Up to 3 stacked consent checkboxes | `SwapForm.tsx:350-373` | **Merge into one `<SwapHazardAcknowledgement>`.** Note: `hasHighPriceImpact` (source=pair) and `hasUnavailablePriceImpact` (source=router) are mutually exclusive, so the true worst case is 3 checkboxes, not 5. Collapse the four ack booleans (`:84-87`) into one `hazardsAcknowledged` keyed on a stable `pendingHazards` id-join, which also **fixes a live bug**: today `slippageAcknowledged` does not reset when a *new* hazard appears from a route change, so a stale ack can survive the hazard set growing. Keep the extreme-impact hard block (`:359`) untouched. Do not delete the shared `RiskAcknowledgement` component (AddLiquidity/RemoveLiquidity/CreatePool still use it). |
| Elevated-impact notice card | `SwapForm.tsx:350-352` | **Delete.** `QuoteCard.tsx:45-51` already renders the Price impact row with `status-warn` for `severity === "warning"`. |
| Happy-path risk badges | `SwapForm.tsx:372`, `lib/risk.ts:127-142` | Pool-type badge severity -> `"info"` for all types (keep `requiresAcknowledgement` flag). Drop `caveated-liquidity-math` from `assessRouteRisk` (it describes provide/withdraw math, meaningless on a swap; keep it in `assessPoolRisk`). Then filter the SwapForm list to `severity === warning|danger` so a verified JUNO/USDC xyk swap shows **no badges at all**. This also stops info badges from eating the `max=4` slots and pushing a real hazard into the "+N" chip. |
| Forked transaction list | `SwapPage.tsx:38-52` | **Delete.** Hand-rolls `.transaction-list` markup while importing `formatAssetFlow`/`formatTimestamp` from `WalletTransactionHistory` (`:9`), and reimplements loading/error/empty as bare `<p>` tags. Pool activity has a canonical home at `PoolDetailPage.tsx:99-111`. `MarketPanel` reduces to the chart. |
| Token input = 3 stacked strips | `TokenAmountInput.tsx:69-129`, `swap.css:8-56` | **Collapse to 2 rows.** Row 1: amount + token pill. Row 2: left = USD value, right = `Balance: 12.5` as a **button** that applies max. Delete the absolutely-positioned topline (`swap.css:9-11, 16-23` uses `padding-top:38px` + `position:absolute` as a hack), the `onHalf`/`halfBaseAmount` props, and the `.token-amount-actions` MAX/50% row. Fold "MAX reserves 0.25 JUNO for network fees" into the max button's `title` and delete `SwapForm.tsx:316-317`. **Breaks 4 other consumers** (`AddLiquidityForm:210-213`, `RemoveLiquidityForm:148`, `IncentivesPanel:128`, `TokenAmountInput.test.tsx:57-72`) - budget for them. |
| No USD value anywhere | new `src/queries/usePrices.ts` | **Add** (the one addition on this page). Wrap `indexerClient.prices(assets)` (`lib/indexer/client.ts:76`) through the existing `indexerFallback` path. **Mandatory guard:** render nothing when `priceStatus` is `"missing"`/`"stale"` or `isPriceMock` is true (`indexer/types.ts:15,18`). Season 0 test tokens are live; never print a confident dollar figure from a mock price. |
| Unaddressable pair | `SwapPage.tsx:15` (`pools[0]`), `SwapForm.tsx:79-80` | **Add** `useSearchParams` (`grep` confirms zero uses app-wide, though react-router 7 is already a dep). Read `?from=&to=`, validate against `buildSelectableAssets(pools)`, reject unknown ids and `from === to`, write with `replace: true`. Then add a **Trade** link on `PoolDetailPage` and PoolTable rows. This is the funnel from pools into the flagship surface, which does not exist today. |
| TransactionReview: 12 rows | `SwapForm.tsx:385-395` | **Trim 9 rows -> 5.** Keep: You send, Receive, Minimum received, **Max slippage** (enforced on the message + tone carrier for high slippage), **Price impact** (tone carrier for danger). Delete: Route, Pool commission, "Assets" (a sentence), "Pool status" (a sentence). Fold pool label/status/verified into the existing per-hop `disclosures` labels (`:399`). **Do not** move Max slippage or Price impact into the `<details>` labelled "Contracts and identifiers" - burying a danger-toned row defeats the modal. |
| Flip button declared twice, 15 `!important` each | `theme.css:884-900` (dead) vs `swap.css:60-82` (wins) | **Delete the theme.css block**, drop every `!important` from the swap.css block. Also: `.swap-amount-stack` is already a grid; make it `grid-template-rows: auto 0 auto` and put the button in row 2 with `place-self:center; position:static`. Today it is absolutely positioned at 50%/50% of the whole stack, so the fiat-hint row on the send box pushes it visibly **below** the seam on the most common page load. |

### Flow bugs on this page (not cosmetic)

- **The Confirm button in the review modal disables itself ~15s after it opens.** `reviewIsCurrent` (`SwapForm.tsx:257-264`) compares `quote.quoteUpdatedAt === reviewSnapshot.updatedAt`, and TanStack bumps `dataUpdatedAt` on every 15s refetch **even when the quote is byte-identical**. The user reads the review for 15 seconds and gets a false "The amount, route, slippage, or quote version changed" alert with no in-modal escape. **Fix:** drop the timestamp equality; compare `route.id`, `offer_amount`, `return_amount`, `slippageBps`, and `!quote.isExpired`. Add a `warningAction` prop to `TransactionReview` wired to `handleReview` so the warning has a "Refresh and re-review" button. **Do not** suppress the poll while the snapshot is open: that just moves the trap to 30s and latches it.
- **The CTA is disabled and relabelled by every background refetch.** `balancesReady` (`:103`) and `quoteReady` (`:111`) both key off `isFetching`, which is true for background polls (balances 30s, quote 15s). The button reads "Review swap" and then flips to "Refreshing route…" and dies, roughly twice a minute, on a page where nothing is happening. **Fix:** gate on data presence, not fetch activity (`balances.data !== undefined`; `Boolean(quote.data) && !isDebouncing && !isError && !isExpired`). **Do not** add `placeholderData: keepPreviousData` - the amount/pair/mode are in the query key, so it would surface a stale quote as current.
- **Expired quote is a ~15s dead end.** After an alt-tab, `isExpired` disables the button with "Quote expired — refresh required" and there is no refresh control (`refreshQuote` exists at `useSwapQuote.ts:112` but is only reachable inside `handleReview`, which early-returns on `submitDisabled`). **Fix:** set `refetchOnWindowFocus: true` on this one query (overriding the global `false` at `main.tsx:25`), and make the residual expired state a *live* CTA: `needsQuoteRefresh` -> button reads "Refresh quote", stays enabled, calls `quote.refreshQuote()`. Keep it *below* sameToken / hasAmount / exceedsBalance in the priority chain.
- **The form does not reset after a confirmed swap.** `handleSwap` (`:266-279`) clears only `reviewSnapshot`. Pass a per-call `onSuccess` clearing `amount`/`askAmount`/`quoteMode`. **Not** `onSettled` - `runTx` rethrows on failure, so `onSettled` would wipe the input on wallet rejection and destroy the retry path.
- **Token selector has no keyboard completion.** No `onKeyDown` on the search input (`TokenSelect.tsx:127`): ArrowDown/Enter do nothing. Add `activeIndex` + arrow/Home/End/Enter, skipping `disabled` assets (`selectAsset` no-ops on them at `:100`), reset on `[query, isOpen]`. Do **not** add `aria-activedescendant` against `role="list"` (fake a11y), and do **not** `tabIndex={-1}` the favorite star (that removes keyboard access to favoriting).

---

## 3. The Pool detail page

### Current structure

Ten stacked, equally-weighted, full-width sections. The three things a user came for (chart, my position, deposit form) are at positions 7, 2, and "behind a modal you have to find".

```
header (label, XYK · 30 bps, RiskBadgeList)            :39-47
LpPositionPanel [Add][Remove][Stake/claim]             :49   <- buttons #1
"Manage your position" [Add][Remove][Manage rewards]   :51-59 <- buttons #2, SAME handlers
3x <Modal> (add / remove / stake)                      :61-63
"Pool status and risk" -> RiskBadgeList AGAIN + 1 line :65-70 <- badges #2
"Performance" -> 3 MetricCards + "unavailable" line    :72-83
"Reserve composition" -> ReserveCards + "Current price":85-93
PriceCandleChart                                       :95-97 <- 7th
"Recent pool activity"                                 :99-111
<details> Technical pool details                       :113-125
```

### Proposed structure

```
+------------------------------------------------------------------+
| Pool · JUNO / USDC                              [← Back to pools] |
| JUNO/USDC                                                         |
| XYK · 30 bps    TVL $1.2M   24h vol $84k   APR 12.4%              |
| [risk badges, max=6, only if not clean]     updated 2m ago        |
+------------------------------------------------------------------+
| PRICE CHART (flush, no card chrome; price readout IS the heading) |
|                                                                   |
+------------------------------------------------------------------+
| YOUR POSITION  (renders only when you have one)                   |
|  0.42% of pool · 1,204 LP · 512 JUNO + 21,004 USDC                |
|  [Add liquidity] [Remove] [Stake / claim]        <- ONE row       |
+------------------------------------------------------------------+
| Pool reserves                                                     |
|  [JUNO logo] 1,204,000 JUNO   [USDC logo] 512,000 USDC            |
|  1 JUNO ≈ 0.42 USDC   (on-chain spot, survives indexer outage)    |
+------------------------------------------------------------------+
| Recent pool activity                                              |
+------------------------------------------------------------------+
| > Technical pool details                                          |
+------------------------------------------------------------------+
```

Section order: **header+stats -> chart -> your position (conditional) -> reserves -> activity -> technical.** The page is a single-column grid (`pools.css:149`), so the reorder is a pure JSX move; no CSS layout work.

### Deletions

| What | Where | Action |
|---|---|---|
| Duplicate action row | `PoolDetailPage.tsx:51-59` | **Delete the whole section.** `LpPositionPanel.tsx:100-104` already renders Add/Remove/Stake bound to the same `setManageAction` handlers. "Stake / claim" and "Manage rewards" are two names for one modal. Also delete `.manage-liquidity-actions` (`theme.css:1631-1649`). Keep `.lp-position-actions` (PortfolioPage uses it). |
| **Third** Add-liquidity button | `LpPositionPanel.tsx:64` | The quick-actions row (`:100-104`) renders unconditionally, *outside* the loading/error/empty/position branches. So a connected wallet with no LP sees three "Add liquidity" buttons in one viewport. Drop the `action` prop from the EmptyState. |
| Duplicate risk badges | `PoolDetailPage.tsx:65-70` | **Delete the "Pool status and risk" section.** Bump the header list (`:44`) to `max={6}` so nothing is lost. Move the `reserves.isError` note down to the reserves section where the stale numbers actually appear. The unverified sentence at `:68` is redundant with the badge's own `title` (`lib/risk.ts:109-110` already sets that copy as `description`, and `RiskBadges.tsx:11` already renders it as `title`). **Leave** `AddLiquidityForm.tsx:196` / `RemoveLiquidityForm.tsx:140` alone: they render inside modals that overlay the page, and `RiskAcknowledgement` returns null for a *blocked* pool, so removing them leaves the worst case with zero risk context. |
| Empty position card in the prime slot | `LpPositionPanel.tsx` + `PoolDetailPage.tsx:49` | Add `hideWhenEmpty?: boolean` (default false, so `LiquidityPage.tsx:32` is unaffected). Return null when connected + not loading + no position, and when disconnected. Keep rendering on loading/error. In `compact`, also drop the restated `<h3>{pool.label}</h3>` (`:37`, already the page `<h2>`), the "{symbols} pool shares" line (`:38`, already the eyebrow), and the amber "No LP balance" pill (`:41-43`). |
| Dead dl row | `LpPositionPanel.tsx:92-95` | **Delete.** `<dt>Underlying value</dt><dd>USD pricing unavailable</dd>` is a string literal. It shows exclusively to users who *do* have a position. |
| Broken anchor | `LpPositionPanel.tsx:103` -> `${poolHref}#incentives` | `id="incentives"` only exists while the stake Modal is mounted (`IncentivesPanel.tsx:107`, `PoolDetailPage.tsx:63`). `LiquidityPage.tsx:32` renders the panel *without* `onStake`, so the broken link ships today. **Fix:** deep-link all three fallbacks as `?manage=add|remove|stake`, seed `manageAction` from `useSearchParams()` (validate against the union), clear the param on close. Update `LpPositionPanel.test.tsx:78-80`, which currently asserts the broken href and locks it in. |
| Meaningless stat | `PoolDetailPage.tsx:157-163` | `reserveCompositionPercent` normalizes each asset by its **own** decimals and then sums **across assets** (100 JUNO + 250 USDC = 350 -> "28.57% of token units"). That number moves with price, not with depth. **Delete** it, its call site (`:139`, `:144`), and the test assertion at `PoolDetailPage.test.tsx:115`. Retitle the section "Pool reserves". |
| Dual-direction price string + garbled hint | `PoolDetailPage.tsx:91`, `:165-173` | `formatCurrentPrice` prints both directions in one string (always tripping `metric-value-long` at `:132`), and the hint concatenates `poolType.swapCopy` with a fragment: *"Direct pair simulation returns contract pricing, spread, and fee for this XYK pool. Spot ratio from JUNO and USDC reserves"*. **Keep the price** (it is on-chain, survives an indexer outage; the chart readout is the last *indexed* close and renders only when `candles.data.length > 0`), but return one direction and replace the hint with a single sentence. `PoolDetailPage.test.tsx:116` still passes. |
| Chart is misnamed and half-dead | `PriceCandleChart.tsx:197-210`, `:20`, `theme.css:2345-2354` | `buildGeometry` produces a `candles` array (bodyY/bodyHeight/up) that is **never rendered**; only `linePath`/`areaPath` from `close` are drawn. Delete the `candles:` block, the unused `bodyWidth` (`:188`), and the `.candle-up`/`.candle-down` CSS. Fix `useState(compact ? "1h" : "1h")` -> `useState("1h")`. Do **not** rename the component (5 files, 8 test sites, zero user benefit). |
| Metrics section -> header strip | `PoolDetailPage.tsx:72-83` | Move TVL / 24h vol / APR into the header as a compact `.pool-header-stat` strip. **Carry the honesty affordances:** keep the `"Metrics unavailable"` fallback, keep `aprHint(metrics)` **visible** (not a `title` - invisible on touch and to keyboard), keep the `access.isStale` / `updatedAt` line. Delete the redundant `"TVL, 24h volume, and APR are unavailable"` sentence at `:79-81` (the three cards already say it three times). |
| Deposit form is invisible until you find a button | `PoolDetailPage.tsx:23, 61-63` | Optional Wave 3: `useState<"add"\|"remove"\|"stake">("add")` (drop `null`), replace the three `<Modal>`s with a persistent tabbed action card (`role="tablist"`). **Keep the `Modal` component** - `TransactionReview` *is* a Modal (`TransactionReview.tsx:2`) and `TokenSelect` uses one. Un-nesting also fixes a real focus-trap leak: `Modal` does not portal, and only Escape is `stopPropagation`'d (`Modal.tsx:23-27`), so the outer Tab trap fires on bubble and can move focus from the confirm dialog into the form behind it. |
| Typography has no heading tier | `pools.css:248-256` | h3 (`:248`), metric labels (`:270`), and `dt` (`:336`) are all `0.75rem / mono / 700 / uppercase`. **Restyle** the h3 to `var(--font-display) 1.05rem 600, no transform` (do **not** delete the h3s - four sections use `aria-labelledby` against them). Then mono-uppercase consistently means "label/numeric" and nothing else. Fix the stale comment at `pools.css:348`; the `.liquidity-grid` rule itself is still live (Modal doesn't portal, so IncentivesPanel renders inside `.pool-detail-page`). |
| IncentivesPanel debug dump | `IncentivesPanel.tsx:115-121, 157` | Delete the "Incentives contract" (`:116`, already in the review `disclosures`), "Reward APR" (`:117`, already the pool APR), "Wallet LP" (`:118`, already in the TokenAmountInput balance), and "Pool reward rate" rows (`:120`, an undenominated `${rewardRps} reward units/sec`). Delete the hardcoded `"Protocol commission" -> "Unavailable from incentives query"` review row with `tone: "warning"` (`:157`) - it can never resolve and trains users to ignore warning tone. |
| AddLiquidityForm always-on advisory box | `AddLiquidityForm.tsx:248-251` | **Delete outright**, do not make it conditional. All three branches restate copy already on screen: the `!supportsProvideLiquidity` branch is byte-identical to the header at `:195`; the XYK branch restates copy the input labels carry at `:204`; the first-provider branch duplicates the warning box at `:235-245`. |
| Fake slippage control | `AddLiquidityForm.tsx:198` | An Interchain `<Button variant="outlined" className="slippage-pill">` with **no `onClick`**. And `SettingsPanel` is imported only by SwapForm, so slippage is **completely uneditable** on the liquidity surface even though it feeds `applySlippageFloor` -> `minLpToReceive` (`:78`). Wire it to the SwapForm gear pattern, or demote it to a non-interactive `<span>`. |

---

## 4. The design system

Four half-systems today. Collapse to one. All tokens live in `src/theme/junoTheme.ts` (`junoCssVars`, ~line 116+); CSS reads only the short-alias layer.

### Type scale (6 steps, replacing ~32 sizes)

```
--fs-11: 0.6875rem   labels, eyebrows, chips
--fs-13: 0.8125rem   secondary text, table headers, dt
--fs-15: 0.9375rem   body, inputs, buttons
--fs-17: 1.0625rem   section headings (h3)
--fs-24: 1.5rem      page headings (h2), metric values
--fs-36: 2.25rem     hero / amount input
```
Weights: **400 / 500 / 600 / 700 only.** Kill `800` (`theme.css:2097`; it renders at 700 anyway because only 400-700 are fetched and `font-synthesis: none` is set at `theme.css:8`). Letter-spacing: **three tokens** replacing 17 values: `--ls-tight: -0.01em` (headings), `--ls-0: 0` (body/UI), `--ls-eyebrow: 0.14em`.

Delete all **six** competing h2 rules (`theme.css:165-170`, `theme.css:173-176`, `pools.css:164`, `portfolio.css:12`, `create.css:13`, `liquidity.css:4`, `stats.css:19`) and set `h2` once.

**Mono budget, not mono deletion.** `0.75rem` uppercase Space Mono is used **88 times** - it is the default voice, not an accent. Keep mono for: eyebrows, code/hashes/addresses, numeric data. Remove `text-transform: uppercase` + `font-mono` from `dt` labels, `.pool-table-header`, `.nav-link`, `.primary-action`/`.icon-button` labels, and `.metric-card > span`. Target: <20 uses. **Do not** delete Space Mono - `theme.css:1` deliberately imports it and there is a `--juno-eyebrow-tracking` token. That is a brand call.

> **Caveat that changes the work:** `--font-mono`, `--font-display`, and `--font-body` are **never defined anywhere in the repo**. Only `:root` supplies an inline fallback. Every `font-family: var(--font-mono)` is invalid-at-computed-value-time -> `unset` -> inherits Montserrat. **Space Mono has never rendered.** Defining the vars is therefore a *visual change*, not a cleanup. Decide deliberately: either define them (and Space Mono appears on the pool table / portfolio / LP panel for the first time), or delete the dead `font-mono` declarations and keep Montserrat everywhere.

### Tabular figures (one line, currently absent everywhere)

`grep -rn "tabular\|font-variant\|font-feature" src/` returns **nothing**. Montserrat has proportional digits, so the swap output, price impact, and TVL column **visibly shimmy on every quote refresh** and the pool table's numbers never align on a decimal. Montserrat ships `tnum`, so no new font is needed:

```css
.num, .token-amount-row input, input[inputmode="decimal"],
.metric-card strong, .metric-value, .quote-row-value,
.pool-metric strong, .pool-position strong, .token-balance {
  font-variant-numeric: tabular-nums;
}
```
Do **not** invent `--num: 'Inter Tight'` (not loaded). Do **not** right-align the numeric columns: `pools.css:95` documents an explicit mockup decision against it.

### Spacing (4pt scale, replacing 18 gaps + 7 card paddings)

```
--s-1: 4px   --s-2: 8px   --s-3: 12px   --s-4: 16px
--s-5: 20px  --s-6: 24px  --s-8: 32px
```
The 10px x50, 12px x45 and 8px x43 clusters collapse into `--s-2`/`--s-3`. **One outer-card padding (`--s-5`)** and **one inner-box padding (`--s-4`)**. Today `.swap-card` is 20px, `.metric-card` 18px, `.price-chart-card` 16px, `.token-amount-row` 10px, so cards sitting side by side never share a gutter. That is the single fastest read of "ugly", faster than bad color.

### Elevation (currently **inverted**)

```
chrome    #0A0203  (--void-pure, sidebar)   /  #1B0708 (--maroon-deep, topbar)
canvas    #270B0D  (--maroon, .app-main)
card      #2E1214  (--surface-card)   <- MUST be lighter than canvas
nested    #3A181A  (--surface-raised)
inset     #100405  (--surface-inset)  <- deliberate recess for inputs, correct as-is
```
Today `--surface-card` is `panel` **#230A0C**, which is *darker* than the #270B0D canvas it sits on, while carrying `--shadow-card: 0 1px 0 rgba(255,235,210,.03), 0 18px 40px rgba(0,0,0,.55)`. Cards are pits wearing a lift shadow, and on near-black the 40px shadow is just a dirty smear. Reassign `color.panel` to `#2E1214` (the value already sitting unused in `panelMuted`), and soften: `--shadow-card: 0 1px 2px rgba(0,0,0,0.35)`. Delete the fake `0 1px 0` top highlight. Leave `--shadow-pop` (modals) alone.

### Color roles (coral is currently brand AND link AND accent AND error)

`junoTheme.ts:17-24`: `primary`, `cyan`, `coral`, and `signal-live` are all literally `#FF7B7C`. Coral is then applied to ~15 element types **including the primary CTA and the error text** (`--coral-hot` at `theme.css:1122-1123`).

```
--accent:       #FF7B7C   brand coral: primary CTA fill, active nav/tab, selected states. NOTHING ELSE.
--accent-hover: #FF9698
--danger:       #D7263D   darker + deeper, not a 4-degree hue nudge
--danger-soft:  rgba(215,38,61,0.14)
--warning:      #E9A94F   (unchanged)
--success:      #4FBF8B   (raised from #8FB08A - success was quieter than the brand)
```
Because brand and danger are both red, **hue alone cannot carry the signal.** Danger must be multi-channel: `color: var(--danger)` + `background: var(--danger-soft)` + a left border or icon. Apply to `.error-text`/`.status-danger` (`:1122`), `.field-error` (`:1797`), `.risk-badge-danger` (`:1980`), `.toast-error` (`:2104`), `.price-impact-danger` (`:1140`).

Then evict coral from chrome: `a{color:var(--coral)}` (`:52`) -> `--text-primary` + hover underline; the shared button block (`:298-322`) -> `--text-secondary` + `--line-hair`, coral only on `:hover`/`:active`; `.eyebrow` (`:178`) -> `--text-faint`; APR column (`pools.css:118`) -> `--text-primary`; sort headers -> `--text-muted`, coral only on the active column. Also repoint `--text-accent` (`:168`) and `--signal-live` (`:176`), which are the same alias and will keep leaking coral otherwise. Add a CI grep that fails if `var(--coral)` appears outside the accent block, or this regresses in two PRs.

### Radii

Keep the sharp language (`junoTheme.ts:190-193` documents "diagrammatic, not friendly-rounded" as a deliberate rule; rounding to 8/12/16 is a rebrand, not a fix). Just make it a scale and assign by role: `--r-sm: 3px` (chips/badges), `--r-md: 5px` (inputs/buttons/inner boxes), `--r-lg: 8px` (**outer cards and modals** - today they use `--r-md`, which is why nothing reads as a card), `--r-pill: 999px`. Drop `xl` (a duplicate of `lg`). `.token-selector-trigger` (`theme.css:1822`) is the **only** `--r-pill` surface in the app; either change it to `--r-md` or make pill an intentional, documented affordance on every select.

### One-line fixes

- **`--ease-mech` is undefined.** It appears in three `transition` shorthands (`theme.css:965`, `swap.css:81`, `swap.css:166`). An unresolvable var invalidates the whole declaration, so the flip-button hover, the slippage-chip hover, and the quote-toggle rotate **have never eased** - they snap. Add `"--ease-mech": "cubic-bezier(.2, 0, 0, 1)"` to `junoCssVars`. Give every `transition` an inline fallback so a future missing token degrades instead of dying silently.
- **Focus rings are broken.** `swap.css:79` sets `outline: none !important` on `.swap-direction` (a real keyboard-reachable button, no ring at all). `theme.css:820-826` substitutes `box-shadow: 0 0 0 3px var(--coral-a12)` on inputs - 12% alpha on near-black, effectively invisible, nowhere near 3:1. Use the `--focus-ring` token the theme already defines (rgba(255,123,124,0.60)) and place the `:focus-visible` block **after** the `:focus` block (equal specificity, source order decides).
- **The disabled CTA is the brightest element on screen.** `.primary-action:disabled` (`theme.css:1025-1032`) overrides the global `opacity:.48` with `opacity:1` + `background: var(--text-muted)` (#B69C82, light tan) + dark text. The disabled Swap button looks more clickable than the enabled one. Simplest fix: delete the block and let the base `button:disabled` rule apply. (Note `--text-faint` and `--text-muted` are the same hex, so swapping them is a no-op.)
- **Canvas noise.** `.app-main` (`theme.css:479-483`) paints a 32px coral lattice behind every number on every page. Drop it, keep `var(--maroon)`. `body`'s grid + radial glow + 4-stop gradient + `body::before` scanline (`:34-50`) are fully occluded on every route **except** in the strip left of the content once you scroll past the sticky 100vh sidebar - a leak, not a feature. Delete them. Delete the decorative 7rem `"08"` glyph (`.context-panel:not(.market-panel)::after`, `:504-513`) and the `overflow:hidden` that only existed to clip it.
- **81 `!important`.** They exist to beat Interchain UI, which contributes **no component** - only Box/Stack/Text/Button in 6 of ~40 files, while every input, select, modal and table is hand-rolled. The `Stack space` props are already inert (`theme.css` owns the gaps). **Order matters:** (1) drop Interchain from the 5 component files, keeping `ThemeProvider` + `OverlaysManager` + the styles import for cosmos-kit's connect modal; (2) **split `theme.css:998`** - `.primary-action, .wallet-button, .action-card button` - that third descendant selector force-paints *every* button inside an `.action-card` coral at primary size, which is why the 25/50/75/100% quick-fill row and the MAX/HALF pills currently render as solid coral blocks instead of ghost buttons. Give the real CTAs an explicit `className="primary-action"`. (3) Only then strip the flags.
- **Render-blocking `@import`** at `theme.css:1` (fonts.googleapis.com). Serializes CSS -> CSS -> font, plus a CSP/offline/GDPR liability. Self-host with `@fontsource` + `<link rel=preload>`.

### Files that change
`src/theme/junoTheme.ts` (tokens), `src/styles/theme.css` (the 2574-line monolith), `src/styles/surfaces/{swap,pools,portfolio,create,liquidity}.css`. **Do not** fold the surface files back into `theme.css`: they are legitimate page-scoped overrides, they contain **zero** `!important` (all 81 are in `theme.css` and `swap.css`), and the refactor is churn with regression risk. Only two declarations are genuinely dead-shadowed: `max-width:900px` on `.create-pool-page > .swap-card` (`theme.css:1427`) and `align-items:flex-start` on `.portfolio-hero` (`theme.css:1375`). Delete those two, and de-duplicate the mono-label recipe, which is copy-pasted 4x and **has already drifted** (`.18em` in pools/portfolio/create, `.16em` in liquidity).

---

## 5. Redundancy: the delete list

| # | Thing | Files | Verdict | Lenses agreeing |
|---|---|---|---|---|
| 1 | **`/stats` surface, entirely dead** | `components/stats/StatsDashboardPage.tsx` + test, `lib/stats/dashboard.ts`, `queries/usePools.ts:51-66`, `styles/surfaces/stats.css` + `main.tsx:15`, `DexShell.tsx:39`, `NavIcons.tsx:77` | Delete. **Scope trap:** `lib/data-access/indexerFallback.ts:6` imports `sortTopPools`+types and hosts `loadStatsDashboard` (`:287`), `normalizeProtocolStats` (`:139`), `normalizeTopPool` (`:170`), covered by 5 tests (`indexerFallback.test.ts:246-313`). Delete those first or it will not typecheck. **Keep** the `/stats -> /pools` redirect (`routes.tsx:29`). Optionally salvage the 4-stat strip into the Pools header (moving `.stats-metric-*` into `pools.css`). | visual, redundancy, uniswap |
| 2 | **`/liquidity` route (LegacyLiquidityPage)** | `components/liquidity/LiquidityPage.tsx`, `routes.tsx:5,20-22,34`, `DexShell.tsx:42` | Delete the page, redirect `/liquidity -> /portfolio`. It renders an `LpPositionPanel` for **every registry pool** (`:32`), not the wallet's, so it is mostly "No LP balance" cards. Move `WalletTransactionHistory` onto `PortfolioPage` (which already has `indexerData` in hand at `:116`; just add `registry` to the `useDexRegistry()` destructure). **Do NOT delete `styles/surfaces/liquidity.css`** - lines 17-82 style `.action-card` / `.lp-position-panel` / `.incentives-panel`, live on /portfolio and /pools/:id. Delete only lines 3-15. | redundancy |
| 3 | **Inline `TxStatusDialog` (never clears)** | `components/tx/TxStatusDialog.tsx` + test; mounted at `SwapForm.tsx:377`, `AddLiquidityForm.tsx:258`, `RemoveLiquidityForm.tsx:189`, `CreatePoolPage.tsx:193`, `IncentivesPanel.tsx:140` | One tx = toast + inline card + TransactionCenter row + localStorage record. Worse: it hides only on `status === "idle"`, `resetTx` is exported by all five mutations and **called by nobody**, and there is no dismiss button - so after your first swap a "Transaction confirmed / Retry / Refresh" card is welded under the form for the session. **Fix:** make it terminal-failure-only + dismissible, and actually wire `resetTx` (dismiss button + a `useEffect` keyed on the form's inputs). **Do NOT** move retry onto the TransactionCenter row: `PersistedTxRecord` is JSON in localStorage and cannot carry a callback. Also consider deleting the retry button entirely - the default retry (`useTxRunner.tsx:106`) replays frozen `options.variables` (a stale quote / stale `minimum_receive`) and is enabled for exactly the slippage errors whose own copy says "refresh the quote first". | redundancy, flows |
| 4 | **Duplicate pool-detail action row** | `PoolDetailPage.tsx:51-59`; CSS `theme.css:1631-1649` | Delete. See §3. | pooldetail, redundancy, uniswap |
| 5 | **Duplicate pool-detail risk badges** | `PoolDetailPage.tsx:65-70` | Delete the section, bump the header list to `max={6}`. | pooldetail, redundancy, uniswap |
| 6 | **Second slippage control** | `QuoteCard.tsx:8-12, 122-148`; `SettingsPanel.tsx:79-81`; `SwapForm.tsx:298`; `AddLiquidityForm.tsx:198` | One setter (the gear), read-only echoes elsewhere. `QuoteCard`'s `SLIPPAGE_PRESETS` is a hardcoded second copy of `SLIPPAGE_PRESET_BPS`. | swap, redundancy, uniswap |
| 7 | **Chrome status stack** | `DexShell.tsx:96-103` (5-row sidebar-network), `:107` (topbar coord) | Delete the 5-row table. Replace `ChainStatusBadge`/`IndexerStatusBadge` with **failure-only** rendering (return null when healthy). "Wallet chain -> juno-1" is unactionable; "Status" is the 4th duplicate of wrong-network (banner, wallet popover, button copy). **KEEP `.app-topbar`** - it hosts the only desktop `WalletConnectButton` (`:109`) and fills grid row 1 / col 2; deleting it breaks connect-on-desktop. Remove only the breadcrumb label, keeping `coordByPrefix` -> `document.title` (`:46`) and the sr-only live region (`:55`). Note the sidebar is a 216px left rail, not a header, so this is *not* stealing vertical space from the swap card - severity medium, not high. | redundancy, uniswap |
| 8 | **Duplicate sort UI** | `PoolTable.tsx:99-108` | Delete the "Sort by" `<select>`; it never sets `sortDirection`, so picking "TVL" from it reuses whatever direction the last header click left behind. First make the "Pool node" header (`:42`) a sort button so name-sort is not lost; `featured` stays as the initial state, not a re-selectable option. Update `PoolTable.test.tsx:141,166`. **Keep** the Pool type / Verification / Incentives filters - three distinct states, not duplication. | redundancy, uniswap |
| 9 | **Portfolio "Known balances" card** | `PortfolioPage.tsx:197-201` | A metric card whose value is a **count** of the rows enumerated in full two inches below (`:222`). Delete. | redundancy |
| 10 | **"No rewards found" printed twice** | `PortfolioPage.tsx:194-195` | Same string as the metric value AND its `<small>` caption. Gate the caption on `claimableRewardCount > 0`. | redundancy |
| 11 | **Permanently-disabled "Claim rewards unavailable"** | `PortfolioPage.tsx:103-105` | A bare `disabled` with no condition - dead on **every** card, *including* cards where line 97 is actively listing claimable rewards. Delete; the "Manage liquidity" link at `:102` already routes to where claiming happens. | redundancy |
| 12 | **`RiskNotice` + `useModal`, exported, never used** | `common/RiskNotice.tsx`, `common/index.ts:2,5`, `Modal.tsx:44-52` | Delete both, plus `.risk-notice` at `theme.css:692, 1126, 1137-1138`. | redundancy |
| 13 | **~38 dead CSS classes** | `theme.css` (`.app-footer`, `.footer-grid`, `.market-*` panel, `.scaffold-page`, `.hero-panel`, `.custom-asset-*`, `.quote-header`/`.quote-toggle`, `.receive-box`, `.mode-tabs`, `.net-dot`, `.candle-up/.candle-down`, `.liquidity-row`, …) | Delete. **Do NOT delete** `.toast-success/-error/-pending`, `.token-logo-sm`, `.risk-notice-compact` - they are built by template literal (`Toast.tsx:54`, `TokenLogo.tsx:7,21`, `RiskNotice.tsx:3`) and read as dead to grep/purgecss. Do not gate CI on bare `purgecss --rejected` for the same reason. | visual, redundancy |
| 14 | **Duplicated formatters** | `PoolTable.tsx:166-183` vs `PoolDetailPage.tsx:184-205` (byte-identical) | Extract to `src/lib/format/market.ts`. **Leave `PortfolioPage.tsx:16-32` alone** - different rounding and fallback copy; folding it in requires a decision, not a move. | pooldetail, redundancy |
| 15 | **`WalletTransactionHistory` wrong copy on the pool feed** | `WalletTransactionHistory.tsx:60, 89`; `PoolDetailPage.tsx:100-110` | Hardcodes *"…when wallet activity is available"* under a **pool-wide** feed, and `PoolDetailPage` passes `walletConnected={true}` purely to dodge the connect-wallet empty state. Add `description?: string` and `requiresWallet?: boolean`. (The duplicate `id="wallet-history-title"` is a latent collision only; the two call sites are on different routes.) **Do not** merge SwapPage's compact feed into it - different components, and SwapPage's is being deleted anyway. | redundancy |
| 16 | **`"Protocol commission" -> "Unavailable"` review rows** | `IncentivesPanel.tsx:157`, `RemoveLiquidityForm.tsx` | Hardcoded, `tone: "warning"`, can never resolve. Delete both. | pooldetail, redundancy |

---

## 6. Everything else

### Global / flows
- **Three of five write flows render a dead "Connect wallet to…" *disabled* button.** `RemoveLiquidityForm.tsx:57,188`, `CreatePoolPage.tsx:88,192`, `IncentivesPanel.tsx:54,130/135/138`. Swap and AddLiquidity already do click-to-connect (`SwapForm.tsx:245-255`, `AddLiquidityForm.tsx:131-139`). Copy that pattern in place. For IncentivesPanel, render **one** CTA in place of the three buttons when disconnected, not three "Connect wallet" buttons. If the duplication bothers you afterward, a ~15-line `useWalletCta()` hook is the right dedup, not a `<PrimaryAction>` component that would just relocate each form's copy ladder. `[high, M]`
- **The `"submitted"` tx state is declared but never entered.** `useTxRunner.tsx:11,42` defines it and `TransactionCenter.tsx:4` consumes it, but `runTx` goes preparing -> awaiting-signature -> `await broadcast` -> confirmed. All five mutations call `client.execute(..., "auto", ...)`, which is sign+broadcast+inclusion in one opaque await. So for the multi-second window after the user hits Approve in Keplr, the UI still says "Confirm in wallet". That is exactly when people double-click; only the `inFlightRef` dedupe (`:103`) saves them. Fix by decomposing into `sign` -> `broadcastTxSync` -> `onSubmitted(txHash)` -> poll `getTx` in one shared helper (fee math already exists in `lib/cosmjs/fees.ts`). Bonus: `TransactionCenter.tsx:19` already renders an explorer link whenever `txHash` is set, so it lights up for free. `[high, M]`
- **Two most common Cosmos failures dump raw chain errors into a toast.** `errors.ts:86-92` interpolates `raw` into user prose, and neither `account sequence mismatch` nor `out of gas: … gasWanted/gasUsed` has a branch. Add both kinds. **Copy caveat:** sequence-mismatch genuinely self-heals on retry; out-of-gas does **not** (everything uses `"auto"` gas, retry re-simulates to the same number), so the message must not promise a raised fee. Rewrite the unknown branch to stop interpolating `raw` (the `<details><code>{raw}</code>` disclosure at `TxStatusDialog.tsx:50` already shows it). `[medium, S]`
- **Background refetches inject layout-shifting skeletons above rendered content.** `PoolsPage.tsx:17` gates on `isFetching`, not `isLoading`, and `useDexRegistry` polls every 5 min, so the table gets shoved down and pops back under the cursor. Gate on `isLoading` alone (do **not** add `pools.length === 0` - `pools` falls back to `configuredPools`, which would kill the genuine first-load skeleton). Use an in-place opacity dim for revalidation, reusing the `quote-card-updating` pattern (`theme.css:923`). Same shape at `PriceCandleChart.tsx:50`, though there it is mutation-driven, not a poll. `[low, S]`
- **Empty states are developer copy with no way out.** `PoolTable.tsx:34`: *"Operators should add a real Juno pair to registry.juno-1.json and keep placeholders rejected by tests."* `SwapPage.tsx:26` similar. `PortfolioPage.tsx:162` + `:165-168` render **two** connect prompts on the same condition, and neither contains a connect button (the `action` is a "Browse pools" link). `States.tsx` already supports `action` - pass `<WalletConnectButton />` (keep "Browse pools" as secondary). Same at `LpPositionPanel.tsx:46-47`. `[medium, S]`

### Pools list
- Row is missing the pool's identity: no fee tier, no type badge, no unverified chip, even though `pool.feeBps` and `getPoolTypeMetadata(pool.type)` are exactly what `PoolDetailPage.tsx:43` prints. Discovered factory pairs land in this list unlabelled. Add `{type.label} · {feeBps} bps` inside `pool-title-copy` (`PoolTable.tsx:140-142`). `[medium, S]`
- Five dropdowns above a short list. Keep the three real filters, collapse them into inline chips beside search so the bar is one row of chrome. `[low, S]`

### Create pool
- `CreatePoolPage.tsx:185` uses a raw `<a href>` instead of `<Link>`, so the "Existing pool detected" link hard-navigates and drops app state. `[low, S]`
- The wizard is labelled "1 · Assets", "2 · Pool type", and then just stops - risk ack and submit are unnumbered. `[low, S]`
- "Guardrails" block (`:187`) renders unconditionally, so it can ship with an empty `<ul>`. `[low, S]`

### Copy
Ops-console vocabulary throughout: "Exchange · Swap" coordinates (`DexShell.tsx:36-43`), "Liquidity nodes · N" (`PoolsPage.tsx:11`), "Pool node" column header (`PoolTable.tsx:42`), "No LP detected" in every empty cell (`PoolTable.tsx:150`, next to a label that already says "Your position"), `transmissions-card`. Uniswap's swap card has three words of chrome. Note `coordByPrefix` is not decorative: it feeds `document.title` and the sr-only live region, so replace the strings, don't delete the map. `[low, S]`

### IBC (the one Cosmos-specific gap)
Token rows never show origin chain or channel, even though `asset.trace.counterpartyChainName` and `trace.channelId` are fully populated. Two same-symbol `ibc/…` denoms are indistinguishable without opening the pool page. Extend `assetOriginLabel` (`TokenSelect.tsx:55-59`) to return "Cosmos Hub · channel-1" and render it on the row (`:148`), not just the collapsed trigger. (The "raw ibc/ hash in the row" claim is **false** - `assetMetadata.ts:55-58` already falls back to "Unknown IBC asset".) `[medium, S]`

---

## 7. Sequenced work plan

Each wave is independently shippable.

### Wave 1: delete (highest impact per unit effort, near-zero risk)

| # | Item | Sev | Eff |
|---|---|---|---|
| 1.1 | Delete duplicate action row + duplicate risk section on PoolDetailPage (`:51-59`, `:65-70`) + the third Add button (`LpPositionPanel.tsx:64`) + `.manage-liquidity-actions` CSS | high | S |
| 1.2 | Delete the duplicate validation `<Text className="error-text">` (`SwapForm.tsx:375`), the mode subtitle (`:286-289`), the exact-out notice (`:348`), the elevated-impact card (`:350-352`) | high | S |
| 1.3 | Kill the second slippage control: `QuoteCard.tsx:8-12,122-148`, `SettingsPanel.tsx:79-81`, the `max_spread` tooltip. Show `0.5%` as a visible pill on the gear | high | S |
| 1.4 | Delete the "Quote status" row + the 1s `setInterval` (`useSwapQuote.ts:93-96`); replace with one scheduled timeout. Drop the dead `updatedAt` prop | med | S |
| 1.5 | Delete the `/liquidity` page (redirect to `/portfolio`), move `WalletTransactionHistory` onto Portfolio. **Do not touch `liquidity.css` lines 17-82** | high | S |
| 1.6 | Delete the `/stats` chain incl. `indexerFallback` scope; keep the redirect | med | S |
| 1.7 | Delete the SwapPage forked transaction list (`:38-52`) | med | S |
| 1.8 | Delete the sidebar-network 5-row table; make both status badges failure-only. **Keep `.app-topbar`** | med | S |
| 1.9 | Portfolio: delete "Known balances" card, the doubled "No rewards found", the permanently-disabled claim button | med | S |
| 1.10 | Delete `LpPositionPanel.tsx:92-95` (dead "Underlying value" row), the two hardcoded "Protocol commission -> Unavailable" review rows, the AddLiquidity advisory box (`:248-251`), `reserveCompositionPercent` (`PoolDetailPage.tsx:157-163`), `RiskNotice`, `useModal` | med | S |
| 1.11 | Delete the duplicate "Sort by" select (after making "Pool node" sortable) | med | S |

**Ship 1 = roughly 700 lines and two routes gone, no information lost.**

### Wave 2: the design system (one PR, mechanical, high visual payoff)

| # | Item | Sev | Eff |
|---|---|---|---|
| 2.1 | Fix the elevation ladder: `--surface-card` -> `#2E1214`, soften `--shadow-card` | high | S |
| 2.2 | Add `font-variant-numeric: tabular-nums` to all numeric surfaces. Decide the `--font-mono` question (define the var, or delete the dead declarations) | high | S |
| 2.3 | Define `--ease-mech`; add inline fallbacks to every `transition` | med | S |
| 2.4 | Flatten the canvas: kill `.app-main`'s lattice, `body`'s four layers + scanline, the `"08"` glyph | med | S |
| 2.5 | Fix focus rings (`swap.css:79`, `theme.css:820-826`) and the disabled CTA (`theme.css:1025-1032`) | high | S |
| 2.6 | Add the 4pt spacing scale; one outer-card padding, one inner-box padding | high | M |
| 2.7 | Add the 6-step type scale; unify the six h2 rules; cut the mono budget from 88 -> <20; restyle pool-detail h3s to a real heading tier | high | L |
| 2.8 | Split the color roles: `--accent` vs `--danger` (multi-channel), repoint `--text-accent`/`--signal-live`, evict coral from chrome, add the CI grep | high | M |
| 2.9 | Drop Interchain UI from the 5 files -> split `theme.css:998` (`.action-card button`) -> strip the 81 `!important`. **In that order.** | med | M |
| 2.10 | Self-host fonts; delete dead CSS (with the template-literal safelist) | low | S |

### Wave 3: restructure (the actual redesign)

| # | Item | Sev | Eff |
|---|---|---|---|
| 3.1 | QuoteCard -> one rate line + `<details>` (min received / impact / max slippage / route) | high | M |
| 3.2 | Consolidate the 3 swap consent checkboxes into one `<SwapHazardAcknowledgement>`; single `hazardsAcknowledged` keyed on the hazard-id set (fixes the stale-ack bug) | high | M |
| 3.3 | Silence risk badges on the happy path (`lib/risk.ts` severities + hazard-only filter in SwapForm) | med | S |
| 3.4 | Trim TransactionReview from 9 rows to 5 | med | S |
| 3.5 | PoolDetail reorder: header+stat strip -> chart -> position -> reserves -> activity -> technical. Extract `lib/format/market.ts`. Fix the price card + garbled hint. Kill the dead `candles` geometry | high | M |
| 3.6 | `TokenAmountInput` -> 2 rows; balance becomes the max button. Fix the 4 downstream consumers | med | L |
| 3.7 | Add `usePrices` + USD values on the swap card, guarded on `priceStatus`/`isPriceMock` | high | M |
| 3.8 | Deep-link the swap pair (`?from=&to=`) + Trade links from PoolTable rows and PoolDetail. Deep-link `?manage=add\|remove\|stake` and fix the dead `#incentives` anchor | med | M |
| 3.9 | Fix the flip button: delete the dead `theme.css` block, drop `!important`, seat it in a zero-height grid track | low | S |

### Wave 4: flows and correctness

| # | Item | Sev | Eff |
|---|---|---|---|
| 4.1 | Fix `reviewIsCurrent` (drop the timestamp equality) + add a `warningAction` refresh button to `TransactionReview` | high | S |
| 4.2 | Gate `balancesReady`/`quoteReady` on data presence, not `isFetching`. **No `keepPreviousData`.** | high | S |
| 4.3 | `refetchOnWindowFocus: true` on the quote; make the expired state an enabled "Refresh quote" CTA | med | S |
| 4.4 | Click-to-connect in RemoveLiquidity / CreatePool / Incentives | high | M |
| 4.5 | `TxStatusDialog` -> terminal-failure-only + dismissible; actually call `resetTx`; probably delete the stale-variables retry | high | S |
| 4.6 | Decompose broadcast so `"submitted"` fires with a real tx hash | high | M |
| 4.7 | Reset the swap form on confirmed swap (`onSuccess`, not `onSettled`) | low | S |
| 4.8 | Add `sequence-mismatch` + `out-of-gas` error kinds; stop interpolating `raw` into prose | med | S |
| 4.9 | `TokenSelect` keyboard nav (arrows + Enter, skipping disabled) | med | S |
| 4.10 | Rewrite operator-facing empty states; put `<WalletConnectButton />` in the connect EmptyStates | med | S |
| 4.11 | Fix the `isFetching` skeleton shift on PoolsPage / PriceCandleChart | low | S |
| 4.12 | Pool row identity (fee tier + type + unverified chip); IBC origin on token rows; copy pass | med | S |

### Wave 5: optional

- PoolDetail modals -> a persistent tabbed action card (also fixes the nested-modal focus leak). `[high, L]`
- Port `RemoveLiquidityForm` / `IncentivesPanel` to the same primitives as the rest of the app. `[med, M]`
- Salvage the orphaned stats into a protocol stat strip on the Pools header. `[med, S]`
- Create-pool polish: `<Link>` not `<a>`, number the final step, conditional Guardrails. `[low, S]`