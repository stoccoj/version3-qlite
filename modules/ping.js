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

	startPingMonitor(qlite_number, ip) {
		let self = this
		let isOnline = false

		let stopped = false

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

		const ping = () => {
			if (!ip) {
				setStatus(false)
				return
			}

			self.pingHost(ip).then(setStatus, () => setStatus(false))
		}

		// Initial ping
		ping()
		const interval = setInterval(ping, 10000)

		// Return a function to get the current status and a stop function
		return {
			getStatus: () => isOnline,
			stop: () => {
				stopped = true
				clearInterval(interval)
			},
		}
	},
}
