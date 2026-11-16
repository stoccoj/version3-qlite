// Lost-command re-send: a /led/* command that is not echoed back within ACK_TIMEOUT is sent again, up to ACK_RETRIES
// times. Only used once the Q-Lite has been seen echoing commands (so old setups and listen-off are unaffected).
const ACK_TIMEOUT = 300
const ACK_RETRIES = 3

const isLedPath = (path) => typeof path === 'string' && path.startsWith('/led/')

module.exports = {
	paths: {
		hold_blink: '/led/hold/blink',
		hold_solid: '/led/hold/solid',
		hold_off: '/led/hold/off',
		ready_blink: '/led/ready/blink',
		ready_solid: '/led/ready/solid',
		go_blink: '/led/go/blink',
		go_solid: '/led/go/solid',
		clear: '/led/clear',
	},

	sendOscMessage: async function (id, path, args = undefined) {
		let self = this // required to have reference to outer `this`

		if (args === undefined) {
			args = [
				{
					type: 'i',
					value: parseInt(id),
				},
			]
		}

		const host = self.resolvedHosts?.[id]
		const port = Number(self.config[`qlite${id}-targetPort`])

		if (!host || !port) {
			self.log('debug', `Not sending ${path} to Q-Lite #${id}: no resolved host/port`)
			return
		}

		const args_string = args.map((item) => item.value).join(' ')

		self.log('debug', `Sending OSC [${host}:${port}] ${path}`)
		self.log('debug', `Sending Args ${JSON.stringify(args)}`)

		//Update Variables
		self.setVariableValues({
			[`qlite${id}_latest_sent_raw`]: `${path} ${args_string}`,
			[`qlite${id}_latest_sent_path`]: path,
			[`qlite${id}_latest_sent_args`]: args.length > 0 ? args.map((arg) => arg.value) : undefined,
			[`qlite${id}_latest_sent_timestamp`]: Date.now(),
		})

		self.oscSend(host, port, path, args)

		if (isLedPath(path)) {
			const n = parseInt(id)
			// Companion now owns this Q-Lite's state: heartbeat replies to queries sent before this command are stale,
			// and the first reply is no longer adopted.
			self.lastCommandSeq[n] = self.querySeq[n] ?? 0
			self.stateSynced[n] = true
			self.trackAck(n, path, host, port, args)
		}
	},

	/**
	 * Keep the newest /led/* command for a Q-Lite until its echo arrives, re-sending it if the echo is late.
	 * Only one command is pending per Q-Lite: a new one replaces (and cancels the retries of) the previous one.
	 */
	trackAck(n, path, host, port, args) {
		let self = this
		self.clearPendingAck(n)
		if (!self.client?.isConnected() || !self.ackCapable[n]) return

		const pending = { path, host, port, args, retries: 0, timer: null }
		const onTimeout = () => {
			if (self.pendingAcks[n] !== pending) return
			if (pending.retries >= ACK_RETRIES) {
				delete self.pendingAcks[n]
				self.log('warn', `Q-Lite #${n} did not acknowledge ${path} after ${ACK_RETRIES} re-sends`)
				return
			}
			pending.retries++
			self.log('debug', `No acknowledgement for ${path} from Q-Lite #${n}, re-sending (${pending.retries})`)
			// Sent directly so a retry does not restart tracking or the stale-reply mark
			self.oscSend(host, port, path, args)
			pending.timer = setTimeout(onTimeout, ACK_TIMEOUT)
		}
		pending.timer = setTimeout(onTimeout, ACK_TIMEOUT)
		self.pendingAcks[n] = pending
	},

	/**
	 * Handle an echoed command from Q-Lite n: it proves the Q-Lite echoes, and clears the matching pending command.
	 */
	handleAck(n, path) {
		this.ackCapable[n] = true
		if (this.pendingAcks[n]?.path === path) this.clearPendingAck(n)
	},

	clearPendingAck(n) {
		const pending = this.pendingAcks[n]
		if (pending) {
			clearTimeout(pending.timer)
			delete this.pendingAcks[n]
		}
	},

	clearPendingAcks() {
		for (const n of Object.keys(this.pendingAcks ?? {})) this.clearPendingAck(n)
		this.pendingAcks = {}
	},
}
