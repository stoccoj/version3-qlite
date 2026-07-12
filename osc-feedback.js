const osc = require('osc')
const path = require('node:path')
const { paths } = require('./modules/osc')

function getCompleteMessageLength(buffer) {
	try {
		const packet = osc.readPacket(buffer, {})
		return osc.writePacket(packet).length
	} catch (err) {
		// Handle incomplete message
		return buffer.length + 1 // Ensure the message length exceeds buffer length to wait for more data
	}
}

async function parseOscMessages(root, buffer) {
	const packets = []

	while (buffer.length > 0) {
		const messageLength = getCompleteMessageLength(buffer)
		if (messageLength <= buffer.length) {
			const message = buffer.slice(0, messageLength)
			buffer = buffer.slice(messageLength)

			try {
				let packet = osc.readPacket(message, { metadata: true })
				packets.push(packet)
			} catch (err) {
				root.log('error', `Error parsing OSC message: ${err.message}. Data: ${message}`)
			}
		} else {
			break // Wait for more data
		}
	}

	return { remainingBuffer: buffer, packets }
}

async function handleButtonResponse(root, path, qlite_number) {
	if (path === '/button/ready-confirmed' && qlite_number) {
		const status = await root.getVariableValue(`qlite${qlite_number}_status`)
		root.log('debug', `Received ready-confirmed from Q-Lite #${qlite_number}, current status: ${status}`)
		if (status === 'ready') {
			root.log('debug', 'confirm the ready state for Q-Lite #' + qlite_number)
			root.setVariableValues({
				[`qlite${qlite_number}_status`]: 'ready-confirmed',
			})
			await root.sendOscMessage(qlite_number, paths.ready_solid)
		}
	} else if (path === '/button/go-confirmed' && qlite_number) {
		const status = await root.getVariableValue(`qlite${qlite_number}_status`)
		root.log('debug', `Received go-confirmed from Q-Lite #${qlite_number}, current status: ${status}`)
		if (status === 'go') {
			root.log('debug', 'confirm the go state for Q-Lite #' + qlite_number)
			root.setVariableValues({
				[`qlite${qlite_number}_status`]: 'go-confirmed',
			})
			await root.sendOscMessage(qlite_number, paths.go_solid)
		}
	} else if (path === '/button/hold' && qlite_number) {
		const hold_status = await root.getVariableValue(`qlite${qlite_number}_hold`)
		if (hold_status === 'off') {
			root.log('debug', 'set the hold state for Q-Lite #' + qlite_number)
			root.setVariableValues({
				[`qlite${qlite_number}_hold`]: 'blink',
			})
			await root.sendOscMessage(qlite_number, paths.hold_solid)
		}
	}
}

async function onDataHandler(root, source, data) {
	try {
		let buffer = Buffer.alloc(0)
		buffer = Buffer.concat([buffer, data])
		root.log('trace', `Buffer length: ${buffer.length}`)

		// Parse the OSC messages
		const { remainingBuffer, packets } = await parseOscMessages(root, buffer)
		buffer = remainingBuffer

		root.log('debug', `Raw: ${JSON.stringify(data)}`)

		// Handle the parsed packets
		for (const packet of packets) {
			if (packet.address) {
				root.onDataReceived[packet.address] = packet.args
				const args_json = JSON.stringify(packet.args)
				const args_string = packet.args.map((item) => item.value).join(' ')

				root.log('debug', `OSC message: ${packet.address}, args: ${args_json}`)

				const qlite_number = packet.args[0]?.value | getButtonNumberByAddress(root.config, source.address)
				await handleButtonResponse(root, packet.address, qlite_number)

				await root.checkFeedbacks()

				//Update Variables
				root.setVariableValues({
					latest_received_raw: `${packet.address} ${args_string}`,
					latest_received_path: packet.address,
					latest_received_args: packet.args.length ? packet.args.map((arg) => arg.value) : undefined,
					latest_received_timestamp: Date.now(),
					lastest_received_qlite_number: String(qlite_number),
				})
			} else if (packet.packets) {
				for (const element of packet.packets) {
					if (element.address) {
						root.onDataReceived[element.address] = element.args

						root.log('debug', `Bundle element message: ${element.address}, args: ${JSON.stringify(element.args)}`)

						const qlite_number = packet.args[0]?.value
						await handleButtonResponse(root, packet.address, qlite_number)

						await root.checkFeedbacks()

						//Update Variables
						root.setVariableValues({
							latest_received_raw: `${element.address} ${element.args}`,
							latest_received_path: element.address,
							latest_received_args: element.args.length ? element.args.map((arg) => arg.value) : undefined,
							latest_received_timestamp: Date.now(),
							lastest_received_qlite_number: String(qlite_number),
						})
					}
				}
			}
		}

		root.log('trace', `Remaining buffer length: ${buffer.length}`)
	} catch (err) {
		root.log('error', `Error handling incoming data: ${err.message}`)
	}
}

function getButtonNumberByAddress(config, address) {
	console.log(`Looking for address ${address} in config`)
	let field = Object.keys(config)
			.filter(key => key !== 'host')
			.find(key => config[key] === address)
	field = field ? field.replace('button', '') : null
	field = field ? field.replace('-host', '') : null
	console.log(`Found field ${field} for address ${address}`)
	return field
}

module.exports = { onDataHandler }
