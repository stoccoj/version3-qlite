// Incoming OSC feedback from the Q-Lites
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { REPO, sent, makeConfig, createInstance, cleanup, oscPacket, getFreePort, sendUdp } = require('./harness')

afterEach(cleanup)

// Load after createInstance so it shares the freshly loaded modules/osc.js
const onData = (inst, buffer, address = '192.168.99.99') =>
	require(path.join(REPO, 'osc-feedback.js')).onDataHandler(inst, { address, port: 53000 }, buffer)

const int = (value) => ({ type: 'i', value })

async function setup(n = 2) {
	const inst = await createInstance(
		makeConfig(n, {
			'qlite1-requestReadyConfirmation': true,
			'qlite1-requestGoConfirmation': true,
			'qlite2-requestReadyConfirmation': true,
			'qlite2-requestGoConfirmation': true,
		}),
	)
	sent.length = 0
	return inst
}

test('ready-confirmed with a Q-Lite number argument confirms that Q-Lite', async () => {
	const inst = await setup()
	inst.setVariableValues({ qlite1_status: 'ready', qlite2_status: 'ready' })

	await onData(inst, oscPacket('/button/ready-confirmed', [int(2)]))

	assert.equal(inst.getVariableValue('qlite2_status'), 'ready-confirmed')
	assert.equal(inst.getVariableValue('qlite1_status'), 'ready')
	assert.deepEqual(
		sent.map((m) => m.text),
		['10.0.0.2:8000 /led/ready/solid 2'],
	)
	assert.equal(inst.getVariableValue('latest_received_qlite_number'), '2')
	assert.equal(inst.getVariableValue('latest_received_path'), '/button/ready-confirmed')
	assert.equal(inst.getVariableValue('latest_received_raw'), '/button/ready-confirmed 2')
})

test('go-confirmed only applies while in go', async () => {
	const inst = await setup()
	inst.setVariableValues({ qlite1_status: 'go', qlite2_status: 'off' })

	await onData(inst, oscPacket('/button/go-confirmed', [int(1)]))
	await onData(inst, oscPacket('/button/go-confirmed', [int(2)]))

	assert.equal(inst.getVariableValue('qlite1_status'), 'go-confirmed')
	assert.equal(inst.getVariableValue('qlite2_status'), 'off')
	assert.deepEqual(
		sent.map((m) => m.text),
		['10.0.0.1:8000 /led/go/solid 1'],
	)
})

test('a message without arguments is matched by sender IP', async () => {
	const inst = await setup()
	inst.setVariableValues({ qlite1_status: 'ready', qlite2_status: 'ready' })

	await onData(inst, oscPacket('/button/ready-confirmed'), '10.0.0.2')

	assert.equal(inst.getVariableValue('qlite2_status'), 'ready-confirmed')
	assert.equal(inst.getVariableValue('qlite1_status'), 'ready')
	assert.equal(inst.getVariableValue('latest_received_qlite_number'), '2')
	assert.equal(inst.getVariableValue('latest_received_args'), undefined)
})

test('out-of-range and unknown senders are ignored', async () => {
	const inst = await setup()
	inst.setVariableValues({ qlite1_status: 'ready' })

	await onData(inst, oscPacket('/button/hold', [int(9)]))
	assert.equal(inst.getVariableValue('latest_received_qlite_number'), '')
	await onData(inst, oscPacket('/button/hold', [int(0)]))
	await onData(inst, oscPacket('/button/ready-confirmed'), '192.168.99.99')

	assert.equal(inst.getVariableValue('qlite1_status'), 'ready')
	assert.equal(inst.getVariableValue('qlite1_hold'), 'off')
	assert.equal(inst.getVariableValue('latest_received_qlite_number'), '')
	assert.equal(sent.length, 0)
})

test('a remote Hold sets blink and lights the hold LED solid', async () => {
	const inst = await setup()

	await onData(inst, oscPacket('/button/hold', [int(1)]))

	assert.equal(inst.getVariableValue('qlite1_hold'), 'blink')
	assert.deepEqual(
		sent.map((m) => m.text),
		['10.0.0.1:8000 /led/hold/solid 1'],
	)

	// Already held: nothing more is sent
	sent.length = 0
	await onData(inst, oscPacket('/button/hold', [int(1)]))
	assert.equal(sent.length, 0)
})

test('bundles, including nested bundles, are handled', async () => {
	const inst = await setup()
	inst.setVariableValues({ qlite1_status: 'ready', qlite2_status: 'go' })
	const osc = require('osc')
	const bundle = {
		timeTag: osc.timeTag(0),
		packets: [
			{ address: '/button/ready-confirmed', args: [int(1)] },
			{ timeTag: osc.timeTag(0), packets: [{ address: '/button/go-confirmed', args: [int(2)] }] },
		],
	}

	await onData(inst, Buffer.from(osc.writePacket(bundle, { metadata: true })))

	assert.equal(inst.getVariableValue('qlite1_status'), 'ready-confirmed')
	assert.equal(inst.getVariableValue('qlite2_status'), 'go-confirmed')
	assert.equal(inst.getVariableValue('latest_received_qlite_number'), '2')
})

test('a malformed buffer logs an error and does not throw', async () => {
	const inst = await setup()
	await assert.doesNotReject(onData(inst, Buffer.from([0x01, 0x02, 0x03])))
	assert.ok(inst.logs.some(([level, message]) => level === 'error' && /Error parsing OSC/.test(message)))
})

test('feedback over real UDP reaches the listener', async () => {
	const port = await getFreePort()
	const inst = await createInstance(
		makeConfig(1, { listen: true, feedbackPort: String(port), 'qlite1-requestReadyConfirmation': true }),
	)
	assert.ok(inst.client.isConnected())
	await inst.actions.ready.callback({ options: { number: '1' } })
	assert.equal(inst.getVariableValue('qlite1_status'), 'ready')

	await sendUdp(port, oscPacket('/button/ready-confirmed', [int(1)]))
	const deadline = Date.now() + 2000
	while (inst.getVariableValue('qlite1_status') !== 'ready-confirmed' && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 10))
	}

	assert.equal(inst.getVariableValue('qlite1_status'), 'ready-confirmed')
	assert.equal(inst.getVariableValue('latest_received_client'), '127.0.0.1')
})
