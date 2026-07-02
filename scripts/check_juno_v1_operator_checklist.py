#!/usr/bin/env python3
"""Validate the Astroport-Juno v1 operator tx checklist.

The checklist is the last human-facing handoff before a uni-7 deployment config
is rendered. This guard keeps its 16 expected tx filenames, config keys, and
command wiring aligned with the extractor/bundler scripts.
"""
from __future__ import annotations

import pathlib
import re
import sys
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
CHECKLIST = ROOT / "deployment" / "operator-tx-checklist.md"
README = ROOT / "deployment" / "README.md"

STORE_KEYS = (
    "astroport-factory",
    "astroport-incentives",
    "astroport-native-coin-registry",
    "astroport-oracle",
    "astroport-pair",
    "astroport-router",
    "astroport-tokenfactory-tracker",
    "astroport-whitelist",
    "cw20-base",
)

ADDRESS_KEYS = (
    "astroport-factory",
    "astroport-incentives",
    "astroport-native-coin-registry",
    "astroport-oracle",
    "astroport-router",
    "astroport-tokenfactory-tracker",
    "astroport-whitelist",
)

REQUIRED_MANUAL_ENV = (
    "JUNO_OWNER",
    "JUNO_GUARDIAN",
    "JUNO_TREASURY",
    "JUNO_TOKENFACTORY_MODULE",
    "FIRST_COUNTERPARTY_DENOM",
)

SCOPE_GUARDRAIL = "No stable pools, LSTs, perps, yield theater, or new token scope."
LAUNCH_GATE_TEXT = (
    "permissioned=true",
    "pair_create_msg_template",
    "provide_liquidity",
    "round-trip swap",
    "update_pair_config",
    "permissioned=false",
    "deployment/tx/uni-7/update-pair-config-open-xyk.json",
)


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def require_once(text: str, needle: str, label: str | None = None) -> None:
    count = text.count(needle)
    if count != 1:
        fail(f"expected exactly one {label or needle!r}, found {count}")


def main() -> None:
    try:
        text = CHECKLIST.read_text()
    except FileNotFoundError:
        fail("missing deployment/operator-tx-checklist.md")

    readme = README.read_text() if README.exists() else ""
    if "operator-tx-checklist.md" not in readme:
        fail("deployment/README.md must link the operator tx checklist")

    for key in STORE_KEYS:
        table_row = f"| `deployment/tx/uni-7/store-{key}.json` | `code_ids.{key}` |"
        if table_row not in text:
            fail(f"store tx table row missing for {key}")
        require_once(text, f"--code-id {key}=deployment/tx/uni-7/store-{key}.json", f"extractor store arg for {key}")

    for key in ADDRESS_KEYS:
        table_row = f"| `deployment/tx/uni-7/instantiate-{key}.json` | `addresses.{key}` |"
        if table_row not in text:
            fail(f"instantiate tx table row missing for {key}")
        require_once(text, f"--address {key}=deployment/tx/uni-7/instantiate-{key}.json", f"extractor address arg for {key}")

    for env_name in REQUIRED_MANUAL_ENV:
        if env_name not in text:
            fail(f"manual environment variable missing from checklist: {env_name}")

    for needle in (
        "python3 scripts/extract_juno_v1_tx_sets.py",
        "> deployment/tx/uni-7/tx-sets.txt",
        "python3 scripts/build_juno_v1_deployment_command.py",
        "--tx-sets deployment/tx/uni-7/tx-sets.txt",
        "--output deployment/juno-v1-testnet.json",
        "--render",
        "OK: Juno v1 deployment template matches instantiate schema requirements",
        "instantiate_msgs=7 code_ids=9 addresses=7 pair_type=xyk",
    ):
        if needle not in text:
            fail(f"checklist missing required handoff text: {needle}")

    if not re.search(r"tx-sets\.txt` has 16 non-empty `--set \.\.\.` lines", text):
        fail("checklist must state the expected 16 non-empty tx-set lines")

    if SCOPE_GUARDRAIL not in text:
        fail("checklist missing explicit v1 scope guardrail")

    for needle in LAUNCH_GATE_TEXT:
        if needle not in text:
            fail(f"checklist missing first-pool launch gate text: {needle}")

    print("OK: Juno v1 operator tx checklist matches deployment helpers")
    print(
        f"store_txs={len(STORE_KEYS)} instantiate_txs={len(ADDRESS_KEYS)} "
        f"manual_values={len(REQUIRED_MANUAL_ENV)} first_pool_gate=permissioned"
    )


if __name__ == "__main__":
    main()
