# Version 3 Q-Lite — Bitfocus Companion Module

A [Bitfocus Companion](https://bitfocus.io/companion) module for controlling **Version 3 Q-Lite** cue lights over OSC
(UDP).
Drive the **Ready**, **Go**, **Hold**, and **Clear** states of up to 16 Q-Lites from a Stream Deck (or any Companion
surface), with optional two-way confirmation from the remote station.

## Features

- Control up to **16 Q-Lites** from a single module instance.
- **Ready / Go / Hold / Clear** actions for an individual Q-Lite or **All** Q-Lites at once.
  - _Go All_ only fires Q-Lites that are currently in a Ready state.
  - _Hold_ toggles on and off; turning Hold off restores the previous Ready/Go LED state (blinking or solid).
  - _Hold All_ holds every Q-Lite if any of them is not held; otherwise it releases them all.
- **Optional Ready / Go confirmation** — the Q-Lite LED blinks until the remote station acknowledges, then goes solid.
- **Auto Clear** — automatically clear a Go state after 5–60 seconds.
- **Configurable button blinking** — a single blink rate, or custom on/off times.
- **Online monitoring** — each Q-Lite is pinged every 10 seconds; the Ready button turns red when a Q-Lite is offline.
  The connection status shows a **Warning** naming any offline Q-Lites, and **Connection Failure** when all of them are
  offline. Q-Lites that haven't answered their first ping yet aren't counted.
- **Presets** for every configured Q-Lite plus "All" buttons.

## Requirements

- Bitfocus Companion with support for the Node 22 module runtime.
- One or more Q-Lites reachable on the network from the Companion host.
- The `ping` command available on the Companion host (used for online monitoring).
- For development: Node.js 22 or newer.

## Configuration

### Per Q-Lite

These fields are repeated for each Q-Lite, based on **Number of Q-Lites** (1–16).

| Field                    | Description                                                                  | Default |
| ------------------------ | ---------------------------------------------------------------------------- | ------- |
| Q-Lite #N Hostname or IP | Address of the Q-Lite. Required for Q-Lite #1.                               | —       |
| Port                     | OSC port the Q-Lite listens on.                                              | `8000`  |
| Confirm Ready            | Blink the Ready LED until the remote station confirms, then switch to solid. | Off     |
| Confirm Go               | Blink the Go LED until the remote station confirms, then switch to solid.    | Off     |

### General

| Field                       | Description                                                                          | Default |
| --------------------------- | ------------------------------------------------------------------------------------ | ------- |
| Listen for Feedback         | Listen for OSC messages from the Q-Lites (required for confirmations / remote Hold). | Off     |
| Feedback Port               | Local UDP port to listen on. Required when Listen for Feedback is enabled.           | —       |
| Auto Clear                  | Automatically clear a Go state after a period of time.                               | Off     |
| Auto Clear Time (seconds)   | Delay before an automatic clear (5–60).                                              | `15`    |
| Specify Custom On/Off Times | Use separate on/off times instead of a single blink rate.                            | Off     |
| Blink Rate (ms)             | Button blink rate (100–10000). Shown when custom on/off times are disabled.          | `1000`  |
| On Time (ms)                | Time the button is lit while blinking (100–10000).                                   | `1000`  |
| Off Time (ms)               | Time the button is dark while blinking (100–10000).                                  | `500`   |

## Actions

Every action takes a **Q-Lite #** option, which can be a specific Q-Lite or **All**.

| Action  | Name                          | Behavior                                                                                                                                                    |
| ------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready` | Set the Q-Lite state to Ready | Sets Ready. Blinks the LED if _Confirm Ready_ is enabled, otherwise solid.                                                                                  |
| `go`    | Set the Q-Lite state to Go    | Sets Go. Blinks the LED if _Confirm Go_ is enabled, otherwise solid. With **All**, only Q-Lites in Ready are fired. Starts the Auto Clear timer if enabled. |
| `clear` | Set the Q-Lite state to Off   | Clears the Q-Lite and turns Hold off.                                                                                                                       |
| `hold`  | Set the Q-Lite state to Hold  | Toggles Hold. When released, the previous Ready/Go LED state is restored. With **All**, holds every Q-Lite if any is not held, otherwise releases all.      |

## Feedbacks

| Feedback | Style  | Behavior                                                                                                     |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `ready`  | Yellow | Solid when Ready is confirmed; blinks while awaiting confirmation. Turns **red** when the Q-Lite is offline. |
| `go`     | Green  | Solid when Go is confirmed; blinks while awaiting confirmation.                                              |
| `hold`   | Red    | Solid when Hold is set from Companion; blinks when Hold was triggered from the remote station.               |

Ready and Go feedbacks are suppressed while Hold is on (whether set from Companion or requested by the remote station).
Feedbacks work whatever the connection is named.

## Presets

**Q-Lite #N Buttons** (one category per configured Q-Lite)

- Ready, Go, Clear, Hold — each wired to its matching action and feedback (Clear has no feedback).

**Q-Lite General Buttons**

- Ready All, Go All Ready, Clear All, Hold All.

## Variables

Reference variables as `$(<instance-label>:<variable>)`, e.g. `$(qlite:qlite1_status)`.

### Per Q-Lite (`N` = 1–16)

| Variable                       | Description                                                       |
| ------------------------------ | ----------------------------------------------------------------- |
| `qliteN_online`                | `true` / `false`, from the ping monitor.                          |
| `qliteN_status`                | `off`, `ready`, `ready-confirmed`, `go`, or `go-confirmed`.       |
| `qliteN_hold`                  | `on`, `off`, or `blink` (Hold triggered from the remote station). |
| `qliteN_latest_sent_timestamp` | Timestamp of the last OSC message sent.                           |
| `qliteN_latest_sent_raw`       | Last OSC message sent (path and arguments).                       |
| `qliteN_latest_sent_path`      | Last OSC path sent.                                               |
| `qliteN_latest_sent_args`      | Last OSC arguments sent.                                          |

### General

| Variable                       | Description                                         |
| ------------------------------ | --------------------------------------------------- |
| `latest_received_timestamp`    | Timestamp of the last OSC message received.         |
| `latest_received_raw`          | Last OSC message received (path and arguments).     |
| `latest_received_path`         | Last OSC path received.                             |
| `latest_received_client`       | Client address of the last message.                 |
| `latest_received_port`         | Client port of the last message.                    |
| `latest_received_args`         | Last OSC arguments received.                        |
| `latest_received_qlite_number` | Q-Lite number of the last message received.         |
| `rate`                         | Blink rate (when custom on/off times are disabled). |
| `onTime` / `offTime`           | Blink on/off times (when custom times are enabled). |

## OSC Protocol Reference

### Module → Q-Lite

Each message is sent with a single integer argument: the Q-Lite number.

| Path               | Meaning                                     |
| ------------------ | ------------------------------------------- |
| `/led/ready/blink` | Ready, awaiting confirmation                |
| `/led/ready/solid` | Ready (confirmed or no confirmation needed) |
| `/led/go/blink`    | Go, awaiting confirmation                   |
| `/led/go/solid`    | Go (confirmed or no confirmation needed)    |
| `/led/hold/blink`  | Hold set from Companion                     |
| `/led/hold/solid`  | Hold acknowledged after a remote request    |
| `/led/hold/off`    | Hold released                               |
| `/led/clear`       | Clear all LEDs                              |
| `/online`          | Sent once when the module starts            |

### Q-Lite → Module

Requires **Listen for Feedback**. The first integer argument identifies the Q-Lite; if absent, the sender's address is
matched against the configured hosts.

| Path                      | Effect                                                                     |
| ------------------------- | -------------------------------------------------------------------------- |
| `/button/ready-confirmed` | If status is `ready`, sets `ready-confirmed` and sends `/led/ready/solid`. |
| `/button/go-confirmed`    | If status is `go`, sets `go-confirmed` and sends `/led/go/solid`.          |
| `/button/hold`            | If Hold is off, sets Hold to `blink` and sends `/led/hold/solid`.          |

## Changelog

### 1.1.0

- **Removed TCP support.** The module is UDP-only. The _Protocol_ setting has been removed.
- Connections no longer need to be named `qlite` for feedbacks to work.
- Fixed duplicate Q-Lite entries in dropdowns and variables (and repeated "All" messages) after saving the config.
- Fixed ping monitors piling up after each config save, and ping/listener/timers continuing after the connection is
  disabled.
- Fixed incoming feedback being matched to the wrong Q-Lite.
- Releasing Hold now restores the correct LED state (`go` → blinking Go, `go-confirmed` → solid Go).
- _Hold All_ now holds or releases all Q-Lites together instead of toggling each one.
- Auto Clear: a new Go restarts the timer, so an earlier timer can no longer clear it early.
- Every configured Q-Lite's hostname is now resolved; unresolvable or empty Q-Lites are skipped and reported.
- _Listen for Feedback_ without a _Feedback Port_ now reports a configuration error.
- `latest_received_qlite_number`, `rate`, `onTime`, and `offTime` variables are now populated.
- Removed the legacy Generic OSC connection IDs from the manifest.
- The connection status now reflects ping results: Warning when some Q-Lites are offline (listed by number),
  Connection Failure when all are offline, OK once they recover.
- Added automated tests (`npm test`, using Node's built-in test runner).

### 1.0.1

- Initial release.

## Development

```sh
npm install        # install dependencies
npm run format     # format with prettier
npm test           # run the automated tests (node:test, no extra dependencies)
npm run package    # build a distributable .tgz with companion-module-build
```

To test locally, point Companion's **Developer modules path** at the parent folder of this repository and enable the
module in Companion.

## License

MIT © 2025 Version 3, LLC — see [LICENSE](LICENSE). OSC functionality is based on the Generic OSC Companion module.

Maintainer: James Stocco, III. Report issues at <https://github.com/stoccoj/version3-qlite/issues>.
