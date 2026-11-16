// While a Q-Lite is held: Ready and Go are blocked, and Auto Clear keeps the Hold
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { REPO, sent, makeConfig, createInstance, cleanup, oscPacket } = require('./harness')

afterEach(cleanup)

const int = (value) => ({ type: 'i', value })
const run = (inst, action, number) => inst.actions[action].callback({ options: { number: String(number) } })
const texts = () => sent.map((m) => m.text)
const onData = (inst, buffer) =>
	require(path.join(REPO, 'osc-feedback.js')).onDataHandler(inst, { address: '192.168.99.99', port: 8002 }, buffer)

async function setup(n = 1, overrides = {}) {
	const inst = await createInstance(makeConfig(n, overrides))
	sent.length = 0
	return inst
}

for (const hold of ['on', 'blink']) {
	test(`Ready and Go do nothing while hold is ${hold}`, async () => {
		const inst = await setup(1)
		inst.setVariableValues({ qlite1_status: 'ready', qlite1_hold: hold })

		await run(inst, 'ready', 1)
		await run(inst, 'go', 1)

		assert.deepEqual(texts(), [])
		assert.equal(inst.getVariableValue('qlite1_status'), 'ready')
		assert.equal(inst.getVariableValue('qlite1_hold'), hold)
		assert.equal(inst.logs.filter(([level, m]) => level === 'info' && /is held, ignoring/.test(m)).length, 2)
	})
}

test('Ready All and Go All skip held Q-Lites', async () => {
	const inst = await setup(3)
	await run(inst, 'hold', 2)
	sent.length = 0

	await run(inst, 'ready', 0)
	assert.deepEqual(texts().sort(), ['10.0.0.1:8000 /led/ready/solid 1', '10.0.0.3:8000 /led/ready/solid 3'])
	assert.equal(inst.getVariableValue('qlite2_status'), 'off')

	inst.setVariableValues({ qlite2_status: 'ready-confirmed' }) // held but Ready underneath
	sent.length = 0
	await run(inst, 'go', 0)
	assert.deepEqual(texts().sort(), ['10.0.0.1:8000 /led/go/solid 1', '10.0.0.3:8000 /led/go/solid 3'])
	assert.equal(inst.getVariableValue('qlite2_status'), 'ready-confirmed')
	assert.equal(inst.getVariableValue('qlite2_hold'), 'on')
})

test('Ready works again once Hold is released, and the earlier state is restored on release', async () => {
	const inst = await setup(1)
	await run(inst, 'ready', 1)
	await run(inst, 'hold', 1)
	await run(inst, 'go', 1) // blocked
	sent.length = 0

	await run(inst, 'hold', 1)
	assert.deepEqual(texts(), ['10.0.0.1:8000 /led/hold/off 1', '10.0.0.1:8000 /led/ready/solid 1'])

	sent.length = 0
	await run(inst, 'go', 1)
	assert.deepEqual(texts(), ['10.0.0.1:8000 /led/go/solid 1'])
	assert.equal(inst.getVariableValue('qlite1_status'), 'go-confirmed')
})

test('a blocked Go does not start Auto Clear', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
	const inst = await setup(1, { autoClear: true, autoClearTime: 5 })
	await run(inst, 'hold', 1)
	await run(inst, 'go', 1)
	assert.deepEqual(inst.autoClearTimers, {})
})

test('remote Ready/Go confirmations are ignored while held', async () => {
	const inst = await setup(2)
	inst.setVariableValues({
		qlite1_status: 'ready',
		qlite1_hold: 'on',
		qlite2_status: 'go',
		qlite2_hold: 'blink',
	})

	await onData(inst, oscPacket('/button/ready-confirmed', [int(1)]))
	await onData(inst, oscPacket('/button/go-confirmed', [int(2)]))

	assert.deepEqual(texts(), [])
	assert.equal(inst.getVariableValue('qlite1_status'), 'ready')
	assert.equal(inst.getVariableValue('qlite2_status'), 'go')
	assert.equal(inst.getVariableValue('latest_received_path'), '/button/go-confirmed', 'still recorded as received')
})

for (const hold of ['on', 'blink']) {
	test(`Auto Clear while hold is ${hold} keeps the Hold and clears the Go restored on release`, async (t) => {
		t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
		const inst = await setup(1, { autoClear: true, autoClearTime: 5 })
		await run(inst, 'go', 1)
		if (hold === 'on') await run(inst, 'hold', 1)
		else await onData(inst, oscPacket('/button/hold', [int(1)])) // remote hold
		assert.equal(inst.getVariableValue('qlite1_hold'), hold)
		sent.length = 0

		t.mock.timers.tick(5000)
		await Promise.resolve()
		assert.equal(inst.getVariableValue('qlite1_hold'), hold, 'Hold kept')
		assert.equal(inst.getVariableValue('qlite1_status'), 'off')
		assert.deepEqual(texts(), [], 'nothing sent while held')
		assert.deepEqual(inst.autoClearTimers, {})

		await run(inst, 'hold', 1)
		assert.equal(inst.getVariableValue('qlite1_hold'), 'off')
		assert.deepEqual(texts(), ['10.0.0.1:8000 /led/hold/off 1'], 'Go is not restored')
	})
}

test('Auto Clear after Hold is released clears as usual', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
	const inst = await setup(1, { autoClear: true, autoClearTime: 5 })
	await run(inst, 'go', 1)
	await run(inst, 'hold', 1)
	await run(inst, 'hold', 1) // released, Go restored
	sent.length = 0

	t.mock.timers.tick(5000)
	await Promise.resolve()
	assert.equal(inst.getVariableValue('qlite1_status'), 'off')
	assert.deepEqual(texts(), ['10.0.0.1:8000 /led/clear 1'])
})
