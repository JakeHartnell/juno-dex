#!/usr/bin/env python3
"""Validate CI wiring for Astroport-Juno v1 launch guards.

This is intentionally dependency-free: it scans the GitHub Actions workflow text
for the no-network guard commands and their ordering relative to expensive Rust
/ optimizer work. It catches accidental workflow edits that would leave the Juno
v1 scope/template/artifact guards documented but not actually enforced in CI.
"""
from __future__ import annotations

import pathlib
import sys
from typing import NoReturn

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"
TESTS = WORKFLOWS / "tests_and_checks.yml"
ARTIFACTS = WORKFLOWS / "check_artifacts.yml"
RELEASE_ARTIFACTS = WORKFLOWS / "release_artifacts.yml"


class WorkflowText:
    def __init__(self, path: pathlib.Path) -> None:
        self.path = path
        try:
            self.lines = path.read_text().splitlines()
        except FileNotFoundError:
            fail(f"missing workflow: {path.relative_to(ROOT)}")

    def first(self, needle: str) -> int:
        for idx, line in enumerate(self.lines, start=1):
            if needle in line:
                return idx
        fail(f"{self.path.relative_to(ROOT)} missing: {needle}")

    def all(self, needle: str) -> list[int]:
        hits = [idx for idx, line in enumerate(self.lines, start=1) if needle in line]
        if not hits:
            fail(f"{self.path.relative_to(ROOT)} missing: {needle}")
        return hits


def fail(msg: str) -> NoReturn:
    print(f"FAIL: {msg}")
    sys.exit(1)


def assert_before(name: str, left_line: int, right_line: int) -> None:
    if left_line >= right_line:
        fail(f"expected {name} before line {right_line}, got line {left_line}")


def main() -> None:
    tests = WorkflowText(TESTS)
    artifacts = WorkflowText(ARTIFACTS)
    release_artifacts = WorkflowText(RELEASE_ARTIFACTS)

    scope_line = tests.first("scripts/check_juno_v1_scope.py")
    schema_lines = tests.all("scripts/check_juno_v1_schemas.py")
    template_line = tests.first("scripts/check_juno_v1_deployment_template.py")
    tx_extractor_line = tests.first("scripts/check_juno_v1_tx_extractor.py")
    deployment_command_line = tests.first("scripts/check_juno_v1_deployment_command.py")
    first_pool_smoke_line = tests.first("scripts/check_juno_v1_first_pool_smoke_commands.py")
    first_pool_smoke_evidence_line = tests.first("scripts/check_juno_v1_first_pool_smoke_evidence.py")
    open_pair_config_tx_line = tests.first("scripts/check_juno_v1_open_pair_config_tx.py")
    secret_scan_line = tests.first("scripts/check_juno_v1_secret_scan.py")
    operator_checklist_line = tests.first("scripts/check_juno_v1_operator_checklist.py")
    dry_run_txs_line = tests.first("scripts/check_juno_v1_dry_run_txs.py")
    deployment_gitignore_line = tests.first("scripts/check_juno_v1_deployment_gitignore.py")
    factory_docs_line = tests.first("scripts/check_juno_v1_factory_docs.py")
    deployment_readme_line = tests.first("scripts/check_juno_v1_deployment_readme.py")
    frontend_config_line = tests.first("scripts/check_juno_v1_frontend_config.py")
    frontend_types_line = tests.first("scripts/generate_juno_v1_frontend_types.py --check")
    frontend_example_line = tests.first("scripts/check_juno_v1_frontend_example.py")
    frontend_handoff_sync_line = tests.first("scripts/check_juno_v1_frontend_handoff_sync.py")
    frontend_release_checklist_line = tests.first("scripts/check_juno_v1_frontend_release_checklist.py")
    frontend_release_bundle_line = tests.first("scripts/check_juno_v1_frontend_release_bundle.py")
    ci_wiring_line = tests.first("scripts/check_juno_v1_ci_wiring.py")
    rust_line = tests.first("dtolnay/rust-toolchain@stable")
    build_schemas_line = tests.first("scripts/build_schemas.sh")
    diff_index_line = tests.first("git diff-index --cached HEAD --exit-code")

    for label, line in (
        ("scope guard", scope_line),
        ("schema guard", schema_lines[0]),
        ("deployment template guard", template_line),
        ("tx extractor fixture guard", tx_extractor_line),
        ("deployment command guard", deployment_command_line),
        ("first-pool smoke command guard", first_pool_smoke_line),
        ("first-pool smoke evidence guard", first_pool_smoke_evidence_line),
        ("open-pair-config tx guard", open_pair_config_tx_line),
        ("secret scan guard", secret_scan_line),
        ("operator checklist guard", operator_checklist_line),
        ("dry-run tx rehearsal guard", dry_run_txs_line),
        ("deployment gitignore guard", deployment_gitignore_line),
        ("factory docs guard", factory_docs_line),
        ("deployment README guard", deployment_readme_line),
        ("frontend config guard", frontend_config_line),
        ("frontend TypeScript handoff guard", frontend_types_line),
        ("frontend TypeScript example guard", frontend_example_line),
        ("frontend handoff sync guard", frontend_handoff_sync_line),
        ("frontend release checklist guard", frontend_release_checklist_line),
        ("frontend release bundle guard", frontend_release_bundle_line),
        ("CI wiring guard", ci_wiring_line),
    ):
        assert_before(label, line, rust_line)

    if not (
        scope_line
        < schema_lines[0]
        < template_line
        < tx_extractor_line
        < deployment_command_line
        < first_pool_smoke_line
        < first_pool_smoke_evidence_line
        < open_pair_config_tx_line
        < secret_scan_line
        < operator_checklist_line
        < dry_run_txs_line
        < deployment_gitignore_line
        < factory_docs_line
        < deployment_readme_line
        < frontend_config_line
        < frontend_types_line
        < frontend_example_line
        < frontend_handoff_sync_line
        < frontend_release_checklist_line
        < frontend_release_bundle_line
        < ci_wiring_line
    ):
        fail("tests workflow must run launch guards in scope/schema/template/tx-extractor/deployment-command/first-pool-smoke/first-pool-smoke-evidence/open-pair-config-tx/secret-scan/operator-checklist/dry-run-txs/deployment-gitignore/factory-docs/deployment-readme/frontend-config/frontend-types/frontend-example/frontend-handoff-sync/frontend-release-checklist/frontend-release-bundle/ci-wiring order")

    if len(schema_lines) < 2:
        fail("tests workflow must run schema guard both before Rust work and after schema generation")
    if not (build_schemas_line < schema_lines[-1] < diff_index_line):
        fail(
            "post-generation schema guard must run after build_schemas.sh and before git diff-index"
        )

    build_artifacts_line = artifacts.first("name: Build Artifacts")
    size_line = artifacts.first("scripts/check_artifacts_size.sh")
    artifact_guard_line = artifacts.first("scripts/check_juno_v1_artifacts.py")
    upload_line = artifacts.first("actions/upload-artifact")
    download_line = artifacts.first("actions/download-artifact")
    cosmwasm_check_line = artifacts.all("cosmwasm-check $GITHUB_WORKSPACE/artifacts/*.wasm")[-1]

    if not (build_artifacts_line < size_line < artifact_guard_line < upload_line < download_line < cosmwasm_check_line):
        fail("artifact workflow must build, size-check, v1 artifact-check, upload per-run artifacts, download them, then cosmwasm-check")
    for idx, line in enumerate(artifacts.lines, start=1):
        if "path: artifacts" in line:
            before = "\n".join(artifacts.lines[max(0, idx - 5) : idx])
            if "actions/upload-artifact" not in before and "actions/download-artifact" not in before:
                fail("artifact workflow must only pass artifacts via upload/download-artifact")
    for idx, line in enumerate(release_artifacts.lines, start=1):
        if "path: artifacts" in line:
            before = "\n".join(release_artifacts.lines[max(0, idx - 5) : idx])
            if "actions/cache" in before:
                fail("release_artifacts.yml must not restore cached artifacts before packaging a release")

    print("OK: GitHub Actions wiring enforces Astroport-Juno v1 guards")
    print(
        "tests_guards=scope/schema/template/tx-extractor/deployment-command/first-pool-smoke/first-pool-smoke-evidence/open-pair-config-tx/secret-scan/operator-checklist pre_rust=true "
        "dry_run_txs=true deployment_gitignore=true factory_docs=true deployment_readme=true frontend_config=true frontend_types=true frontend_example=true frontend_handoff_sync=true frontend_release_checklist=true frontend_release_bundle=true schema_post_generation=true artifact_guard_after_size=true artifact_handoff=upload-download release_artifacts_no_cache=true"
    )


if __name__ == "__main__":
    main()
