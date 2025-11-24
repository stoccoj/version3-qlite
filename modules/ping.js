const { exec } = require('child_process')

module.exports = {

  startPingMonitor(qlite_number, ip) {
    let self = this
    let isOnline = false

    const ping = () => {
      exec(`ping -c 1 ${ip}`, (error) => {
        isOnline = !error
        self.setVariableValues({ [`qlite${qlite_number}_online`]: isOnline })
      })
    }

    // Initial ping
    ping()
    const interval = setInterval(ping, 10000)

    // Return a function to get the current status and a stop function
    return {
      getStatus: () => isOnline,
      stop: () => clearInterval(interval)
    }
  }

}