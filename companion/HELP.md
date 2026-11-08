## Version 3 Q-Lite

Control the **Ready**, **Go**, **Hold**, and **Clear** states of up to 16 Version 3 Q-Lite cue lights over OSC (UDP).
The remote station can optionally confirm Ready and Go, and can request a Hold.

### Setup

1. Set **Number of Q-Lites** (1–16).
2. For each Q-Lite, enter its **Hostname or IP** and **Port** (default `8000`).
3. If you want confirmations or remote Hold, enable **Listen for Feedback** and set the **Feedback Port**.
4. Optional settings:
   - **Confirm Ready** / **Confirm Go** (per Q-Lite): the LED blinks until the remote station confirms, then goes solid.
   - **Auto Clear**: automatically clear a Go state after 5–60 seconds.
   - **Blink Rate**, or enable **Specify Custom On/Off Times** to set separate on and off times.

> **Note:** confirmations and remote Hold only work with **Listen for Feedback** enabled and a **Feedback Port** set.

The connection status turns to **Warning** when one or more Q-Lites stop answering ping (the message names them), and
to **Connection Failure** when all of them are offline.

### Actions

Each action can target a single Q-Lite or **All**.

- **Ready**: set the Q-Lite to Ready.
- **Go**: set the Q-Lite to Go. _Go All_ only fires Q-Lites that are currently in Ready.
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
`/led/hold/off`, `/led/clear`, and `/online` (sent once when the module starts).

**Received from the Q-Lite** (requires Listen for Feedback; first integer argument is the Q-Lite number):

- `/button/ready-confirmed`: confirms Ready
- `/button/go-confirmed`: confirms Go
- `/button/hold`: requests Hold from the remote station

---

Report issues at <https://github.com/stoccoj/version3-qlite/issues>.
