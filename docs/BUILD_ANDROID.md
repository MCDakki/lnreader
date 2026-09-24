# Building the release APK locally

Two gotchas cost real time the first time through — read the notes, not just the commands.

## Prerequisites

- **JDK 17** (not 21). Gradle 9 tries to auto-download a matching JDK if it
  can't find one, and that downloader breaks on newer JDKs with an
  `IBM_SEMERU` error. Install Temurin 17 and point `JAVA_HOME` at it.
- **Android SDK + NDK**, either via Android Studio (easiest — it installs
  both) or the standalone `sdkmanager` cmdline-tools.
- **Node 20+** and `pnpm` (`packageManager` field in `package.json` pins the
  exact version).

## Steps

```bash
pnpm install                        # do NOT add --ignore-scripts
pnpm run generate:env:release
cd android
./gradlew assembleRelease
```

- `pnpm install` **must** run its postinstall scripts. `--ignore-scripts`
  skips `llama.rn`'s native-library download, so the AI scraper and offline
  translation silently have no native code to call at runtime — the app
  still builds and looks fine, it just crashes those two features.
- Output: `android/app/build/outputs/apk/release/app-release.apk`
- It's signed with the project's debug keystore (`android/app/debug.keystore`),
  so it installs directly — no separate signing step needed for sideloading.

## Verify before installing

```bash
unzip -l app/build/outputs/apk/release/app-release.apk | grep rnllama
```

You should see `lib/arm64-v8a/librnllama*.so` entries. If that's empty, the
native libraries didn't make it in — redo `pnpm install` without
`--ignore-scripts`.

## After installing

The AI scraper and translation queue need a GGUF model file on the device
at `{app storage}/Models/*.gguf` (or a path set in Settings). Nothing in
these features works without one.
