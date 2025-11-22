const paths = require('./osc').paths

module.exports = {

  initActions: function() {
    let self = this; // required to have reference to outer `this`
    let actions = {};
    const actionButtons = self.buttons.filter((btn) => btn.id !== '0');

    actions.ready = {
      name: 'Set the Q-Lite state to Ready',
      options: [
        {
          type: 'dropdown',
          label: 'Q-Lite #',
          choices: self.buttons,
          id: 'number',
          default: '1',
        },
      ],
      callback: async (event) => {
        if(event.options.number === '0') {
          actionButtons.forEach((qlite) => {
            let rc = self.config[`qlite${qlite.id}-requestConfirmation`]
            self.log('debug', `Q-Lite #${qlite.id} Request Confirmation is set to ${rc}`)
            let path = rc ? paths.ready_blink : paths.ready_solid
            let status = rc ? 'ready' : 'ready-confirmed'

            const current_status = self.getVariableValue(`qlite${qlite.id}_status`)
            if(current_status !== 'go') {
              self.setVariableValues({
                [`qlite${qlite.id}_status`]: status,
              })
              self.sendOscMessage(qlite.id, path, [
                {
                  type: 'i',
                  value: parseInt(qlite.id),
                },
              ])
            }
          })
        } else {
          let rc = self.config[`qlite${event.options.number}-requestConfirmation`]
          self.log('debug', `Q-Lite #${event.options.number} Request Confirmation is set to ${rc}`)
          let path = rc ? paths.ready_blink : paths.ready_solid
          let status = rc ? 'ready' : 'ready-confirmed'

          self.setVariableValues({
            [`qlite${event.options.number}_status`]: status,
          })
          await self.sendOscMessage(event.options.number, path, [
            {
              type: 'i',
              value: parseInt(event.options.number),
            },
          ])
        }
      }
    };

    actions.go = {
      name: 'Set the Q-Lite state to Go',
      options: [
        {
          type: 'dropdown',
          label: 'Q-Lite #',
          choices: self.buttons,
          id: 'number',
          default: '1',
        },
      ],
      callback: async (event) => {
        if(event.options.number === '0') {
          actionButtons.forEach((qlite) => {
            const status = self.getVariableValue(`qlite${qlite.id}_status`)
            if(status === 'ready' || status === 'ready-confirmed') {
              self.setVariableValues({
                [`qlite${qlite.id}_status`]: 'go',
              })
              self.sendOscMessage(qlite.id, paths.go_solid, [
                {
                  type: 'i',
                  value: parseInt(qlite.id),
                },
              ])
            }
          })
        } else {
          self.setVariableValues({
            [`qlite${event.options.number}_status`]: 'go',
          })
          await self.sendOscMessage(event.options.number, path, [
            {
              type: 'i',
              value: parseInt(event.options.number),
            },
          ])
        }
      }
    }

    actions.clear = {
      name: 'Set the Q-Lite state to Off',
      options: [
        {
          type: 'dropdown',
          label: 'Q-Lite #',
          choices: self.buttons,
          id: 'number',
          default: '1',
        },
      ],
      callback: async (event) => {
        if(event.options.number === '0') {
          actionButtons.forEach((qlite) => {
            self.setVariableValues({
              [`qlite${qlite.id}_status`]: 'off',
            })
            self.sendOscMessage(qlite.id, paths.clear, [
              {
                type: 'i',
                value: parseInt(qlite.id),
              },
            ])
          })
        } else {
          self.setVariableValues({
            [`qlite${event.options.number}_status`]: 'off',
          })
          await self.sendOscMessage(event.options.number, paths.clear, [
            {
              type: 'i',
              value: parseInt(event.options.number),
            },
          ])
        }
      }
    }

    self.setActionDefinitions(actions)
  }

}