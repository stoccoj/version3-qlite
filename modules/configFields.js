const { Regex } = require('@companion-module/base')
const { off, ready, go} = require("./styles");

module.exports = {
	getConfigFields() {
    let self = this;
    let fields = []

    fields.push({
      type: 'number',
      id: 'numberOfQlites',
      label: 'Number of Q-Lites',
      min: 1,
      max: 16,
      default: 1,
      width: 12,
    })

    const count = Number(self.config?.numberOfQlites ?? 1)

    for (let i = 1; i <= count; i++) {
      let requiredField = i === 1;

      fields.push({
        type: 'textinput',
        id: `qlite${i}-host`,
        label: `Q-Lite #${i} Hostname or IP`,
        width: 6,
        regex: Regex.HOSTNAME | '',
        required: requiredField,
      })

      fields.push({
        type: 'textinput',
        id: `qlite${i}-targetPort`,
        label: 'Port',
        width: 2,
        regex: Regex.PORT | '',
        default: '8000',
        required: requiredField,
      })

      fields.push({
        type: 'checkbox',
        id: `qlite${i}-requestReadyConfirmation`,
        label: 'Confirm Ready',
        tooltip: `Request confirmation from the remote station when setting the Q-Lite to the Ready state.`,
        width: 2,
        default: false,
      })

      fields.push({
        type: 'checkbox',
        id: `qlite${i}-requestGoConfirmation`,
        label: 'Confirm Go',
        tooltip: `Request confirmation from the remote station when setting the Q-Lite to the Go state.`,
        width: 2,
        default: false,
      })

      /** Can be used for custom colors per Q-Lite, but for now we'll keep it simple with one set of colors for all Q-Lites
      fields.push({
        type: 'colorpicker',
        id: `qlite${i}-readyBgColor`,
        label: 'Ready Bg',
        width: 1,
        default: 'rgb(255, 255, 0)',
        required: true,
      })

      fields.push({
        type: 'colorpicker',
        id: `qlite${i}-readyTxtColor`,
        label: 'Ready Txt',
        width: 1,
        default: 'rgb(0, 0, 0)',
        required: true,
      })

      fields.push({
        type: 'colorpicker',
        id: `qlite${i}-goBgColor`,
        label: 'Go Bg',
        width: 1,
        default: 'rgb(0, 255, 0)',
        required: true,
      })

      fields.push({
        type: 'colorpicker',
        id: `qlite${i}-goTxtColor`,
        label: 'Go Txt',
        width: 1,
        default: 'rgb(0, 0, 0)',
        required: true,
      })
      **/
    }

    fields.push({
      type: 'static-text',
      id: 'spacer1',
      width: 12,
      label: '',
      value: ' '
    })

    fields.push({
      type: 'static-text',
      id: 'qlite-default',
      label: 'Default Q-Lite Control',
      width: 12,
    })

    fields.push({
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
    })

    fields.push({
      type: 'checkbox',
      id: 'listen',
      label: 'Listen for Feedback',
      width: 4,
      default: false,
      required: true,
    })

    fields.push({
      type: 'textinput',
      id: 'feedbackPort',
      label: 'Feedback Port',
      width: 4,
      regex: Regex.PORT,
      isVisible: (options, data) => options.listen && options.protocol === 'udp',
    })

    fields.push({
      type: 'static-text',
      id: 'spacer2',
      width: 12,
      label: '',
      value: ' '
    })

    fields.push({
      type: 'static-text',
      id: 'buttonInfo',
      width: 12,
      label: 'Button Blink Configuration',
      value: 'Indicate the rate at which the buttons will blink when set to a blinking state.'
    })

    fields.push({
      type: 'checkbox',
      id: 'autoClear',
      width: 6,
      label: 'Auto Clear',
      tooltip: 'Indicates whether or not a go state will automatically clear after a period of time.',
      default: false,
    })

    fields.push({
      type: 'number',
      id: 'autoClearTime',
      width: 6,
      label: 'Auto Clear Time (seconds)',
      min: 5,
      max: 60,
      tooltip: 'The amount of time in seconds before the go state will automatically clear.',
      default: 15,
    })

    fields.push({
      type: 'checkbox',
      id: 'specifyCustomOnOff',
      width: 6,
      label: 'Specify Custom On/Off Times',
      default: false,
    })

    fields.push({
      type: 'number',
      id: 'onTime',
      width: 3,
      label: 'On Time (ms)',
      default: 1000,
      tooltip: 'The time in milliseconds the button will be on.',
      required: true,
      min: 100,
      max: 10000,
      isVisible: config => config.specifyCustomOnOff
    })

    fields.push({
      type: 'number',
      id: 'offTime',
      width: 3,
      label: 'Off Time (ms)',
      default: 500,
      tooltip: 'The time in milliseconds the button will be off.',
      required: true,
      min: 100,
      max: 10000,
      isVisible: config => config.specifyCustomOnOff
    })

    fields.push({
      type: 'number',
      id: 'rate',
      width: 6,
      label: 'Blink Rate (ms)',
      default: 1000,
      tooltip: 'The rate in milliseconds at which the buttons will blink. 1000ms = 1 second.',
      required: true,
      min: 100,
      max: 10000,
      isVisible: config => config.specifyCustomOnOff === false || config.specifyCustomOnOff === undefined
    })

		return fields
	},
}
