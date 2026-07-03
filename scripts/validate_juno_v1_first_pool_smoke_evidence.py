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


def positive_int_field(data: dict[str, Any], key: str, *, label: str) -> int:
    raw: Any = data.get(key)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        fail(f"{label} must be a positive integer, got {raw!r}")
    if value <= 0:
        fail(f"{label} must be positive, got {value}")
    return value


def validate_tx(path: pathlib.Path) -> tuple[str, int]:
    data = object_at(load_json(path), path)
    code = tx_code(data)
    if code != 0:
        raw_log = data.get("raw_log") or data.get("rawLog") or data.get("log")
        fail(f"tx evidence failed with code={code} in {path}: {raw_log!r}")
    txhash = data.get("txhash") or data.get("tx_hash") or data.get("transactionHash")
    if not isinstance(txhash, str) or len(txhash.strip()) < 8:
        fail(f"tx evidence missing txhash: {path}")
    height = positive_int_field(data, "height", label=f"tx height in {path}")
    return txhash.strip(), height


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


def validate_pool(path: pathlib.Path, *, expected_denoms: tuple[str, str] | None = None) -> tuple[tuple[str, int], tuple[str, int]]:
    body = unwrap_data(object_at(load_json(path), path))
    assets = body.get("assets")
    if not isinstance(assets, list) or len(assets) != 2:
        fail(f"pool evidence must include exactly two assets: {path}")
    assets_seen: list[tuple[str, int]] = []
    for idx, asset in enumerate(assets):
        if not isinstance(asset, dict):
            fail(f"pool asset[{idx}] must be an object: {path}")
        amount = amount_value(asset.get("amount"), label=f"pool asset[{idx}]")
        info = asset.get("info")
        if not isinstance(info, dict):
            fail(f"pool asset[{idx}] missing info: {path}")
        native = info.get("native_token")
        if not isinstance(native, dict) or not isinstance(native.get("denom"), str):
            fail(f"pool asset[{idx}] must be native_token evidence for v1: {path}")
        assets_seen.append((native["denom"], amount))
    denoms = [denom for denom, _amount in assets_seen]
    if denoms[0] == denoms[1]:
        fail(f"pool evidence denoms must be distinct: {path}")
    if expected_denoms is not None and sorted(denoms) != sorted(expected_denoms):
        fail(
            f"pool evidence denoms must match rendered first-pool template in {path}: "
            f"got {sorted(denoms)!r}, expected {sorted(expected_denoms)!r}"
        )
    total_share = body.get("total_share")
    if total_share is not None:
        amount_value(total_share, label="pool total_share")
    sorted_assets = sorted(assets_seen)
    return (sorted_assets[0], sorted_assets[1])


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


def native_denom(asset_info: Any, *, label: str) -> str:
    if not isinstance(asset_info, dict):
        fail(f"{label} must be an object")
    native = asset_info.get("native_token")
    if not isinstance(native, dict) or not isinstance(native.get("denom"), str):
        fail(f"{label} must be a native_token denom for Juno v1 first-pool smoke")
    return native["denom"]


def load_expected_denoms(config_path: pathlib.Path | None) -> tuple[str, str] | None:
    if config_path is None:
        return None
    config = object_at(load_json(config_path), config_path)
    pair_configs = config.get("instantiate_msgs", {}).get("astroport-factory", {}).get("pair_configs")
    if not isinstance(pair_configs, list) or len(pair_configs) != 1:
        fail("rendered config must contain exactly one factory pair config")
    pair_config = pair_configs[0]
    if not isinstance(pair_config, dict) or pair_config.get("pair_type") != {"xyk": {}} or pair_config.get("permissioned") is not True:
        fail("rendered config factory pair config must still be permissioned=true and XYK-only while validating first-pool smoke")
    pair_template = config.get("pair_create_msg_template")
    if not isinstance(pair_template, dict) or pair_template.get("pair_type") != {"xyk": {}}:
        fail("rendered config pair_create_msg_template must be XYK-only while validating first-pool smoke")
    asset_infos = pair_template.get("asset_infos")
    if not isinstance(asset_infos, list) or len(asset_infos) != 2:
        fail("rendered config pair_create_msg_template must contain exactly two first-pool assets")
    denom_a = native_denom(asset_infos[0], label="pair_create_msg_template.asset_infos[0]")
    denom_b = native_denom(asset_infos[1], label="pair_create_msg_template.asset_infos[1]")
    if denom_a == denom_b:
        fail("rendered config first-pool denoms must be distinct")
    return denom_a, denom_b


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=pathlib.Path, default=DEFAULT_DIR, help="directory containing first-pool smoke JSON evidence")
    parser.add_argument("--prefix", default=DEFAULT_PREFIX, help="evidence filename prefix")
    parser.add_argument("--config", type=pathlib.Path, default=None, help="optional rendered deployment config to confirm the factory gate is still permissioned XYK")
    parser.add_argument("--pair-address", default=None, help="optional expected pair address from the pair lookup")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    expected_denoms = load_expected_denoms(args.config)
    paths = {suffix: args.dir / f"{args.prefix}-{suffix}.json" for suffix in (*TX_SUFFIXES, *QUERY_SUFFIXES)}

    tx_results = [validate_tx(paths[suffix]) for suffix in TX_SUFFIXES]
    txhashes = [txhash for txhash, _height in tx_results]
    if len(set(txhashes)) != len(txhashes):
        fail("tx evidence files must contain four distinct txhashes")
    tx_heights = [height for _txhash, height in tx_results]
    if tx_heights != sorted(tx_heights):
        ordered_names = ", ".join(TX_SUFFIXES)
        fail(f"tx evidence heights must be nondecreasing in launch order ({ordered_names}), got {tx_heights}")

    pair_lookup = object_at(load_json(paths["pair-lookup"]), paths["pair-lookup"])
    pair_address = extract_pair_address(pair_lookup)
    if args.pair_address is not None and pair_address != args.pair_address:
        fail(f"pair lookup returned {pair_address}, expected {args.pair_address}")

    pool_after_provide = validate_pool(paths["pool-after-provide"], expected_denoms=expected_denoms)
    validate_simulation(paths["pair-simulation"], label="pair")
    validate_simulation(paths["router-simulation"], label="router")
    pool_after_swaps = validate_pool(paths["pool-after-swaps"], expected_denoms=expected_denoms)
    if pool_after_swaps == pool_after_provide:
        fail("pool-after-swaps evidence must differ from pool-after-provide evidence")

    print("OK: first-pool smoke evidence is complete and internally sane")
    print(
        "first_pool_smoke_evidence=true "
        f"dir={args.dir} tx_files={len(TX_SUFFIXES)} query_files={len(QUERY_SUFFIXES)} pair_address={pair_address}"
    )


if __name__ == "__main__":
    main()
