# JUNO DEX Release Evidence

Date opened: 2026-07-13
Status: **not ready for public launch**

This file is the evidence index for `GOAL.md`. A checkbox is complete only when the linked automated result or signed human record exists. Passing automated tests does not substitute for usability, assistive-technology, production-configuration, or owner approval evidence.

## Automated evidence

| Requirement | Evidence | Current result |
| --- | --- | --- |
| Source behavior and exact-message integration | `npm test -- --run` | Pass: 231 tests in 46 files |
| Type safety | `npm run typecheck` | Pass |
| Core mocked-wallet journeys and recovery | `npx playwright test e2e/dex-flows.spec.ts` | Pass |
| Serious/critical axe, keyboard, reflow, text size, focus, reduced motion | `npx playwright test e2e/a11y.spec.ts` | Pass |
| Combined browser regression | `npx playwright test` | Pass: 16 tests |
| Production registry readiness | `npm run release:check` | Pass: 5 explicitly active markets; provenance approval remains a human release check |

## Test-matrix traceability

The matrix in `GOAL.md` describes states that apply differently to each write flow. The current suite provides strong shared-component and representative browser coverage, but it does **not** exercise every listed state at both desktop and mobile for every write flow. Until the missing rows are automated or recorded manually, the complete test-matrix Definition of Done remains open.

| Matrix area | Current evidence | Remaining evidence |
| --- | --- | --- |
| Wallet/network | App and wallet component tests cover disconnected, connected, wrong-chain, and switching behavior; browser tests cover connected flows and wallet rejection. | Browser completion for disconnected intent preservation and chain-switch rejection at desktop and mobile. |
| Data lifecycle | Query/data-access tests cover loading, stale, unavailable, refreshed, and fallback behavior. | Rendered desktop/mobile evidence for each write flow where the state changes the commitment action. |
| Balances | Swap/liquidity component tests cover unknown, insufficient, and available balances. | Exact-balance and mobile rendered evidence for each amount-bearing write flow. |
| Asset/pool trust | Registry, risk, route, swap, liquidity, and creation tests cover verified, unknown, experimental, and blocked data. | Browser evidence for warning comprehension; blocked assets must remain non-actionable. |
| Price impact | Swap tests cover normal, elevated/high acknowledgement, unavailable multi-hop impact, and pathological blocking. | Mobile rendered evidence for each applicable impact class. |
| Slippage | Slippage/settings/swap tests cover presets, custom bounds, warnings, and legacy 50% clamping. | Mobile keyboard/screen-reader review of custom-warning interaction. |
| Transaction outcomes | Runner/component/browser tests cover rejection, pre-hash broadcast failure, timeout, confirmation, delayed indexing, and duplicate prevention. | Mobile recovery evidence for each remaining materially distinct recovery action. |
| Accessibility | Axe, keyboard focus, 320 px reflow, target size, reduced motion, and status-state checks pass. | The manual checks listed in `ACCESSIBILITY_AUDIT.md`, including NVDA and VoiceOver completion. |

## Moderated usability protocol

Recruit at least five representative first-time or infrequent DeFi users. Do not coach terminology. Use a production-like build with non-spendable test assets and record participant consent without retaining wallet addresses.

For each participant, run these tasks:

1. Prepare a normal swap and pause at review. Ask what will be sent, the worst acceptable received amount, fee categories, account/network, asset status, and route.
2. Present an unverified/high-impact case. Ask why the warning appears and whether proceeding is appropriate.
3. Recover from wrong network, wallet rejection, an expired quote, and delayed indexing without assistance.
4. Add and remove liquidity, asking which amounts are fixed, estimated, or minimum-protected.
5. Locate confirmed activity and the explorer path after navigating away, including once at mobile width.

Record one row per participant; never infer an answer from successful clicking.

| Participant | Representative profile | Commitment comprehension (pass/fail) | Recovery (pass/fail) | Critical confusion or loss-risk behavior | Notes/evidence link |
| --- | --- | --- | --- | --- | --- |
| P1 |  |  |  |  |  |
| P2 |  |  |  |  |  |
| P3 |  |  |  |  |  |
| P4 |  |  |  |  |  |
| P5 |  |  |  |  |  |

Required result: at least 4/5 pass commitment comprehension and at least 4/5 recover without assistance, with no unresolved critical/high heuristic issue introduced by observed behavior.

## Manual accessibility evidence

Complete the browser/assistive-technology matrix in `ACCESSIBILITY_AUDIT.md`. Link defects and rerun evidence here. Do not check full WCAG 2.2 AA in `GOAL.md` until every applicable criterion has a recorded pass or justified not-applicable determination.

## Production readiness record

- [x] `npm run release:check` passes against the current candidate (rerun against the exact release commit).
- [ ] At least one enabled, active, explicitly verified market and both assets have operator/security provenance approval.
- [ ] RPC, REST, explorer, indexer, factory, router, incentives, and oracle values are validated against the intended JUNO deployment.
- [ ] A production-like smoke test confirms health labels never report healthy/verified from preview, mock, empty, or failed responses.
- [ ] Release artifact digest/commit:

## Required sign-offs

Sign only after reviewing the exact release commit and linked evidence.

| Owner | Name | Decision | Date | Evidence/conditions |
| --- | --- | --- | --- | --- |
| Product |  |  |  |  |
| Engineering |  |  |  |  |
| Design |  |  |  |  |
| Accessibility |  |  |  |  |
| Security |  |  |  |  |
