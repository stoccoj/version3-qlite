const { InstanceBase, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./modules/upgrades')
const configFields = require('./modules/configFields')
const osc = require('./modules/osc')
const blink = require('./modules/blink')
const actions = require('./modules/actions')
const feedbacks = require('./modules/feedbacks')
const variables = require('./modules/variables')
const presets = require('./modules/presets')
const ping = require('./modules/ping')
const { resolveHostname, isValidIPAddress, setupOSC } = require('./helpers.js')

class QLiteInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		this.INTERVAL = null
		this.boolValue = false // blink - this will get flipped every time the interval runs

		this.buttons = [{ id: '0', label: 'All' }]
		this.client = null // UDP feedback listener
		this.pingMonitors = [] // { stop } handles returned by startPingMonitor
		this.autoClearTimers = {} // Q-Lite number -> pending auto-clear timeout
		this.resolvedHosts = {} // Q-Lite number -> resolved IP address
		this.pingResults = {} // Q-Lite number -> online true/false from ping or heartbeat (absent until known)
		this.configStatus = { status: InstanceStatus.Connecting, message: null } // status from config/listener checks
		this.lastStatus = null // last { status, message } passed to updateStatus

		// Heartbeat / acknowledgement state, keyed by Q-Lite number
		this.stateSynced = {} // true once Companion's state is authoritative (first reply adopted, or a command sent)
		this.querySeq = {} // seq of the latest /status/query sent (only ever increases)
		this.lastCommandSeq = {} // querySeq at the time of the latest /led/* command; older replies are stale

		Object.assign(this, {
			...configFields,
			...osc,
			...blink,
			...actions,
			...feedbacks,
			...variables,
			...presets,
			...ping,
		})

		this.resetHeartbeatState()
	}

	//Initialization
	async init(config) {
		await this.configUpdated(config)
	}

	// When module gets deleted or disabled
	async destroy() {
		this.stopInterval()
		this.stopPingMonitors()
		this.clearAutoClearTimers()
		this.clearPendingAcks()
		await this.closeListener()
		this.lastStatus = null
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.config = config

		// Tear down anything started by a previous configuration
		this.stopPingMonitors()
		await this.closeListener()
		this.pingResults = {}
		this.resolvedHosts = {}
		this.resetHeartbeatState()

		const count = this.getQliteCount()
		this.buttons = [{ id: '0', label: 'All' }]
		for (let i = 1; i <= count; i++) {
			this.buttons.push({ id: String(i), label: String(i) })
		}

		this.initActions()
		this.initFeedbacks()
		this.initVariables()
		this.initPresets()

		// Default values shown immediately after the module loads. Existing state is kept across config saves.
		const defaults = {}
		for (let i = 1; i <= count; i++) {
			if (this.getVariableValue(`qlite${i}_status`) === undefined) defaults[`qlite${i}_status`] = 'off'
			if (this.getVariableValue(`qlite${i}_hold`) === undefined) defaults[`qlite${i}_hold`] = 'off'
			if (this.getVariableValue(`qlite${i}_online`) === undefined) defaults[`qlite${i}_online`] = false
		}
		this.setVariableValues(defaults)
		this.checkVariables()
		this.startInterval()

		if (!this.config['qlite1-host'] || !this.config['qlite1-targetPort']) {
			this.setConfigStatus(InstanceStatus.BadConfig, 'Q-Lite #1 host and port are required')
			this.log('warn', 'No host/port specified in config for Q-Lite #1')
			return
		}

		// Resolve every configured Q-Lite. Ones that are missing or fail to resolve are skipped.
		const unresolved = await this.resolveHosts(count)

		let status = InstanceStatus.Ok
		let message = null
		if (unresolved.length > 0) {
			status = InstanceStatus.UnknownWarning
			message = `Unable to resolve Q-Lite ${unresolved.map((n) => `#${n}`).join(', ')}`
		}

		if (this.config.listen) {
			if (!this.config.feedbackPort) {
				status = InstanceStatus.BadConfig
				message = 'Listen for Feedback is enabled but no Feedback Port is set'
				this.log('warn', message)
			} else {
				setupOSC(this)
				try {
					await this.client.openConnection()
				} catch (err) {
					status = InstanceStatus.ConnectionFailure
					message = err.message
					this.log('error', `Unable to listen on port ${this.config.feedbackPort}: ${err.message}`)
				}
			}
		}

		this.setConfigStatus(status, message)

		for (let i = 1; i <= count; i++) {
			const host = this.resolvedHosts[i]
			if (host) {
				await this.sendOscMessage(i, '/online')
				this.pingMonitors.push(this.startPingMonitor(i, host))
			} else {
				this.setVariableValues({ [`qlite${i}_online`]: false })
			}
		}
		this.checkFeedbacks()
	}

	/**
	 * Record the status worked out from the config and listener, then refresh the displayed status.
	 * The listener reports Connecting directly while it opens, so the next update is always sent.
	 */
	setConfigStatus(status, message = null) {
		this.configStatus = { status, message }
		this.lastStatus = null
		this.updateOverallStatus()
	}

	/**
	 * Combine the config status with the latest ping results and show it in Companion.
	 * Q-Lites that have not answered a ping yet are not counted.
	 */
	updateOverallStatus() {
		let { status, message } = this.configStatus

		if (status !== InstanceStatus.BadConfig && status !== InstanceStatus.ConnectionFailure) {
			const known = Object.keys(this.resolvedHosts)
				.map(Number)
				.filter((n) => n <= this.getQliteCount() && typeof this.pingResults[n] === 'boolean')
				.sort((a, b) => a - b)
			const offline = known.filter((n) => this.pingResults[n] === false)

			if (known.length > 0 && offline.length === known.length) {
				status = InstanceStatus.ConnectionFailure
				message = 'All Q-Lites offline'
			} else if (offline.length > 0) {
				status = InstanceStatus.UnknownWarning
				const offlineMessage = `Q-Lite ${offline.map((n) => `#${n}`).join(', ')} offline`
				message = message ? `${message}; ${offlineMessage}` : offlineMessage
			}
		}

		message = message ?? null
		if (this.lastStatus && this.lastStatus.status === status && this.lastStatus.message === message) return
		this.lastStatus = { status, message }
		this.updateStatus(status, message)
	}

	getQliteCount() {
		const count = parseInt(this.config?.numberOfQlites)
		return Number.isInteger(count) && count >= 1 ? count : 1
	}

	/**
	 * Populate this.resolvedHosts for Q-Lites 1..count.
	 * @returns {Promise<number[]>} Q-Lite numbers that have a host configured but could not be resolved
	 */
	async resolveHosts(count) {
		this.resolvedHosts = {}
		const unresolved = []

		for (let i = 1; i <= count; i++) {
			const host = String(this.config[`qlite${i}-host`] ?? '').trim()
			const port = this.config[`qlite${i}-targetPort`]

			if (!host || !port) {
				this.log('warn', `Q-Lite #${i} has no host or port configured, skipping`)
				continue
			}

			if (isValidIPAddress(host)) {
				this.resolvedHosts[i] = host
				continue
			}

			try {
				this.resolvedHosts[i] = await resolveHostname(this, host)
			} catch (err) {
				this.log('error', `Unable to resolve hostname for Q-Lite #${i} (${host}): ${err.message}`)
				unresolved.push(i)
			}
		}

		return unresolved
	}

	/**
	 * Forget what was learned about the Q-Lites' heartbeat and echo support (the config may now point elsewhere).
	 * stateSynced, querySeq and lastCommandSeq are kept: state survives config saves, and keeping the sequence numbers
	 * increasing means a reply to a query sent before the save can never look newer than a command sent after it.
	 */
	resetHeartbeatState() {
		this.clearPendingAcks()
		this.heartbeatCapable = {} // answered /status/query, so the heartbeat replaces ping
		this.ackCapable = {} // seen echoing commands, so /led/* commands are re-sent until echoed
		this.lastHeard = {} // Date.now() of the latest message
		this.lastBootId = {} // boot_id from the latest /status reply
		this.pendingAcks = {} // { path, host, port, args, retries, timer } awaiting an echo
	}

	stopPingMonitors() {
		for (const monitor of this.pingMonitors) {
			monitor.stop()
		}
		this.pingMonitors = []
	}

	clearAutoClearTimers() {
		for (const timer of Object.values(this.autoClearTimers)) {
			clearTimeout(timer)
		}
		this.autoClearTimers = {}
	}

	async closeListener() {
		if (this.client) {
			try {
				await this.client.closeConnection()
			} catch (err) {
				this.log('error', `UDP close error: ${err.message}`)
			}
			this.client = null
		}
	}
}

runEntrypoint(QLiteInstance, UpgradeScripts)
