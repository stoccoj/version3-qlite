module.exports = {
	initVariables() {
		let self = this

		const variables = [
			{ variableId: 'latest_received_timestamp', name: 'Latest OSC message received timestamp' },
			{ variableId: 'latest_received_raw', name: 'Latest OSC message received' },
			{ variableId: 'latest_received_path', name: 'Latest OSC command received' },
			{ variableId: 'latest_received_client', name: 'Latest OSC message received client (UDP only)' },
			{ variableId: 'latest_received_port', name: 'Latest OSC message received port (UDP only)' },
			{ variableId: 'latest_received_args', name: 'Latest OSC arguments received array.' },
			{ variableId: 'latest_received_qlite_number', name: 'Latest OSC message received from Q-Lite' },
		]

		self.buttons.forEach((qlite) => {
			if (qlite.id !== '0') {
				variables.push({
					variableId: 'qlite' + qlite.id + '_online',
					name: 'Q-Lite #' + qlite.label + ' Online Status (true, false)',
				})
				variables.push({
					variableId: 'qlite' + qlite.id + '_status',
					name: 'Q-Lite #' + qlite.label + ' Status (ready, go)',
				})
				variables.push({
					variableId: 'qlite' + qlite.id + '_hold',
					name: 'Q-Lite #' + qlite.label + ' Hold Status (on, off)',
				})
				variables.push({
					variableId: 'qlite' + qlite.id + '_latest_sent_timestamp',
					name: 'Q-Lite #' + qlite.label + ' Latest OSC message timestamp',
				})
				variables.push({
					variableId: 'qlite' + qlite.id + '_latest_sent_raw',
					name: 'Q-Lite #' + qlite.label + ' Latest OSC message sent',
				})
				variables.push({
					variableId: 'qlite' + qlite.id + '_latest_sent_path',
					name: 'Q-Lite #' + qlite.label + ' Latest OSC command sent',
				})
				variables.push({
					variableId: 'qlite' + qlite.id + '_latest_sent_args',
					name: 'Q-Lite #' + qlite.label + ' Latest OSC arguments sent array',
				})
			}
		})

		if (self.config.specifyCustomOnOff) {
			variables.push({ variableId: 'onTime', name: 'On Time' })
			variables.push({ variableId: 'offTime', name: 'Off Time' })
		} else {
			variables.push({ variableId: 'rate', name: 'Blink Rate' })
		}

		self.setVariableDefinitions(variables)
	},

	checkVariables() {
		let self = this

		try {
			variableValues = {}

			if (self.config.specifyCustomOnOff) {
				variableValues['onTime'] = self.config.onTime
				variableValues['offTime'] = self.config.offTime
			} else {
				variableValues['rate'] = self.config.rate
			}

			self.setVariableValues(variableValues)
		} catch (error) {
			self.log('error', `Error updating variables: ${error.message}`)
			console.log(error)
		}
	},
}
