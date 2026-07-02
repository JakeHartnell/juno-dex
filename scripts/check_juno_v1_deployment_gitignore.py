#!/usr/bin/env python3
"""Validate gitignore safety rails for Astroport-Juno v1 deployment output.

Real uni-7 tx JSON and rendered deployment configs are operator/local artifacts.
This guard keeps those paths out of git so rehearsals and real deployment output
cannot be accidentally committed as source-of-truth contract changes.
"""
from __future__ import annotations

import pathlib
import subprocess
import sys
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
GITIGNORE = ROOT / ".gitignore"
GENERATOR = ROOT / "scripts" / "generate_juno_v1_dry_run_txs.py"
README = ROOT / "deployment" / "README.md"

REQUIRED_GITIGNORE_LINES = (
    "/deployment/tx/",
    "/deployment/juno-v1-testnet.json",
    "/deployment/juno-v1-mainnet.json",
    "/deployment/juno-v1-frontend-release.zip",
)

SHOULD_BE_IGNORED = (
    "deployment/tx/uni-7/store-astroport-factory.json",
    "deployment/tx/uni-7/instantiate-astroport-factory.json",
    "deployment/tx/uni-7/tx-sets.txt",
    "deployment/tx/uni-7-dry-run/store-astroport-factory.json",
    "deployment/juno-v1-testnet.json",
    "deployment/juno-v1-mainnet.json",
    "deployment/juno-v1-frontend-release.zip",
)

FORBIDDEN_TRACKED_PREFIXES = (
    "deployment/tx/",
)

FORBIDDEN_TRACKED_FILES = (
    "deployment/juno-v1-testnet.json",
    "deployment/juno-v1-mainnet.json",
    "deployment/juno-v1-frontend-release.zip",
)


def fail(message: str) -> NoReturn:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def run_git(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def require_ignored(path: str) -> None:
    proc = run_git(["check-ignore", "--no-index", path])
    if proc.returncode != 0:
        fail(f"expected git to ignore {path}; stderr={proc.stderr.strip()!r}")


def main() -> None:
    gitignore = GITIGNORE.read_text()
    for line in REQUIRED_GITIGNORE_LINES:
        if line not in gitignore.splitlines():
            fail(f".gitignore missing required deployment artifact ignore: {line}")

    for path in SHOULD_BE_IGNORED:
        require_ignored(path)

    tracked = run_git([
        "ls-files",
        "--",
        "deployment/tx",
        "deployment/juno-v1-testnet.json",
        "deployment/juno-v1-mainnet.json",
        "deployment/juno-v1-frontend-release.zip",
    ])
    if tracked.returncode != 0:
        fail(f"git ls-files failed: {tracked.stderr.strip()}")
    tracked_paths = [line.strip() for line in tracked.stdout.splitlines() if line.strip()]
    forbidden = [
        path
        for path in tracked_paths
        if path in FORBIDDEN_TRACKED_FILES or any(path.startswith(prefix) for prefix in FORBIDDEN_TRACKED_PREFIXES)
    ]
    if forbidden:
        fail("deployment local artifacts are tracked: " + ", ".join(forbidden))

    generator = GENERATOR.read_text()
    if 'default=pathlib.Path("deployment/tx/uni-7-dry-run")' not in generator:
        fail("dry-run tx generator default output must stay under ignored deployment/tx/")

    readme = README.read_text()
    for needle in (
        "ignored directory",
        "deployment/tx/uni-7-dry-run",
        "juno-v1-testnet.json` — suggested rendered output path; do not commit real values",
        "juno-v1-mainnet.json` — rendered mainnet output path; do not commit real values",
        "juno-v1-frontend-release.zip` — optional generated UI handoff bundle; do not commit it",
    ):
        if needle not in readme:
            fail(f"deployment README missing gitignore safety text: {needle}")

    print("OK: Juno v1 deployment tx/output paths stay gitignored")
    print(f"ignored_paths={len(SHOULD_BE_IGNORED)} tracked_artifacts=0 generator_default=deployment/tx/uni-7-dry-run")


if __name__ == "__main__":
    main()
