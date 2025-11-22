const { InstanceBase, Regex, runEntrypoint } = require('@companion-module/base')
const UpgradeScripts = require('./modules/upgrades')
const configFields = require('./modules/configFields')
const osc = require('./modules/osc')
const blink = require('./modules/blink')
const actions = require('./modules/actions')
const feedbacks = require('./modules/feedbacks')
const variables = require('./modules/variables')
const presets = require('./modules/presets')
const { resolveHostname, isValidIPAddress, setupOSC } = require('./helpers.js')

class OSCInstance extends InstanceBase {
  constructor(internal) {
    super(internal)

    this.INTERVAL = null;
    this.boolValue = false; // blink - this will get flipped every time the interval runs

    this.buttons = [
      { id: '0', label: 'All' },
    ]

    Object.assign(this, {
      ...configFields,
      ...osc,
      ...blink,
      ...actions,
      ...feedbacks,
      ...variables,
      ...presets,
    })
  }

  //Initialization
  async init(config) {
    this.config = config
    this.targetHost
    this.client

    const count = Number(config?.numberOfQlites ?? 1)
    for (let i = 1; i <= count; i++) {
      this.buttons.push({ id: String(i), label: String(i) })
    }

    this.onDataReceived = {}

    let validate = false

    const host = this.config['qlite1-host']
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
      if (this.targetHost && (this.config['qlite1-targetPort'] || this.config.feedbackPort)) {
        setupOSC(this)

        if (validate) {
          this.setupListeners()
        }
      }
    } else {
      this.updateStatus('ok')
    }

    this.initActions()
    this.initFeedbacks()
    this.initVariables()
    this.initPresets()
    this.startInterval()
  }
  // When module gets deleted
  async destroy() {
    //close out any connections
    this.stopInterval();
    this.log('debug', 'destroy')
  }

  async configUpdated(config) {
    this.config = config

    const count = Number(config?.numberOfQlites ?? 1)
    for (let i = 1; i <= count; i++) {
      this.buttons.push({ id: String(i), label: String(i) })
    }

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
    if (!this.config['qlite1-host']) {
      this.updateStatus('bad_config')
      this.log('warn', 'No host specified in config (null)')
    } else if (!this.config['qlite1-targetPort']) {
      this.updateStatus('bad_config')
      this.log('warn', 'No targetPort specified in config (null)')
    } else if (!isValidIPAddress(this.config['qlite1-host'])) {
      await resolveHostname(this, this.config['qlite1-host'])
          .then((ip) => {
            this.targetHost = ip
            validate = true
          })
          .catch((err) => {
            this.log('error', `Unable to resolve hostname for ${this.config['qlite1-host']}: ${err.message}`)
            this.updateStatus('bad_config')
            validate = false
          })
    } else {
      this.targetHost = this.config['qlite1-host']
      validate = true
    }

    if (!validate) {
      return
    }

    setupOSC(this)

    this.setupListeners()
    this.initFeedbacks();
    this.initPresets();
    this.startInterval();
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

}

runEntrypoint(OSCInstance, UpgradeScripts)
