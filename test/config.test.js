const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { InstanceStatus, sent, makeConfig, createInstance, cleanup, flush, getFreePort } = require('./harness')

afterEach(cleanup)

test('changing the number of Q-Lites 2 -> 3 -> 2 leaves no duplicates', async () => {
	const inst = await createInstance(makeConfig(2))
	await inst.configUpdated(makeConfig(3))
	await inst.configUpdated(makeConfig(2))

	assert.deepEqual(
		inst.buttons.map((b) => b.id),
		['0', '1', '2'],
	)
	assert.deepEqual(
		inst.actions.ready.options[0].choices.map((c) => c.id),
		['0', '1', '2'],
	)
	assert.deepEqual(
		inst.feedbacks.ready.options[0].choices.map((c) => c.id),
		['1', '2'],
	)

	const ids = inst.varDefs.map((v) => v.variableId)
	assert.equal(new Set(ids).size, ids.length, 'variable ids are unique')
	assert.ok(ids.includes('qlite2_status'))
	assert.ok(!ids.includes('qlite3_status'))

	assert.equal(inst.pingMonitors.length, 2)
})

test('defaults are set on first load', async () => {
	const inst = await createInstance(makeConfig(2, { rate: 750 }))
	for (const i of [1, 2]) {
		assert.equal(inst.getVariableValue(`qlite${i}_status`), 'off')
		assert.equal(inst.getVariableValue(`qlite${i}_hold`), 'off')
	}
	assert.equal(inst.getVariableValue('rate'), 750)
})

test('saving the config keeps existing state', async () => {
	const config = makeConfig(2)
	const inst = await createInstance(config)
	await inst.actions.ready.callback({ options: { number: '1' } })
	await inst.actions.hold.callback({ options: { number: '2' } })

	await inst.configUpdated({ ...config })

	assert.equal(inst.getVariableValue('qlite1_status'), 'ready-confirmed')
	assert.equal(inst.getVariableValue('qlite2_hold'), 'on')
})

test('missing Q-Lite #1 host is BadConfig', async () => {
	const inst = await createInstance(makeConfig(1, { 'qlite1-host': '' }))
	assert.equal(inst.statusLog.at(-1)[0], InstanceStatus.BadConfig)
	assert.equal(inst.pingMonitors.length, 0)
})

test('listen enabled with no feedback port is BadConfig', async () => {
	const inst = await createInstance(makeConfig(1, { listen: true, feedbackPort: '' }))
	assert.equal(inst.statusLog.at(-1)[0], InstanceStatus.BadConfig)
	assert.match(inst.statusLog.at(-1)[1], /Feedback Port/)
	assert.equal(inst.client, null)
})

test('Q-Lite #2 with an empty host is skipped', async () => {
	const inst = await createInstance(makeConfig(2, { 'qlite2-host': '' }))
	await flush()
	assert.equal(inst.pingMonitors.length, 1)
	assert.equal(inst.resolvedHosts[2], undefined)
	assert.equal(inst.getVariableValue('qlite2_online'), false)
	assert.equal(inst.statusLog.at(-1)[0], InstanceStatus.Ok)

	sent.length = 0
	await inst.actions.clear.callback({ options: { number: '0' } })
	assert.deepEqual(
		sent.map((m) => m.host),
		['10.0.0.1'],
	)
})

test('hostnames are resolved and unresolvable ones give a Warning', async () => {
	const inst = await createInstance(
		makeConfig(2, { 'qlite1-host': 'localhost', 'qlite2-host': 'no-such-qlite.invalid' }),
	)
	await flush()
	assert.equal(inst.resolvedHosts[1], '127.0.0.1')
	assert.equal(inst.resolvedHosts[2], undefined)
	assert.deepEqual(inst.pingCalls, ['127.0.0.1'])

	const [status, message] = inst.statusLog.at(-1)
	assert.equal(status, InstanceStatus.UnknownWarning)
	assert.equal(message, 'Unable to resolve Q-Lite #2')
})

test('destroy clears monitors, listener, auto-clear timers and blink interval', async () => {
	const port = await getFreePort()
	const inst = await createInstance(makeConfig(2, { listen: true, feedbackPort: String(port), autoClear: true }))
	assert.ok(inst.client?.isConnected())
	await inst.actions.go.callback({ options: { number: '1' } })
	assert.equal(Object.keys(inst.autoClearTimers).length, 1)
	assert.notEqual(inst.INTERVAL, null)

	await inst.destroy()

	assert.equal(inst.pingMonitors.length, 0)
	assert.equal(inst.client, null)
	assert.deepEqual(inst.autoClearTimers, {})
	assert.equal(inst.INTERVAL, null)
})
