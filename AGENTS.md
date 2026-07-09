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
### Android native build (Gradle) toolchain

The cloud VM has the Android native toolchain installed so `cd android && ./gradlew assembleRelease` works out of the box (produces a debug-signed `android/app/build/outputs/apk/release/app-release.apk`). Key facts:

- **JDK 17** is at `/usr/lib/jvm/java-17-openjdk-amd64` (JDK 21 is also present as the default `java`). Gradle 9 runs its daemon on the default JVM but compiles with the JDK 17 **toolchain**.
- **Android SDK** lives at `~/Android/Sdk` (`ANDROID_HOME`/`ANDROID_SDK_ROOT`). Installed packages: `platform-tools`, `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`, `cmake;3.22.1`. Note: the Gradle build also auto-pulls transitive SDK deps (e.g. `ndk;27.0.12077973` pinned by `@op-engineering/op-sqlite`, `build-tools;35.0.0`, `platforms;android-31`) — expected.
- **`ANDROID_HOME` is exported from `~/.bashrc`**, so login/interactive shells have it. Non-login shells do not — if `./gradlew` can't find the SDK, run: `export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"`.
- **`~/.gradle/gradle.properties`** pins the toolchain: `org.gradle.java.installations.paths=/usr/lib/jvm/java-17-openjdk-amd64` and `org.gradle.java.installations.auto-download=false` (Gradle will not download a JDK).
- The full release build compiles native C++ for 4 ABIs and takes ~20 min cold; subsequent builds are much faster thanks to the Gradle/CMake caches. These SDK/JDK installs live outside the repo and are not part of the update script; they persist in the VM snapshot.
- The Nix flake (`pnpm nix:shell`) remains the project's upstream-supported way to reproduce the full native toolchain on Linux.
