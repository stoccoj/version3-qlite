const osc = require('osc')
const { paths } = require('./modules/osc')

async function handleButtonResponse(root, path, qlite_number) {
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
	const args_string = args.map((item) => item.value).join(' ')
	root.log('debug', `OSC message: ${message.address}, args: ${JSON.stringify(args)}`)

	const qlite_number = getQliteNumber(root, message, source)
	if (qlite_number !== null) {
		await handleButtonResponse(root, message.address, qlite_number)
	}

	root.setVariableValues({
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
