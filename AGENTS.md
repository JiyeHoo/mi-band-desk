# mi-band-desk

## Start and handoff

- Read `docs/handoff.md` first, then `docs/development-guide.md`. Use `docs/README.md` for the documentation map and `docs/lessons-learned.md` for failure history.
- Update handoff and append validation when device feedback or installation changes. Current docs describe current code; historical details belong in the version table, incident notes or `docs/history/`.
- Track modified, built, installed and user-accepted separately. Never claim a browser/simulator screenshot, timer rate or API acknowledgement proves real-device behaviour.
- Latest confirmed installation is 0.9.2 / versionCode 21. The user accepted v18 visual quality; v20 adds a persisted auto-rotation setting, default on (eyes 60s, other desks 10s). The new setting and rotation feel are not yet user-accepted. Read docs/automatic-carousel.md and handoff for manual-input recovery limits.

## Device and deployment boundaries

- Target Xiaomi Smart Band 9 NFC / M2346B1 / user OS 3.1.32, physical 192x490. This is a Vela JS quick app, not a web page, Android APK or firmware modification.
- Use documented Vela components/APIs and verify support for Band 9 when changing capabilities.
- The band is bound to another Android phone. Never manipulate any ADB-connected physical phone for this project; emulator commands must explicitly target the dedicated named emulator.
- Deploy through local AstroBox. Before each install verify the unique actual Band 9 NFC target/model/firmware and queue state. Submit once; a CLI timeout requires queue and fresh device app-version checks, not immediate resubmission.
- No flashing, factory reset, deletion of original pairing, or NFC/payment changes. Keep passwords, AuthKeys and signing private keys out of logs, responses and Git. Preserve the local signing identity for updates.
- `sign/`, `.device/`, `.artifacts/`, build outputs and node_modules are ignored. Do not assume ignored screenshots are available to the next developer. Do not stage unrelated Playground files.

## Current implementation invariants

- Current source and latest confirmed device installation are 0.9.2 / versionCode 21. The user accepted v18 visual quality; this does not establish the Mac ACK or future changes. Device UI is Chinese, large and low density. Eyes and all four hands are white; black hand details and colored page/accent elements are allowed. Each of the 26 expressions has its own short gesture followed by a pause, without constant aimless sway.
- Use the full capsule as requested; do not restore a blanket central safe rectangle. Shape content and endcap controls to actual curves. Visible controls and physical hit regions derive from `src/common/layout.js`; keep asset-generator geometry synchronized.
- No native parent transforms. Use physical coordinates and pre-rotated images. Eyelids use integer nonzero geometry and opacity=0 when open. Do not restore complex native keyframes/dynamic rotations that froze PRE 4.0; this is not proof of a firmware root cause.
- Eye images remain 128x128. Gaze rows are [percent,x,y,tilt]; tilt changes opposing eye heights, never native rotation. Effects use fixed sizes (scale=1); followGaze attaches cheek/tear accents to their eye. White hands are 76px and appear after eyes move left to clear the endcap.
- Active motion uses a 60 updates/s budget, not measured device FPS. nextMotionDelay rests between changing curve segments, with at most a 1000ms recheck. Automatic emotion changes wait two complete scene cycles (currently 8-12.8s) unless interaction/lifecycle interrupts; do not restore a fixed 8s cutoff or a permanent 60Hz resting loop.
- Root scroll disables x/y/bounces. Only the native nested swipers paginate: inner physical vertical for four desks (eyes/clock/calendar/Codex); outer physical horizontal for settings/home. Do not add an overlay that blocks them or duplicate JS swipe navigation/position timers.
- Automatic page rotation uses the existing foreground second ticker and native swipeTo; no JS page-position timer. Settings/background suspend it, manual input takes precedence, and native callbacks confirm selection.
- Native indices own selection; pause eye updates during touch. Click suppression and missing-event recovery must expire. Test fresh taps, slow/short drags, cancellation, interrupted/rapid swipes and hide/show.
- Current UI has no flip control. Validate the actual default orientation natively; retain logical forward/reverse coordinate tests. Reintroducing flip requires native checks in both orientations.
- Settings use one immutable full-screen background plus separate fixed 40x112 physical images for keep-state and carousel-state. Never swap/rebuild whole cards for setting-state changes. Use documented image object-fit values; fill is not listed.
- `onBackPress` returns true and opens settings. Only explicit two-step exit calls `app.terminate()`. Keep-screen-on is released on hide/exit/expiry and stale callbacks cannot re-enable it.
- Holiday data is verified only for mainland China in 2026. Festival names win over rest/work footer labels; consecutive official rest days share a strip. Never infer unverified yearly compensatory days.
- Four Twemoji hand graphics are CC BY 4.0; retain attribution/license and original SVGs. Public Vela APIs do not expose a global heart-rate/SpO2 monitor switch; no sensor subscription does not mean the hardware/system monitor is off.
- Band 9 launcher is `common/launcher-band9.png`, 192x156 with a 96px mark and visible name. Run `npm run icons` after renaming; do not replace with a generic 192x192 tile without device launcher validation.
- Pro tier labels follow the verified official desktop billing mapping: `pro` is Pro 20×, `prolite` is Pro 5×. Do not collapse both to Pro or infer multipliers from quota percentages; see `docs/subscription-tiers.md`.
- The Codex card accepts only schema v1 `codex.rate-limits` snapshots. Keep session/revision ordering, 10-minute expiry, explicit disconnected/stale copy, storage cache, ACK and refresh_request. The whole Codex page uses double tap (420ms / 44px) without an overlay or a small refresh button. Keep the pure black layout without decorative backgrounds, borders or cards; retain the user-requested green quota ring; show the actual remaining allowance, not invented currency balances.
- The macOS bridge is a native menu-bar app, binds only `127.0.0.1:17373`, and forwards only quota/usage summary fields. The AstroBox plugin, Mac app, RPK installation and real ACK are separate states. Do not log snapshot bodies, device addresses or account credentials; Android remains future separate work.

## Verification

- `npm test` checks logic and lifecycle; `npm run build` compiles and validates the real RPK. Follow the scoped matrix in `docs/release-checklist.md`; documentation-only work needs consistency/link checks, not deployment.
- Mac 0.8.2 / plugin 0.7.6 have a verified real matching ACK. Decode AstroBox 2.1 `payloadText` events, validate package/schema, and whitelist return fields; never forward transport addresses. Match ACK by current session/revision and retain it across identical resends. Run `macos/BandDeskBridge/scripts/test-native.sh` for native ACK/layout regressions.
- Build the current Mac deliverable with `macos/BandDeskBridge/scripts/package-app.sh`; build the AstroBox plugin with its `scripts/build.py`. SwiftPM is currently broken at the local Command Line Tools `PackageDescription` link layer, so do not report the retained Swift reference tests as passed.
- PRE 4.0 is not OS 3.1.32. The emulator brightness module is unavailable. If native success-state rendering needs a probe, keep it emulator-only, then restore real API/system date and rebuild before installation.
- Check held-pointer frames and post-cancel final pixels, not only JS state. For settings test genuine state changes, not repeated identical error images.
- Legacy CARD_REST/incoming-layer rules are historical lessons for the retired JS transition controller; do not reintroduce that controller merely to preserve old tests. Browser preview transition helpers are not current device navigation.
