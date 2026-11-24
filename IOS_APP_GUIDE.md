# iOS app (Capacitor)

- Bundle ID: com.husayniya.services (same as Android, unchanged). Name: موجود.
- The app loads https://www.mawgood.store inside a native shell (see capacitor.config.ts).
- Unsigned simulator build: run the "iOS unsigned build check" workflow. It proves the project compiles. It is not installable on an iPhone.
- Device install, TestFlight and App Store need code signing (Apple Developer account) and are not set up yet.
- Push on iOS needs the Push Notifications capability and an APNs key (paid Apple account). Not configured.
