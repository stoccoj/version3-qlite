const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { sent, makeConfig, createInstance, cleanup } = require('./harness')

afterEach(cleanup)

const run = (inst, action, number) => inst.actions[action].callback({ options: { number: String(number) } })
const texts = () => sent.map((m) => m.text)

async function setup(n = 2, overrides = {}) {
	const inst = await createInstance(makeConfig(n, overrides))
	sent.length = 0
	return inst
}

test('Ready/Go/Clear send the right path and Q-Lite number without confirmation', async () => {
	const inst = await setup()

	await run(inst, 'ready', 2)
	assert.equal(inst.getVariableValue('qlite2_status'), 'ready-confirmed')
	await run(inst, 'go', 2)
	assert.equal(inst.getVariableValue('qlite2_status'), 'go-confirmed')
	await run(inst, 'clear', 2)
	assert.equal(inst.getVariableValue('qlite2_status'), 'off')

	assert.deepEqual(texts(), [
		'10.0.0.2:8000 /led/ready/solid 2',
		'10.0.0.2:8000 /led/go/solid 2',
		'10.0.0.2:8000 /led/clear 2',
	])
	assert.deepEqual(sent[0].args, [{ type: 'i', value: 2 }])
	assert.equal(inst.getVariableValue('qlite2_latest_sent_path'), '/led/clear')
})

test('Ready/Go blink when confirmation is requested', async () => {
	const inst = await setup(1, { 'qlite1-requestReadyConfirmation': true, 'qlite1-requestGoConfirmation': true })

	await run(inst, 'ready', 1)
	assert.equal(inst.getVariableValue('qlite1_status'), 'ready')
	await run(inst, 'go', 1)
	assert.equal(inst.getVariableValue('qlite1_status'), 'go')

	assert.deepEqual(texts(), ['10.0.0.1:8000 /led/ready/blink 1', '10.0.0.1:8000 /led/go/blink 1'])
})

test('Ready All and Clear All send once per Q-Lite', async () => {
	const inst = await setup(3)

	await run(inst, 'ready', 0)
	assert.deepEqual(texts().sort(), [
		'10.0.0.1:8000 /led/ready/solid 1',
		'10.0.0.2:8000 /led/ready/solid 2',
		'10.0.0.3:8000 /led/ready/solid 3',
	])

	sent.length = 0
	await run(inst, 'clear', 0)
	assert.deepEqual(texts().sort(), [
		'10.0.0.1:8000 /led/clear 1',
		'10.0.0.2:8000 /led/clear 2',
		'10.0.0.3:8000 /led/clear 3',
	])
})

test('Go All only fires Q-Lites in Ready', async () => {
	const inst = await setup(3, { 'qlite3-requestReadyConfirmation': true })
	await run(inst, 'ready', 1)
	await run(inst, 'ready', 3) // unconfirmed 'ready' still counts
	sent.length = 0

	await run(inst, 'go', 0)

	assert.deepEqual(texts().sort(), ['10.0.0.1:8000 /led/go/solid 1', '10.0.0.3:8000 /led/go/solid 3'])
	assert.equal(inst.getVariableValue('qlite2_status'), 'off')
})

test('releasing Hold restores the LED for each status', async () => {
	const cases = [
		['ready', '/led/ready/blink'],
		['ready-confirmed', '/led/ready/solid'],
		['go', '/led/go/blink'],
		['go-confirmed', '/led/go/solid'],
	]
	const inst = await setup(1)

	for (const [status, restore] of cases) {
		inst.setVariableValues({ qlite1_status: status, qlite1_hold: 'off' })
		await run(inst, 'hold', 1)
		assert.equal(inst.getVariableValue('qlite1_hold'), 'on')
		sent.length = 0
		await run(inst, 'hold', 1)
		assert.equal(inst.getVariableValue('qlite1_hold'), 'off')
		assert.deepEqual(texts(), ['10.0.0.1:8000 /led/hold/off 1', `10.0.0.1:8000 ${restore} 1`], status)
	}
})

test('releasing Hold while Off only turns the hold LED off', async () => {
	const inst = await setup(1)
	await run(inst, 'hold', 1)
	sent.length = 0
	await run(inst, 'hold', 1)
	assert.deepEqual(texts(), ['10.0.0.1:8000 /led/hold/off 1'])
})

test('a remote Hold (blink) is released by the Hold action', async () => {
	const inst = await setup(1)
	inst.setVariableValues({ qlite1_hold: 'blink' })
	await run(inst, 'hold', 1)
	assert.equal(inst.getVariableValue('qlite1_hold'), 'off')
})

test('Hold All with mixed states holds all, then releases all', async () => {
	const inst = await setup(3)
	await run(inst, 'hold', 1)
	inst.setVariableValues({ qlite2_hold: 'blink' })
	sent.length = 0

	await run(inst, 'hold', 0)
	// Already-held Q-Lites keep their state (a remote hold stays 'blink'); only the one that wasn't held is sent a message
	assert.deepEqual(
		[1, 2, 3].map((i) => inst.getVariableValue(`qlite${i}_hold`)),
		['on', 'blink', 'on'],
	)
	assert.deepEqual(texts(), ['10.0.0.3:8000 /led/hold/blink 3'])

	await run(inst, 'hold', 0)
	for (const i of [1, 2, 3]) assert.equal(inst.getVariableValue(`qlite${i}_hold`), 'off')
})

test('Clear also releases Hold', async () => {
	const inst = await setup(1)
	await run(inst, 'hold', 1)
	await run(inst, 'clear', 1)
	assert.equal(inst.getVariableValue('qlite1_hold'), 'off')
})

test('Auto Clear clears Go after the timeout', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
	const inst = await setup(1, { autoClear: true, autoClearTime: 5 })

	await run(inst, 'go', 1)
	t.mock.timers.tick(4999)
	assert.equal(inst.getVariableValue('qlite1_status'), 'go-confirmed')
	t.mock.timers.tick(1)
	await Promise.resolve()
	assert.equal(inst.getVariableValue('qlite1_status'), 'off')
	assert.deepEqual(inst.autoClearTimers, {})
	assert.equal(sent.at(-1).path, '/led/clear')
})

test('Auto Clear: Go, Clear, Go lasts the full timeout', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
	const inst = await setup(1, { autoClear: true, autoClearTime: 5 })

	await run(inst, 'go', 1)
	t.mock.timers.tick(3000)
	await run(inst, 'clear', 1)
	assert.deepEqual(inst.autoClearTimers, {}, 'timer cleared on Clear')
	await run(inst, 'go', 1)

	t.mock.timers.tick(3000) // first timer would have fired here
	assert.equal(inst.getVariableValue('qlite1_status'), 'go-confirmed')
	t.mock.timers.tick(2000)
	assert.equal(inst.getVariableValue('qlite1_status'), 'off')
})

test('Auto Clear uses 15 s when the time is invalid, and does nothing when disabled', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
	const inst = await setup(2, { autoClear: true, autoClearTime: 'abc' })

	await run(inst, 'go', 1)
	t.mock.timers.tick(14999)
	assert.equal(inst.getVariableValue('qlite1_status'), 'go-confirmed')
	t.mock.timers.tick(1)
	assert.equal(inst.getVariableValue('qlite1_status'), 'off')

	inst.config.autoClear = false
	await run(inst, 'go', 2)
	t.mock.timers.tick(60000)
	assert.equal(inst.getVariableValue('qlite2_status'), 'go-confirmed')
})
