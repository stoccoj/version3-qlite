const osc = require('osc')
const { paths } = require('./modules/osc')

const LED_MODES = ['off', 'solid', 'blink', 'pulse']
const isLit = (mode) => mode !== 'off'
const isSteady = (mode) => mode === 'solid' // pulse is treated like blink

/**
 * Parse /status i<n> i<seq> s<ready> s<go> s<hold> i<boot_id>.
 * @returns {{seq: number, ready: string, go: string, hold: string, bootId: number}|null} null when malformed
 */
function parseStatusReply(args) {
	if (args.length < 6) return null
	const [n, seq, ready, go, hold, bootId] = args
	const isInt = (arg) => arg.type === 'i' && Number.isInteger(arg.value)
	const isMode = (arg) => arg.type === 's' && LED_MODES.includes(arg.value)
	if (!isInt(n) || !isInt(seq) || !isInt(bootId) || !isMode(ready) || !isMode(go) || !isMode(hold)) return null
	return { seq: seq.value, ready: ready.value, go: go.value, hold: hold.value, bootId: bootId.value }
}

/**
 * Map the Q-Lite's LEDs to the module's state. While the hold LED is lit, Ready/Go always read off on the Q-Lite, so
 * status is null (unknown) and only hold is meaningful.
 */
function deviceState(reply) {
	if (isLit(reply.hold)) {
		// Hold set from Companion blinks the LED ('on'); a remote hold lights it solid ('blink')
		return { hold: isSteady(reply.hold) ? 'blink' : 'on', status: null }
	}
	let status = 'off'
	if (isLit(reply.go)) status = isSteady(reply.go) ? 'go-confirmed' : 'go'
	else if (isLit(reply.ready)) status = isSteady(reply.ready) ? 'ready-confirmed' : 'ready'
	return { hold: 'off', status }
}

async function handleStatusReply(root, args, qlite_number) {
	const reply = parseStatusReply(args)
	if (!reply) {
		root.log('debug', `Ignoring malformed /status from Q-Lite #${qlite_number}: ${JSON.stringify(args)}`)
		return
	}

	const wasOffline = root.pingResults[qlite_number] === false
	const previousBootId = root.lastBootId[qlite_number]
	root.lastBootId[qlite_number] = reply.bootId
	if (!root.heartbeatCapable[qlite_number]) {
		root.log('debug', `Q-Lite #${qlite_number} answers the heartbeat, no longer pinging it`)
		root.heartbeatCapable[qlite_number] = true
	}
	root.markQliteHeard(qlite_number)

	// A reply to a query sent before the latest command (or while that command is unacknowledged) may not include it
	if (reply.seq <= (root.lastCommandSeq[qlite_number] ?? 0) || root.pendingAcks[qlite_number]) return

	const device = deviceState(reply)
	const hold = root.getVariableValue(`qlite${qlite_number}_hold`) ?? 'off'
	const status = root.getVariableValue(`qlite${qlite_number}_status`) ?? 'off'
	const held = hold === 'on' || hold === 'blink'
	const matches = held ? device.hold === hold : device.hold === 'off' && device.status === status
	if (matches) {
		root.stateSynced[qlite_number] = true
		return
	}

	if (!root.stateSynced[qlite_number]) {
		// First reply since the module started: the Q-Lite's state is the best we know
		root.log(
			'info',
			`Q-Lite #${qlite_number}: adopting its current state (hold ${device.hold}, ${device.status ?? status})`,
		)
		root.stateSynced[qlite_number] = true
		const values = { [`qlite${qlite_number}_hold`]: device.hold }
		if (device.status !== null) values[`qlite${qlite_number}_status`] = device.status
		root.setVariableValues(values)
		root.checkFeedbacks()
		return
	}

	let reason = 'its LEDs differ from Companion'
	if (previousBootId !== undefined && previousBootId !== reply.bootId) reason = 'it restarted'
	else if (wasOffline) reason = 'it is back online'
	root.log('info', `Q-Lite #${qlite_number}: re-sending state because ${reason}`)
	await root.pushStateToQlite(qlite_number)
}

async function handleButtonResponse(root, path, qlite_number) {
	const hold = root.getVariableValue(`qlite${qlite_number}_hold`)
	const held = hold === 'on' || hold === 'blink'
	if (held && (path === '/button/ready-confirmed' || path === '/button/go-confirmed')) {
		// Confirming would light Ready/Go, which drops Hold on the Q-Lite
		root.log('debug', `Q-Lite #${qlite_number} is held, ignoring ${path}`)
		return
	}

	if (path === '/button/ready-confirmed') {
		const status = root.getVariableValue(`qlite${qlite_number}_status`)
		root.log('debug', `Received ready-confirmed from Q-Lite #${qlite_number}, current status: ${status}`)
		if (status === 'ready') {
			root.log('debug', 'confirm the ready state for Q-Lite #' + qlite_number)
			root.setVariableValues({
				[`qlite${qlite_number}_status`]: 'ready-confirmed',
			})
			await root.sendOscMessage(qlite_number, paths.ready_solid)
		}
	} else if (path === '/button/go-confirmed') {
		const status = root.getVariableValue(`qlite${qlite_number}_status`)
		root.log('debug', `Received go-confirmed from Q-Lite #${qlite_number}, current status: ${status}`)
		if (status === 'go') {
			root.log('debug', 'confirm the go state for Q-Lite #' + qlite_number)
			root.setVariableValues({
				[`qlite${qlite_number}_status`]: 'go-confirmed',
			})
			await root.sendOscMessage(qlite_number, paths.go_solid)
		}
	} else if (path === '/button/hold') {
		const hold_status = root.getVariableValue(`qlite${qlite_number}_hold`)
		if (hold_status === 'off' || hold_status === undefined) {
			root.log('debug', 'set the hold state for Q-Lite #' + qlite_number)
			root.setVariableValues({
				[`qlite${qlite_number}_hold`]: 'blink',
			})
			await root.sendOscMessage(qlite_number, paths.hold_solid)
		}
	}
}

/**
 * Work out which Q-Lite a message came from. The first argument is the Q-Lite number; if absent, the sender's address
 * is matched against the resolved Q-Lite hosts.
 * @returns {number|null}
 */
function getQliteNumber(root, message, source) {
	const raw = message.args?.[0]?.value ?? getButtonNumberByAddress(root, source.address)
	const number = parseInt(raw)
	if (Number.isInteger(number) && number >= 1 && number <= root.getQliteCount()) {
		return number
	}
	root.log('debug', `Unable to match message ${message.address} from ${source.address} to a configured Q-Lite`)
	return null
}

async function handleMessage(root, source, message) {
	const args = message.args ?? []

	// Heartbeat replies arrive every 2 s per Q-Lite. They don't touch the latest_received variables.
	if (message.address === '/status') {
		const qlite_number = getQliteNumber(root, message, source)
		if (qlite_number !== null) await handleStatusReply(root, args, qlite_number)
		return
	}

	const args_string = args.map((item) => item.value).join(' ')
	root.log('debug', `OSC message: ${message.address}, args: ${JSON.stringify(args)}`)

	const qlite_number = getQliteNumber(root, message, source)
	if (qlite_number !== null) {
		root.markQliteHeard(qlite_number)
		// An echo of a command sent to this Q-Lite (first argument is its number) acknowledges it
		const echoed = message.address.startsWith('/led/') || message.address === '/online'
		if (echoed && args[0]?.type === 'i' && args[0].value === qlite_number) {
			root.handleAck(qlite_number, message.address)
		}
		await handleButtonResponse(root, message.address, qlite_number)
	}

	root.setVariableValues({
		latest_received_client: source.address,
		latest_received_port: source.port,
		latest_received_raw: `${message.address} ${args_string}`.trim(),
		latest_received_path: message.address,
		latest_received_args: args.length ? args.map((arg) => arg.value) : undefined,
		latest_received_timestamp: Date.now(),
		latest_received_qlite_number: qlite_number === null ? '' : String(qlite_number),
	})

	root.checkFeedbacks()
}

async function handlePacket(root, source, packet) {
	if (packet.address) {
		await handleMessage(root, source, packet)
	} else if (packet.packets) {
		// Bundle: handle each element (bundles may be nested)
		for (const element of packet.packets) {
			await handlePacket(root, source, element)
		}
	}
}

// Each UDP datagram carries exactly one OSC packet (message or bundle)
async function onDataHandler(root, source, data) {
	let packet
	try {
		packet = osc.readPacket(data, { metadata: true })
	} catch (err) {
		root.log('error', `Error parsing OSC message: ${err.message}`)
		return
	}

	try {
		await handlePacket(root, source, packet)
	} catch (err) {
		root.log('error', `Error handling incoming data: ${err.message}`)
	}
}

function getButtonNumberByAddress(root, address) {
	const match = Object.entries(root.resolvedHosts ?? {}).find(([, ip]) => ip === address)
	const number = match ? match[0] : null
	root.log('debug', `Matched sender address ${address} to Q-Lite ${number ?? '(none)'}`)
	return number
}

module.exports = { onDataHandler }
