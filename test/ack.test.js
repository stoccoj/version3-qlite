// Lost-command re-send: /led/* commands are re-sent until the Q-Lite echoes them back
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { REPO, sent, makeConfig, createInstance, cleanup, oscPacket, getFreePort } = require('./harness')

afterEach(cleanup)

const ACK_TIMEOUT = 300

const int = (value) => ({ type: 'i', value })
const str = (value) => ({ type: 's', value })

const settle = async () => {
	for (let i = 0; i < 5; i++) await Promise.resolve()
}

// Load after createInstance so it shares the freshly loaded modules
const onData = (inst, buffer, address = '10.0.0.1') =>
	require(path.join(REPO, 'osc-feedback.js')).onDataHandler(inst, { address, port: 8002 }, buffer)

const echo = (inst, n, oscPath) => onData(inst, oscPacket(oscPath, [int(n)]), `10.0.0.${n}`)
const sendsOf = (oscPath, n = 1) => sent.filter((m) => m.path === oscPath && m.host === `10.0.0.${n}`).length
const warnings = (inst) => inst.logs.filter(([level, m]) => level === 'warn' && /did not acknowledge/.test(m))

async function setup(t, n = 1, { listen = true, echoed = true } = {}) {
	const feedback = listen ? { listen: true, feedbackPort: String(await getFreePort()) } : {}
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 })
	const inst = await createInstance(makeConfig(n, feedback))
	await settle()
	// The echo of the /online sent at startup shows the Q-Lite echoes commands
	if (echoed) for (let i = 1; i <= n; i++) await echo(inst, i, '/online')
	sent.length = 0
	return inst
}

// Advance in steps of at most ACK_TIMEOUT: a timeout scheduled by a callback doesn't run in the same tick() call
async function tick(t, ms = ACK_TIMEOUT) {
	while (ms > 0) {
		const step = Math.min(ms, ACK_TIMEOUT)
		t.mock.timers.tick(step)
		await settle()
		ms -= step
	}
}

const ready = (inst, n = '1') => inst.actions.ready.callback({ options: { number: n } })
const go = (inst, n = '1') => inst.actions.go.callback({ options: { number: n } })

test('an echo clears the pending command', async (t) => {
	const inst = await setup(t)
	assert.equal(inst.ackCapable[1], true)

	await ready(inst)
	assert.equal(inst.pendingAcks[1]?.path, '/led/ready/solid')
	await echo(inst, 1, '/led/ready/solid')
	assert.equal(inst.pendingAcks[1], undefined)

	await tick(t, 5 * ACK_TIMEOUT)
	assert.equal(sendsOf('/led/ready/solid'), 1)
	assert.equal(warnings(inst).length, 0)
})

test('no echo -> 3 re-sends 300 ms apart, then a warning', async (t) => {
	const inst = await setup(t)
	await ready(inst)
	const seq = inst.lastCommandSeq[1]
	const sentAt = inst.getVariableValue('qlite1_latest_sent_timestamp')
	assert.equal(sendsOf('/led/ready/solid'), 1)

	await tick(t, ACK_TIMEOUT - 1)
	assert.equal(sendsOf('/led/ready/solid'), 1)
	for (let retry = 1; retry <= 3; retry++) {
		await tick(t, retry === 1 ? 1 : ACK_TIMEOUT)
		assert.equal(sendsOf('/led/ready/solid'), 1 + retry, `retry ${retry}`)
		assert.deepEqual(sent.at(-1).args, [int(1)])
	}
	assert.equal(warnings(inst).length, 0)

	await tick(t)
	assert.equal(warnings(inst).length, 1)
	assert.equal(inst.pendingAcks[1], undefined)

	await tick(t, 10 * ACK_TIMEOUT)
	assert.equal(sendsOf('/led/ready/solid'), 4, 'gives up after 3 re-sends')
	// Retries are sent directly: they don't move the stale-reply mark or the latest_sent variables
	assert.equal(inst.lastCommandSeq[1], seq)
	assert.equal(inst.getVariableValue('qlite1_latest_sent_timestamp'), sentAt)
})

test('an echo after a re-send stops the re-sending', async (t) => {
	const inst = await setup(t)
	await go(inst)
	await tick(t)
	assert.equal(sendsOf('/led/go/solid'), 2)
	await echo(inst, 1, '/led/go/solid')
	await tick(t, 5 * ACK_TIMEOUT)
	assert.equal(sendsOf('/led/go/solid'), 2)
	assert.equal(warnings(inst).length, 0)
})

test('a newer command cancels the retries of the older one', async (t) => {
	const inst = await setup(t)
	await ready(inst)
	await tick(t, ACK_TIMEOUT / 2)
	await go(inst)
	assert.equal(inst.pendingAcks[1].path, '/led/go/solid')

	// A late echo of the old command doesn't clear the new one
	await echo(inst, 1, '/led/ready/solid')
	assert.equal(inst.pendingAcks[1].path, '/led/go/solid')

	await tick(t, 5 * ACK_TIMEOUT)
	assert.equal(sendsOf('/led/ready/solid'), 1, 'old command never re-sent')
	assert.equal(sendsOf('/led/go/solid'), 4)
	assert.equal(warnings(inst).length, 1)
})

test('Q-Lites are tracked independently', async (t) => {
	const inst = await setup(t, 2)
	await ready(inst, '0')
	await echo(inst, 2, '/led/ready/solid')
	await tick(t, 5 * ACK_TIMEOUT)
	assert.equal(sendsOf('/led/ready/solid', 1), 4)
	assert.equal(sendsOf('/led/ready/solid', 2), 1)
})

test('an echo must carry the Q-Lite number to count', async (t) => {
	const inst = await setup(t, 2)
	await ready(inst, '1')
	await onData(inst, oscPacket('/led/ready/solid', [int(2)]), '10.0.0.1') // another Q-Lite's number
	await onData(inst, oscPacket('/led/ready/solid'), '10.0.0.1') // no number, matched by address only
	assert.equal(inst.pendingAcks[1]?.path, '/led/ready/solid')
})

test('no tracking before an echo has been seen from that Q-Lite', async (t) => {
	const inst = await setup(t, 1, { echoed: false })
	await ready(inst)
	assert.equal(inst.pendingAcks[1], undefined)
	await tick(t, 5 * ACK_TIMEOUT)
	assert.equal(sendsOf('/led/ready/solid'), 1)

	// A /led/* echo also enables it
	await echo(inst, 1, '/led/ready/solid')
	await go(inst)
	assert.equal(inst.pendingAcks[1]?.path, '/led/go/solid')
})

test('no tracking with Listen for Feedback off', async (t) => {
	const inst = await setup(t, 1, { listen: false })
	assert.equal(inst.ackCapable[1], true, 'echo handled directly, but the listener is not running')
	await ready(inst)
	assert.equal(inst.pendingAcks[1], undefined)
	await tick(t, 5 * ACK_TIMEOUT)
	assert.equal(sendsOf('/led/ready/solid'), 1)
})

test('heartbeat replies do not change state while a command is unacknowledged', async (t) => {
	const inst = await setup(t)
	await tick(t, 1900)
	await ready(inst) // no echo yet...
	await tick(t, 100) // ...when the next query (sent after the command) goes out
	assert.ok(inst.pendingAcks[1])
	assert.ok(inst.querySeq[1] > inst.lastCommandSeq[1])
	sent.length = 0

	await onData(inst, oscPacket('/status', [int(1), int(inst.querySeq[1]), str('off'), str('off'), str('off'), int(9)]))
	assert.equal(inst.getVariableValue('qlite1_status'), 'ready-confirmed')
	assert.equal(sendsOf('/led/ready/solid'), 0, 'no push on top of the retries')
	assert.equal(inst.getVariableValue('qlite1_online'), true)
})

test('a config save forgets echo support and cancels pending re-sends', async (t) => {
	const inst = await setup(t)
	await ready(inst)
	await inst.configUpdated({ ...inst.config })
	await settle()
	assert.deepEqual(inst.pendingAcks, {})
	assert.deepEqual(inst.ackCapable, {})
	sent.length = 0
	await tick(t, 5 * ACK_TIMEOUT)
	assert.equal(sendsOf('/led/ready/solid'), 0)
})

test('destroy() cancels pending re-sends', async (t) => {
	const inst = await setup(t, 2)
	await ready(inst, '0')
	assert.equal(Object.keys(inst.pendingAcks).length, 2)
	await inst.destroy()
	assert.deepEqual(inst.pendingAcks, {})
	sent.length = 0
	await tick(t, 10 * ACK_TIMEOUT)
	assert.deepEqual(sent, [])
	assert.equal(warnings(inst).length, 0)
})
