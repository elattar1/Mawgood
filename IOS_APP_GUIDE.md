# iOS app (Capacitor)

- Bundle ID: com.husayniya.services (same as Android, unchanged). Name: موجود.
- The app loads https://www.mawgood.store inside a native shell (see capacitor.config.ts).
- Unsigned simulator build: run the "iOS unsigned build check" workflow. It proves the project compiles. It is not installable on an iPhone.
- Device install, TestFlight and App Store need code signing (Apple Developer account) and are not set up yet.
- Push on iOS needs the Push Notifications capability and an APNs key (paid Apple account). Not configured.

## Status (preparation branch `ios-prep`)

Tested (simulator, unsigned Debug build, GitHub Actions macOS runner):
- The Xcode project builds and launches on an iOS simulator.
- XCUITest, read-only public navigation, no login, no orders: the notification permission alert appears and is dismissed; the web view loads the live site; the bottom bar "السلة" opens the empty cart screen ("السلة فارغة"); the restaurants category chip filters the store list.
- Vitest (jsdom, mocked): full suite plus a mocked-backend test of the iOS OAuth return handler and a cart provider test (local state only).

NOT tested / not verified:
- Google sign-in in the app (needs the branch web code deployed and the Supabase redirect allow-list entry below).
- Orders, add-to-cart on a real store, checkout, account deletion, store-owner/driver/admin flows.
- Location access and push notifications as working native features (a permission string and the push plugin are present, nothing more is verified; push needs APNs, which needs the paid Apple Developer Program).
- Any run on a physical device, TestFlight, or the App Store.

## How the app gets its web code

The web app is TanStack Start with server functions, so it needs a server. The iOS shell loads a hosted URL (`server.url` in `capacitor.config.ts`, default `https://www.mawgood.store`). The app therefore always runs whatever is deployed at that URL. To point a test build at another deployment, set `MAWGOOD_APP_URL` before `npx cap sync ios`.

A Vercel preview shares the production Supabase variables and is protected by Vercel Authentication, so do not use previews for login or order tests. A separate staging Supabase project plus a separate deployment is the safe way to test real login and orders.

Note: `supabase/config.toml` lists a stale project id. The live project ref is the one in `.env` (`VITE_SUPABASE_URL`).

## Google sign-in on iOS

Google blocks OAuth inside embedded web views, so the iOS build opens Google sign-in in the system browser sheet and returns through the URL scheme `com.husayniya.services://auth-callback`. Required before it can work:
- Add `com.husayniya.services://auth-callback` to the Supabase Auth redirect URLs (currently only the two mawgood.store web URLs are listed).
- Deploy the branch web code.

## Apple review notes (check the current guidelines before submitting)

- Guideline 4.8: an app that uses a third-party login such as Google to set up the primary account must also offer an equivalent login service (name and email only, private email option, no ad tracking without consent), unless an exception applies. Mawgood offers Google plus phone/email, so review the text for applicability. Sign in with Apple is the usual equivalent.
- Guideline 4.2 / web-only apps: Apple lists websites packaged in an app as a rejection risk. Native value helps; no outcome is guaranteed.
- Guideline 5.1.1(v): apps that allow account creation must offer in-app account deletion. A deletion flow exists in the web app; it is not tested end to end.

## Apple Developer membership

- Free Apple Account (Personal Team): run on your own device from Xcode on a Mac; installs expire and limits apply.
- Apple Developer Program (paid, per Apple's program page): required for TestFlight, ad-hoc/registered-device distribution, push (APNs), Sign in with Apple, and App Store submission.
