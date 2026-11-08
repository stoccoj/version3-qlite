const style = require('./styles')

// Ready/Go are hidden while Hold is active (set from Companion or requested by the remote station)
const isHeld = (hold) => hold !== undefined && hold !== 'off'

module.exports = {
	initFeedbacks() {
		let self = this
		let feedbacks = {}
		const feedbackButtons = self.buttons.filter((btn) => btn.id !== '0') // Exclude 'All' option

		// Feedbacks read this connection's own variables, so they work whatever the connection is named.
		// getVariableValue does not trigger feedback re-checks, so state changes call checkFeedbacks() explicitly.
		const qliteOption = {
			type: 'dropdown',
			label: 'Q-Lite #',
			choices: feedbackButtons,
			id: 'number',
			default: '1',
		}

		feedbacks.ready = {
			type: 'advanced',
			name: 'Q-Lite state is Ready',
			description: 'Indicates if the Q-Lite state is set to Ready',
			defaultStyle: style.ready,
			options: [qliteOption],
			callback: (feedback) => {
				const qliteNumber = feedback.options.number

				const status = self.getVariableValue(`qlite${qliteNumber}_status`)
				const hold_status = self.getVariableValue(`qlite${qliteNumber}_hold`)
				const online = self.getVariableValue(`qlite${qliteNumber}_online`)

				if (online === false || online === 'false') {
					return style.hold
				}
				if (isHeld(hold_status)) {
					return style.off
				}
				if (status === 'ready') {
					return self.boolValue ? style.ready : style.off
				}
				if (status === 'ready-confirmed') {
					return style.ready
				}

				return style.off
			},
		}

		feedbacks.go = {
			type: 'advanced',
			name: 'Use for Q-Lite Go button',
			description: 'Turns button green when Q-Lite is set to Go',
			defaultStyle: style.go,
			options: [qliteOption],
			callback: (feedback) => {
				const qliteNumber = feedback.options.number

				const status = self.getVariableValue(`qlite${qliteNumber}_status`)
				const hold_status = self.getVariableValue(`qlite${qliteNumber}_hold`)

				if (isHeld(hold_status)) {
					return style.off
				}
				if (status === 'go') {
					return self.boolValue ? style.go : style.off
				}
				if (status === 'go-confirmed') {
					return style.go
				}

				return style.off
			},
		}

		feedbacks.hold = {
			type: 'advanced',
			name: 'Use for Q-Lite Hold button',
			description: 'Turns button red when Q-Lite is set to Hold',
			defaultStyle: style.off,
			options: [qliteOption],
			callback: (feedback) => {
				const qliteNumber = feedback.options.number
				const hold_status = self.getVariableValue(`qlite${qliteNumber}_hold`)

				if (hold_status === 'blink') {
					return self.boolValue ? style.hold : style.off
				}

				return hold_status === 'on' ? style.hold : style.off
			},
		}

		self.setFeedbackDefinitions(feedbacks)
	},
}
