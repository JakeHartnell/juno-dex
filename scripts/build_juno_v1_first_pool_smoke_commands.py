#!/usr/bin/env python3
"""Build guarded first-pool create/seed/smoke command snippets for Juno v1.

This helper reads a rendered Astroport-Juno deployment config and emits
copy/paste-safe `junod` commands for the permissioned official first pool:
create the XYK pair from the template, query pair discovery, seed native-token
liquidity, run pool/simulation queries, and broadcast one tiny swap. It does not
broadcast anything itself.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import shlex
import sys
from typing import Any, NoReturn

DEFAULT_CONFIG = pathlib.Path("deployment/juno-v1-testnet.json")


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def load_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError:
        fail(f"missing rendered deployment config: {path}")
    except json.JSONDecodeError as err:
        fail(f"invalid JSON in {path}: {err}")
    if not isinstance(data, dict):
        fail(f"deployment config must be a JSON object: {path}")
    return data


def compact_json(data: Any) -> str:
    return json.dumps(data, separators=(",", ":"), sort_keys=True)


def shell(command: list[str], redirect: pathlib.Path | None = None) -> str:
    rendered = " ".join(shlex.quote(part) for part in command)
    if redirect is not None:
        rendered += " > " + shlex.quote(str(redirect))
    return rendered


def native_denom(asset_info: dict[str, Any], *, label: str) -> str:
    native = asset_info.get("native_token")
    if not isinstance(native, dict):
        fail(f"{label} must be a native_token asset; CW20 first-pool smoke helper is intentionally out of v1 scope")
    denom = native.get("denom")
    if not isinstance(denom, str) or not denom:
        fail(f"{label}.native_token.denom must be a non-empty string")
    return denom


def read_pair_template(config: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]], str, str]:
    template = config.get("pair_create_msg_template")
    if not isinstance(template, dict):
        fail("rendered config missing pair_create_msg_template")
    if template.get("pair_type") != {"xyk": {}}:
        fail("pair_create_msg_template must be XYK-only")
    if template.get("init_params") is not None:
        fail("pair_create_msg_template.init_params must stay null for simple XYK v1")
    asset_infos = template.get("asset_infos")
    if not isinstance(asset_infos, list) or len(asset_infos) != 2 or not all(isinstance(item, dict) for item in asset_infos):
        fail("pair_create_msg_template.asset_infos must contain exactly two native assets")
    denom_a = native_denom(asset_infos[0], label="pair_create_msg_template.asset_infos[0]")
    denom_b = native_denom(asset_infos[1], label="pair_create_msg_template.asset_infos[1]")
    if denom_a == denom_b:
        fail("first-pool asset denoms must be distinct")
    return template, asset_infos, denom_a, denom_b


def read_config(config: dict[str, Any]) -> tuple[str, str, str, str, str, dict[str, Any], list[dict[str, Any]]]:
    network = config.get("network")
    addresses = config.get("addresses")
    if not isinstance(network, dict):
        fail("rendered config missing network")
    if not isinstance(addresses, dict):
        fail("rendered config missing addresses")
    chain_id = network.get("chain_id")
    fee_denom = network.get("fee_denom")
    factory = addresses.get("astroport-factory")
    router = addresses.get("astroport-router")
    if not isinstance(chain_id, str) or not chain_id:
        fail("rendered config missing network.chain_id")
    if not isinstance(fee_denom, str) or not fee_denom:
        fail("rendered config missing network.fee_denom")
    if not isinstance(factory, str) or not factory.startswith("juno"):
        fail("rendered config missing addresses.astroport-factory")
    if not isinstance(router, str) or not router.startswith("juno"):
        fail("rendered config missing addresses.astroport-router")
    template, asset_infos, denom_a, denom_b = read_pair_template(config)

    initial_pair_configs = config.get("instantiate_msgs", {}).get("astroport-factory", {}).get("pair_configs")
    if not isinstance(initial_pair_configs, list) or len(initial_pair_configs) != 1:
        fail("factory instantiate config must contain exactly one XYK pair config")
    initial = initial_pair_configs[0]
    if not isinstance(initial, dict) or initial.get("permissioned") is not True or initial.get("pair_type") != {"xyk": {}}:
        fail("factory must remain permissioned=true and XYK-only during first-pool smoke")

    return chain_id, fee_denom, factory, router, denom_a, template, asset_infos


def positive_int(raw: str, *, label: str) -> int:
    try:
        value = int(raw)
    except ValueError:
        fail(f"{label} must be an integer")
    if value <= 0:
        fail(f"{label} must be positive")
    return value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=pathlib.Path, default=DEFAULT_CONFIG, help="rendered deployment config to read")
    parser.add_argument("--from", dest="from_account", required=True, help="owner/deployer key name or address for create, seed, and swap smoke txs")
    parser.add_argument("--pair-address", default="$PAIR_ADDR", help="pair address for post-create seed/smoke commands; leave as $PAIR_ADDR until the factory pair query returns it")
    parser.add_argument("--seed-amount-a", default="1000000", help="amount of the first native denom to seed")
    parser.add_argument("--seed-amount-b", default="1000000", help="amount of the second native denom to seed")
    parser.add_argument("--swap-amount", default="1000", help="tiny swap offer amount in the first native denom")
    parser.add_argument("--gas", default="auto")
    parser.add_argument("--gas-adjustment", default="1.3")
    parser.add_argument("--fees", default=None, help="optional explicit fee, for example 7500ujunox")
    parser.add_argument("--output-prefix", type=pathlib.Path, default=None, help="prefix for suggested tx JSON output files")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    seed_a = positive_int(args.seed_amount_a, label="--seed-amount-a")
    seed_b = positive_int(args.seed_amount_b, label="--seed-amount-b")
    swap_amount = positive_int(args.swap_amount, label="--swap-amount")
    config = load_json(args.config)
    chain_id, _fee_denom, factory, router, denom_a, create_msg, asset_infos = read_config(config)
    denom_b = native_denom(asset_infos[1], label="pair_create_msg_template.asset_infos[1]")
    pair_address = args.pair_address
    if not pair_address:
        fail("--pair-address must be non-empty")
    output_prefix = args.output_prefix or pathlib.Path(f"deployment/tx/{chain_id}/first-pool-smoke")

    create_pair_msg = {"create_pair": create_msg}
    pair_query_msg = {"pair": {"asset_infos": asset_infos}}
    pool_query_msg = {"pool": {}}
    provide_msg = {
        "provide_liquidity": {
            "assets": [
                {"info": asset_infos[0], "amount": str(seed_a)},
                {"info": asset_infos[1], "amount": str(seed_b)},
            ],
            "slippage_tolerance": "0.01",
            "auto_stake": False,
            "receiver": None,
            "min_lp_to_receive": None,
        }
    }
    simulation_msg = {
        "simulation": {
            "offer_asset": {"info": asset_infos[0], "amount": str(swap_amount)},
            "ask_asset_info": asset_infos[1],
        }
    }
    router_operations = [
        {
            "astro_swap": {
                "offer_asset_info": asset_infos[0],
                "ask_asset_info": asset_infos[1],
            }
        }
    ]
    router_simulation_msg = {"simulate_swap_operations": {"offer_amount": str(swap_amount), "operations": router_operations}}
    swap_msg = {
        "swap": {
            "offer_asset": {"info": asset_infos[0], "amount": str(swap_amount)},
            "ask_asset_info": asset_infos[1],
            "belief_price": None,
            "max_spread": "0.01",
            "to": None,
        }
    }
    router_swap_msg = {
        "execute_swap_operations": {
            "operations": router_operations,
            "minimum_receive": None,
            "to": None,
            "max_spread": "0.01",
        }
    }

    tx_common = ["--from", args.from_account, "--chain-id", chain_id, "--gas", args.gas, "--gas-adjustment", args.gas_adjustment, "--output", "json"]
    if args.fees:
        tx_common.extend(["--fees", args.fees])

    print("# Permissioned first-pool smoke commands. Do not run the open-XYK helper until these pass.")
    print("# 1. Create only the official first XYK pool from the rendered template.")
    print(shell(["junod", "tx", "wasm", "execute", factory, compact_json(create_pair_msg), *tx_common], output_prefix.with_name(output_prefix.name + "-create-pair.json")))
    print("\n# 2. Query factory pair discovery, save the response, and export PAIR_ADDR from contract_addr.")
    print(shell(["junod", "query", "wasm", "contract-state", "smart", factory, compact_json(pair_query_msg), "--chain-id", chain_id, "--output", "json"], output_prefix.with_name(output_prefix.name + "-pair-lookup.json")))
    print("\n# 3. Seed non-zero native liquidity into the official pair.")
    print(shell(["junod", "tx", "wasm", "execute", pair_address, compact_json(provide_msg), "--amount", f"{seed_a}{denom_a},{seed_b}{denom_b}", *tx_common], output_prefix.with_name(output_prefix.name + "-provide-liquidity.json")))
    print("\n# 4. Verify pool balances are non-zero and save the query evidence.")
    print(shell(["junod", "query", "wasm", "contract-state", "smart", pair_address, compact_json(pool_query_msg), "--chain-id", chain_id, "--output", "json"], output_prefix.with_name(output_prefix.name + "-pool-after-provide.json")))
    print("\n# 5. Simulate and then broadcast one tiny native swap directly through the pair.")
    print(shell(["junod", "query", "wasm", "contract-state", "smart", pair_address, compact_json(simulation_msg), "--chain-id", chain_id, "--output", "json"], output_prefix.with_name(output_prefix.name + "-pair-simulation.json")))
    print(shell(["junod", "tx", "wasm", "execute", pair_address, compact_json(swap_msg), "--amount", f"{swap_amount}{denom_a}", *tx_common], output_prefix.with_name(output_prefix.name + "-tiny-swap.json")))

    print("\n# 6. Simulate and broadcast the same single-hop native swap through the router.")
    print(shell(["junod", "query", "wasm", "contract-state", "smart", router, compact_json(router_simulation_msg), "--chain-id", chain_id, "--output", "json"], output_prefix.with_name(output_prefix.name + "-router-simulation.json")))
    print(shell(["junod", "tx", "wasm", "execute", router, compact_json(router_swap_msg), "--amount", f"{swap_amount}{denom_a}", *tx_common], output_prefix.with_name(output_prefix.name + "-router-tiny-swap.json")))

    print("\n# 7. Re-query the pool, save the final evidence, then run build_juno_v1_open_pair_config_tx.py only after every smoke file is reviewed.")
    print(shell(["junod", "query", "wasm", "contract-state", "smart", pair_address, compact_json(pool_query_msg), "--chain-id", chain_id, "--output", "json"], output_prefix.with_name(output_prefix.name + "-pool-after-swaps.json")))
    print(
        "first_pool_smoke_commands=ready "
        f"chain_id={chain_id} factory={factory} router={router} denoms={denom_a},{denom_b} pair_address={pair_address} permissioned=true"
    )


if __name__ == "__main__":
    main()
