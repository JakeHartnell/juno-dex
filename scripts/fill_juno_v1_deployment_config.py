#!/usr/bin/env python3
"""Render a concrete Astroport-Juno v1 deployment config from the template.

The template intentionally carries placeholders and zero code IDs. This script is
for the handoff point after uni-7 uploads/instantiates: provide the real values
with repeated --set dotted.path=value flags, and it rewires dependent instantiate
fields so the frontend/deployment config stays internally consistent.
"""
from __future__ import annotations

import argparse
import copy
import json
import pathlib
import re
import sys
from typing import Any, NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "deployment" / "juno-v1-testnet.template.json"

INT_PATHS = {
    "code_ids.astroport-factory",
    "code_ids.astroport-incentives",
    "code_ids.astroport-native-coin-registry",
    "code_ids.astroport-oracle",
    "code_ids.astroport-pair",
    "code_ids.astroport-router",
    "code_ids.astroport-tokenfactory-tracker",
    "code_ids.astroport-whitelist",
    "code_ids.cw20-base",
}

ADDRESS_KEYS = (
    "astroport-factory",
    "astroport-incentives",
    "astroport-native-coin-registry",
    "astroport-oracle",
    "astroport-router",
    "astroport-tokenfactory-tracker",
    "astroport-whitelist",
)

PLACEHOLDER_RE = re.compile(r"replace|REPLACE", re.IGNORECASE)


def fail(msg: str) -> NoReturn:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def load_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError:
        fail(f"missing input: {path}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path}: {exc}")
    if not isinstance(data, dict):
        fail("top-level config must be a JSON object")
    return data


def parse_value(path: str, value: str) -> Any:
    if path in INT_PATHS:
        try:
            parsed = int(value)
        except ValueError:
            fail(f"{path} must be an integer code ID, got {value!r}")
        if parsed < 0:
            fail(f"{path} must be non-negative")
        return parsed
    if value in {"true", "false"}:
        return value == "true"
    if value == "null":
        return None
    return value


def set_path(cfg: dict[str, Any], assignment: str) -> None:
    if "=" not in assignment:
        fail(f"--set must be dotted.path=value, got {assignment!r}")
    path, raw_value = assignment.split("=", 1)
    parts = path.split(".")
    if not parts or any(part == "" for part in parts):
        fail(f"invalid dotted path: {path!r}")
    cursor: Any = cfg
    for part in parts[:-1]:
        if isinstance(cursor, dict) and part in cursor:
            cursor = cursor[part]
        elif isinstance(cursor, list) and part.isdigit() and int(part) < len(cursor):
            cursor = cursor[int(part)]
        else:
            fail(f"unknown config path: {path!r}")
    leaf = parts[-1]
    if isinstance(cursor, dict) and leaf in cursor:
        cursor[leaf] = parse_value(path, raw_value)
    elif isinstance(cursor, list) and leaf.isdigit() and int(leaf) < len(cursor):
        cursor[int(leaf)] = parse_value(path, raw_value)
    else:
        fail(f"unknown config path: {path!r}")


def require(cfg: dict[str, Any], *parts: str) -> Any:
    cursor: Any = cfg
    for part in parts:
        if not isinstance(cursor, dict) or part not in cursor:
            fail(f"missing expected config path: {'.'.join(parts)}")
        cursor = cursor[part]
    return cursor


def rewire(cfg: dict[str, Any]) -> None:
    """Propagate top-level accounts/code IDs/addresses into instantiate messages."""
    accounts = require(cfg, "accounts")
    code_ids = require(cfg, "code_ids")
    addresses = require(cfg, "addresses")
    network = require(cfg, "network")
    msgs = require(cfg, "instantiate_msgs")

    owner = accounts["owner"]
    guardian = accounts["guardian"]
    treasury = accounts["treasury"]
    tokenfactory_module = accounts["tokenfactory_module"]
    native_denom = network["native_asset_denom"]

    msgs["astroport-native-coin-registry"]["owner"] = owner
    msgs["astroport-whitelist"]["admins"] = [owner]

    tracker = msgs["astroport-tokenfactory-tracker"]
    tracker["tokenfactory_module_address"] = tokenfactory_module
    tracker["tracked_denom"] = f"factory/{addresses['astroport-factory']}/astroport/share"

    factory = msgs["astroport-factory"]
    factory["coin_registry_address"] = addresses["astroport-native-coin-registry"]
    factory["fee_address"] = treasury
    factory["generator_address"] = addresses["astroport-incentives"]
    factory["owner"] = owner
    factory["token_code_id"] = code_ids["cw20-base"]
    factory["tracker_config"]["code_id"] = code_ids["astroport-tokenfactory-tracker"]
    factory["tracker_config"]["token_factory_addr"] = tokenfactory_module
    factory["whitelist_code_id"] = code_ids["astroport-whitelist"]
    if len(factory["pair_configs"]) != 1:
        fail("factory pair_configs must contain exactly one XYK config before rendering")
    factory["pair_configs"][0]["code_id"] = code_ids["astroport-pair"]

    msgs["astroport-router"]["astroport_factory"] = addresses["astroport-factory"]

    incentives = msgs["astroport-incentives"]
    incentives["reward_token"] = {"native_token": {"denom": native_denom}}
    incentives["factory"] = addresses["astroport-factory"]
    incentives["guardian"] = guardian
    incentives["owner"] = owner

    oracle = msgs["astroport-oracle"]
    oracle["asset_infos"] = [{"native_token": {"denom": native_denom}}]
    oracle["factory_contract"] = addresses["astroport-factory"]

    pair_create = cfg["pair_create_msg_template"]
    pair_create["asset_infos"][0] = {"native_token": {"denom": native_denom}}


def walk_strings(value: Any, path: str = "") -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    if isinstance(value, str):
        found.append((path, value))
    elif isinstance(value, dict):
        for key, item in value.items():
            found.extend(walk_strings(item, f"{path}.{key}" if path else str(key)))
    elif isinstance(value, list):
        for idx, item in enumerate(value):
            found.extend(walk_strings(item, f"{path}[{idx}]"))
    return found


def assert_complete(cfg: dict[str, Any]) -> None:
    zero_ids = [key for key, value in cfg["code_ids"].items() if value == 0]
    if zero_ids:
        fail(f"code IDs still zero: {', '.join(sorted(zero_ids))}")
    placeholders = [(path, value) for path, value in walk_strings(cfg) if PLACEHOLDER_RE.search(value)]
    if placeholders:
        sample = ", ".join(f"{path}={value!r}" for path, value in placeholders[:5])
        fail(f"placeholder values remain: {sample}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=pathlib.Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--set", dest="sets", action="append", default=[], help="dotted.path=value override; repeatable")
    parser.add_argument("--require-complete", action="store_true", help="fail if any code ID is 0 or placeholder string remains")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = copy.deepcopy(load_json(args.input))
    for assignment in args.sets:
        set_path(cfg, assignment)
    rewire(cfg)
    if args.require_complete:
        assert_complete(cfg)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(cfg, indent=2, sort_keys=False) + "\n")
    print(f"OK: wrote rendered Juno v1 deployment config to {args.output}")
    print(f"sets={len(args.sets)} require_complete={args.require_complete}")


if __name__ == "__main__":
    main()
