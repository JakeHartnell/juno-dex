#!/usr/bin/env python3
"""Self-test the Juno v1 first-pool smoke evidence validator."""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
from typing import Any, NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts" / "validate_juno_v1_first_pool_smoke_evidence.py"
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
PAIR = "juno1pair0000000000000000000000000000000000"


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


def write_json(path: pathlib.Path, data: Any) -> None:
    path.write_text(json.dumps(data, sort_keys=True))


def write_fixture_set(directory: pathlib.Path, *, prefix: str = "first-pool-smoke") -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for suffix, txhash in (
        ("create-pair", "CREATEPAIR123"),
        ("provide-liquidity", "PROVIDE12345"),
        ("tiny-swap", "TINYSWAP123"),
        ("router-tiny-swap", "ROUTERSWAP1"),
    ):
        write_json(directory / f"{prefix}-{suffix}.json", {"height": "12345", "txhash": txhash, "code": 0, "raw_log": "[]"})
    write_json(directory / f"{prefix}-pair-lookup.json", {"data": {"contract_addr": PAIR}})
    pool = {
        "data": {
            "assets": [
                {"info": {"native_token": {"denom": "ujunox"}}, "amount": "1000000"},
                {
                    "info": {
                        "native_token": {
                            "denom": "ibc/0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF"
                        }
                    },
                    "amount": "1000000",
                },
            ],
            "total_share": "1000000",
        }
    }
    write_json(directory / f"{prefix}-pool-after-provide.json", pool)
    write_json(directory / f"{prefix}-pair-simulation.json", {"data": {"return_amount": "997", "spread_amount": "3"}})
    write_json(directory / f"{prefix}-router-simulation.json", {"data": {"return_amount": "996", "spread_amount": "4"}})
    pool_after_swaps = json.loads(json.dumps(pool))
    pool_after_swaps["data"]["assets"][0]["amount"] = "1000100"
    pool_after_swaps["data"]["assets"][1]["amount"] = "999900"
    write_json(directory / f"{prefix}-pool-after-swaps.json", pool_after_swaps)


def run_validator(directory: pathlib.Path, config: pathlib.Path, *extra: str, expect_ok: bool = True) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        [
            sys.executable,
            str(VALIDATOR),
            "--dir",
            str(directory),
            "--config",
            str(config),
            "--pair-address",
            PAIR,
            *extra,
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if expect_ok and proc.returncode != 0:
        fail(f"validator failed: stdout={proc.stdout!r} stderr={proc.stderr!r}")
    if not expect_ok and proc.returncode == 0:
        fail(f"validator unexpectedly succeeded: stdout={proc.stdout!r}")
    return proc


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="juno-v1-first-pool-evidence-") as raw_tmp:
        tmp = pathlib.Path(raw_tmp)
        config = tmp / "juno-v1-testnet.json"
        evidence = tmp / "tx" / "uni-7"
        render_config(config)
        write_fixture_set(evidence)

        ok = run_validator(evidence, config)
        for needle in (
            "OK: first-pool smoke evidence is complete and internally sane",
            "first_pool_smoke_evidence=true",
            "tx_files=4",
            "query_files=5",
            f"pair_address={PAIR}",
        ):
            if needle not in ok.stdout:
                fail(f"validator output missing {needle!r}: {ok.stdout!r}")

        failed_tx = tmp / "failed-tx"
        write_fixture_set(failed_tx)
        tx_path = failed_tx / "first-pool-smoke-tiny-swap.json"
        failed = json.loads(tx_path.read_text())
        failed["code"] = 7
        failed["raw_log"] = "insufficient funds"
        write_json(tx_path, failed)
        failed_proc = run_validator(failed_tx, config, expect_ok=False)
        if "code=7" not in failed_proc.stderr:
            fail(f"failed tx error was not explicit: {failed_proc.stderr!r}")

        zero_pool = tmp / "zero-pool"
        write_fixture_set(zero_pool)
        pool_path = zero_pool / "first-pool-smoke-pool-after-provide.json"
        pool = json.loads(pool_path.read_text())
        pool["data"]["assets"][0]["amount"] = "0"
        write_json(pool_path, pool)
        zero_proc = run_validator(zero_pool, config, expect_ok=False)
        if "amount must be positive" not in zero_proc.stderr:
            fail(f"zero-liquidity error was not explicit: {zero_proc.stderr!r}")

        bad_pair = tmp / "bad-pair"
        write_fixture_set(bad_pair)
        write_json(bad_pair / "first-pool-smoke-pair-lookup.json", {"data": {"contract_addr": "juno1differentpair00000000000000000000000000"}})
        pair_proc = run_validator(bad_pair, config, expect_ok=False)
        if "expected" not in pair_proc.stderr:
            fail(f"pair mismatch error was not explicit: {pair_proc.stderr!r}")

        open_config = json.loads(config.read_text())
        open_config["instantiate_msgs"]["astroport-factory"]["pair_configs"][0]["permissioned"] = False
        open_config_path = tmp / "open-config.json"
        write_json(open_config_path, open_config)
        open_proc = run_validator(evidence, open_config_path, expect_ok=False)
        if "permissioned=true" not in open_proc.stderr:
            fail(f"open factory gate error was not explicit: {open_proc.stderr!r}")

        duplicate_tx = tmp / "duplicate-tx"
        write_fixture_set(duplicate_tx)
        duplicate_path = duplicate_tx / "first-pool-smoke-router-tiny-swap.json"
        duplicate = json.loads(duplicate_path.read_text())
        duplicate["txhash"] = "TINYSWAP123"
        write_json(duplicate_path, duplicate)
        duplicate_proc = run_validator(duplicate_tx, config, expect_ok=False)
        if "distinct txhashes" not in duplicate_proc.stderr:
            fail(f"duplicate txhash error was not explicit: {duplicate_proc.stderr!r}")

        unchanged_pool = tmp / "unchanged-pool"
        write_fixture_set(unchanged_pool)
        after_provide = json.loads((unchanged_pool / "first-pool-smoke-pool-after-provide.json").read_text())
        write_json(unchanged_pool / "first-pool-smoke-pool-after-swaps.json", after_provide)
        unchanged_proc = run_validator(unchanged_pool, config, expect_ok=False)
        if "must differ" not in unchanged_proc.stderr:
            fail(f"unchanged post-swap pool error was not explicit: {unchanged_proc.stderr!r}")

    docs = README.read_text() + "\n" + CHECKLIST.read_text()
    for needle in (
        "scripts/validate_juno_v1_first_pool_smoke_evidence.py",
        "first-pool-smoke-pair-lookup.json",
        "first-pool-smoke-router-tiny-swap.json",
        "Do not run the open-XYK helper until these pass",
    ):
        if needle not in docs:
            fail(f"operator docs missing first-pool evidence validator text: {needle}")

    print("OK: Juno v1 first-pool smoke evidence validator accepts complete fixtures and rejects unsafe evidence")
    print("first_pool_smoke_evidence_validator=true tx_files=4 query_files=5 failure_cases=6 txhash_uniqueness=true post_swap_pool_delta=true")


if __name__ == "__main__":
    main()
