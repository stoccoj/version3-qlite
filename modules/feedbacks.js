const { Regex, combineRgb } = require('@companion-module/base')
const { evaluateComparison, parseArguments } = require('../helpers')
const style = require('./styles')

module.exports = {
	initFeedbacks() {
		let self = this
		let feedbacks = {}
		const feedbackButtons = self.buttons.filter((btn) => btn.id !== '0') // Exclude 'All' option

		feedbacks.ready = {
			type: 'advanced',
			name: 'Q-Lite state is Ready',
			description: 'Indicates if the Q-Lite state is set to Ready',
			defaultStyle: style.ready,
			options: [
				{
					type: 'dropdown',
					label: 'Q-Lite #',
					choices: feedbackButtons,
					id: 'number',
					default: '1',
				},
			],
			callback: async (feedback, context) => {
				const qliteNumber = feedback.options.number

				const status = await context.parseVariablesInString(`$(qlite:qlite${qliteNumber}_status)`)
				const hold_status = await context.parseVariablesInString(`$(qlite:qlite${qliteNumber}_hold)`)
				const online = await context.parseVariablesInString(`$(qlite:qlite${qliteNumber}_online)`)
				const isReady = status === 'ready' && hold_status !== 'on'
				const isReadyConfirmed = status === 'ready-confirmed' && hold_status !== 'on'

				/** Can be used to dynamically set colors based on config
        const readyColor = {
          color: self.config[`qlite${qliteNumber}-readyTxtColor`],
          bgcolor: self.config[`qlite${qliteNumber}-readyBgColor`],
        }
        **/

				if (online === 'false') {
					return style.hold
				}
				if (isReady) {
					return self.boolValue ? style.ready : style.off
				}
				if (isReadyConfirmed) {
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
			options: [
				{
					type: 'dropdown',
					label: 'Q-Lite #',
					choices: feedbackButtons,
					id: 'number',
					default: '1',
				},
			],
			callback: async (feedback, context) => {
				const qliteNumber = feedback.options.number

				const status = await context.parseVariablesInString(`$(qlite:qlite${qliteNumber}_status)`)
				const hold_status = await context.parseVariablesInString(`$(qlite:qlite${qliteNumber}_hold)`)
				const isGo = status === 'go' && hold_status !== 'on'
				const isGoConfirmed = status === 'go-confirmed' && hold_status !== 'on'

				/** Can be used to dynamically set colors based on config
        const goColor = {
          color: self.config[`qlite${qliteNumber}-goTxtColor`],
          bgcolor: self.config[`qlite${qliteNumber}-goBgColor`],
        }
        **/

				if (isGo) {
					return self.boolValue ? style.go : style.off
				}
				if (isGoConfirmed) {
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
			options: [
				{
					type: 'dropdown',
					label: 'Q-Lite #',
					choices: feedbackButtons,
					id: 'number',
					default: '1',
				},
			],
			callback: async (feedback, context) => {
				const qliteNumber = feedback.options.number

				const hold_status = await context.parseVariablesInString(`$(qlite:qlite${qliteNumber}_hold)`)

				/** Can be used to dynamically set colors based on config
         const goColor = {
         color: self.config[`qlite${qliteNumber}-goTxtColor`],
         bgcolor: self.config[`qlite${qliteNumber}-goBgColor`],
         }
         **/

				const isBlink = hold_status === 'blink'
				if (isBlink) {
					return self.boolValue ? style.hold : style.off
				}

				return hold_status === 'on' ? style.hold : style.off
			},
		}

		self.setFeedbackDefinitions(feedbacks)
	},
}
