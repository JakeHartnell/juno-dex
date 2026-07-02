# Frontend Playwright E2E

The Playwright suite exercises the critical Juno DEX flows with deterministic in-app mocks:

- connected wallet state and signing client
- swap quote + swap transaction lifecycle
- add/remove liquidity and portfolio/history rendering
- create-pool duplicate guardrails and custom pool submission
- incentives stake and claim actions

The app only enables these mocks when `VITE_DEX_E2E=true`, which is wired into `npm run build:e2e` and `npm run test:e2e`. Mock transactions are recorded on `window.__DEX_E2E_TXS__`; no wallet extension, live RPC, indexer, Docker service, or real broadcast is required.

## Commands

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium # first run / CI image setup
npm run test:e2e
```

`npm run test:e2e` builds a mocked production bundle, starts `vite preview` through Playwright's `webServer`, and runs Chromium tests in `frontend/e2e/`.
