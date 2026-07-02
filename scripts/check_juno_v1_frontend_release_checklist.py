#!/usr/bin/env python3
"""Validate the Astroport-Juno v1 frontend release checklist.

The checklist is the final bridge from a rendered uni-7 deployment config into a
UI repository. This guard keeps the copied file list, verification commands,
frontend address surface, and v1 scope limits aligned with the machine-checked
handoff artifacts.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
from typing import Any, NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
CHECKLIST = ROOT / "deployment" / "frontend-release-checklist.md"
TEMPLATE = ROOT / "deployment" / "juno-v1-testnet.template.json"
TYPES = ROOT / "deployment" / "juno-v1-frontend-config.d.ts"
EXAMPLE = ROOT / "deployment" / "juno-v1-frontend-config.example.ts"

RELEASE_FILES = (
    "juno-v1-testnet.json",
    "juno-v1-frontend-config.d.ts",
    "juno-v1-frontend-config.example.ts",
)
REQUIRED_COMMANDS = (
    "python3 scripts/check_juno_v1_deployment_template.py deployment/juno-v1-testnet.json",
    "python3 scripts/check_juno_v1_frontend_config.py deployment/juno-v1-testnet.json",
    "python3 scripts/generate_juno_v1_frontend_types.py --check",
    "python3 scripts/check_juno_v1_frontend_example.py",
    "python3 scripts/check_juno_v1_frontend_handoff_sync.py",
    "python3 scripts/build_juno_v1_frontend_release_bundle.py",
    "--config deployment/juno-v1-testnet.json",
    "--output deployment/juno-v1-frontend-release.zip",
)
SCOPE_GUARDRAILS = (
    "v1 is XYK-only and permissionless.",
    "No new DEX token is introduced; incentives use the configured native denom.",
    "Do not add stable pairs, PCL, LSTs, perps, or yield surfaces to this handoff.",
    "discover existing pools by querying the factory contract",
    "Do not hardcode pools or pair addresses in the UI repo.",
)


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}")
    sys.exit(1)


def read(path: pathlib.Path) -> str:
    try:
        return path.read_text()
    except FileNotFoundError:
        fail(f"missing {path.relative_to(ROOT)}")


def load_template() -> dict[str, Any]:
    try:
        data = json.loads(TEMPLATE.read_text())
    except FileNotFoundError:
        fail("missing deployment/juno-v1-testnet.template.json")
    except json.JSONDecodeError as exc:
        fail(f"invalid deployment template JSON: {exc}")
    if not isinstance(data, dict):
        fail("deployment template must be a JSON object")
    return data


def backticked_list(values: list[str]) -> str:
    return ", ".join(f"`{value}`" for value in values)


def main() -> None:
    text = read(CHECKLIST)
    template = load_template()

    for path in (TYPES, EXAMPLE):
        if not path.exists():
            fail(f"checklist references handoff file that is missing: {path.relative_to(ROOT)}")

    for section in (
        "## Release files to hand to the UI repo",
        "## Pre-copy verification",
        "## Frontend address surface",
        "## Scope guardrails",
    ):
        if text.count(section) != 1:
            fail(f"expected exactly one checklist section: {section}")

    for filename in RELEASE_FILES:
        if text.count(f"`{filename}`") < 1:
            fail(f"checklist missing release file `{filename}`")
    if "Do not copy `juno-v1-testnet.template.json` as the live config." not in text:
        fail("checklist must warn against publishing the placeholder template as live config")

    for command in REQUIRED_COMMANDS:
        if text.count(command) != 1:
            fail(f"checklist must contain verification command exactly once: {command}")
    if "python3 scripts/check_juno_v1_dry_run_txs.py" not in text:
        fail("checklist must mention the dry-run rehearsal for no-chain-output testing")
    if "MANIFEST.json` hashes" not in text:
        fail("checklist must describe the release bundle manifest hashes")

    frontend = template.get("frontend")
    if not isinstance(frontend, dict):
        fail("deployment template missing frontend object")
    required = frontend.get("required_addresses")
    optional = frontend.get("optional_addresses")
    if not isinstance(required, list) or not all(isinstance(v, str) for v in required):
        fail("deployment template frontend.required_addresses must be a string array")
    if not isinstance(optional, list) or not all(isinstance(v, str) for v in optional):
        fail("deployment template frontend.optional_addresses must be a string array")

    required_line = f"Required frontend addresses: {backticked_list(required)}."
    optional_line = f"Optional frontend addresses: {backticked_list(optional)}."
    if required_line not in text:
        fail(f"checklist missing synchronized required-address line: {required_line}")
    if optional_line not in text:
        fail(f"checklist missing synchronized optional-address line: {optional_line}")

    for guardrail in SCOPE_GUARDRAILS:
        if guardrail not in text:
            fail(f"checklist missing v1 guardrail: {guardrail}")
    if re.search(r"stable|PCL|LST|perps|yield", text, flags=re.IGNORECASE) and SCOPE_GUARDRAILS[2] not in text:
        fail("checklist has deferred-scope words without the explicit v1 guardrail")

    print("OK: Juno v1 frontend release checklist matches the deployment handoff")
    print(
        f"release_files={len(RELEASE_FILES)} commands={len(REQUIRED_COMMANDS)} bundle_helper=true "
        f"required={len(required)} optional={len(optional)} pair_discovery=factory"
    )


if __name__ == "__main__":
    main()
