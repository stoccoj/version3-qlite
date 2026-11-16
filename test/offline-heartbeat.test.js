// OSC heartbeat while a Q-Lite is offline: /status/query slows to every 10 s until it answers
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { REPO, InstanceStatus, sent, makeConfig, createInstance, cleanup, oscPacket, getFreePort } = require('./harness')

afterEach(cleanup)

const HEARTBEAT_INTERVAL = 2000
const OFFLINE_QUERY_INTERVAL = 10000

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
const last = (inst) => inst.statusLog.at(-1)
const slowDownLogs = (inst) => inst.logs.filter(([, m]) => /querying every 10 s until it answers/.test(m))

async function setup(t, n = 1) {
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 })
	const config = makeConfig(n, { listen: true, feedbackPort: String(await getFreePort()) })
	const inst = await createInstance(config)
	await settle()
	sent.length = 0
	return inst
}

async function tick(t, ms = HEARTBEAT_INTERVAL) {
	t.mock.timers.tick(ms)
	await settle()
}

// All Q-Lites answer once (at T), then only those in `answering` keep answering until #1 is offline (T+8 s)
async function takeOffline(t, inst, n, answering = []) {
	await tick(t)
	for (let i = 1; i <= n; i++) await reply(inst, i)
	sent.length = 0
	for (let i = 0; i < 4; i++) {
		await tick(t)
		for (const a of answering) await reply(inst, a)
	}
	assert.equal(inst.getVariableValue('qlite1_online'), false)
	assert.equal(queries(1).length, 4, 'queries at T+2, 4, 6, and at T+8 when offline is detected')
	sent.length = 0
}

test('while offline, queries are sent every 10 s instead of every 2 s', async (t) => {
	const inst = await setup(t, 2)
	await takeOffline(t, inst, 2, [2])
	assert.deepEqual(last(inst), [InstanceStatus.Ok, 'Q-Lite #1 offline'])

	for (let i = 0; i < 30000 / HEARTBEAT_INTERVAL; i++) {
		await tick(t)
		await reply(inst, 2)
	}
	assert.equal(queries(1).length, 3, 'T+18, 28, 38')
	assert.equal(queries(2).length, 15, 'a Q-Lite that keeps answering is still queried every 2 s')
	assert.equal(inst.getVariableValue('qlite2_online'), true)
	assert.equal(slowDownLogs(inst).length, 1, 'the slow-down is logged once')
})

test('a reply to a slow query brings the Q-Lite back online and back to 2 s queries', async (t) => {
	const inst = await setup(t, 2)
	await takeOffline(t, inst, 2, [2])

	// Next slow query goes out at T+18
	for (let i = 0; i < 5; i++) {
		await tick(t)
		await reply(inst, 2)
	}
	assert.equal(queries(1).length, 1)
	await reply(inst, 1)
	assert.equal(inst.getVariableValue('qlite1_online'), true)
	assert.deepEqual(last(inst), [InstanceStatus.Ok, null])

	sent.length = 0
	for (let i = 0; i < 3; i++) {
		await tick(t)
		await reply(inst, 1)
		await reply(inst, 2)
	}
	assert.equal(queries(1).length, 3)
	assert.equal(inst.getVariableValue('qlite1_online'), true)
})

test('no ICMP ping while offline', async (t) => {
	const inst = await setup(t, 1)
	await takeOffline(t, inst, 1)
	assert.deepEqual(last(inst), [InstanceStatus.ConnectionFailure, 'All Q-Lites offline'])

	inst.pingCalls.length = 0
	for (let i = 0; i < (3 * OFFLINE_QUERY_INTERVAL) / HEARTBEAT_INTERVAL; i++) await tick(t)
	assert.deepEqual(inst.pingCalls, [])
	assert.equal(queries(1).length, 3)
})

test('destroy() while offline leaves nothing running', async (t) => {
	const inst = await setup(t, 1)
	await takeOffline(t, inst, 1)
	await inst.destroy()
	sent.length = 0
	inst.pingCalls.length = 0

	await tick(t, 3 * OFFLINE_QUERY_INTERVAL)
	assert.deepEqual(sent, [])
	assert.deepEqual(inst.pingCalls, [])
	assert.equal(inst.pingMonitors.length, 0)
	assert.equal(inst.client, null)
})
