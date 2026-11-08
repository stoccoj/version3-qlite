module.exports = {
	paths: {
		hold_blink: '/led/hold/blink',
		hold_solid: '/led/hold/solid',
		hold_off: '/led/hold/off',
		ready_blink: '/led/ready/blink',
		ready_solid: '/led/ready/solid',
		go_blink: '/led/go/blink',
		go_solid: '/led/go/solid',
		clear: '/led/clear',
	},

	sendOscMessage: async function (id, path, args = undefined) {
		let self = this // required to have reference to outer `this`

		if (args === undefined) {
			args = [
				{
					type: 'i',
					value: parseInt(id),
				},
			]
		}

		const host = self.resolvedHosts?.[id]
		const port = Number(self.config[`qlite${id}-targetPort`])

		if (!host || !port) {
			self.log('debug', `Not sending ${path} to Q-Lite #${id}: no resolved host/port`)
			return
		}

		const args_string = args.map((item) => item.value).join(' ')

		self.log('debug', `Sending OSC [${host}:${port}] ${path}`)
		self.log('debug', `Sending Args ${JSON.stringify(args)}`)

		//Update Variables
		self.setVariableValues({
			[`qlite${id}_latest_sent_raw`]: `${path} ${args_string}`,
			[`qlite${id}_latest_sent_path`]: path,
			[`qlite${id}_latest_sent_args`]: args.length > 0 ? args.map((arg) => arg.value) : undefined,
			[`qlite${id}_latest_sent_timestamp`]: Date.now(),
		})

		self.oscSend(host, port, path, args)
	},
}
