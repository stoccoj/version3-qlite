const paths = require('./osc').paths

const handle_ready = async function(root, qlite_number) {
  const rc = root.config[`qlite${qlite_number}-requestReadyConfirmation`]
  root.log('debug', `Q-Lite #${qlite_number} Request Confirmation is set to ${rc}`)
  let path = rc ? paths.ready_blink : paths.ready_solid
  let status = rc ? 'ready' : 'ready-confirmed'

  root.setVariableValues({
    [`qlite${qlite_number}_status`]: status,
  })
  await root.sendOscMessage(qlite_number, path)
}

const handle_go = async function(root, qlite_number) {
  const rc = root.config[`qlite${qlite_number}-requestGoConfirmation`]
  root.log('debug', `Q-Lite #${qlite_number} Request Confirmation is set to ${rc}`)
  let path = rc ? paths.go_blink : paths.go_solid
  let status = rc ? 'go' : 'go-confirmed'

  root.setVariableValues({
    [`qlite${qlite_number}_status`]: status,
  })
  await root.sendOscMessage(qlite_number, path)

  let autoClear = root.config[`autoClear`]
  root.log('debug', `Auto Clear is set to ${autoClear}`)
  if (autoClear === true || autoClear === 'true') {
    let autoClearTime = parseInt(root.config[`autoClearTime`])
    root.log('debug', `Auto Clear is enabled, will clear Q-Lite #${qlite_number} in ${autoClearTime} seconds if still in 'go' state`)
    setTimeout(() => {
      let qlite_status = root.getVariableValue(`qlite${qlite_number}_status`)
      root.log('debug', `Auto Clear check for Q-Lite #${qlite_number}, status is ${qlite_status}`)
      if (qlite_status === 'go' || qlite_status === 'go-confirmed') {
        handle_clear(root, qlite_number)
      }
    }, autoClearTime * 1000)
  }
}

const handle_clear = async function(root, qlite_number) {
  root.setVariableValues({
    [`qlite${qlite_number}_hold`]: 'off',
    [`qlite${qlite_number}_status`]: 'off',
  })
  await root.sendOscMessage(qlite_number, paths.clear)
}

const handle_hold = async function(root, qlite_number) {
  let qlite_status = root.getVariableValue(`qlite${qlite_number}_status`)
  let current_qlite_hold = root.getVariableValue(`qlite${qlite_number}_hold`)

  root.log('debug', `Q-Lite #${qlite_number} hold is currently ${current_qlite_hold}`)
  let qlite_hold = current_qlite_hold === 'on' || current_qlite_hold === 'blink' ? 'off' : 'on'
  root.log('debug', `Q-Lite #${qlite_number} hold is now ${qlite_hold}`)
  root.setVariableValues({
    [`qlite${qlite_number}_hold`]: qlite_hold,
  })

  if(qlite_hold === 'on') {
    await root.sendOscMessage(qlite_number, paths.hold_blink)
  } else {
    await root.sendOscMessage(qlite_number, paths.hold_off)
    if(qlite_status === 'ready') {
      await root.sendOscMessage(qlite_number, paths.ready_blink)
    } else if(qlite_status === 'ready-confirmed') {
      await root.sendOscMessage(qlite_number, paths.ready_solid)
    } else if(qlite_status === 'go') {
      await root.sendOscMessage(qlite_number, paths.go_solid)
    }
  }
}

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
            handle_ready(self, qlite.id)
          })
        } else {
          await handle_ready(self, event.options.number)
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
              handle_go(self, qlite.id)
            }
          })
        } else {
          await handle_go(self, event.options.number)
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
            handle_clear(self, qlite.id)
          })
        } else {
          await handle_clear(self, event.options.number)
        }
      }
    }

    actions.hold = {
      name: 'Set the Q-Lite state to Hold',
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
            handle_hold(self, qlite.id)
          })
        } else {
          await handle_hold(self, event.options.number)
        }
      }
    }

    self.setActionDefinitions(actions)
  }

}