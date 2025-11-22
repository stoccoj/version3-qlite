module.exports = {

  paths: {
    ready_blink: '/led/red/blink',
    ready_solid: '/led/red/solid',
    go_blink: '/led/green/blink',
    go_solid: '/led/green/solid',
    hold_blink: '/led/hold/blink',
    hold_solid: '/led/hold/solid',
    clear: '/led/off',
  },

  sendOscMessage: async function(id, path, args, type) {
    let self = this; // required to have reference to outer `this`

    const args_json = JSON.stringify(args)
    const args_string = args.map((item) => item.value).join(' ')
    const host = self.config[`qlite${id}-host`]
    const port = self.config[`qlite${id}-targetPort`]

    self.log('debug', `Sending OSC [${host}:${port} ${path}`)
    self.log('debug', `Sending Args ${args_json}`)

    if (self.config.protocol === 'udp') {
      //Update Variables
      self.setVariableValues({
        [`qlite${id}_latest_sent_raw`]: `${path} ${args_string}`,
        [`qlite${id}_latest_sent_path`]: path,
        [`qlite${id}_latest_sent_args`]: args.length > 0 ? args.map((arg) => arg.value) : undefined,
        [`qlite${id}_latest_sent_timestamp`]: Date.now(),
      })

      self.oscSend(host, port, path, args)
    } else {
      await self.client
          .sendCommand(path, args)
          .then(() => {
            self.log('info', `${self.config.protocol} Command sent successfully. Path: ${path}, Args: ${args_json}`)
          })
          .catch((err) => {
            self.log('error', `Failed to send ${self.config.protocol} command:`, err.message)
          })
    }
  }

}