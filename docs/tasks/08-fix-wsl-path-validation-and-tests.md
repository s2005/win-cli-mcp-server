---
description: Fix failing WSL path validation & shell-specific timeout tests
---

# Context

After recent refactors, `npm test` reports 6 failures across four suites:

* **`serverImplementation.test.ts` – “uses shell-specific timeout”**
  * Expected promise to reject with a timeout, but validation rejected the command **before** execution because the default working directory is a Windows path that the WSL validator refuses.
* **`integration/endToEnd.test.ts`** & several cases in **`wsl.test.ts`**
  * All fail with either
    * `wsl process error: spawn node ENOENT`, or
    * `Working directory validation failed: WSL working directory must be an absolute path (starting with /)`.
  * Root cause is the same: our WSL path logic does not gracefully handle Windows-style paths (e.g. `D:\foo`) that are supplied via `workingDir` or inherited from `process.cwd()`.

## Root Causes

1. **`normalizePathForShell`** treats every WSL shell as *pure* Unix and only flips back-slashes to slashes. It never converts a Windows drive path to the expected `/mnt/<drive>/…` form.
2. **`validateWslPath`** requires `dir.startsWith('/')`. When given a drive path it throws immediately.
3. When `restrictWorkingDirectory` is `true` and no `workingDir` is provided, `_executeTool` falls back to `process.cwd()` (Windows form on CI/Windows hosts) which then fails WSL validation.
4. Because validation aborts early the mocked `child_process.spawn` never runs, so the “timeout” behaviour the test expects is never observed.

## High-Level Fix

Provide a **robust Windows⇄WSL path bridge** used by both normalisation and validation layers so that drive-letter paths are transparently accepted for WSL shells.

## Implementation Steps

1. **`src/utils/pathValidation.ts`** – enhance `normalizePathForShell`:

   ```ts
   case 'unix':
     if (context.isWslShell && /^[A-Z]:\\/.test(inputPath)) {
       const mount = context.shellConfig.wslConfig?.mountPoint ?? '/mnt/';
       return convertWindowsToWslPath(inputPath, mount);
     }
     return inputPath.replace(/\\/g, '/');
   ```

2. **`validateWslPath`** (same file)
   * Accept drive paths:

     ```ts
     if (!dir.startsWith('/')) {
       dir = convertWindowsToWslPath(dir, context.shellConfig.wslConfig?.mountPoint);
     }
     ```

   * Continue with existing absolute/sub-directory checks.
3. **`CLIServer._executeTool`** – when computing `workingDir` for `wsl` shell:
   * If chosen `workingDir` is drive-style, convert to WSL before passing into further validation/spawn.
4. **Unit Tests** – add focused tests under `tests/pathConversion.test.ts` verifying:
   * Drive path → `/mnt/<drive>` conversion.
   * `validateWslPath` accepts both styles when allowed.
5. **Regression**
   * Re-run full suite: `npm test` should now pass.
   * Verify that no Windows shells are affected.
6. **Docs / Changelog**
   * Update `CHANGELOG.md` – *Fixed: Unified WSL path handling for Windows drive inputs*.

## Estimated Effort

| Task | Time |
|------|------|
| Code changes (items 1–3) | 1.5 h |
| New/updated tests | 0.5 h |
| Docs & cleanup | 0.25 h |
| **Total** | **≈2.25 h** |

## Risk & Mitigation

* **Risk:** accidental regression for paths already accepted (pure Linux style).
  * *Mitigation:* keep existing checks, add tests for both path styles.
* **Risk:** Mount-point assumptions (`/mnt/`) not matching custom configs.
  * *Mitigation:* always honour `wslConfig.mountPoint` if provided.

## Acceptance Criteria

* All Jest suites pass (`0 failed`).
* New conversion tests pass on Windows, Linux and CI.
* Documentation is updated.
