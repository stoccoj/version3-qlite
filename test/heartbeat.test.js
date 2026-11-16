// OSC heartbeat (/status/query -> /status): online detection and state sync
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { REPO, InstanceStatus, sent, makeConfig, createInstance, cleanup, oscPacket, getFreePort } = require('./harness')

afterEach(cleanup)

const HEARTBEAT_INTERVAL = 2000
const PING_INTERVAL = 10000

const int = (value) => ({ type: 'i', value })
const str = (value) => ({ type: 's', value })

// Let resolved stub pings and async handlers run (mocked timers don't affect promise jobs)
const settle = async () => {
	for (let i = 0; i < 5; i++) await Promise.resolve()
}

// Load after createInstance so it shares the freshly loaded modules
const onData = (inst, buffer, address = '10.0.0.1') =>
	require(path.join(REPO, 'osc-feedback.js')).onDataHandler(inst, { address, port: 8002 }, buffer)

const statusPacket = (n, seq, ready = 'off', go = 'off', hold = 'off', bootId = 1234) =>
	oscPacket('/status', [int(n), int(seq), str(ready), str(go), str(hold), int(bootId)])

// Reply to the latest query sent to Q-Lite n
const reply = (inst, n, ready, go, hold, bootId) =>
	onData(inst, statusPacket(n, inst.querySeq[n] ?? 0, ready, go, hold, bootId), `10.0.0.${n}`)

const queries = (n) => sent.filter((m) => m.path === '/status/query' && m.host === `10.0.0.${n}`)
const ledSends = () => sent.filter((m) => m.path.startsWith('/led/')).map((m) => `${m.host} ${m.path}`)
const last = (inst) => inst.statusLog.at(-1)

async function setup(t, n = 1, { listen = true, pingMap = {}, overrides = {} } = {}) {
	const feedback = listen ? { listen: true, feedbackPort: String(await getFreePort()) } : {}
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 })
	const config = makeConfig(n, { ...feedback, ...overrides })
	const inst = await createInstance(config, { pingMap })
	await settle()
	sent.length = 0
	return inst
}

async function tick(t, ms = HEARTBEAT_INTERVAL) {
	t.mock.timers.tick(ms)
	await settle()
}

// Send one query and let the Q-Lite answer it, so later replies are compared rather than adopted
async function sync(t, inst, n = 1, state = ['off', 'off', 'off'], bootId = 1234) {
	await tick(t)
	await reply(inst, n, ...state, bootId)
	assert.equal(inst.stateSynced[n], true)
	sent.length = 0
}

test('a query is sent every 2 s with an increasing seq while listening', async (t) => {
	const inst = await setup(t, 2)
	assert.equal(queries(1).length, 0)

	await tick(t)
	await tick(t)
	assert.deepEqual(
		queries(1).map((m) => m.args),
		[
			[int(1), int(1)],
			[int(1), int(2)],
		],
	)
	assert.deepEqual(
		queries(2).map((m) => m.args),
		[
			[int(2), int(1)],
			[int(2), int(2)],
		],
	)
	assert.equal(queries(1)[0].port, 8000)
	// Queries don't overwrite the latest_sent variables
	assert.equal(inst.getVariableValue('qlite1_latest_sent_path'), '/online')
})

test('no queries when Listen for Feedback is off', async (t) => {
	const inst = await setup(t, 1, { listen: false })
	await tick(t, 3 * HEARTBEAT_INTERVAL)
	assert.equal(queries(1).length, 0)
	assert.equal(inst.getVariableValue('qlite1_online'), true, 'ping still decides online')
})

test('a reply marks the Q-Lite online at once and stops pinging it', async (t) => {
	const inst = await setup(t, 2, { pingMap: { '10.0.0.1': false, '10.0.0.2': false } })
	assert.deepEqual(last(inst), [InstanceStatus.ConnectionFailure, 'All Q-Lites offline'])

	await tick(t)
	await reply(inst, 1)
	assert.equal(inst.getVariableValue('qlite1_online'), true)
	assert.equal(inst.getVariableValue('qlite1_last_seen'), Date.now())
	assert.deepEqual(last(inst), [InstanceStatus.UnknownWarning, 'Q-Lite #2 offline'])
	assert.equal(inst.heartbeatCapable[1], true)

	inst.pingCalls.length = 0
	for (let i = 0; i < PING_INTERVAL / HEARTBEAT_INTERVAL; i++) {
		await tick(t)
		await reply(inst, 1)
	}
	assert.deepEqual(inst.pingCalls, ['10.0.0.2'], 'only the Q-Lite without a heartbeat is pinged')
	assert.ok(inst.logs.some(([, m]) => /Q-Lite #1 answers the heartbeat/.test(m)))
})

test('no reply for 6 s -> offline: Warning, then Connection Failure', async (t) => {
	const inst = await setup(t, 2)
	await tick(t)
	await reply(inst, 1)
	await reply(inst, 2)
	assert.deepEqual(last(inst), [InstanceStatus.Ok, null])

	// Only #1 keeps answering. 6 s of silence is still online; just over is offline.
	for (let i = 0; i < 3; i++) {
		await tick(t)
		await reply(inst, 1)
	}
	assert.equal(inst.getVariableValue('qlite2_online'), true)
	await tick(t)
	await reply(inst, 1)
	assert.equal(inst.getVariableValue('qlite2_online'), false)
	assert.deepEqual(last(inst), [InstanceStatus.UnknownWarning, 'Q-Lite #2 offline'])

	// Now #1 goes quiet too
	await tick(t, 4 * HEARTBEAT_INTERVAL)
	assert.deepEqual(last(inst), [InstanceStatus.ConnectionFailure, 'All Q-Lites offline'])

	// Pinging doesn't resume, queries continue, and a reply brings it straight back
	inst.pingCalls.length = 0
	await tick(t, PING_INTERVAL)
	assert.deepEqual(inst.pingCalls, [])
	await reply(inst, 2)
	assert.deepEqual(last(inst), [InstanceStatus.UnknownWarning, 'Q-Lite #1 offline'])
})

test('the first reply is adopted: Ready/Go LEDs map to the status', async (t) => {
	const cases = [
		[['solid', 'off', 'off'], 'ready-confirmed'],
		[['blink', 'off', 'off'], 'ready'],
		[['pulse', 'off', 'off'], 'ready'],
		[['off', 'solid', 'off'], 'go-confirmed'],
		[['off', 'blink', 'off'], 'go'],
		[['off', 'off', 'off'], 'off'],
	]
	const inst = await setup(t, cases.length)
	inst.setVariableValues({ qlite6_status: 'go', qlite6_hold: 'on' }) // differs from the Q-Lite, so is replaced
	await tick(t)
	for (const [i, [leds]] of cases.entries()) await reply(inst, i + 1, ...leds)

	for (const [i, [, status]] of cases.entries()) {
		assert.equal(inst.getVariableValue(`qlite${i + 1}_status`), status, `case ${i + 1}`)
		assert.equal(inst.getVariableValue(`qlite${i + 1}_hold`), 'off')
		assert.equal(inst.stateSynced[i + 1], true)
	}
	assert.deepEqual(ledSends(), [], 'adopting sends nothing')
})

test('the first reply is adopted: hold maps, and Ready/Go are left alone while held', async (t) => {
	const inst = await setup(t, 3)
	inst.setVariableValues({ qlite1_status: 'go-confirmed', qlite2_status: 'ready' })
	await tick(t)
	await reply(inst, 1, 'off', 'off', 'solid') // remote hold
	await reply(inst, 2, 'off', 'off', 'blink') // hold from Companion
	await reply(inst, 3, 'off', 'off', 'pulse')

	assert.equal(inst.getVariableValue('qlite1_hold'), 'blink')
	assert.equal(inst.getVariableValue('qlite1_status'), 'go-confirmed')
	assert.equal(inst.getVariableValue('qlite2_hold'), 'on')
	assert.equal(inst.getVariableValue('qlite2_status'), 'ready')
	assert.equal(inst.getVariableValue('qlite3_hold'), 'on')
	assert.deepEqual(ledSends(), [])
})

test('a matching reply sends nothing; held Q-Lites only compare hold', async (t) => {
	const inst = await setup(t, 1)
	await sync(t, inst)
	await inst.actions.ready.callback({ options: { number: '1' } })
	await inst.actions.hold.callback({ options: { number: '1' } })
	sent.length = 0

	await tick(t)
	await reply(inst, 1, 'off', 'off', 'blink')
	assert.deepEqual(ledSends(), [])
	assert.equal(inst.getVariableValue('qlite1_status'), 'ready-confirmed')
	assert.equal(inst.getVariableValue('qlite1_hold'), 'on')
})

test('a new boot_id with different LEDs re-sends the state', async (t) => {
	const inst = await setup(t, 1)
	await sync(t, inst, 1, ['off', 'off', 'off'], 111)
	await inst.actions.ready.callback({ options: { number: '1' } })
	sent.length = 0

	await tick(t)
	await reply(inst, 1, 'solid', 'off', 'off', 111)
	assert.deepEqual(ledSends(), [])

	await tick(t)
	await reply(inst, 1, 'off', 'off', 'off', 222)
	assert.deepEqual(ledSends(), ['10.0.0.1 /led/ready/solid'])
	assert.equal(inst.getVariableValue('qlite1_status'), 'ready-confirmed', 'Companion state is kept')
	assert.ok(inst.logs.some(([, m]) => /re-sending state because it restarted/.test(m)))
})

test('coming back from offline re-sends the state', async (t) => {
	const inst = await setup(t, 1, { overrides: { 'qlite1-requestGoConfirmation': true } })
	await sync(t, inst)
	await inst.actions.go.callback({ options: { number: '1' } })
	await tick(t, 4 * HEARTBEAT_INTERVAL)
	assert.equal(inst.getVariableValue('qlite1_online'), false)
	sent.length = 0

	await reply(inst, 1, 'off', 'off', 'off')
	assert.equal(inst.getVariableValue('qlite1_online'), true)
	assert.deepEqual(ledSends(), ['10.0.0.1 /led/go/blink'])
	assert.ok(inst.logs.some(([, m]) => /re-sending state because it is back online/.test(m)))
})

test('a mismatch while online re-sends the state', async (t) => {
	const inst = await setup(t, 3)
	await tick(t)
	for (const n of [1, 2, 3]) await reply(inst, n)
	await inst.actions.hold.callback({ options: { number: '1' } }) // hold 'on'
	await inst.actions.go.callback({ options: { number: '3' } })
	inst.setVariableValues({ qlite2_hold: 'blink' }) // remote hold
	sent.length = 0

	await tick(t)
	await reply(inst, 1, 'off', 'off', 'solid')
	await reply(inst, 2, 'off', 'off', 'off')
	await reply(inst, 3, 'off', 'off', 'blink')
	assert.deepEqual(ledSends(), ['10.0.0.1 /led/hold/blink', '10.0.0.2 /led/hold/solid', '10.0.0.3 /led/go/solid'])

	// A reply to a query sent before the re-send is stale, so it doesn't trigger another one
	sent.length = 0
	await reply(inst, 1, 'off', 'off', 'solid')
	assert.deepEqual(ledSends(), [])
	assert.ok(inst.logs.some(([, m]) => /re-sending state because its LEDs differ/.test(m)))
})

test('a Companion state with nothing lit re-sends a clear', async (t) => {
	const inst = await setup(t, 1)
	await sync(t, inst)
	await tick(t)
	await reply(inst, 1, 'solid', 'off', 'off')
	assert.deepEqual(ledSends(), ['10.0.0.1 /led/clear'])
})

test('a reply to a query sent before the latest command does not touch the state', async (t) => {
	const inst = await setup(t, 1)
	await sync(t, inst)
	await tick(t) // query seq 2 is in flight...
	await inst.actions.ready.callback({ options: { number: '1' } }) // ...when Ready is pressed
	sent.length = 0

	await reply(inst, 1, 'off', 'off', 'off') // seq 2: from before Ready
	assert.equal(inst.getVariableValue('qlite1_status'), 'ready-confirmed')
	assert.deepEqual(ledSends(), [])
	assert.equal(inst.getVariableValue('qlite1_online'), true, 'still counts as heard')

	await tick(t)
	await reply(inst, 1, 'solid', 'off', 'off') // seq 3 includes it
	assert.deepEqual(ledSends(), [])
})

test('a command sent before the first reply is not overwritten by it', async (t) => {
	const inst = await setup(t, 1)
	await tick(t)
	await inst.actions.go.callback({ options: { number: '1' } })
	await reply(inst, 1, 'off', 'off', 'off') // stale
	await tick(t)
	await reply(inst, 1, 'off', 'off', 'off') // newer: Companion's Go is authoritative, so it is re-sent
	assert.equal(inst.getVariableValue('qlite1_status'), 'go-confirmed')
	assert.deepEqual(ledSends().at(-1), '10.0.0.1 /led/go/solid')
})

test('malformed replies are ignored', async (t) => {
	const inst = await setup(t, 1, { pingMap: { '10.0.0.1': false } })
	inst.setVariableValues({ qlite1_status: 'go' })
	await tick(t)
	const seq = inst.querySeq[1]
	const bad = [
		[int(1), int(seq), str('solid'), str('off'), str('off')], // no boot_id
		[int(1), int(seq), str('bright'), str('off'), str('off'), int(1)], // unknown mode
		[int(1), str('x'), str('solid'), str('off'), str('off'), int(1)], // seq not an int
		[int(1), int(seq), int(1), str('off'), str('off'), int(1)], // mode not a string
	]
	for (const args of bad) await onData(inst, oscPacket('/status', args), '10.0.0.1')

	assert.equal(inst.getVariableValue('qlite1_status'), 'go')
	assert.equal(inst.getVariableValue('qlite1_online'), false)
	assert.equal(inst.heartbeatCapable[1], undefined)
	assert.equal(inst.stateSynced[1], undefined)
	assert.equal(inst.logs.filter(([level, m]) => level === 'debug' && /malformed \/status/.test(m)).length, 4)
	assert.equal(inst.getVariableValue('latest_received_path'), undefined, 'heartbeat replies skip latest_received')
})

test('stateSynced survives a config save; heartbeat support is re-learned', async (t) => {
	const config = makeConfig(1, { listen: true, feedbackPort: String(await getFreePort()) })
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 })
	const inst = await createInstance(config)
	await settle()
	await sync(t, inst)

	await inst.configUpdated({ ...config })
	await settle()
	assert.equal(inst.heartbeatCapable[1], undefined)
	assert.equal(inst.stateSynced[1], true)
	sent.length = 0

	await tick(t)
	await reply(inst, 1, 'off', 'solid', 'off')
	assert.equal(inst.getVariableValue('qlite1_status'), 'off', 'not adopted')
	assert.deepEqual(ledSends(), ['10.0.0.1 /led/clear'])
	assert.ok(inst.querySeq[1] > 1, 'seq keeps increasing across the save')
})

test('destroy() leaves no heartbeat running', async (t) => {
	const inst = await setup(t, 2)
	await tick(t)
	await reply(inst, 1)
	await inst.destroy()
	sent.length = 0
	inst.pingCalls.length = 0

	await tick(t, 3 * PING_INTERVAL)
	assert.deepEqual(sent, [])
	assert.deepEqual(inst.pingCalls, [])
	assert.equal(inst.pingMonitors.length, 0)
	assert.equal(inst.client, null)
})
