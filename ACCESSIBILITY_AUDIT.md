# JUNO DEX Accessibility Validation

Date: 2026-07-13
Target: WCAG 2.2 Level AA
Scope: swap, pools, pool details, portfolio, liquidity, pool creation, transaction review/lifecycle, token selection, settings, and responsive navigation.

## Automated evidence

- Serious and critical axe findings fail Playwright across `/swap`, `/pools`, `/portfolio`, `/create`, `/liquidity`, and `/stats`.
- Transaction review, wallet rejection, and confirmed transaction states receive the same axe gate.
- The token selector dialog receives a dedicated axe gate.
- A rendered-style audit fails if visible informative text on any core route is below 12 CSS pixels.
- The 320 CSS-pixel viewport has no horizontal overflow and primary navigation, wallet, transaction, and quick-navigation controls are at least 44 pixels high.
- Keyboard checks cover skip navigation, route focus, token selector focus entry/return, settings Escape/return, and modal focus containment.
- Charts expose one keyboard focus target and an accessible data summary rather than one tab stop per candle.
- Reduced-motion emulation verifies that confirmed-transaction feedback collapses to no meaningful animation.
- Sort state, live transaction status, quote refresh state, and page changes have programmatic semantics.

Current automated result: all 16 Playwright checks pass together in one run, including the six-route axe sweep with its appropriate 60-second scope timeout.

## Manual release checks still required

These checks require human perception or assistive-technology behavior and must be recorded before claiming full WCAG 2.2 AA conformance:

- Complete swap, add/remove liquidity, incentives, and pool creation with current NVDA + Firefox or Chrome.
- Repeat the primary swap and transaction-recovery journey with current VoiceOver + Safari on macOS and iOS.
- Confirm announcement order and usefulness for quote refresh, validation errors, wallet rejection, timeout, confirmation, and delayed indexing.
- Inspect focus visibility and reading order in Windows High Contrast/forced-colors mode.
- Inspect text and non-text contrast for hover, focus, disabled, stale, warning, danger, verified, and success states with a contrast analyzer.
- Validate browser text-only zoom to 200% and desktop page zoom to 400% without clipped controls or lost content.
- Validate target spacing and fixed navigation with touch exploration on a physical narrow-screen device.

Record browser, OS, assistive-technology version, tester, date, outcome, and linked defects for each run. `GOAL.md` keeps full WCAG 2.2 AA unchecked until this manual evidence is complete.

## Evidence record

Use `Pass`, `Fail`, or `N/A` with an explanation. A tool name without tester, version, date, and observed result is not evidence.

| Environment | Journey/state | Tester and date | Result | Defect or evidence link |
| --- | --- | --- | --- | --- |
| NVDA + Firefox (current) | Swap, review, rejection, timeout, confirmation |  |  |  |
| NVDA + Chrome (current) | Add/remove liquidity, rewards, pool creation |  |  |  |
| VoiceOver + macOS Safari (current) | Swap, review, recovery, activity |  |  |  |
| VoiceOver + iOS Safari (current) | Swap, navigation, review, recovery |  |  |  |
| Windows forced colors | All core routes and transaction states |  |  |  |
| Contrast analyzer | Text/non-text interactive states |  |  |  |
| Desktop browser at 200% text zoom | All core routes |  |  |  |
| Desktop browser at 400% page zoom | All core routes |  |  |  |
| Physical narrow-screen touch device | Navigation, dialogs, forms, activity |  |  |  |

For screen-reader journeys, record whether labels identify asset and action, changed content is announced once in a useful order, review bounds are understandable without visual context, focus never becomes lost or trapped, and the user can distinguish safe retry from an ambiguous submitted transaction.
