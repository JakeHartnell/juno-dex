#!/usr/bin/env python3
"""Validate saved Juno v1 first-pool smoke evidence JSON files.

This is an offline/local guard for the files emitted by
`build_juno_v1_first_pool_smoke_commands.py`. It does not query a chain and it
never broadcasts. Operators run it after saving the first-pool create/provide,
direct swap, router swap, and query/simulation JSON files, before running the
open-XYK helper that removes the permissioned factory gate.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Any, NoReturn

DEFAULT_DIR = pathlib.Path("deployment/tx/uni-7")
DEFAULT_PREFIX = "first-pool-smoke"
TX_SUFFIXES = (
    "create-pair",
    "provide-liquidity",
    "tiny-swap",
    "router-tiny-swap",
)
QUERY_SUFFIXES = (
    "pair-lookup",
    "pool-after-provide",
    "pair-simulation",
    "router-simulation",
    "pool-after-swaps",
)


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def load_json(path: pathlib.Path) -> Any:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        fail(f"missing first-pool smoke evidence file: {path}")
    except json.JSONDecodeError as err:
        fail(f"invalid JSON in {path}: {err}")


def object_at(data: Any, path: pathlib.Path) -> dict[str, Any]:
    if not isinstance(data, dict):
        fail(f"evidence file must be a JSON object: {path}")
    return data


def unwrap_data(data: dict[str, Any]) -> dict[str, Any]:
    inner = data.get("data")
    if isinstance(inner, dict):
        return inner
    return data


def tx_code(data: dict[str, Any]) -> int:
    raw = data.get("code", 0)
    if raw in (None, ""):
        return 0
    try:
        return int(raw)
    except (TypeError, ValueError):
        fail(f"tx code must be numeric when present, got {raw!r}")


def validate_tx(path: pathlib.Path) -> None:
    data = object_at(load_json(path), path)
    code = tx_code(data)
    if code != 0:
        raw_log = data.get("raw_log") or data.get("rawLog") or data.get("log")
        fail(f"tx evidence failed with code={code} in {path}: {raw_log!r}")
    txhash = data.get("txhash") or data.get("tx_hash") or data.get("transactionHash")
    if not isinstance(txhash, str) or len(txhash.strip()) < 8:
        fail(f"tx evidence missing txhash: {path}")


def extract_pair_address(data: dict[str, Any]) -> str:
    body = unwrap_data(data)
    for key in ("contract_addr", "contract_address", "pair_contract_addr"):
        value = body.get(key)
        if isinstance(value, str) and value.startswith("juno"):
            return value
    pair_info = body.get("pair_info")
    if isinstance(pair_info, dict):
        value = pair_info.get("contract_addr") or pair_info.get("contract_address")
        if isinstance(value, str) and value.startswith("juno"):
            return value
    fail("pair lookup evidence missing Juno pair contract address")


def amount_value(raw: Any, *, label: str) -> int:
    try:
        value = int(raw)
    except (TypeError, ValueError):
        fail(f"{label} amount must be an integer string, got {raw!r}")
    if value <= 0:
        fail(f"{label} amount must be positive, got {value}")
    return value


def validate_pool(path: pathlib.Path) -> None:
    body = unwrap_data(object_at(load_json(path), path))
    assets = body.get("assets")
    if not isinstance(assets, list) or len(assets) != 2:
        fail(f"pool evidence must include exactly two assets: {path}")
    denoms: list[str] = []
    for idx, asset in enumerate(assets):
        if not isinstance(asset, dict):
            fail(f"pool asset[{idx}] must be an object: {path}")
        amount_value(asset.get("amount"), label=f"pool asset[{idx}]")
        info = asset.get("info")
        if not isinstance(info, dict):
            fail(f"pool asset[{idx}] missing info: {path}")
        native = info.get("native_token")
        if not isinstance(native, dict) or not isinstance(native.get("denom"), str):
            fail(f"pool asset[{idx}] must be native_token evidence for v1: {path}")
        denoms.append(native["denom"])
    if denoms[0] == denoms[1]:
        fail(f"pool evidence denoms must be distinct: {path}")
    total_share = body.get("total_share")
    if total_share is not None:
        amount_value(total_share, label="pool total_share")


def validate_simulation(path: pathlib.Path, *, label: str) -> None:
    body = unwrap_data(object_at(load_json(path), path))
    if "return_amount" not in body:
        fail(f"{label} simulation evidence missing return_amount: {path}")
    amount_value(body.get("return_amount"), label=f"{label} return_amount")
    spread = body.get("spread_amount")
    if spread is not None:
        try:
            spread_value = int(spread)
        except (TypeError, ValueError):
            fail(f"{label} spread_amount must be an integer string when present: {path}")
        if spread_value < 0:
            fail(f"{label} spread_amount must not be negative: {path}")


def load_expected_pair(config_path: pathlib.Path | None) -> str | None:
    if config_path is None:
        return None
    config = object_at(load_json(config_path), config_path)
    pair_configs = config.get("instantiate_msgs", {}).get("astroport-factory", {}).get("pair_configs")
    if not isinstance(pair_configs, list) or len(pair_configs) != 1:
        fail("rendered config must contain exactly one factory pair config")
    pair_config = pair_configs[0]
    if not isinstance(pair_config, dict) or pair_config.get("pair_type") != {"xyk": {}} or pair_config.get("permissioned") is not True:
        fail("rendered config factory pair config must still be permissioned=true and XYK-only while validating first-pool smoke")
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=pathlib.Path, default=DEFAULT_DIR, help="directory containing first-pool smoke JSON evidence")
    parser.add_argument("--prefix", default=DEFAULT_PREFIX, help="evidence filename prefix")
    parser.add_argument("--config", type=pathlib.Path, default=None, help="optional rendered deployment config to confirm the factory gate is still permissioned XYK")
    parser.add_argument("--pair-address", default=None, help="optional expected pair address from the pair lookup")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    load_expected_pair(args.config)
    paths = {suffix: args.dir / f"{args.prefix}-{suffix}.json" for suffix in (*TX_SUFFIXES, *QUERY_SUFFIXES)}

    for suffix in TX_SUFFIXES:
        validate_tx(paths[suffix])

    pair_lookup = object_at(load_json(paths["pair-lookup"]), paths["pair-lookup"])
    pair_address = extract_pair_address(pair_lookup)
    if args.pair_address is not None and pair_address != args.pair_address:
        fail(f"pair lookup returned {pair_address}, expected {args.pair_address}")

    validate_pool(paths["pool-after-provide"])
    validate_simulation(paths["pair-simulation"], label="pair")
    validate_simulation(paths["router-simulation"], label="router")
    validate_pool(paths["pool-after-swaps"])

    print("OK: first-pool smoke evidence is complete and internally sane")
    print(
        "first_pool_smoke_evidence=true "
        f"dir={args.dir} tx_files={len(TX_SUFFIXES)} query_files={len(QUERY_SUFFIXES)} pair_address={pair_address}"
    )


if __name__ == "__main__":
    main()
