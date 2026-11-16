# AGENTS.md

Guidance for coding agents working in this repository.

## Project

Bitfocus Companion module for Version 3 Q-Lite cue lights, controlled over OSC/UDP. CommonJS, Node ≥ 22,
`@companion-module/base` 1.x and `osc`. Current version: **1.2.0**. Supports up to 16 Q-Lites per connection.

## Layout

- `index.js`: the `QLiteInstance` class. Handles the config lifecycle, host resolution and the overall connection
  status (`setConfigStatus` / `updateOverallStatus`).
- `modules/`: the parts mixed into the instance:
  - `actions`, `feedbacks`, `variables`, `presets`, `styles`
  - `blink`: blink/LED timing
  - `ping`: `pingHost`, `startPingMonitor`
  - `osc`: `paths`, `sendOscMessage`
  - `configFields`, `upgrades`
- `osc-udp.js` + `osc-feedback.js`: the feedback listener and its parser (`onDataHandler`).
- `helpers.js`: `resolveHostname`, `isValidIPAddress`, `setupOSC`.
- `companion/`: `manifest.json`, `HELP.md`.
- `test/`: `harness.js` plus the `*.test.js` suites.

## Key behaviour to keep

- Outgoing messages go through Companion's `oscSend`. The first argument is always the Q-Lite number as an int.
- Status values are `off`, `ready`, `ready-confirmed`, `go` and `go-confirmed`. Hold is `on` / `off` / `blink`.
- Feedbacks read the connection's own variables and `checkFeedbacks()` is called explicitly after state changes.
- State survives config saves. Nothing keeps running after `destroy()` (ping monitors, feedback listener, timers).
- Connection status rules:
  - Warning when some Q-Lites are offline (listed by number); Connection Failure when all are offline.
  - Config errors take priority over ping results.
  - Q-Lites with no ping result yet are not counted.
  - The status is only updated when it changes.

## Required for every change

- Run `npm test`. All tests must pass and the process must exit on its own (no hanging handles).
- **Do not change, delete or skip the existing tests, or `test/harness.js`, to make a change pass.** If a test fails,
  fix the code. If a behaviour change genuinely requires a test to be updated, stop and ask the maintainer first.
- New behaviour gets new tests, added alongside the existing ones in `test/`. Use `node:test` (no new dependencies) and
  the `createInstance` / `makeConfig` / `oscPacket` helpers from `test/harness.js`.
- Run `npx prettier -c .` (or `npm run format` to fix), and run `npm run package` when the build could be affected.

## Docs and versioning

- User-facing changes update `README.md` (Features / Changelog) and `companion/HELP.md`.
- The version in `package.json` and `companion/manifest.json` must match.

## Commands

- `npm install`: install dependencies
- `npm test`: run the test suite
- `npm run format`: format with prettier
- `npm run package`: build `pkg.tgz` for Companion
