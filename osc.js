const { InstanceBase, Regex, runEntrypoint } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const { resolveHostname, isValidIPAddress, parseArguments, evaluateComparison, setupOSC } = require('./helpers.js')

const buttonDropdown = [
  { id: '1', label: '1' },
  { id: '2', label: '2' }
]

class OSCInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	//Initialization
	async init(config) {
		this.config = config
		this.targetHost
		this.client

		this.onDataReceived = {}

		let validate = false

    const host = this.config['button1-host']
		if (host) {
			if (!isValidIPAddress(host)) {
				await resolveHostname(this, host)
					.then((ip) => {
						this.targetHost = ip
						validate = true
					})
					.catch((err) => {
						this.log('error', `Unable to resolve hostname for ${host}: ${err.message}`)
						this.updateStatus('bad_config')
						validate = false
					})
			} else {
				this.targetHost = host
				validate = true
			}
		}

		if (this.config.listen) {
			if (this.targetHost && (this.config['button1-targetPort'] || this.config.feedbackPort)) {
				setupOSC(this)

				if (validate) {
					this.setupListeners()
				}
			}
		} else {
			this.updateStatus('ok')
		}

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedback
		this.updateVariables() // export variables
	}
	// When module gets deleted
	async destroy() {
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.config = config

		if (this.client && this.client.isConnected()) {
			await this.client
				.closeConnection()
				.then(() => {
					this.client = null
				})
				.catch((err) => {
					this.log('error', `${this.config.protocol} close error: ${err.message}`)
				})
		}

		let validate = false
		if (!this.config['button1-host']) {
			this.updateStatus('bad_config')
			this.log('warn', 'No host specified in config (null)')
		} else if (!this.config['button1-targetPort']) {
			this.updateStatus('bad_config')
			this.log('warn', 'No targetPort specified in config (null)')
		} else if (!isValidIPAddress(this.config['button1-host'])) {
			await resolveHostname(this, this.config['button1-host'])
				.then((ip) => {
					this.targetHost = ip
					validate = true
				})
				.catch((err) => {
					this.log('error', `Unable to resolve hostname for ${this.config['button1-host']}: ${err.message}`)
					this.updateStatus('bad_config')
					validate = false
				})
		} else {
			this.targetHost = this.config['button1-host']
			validate = true
		}

		if (!validate) {
			return
		}

		setupOSC(this)

		this.setupListeners()
	}

	async setupListeners() {
		this.log('info', `Resetting Listeners..`)

		if (this.config.listen) {
			if (this.config.protocol && this.client && !this.client.isConnected()) {
				await this.client.openConnection().catch((err) => {
					this.log('error', err.message)
				})
			}
		} else {
			this.updateStatus('ok')
		}
	}

	// Return config fields for web config
	getConfigFields() {
		return [
      {
        type: 'static-text',
        id: 'button1',
        label: 'Button #1 LED Control',
        width: 12,
      },
      {
        type: 'textinput',
        id: 'button1-host',
        label: 'Target Hostname or IP',
        width: 8,
        regex: Regex.HOSTNAME,
        required: true,
      },
      {
        type: 'textinput',
        id: 'button1-targetPort',
        label: 'Target Port',
        width: 4,
        regex: Regex.PORT,
        default: '8000',
        required: true,
      },
      {
        type: 'static-text',
        id: 'button2',
        label: 'Button #2 LED Control',
        width: 12,
      },
      {
        type: 'textinput',
        id: 'button2-host',
        label: 'Target Hostname or IP',
        width: 8,
        regex: Regex.HOSTNAME,
        required: true,
      },
      {
        type: 'textinput',
        id: 'button2-targetPort',
        label: 'Target Port',
        width: 4,
        regex: Regex.PORT,
        default: '8000',
        required: true,
      },
      {
        type: 'static-text',
        id: 'button-default',
        label: 'Default Button LED Control',
        width: 12,
      },
			{
				type: 'dropdown',
				id: 'protocol',
				label: 'Protocol',
				choices: [
					{ id: 'udp', label: 'UDP (Default)' },
					{ id: 'tcp', label: 'TCP' },
					{ id: 'tcp-raw', label: 'TCP (Raw)' },
				],
				default: 'udp',
				width: 4,
				required: true,
			},
			{
				type: 'checkbox',
				id: 'listen',
				label: 'Listen for Feedback',
				width: 4,
				default: false,
				required: true,
			},
			{
				type: 'textinput',
				id: 'feedbackPort',
				label: 'Feedback Port',
				width: 4,
				regex: Regex.PORT,
				isVisible: (options, data) => options.listen && options.protocol === 'udp',
			},
		]
	}

	updateActions() {
		const sendOscMessage = async (id, path, args, type) => {
			const args_json = JSON.stringify(args)
			const args_string = args.map((item) => item.value).join(' ')
      const host = this.config[`button${id}-host`]
      const port = this.config[`button${id}-targetPort`]

			this.log('debug', `Sending OSC [${host}:${port} ${path}`)
			this.log('debug', `Sending Args ${args_json}`)

			if (this.config.protocol === 'udp') {
				//Update Variables
				this.setVariableValues({
					[`button${id}_latest_sent_raw`]: `${path} ${args_string}`,
					[`button${id}_latest_sent_path`]: path,
					[`button${id}_latest_sent_args`]: args.length > 0 ? args.map((arg) => arg.value) : undefined,
					[`button${id}_latest_sent_timestamp`]: Date.now(),
				})

				this.oscSend(host, port, path, args)
			} else {
				await this.client
					.sendCommand(path, args)
					.then(() => {
						this.log('info', `${this.config.protocol} Command sent successfully. Path: ${path}, Args: ${args_json}`)
					})
					.catch((err) => {
						this.log('error', `Failed to send ${this.config.protocol} command:`, err.message)
					})
			}
		}

		this.setActionDefinitions({
      send_test: {
        name: 'Send test message without arguments',
        options: [],
        callback: async (event) => {
          const path = await this.parseVariablesInString('/test')

          sendOscMessage('1', path, [])
        },
      },
      send_on: {
        name: 'Set the LED to on',
        options: [
          {
            type: 'dropdown',
            label: 'Button #',
            choices: buttonDropdown,
            id: 'number',
            default: '1',
          },
          {
            type: 'dropdown',
            label: 'Button Color',
            choices: [
              { id: 'red', label: 'Red' },
              { id: 'green', label: 'Green' }
            ],
            id: 'color',
            default: 'red',
          },
        ],
        callback: async (event) => {
          const path = await this.parseVariablesInString("/led/"+event.options.color+"/solid")

          sendOscMessage(event.options.number, path, [
            {
              type: 'i',
              value: parseInt(event.options.number),
            },
          ])
        },
      },
      send_off: {
        name: 'Set the LED to off',
        options: [
          {
            type: 'dropdown',
            label: 'Button #',
            choices: buttonDropdown,
            id: 'number',
            default: '1',
          },
          {
            type: 'dropdown',
            label: 'Button Color',
            choices: [
              { id: 'red', label: 'Red' },
              { id: 'green', label: 'Green' }
            ],
            id: 'color',
            default: 'red',
          },
        ],
        callback: async (event) => {
          const path = await this.parseVariablesInString("/led/"+event.options.color+"/off")

          sendOscMessage(event.options.number, path, [
            {
              type: 'i',
              value: parseInt(event.options.number),
            },
          ])
        },
      },
      send_blink: {
        name: 'Set the LED to blinking',
        options: [
          {
            type: 'dropdown',
            label: 'Button #',
            choices: buttonDropdown,
            id: 'number',
            default: '1',
          },
          {
            type: 'dropdown',
            label: 'Button Color',
            choices: [
              { id: 'red', label: 'Red' },
              { id: 'green', label: 'Green' }
            ],
            id: 'color',
            default: 'red',
          },
        ],
        callback: async (event) => {
          const path = await this.parseVariablesInString("/led/"+event.options.color+"/blink")

          sendOscMessage(event.options.number, path, [
            {
              type: 'i',
              value: parseInt(event.options.number),
            },
          ])
        },
      },
      send_pulse: {
        name: 'Set the LED to pulsing',
        options: [
          {
            type: 'dropdown',
            label: 'Button #',
            choices: buttonDropdown,
            id: 'number',
            default: '1',
          },
          {
            type: 'dropdown',
            label: 'Button Color',
            choices: [
              { id: 'red', label: 'Red' },
              { id: 'green', label: 'Green' }
            ],
            id: 'color',
            default: 'red',
          },
        ],
        callback: async (event) => {
          const path = await this.parseVariablesInString("/led/"+event.options.color+"/pulse")

          sendOscMessage(event.options.number, path, [
            {
              type: 'i',
              value: parseInt(event.options.number),
            },
          ])
        },
      },
			send_blank: {
				name: 'Send message without arguments',
				options: [
          {
            type: 'dropdown',
            label: 'Button #',
            choices: buttonDropdown,
            id: 'number',
            default: '1',
          },
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)

					sendOscMessage(event.options.number, path, [])
				},
			},
			send_int: {
				name: 'Send integer',
				options: [
          {
            type: 'dropdown',
            label: 'Button #',
            choices: buttonDropdown,
            id: 'number',
            default: '1',
          },
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'int',
						default: 1,
						regex: Regex.SIGNED_NUMBER,
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const int = await this.parseVariablesInString(event.options.int)

					sendOscMessage(event.options.number, path, [
						{
							type: 'i',
							value: parseInt(int),
						},
					])
				},
			},
			send_float: {
				name: 'Send float',
				options: [
          {
            type: 'dropdown',
            label: 'Button #',
            choices: buttonDropdown,
            id: 'number',
            default: '1',
          },
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'float',
						default: 1,
						regex: Regex.SIGNED_FLOAT,
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const float = await this.parseVariablesInString(event.options.float)

					sendOscMessage(event.options.number, path, [
						{
							type: 'f',
							value: parseFloat(float),
						},
					])
				},
			},
			send_string: {
				name: 'Send string',
				options: [
          {
            type: 'dropdown',
            label: 'Button #',
            choices: buttonDropdown,
            id: 'number',
            default: '1',
          },
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'string',
						default: 'text',
						useVariables: true,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const string = await this.parseVariablesInString(event.options.string)

					sendOscMessage(event.options.number, path, [
						{
							type: 's',
							value: '' + string,
						},
					])
				},
			},
			send_multiple: {
				name: 'Send message with multiple arguments',
				options: [
          {
            type: 'dropdown',
            label: 'Button #',
            choices: buttonDropdown,
            id: 'number',
            default: '1',
          },
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Arguments',
						id: 'arguments',
						default: `1 "Let's go" 2.5`,
						useVariables: true,
						tooltip: `Use a space delimited list of numbers, true, false or strings. Numbers without a decimal point are considered integer and numbers with a point are considered float. When using a variable that holds an array the elements of the array will be passed as arguments.`,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const args = await this.parseVariablesInString(event.options.arguments)

					function tokenize(input) {
						if (!input || input.trim() === '') {
							return []
						}
						// Normalize fancy quotes to standard double quotes
						input = input.replaceAll(/[\u201C\u201D\u201E\u201F]/g, '"')

						const regex = /(-?\d+(?:\.\d+)?)|true|false|"((?:[^"\\]|\\.)+)"|'((?:[^'\\]|\\.)+)'|\S+/g
						const tokens = []
						let match

						while ((match = regex.exec(input)) !== null) {
							if (match[1] !== undefined && match[1].match(/\./)) {
								// Float
								tokens.push({ type: 'f', value: parseFloat(match[1]) })
							} else if (match[1] !== undefined && !match[1].match(/\./)) {
								// Integer
								tokens.push({ type: 'i', value: parseInt(match[1]) })
							} else if (match[2] !== undefined) {
								// Double-quoted string: include quotes as literal characters
								tokens.push({ type: 's', value: '"' + match[2].replace(/\\"/g, '"') + '"' })
							} else if (match[3] !== undefined) {
								// Single-quoted string: include quotes as literal characters
								tokens.push({ type: 's', value: "'" + match[3].replace(/\\'/g, "'") + "'" })
							} else if (match[0] === 'true') {
								tokens.push({ type: 'T' })
							} else if (match[0] === 'false') {
								tokens.push({ type: 'F' })
							} else {
								// Other non-space tokens: wrap as a string
								tokens.push({ type: 's', value: match[0] })
							}
						}

						return tokens
					}

					function mapArgArray(arr) {
						return arr
							.filter((itm) => {
								const type = typeof itm
								return type === 'string' || type === 'boolean' || type === 'number'
							})
							.map((itm) => {
								if (typeof itm === 'number') return { type: 'f', value: itm }
								else if (typeof itm === 'string') return { type: 's', value: itm }
								else if (itm === true) return { type: 'T' }
								else if (itm === false) return { type: 'F' }
							})
					}

					let argsArray = []
					if (Array.isArray(args)) {
						if (args.length) argsArray = mapArgArray(args)
					} else {
						argsArray = tokenize(args)
					}

					sendOscMessage(event.options.number, path, argsArray)
				},
			},
			send_boolean: {
				name: 'Send boolean',
				options: [
          {
            type: 'dropdown',
            label: 'Button #',
            choices: buttonDropdown,
            id: 'number',
            default: '1',
          },
					{
						type: 'static-text',
						label: 'Attention',
						value: 'The boolean type is non-standard and may only work with some receivers.',
						id: 'warning',
					},
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'checkbox',
						label: 'Value',
						id: 'value',
						default: false,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					let type = 'F'
					if (event.options.value === true) {
						type = 'T'
					}

					sendOscMessage(event.options.number, path, [
						{
							type,
						},
					])
				},
			},
			send_blob: {
				name: 'Send blob',
				options: [
          {
            type: 'dropdown',
            label: 'Button #',
            choices: [
              { id: '1', label: '1' },
              { id: '2', label: '2' }
            ],
            id: 'number',
            default: '1',
          },
					{
						type: 'static-text',
						label: 'Attention',
						value: 'The blob type is non-standard and may only work with some receivers.',
						id: 'warning',
					},
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Blob Data (Base64)',
						id: 'blob',
						default: '',
						useVariables: true,
						isVisible: (options, data) => options.hexswitch === false,
					},
					{
						type: 'textinput',
						label: 'Blob Data (Hex)',
						id: 'blob_hex',
						default: '0A0B0C',
						useVariables: true,
						isVisible: (options, data) => options.hexswitch === true,
					},
					{
						type: 'checkbox',
						label: 'Use Hex',
						id: 'hexswitch',
						default: false,
					},
				],
				callback: async (event) => {
					const path = await this.parseVariablesInString(event.options.path)
					const blob = await this.parseVariablesInString(event.options.blob)
					const blob_hex = await this.parseVariablesInString(event.options.blob_hex)

					let blobBuffer

					if (event.options.hexswitch === true) {
						// Convert Hex string to a Buffer
						blobBuffer = Buffer.from(blob_hex.replace(/[\s,]/g, ''), 'hex')

						if (!blobBuffer) {
							this.log('error', `Invalid blob data: ${blob_hex}`)
							return
						}
					} else {
						// Convert Base64 string to a Buffer
						blobBuffer = Buffer.from(blob.replace(/[\s,]/g, ''), 'base64')

						if (!blobBuffer) {
							this.log('error', `Invalid blob data: ${blob}`)
							return
						}
					}

					sendOscMessage(event.options.number, path, [
						{
							type: 'b', // OSC blob type
							value: blobBuffer,
						},
					])
				},
			},
		})
	}

	updateFeedbacks() {
		this.setFeedbackDefinitions({
			osc_feedback_int: {
				type: 'boolean',
				name: 'Listen for OSC messages (Integer)',
				description: 'Listen for OSC messages. Requires "Listen for Feedback" option to be enabled in OSC config.',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'arguments',
						default: 1,
						regex: Regex.SIGNED_NUMBER,
						useVariables: true,
					},
					{
						id: 'comparison',
						type: 'dropdown',
						label: 'Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'greaterthan', label: '>' },
							{ id: 'lessthan', label: '<' },
							{ id: 'greaterthanequal', label: '>=' },
							{ id: 'lessthanequal', label: '<=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(feedback.options.path || '')
					const targetValueStr = await context.parseVariablesInString(feedback.options.arguments || '')
					const comparison = feedback.options.comparison

					this.log('debug', `Evaluating feedback ${feedback.id}.`)

					const targetValue = parseFloat(targetValueStr)
					if (isNaN(targetValue)) {
						this.log('warn', `Invalid target value: ${targetValueStr}`)
						return false
					}

					if (this.onDataReceived.hasOwnProperty(path)) {
						const rx_args = this.onDataReceived[path]
						const receivedValue = parseFloat(rx_args[0].value)

						const comparisonResult = evaluateComparison(receivedValue, targetValue, comparison)

						this.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`)
						return comparisonResult
					} else {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`)
						return false
					}
				},
			},
			osc_feedback_float: {
				type: 'boolean',
				name: 'Listen for OSC messages (Float)',
				description: 'Listen for OSC messages. Requires "Listen for Feedback" option to be enabled in OSC config.',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'arguments',
						default: 1,
						regex: Regex.SIGNED_FLOAT,
						useVariables: true,
					},
					{
						id: 'comparison',
						type: 'dropdown',
						label: 'Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'greaterthan', label: '>' },
							{ id: 'lessthan', label: '<' },
							{ id: 'greaterthanequal', label: '>=' },
							{ id: 'lessthanequal', label: '<=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(feedback.options.path || '')
					const targetValueStr = await context.parseVariablesInString(feedback.options.arguments || '')
					const comparison = feedback.options.comparison

					this.log('debug', `Evaluating feedback ${feedback.id}.`)

					const targetValue = parseFloat(targetValueStr)
					if (isNaN(targetValue)) {
						this.log('warn', `Invalid target value: ${targetValueStr}`)
						return false
					}

					if (this.onDataReceived.hasOwnProperty(path)) {
						const rx_args = this.onDataReceived[path]
						const receivedValue = parseFloat(rx_args[0].value)

						const comparisonResult = evaluateComparison(receivedValue, targetValue, comparison)

						this.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`)
						return comparisonResult
					} else {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`)
						return false
					}
				},
			},
			osc_feedback_bool: {
				type: 'boolean',
				name: 'Listen for OSC messages (Boolean)',
				description: 'Listen for OSC messages. Requires "Listen for Feedback" option to be enabled in OSC config.',
				options: [
					{
						type: 'static-text',
						label: 'Attention',
						value: 'The boolean type is non-standard and may only work with some receivers.',
						id: 'warning',
					},
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'checkbox',
						label: 'Value',
						id: 'arguments',
						default: false,
					},
					{
						id: 'comparison',
						type: 'dropdown',
						label: 'Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(feedback.options.path || '')
					const targetValue = feedback.options.arguments
					const comparison = feedback.options.comparison

					this.log('debug', `Evaluating feedback ${feedback.id}.`)

					if (this.onDataReceived.hasOwnProperty(path)) {
						const rx_args = this.onDataReceived[path]
						const receivedValue = rx_args[0].value === true ? true : false

						const comparisonResult = evaluateComparison(receivedValue, targetValue, comparison)

						this.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`)
						return comparisonResult
					} else {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`)
						return false
					}
				},
			},
			osc_feedback_string: {
				type: 'boolean',
				name: 'Listen for OSC messages (String)',
				description: 'Listen for OSC messages. Requires "Listen for Feedback" option to be enabled in OSC config.',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Value',
						id: 'arguments',
						default: 'my favorite string',
						useVariables: true,
					},
					{
						id: 'comparison',
						type: 'dropdown',
						label: 'Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(feedback.options.path || '')
					const targetValue = await context.parseVariablesInString(feedback.options.arguments || '')
					const comparison = feedback.options.comparison

					this.log('debug', `Evaluating feedback ${feedback.id}.`)

					if (this.onDataReceived.hasOwnProperty(path)) {
						const rx_args = this.onDataReceived[path]

						if (typeof rx_args[0].value !== 'string') {
							this.log('warn', `Feedback ${feedback.id} received a non-string value: ${receivedValue}`)
							return false
						}

						const receivedValue = String(rx_args[0].value)
						const comparisonResult = evaluateComparison(receivedValue, targetValue, comparison)

						this.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`)
						return comparisonResult
					} else {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`)
						return false
					}
				},
			},
			osc_feedback_multi: {
				type: 'boolean',
				name: 'Listen for OSC messages (Multiple Arguments)',
				description: 'Listen for OSC messages. Requires "Listen for Feedback" option to be enabled in OSC config.',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
					{
						type: 'textinput',
						label: 'Arguments',
						id: 'arguments',
						default: '1 "test" 2.5',
						useVariables: true,
					},
					{
						id: 'comparison',
						type: 'dropdown',
						label: 'Comparison',
						choices: [
							{ id: 'equal', label: '=' },
							{ id: 'notequal', label: '!=' },
						],
						default: 'equal',
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(feedback.options.path || '')
					let argsStr = await context.parseVariablesInString(feedback.options.arguments || '')
					const comparison = feedback.options.comparison

					this.log('debug', `Evaluating feedback ${feedback.id}.`)

					const { args, error } = parseArguments(argsStr)
					if (error) {
						this.log('warn', error)
						return false
					}

					if (this.onDataReceived.hasOwnProperty(path)) {
						const rx_args = this.onDataReceived[path]
						let comparisonResult = comparison === 'equal'
						for (let i = 0; i < args.length; i++) {
							comparisonResult = evaluateComparison(rx_args[i].value, args[i], comparison)
							if ((comparison === 'equal' && !comparisonResult) || (comparison === 'notequal' && comparisonResult)) {
								break
							}
						}

						this.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`)
						return comparisonResult
					} else {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`)
						return false
					}
				},
			},
			osc_feedback_noargs: {
				type: 'boolean',
				name: 'Listen for OSC messages (No Arguments)',
				description: 'Listen for OSC messages. Requires "Listen for Feedback" option to be enabled in OSC config.',
				options: [
					{
						type: 'textinput',
						label: 'OSC Path',
						id: 'path',
						default: '/osc/path',
						useVariables: true,
					},
				],
				callback: async (feedback, context) => {
					const path = await context.parseVariablesInString(feedback.options.path || '')
					this.log('debug', `Evaluating feedback ${feedback.id}.`)

					if (this.onDataReceived.hasOwnProperty(path) && this.onDataReceived[path].length > 0) {
						this.log('debug', `Feedback ${feedback.id} returned true!`)
						delete this.onDataReceived[path] // Remove the path from the dictionary to create a debounce
						return true
					} else {
						this.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`)
						return false
					}
				},
			},
		})
	}

	updateVariables() {
    const variables = [
      { variableId: 'latest_received_timestamp', name: 'Latest OSC message received timestamp' },
      { variableId: 'latest_received_raw', name: 'Latest OSC message received' },
      { variableId: 'latest_received_path', name: 'Latest OSC command received' },
      { variableId: 'latest_received_client', name: 'Latest OSC message received client (UDP only)' },
      { variableId: 'latest_received_port', name: 'Latest OSC message received port (UDP only)' },
      { variableId: 'latest_received_args', name: 'Latest OSC arguments received array.' },
    ]

    buttonDropdown.forEach((button) => {
      variables.push({ variableId: 'button'+button.id+'_latest_sent_timestamp', name: 'Button '+button.label+' Latest OSC message timestamp' })
      variables.push({ variableId: 'button'+button.id+'_latest_sent_raw', name: 'Button '+button.label+' Latest OSC message sent' })
      variables.push({ variableId: 'button'+button.id+'_latest_sent_path', name: 'Button '+button.label+' Latest OSC command sent' })
      variables.push({ variableId: 'button'+button.id+'_latest_sent_args', name: 'Button '+button.label+' Latest OSC arguments sent array' })
    })

		this.setVariableDefinitions(variables)
	}
}

runEntrypoint(OSCInstance, UpgradeScripts)
