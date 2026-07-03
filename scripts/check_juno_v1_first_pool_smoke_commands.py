#!/usr/bin/env python3
"""Self-test the Juno v1 first-pool smoke command builder."""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts" / "build_juno_v1_first_pool_smoke_commands.py"
FILL = ROOT / "scripts" / "fill_juno_v1_deployment_config.py"
README = ROOT / "deployment" / "README.md"
CHECKLIST = ROOT / "deployment" / "operator-tx-checklist.md"

SETS = [
    "accounts.owner=juno1owner0000000000000000000000000000000000",
    "accounts.guardian=juno1guardian00000000000000000000000000000000",
    "accounts.treasury=juno1treasury00000000000000000000000000000000",
    "accounts.tokenfactory_module=juno1factorymodule0000000000000000000000000000",
    "code_ids.astroport-factory=101",
    "code_ids.astroport-incentives=102",
    "code_ids.astroport-native-coin-registry=103",
    "code_ids.astroport-oracle=104",
    "code_ids.astroport-pair=105",
    "code_ids.astroport-router=106",
    "code_ids.astroport-tokenfactory-tracker=107",
    "code_ids.astroport-whitelist=108",
    "code_ids.cw20-base=109",
    "addresses.astroport-factory=juno1factory000000000000000000000000000000000",
    "addresses.astroport-incentives=juno1incentives00000000000000000000000000000",
    "addresses.astroport-native-coin-registry=juno1registry0000000000000000000000000000000",
    "addresses.astroport-oracle=juno1oracle0000000000000000000000000000000000",
    "addresses.astroport-router=juno1router0000000000000000000000000000000000",
    "addresses.astroport-tokenfactory-tracker=juno1tracker00000000000000000000000000000000",
    "addresses.astroport-whitelist=juno1whitelist000000000000000000000000000000",
    "pair_create_msg_template.asset_infos.1.native_token.denom=ibc/0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
]


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def render_config(path: pathlib.Path) -> None:
    args = [sys.executable, str(FILL), "--output", str(path), "--require-complete"]
    for item in SETS:
        args.extend(["--set", item])
    proc = subprocess.run(args, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        fail(f"fill script failed: stdout={proc.stdout!r} stderr={proc.stderr!r}")


def run_builder(config: pathlib.Path, *extra: str, expect_ok: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        [
            sys.executable,
            str(BUILDER),
            "--config",
            str(config),
            "--from",
            "juno-deployer",
            "--pair-address",
            "juno1pair0000000000000000000000000000000000",
            "--fees",
            "7500ujunox",
            *extra,
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if expect_ok and proc.returncode != 0:
        fail(f"first-pool smoke builder failed: stdout={proc.stdout!r} stderr={proc.stderr!r}")
    if not expect_ok and proc.returncode == 0:
        fail(f"first-pool smoke builder unexpectedly succeeded: stdout={proc.stdout!r}")
    return proc


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="juno-v1-first-pool-smoke-") as raw_tmp:
        tmp = pathlib.Path(raw_tmp)
        rendered = tmp / "juno-v1-testnet.json"
        render_config(rendered)

        proc = run_builder(rendered)
        for needle in (
            "Permissioned first-pool smoke commands",
            "Do not run the open-XYK helper until these pass",
            "junod tx wasm execute juno1factory000000000000000000000000000000000",
            '"create_pair":{"asset_infos":[{"native_token":{"denom":"ujunox"}},{"native_token":{"denom":"ibc/0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF"}}],"init_params":null,"pair_type":{"xyk":{}}}',
            "first-pool-smoke-create-pair.json",
            '"pair":{"asset_infos"',
            "--amount 1000000ujunox,1000000ibc/0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
            "first-pool-smoke-provide-liquidity.json",
            '"pool":{}',
            '"simulation":{"ask_asset_info":{"native_token":{"denom":"ibc/0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF"}},"offer_asset":{"amount":"1000","info":{"native_token":{"denom":"ujunox"}}}}',
            '"swap":{"ask_asset_info":{"native_token":{"denom":"ibc/0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF"}},"belief_price":null,"max_spread":"0.01","offer_asset":{"amount":"1000","info":{"native_token":{"denom":"ujunox"}}},"to":null}',
            "first-pool-smoke-tiny-swap.json",
            "first_pool_smoke_commands=ready chain_id=uni-7",
            "permissioned=true",
        ):
            if needle not in proc.stdout:
                fail(f"builder output missing {needle!r}: {proc.stdout!r}")

        bad_permissioned = json.loads(rendered.read_text())
        bad_permissioned["instantiate_msgs"]["astroport-factory"]["pair_configs"][0]["permissioned"] = False
        bad_permissioned_path = tmp / "bad-permissioned.json"
        bad_permissioned_path.write_text(json.dumps(bad_permissioned))
        bad_perm = run_builder(bad_permissioned_path, expect_ok=False)
        if "permissioned=true" not in bad_perm.stderr:
            fail(f"permissioned gate failure was not explicit: {bad_perm.stderr!r}")

        bad_stable = json.loads(rendered.read_text())
        bad_stable["pair_create_msg_template"]["pair_type"] = {"stable": {}}
        bad_stable_path = tmp / "bad-stable.json"
        bad_stable_path.write_text(json.dumps(bad_stable))
        bad_pair = run_builder(bad_stable_path, expect_ok=False)
        if "XYK-only" not in bad_pair.stderr:
            fail(f"non-XYK template failure was not explicit: {bad_pair.stderr!r}")

        bad_cw20 = json.loads(rendered.read_text())
        bad_cw20["pair_create_msg_template"]["asset_infos"][1] = {"token": {"contract_addr": "juno1cw200000000000000000000000000000000000"}}
        bad_cw20_path = tmp / "bad-cw20.json"
        bad_cw20_path.write_text(json.dumps(bad_cw20))
        bad_asset = run_builder(bad_cw20_path, expect_ok=False)
        if "native_token" not in bad_asset.stderr:
            fail(f"non-native asset failure was not explicit: {bad_asset.stderr!r}")

    docs = README.read_text() + "\n" + CHECKLIST.read_text()
    for needle in (
        "scripts/build_juno_v1_first_pool_smoke_commands.py",
        "first-pool-smoke-create-pair.json",
        "first-pool-smoke-provide-liquidity.json",
        "first-pool-smoke-tiny-swap.json",
        "Do not run the open-XYK helper until these pass",
    ):
        if needle not in docs:
            fail(f"operator docs missing first-pool smoke helper text: {needle}")

    print("OK: Juno v1 first-pool smoke command builder emits guarded create/seed/query/swap snippets")
    print("first_pool_smoke_commands=true create_pair=true seed_liquidity=true query_pool=true tiny_swap=true failure_cases=3")


if __name__ == "__main__":
    main()
