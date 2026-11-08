// Overall connection status from config checks + ping results
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { InstanceStatus, makeConfig, createInstance, cleanup } = require('./harness')

afterEach(cleanup)

const PING_INTERVAL = 10000

// Let resolved stub pings deliver their results (mocked timers don't affect promise jobs)
const settle = async () => {
	for (let i = 0; i < 5; i++) await Promise.resolve()
}

async function setup(t, n, pingMap = {}, overrides = {}) {
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
	const inst = await createInstance(makeConfig(n, overrides), { pingMap })
	await settle()
	return inst
}

async function nextPing(t, inst) {
	t.mock.timers.tick(PING_INTERVAL)
	await settle()
}

const last = (inst) => inst.statusLog.at(-1)

test('all online -> OK', async (t) => {
	const inst = await setup(t, 3)
	assert.deepEqual(last(inst), [InstanceStatus.Ok, null])
	assert.equal(inst.getVariableValue('qlite3_online'), true)
})

test('one offline -> Warning naming it', async (t) => {
	const inst = await setup(t, 3, { '10.0.0.2': false })
	assert.deepEqual(last(inst), [InstanceStatus.UnknownWarning, 'Q-Lite #2 offline'])
})

test('several offline are listed in order', async (t) => {
	const inst = await setup(t, 3, { '10.0.0.3': false, '10.0.0.2': false })
	assert.deepEqual(last(inst), [InstanceStatus.UnknownWarning, 'Q-Lite #2, #3 offline'])
})

test('all offline -> ConnectionFailure, then recovers to OK', async (t) => {
	const pingMap = { '10.0.0.1': false, '10.0.0.2': false }
	const inst = await setup(t, 2, pingMap)
	assert.deepEqual(last(inst), [InstanceStatus.ConnectionFailure, 'All Q-Lites offline'])

	pingMap['10.0.0.1'] = true
	await nextPing(t, inst)
	assert.deepEqual(last(inst), [InstanceStatus.UnknownWarning, 'Q-Lite #2 offline'])

	pingMap['10.0.0.2'] = true
	await nextPing(t, inst)
	assert.deepEqual(last(inst), [InstanceStatus.Ok, null])
})

test('goes offline on a later ping', async (t) => {
	const pingMap = {}
	const inst = await setup(t, 2, pingMap)
	assert.deepEqual(last(inst), [InstanceStatus.Ok, null])

	pingMap['10.0.0.2'] = false
	await nextPing(t, inst)
	assert.deepEqual(last(inst), [InstanceStatus.UnknownWarning, 'Q-Lite #2 offline'])
	assert.equal(inst.getVariableValue('qlite2_online'), false)
})

test('Q-Lites that have not answered yet are not counted', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
	const inst = await createInstance(null)
	const pending = {}
	inst.pingHost = (ip) => new Promise((resolve) => (pending[ip] = resolve))
	await inst.init(makeConfig(2))
	assert.deepEqual(last(inst), [InstanceStatus.Ok, null])

	pending['10.0.0.1'](false)
	await settle()
	// #2 unknown, so this is "all known offline"
	assert.deepEqual(last(inst), [InstanceStatus.ConnectionFailure, 'All Q-Lites offline'])

	pending['10.0.0.2'](true)
	await settle()
	assert.deepEqual(last(inst), [InstanceStatus.UnknownWarning, 'Q-Lite #1 offline'])
})

test('nothing known yet keeps the config status', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
	const inst = await createInstance(null)
	inst.pingHost = () => new Promise(() => {})
	await inst.init(makeConfig(2))
	await settle()
	assert.deepEqual(last(inst), [InstanceStatus.Ok, null])
})

test('the unresolved-host warning is combined with the offline one', async (t) => {
	const inst = await setup(t, 3, { '10.0.0.1': false }, { 'qlite3-host': 'no-such-qlite.invalid' })
	assert.deepEqual(last(inst), [InstanceStatus.UnknownWarning, 'Unable to resolve Q-Lite #3; Q-Lite #1 offline'])
})

test('the unresolved-host warning alone when all resolved Q-Lites are online', async (t) => {
	const inst = await setup(t, 2, {}, { 'qlite2-host': 'no-such-qlite.invalid' })
	assert.deepEqual(last(inst), [InstanceStatus.UnknownWarning, 'Unable to resolve Q-Lite #2'])
})

test('BadConfig is not overridden by ping results', async (t) => {
	const inst = await setup(t, 2, { '10.0.0.1': false }, { listen: true, feedbackPort: '' })
	assert.equal(last(inst)[0], InstanceStatus.BadConfig)
	await nextPing(t, inst)
	assert.equal(last(inst)[0], InstanceStatus.BadConfig)
	assert.ok(inst.pingCalls.length >= 4, 'monitors still run')
})

test('no duplicate updateStatus calls when nothing changes', async (t) => {
	const inst = await setup(t, 2, { '10.0.0.2': false })
	const count = inst.statusLog.length
	await nextPing(t, inst)
	await nextPing(t, inst)
	await nextPing(t, inst)
	assert.equal(inst.statusLog.length, count)
})

test('a config save re-sends the status and forgets old ping results', async (t) => {
	const pingMap = { '10.0.0.2': false }
	const inst = await setup(t, 2, pingMap)
	assert.deepEqual(last(inst), [InstanceStatus.UnknownWarning, 'Q-Lite #2 offline'])

	// Reduce to one Q-Lite: #2's old result must not count
	await inst.configUpdated(makeConfig(1))
	await settle()
	assert.deepEqual(last(inst), [InstanceStatus.Ok, null])
	assert.deepEqual(inst.pingResults, { 1: true })
})

test("a stopped monitor's late result is ignored", async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
	const inst = await createInstance(null)
	const pending = []
	inst.pingHost = () => new Promise((resolve) => pending.push(resolve))
	await inst.init(makeConfig(1))
	assert.equal(pending.length, 1)

	inst.stopPingMonitors()
	pending[0](false)
	await settle()

	assert.deepEqual(inst.pingResults, {})
	assert.equal(inst.getVariableValue('qlite1_online'), false) // still the default, not from the late ping
	assert.deepEqual(last(inst), [InstanceStatus.Ok, null])
})

test('a ping that rejects counts as offline', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
	const inst = await createInstance(null)
	inst.pingHost = () => Promise.reject(new Error('boom'))
	await inst.init(makeConfig(1))
	await settle()
	assert.deepEqual(last(inst), [InstanceStatus.ConnectionFailure, 'All Q-Lites offline'])
})
