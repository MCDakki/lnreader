# AGENTS.md

## Cursor Cloud specific instructions

LNReader is a **React Native / Expo mobile app** (Android-first, iOS secondary). There is **no backend server** in this repo — all state lives in an on-device SQLite database. "Running the app" in dev means running the **Metro** bundler and installing the app on an Android emulator/device; the cloud VM has no Android emulator/KVM, so the practical dev-readiness signals here are: lint, type-check, the Jest suite, and a full Metro bundle build.

Standard commands live in `package.json` scripts, `README.md`, `CONTRIBUTING.md`, and `TESTING.md` — refer to those rather than duplicating. Key ones:

- Lint: `pnpm run lint`
- Types: `pnpm run type-check`
- Tests: `pnpm test` (Jest, two projects: `db` via `better-sqlite3`, `rn` via `jest-expo`). Also `pnpm run test:db` / `pnpm run test:rn`.
- Metro dev server: `pnpm run dev:start` (serves on `http://localhost:8081`). Verify a bundle with `curl "http://localhost:8081/index.bundle?platform=android&dev=true"`.

### Non-obvious gotchas

- **Generated env is required.** Before type-check / Metro / tests, run `node scripts/generate-env-file.cjs --build-type Debug` (or `pnpm run generate:env:debug`). It writes `.env` and `src/generated/build-info.ts`, which is what the Jest `@env` alias and the app resolve. The update script already runs this on startup.
- **`db.test.ts` needs `/files/SQLite` to be writable.** `src/database/db.ts` opens op-sqlite at the cwd-relative path `../files/SQLite`. Because the repo is checked out at `/workspace` (filesystem root), `..` resolves to `/`, so the DB path is `/files/SQLite`. If `src/database/__tests__/db.test.ts` fails with `EACCES: permission denied, mkdir '../files/SQLite'`, create it once: `sudo mkdir -p /files/SQLite && sudo chown -R "$(id -u):$(id -g)" /files`. (The rest of the `db` project tests use in-memory `better-sqlite3` and are unaffected.)
- Metro prints harmless warnings on start (`metro.config` template notice, `watcher.unstable_workerThreads`); these are not errors.
- Full native builds (`pnpm run dev:android`, `pnpm run build:release:android`) require the Android SDK/NDK + JDK 17 and are not set up in the cloud VM. The Nix flake (`pnpm nix:shell`) is the project's supported way to get the full native toolchain on Linux.
