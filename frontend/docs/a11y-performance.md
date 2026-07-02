# Accessibility and performance checks

This pass keeps the quality tooling lightweight and tied to the existing Vite/Playwright setup.

## Automated accessibility smoke test

Run:

```sh
PLAYWRIGHT_BROWSERS_PATH=/opt/data/.cache/ms-playwright npm run test:a11y
```

The Playwright test builds the e2e bundle, serves it with `vite preview`, and runs axe against the core routes (`/swap`, `/pools`, `/portfolio`, `/create`, `/stats`) plus the swap token selector dialog. The assertion is intentionally scoped to the issue acceptance criterion: no **critical** axe violations.

## Lighthouse performance spot check

Run against the built e2e preview server:

```sh
npm run build:e2e
npm run preview:e2e -- --host 127.0.0.1 --port 4173
npx lighthouse http://127.0.0.1:4173/swap \
  --quiet \
  --chrome-flags="--headless --no-sandbox" \
  --only-categories=performance,accessibility \
  --output=json \
  --output-path=./lighthouse-swap.json
```

For issue #52 evidence, include the performance/accessibility category scores and keep `lighthouse-swap.json` out of git unless a future CI job consumes it.

## What this pass covers

- Dialog focus is trapped, Escape closes modals, and focus returns to the invoking control.
- Token selector controls expose explicit accessible names, expanded state, search/result relationships, and keyboard-friendly native buttons.
- Reduced-motion users do not receive the shimmer animation or long transitions.
- Route components are lazily loaded so non-swap pages do not inflate the initial swap route chunk.
- Read-only Stargate RPC access is cached so wallet balance refreshes reuse a single client connection instead of reconnecting on every query.
