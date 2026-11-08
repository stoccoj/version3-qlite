// Button feedback styles
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { REPO, makeConfig, createInstance, cleanup } = require('./harness')

let inst
let style

before(async () => {
	inst = await createInstance(makeConfig(1))
	inst.stopInterval() // boolValue is set by hand below
	style = require(path.join(REPO, 'modules/styles.js'))
})
after(cleanup)

const STATUSES = ['off', 'ready', 'ready-confirmed', 'go', 'go-confirmed']
const HOLDS = ['off', 'on', 'blink']

function check(feedback, { status = 'off', hold = 'off', online = true, blink = true }) {
	inst.setVariableValues({ qlite1_status: status, qlite1_hold: hold, qlite1_online: online })
	inst.boolValue = blink
	return inst.feedbacks[feedback].callback({ options: { number: '1' } })
}

// Expected styles, written out independently of the implementation
function expectedReady({ status, hold, online, blink }) {
	if (online === false || online === 'false') return style.hold
	if (hold !== 'off') return style.off
	if (status === 'ready') return blink ? style.ready : style.off
	if (status === 'ready-confirmed') return style.ready
	return style.off
}

function expectedGo({ status, hold, blink }) {
	if (hold !== 'off') return style.off
	if (status === 'go') return blink ? style.go : style.off
	if (status === 'go-confirmed') return style.go
	return style.off
}

function expectedHold({ hold, blink }) {
	if (hold === 'blink') return blink ? style.hold : style.off
	return hold === 'on' ? style.hold : style.off
}

const combinations = []
for (const status of STATUSES) {
	for (const hold of HOLDS) {
		for (const online of [true, false, 'false']) {
			for (const blink of [true, false]) {
				combinations.push({ status, hold, online, blink })
			}
		}
	}
}

test('ready feedback for every status/hold/online/blink combination', () => {
	for (const c of combinations) {
		assert.deepEqual(check('ready', c), expectedReady(c), JSON.stringify(c))
	}
})

test('go feedback for every status/hold/blink combination', () => {
	for (const c of combinations) {
		assert.deepEqual(check('go', c), expectedGo(c), JSON.stringify(c))
	}
})

test('hold feedback for every hold/blink combination', () => {
	for (const c of combinations) {
		assert.deepEqual(check('hold', c), expectedHold(c), JSON.stringify(c))
	}
})

test('spot checks', () => {
	assert.deepEqual(check('ready', { status: 'ready-confirmed', online: false }), style.hold, 'offline -> red')
	assert.deepEqual(check('go', { status: 'go-confirmed', hold: 'blink' }), style.off, 'Go hidden during remote hold')
	assert.deepEqual(check('ready', { status: 'ready-confirmed', hold: 'blink' }), style.off, 'Ready hidden during hold')
	assert.deepEqual(check('go', { status: 'go', blink: true }), style.go)
	assert.deepEqual(check('go', { status: 'go', blink: false }), style.off)
	assert.deepEqual(check('hold', { hold: 'blink', blink: true }), style.hold)
	assert.deepEqual(check('hold', { hold: 'blink', blink: false }), style.off)
	assert.deepEqual(check('ready', { status: 'ready', online: undefined }), style.ready, 'unknown online is not offline')
	assert.deepEqual(check('go', { status: 'go-confirmed', hold: undefined }), style.go, 'unset hold is not held')
})
