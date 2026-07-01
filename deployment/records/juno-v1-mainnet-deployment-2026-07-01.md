# Astroport-Juno v1 mainnet deployment — 2026-07-01

## Scope

Experimental Astroport-Juno v1 deployment on `juno-1`, using the Juno agent hot wallet as upload signer/owner/guardian/treasury for thin-liquidity testing. Product surface remains XYK-only: no DEX token, stablecoin, LST, perps, yield vault, PCL/stable pairs, staking/maker/vesting/xASTRO launch surface.

## Contracts

| Component | Address / Code ID |
|---|---|
| Factory | `juno1n5ettlqdt06nd346mnqy65fahcvmncaazpwn8s3m0df3ldv0d2yqjqelca` / code `5129` |
| Pair code | code `5133` |
| First pair | `juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv` |
| Native coin registry | `juno1qwer7jleluth33trk2ywqvp6vwjh4j4zar3ag6dw5d8derkpel0sq8vfh2` / code `5131` |
| Router | `juno1fppwfa2efpsahvwlqprrshjth2mfqyd8n80yd7z5kpjspq30s8ksrapa8s` / code `5134` |
| Incentives | `juno1h0auy2knfyhkcn877cqun0fu00safgsjwvt82d4cvd0slv8q7wtsk59598` / code `5130` |
| Oracle | `juno1szsxu32r7rnu5wq7yqlxq4x46g0fq7qpzyggcvgsh2cq554mcuqql6jw4p` / code `5132` |
| Whitelist code | code `5136` |
| Tokenfactory tracker code | code `5135` |
| cw20-base | existing code `109` |

## First test pool

- Pair: `juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv`
- Assets: `ujuno` / `factory/juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76/junoagenttest202607010323`
- LP denom: `factory/juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv/astroport/share`
- Pair creation was opened publicly after pool verification (`permissioned=false`).

## Key txs

| Action | Tx |
|---|---|
| Store factory | `9F554BF49C45C3250D6BF0EEEEB446EA16AC9FF9C6E6CC1866912F2DC537A57F` |
| Store pair | `FD5FDF8D541858BC586D3F6705A4B79C0DC4D7AEE4D7C9305067C298AB617735` |
| Create test denom | `0C92541E989029A87F20C1768CFF59A1A570B01C356C25DA9139A201BDABA928` |
| Mint test denom | `5370935A3C98B8B36281C4BAD87F528269961B89E7F9B29015AD713FD11133D2` |
| Instantiate factory | `56B88238DD314A4774CC9019CE6763FE57A2FEBDE93F7DE85BD5F97F921C02AE` |
| Instantiate incentives | `7F4C3F4722BF41C6C832387F401ABBFA4F3F52B6B3DE77D75496BB7B0CEA8BAD` |
| Instantiate router | `39F331EF10486231BDB2C851F763EA826E3B19ABA04ED7D7B28FA95EC8666219` |
| Create pair | `8EFD15276286C15D5CFF11B55D49522D2987E16F8220DE671CA0971E586BCD8E` |
| Seed liquidity | `DEE44565B5E6124A27430646A371691396A504497EB0315D4A66675C8C765401` |
| Open pair creation | `5A214C0FAE998A5A772A13EA407C267E57787276A34AD8B7D4AF91FFD866E35E` |
| Smoke swap | `15CE5277D55668B4ADE7D44132C7E2EE4FE71882B2003C28503AF09D7138B502` |
| Smoke add liquidity | `F6C33B16578AAA1A4DC4931C250A07649F0F750AC8EAAE150146F5C6D54C5079` |
| Smoke withdraw liquidity | `ED1923D1DF041245296358BEC1EF80FDEFF47A3118F8CBD06EB73A7F5E860E97` |

## Verification

- Artifacts built locally with Rust 1.81.0 contract-by-contract, optimized with `wasm-opt -Oz`.
- `scripts/check_juno_v1_artifacts.py artifacts` passed.
- `cosmwasm-check` passed for all 8 artifacts.
- Factory pair query, pair pool query, pair simulation query, router config query, and native coin registry query all passed.
- Smoke swap/add-liquidity/withdraw-liquidity txs all included successfully.
- Frontend registry PR: https://github.com/JakeHartnell/juno-website/pull/1 (`aad48842f7b07c3f42842b9aa3db613419071caf`).
- Durable local artifacts/tx evidence: `/opt/data/repos/astroport-juno-v1-mainnet-deploy-20260701/`.

## Recommendation

Launch blocker is cleared for a test/preview frontend. Still label the pool as thin-liquidity experimental and do not imply public liquidity recommendation. Consider transferring owner/admin roles from the hot wallet to DAO-controlled governance before broader public promotion.

## Artifact SHA-256

```text
e38c3a9490fabe469605d2814fcf6e79b1482d031a66cd8dfdc23a010afc885d  artifacts/astroport_factory.wasm
d057f063573b7974113aaeee27c3252c075fdc11e2dd31c3485d11ca0d3ec9e3  artifacts/astroport_incentives.wasm
b7bba9d965a2e5074b29c9a7c08782da86535c336239203a8f6ba5213d7c3b0f  artifacts/astroport_native_coin_registry.wasm
a9062ec7d40ddfa7fac16f2da826c8dcbe887c9cf6d62aa85d1e939029d45066  artifacts/astroport_oracle.wasm
a99f1b1b3b3bed72ed9c4bdf16adfa51fc90057a943d31bb1c5ac870c9c95249  artifacts/astroport_pair.wasm
e5f9982127fbfe698958172f97f68483152e26d4385f381e9056ee62ce19f3c6  artifacts/astroport_router.wasm
a77ccfaf87f4dc3ce39c09980cf3783bf15e2f818e5250bcd411bbbb934609ee  artifacts/astroport_tokenfactory_tracker.wasm
aff60f2783e55a766f671506ad0cb32af67b5b166c54dc51ad44120e278e0de1  artifacts/astroport_whitelist.wasm
```

Full local tx JSON + wasm artifact archive exists at `/opt/data/repos/astroport-juno-v1-mainnet-deploy-20260701/` in the Juno agent environment. Do not commit raw tx directories or wasm binaries unless a release process explicitly calls for them.
