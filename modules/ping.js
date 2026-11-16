const { execFile } = require('child_process')
const os = require('os')
const path = require('path')

const isWindows = os.platform() === 'win32'

// Companion's packaged runtime can launch with a minimal PATH that omits the
// directory containing the `ping` binary (e.g. /sbin on macOS), which results in
// "ping: command not found". Extend PATH so the binary can always be located.
const extraPaths = isWindows
	? [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')]
	: ['/sbin', '/usr/sbin', '/bin', '/usr/bin', '/usr/local/bin']

const PING_ENV = {
	...process.env,
	PATH: [process.env.PATH || '', ...extraPaths].join(path.delimiter),
}

const PING_INTERVAL = 10000
const HEARTBEAT_INTERVAL = 2000
const HEARTBEAT_TIMEOUT = 6000
const OFFLINE_QUERY_INTERVAL = 10000
// Counted in heartbeat ticks rather than timestamps, so timer jitter can't stretch the gap to 12 s
const OFFLINE_QUERY_EVERY = OFFLINE_QUERY_INTERVAL / HEARTBEAT_INTERVAL

module.exports = {
	/**
	 * Send a single echo request.
	 * @returns {Promise<boolean>} true if the host replied
	 */
	pingHost(ip) {
		let self = this
		// Use execFile (no shell) to avoid PATH/shell issues and command injection from the configured host value.
		const args = isWindows ? ['-n', '1', ip] : ['-c', '1', ip]

		return new Promise((resolve) => {
			execFile('ping', args, { env: PING_ENV, timeout: 5000, windowsHide: true }, (error) => {
				if (error && (error.code === 'ENOENT' || error.errno === 'ENOENT')) {
					self.log('error', `Unable to locate the 'ping' command on this system: ${error.message}`)
				}
				resolve(!error)
			})
		})
	},

	/**
	 * Monitor one Q-Lite. With Listen for Feedback on, a /status/query heartbeat is sent every 2 s. Once the Q-Lite has
	 * answered one (heartbeatCapable), it is online while replies keep coming and offline after 6 s of silence, and
	 * ICMP ping is skipped. While such a Q-Lite is offline the query slows to every 10 s; the first reply brings it back
	 * online and back to every 2 s. Otherwise (old firmware, listen off) it is pinged every 10 s as before.
	 */
	startPingMonitor(qlite_number, ip) {
		let self = this
		let isOnline = false

		let stopped = false
		let slowed = false // offline by heartbeat: querying every OFFLINE_QUERY_INTERVAL
		let ticksSinceQuery = 0

		const setStatus = (online) => {
			if (stopped) return // a ping that was in flight when the monitor was stopped
			const changed = online !== self.getVariableValue(`qlite${qlite_number}_online`)
			isOnline = online
			self.setVariableValues({ [`qlite${qlite_number}_online`]: online })
			if (changed) self.checkFeedbacks('ready')

			if (self.pingResults[qlite_number] !== online) {
				self.pingResults[qlite_number] = online
				self.updateOverallStatus()
			}
		}

		const listening = () => Boolean(self.client?.isConnected())
		const heartbeatActive = () => Boolean(self.heartbeatCapable[qlite_number]) && listening()

		const ping = () => {
			if (heartbeatActive()) return
			if (!ip) {
				setStatus(false)
				return
			}

			self.pingHost(ip).then(
				(online) => {
					if (stopped) return
					if (online) self.setLastSeen(qlite_number)
					setStatus(online)
				},
				() => setStatus(false),
			)
		}

		const heartbeat = () => {
			if (stopped || !listening()) return
			const silent = heartbeatActive() && Date.now() - (self.lastHeard[qlite_number] ?? 0) > HEARTBEAT_TIMEOUT
			if (silent) {
				setStatus(false)
				if (!slowed) {
					// Still query on the tick that detects it, then slow down
					slowed = true
					self.log(
						'debug',
						`No heartbeat from Q-Lite #${qlite_number} for ${HEARTBEAT_TIMEOUT / 1000} s; ` +
							`querying every ${OFFLINE_QUERY_INTERVAL / 1000} s until it answers`,
					)
				} else if (++ticksSinceQuery < OFFLINE_QUERY_EVERY) {
					return
				}
			} else {
				slowed = false
			}
			ticksSinceQuery = 0
			self.sendStatusQuery(qlite_number)
		}

		// Initial ping
		ping()
		const interval = setInterval(ping, PING_INTERVAL)
		const heartbeatInterval = setInterval(heartbeat, HEARTBEAT_INTERVAL)

		// Return a function to get the current status and a stop function
		return {
			qliteNumber: qlite_number,
			getStatus: () => isOnline,
			/** A message arrived from this Q-Lite: it is online now. */
			markHeard: () => {
				if (stopped) return
				self.lastHeard[qlite_number] = Date.now()
				self.setLastSeen(qlite_number)
				setStatus(true)
			},
			stop: () => {
				stopped = true
				clearInterval(interval)
				clearInterval(heartbeatInterval)
			},
		}
	},

	/** Send /status/query n seq. Sent directly, so it doesn't overwrite the latest_sent variables every 2 s. */
	sendStatusQuery(qlite_number) {
		const host = this.resolvedHosts?.[qlite_number]
		const port = Number(this.config[`qlite${qlite_number}-targetPort`])
		if (!host || !port) return
		const seq = (this.querySeq[qlite_number] ?? 0) + 1
		this.querySeq[qlite_number] = seq
		this.oscSend(host, port, '/status/query', [
			{ type: 'i', value: Number(qlite_number) },
			{ type: 'i', value: seq },
		])
	},

	/** Record that Q-Lite n was heard from, and mark it online if it is being monitored. */
	markQliteHeard(qlite_number) {
		const monitor = this.pingMonitors.find((m) => m.qliteNumber === Number(qlite_number))
		if (monitor) {
			monitor.markHeard()
		} else {
			this.lastHeard[qlite_number] = Date.now()
			this.setLastSeen(qlite_number)
		}
	},

	setLastSeen(qlite_number) {
		this.setVariableValues({ [`qlite${qlite_number}_last_seen`]: Date.now() })
	},
}
