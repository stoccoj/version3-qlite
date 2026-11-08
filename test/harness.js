// Test harness: loads the module with a fake Companion InstanceBase so it can be driven without Companion.
const Module = require('node:module')
const path = require('node:path')
const dgram = require('node:dgram')
const osc = require('osc')

const REPO = path.resolve(__dirname, '..')
const realBase = require('@companion-module/base')

const sent = [] // OSC messages passed to oscSend, as { host, port, path, args, text }
const instances = new Set()

class FakeBase {
	constructor() {
		this.vars = new Map()
		this.statusLog = [] // [status, message] for every updateStatus call
		this.logs = [] // [level, message]
		this.checkFeedbacksCount = 0
		this.actions = {}
		this.feedbacks = {}
		this.varDefs = []
		this.presets = {}
		this.savedConfig = null
	}
	log(level, message) {
		this.logs.push([level, message])
		if (process.env.QLITE_TEST_LOG) console.log(`[${level}] ${message}`)
	}
	updateStatus(status, message = null) {
		this.statusLog.push([status, message ?? null])
	}
	setVariableValues(values) {
		for (const [k, v] of Object.entries(values)) this.vars.set(k, v)
	}
	getVariableValue(id) {
		return this.vars.get(id)
	}
	setVariableDefinitions(defs) {
		this.varDefs = defs
	}
	setActionDefinitions(actions) {
		this.actions = actions
	}
	setFeedbackDefinitions(feedbacks) {
		this.feedbacks = feedbacks
	}
	setPresetDefinitions(presets) {
		this.presets = presets
	}
	checkFeedbacks() {
		this.checkFeedbacksCount++
	}
	saveConfig(config) {
		this.savedConfig = config
	}
	oscSend(host, port, oscPath, args) {
		sent.push({
			host,
			port,
			path: oscPath,
			args,
			text: `${host}:${port} ${oscPath} ${args.map((a) => a.value).join(' ')}`,
		})
	}
}

let InstanceClass = null

const originalLoad = Module._load
Module._load = function (request, ...rest) {
	if (request === '@companion-module/base') {
		return {
			...realBase,
			InstanceBase: FakeBase,
			runEntrypoint: (klass) => {
				InstanceClass = klass
			},
		}
	}
	return originalLoad.call(this, request, ...rest)
}

// Load a fresh copy of the module's own files (not node_modules)
function loadModule() {
	for (const key of Object.keys(require.cache)) {
		if (
			key.startsWith(REPO) &&
			!key.includes(`${path.sep}node_modules${path.sep}`) &&
			!key.includes(`${path.sep}test${path.sep}`)
		) {
			delete require.cache[key]
		}
	}
	InstanceClass = null
	require(path.join(REPO, 'index.js'))
	return InstanceClass
}

/**
 * Build a config for n Q-Lites at 10.0.0.1..n port 8000.
 */
function makeConfig(n, overrides = {}) {
	const config = { numberOfQlites: String(n), listen: false, feedbackPort: '', rate: 1000 }
	for (let i = 1; i <= n; i++) {
		config[`qlite${i}-host`] = `10.0.0.${i}`
		config[`qlite${i}-targetPort`] = '8000'
		config[`qlite${i}-requestReadyConfirmation`] = false
		config[`qlite${i}-requestGoConfirmation`] = false
	}
	return { ...config, ...overrides }
}

/**
 * Create and initialise an instance. Ping is stubbed: `instance.pingMap[ip]` (default true) is the result, and
 * `instance.pingCalls` records every ip pinged. Call cleanup() (or destroy) when done.
 * @param {object|null} config - pass null to skip init()
 */
async function createInstance(config, { pingMap = {} } = {}) {
	const Klass = loadModule()
	const instance = new Klass({})
	instance.pingMap = pingMap
	instance.pingCalls = []
	instance.pingHost = function (ip) {
		this.pingCalls.push(ip)
		return Promise.resolve(this.pingMap[ip] ?? true)
	}
	instances.add(instance)
	if (config) await instance.init(config)
	return instance
}

async function cleanup() {
	for (const instance of instances) {
		await instance.destroy()
	}
	instances.clear()
	sent.length = 0
}

function oscPacket(address, args = []) {
	return Buffer.from(osc.writePacket({ address, args }, { metadata: true }))
}

// Find a free UDP port by binding to port 0
function getFreePort() {
	return new Promise((resolve, reject) => {
		const socket = dgram.createSocket('udp4')
		socket.on('error', reject)
		socket.bind(0, '127.0.0.1', () => {
			const { port } = socket.address()
			socket.close(() => resolve(port))
		})
	})
}

// Send one UDP datagram to 127.0.0.1
function sendUdp(port, buffer) {
	return new Promise((resolve, reject) => {
		const socket = dgram.createSocket('udp4')
		socket.send(buffer, port, '127.0.0.1', (err) => {
			socket.close()
			if (err) reject(err)
			else resolve()
		})
	})
}

// Let pending promise callbacks (e.g. stubbed ping results) run
const flush = () => new Promise((resolve) => setImmediate(resolve))

module.exports = {
	REPO,
	InstanceStatus: realBase.InstanceStatus,
	sent,
	makeConfig,
	createInstance,
	cleanup,
	oscPacket,
	flush,
	getFreePort,
	sendUdp,
}
