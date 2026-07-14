# Goal: A Safe, Clear, and Delightful JUNO DEX

## Outcome

Ship a public JUNO DEX frontend in which a first-time trader can confidently understand and complete a swap, a liquidity provider can safely manage a position, and every user can recover from wallet, network, quote, and transaction failures without guessing.

The interface must be truthful before it is clever, protective before it is fast, and progressively disclose technical detail without forcing protocol jargon into the primary journey.

The supporting findings and evidence are in [UX_AUDIT.md](./UX_AUDIT.md).

## Product principles

1. **Never overstate certainty.** Unknown verification, impact, fees, health, and price data must be labeled unknown—not inferred as safe or live.
2. **Show the commitment before the signature.** Users see human-readable inputs, bounds, fees, account, network, route, and risks before opening the wallet.
3. **Prevent costly mistakes.** Extreme impact, slippage, stale quotes, wrong networks, malicious assets, and unsupported token mechanics are gated or blocked.
4. **Keep the main task calm.** Optional analytics degrade quietly; trade-blocking problems are prominent and actionable.
5. **Make recovery obvious.** Every transaction has a durable status, explorer path, and safe next step.
6. **Design for touch, keyboard, and assistive technology together.** WCAG 2.2 AA is a release requirement, not a later polish pass.

## Public-launch release gates

All checkboxes in this section must be complete before a public mainnet launch.

### Gate 1 — Truthful markets and assets

- [x] Require explicit `verified: true` for verified pools and assets; default missing status to unverified.
- [x] Add pool lifecycle state (`experimental`, `active`, `deprecated`, `blocked`) and validate it in registry parsing.
- [x] Remove experimental/test pools from default selection, featured markets, and normal routing.
- [x] Keep selected-token verification and origin visible through review and signature.
- [x] Feed live reserves and registry risk metadata into route assessment.
- [x] Hard-block known malicious/blocked denoms; do not offer an acknowledgement override.
- [x] Add unit tests proving unknown/experimental/blocked assets cannot appear verified or route by default.

**Acceptance:** no pool or asset receives a positive trust label solely because it came from the local registry; the initial swap market is an explicitly active, production-approved pair.

- [ ] **Gate 1 acceptance evidence:** configure and approve at least one explicitly active production market; `npm run release:check` must pass on the release commit.

Progress (2026-07-14): registry parsing requires explicit pool/asset verification and lifecycle metadata; factory-discovered pools default to `experimental` and unverified; route construction accepts only enabled `active` pools. Selected assets retain verification and native/IBC/CW20 origin in the swap and review. Route assessment consumes live reserves and registry metadata, and its badges remain visible at commitment time. Explicitly blocked assets are rejected by registry market selection, route construction, swap, liquidity, and pool creation with no acknowledgement override. The committed registry now contains five enabled, active, explicitly verified markets and passes `npm run release:check`. Operator/security provenance approval still needs to be recorded in `RELEASE_EVIDENCE.md` before Gate 1 acceptance is closed.

### Gate 2 — Safe and truthful swap execution

- [x] Replace the current `exact output` claim with truthful target-output language, or implement maximum-input-protected exact-output execution.
- [x] Always show the effective custom/persisted slippage value in the quote and review.
- [x] Reduce the custom-slippage ceiling and add escalating warnings/confirmation at product-defined thresholds.
- [x] Show price impact for every route where it can be computed.
- [x] Require explicit confirmation for high impact and hard-block pathological execution by default.
- [x] Display minimum received for exact-in and maximum sent for genuine exact-out.
- [x] Disable expired quotes and refresh/revalidate immediately before review.
- [x] Bind confirmation to the reviewed amount, route, slippage, and quote version.
- [x] Add tests for high/extreme impact, custom 50% legacy storage, stale quote, route change during review, and exact-output semantics.

**Acceptance:** the transaction cannot execute under a materially different or less protective interpretation than the one displayed in the review.

Progress (2026-07-13): reverse simulation is now presented as a target-output estimate and still executes with a visible minimum-received bound. Effective slippage is always visible in quote and review, capped at 5%, and requires acknowledgement above 1%; legacy 50% storage is clamped and tested. Direct-route impact is classified with acknowledgement from 5% and a hard block from 15%; unavailable multi-hop impact is labeled and acknowledged. Quotes expose expiry, expired quotes are blocked, review forces a fresh simulation, and wallet confirmation is bound to the reviewed amount, route, slippage, and quote timestamp. Focused Gate 2 coverage passes across swap, quote, slippage math, and persisted settings; the complete frontend suite passes 231 tests across 46 files.

### Gate 3 — Complete pre-signature review

- [x] Build a reusable review sheet for swap, add liquidity, remove liquidity, incentives, and create pool.
- [x] Show human-formatted send/receive amounts and execution bounds.
- [x] Show connected account, chain ID, token/pool status, route, and contract disclosure.
- [x] Show LP/protocol commission where applicable and an exact-message network-fee estimate in JUNO; add fiat only when reliable.
- [x] Explain whether values are fixed, estimated, minimum, or maximum.
- [x] Label unsupported/unavailable impact or fee data and add appropriate friction.
- [x] Make the final action read `Confirm in wallet` and refresh safety-critical data first.

**Acceptance:** in usability testing, at least 4 of 5 first-time participants can correctly state what they send, the worst acceptable outcome, the fee categories, the account/network, and why any warning appears before signing.

- [ ] **Gate 3 acceptance evidence:** record a passing five-participant moderated study using `RELEASE_EVIDENCE.md`.

Progress (2026-07-13): a shared transaction-review surface now gates swap, add liquidity, remove liquidity, stake/unstake/claim, and pool creation. It consistently exposes the connected account, chain, fixed/estimated/enforced amounts, relevant pool/trading commissions, technical destinations, and the final `Confirm in wallet` action. Swap refreshes its quote; liquidity refreshes reserves; incentives refreshes contract state; pool creation refreshes factory configuration and duplicate detection. Every review simulates the exact execution message and displays the resulting JUNO fee estimate using the configured gas price and a 1.3 gas adjustment; unsupported wallet clients get an explicit unavailable state. Fiat is omitted because no reliable price feed is configured. The moderated 4-of-5 comprehension criterion remains open, so Gate 3 is not yet complete.

### Gate 4 — Durable transaction lifecycle and recovery

- [x] Use one shared state model: preparing, awaiting signature, submitted, confirmed, rejected, failed, and timed out.
- [x] Render one consistent lifecycle surface and one toast stream per transaction.
- [x] Link every transaction hash to the configured explorer.
- [x] Persist pending/recent transactions across route changes and modal closure.
- [x] Show human-formatted amounts in success copy.
- [x] On timeout, check hash/account sequence before allowing rebroadcast.
- [x] Provide `View in explorer`, `Refresh balances`, and safe retry actions where applicable.
- [x] Update balances, positions, and activity optimistically only when the state is unambiguous.
- [x] Repair mocked-wallet E2E coverage for swap, add/remove liquidity, incentives, portfolio, and pool creation.
- [x] Add browser coverage for rejection, timeout/delayed indexing, and duplicate prevention.

**Acceptance:** users never need to resubmit merely because the app lost visible status, and a timeout path cannot blindly duplicate an irreversible action.

Progress (2026-07-13): every exposed write flow now renders the shared lifecycle card and relies on the transaction runner's single toast stream. The lifecycle vocabulary covers preparation through confirmation/failure, hashes link to the configured explorer, and a global local-storage-backed transaction center survives route/modal unmounts. Confirmed transactions offer refresh actions and human amounts. Ambiguous timeouts explicitly require checking recent account activity and never expose blind retry. An in-flight promise guard deduplicates rapid confirmation, including while downstream data is reconciling. Confirmed activity is written to durable local history immediately. Cached balances reconcile only protocol-exact non-gas deltas: non-JUNO native/IBC/TokenFactory spends, LP burns, and fixed LP stake/unstake amounts. JUNO spends, CW20 balances, swap receipts, LP mints, and rewards wait for authoritative refresh because their final deltas are not known locally. The mocked-wallet browser suite exercises normal write journeys plus wallet rejection, pre-hash broadcast failure and safe retry at mobile width, ambiguous timeout/delayed-indexing copy, and double-confirm prevention.

### Gate 5 — Supported asset mechanics only

- [x] Audit native, IBC, TokenFactory, and CW20 execution paths for swap and liquidity actions.
- [x] Hide or disable asset/action combinations without a verified transaction path.
- [x] Implement atomic CW20 send hooks where supported.
- [x] If approval is required, request an exact amount and show spender, token, allowance, transaction count, and revoke guidance.
- [x] Never request unlimited approval by default.
- [x] Add integration tests for each exposed asset kind and route type.

**Acceptance:** every asset/action combination presented by the UI has a tested, understandable, and safely bounded execution path.

Progress (2026-07-13): native, IBC, and TokenFactory denoms use bounded native-fund messages. Direct and routed CW20 swaps use atomic CW20 `send` hooks to the pair/router instead of unfunded executes. CW20 add-liquidity is disabled in the UI and rejected again at message construction until an exact-allowance flow exists; no approval path requests any allowance, unlimited or otherwise. The 16-case exact-message integration matrix encodes native, IBC, TokenFactory, and CW20 direct and multi-hop swaps; supported provide/withdraw combinations; the rejected CW20-liquidity boundary; and pool creation identity for every asset kind.

## Launch-quality work

Complete after the loss-prevention gates, before calling the product delightful.

### Core-flow usability

- [x] Start swap amounts empty; do not imply transaction intent.
- [x] Make disconnected/wrong-network primary actions connect or switch, then preserve and revalidate intent.
- [x] Show both token balances and block execution while the relevant balance is unknown.
- [x] Add gas-aware MAX and 50% shortcuts to the send field.
- [x] Visibly distinguish `Sell exact` and `Target buy`/genuine `Buy exact` modes.
- [x] Keep the last valid quote visible but subdued while refreshing to avoid layout shifts.
- [x] Rename the pools-page `Provide` link so it matches its destination, or route it to real add liquidity.
- [x] Show liquidity empty/helper states only when the wallet actually has no positions.

### Information architecture and content

- [x] Rewrite user-facing operator jargon into plain outcomes and recovery actions.
- [x] Move raw contracts, denoms, RPC details, query status, and implementation caveats behind disclosures.
- [x] Reorganize pool details around performance, composition, risk, the user's position, and primary management actions.
- [x] Replace immediate wallet-chip disconnect with an account menu containing address, copy, explorer, switch, and disconnect.
- [x] Show actual wallet chain, RPC health, indexer freshness, fallback state, and last update separately.
- [x] Collapse unavailable optional analytics into quiet placeholders; use stale cached data with timestamps when safe.

Progress (2026-07-13): pool details now lead with the user's position and management actions, followed by explicit pool risk, performance, reserve composition, price history, and recent activity. Contract addresses, asset identifiers, LP supply math, network endpoints, model parameters, and implementation caveats are consolidated in labeled disclosures. Missing chart data is a quiet, retryable placeholder rather than an alert, and cached price and performance data carries an updated or last-available timestamp. The network surface separately reports the wallet's actual and required chain, transaction readiness, live RPC/fallback health, and whether the indexer is healthy, unavailable, disabled, unconfigured, or serving preview data. Liquidity, pool creation, analytics, incentives, and portfolio states now describe user outcomes and recovery actions instead of factory/query/indexer wiring.

### Mobile and accessibility

- [ ] Meet WCAG 2.2 AA for all core routes and transaction states.
- [x] Raise informative text contrast to at least 4.5:1 and establish a readable minimum text size.
- [x] Use approximately 44 px touch targets for primary mobile controls.
- [x] Combine mobile brand/navigation/account chrome into one compact sticky bar; evaluate bottom navigation.
- [x] Add skip-to-content, document-title updates, route announcements, and focus management.
- [x] Give sort columns visible direction and programmatic `aria-sort`.
- [x] Replace per-candle tab stops with a single chart focus target and accessible summary table.
- [x] Give settings proper popover/modal focus, Escape, outside-click, and focus-return behavior.
- [x] Prevent toasts from obscuring content; auto-dismiss noncritical notices with pause on hover/focus.
- [x] Fail accessibility CI on serious and critical axe findings across core routes and the token selector.
- [x] Add dedicated WCAG 2.2 mobile, keyboard, zoom-equivalent reflow, and focus tests.

Progress (2026-07-13): core routes, the token selector, transaction review, rejection, and confirmation states pass the serious/critical WCAG 2.2 axe gate. A rendered-style audit enforces at least 12 CSS pixels for visible informative text across every core route; axe enforces AA text contrast, including disabled transaction controls. Browser tests cover skip navigation, route focus, token/settings dialog focus return, 320 CSS-pixel reflow (the WCAG desktop zoom equivalent), 44 px mobile controls, and reduced motion. Sort direction is visible and programmatic, and the chart uses one focus target with a summary table instead of a tab stop per candle. Mobile brand, wallet, and navigation now share one compact sticky header, with a tested bottom quick bar for Swap, Pools, Portfolio, and durable transaction activity. Full AA remains open pending the assistive-technology and perceptual checks documented in `ACCESSIBILITY_AUDIT.md`.

### Delight and perceived quality

- [x] Use subtle quote-freshness feedback without creating urgency theater.
- [x] Add stable loading/success transitions that do not shift the form.
- [x] Use restrained semantic color differentiation for success, warning, danger, and verification.
- [x] Add brief successful-transaction feedback that respects reduced-motion preferences.
- [x] Keep recent activity, portfolio, and transaction status fast to reach on mobile.
- [x] Ensure secondary service failures never make a healthy trading flow look broken.

Progress (2026-07-13): success, warning, danger, pending, and verification states use restrained semantic tokens plus text or icons rather than color alone. Confirmed transactions receive a brief checkmarked toast that auto-dismisses and collapses its animation under `prefers-reduced-motion`. The quote region reserves stable space from empty input through simulation, the browser suite caps normal quote-to-action movement at 8 pixels, and transaction lifecycle cards render after primary actions so status expansion does not move the commitment control. Optional market discovery, activity, price-history, portfolio enrichment, and ranking failures render as quiet retryable notices while healthy balances and trading actions remain visually primary. On narrow screens, persistent quick navigation keeps Portfolio and the durable transaction center one tap away without obscuring main content.

## Test matrix

Current traceability and missing evidence are recorded in [RELEASE_EVIDENCE.md](./RELEASE_EVIDENCE.md). This matrix is not complete merely because representative component and browser suites pass.

Each write flow must be covered at desktop and mobile widths for:

- disconnected, connected, wrong chain, and chain-switch rejection;
- empty, loading, stale, unavailable, and refreshed data;
- insufficient, exact, and ample balances;
- verified, unknown, experimental, and blocked assets/pools;
- normal, elevated, high, and pathological price impact;
- preset, custom, and legacy-persisted slippage;
- wallet rejection, broadcast failure, timeout, confirmation, and delayed indexing;
- keyboard-only, 200% zoom/reflow, reduced motion, and screen-reader status announcements.

## Success measures

Instrument without collecting wallet-identifying analytics beyond what is necessary and consented to.

- **Safety:** zero known cases where displayed verification or execution semantics differ from the signed transaction; zero blind timeout rebroadcasts.
- **Comprehension:** >=80% of usability-test participants correctly identify execution bounds, fees, network, and token status before signing.
- **Completion:** >=90% of successful wallet-signature journeys retain visible status through chain confirmation.
- **Recovery:** >=80% of participants can recover from wrong-network, rejected-signature, stale-quote, and delayed-indexing scenarios without assistance.
- **Accessibility:** zero serious/critical axe violations on gated flows, full keyboard completion, and documented WCAG 2.2 AA manual checks.
- **Responsiveness:** no horizontal overflow at 320 px; primary controls meet target-size requirements; key swap actions stay reachable without obstructive overlays.
- **Perceived quality:** optional-data degradation does not reduce swap completion in tests or produce a trade-blocking visual treatment.

## Delivery order

1. Gates 1-2: truth and loss prevention.
2. Gates 3-4: review, status, and recovery.
3. Gate 5: supported token mechanics.
4. Core-flow and content simplification.
5. WCAG/mobile release pass.
6. Delight, performance, usability testing, and metric validation.

## Definition of done

This goal is complete when:

- every public-launch gate and launch-quality checkbox is complete;
- the complete test matrix passes in CI where automatable and has documented manual evidence otherwise;
- a final heuristic review finds no critical/high issue;
- moderated tests with at least five representative users meet the comprehension and recovery targets;
- production configuration contains no experimental default market or falsely positive health/verification state;
- product, engineering, design, accessibility, and security owners explicitly sign off on launch readiness.

The reproducible commands, test-matrix gaps, moderated-study protocol, production checklist, and sign-off record are maintained in [RELEASE_EVIDENCE.md](./RELEASE_EVIDENCE.md).
