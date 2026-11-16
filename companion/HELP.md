## Version 3 Q-Lite

Control the **Ready**, **Go**, **Hold**, and **Clear** states of up to 16 Version 3 Q-Lite cue lights over OSC (UDP).
The remote station can optionally confirm Ready and Go, and can request a Hold.

### Setup

1. Set **Number of Q-Lites** (1–16).
2. For each Q-Lite, enter its **Hostname or IP** and **Port** (default `8000`).
3. If you want confirmations, remote Hold, or the heartbeat, enable **Listen for Feedback** and set the **Feedback
   Port**. The Feedback Port must match the Q-Lite's `CONTROLLER_BUTTON_PORT` (default `8002`), and the Q-Lite's
   `CONTROLLER_IP` must point at the Companion host.
4. Optional settings:
   - **Confirm Ready** / **Confirm Go** (per Q-Lite): the LED blinks until the remote station confirms, then goes solid.
   - **Auto Clear**: automatically clear a Go state after 5–60 seconds. If the Q-Lite is held when the timer runs out,
     Hold stays on and Go is not restored when Hold is released.
   - **Blink Rate**, or enable **Specify Custom On/Off Times** to set separate on and off times.

> **Note:** confirmations and remote Hold only work with **Listen for Feedback** enabled and a **Feedback Port** set.

### Online monitoring and state sync

With **Listen for Feedback** on, Companion sends each Q-Lite a heartbeat every 2 seconds. Q-Lites on firmware 1.1.0 or
newer answer it with their current LED state:

- A Q-Lite is online as soon as it answers, and offline after 6 seconds without an answer.
- While a Q-Lite is offline, the heartbeat slows to every 10 seconds. Its first answer brings it back online and the
  heartbeat returns to every 2 seconds.
- The first answer after Companion starts sets that Q-Lite's state in Companion.
- After that, if the Q-Lite shows something different from Companion (for example after it restarted, came back online,
  or missed a command), Companion sends its state again.
- LED commands that the Q-Lite doesn't echo back within 300 ms are re-sent, up to 3 times.

Q-Lites that don't answer the heartbeat (older firmware, or Listen for Feedback off) are pinged every 10 seconds
instead.

The connection status turns to **Warning** when one or more Q-Lites are offline (the message names them), and to
**Connection Failure** when all of them are offline.

### Actions

Each action can target a single Q-Lite or **All**.

- **Ready**: set the Q-Lite to Ready.
- **Go**: set the Q-Lite to Go. _Go All_ only fires Q-Lites that are currently in Ready.
- Ready and Go are ignored while a Q-Lite is held (including _Ready All_ / _Go All_ and confirmations from the remote
  station). Release Hold first.
- **Clear**: turn the Q-Lite off and release Hold.
- **Hold**: toggle Hold. Releasing Hold restores the previous Ready/Go state.
  _Hold All_ holds every Q-Lite if any is not held, otherwise releases them all.

### Feedbacks

- **Ready** (yellow): solid when Ready, blinks while awaiting confirmation, **red** when the Q-Lite is offline.
- **Go** (green): solid when Go, blinks while awaiting confirmation.
- **Hold** (red): solid when Hold was set from Companion, blinking when Hold was triggered from the remote station.

Ready and Go feedbacks are hidden while Hold is on (set from Companion or requested by the remote station).

### Presets

- **Q-Lite #N Buttons**: Ready, Go, Clear, and Hold for each configured Q-Lite.
- **Q-Lite General Buttons**: Ready All, Go All Ready, Clear All, Hold All.

### Variables

The examples below assume the connection is named `qlite`; replace it with your connection's name.

Per Q-Lite (`N` = 1–16):

- `$(qlite:qliteN_online)`: `true` / `false`
- `$(qlite:qliteN_last_seen)`: timestamp the Q-Lite was last heard from (heartbeat, feedback, or a ping reply)
- `$(qlite:qliteN_status)`: `off`, `ready`, `ready-confirmed`, `go`, or `go-confirmed`
- `$(qlite:qliteN_hold)`: `on`, `off`, or `blink` (Hold triggered from the remote station)
- `$(qlite:qliteN_latest_sent_timestamp)`, `$(qlite:qliteN_latest_sent_raw)`, `$(qlite:qliteN_latest_sent_path)`,
  `$(qlite:qliteN_latest_sent_args)`: the last OSC message sent to that Q-Lite

General:

- `$(qlite:latest_received_timestamp)`, `$(qlite:latest_received_raw)`, `$(qlite:latest_received_path)`,
  `$(qlite:latest_received_args)`: the last OSC message received
- `$(qlite:latest_received_client)`, `$(qlite:latest_received_port)`: sender of the last message
- `$(qlite:latest_received_qlite_number)`: Q-Lite number of the last message received
- `$(qlite:rate)`: blink rate (when custom on/off times are off)
- `$(qlite:onTime)`, `$(qlite:offTime)`: blink on/off times (when custom on/off times are on)

_Tip: args variables are arrays. Use the expression `$(qlite:latest_received_args)[0]` to fetch the first value,
`$(qlite:latest_received_args)[1]` for the second, and so on._

### OSC Reference

**Sent to the Q-Lite** (each with one integer argument, the Q-Lite number):

`/led/ready/blink`, `/led/ready/solid`, `/led/go/blink`, `/led/go/solid`, `/led/hold/blink`, `/led/hold/solid`,
`/led/hold/off`, `/led/clear`, and `/online` (sent once when the module starts). With Listen for Feedback on,
`/status/query <n> <seq>` is also sent every 2 seconds (every 10 seconds while the Q-Lite is offline).

**Received from the Q-Lite** (requires Listen for Feedback; first integer argument is the Q-Lite number):

- `/button/ready-confirmed`: confirms Ready
- `/button/go-confirmed`: confirms Go
- `/button/hold`: requests Hold from the remote station
- `/led/*` and `/online` echoed back (same path and arguments): acknowledges the command
- `/status <n> <seq> <ready> <go> <hold> <boot_id>`: heartbeat reply (firmware 1.1.0+). `ready`, `go`, and `hold` are
  each `off`, `solid`, `blink`, or `pulse`; `boot_id` changes when the Q-Lite restarts.

---

Report issues at <https://github.com/stoccoj/version3-qlite/issues>.
