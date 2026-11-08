const paths = require('./osc').paths

const DEFAULT_AUTO_CLEAR_SECONDS = 15

const isHeld = (hold) => hold === 'on' || hold === 'blink'

// LED path to restore when Hold is released, keyed by Q-Lite status
const restorePaths = {
	ready: paths.ready_blink,
	'ready-confirmed': paths.ready_solid,
	go: paths.go_blink,
	'go-confirmed': paths.go_solid,
}

const cancelAutoClear = function (root, qlite_number) {
	const key = String(qlite_number)
	if (root.autoClearTimers[key]) {
		clearTimeout(root.autoClearTimers[key])
		delete root.autoClearTimers[key]
	}
}

const handle_ready = async function (root, qlite_number) {
	const rc = root.config[`qlite${qlite_number}-requestReadyConfirmation`]
	root.log('debug', `Q-Lite #${qlite_number} Request Confirmation is set to ${rc}`)
	let path = rc ? paths.ready_blink : paths.ready_solid
	let status = rc ? 'ready' : 'ready-confirmed'

	root.setVariableValues({
		[`qlite${qlite_number}_status`]: status,
	})
	root.checkFeedbacks()
	await root.sendOscMessage(qlite_number, path)
}

const handle_go = async function (root, qlite_number) {
	const rc = root.config[`qlite${qlite_number}-requestGoConfirmation`]
	root.log('debug', `Q-Lite #${qlite_number} Request Confirmation is set to ${rc}`)
	let path = rc ? paths.go_blink : paths.go_solid
	let status = rc ? 'go' : 'go-confirmed'

	cancelAutoClear(root, qlite_number)

	root.setVariableValues({
		[`qlite${qlite_number}_status`]: status,
	})
	root.checkFeedbacks()
	await root.sendOscMessage(qlite_number, path)

	let autoClear = root.config[`autoClear`]
	root.log('debug', `Auto Clear is set to ${autoClear}`)
	if (autoClear === true || autoClear === 'true') {
		let autoClearTime = parseInt(root.config[`autoClearTime`])
		if (!Number.isInteger(autoClearTime) || autoClearTime <= 0) autoClearTime = DEFAULT_AUTO_CLEAR_SECONDS
		root.log(
			'debug',
			`Auto Clear is enabled, will clear Q-Lite #${qlite_number} in ${autoClearTime} seconds if still in 'go' state`,
		)
		root.autoClearTimers[String(qlite_number)] = setTimeout(() => {
			delete root.autoClearTimers[String(qlite_number)]
			let qlite_status = root.getVariableValue(`qlite${qlite_number}_status`)
			root.log('debug', `Auto Clear check for Q-Lite #${qlite_number}, status is ${qlite_status}`)
			if (qlite_status === 'go' || qlite_status === 'go-confirmed') {
				handle_clear(root, qlite_number).catch((err) => {
					root.log('error', `Auto Clear failed for Q-Lite #${qlite_number}: ${err.message}`)
				})
			}
		}, autoClearTime * 1000)
	}
}

const handle_clear = async function (root, qlite_number) {
	cancelAutoClear(root, qlite_number)
	root.setVariableValues({
		[`qlite${qlite_number}_hold`]: 'off',
		[`qlite${qlite_number}_status`]: 'off',
	})
	root.checkFeedbacks()
	await root.sendOscMessage(qlite_number, paths.clear)
}

// Set Hold on or off for a single Q-Lite. Releasing Hold restores the Ready/Go LED state.
const set_hold = async function (root, qlite_number, hold_on) {
	const qlite_status = root.getVariableValue(`qlite${qlite_number}_status`)
	const qlite_hold = hold_on ? 'on' : 'off'
	root.log('debug', `Q-Lite #${qlite_number} hold is now ${qlite_hold}`)
	root.setVariableValues({
		[`qlite${qlite_number}_hold`]: qlite_hold,
	})
	root.checkFeedbacks()

	if (hold_on) {
		await root.sendOscMessage(qlite_number, paths.hold_blink)
	} else {
		await root.sendOscMessage(qlite_number, paths.hold_off)
		const restore = restorePaths[qlite_status]
		if (restore) {
			await root.sendOscMessage(qlite_number, restore)
		}
	}
}

const handle_hold = async function (root, qlite_number) {
	const current_qlite_hold = root.getVariableValue(`qlite${qlite_number}_hold`)
	root.log('debug', `Q-Lite #${qlite_number} hold is currently ${current_qlite_hold}`)
	await set_hold(root, qlite_number, !isHeld(current_qlite_hold))
}

module.exports = {
	initActions: function () {
		let self = this // required to have reference to outer `this`
		let actions = {}
		const actionButtons = self.buttons.filter((btn) => btn.id !== '0')

		const qliteOption = {
			type: 'dropdown',
			label: 'Q-Lite #',
			choices: self.buttons,
			id: 'number',
			default: '1',
		}

		actions.ready = {
			name: 'Set the Q-Lite state to Ready',
			options: [qliteOption],
			callback: async (event) => {
				if (event.options.number === '0') {
					await Promise.all(actionButtons.map((qlite) => handle_ready(self, qlite.id)))
				} else {
					await handle_ready(self, event.options.number)
				}
			},
		}

		actions.go = {
			name: 'Set the Q-Lite state to Go',
			options: [qliteOption],
			callback: async (event) => {
				if (event.options.number === '0') {
					const ready = actionButtons.filter((qlite) => {
						const status = self.getVariableValue(`qlite${qlite.id}_status`)
						return status === 'ready' || status === 'ready-confirmed'
					})
					await Promise.all(ready.map((qlite) => handle_go(self, qlite.id)))
				} else {
					await handle_go(self, event.options.number)
				}
			},
		}

		actions.clear = {
			name: 'Set the Q-Lite state to Off',
			options: [qliteOption],
			callback: async (event) => {
				if (event.options.number === '0') {
					await Promise.all(actionButtons.map((qlite) => handle_clear(self, qlite.id)))
				} else {
					await handle_clear(self, event.options.number)
				}
			},
		}

		actions.hold = {
			name: 'Set the Q-Lite state to Hold',
			options: [qliteOption],
			callback: async (event) => {
				if (event.options.number === '0') {
					// If any Q-Lite is not held, hold them all; otherwise release them all
					const notHeld = actionButtons.filter((qlite) => !isHeld(self.getVariableValue(`qlite${qlite.id}_hold`)))
					if (notHeld.length > 0) {
						await Promise.all(notHeld.map((qlite) => set_hold(self, qlite.id, true)))
					} else {
						await Promise.all(actionButtons.map((qlite) => set_hold(self, qlite.id, false)))
					}
				} else {
					await handle_hold(self, event.options.number)
				}
			},
		}

		self.setActionDefinitions(actions)
	},
}
