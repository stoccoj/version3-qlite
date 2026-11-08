// Blink timing and fallbacks for missing/invalid settings
const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { makeConfig, createInstance, cleanup } = require('./harness')

afterEach(cleanup)

// Record the times (ms from start) at which boolValue flips
async function flips(t, overrides, duration) {
	t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
	const inst = await createInstance(makeConfig(1, overrides))
	const times = []
	let previous = inst.boolValue
	for (let ms = 1; ms <= duration; ms++) {
		t.mock.timers.tick(1)
		if (inst.boolValue !== previous) {
			times.push(ms)
			previous = inst.boolValue
		}
	}
	return times
}

for (const rate of [undefined, '', 'abc', 0, 50, -1]) {
	test(`rate ${JSON.stringify(rate)} falls back to 1000 ms`, async (t) => {
		assert.deepEqual(await flips(t, { rate }, 3500), [1000, 2000, 3000])
	})
}

test('a valid rate is used', async (t) => {
	assert.deepEqual(await flips(t, { rate: 250 }, 1000), [250, 500, 750, 1000])
})

test('a numeric string rate is used', async (t) => {
	assert.deepEqual(await flips(t, { rate: '400' }, 1000), [400, 800])
})

for (const value of [undefined, '', 'abc', 0]) {
	test(`custom on/off ${JSON.stringify(value)} falls back to 1000/500 ms`, async (t) => {
		// The first flip happens immediately (turning on), then on for 1000 ms, off for 500 ms
		assert.deepEqual(
			await flips(t, { specifyCustomOnOff: true, onTime: value, offTime: value }, 3100),
			[1000, 1500, 2500, 3000],
		)
	})
}

test('valid custom on/off times are used', async (t) => {
	assert.deepEqual(await flips(t, { specifyCustomOnOff: true, onTime: 300, offTime: 200 }, 1000), [300, 500, 800, 1000])
})
