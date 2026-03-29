# Clerk Expo Native E2E Testing with Maestro

## Overview

Add Maestro-based E2E tests for `@clerk/expo` native components (AuthView, UserButton) running on an Android emulator in CI. This introduces a new `expo-native` integration test template, Maestro test flows, and CI configuration within the existing Clerk JavaScript monorepo integration test infrastructure.

## Goals

- Test the native Clerk authentication UI (clerk-ios/clerk-android rendered via `@clerk/expo/native`) on a real simulator
- Validate sign-in flow end-to-end: launch app, fill credentials, authenticate, verify signed-in state, sign out
- Run in CI alongside existing Playwright-based integration tests
- Follow existing repo patterns (template + preset + turbo task + CI matrix entry)

## Non-Goals

- iOS simulator testing in CI (would require macOS runners, can be added later)
- Testing web-based Clerk components on native (already covered by expo-web template)
- Testing custom flow hooks (useSignIn/useSignUp) - those are JS-layer tests, not native UI

## Template: `integration/templates/expo-native/`

A minimal Expo app following the native components quickstart pattern. Single-screen architecture (no route groups) for simplicity.

### Files

**`package.json`**
- Expo ~53, React 19.2.0, React Native 0.82.1
- Dependencies: `@clerk/expo` (injected via pkglab), `expo-secure-store`, `expo-auth-session`, `expo-web-browser`, `expo-router`, `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`
- Scripts:
  - `setup`: `pnpm install`
  - `prebuild`: `expo prebuild --platform android`
  - `build-android`: `cd android && ./gradlew assembleRelease`

**`app.json`**
```json
{
  "expo": {
    "name": "expo-native-test",
    "slug": "expo-native-test",
    "version": "1.0.0",
    "scheme": "expo-native-test",
    "plugins": ["expo-secure-store", "@clerk/expo"]
  }
}
```

**`app/_layout.tsx`**
- ClerkProvider with `publishableKey` from `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `tokenCache` from `@clerk/expo/token-cache`
- Wraps `<Slot />`

**`app/index.tsx`**
- Uses `useAuth()` to check `isSignedIn` / `isLoaded`
- When signed out: renders `<AuthView mode="signInOrUp" />` from `@clerk/expo/native`
- When signed in: renders user info (name, email from `useUser()`), `<UserButton />` from `@clerk/expo/native`, and a sign out button
- Loading state shows `<ActivityIndicator />`

**`metro.config.js`**
- Same monorepo-aware Metro config as the existing `expo-web` template
- Resolves `@clerk/*` packages from monorepo source
- Prevents duplicate React/React Native/React DOM module loading

**`babel.config.js`**
- Standard `babel-preset-expo`

### Key Differences from `expo-web`

| Aspect | expo-web | expo-native |
|--------|----------|-------------|
| Components | `@clerk/expo/web` (SignIn, UserButton) | `@clerk/expo/native` (AuthView, UserButton) |
| Build target | Web (`expo export -p web`) | Android APK (`expo prebuild` + Gradle) |
| Test runner | Playwright (browser) | Maestro (simulator) |
| Dev server | Required (Metro serves web) | Not required (JS bundled into APK) |
| Plugins | None | `expo-secure-store`, `@clerk/expo` |
| Long-running app | Yes | No |

## Preset Configuration

### `integration/presets/expo.ts`

Add `expoNative` alongside existing `expoWeb`:

```typescript
const expoNative = applicationConfig()
  .setName('expo-native')
  .useTemplate(templates['expo-native'])
  .setEnvFormatter('public', key => `EXPO_PUBLIC_${key}`)
  .addScript('setup', 'pnpm install')
  .addDependency('@clerk/expo', PKGLAB);
```

### Environment

Reuses existing `envs.withEmailCodes` which provides:
- `CLERK_PUBLISHABLE_KEY` (formatted as `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` by the env formatter)
- `CLERK_SECRET_KEY`

The publishable key is baked into the APK at build time via the `EXPO_PUBLIC_` prefix.

### No Long-Running App Entry

Unlike other templates, `expo-native` does not need an entry in `longRunningApps.ts`. The app is built once as a standalone APK, installed on the emulator, and tested. There's no dev server to keep running.

## Maestro Test Flows

### Location: `integration/tests/expo-native/.maestro/`

**`config.yaml`**
```yaml
baselineBranch: main
```

**`sign-in-flow.yaml`**

The core test flow:

```yaml
appId: ${APP_ID}
name: Sign in with email and password, verify signed-in state
---
- launchApp:
    clearState: true

# AuthView renders native sign-in UI
# Target elements by visible text from the native SDK's accessibility tree
- extendedWaitUntil:
    visible: "Email address"
    timeout: 15000

- tapOn: "Email address"
- inputText: ${TEST_EMAIL}

- tapOn: "Password"
- inputText: ${TEST_PASSWORD}

- tapOn: "Continue"

# After sign-in, the app shows the signed-in screen
- extendedWaitUntil:
    visible: ${TEST_USER_NAME}
    timeout: 15000

# Verify signed-in state
- assertVisible: ${TEST_EMAIL}
```

Environment variables (`TEST_EMAIL`, `TEST_PASSWORD`, `TEST_USER_NAME`, `APP_ID`) are passed via Maestro's `--env` flag at runtime.

**Important**: The exact text selectors ("Email address", "Password", "Continue") depend on what the clerk-android native SDK renders. These need to be verified during implementation by running `maestro hierarchy` against the running app and adjusted accordingly.

### Test User Management

The Maestro tests need a pre-existing user in the Clerk instance. Two options:

**Option A (Recommended)**: Use a dedicated, persistent test user in the `withEmailCodes` Clerk instance. Store credentials as CI secrets alongside the existing `INTEGRATION_INSTANCE_KEYS`. This avoids needing BAPI calls before Maestro runs.

**Option B**: Add a setup script that creates a fake user via the Clerk Backend API before running Maestro, and cleans up after. This mirrors how Playwright tests work but adds complexity since Maestro flows can't make API calls.

Go with Option A. A persistent test user is simpler and the `withEmailCodes` instance is already a test environment.

## CI Integration

### Turbo Task

Add to `turbo.json`:

```json
"//#test:integration:expo-native": {
  "env": ["CLEANUP", "DEBUG", "E2E_*", "INTEGRATION_INSTANCE_KEYS"],
  "inputs": ["integration/**"],
  "outputLogs": "new-only"
}
```

### Package.json Script

Add to root `package.json` scripts:

```json
"test:integration:expo-native": "..."
```

This script needs to:
1. Set up the template app (clone template, inject dependencies via pkglab, write env vars)
2. Run `expo prebuild --platform android`
3. Run `./gradlew assembleRelease` to produce the APK
4. Output the APK path for the CI step to pick up

The actual Maestro execution happens in a separate CI step (inside `reactivecircus/android-emulator-runner`), not in the turbo task. This is because the emulator runner is a GitHub Actions action that needs to be a workflow step.

### CI Workflow Changes (`ci.yml`)

Add `expo-native` to the integration test matrix:

```yaml
test-name: [
  "generic",
  "express",
  # ... existing entries ...
  "expo-native",
]
```

The `expo-native` entry needs special handling compared to Playwright entries. Add conditional steps in the `integration-tests` job:

**Before the test execution step (for all matrix entries):**
```yaml
- name: Enable KVM
  if: matrix.test-name == 'expo-native'
  run: |
    echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
    sudo udevadm control --reload-rules
    sudo udevadm trigger --name-match=kvm

- name: Install Maestro
  if: matrix.test-name == 'expo-native'
  run: |
    curl -fsSL "https://get.maestro.mobile.dev" | bash
    echo "$HOME/.maestro/bin" >> $GITHUB_PATH
```

**Replace the integration test step with conditional logic:**

For non-expo-native entries, run the existing Playwright command:
```yaml
- name: Run integration tests (Playwright)
  if: matrix.test-name != 'expo-native'
  run: pnpm turbo test:integration:${{ matrix.test-name }} $TURBO_ARGS
```

For expo-native, build the APK via turbo, then run Maestro in the emulator:
```yaml
- name: Build expo-native APK
  if: matrix.test-name == 'expo-native'
  run: pnpm turbo test:integration:expo-native --filter=build $TURBO_ARGS

- name: Run Maestro E2E tests
  if: matrix.test-name == 'expo-native'
  uses: reactivecircus/android-emulator-runner@v2
  with:
    api-level: 31
    target: google_apis
    arch: x86_64
    ram-size: 2048M
    force-avd-creation: false
    emulator-boot-timeout: 900
    emulator-options: -no-window -gpu swiftshader_indirect -noaudio -no-boot-anim -camera-back none
    disable-animations: true
    script: |
      adb devices
      adb install <path-to-apk>
      ./integration/tests/expo-native/run_maestro.sh
```

### Retry Script: `integration/tests/expo-native/run_maestro.sh`

```bash
#!/bin/bash
set -e

APP_ID="${APP_ID:?APP_ID env var required}"
MAX_RETRIES=3
DELAYS=(0 20 60)

for i in $(seq 1 $MAX_RETRIES); do
  echo "=== Attempt $i of $MAX_RETRIES ==="

  if [ "${DELAYS[$i-1]}" -gt 0 ]; then
    echo "Waiting ${DELAYS[$i-1]}s before retry..."
    sleep "${DELAYS[$i-1]}"
  fi

  set +e
  maestro test integration/tests/expo-native/.maestro/ \
    --env=APP_ID="$APP_ID" \
    --env=TEST_EMAIL="$TEST_EMAIL" \
    --env=TEST_PASSWORD="$TEST_PASSWORD" \
    --env=TEST_USER_NAME="$TEST_USER_NAME" \
    --format=junit \
    --output "report_attempt_${i}.xml"
  EXIT_CODE=$?
  set -e

  adb shell screencap -p "/sdcard/screenshot_attempt_${i}.png"
  adb pull "/sdcard/screenshot_attempt_${i}.png" "screenshot_attempt_${i}.png" 2>/dev/null || true

  if [ $EXIT_CODE -eq 0 ]; then
    echo "=== Tests passed on attempt $i ==="
    exit 0
  fi

  echo "=== Attempt $i failed (exit code $EXIT_CODE) ==="
done

echo "=== All $MAX_RETRIES attempts failed ==="
exit 1
```

### Runner

```yaml
runs-on: blacksmith-8vcpu-ubuntu-2204
```

Assumes Blacksmith supports KVM. If not, this specific matrix entry falls back to `ubuntu-latest`:

```yaml
runs-on: ${{ matrix.test-name == 'expo-native' && 'ubuntu-latest' || 'blacksmith-8vcpu-ubuntu-2204' }}
```

### Artifacts

Upload Maestro results (JUnit reports, screenshots) alongside existing Playwright traces:

```yaml
- name: Upload Maestro artifacts
  if: (success() || failure()) && matrix.test-name == 'expo-native'
  uses: actions/upload-artifact@v4
  with:
    name: maestro-results
    retention-days: 1
    path: |
      report_attempt_*.xml
      screenshot_attempt_*.png
```

## File Summary

### New Files

| File | Purpose |
|------|---------|
| `integration/templates/expo-native/package.json` | Template package config |
| `integration/templates/expo-native/app.json` | Expo config with native plugins |
| `integration/templates/expo-native/app/_layout.tsx` | ClerkProvider root layout |
| `integration/templates/expo-native/app/index.tsx` | Main screen (AuthView + signed-in state) |
| `integration/templates/expo-native/metro.config.js` | Monorepo Metro config |
| `integration/templates/expo-native/babel.config.js` | Babel config |
| `integration/templates/expo-native/tsconfig.json` | TypeScript config |
| `integration/tests/expo-native/.maestro/config.yaml` | Maestro workspace config |
| `integration/tests/expo-native/.maestro/sign-in-flow.yaml` | Sign-in E2E test flow |
| `integration/tests/expo-native/run_maestro.sh` | Retry script for CI |

### Modified Files

| File | Change |
|------|--------|
| `integration/presets/expo.ts` | Add `expoNative` config |
| `integration/templates/index.ts` | Register `expo-native` template |
| `turbo.json` | Add `test:integration:expo-native` task |
| `package.json` | Add `test:integration:expo-native` script |
| `.github/workflows/ci.yml` | Add `expo-native` matrix entry + conditional emulator/Maestro steps |

## Open Questions (to resolve during implementation)

1. **Native SDK text selectors**: The exact text that clerk-android renders for "Email address", "Password", "Continue" needs to be verified via `maestro hierarchy`. The flow YAML will be adjusted accordingly.
2. **APK output path**: The exact path of the release APK after Gradle build needs to be determined during prebuild. Likely `android/app/build/outputs/apk/release/app-release.apk`.
3. **Test user credentials**: Need to create or identify a persistent test user in the `withEmailCodes` instance and store credentials as CI secrets.
4. **Blacksmith KVM support**: Needs verification. If unsupported, the runner for this matrix entry falls back to `ubuntu-latest`.
