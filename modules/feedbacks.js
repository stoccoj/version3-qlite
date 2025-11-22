const { Regex, combineRgb } = require("@companion-module/base");
const { evaluateComparison, parseArguments } = require("../helpers");
const { off, ready, go } = require("./styles");

module.exports = {
  initFeedbacks() {
    let self = this;
    let feedbacks = {};
    const feedbackButtons = self.buttons.filter((btn) => btn.id !== '0'); // Exclude 'All' option

    feedbacks.ready = {
      type: 'advanced',
      name: 'Q-Lite state is Ready',
      description: 'Indicates if the Q-Lite state is set to Ready',
      defaultStyle: ready,
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
        const qliteNumber = feedback.options.number;

        const status = await context.parseVariablesInString(`$(qlite:qlite${qliteNumber}_status)`)
        const hold_status = await context.parseVariablesInString(`$(qlite:qlite${qliteNumber}_hold)`)
        const isReady = status === 'ready' && hold_status !== 'yes'

        /** Can be used to dynamically set colors based on config
        const readyColor = {
          color: self.config[`qlite${qliteNumber}-readyTxtColor`],
          bgcolor: self.config[`qlite${qliteNumber}-readyBgColor`],
        }
        **/

        if(isReady) {
          return self.boolValue ? ready : off
        }

        return off
      }
    }

    feedbacks.ready_confirmed = {
      type: 'advanced',
      name: 'Q-Lite state is Ready (confirmed)',
      description: 'Indicates if the Q-Lite state is set to Ready (confirmed)',
      defaultStyle: ready,
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
        const qliteNumber = feedback.options.number;
        const status = await context.parseVariablesInString(`$(qlite:qlite${qliteNumber}_status)`)
        const hold_status = await context.parseVariablesInString(`$(qlite:qlite${qliteNumber}_hold)`)

        /** Can be used to dynamically set colors based on config
        const readyColor = {
          color: self.config[`qlite${qliteNumber}-readyTxtColor`],
          bgcolor: self.config[`qlite${qliteNumber}-readyBgColor`],
        }
        **/
        return status === 'ready-confirmed' && hold_status !== 'yes' ? ready : off
      }
    }

    feedbacks.go = {
      type: 'advanced',
      name: 'Use for Q-Lite Go button',
      description: 'Turns button green when Q-Lite is set to Go',
      defaultStyle: go,
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
        const qliteNumber = feedback.options.number;
        const status = await context.parseVariablesInString(`$(qlite:qlite${qliteNumber}_status)`)
        const hold_status = await context.parseVariablesInString(`$(qlite:qlite${qliteNumber}_hold)`)

        /** Can be used to dynamically set colors based on config
        const goColor = {
          color: self.config[`qlite${qliteNumber}-goTxtColor`],
          bgcolor: self.config[`qlite${qliteNumber}-goBgColor`],
        }
        **/

        return status === 'go' && hold_status !== 'yes' ? go : off
      }
    }

    feedbacks.osc_feedback_int = {
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

        self.log('debug', `Evaluating feedback ${feedback.id}.`)

        const targetValue = parseFloat(targetValueStr)
        if (isNaN(targetValue)) {
          self.log('warn', `Invalid target value: ${targetValueStr}`)
          return false
        }

        if (self.onDataReceived.hasOwnProperty(path)) {
          const rx_args = self.onDataReceived[path]
          const receivedValue = parseFloat(rx_args[0].value)

          const comparisonResult = evaluateComparison(receivedValue, targetValue, comparison)

          self.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`)
          return comparisonResult
        } else {
          self.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`)
          return false
        }
      },
    }

    feedbacks.osc_feedback_float = {
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

        self.log('debug', `Evaluating feedback ${feedback.id}.`)

        const targetValue = parseFloat(targetValueStr)
        if (isNaN(targetValue)) {
          self.log('warn', `Invalid target value: ${targetValueStr}`)
          return false
        }

        if (self.onDataReceived.hasOwnProperty(path)) {
          const rx_args = self.onDataReceived[path]
          const receivedValue = parseFloat(rx_args[0].value)

          const comparisonResult = evaluateComparison(receivedValue, targetValue, comparison)

          self.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`)
          return comparisonResult
        } else {
          self.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`)
          return false
        }
      },
    }

    feedbacks.osc_feedback_bool = {
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

        self.log('debug', `Evaluating feedback ${feedback.id}.`)

        if (self.onDataReceived.hasOwnProperty(path)) {
          const rx_args = self.onDataReceived[path]
          const receivedValue = rx_args[0].value === true ? true : false

          const comparisonResult = evaluateComparison(receivedValue, targetValue, comparison)

          self.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`)
          return comparisonResult
        } else {
          self.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`)
          return false
        }
      },
    }

    feedbacks.osc_feedback_string = {
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
              {id: 'equal', label: '='},
              {id: 'notequal', label: '!='},
            ],
            default: 'equal',
          },
        ],
        callback: async (feedback, context) => {
          const path = await context.parseVariablesInString(feedback.options.path || '')
          const targetValue = await context.parseVariablesInString(feedback.options.arguments || '')
          const comparison = feedback.options.comparison

          self.log('debug', `Evaluating feedback ${feedback.id}.`)

          if (self.onDataReceived.hasOwnProperty(path)) {
            const rx_args = self.onDataReceived[path]

            if (typeof rx_args[0].value !== 'string') {
              self.log('warn', `Feedback ${feedback.id} received a non-string value: ${receivedValue}`)
              return false
            }

            const receivedValue = String(rx_args[0].value)
            const comparisonResult = evaluateComparison(receivedValue, targetValue, comparison)

            self.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`)
            return comparisonResult
          } else {
            self.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`)
            return false
          }
        },
      },
    }

    feedbacks.osc_feedback_multi = {
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

        self.log('debug', `Evaluating feedback ${feedback.id}.`)

        const { args, error } = parseArguments(argsStr)
        if (error) {
          self.log('warn', error)
          return false
        }

        if (self.onDataReceived.hasOwnProperty(path)) {
          const rx_args = self.onDataReceived[path]
          let comparisonResult = comparison === 'equal'
          for (let i = 0; i < args.length; i++) {
            comparisonResult = evaluateComparison(rx_args[i].value, args[i], comparison)
            if ((comparison === 'equal' && !comparisonResult) || (comparison === 'notequal' && comparisonResult)) {
              break
            }
          }

          self.log('debug', `Feedback ${feedback.id} comparison result: ${comparisonResult}`)
          return comparisonResult
        } else {
          self.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`)
          return false
        }
      },
    }

    feedbacks.osc_feedback_noargs = {
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

        if (self.onDataReceived.hasOwnProperty(path) && self.onDataReceived[path].length > 0) {
          self.log('debug', `Feedback ${feedback.id} returned true!`)
          delete this.onDataReceived[path] // Remove the path from the dictionary to create a debounce
          return true
        } else {
          self.log('debug', `Feedback ${feedback.id} returned false! Path does not exist yet in dictionary.`)
          return false
        }
      },
    }

    self.setFeedbackDefinitions(feedbacks);
  }
}