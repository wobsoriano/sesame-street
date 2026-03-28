# Expo Router Auth + Maestro E2E Testing

## Overview

Add file-based routing to a fresh Expo app with a GitHub username sign-in flow and a protected profile page displaying fetched GitHub user data. Include Maestro E2E tests for local iOS simulator testing and a GitHub Actions workflow for CI on Android.

## Routing & File Structure

Using Expo Router (file-based routing):

```
app/
  _layout.tsx              # Root layout, wraps app in AuthProvider
  sign-in.tsx              # Public sign-in page
  (protected)/
    _layout.tsx            # Auth guard, redirects to /sign-in if not authenticated
    profile.tsx            # Protected profile page showing GitHub user data
```

## Auth Context

Simple in-memory React context. No persistence (AsyncStorage, SecureStore, etc.).

```typescript
type GitHubUser = {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  public_repos: number;
};

type AuthContextType = {
  user: GitHubUser | null;
  signIn: (username: string) => Promise<void>;
  signOut: () => void;
};
```

- `signIn(username)` fetches `https://api.github.com/users/{username}`, stores the result in state, then navigation happens in the calling component.
- `signOut()` clears the user state and navigates to sign-in.
- No token, no password. This is a test/demo app.

## Sign-In Page

- Single `TextInput` for GitHub username (`testID: "github_username_input"`)
- "Sign In" button (`testID: "sign_in_button"`)
- Loading state while fetching (disable button, show indicator)
- Error state if the fetch fails (e.g. user not found)
- On success: navigate to `/(protected)/profile`

## Profile Page

- Displays fetched GitHub user data:
  - Avatar image
  - Display name (or login as fallback)
  - Bio
  - Public repos count
- "Sign Out" button (`testID: "sign_out_button"`)
- All visible text elements get `testID` props for Maestro targeting:
  - `testID: "profile_name"` on the name text
  - `testID: "profile_bio"` on the bio text
  - `testID: "profile_repos"` on the repos count text

## Auth Guard

The `(protected)/_layout.tsx` layout:
- Reads `user` from auth context
- If `user` is null, redirects to `/sign-in` via `<Redirect href="/sign-in" />`
- Otherwise renders `<Slot />`

## Maestro Test Flow

```
.maestro/
  config.yaml              # baselineBranch: main
  sign-in-flow.yaml        # Main test flow
```

### config.yaml

```yaml
baselineBranch: main
```

### sign-in-flow.yaml

Uses "octocat" as the test GitHub username (GitHub's official test account, always available).

The app's bundle identifier will be derived from the Expo config (e.g. `com.wobsoriano.sesamestreet` or whatever `expo prebuild` generates from the slug). The `appId` in the flow YAML must match this.

Flow:
1. Launch the app (using `appId` from the generated native project)
2. Assert sign-in page is visible (look for the username input)
3. Tap `github_username_input`, type "octocat"
4. Tap `sign_in_button`
5. Wait for profile to load (assert visible with default retry)
6. Assert "The Octocat" text is visible (octocat's display name)
7. Assert public repos count is visible

## Local Testing Setup (iOS)

1. `npx expo prebuild --platform ios` to generate the native iOS project
2. Build and run on iOS simulator via `npx expo run:ios`
3. Ensure Maestro is installed (`curl -fsSL "https://get.maestro.mobile.dev" | bash`)
4. Maestro requires Java 17+
5. Run `maestro test .maestro/sign-in-flow.yaml`

## GitHub Actions Workflow (Android)

File: `.github/workflows/maestro-e2e.yml`

Runs on `macos-latest` for stable Android emulation.

### Steps

1. **Checkout** code
2. **Setup Java 17** via `actions/setup-java` (required by Gradle + Maestro)
3. **Setup Node.js** + `npm install`
4. **Expo prebuild** for Android: `npx expo prebuild --platform android`
5. **Build debug APK** via `./gradlew assembleDebug` in the `android/` directory
6. **Install Maestro** (pinned version, e.g. 1.30.4)
7. **Boot Android emulator** via `reactivecircus/android-emulator-runner@v2`
   - API level 31 (Android 12)
   - Emulator options: `-no-window -gpu swiftshader_indirect -noaudio -no-boot-anim`
   - Disable animations
8. **Install APK** on emulator
9. **Run Maestro flows** with 3 retry attempts and increasing delays (0s, 20s, 60s)
   - JUnit output format for CI reporting
10. **Upload artifacts**: test reports, screenshots

### Retry Script

Shell script (`run_android_e2e.sh`) with 3 attempts:
- Each attempt runs `maestro test .maestro/ --format=junit --output report.xml`
- Takes a screenshot after each attempt for debugging
- Exits 0 on first success, exits 1 after all retries exhausted

### Environment

- Runner: `macos-latest` (stable Android emulation, supports API 30+)
- Android API: 31
- Maestro version: pinned (1.30.4 or latest stable at time of implementation)
- Node.js: 20.x
- Java: 17 (temurin distribution)
