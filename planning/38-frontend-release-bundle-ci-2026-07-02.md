# Frontend release bundle CI guard

Date: 2026-07-02

## Slice

Wire the existing Astroport-Juno v1 frontend release bundle helper into the no-network CI guard lane so the final UI handoff zip is tested before Rust work starts.

## Why

The bundle helper is the safest handoff shape once real uni-7 values exist: it rejects placeholder config, reruns the deployment/frontend/type/example/sync guards, packages only the rendered config plus generated TypeScript artifacts, and records hashes in `MANIFEST.json`.

## Changes

- Added `scripts/check_juno_v1_frontend_release_bundle.py` to `.github/workflows/tests_and_checks.yml`.
- Extended `scripts/check_juno_v1_ci_wiring.py` so CI fails if the release bundle guard is removed or moved after Rust setup.
- Updated `deployment/frontend-release-checklist.md` to show the exact bundle command.
- Added `/deployment/juno-v1-frontend-release.zip` to `.gitignore` and the deployment gitignore guard so environment-specific bundle output is not committed.

## Verification

Run:

```sh
python3 scripts/check_juno_v1_frontend_release_bundle.py
python3 scripts/check_juno_v1_frontend_release_checklist.py
python3 scripts/check_juno_v1_deployment_gitignore.py
python3 scripts/check_juno_v1_ci_wiring.py
```
