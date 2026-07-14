# JUNO DEX Frontend UX Audit

Date: 2026-07-13

## Executive summary

The frontend has a strong technical foundation: it avoids fabricated market data, simulates routes before enabling swaps, blocks the wrong network, acknowledges unverified routes, protects liquidity actions with minimums, handles first-provider risk carefully, and includes responsive layouts, focus-visible styles, reduced-motion support, and accessible shared modals.

It is not ready for a public financial-product launch yet. Four issues are release blockers because they can mislead users or contribute to preventable loss:

1. The default featured market is explicitly experimental but is inferred to be verified.
2. High-price-impact swaps remain executable without a dedicated warning or confirmation gate.
3. The UI calls reverse-simulated execution “exact output,” although the transaction does not guarantee exact output or cap maximum input.
4. Quote expiry is calculated but ignored, so a stale quote can remain actionable.

The next tier of work is less about adding features and more about making each irreversible action understandable: show minimum received or maximum sent, fees, quote freshness, account, network, route, and risks in a review step; then provide one consistent transaction lifecycle with explorer access and safe recovery. After that, simplify technical copy, reduce degraded secondary-data noise, improve mobile chrome and touch targets, and raise the accessibility test bar.

### Implementation update

The four critical findings above have been addressed in the working tree: production routing now excludes non-active/unverified fixture markets, high and extreme price impact are gated, target-output language matches the bounded execution semantics, and expired quotes cannot proceed. Asset identity remains visible through review; live reserves inform route risk; explicitly blocked assets have no acknowledgement override. All write flows now use a shared pre-signature review and durable transaction lifecycle, and native/IBC/TokenFactory/CW20 paths are bounded or disabled when unsupported.

Automated verification now passes 231 unit/component/integration tests across 46 files and 16 Playwright checks. The browser suite covers the mocked-wallet swap, add/remove liquidity, incentives, portfolio, and pool-creation journeys; wallet rejection, pre-hash broadcast failure, delayed-indexing timeout, duplicate-confirmation safety, stable quote transitions, mobile transaction access, and reduced-motion confirmation feedback; plus serious/critical WCAG 2.2 axe checks across core routes and transaction states, keyboard focus return, 320 CSS-pixel reflow, readable text, and mobile touch targets. Exact-message JUNO network-fee estimation is included in every transaction review. A 16-case execution matrix covers native, IBC, TokenFactory, and CW20 assets across direct and routed swaps, supported liquidity paths, and pool creation. Exact confirmed balance deltas reconcile immediately where safe. Pool details are organized around position management, risk, performance, and composition; secondary analytics failures degrade quietly; wallet, RPC/fallback, and indexer health are distinct; and compact mobile navigation keeps Portfolio and durable activity one tap away. The registry now exposes five active verified markets and passes its automated release check. Remaining launch work is tracked in `GOAL.md`, notably recorded market-provenance approval, manual assistive-technology and perceptual WCAG validation, moderated usability testing, complete matrix evidence, and owner sign-off.

## Audit method

Three parallel reviews covered:

- Core journeys: swap, wallet connection, pool discovery, add/remove liquidity, portfolio, and transaction recovery.
- DeFi trust and safety: token identity, verification, price impact, slippage, quote freshness, fees, approvals, network state, and execution semantics.
- Interface quality: hierarchy, content, responsive behavior, accessibility, feedback, and visual delight.

The review used source inspection, focused tests, the mocked E2E environment, and rendered checks at 1440 x 1000 and 390 x 844. This is a heuristic and implementation audit, not a substitute for moderated usability testing or a smart-contract/security audit.

Severity means:

- **Critical:** plausible asset loss or a materially misleading commitment.
- **High:** a major trust, completion, or recovery failure.
- **Medium:** meaningful friction, comprehension, accessibility, or polish debt.

## What is working well

- Routes are simulated and the swap action is disabled while a quote is updating or unavailable (`frontend/src/components/swap/SwapForm.tsx:67-107`).
- Wrong-network transactions are blocked and a network recovery banner exists (`frontend/src/components/wallet/NetworkGuardBanner.tsx`).
- Risk assessment and acknowledgement infrastructure already exists for pools, routes, and assets (`frontend/src/lib/risk.ts`).
- Initial liquidity has unusually good first-provider education and a typed `SEED` acknowledgement (`frontend/src/components/liquidity/AddLiquidityForm.tsx`).
- Withdrawals show expected and minimum assets under the current slippage bound (`frontend/src/components/liquidity/RemoveLiquidityForm.tsx`).
- Shared modals trap focus, support Escape, restore focus, and lock body scroll (`frontend/src/components/common/Modal.tsx`).
- The token selector supports search, favorites, recent tokens, balance display, identifiers, and risk badges (`frontend/src/components/swap/TokenSelect.tsx`).
- Responsive checks found no horizontal overflow at 390 px, and mobile pool rows restore labels when table headers disappear.
- The product is honest when optional data is absent; it does not invent chart, portfolio, or pool metrics.

## Prioritized findings

### Critical — release blockers

#### 1. Experimental default market is presented as verified

The first and featured registry pool is `JUNO / Juno Agent Test`. Its notes say it is experimental thin-liquidity infrastructure and “not a public launch market,” but it has no explicit `verified: false` (`frontend/src/data/registry.juno-1.json:15-39`). Risk logic treats every registry pool that is not explicitly false as verified (`frontend/src/lib/risk.ts:95-102`), and the swap asset list similarly inherits verification from registry provenance (`frontend/src/components/swap/SwapForm.tsx:28-39`). Registry notes are not used by the risk layer, and swap route risk receives no reserve data for thin-liquidity detection.

**Impact:** a user sees a positive trust signal for exactly the market the registry warns operators not to launch publicly.

**Recommendation:** make verification explicit and conservative. Unknown must mean unverified. Add lifecycle states such as `experimental`, `active`, `deprecated`, and `blocked`; exclude non-active pools from featured markets and default routing; feed reserves into route risk; surface relevant notes in plain language.

#### 2. High-price-impact swaps have no loss-prevention gate

Price impact of 5% or more is classified `high` (`frontend/src/lib/swap/slippage.ts:54-57`), but the prominent warning renders only for `warning`, not `high` (`frontend/src/components/swap/SwapForm.tsx:218-220`). Price impact is not part of submission validation. The current test explicitly expects a high-impact trade to stay enabled (`frontend/src/components/swap/SwapForm.test.tsx:198-210`). Multi-hop/router impact is shown as unavailable because router simulation values are overwritten with zero (`frontend/src/queries/useSwapQuote.ts:47-53`; `frontend/src/components/swap/QuoteCard.tsx:97-104`).

**Impact:** the riskiest execution state gets less protective friction than the merely elevated state.

**Recommendation:** always show impact. Require a dedicated acknowledgement and review step above a product-defined threshold; hard-block pathological impact unless a deliberately enabled advanced override is justified. Compute route-level impact or clearly disclose that it is unavailable and add protective friction.

#### 3. Persisted slippage can reach 50% without being visible in the quote

Custom slippage up to 50% is accepted and saved across sessions (`frontend/src/components/settings/SettingsPanel.tsx`; `frontend/src/settings/SlippageSettingsContext.tsx:23-36`). The quote replaces the effective value with three preset chips. If the stored value is custom, no chip is selected and the actual bound is not displayed (`frontend/src/components/swap/QuoteCard.tsx:106-131`). The settings entry point is icon-only.

**Impact:** a returning user can unknowingly sign with an extreme execution tolerance.

**Recommendation:** always render `Max slippage: X%` beside the quote and again in confirmation. Warn above a conservative threshold, require explicit confirmation for high values, and substantially reduce the maximum unless there is a proven need.

#### 4. “Exact output” is not guaranteed by execution

Editing the receive field performs a reverse simulation and labels the CTA `Swap exact output` (`frontend/src/components/swap/SwapForm.tsx:62-70,108-126`). Execution then submits a normal exact-input swap using the simulated input. For router routes, `minimum_receive` is below the requested output; there is no maximum-input bound (`frontend/src/components/swap/SwapForm.tsx:143-154`; `frontend/src/mutations/useSwapTx.ts:29-41`).

**Impact:** the UI promises a transaction property it does not enforce.

**Recommendation:** implement genuine exact-output semantics with maximum-input protection, or rename the mode to `Target output estimate`, show that output may vary, and show the actual minimum received. Do not call the current behavior exact output.

### High — complete before public launch

#### 5. Quote freshness is computed but not enforced

The quote hook calculates age, expiration, and a 30-second TTL (`frontend/src/queries/useSwapQuote.ts:98-113`). `SwapForm` does not check `isExpired`. It passes `updatedAt` to `QuoteCard`, but the card does not display or otherwise use it (`frontend/src/components/swap/SwapForm.tsx:217`; `frontend/src/components/swap/QuoteCard.tsx:14-31`).

**Recommendation:** show an unobtrusive freshness/countdown state, disable expired quotes, refresh immediately before review, and bind the review to the exact route and quote being signed.

#### 6. Irreversible actions have no app-level review step

Swap, add liquidity, and remove liquidity broadcast directly from their primary CTA. Wallets may show raw CosmWasm messages, so the app is currently missing the human-readable commitment layer.

**Recommendation:** use one reusable review sheet for every write action. At minimum show:

- action and human-formatted amounts;
- minimum received or maximum sent;
- connected account and `juno-1`;
- token/pool verification and warnings;
- route and contract disclosure;
- LP/protocol fee and estimated network fee;
- quote age and expiry;
- clear `Confirm in wallet` final action.

#### 7. Swap quote omits key decision information

The quote shows rate, route, price impact, and slippage only (`frontend/src/components/swap/QuoteCard.tsx:84-134`). It omits minimum received, commission/LP fee even though direct quotes contain it, and estimated gas/network fee. Router impact and commission are unavailable by construction.

This falls short of the current established swap pattern, which exposes fee, network cost, route, price impact, slippage, and minimum output before commitment.

**Recommendation:** expose net outcome first, then progressive detail. Show minimum received/max input, route fee breakdown, network fee in JUNO (and fiat when reliable), and route-level impact.

#### 8. Transaction status and recovery are inconsistent

Transaction state infrastructure exists, but only create-pool renders `TxStatusDialog`. Swap/add/remove rely on fragmented inline text and toasts. The runner defines preparing, signing, and broadcasting states but jumps from signing to success/failure (`frontend/src/tx/useTxRunner.tsx`). Hashes are raw code rather than explorer links. Remove liquidity adds a second toast layer, risking duplicate notices. Timeout retry can blindly rebroadcast non-idempotent variables.

**Recommendation:** provide one persistent lifecycle: review -> confirm in wallet -> submitted -> confirmed/failed. Link every hash to the configured explorer, persist status across navigation, and check transaction/account state before offering a retry after timeout.

#### 9. Primary connect and network-recovery CTAs are inert

The swap action says `Connect wallet to swap` or `Switch to Juno to swap`, but the button is disabled in those states (`frontend/src/components/swap/SwapForm.tsx:103-116,224`). Remove liquidity behaves similarly. Add liquidity contains connect/switch branches, but disabling can make the wrong-network branch unreachable.

**Recommendation:** let the primary action connect or switch networks, preserve the user's entered intent, then revalidate before review. Reserve disabled buttons for invalid amounts, unavailable quotes, and pending actions.

#### 10. Token identity and status disappear after selection

The swap's compact selected-token controls hide identifiers and verification state (`frontend/src/components/swap/SwapForm.tsx:180-213`). Risk badges appear inside the selector, but not at commitment time. The known-bad denom list is empty, and its future `denylisted` state would still permit acknowledgement rather than block execution (`frontend/src/lib/risk.ts:23-26,71-73`).

**Recommendation:** keep verified/unverified status visible beside selected tokens; provide a concise denom/contract disclosure with copy and explorer actions; distinguish native, IBC, TokenFactory, and CW20 assets. Block known malicious assets; acknowledgement is for unknown assets, not known-bad ones.

#### 11. Network health can be falsely reassuring

The sidebar always says `juno-1`, `Live`, and `Phase Δ.4.0.0` (`frontend/src/components/layout/DexShell.tsx:83-87`), even while RPC or indexer-backed areas are degraded.

**Recommendation:** separate wallet chain, RPC health/sync, and indexer freshness. Derive health from real checks and timestamp it. Move build/phase metadata into diagnostics.

#### 12. CW20 support is exposed without a complete transaction UX

The asset model accepts CW20s, but current swap and liquidity broadcasts use direct contract execution/native funds paths without an allowance/send/approval flow. There is no spender, approval amount, multi-transaction progress, or revoke guidance.

**Recommendation:** do not expose unsupported CW20 actions. Validate and implement the correct atomic send hook where available. If approval is required, request an exact amount and clearly disclose token, spender, amount, transaction count, allowance state, and revoke path; never default to unlimited approval.

### Medium — comprehension, accessibility, and delight

#### 13. The core swap starts with an unsolicited amount and lacks useful balance actions

The send amount initializes to `1`, immediately causing quote work (`frontend/src/components/swap/SwapForm.tsx:52`). Both swap fields hide existing Half/MAX controls; the receive-token balance is not passed, so it can show `bal —`. An undefined/loading balance is treated as not exceeding the balance.

**Recommendation:** start empty; show both balances; add gas-aware MAX for native JUNO plus a 50% shortcut; keep the previous quote dimmed while refreshing to avoid layout shifts; do not enable execution until the relevant balance state is known.

#### 14. Optional-data failures make the entire product feel broken

When the indexer is degraded, the secondary chart and recent-activity panel can dominate the swap page with unavailable/error copy even though swapping still works (`frontend/src/components/swap/SwapPage.tsx:31-54`).

**Recommendation:** use stale cached data with a timestamp when possible. Otherwise collapse optional panels into a quiet compact placeholder. Reserve prominent red errors for trade-blocking failures.

#### 15. Content often speaks to operators rather than traders

Messages such as `strict registry`, `factory discovery`, `no fake rows`, `indexer request failed`, and implementation explanations on pool detail pages expose internal architecture. Pool details mix decision information with contract identity, share math, query status, and unsupported-parameter commentary.

**Recommendation:** lead with user outcomes and available actions. Put technical diagnostics and raw identifiers behind `Details`. Structure pool details around performance, composition, the user's position, risks, and manage-liquidity actions.

#### 16. Accessibility coverage and readable contrast are below the desired bar

`textSubtle` (`#6E5C4A`) measures approximately 2.94:1 on card backgrounds and is widely used at 0.58-0.72rem (`frontend/src/theme/junoTheme.ts:13-16`; `frontend/src/styles/theme.css`). The automated accessibility suite checks WCAG 2.0/2.1 tags and rejects only `critical` axe findings, allowing `serious` findings to pass (`frontend/e2e/a11y.spec.ts:4-13,28-34`).

Other gaps include no skip link or SPA route focus/title management, sort controls without `aria-sort`, and charts that can expose one tab stop per candle.

**Recommendation:** meet WCAG 2.2 AA; bring all informative text to at least 4.5:1; use a readable minimum text size; fail CI on serious and critical findings; add mobile, keyboard, focus-order, zoom/reflow, dialog, and transaction-state tests. Use one composite chart focus target plus a summary/table alternative.

#### 17. Mobile works, but it is not yet effortless

At <=860 px, the brand/hamburger row is followed by a separate wallet-only row, consuming roughly 114 px before content (`frontend/src/styles/theme.css:2229-2280`). Settings, flip, close, and slippage controls use small 34 px or compact targets. Settings uses `role=dialog` without the robust keyboard behavior of the shared modal. Persistent toasts can obscure bottom content.

**Recommendation:** use one sticky app bar with a compact account control; evaluate bottom navigation for Swap/Pools/Portfolio; make core touch targets approximately 44 px; reuse the shared modal/popover behavior; make toasts time-limited with pause-on-hover/focus and back them with a persistent transaction center.

#### 18. Wallet and pool-management entry points need clearer intent

Clicking a connected wallet immediately disconnects, with no account menu, address copy, explorer link, or switch-wallet action. On the pools page, `+ Provide` leads to pool creation rather than providing liquidity. The legacy liquidity overview always displays an empty-state card even when positions may be present.

**Recommendation:** open an account sheet and make disconnect an explicit secondary action. Rename `Provide` to `Create pool`, or route it to a genuine add-liquidity flow. Show liquidity helper/empty content only when it matches the user's actual state.

## Baseline validation observations

- Rendered desktop and 390 px mobile checks found no horizontal overflow.
- At audit time, the automated accessibility run asserted only the absence of `critical` axe violations; that was not evidence of WCAG 2.2 AA conformance. The implementation update above records the stronger current automated gate, while `ACCESSIBILITY_AUDIT.md` lists the manual evidence still required.
- At audit time, the focused swap and liquidity E2E expectations were stale relative to the UI. Those journeys and their recovery states now pass in the current 15-check browser suite.

## Recommended sequence

1. Correct verification defaults and remove experimental pools from public defaults.
2. Make execution semantics truthful; add price-impact, slippage, and stale-quote gates.
3. Add complete quote disclosure and a shared review step.
4. Unify transaction status, explorer links, and timeout recovery.
5. Repair connect/switch actions, balance loading, and token identity.
6. Simplify content and degraded optional panels.
7. Complete WCAG 2.2 AA/mobile work and repair critical-flow E2E coverage.
8. Add measured delight: stable quote transitions, restrained success motion, useful freshness cues, and fast account/portfolio access.

## External benchmark references

- [Uniswap Web App: The Swap Screen](https://support.uniswap.org/hc/en-us/articles/39862756339341-Uniswap-Web-App-The-Swap-Screen) — current swap-detail conventions including fees, network cost, routing, impact, slippage, and minimum output.
- [Uniswap: What is price impact?](https://support.uniswap.org/hc/en-us/articles/8671539602317-What-is-Price-Impact) — high-impact warning and deliberate override pattern.
- [Uniswap: Price impact vs. price slippage](https://support.uniswap.org/hc/en-us/articles/8643794102669-Price-Impact-vs-Price-Slippage) — language for distinguishing two frequently confused concepts.
- [Uniswap: What are token warnings?](https://support.uniswap.org/hc/en-us/articles/40074236290445-What-are-token-warnings) — persistent token decision-support patterns.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — contrast, reflow, focus, status, target-size, and error-prevention requirements.
- [Nielsen Norman Group usability heuristics](https://media.nngroup.com/media/articles/attachments/Heuristic_Summary1_A4_compressed.pdf) — system visibility, user control, error prevention, consistency, and recovery principles.
