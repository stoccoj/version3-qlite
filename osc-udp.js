const dgram = require('dgram')
const { InstanceStatus } = require('@companion-module/base')
const { onDataHandler } = require('./osc-feedback.js')

// Listens for OSC feedback from the Q-Lites. Outgoing messages are sent with Companion's built-in oscSend.
class OSCUDPClient {
	constructor(root, port) {
		this.root = root
		this.port = Number(port)
		this.connected = false
		this.socket = null
	}

	openConnection() {
		if (this.connected) {
			this.root.log('info', 'UDP connection is already open')
			return Promise.resolve()
		}

		return new Promise((resolve, reject) => {
			this.root.updateStatus(InstanceStatus.Connecting)
			this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

			this.socket.on('error', (err) => {
				this.root.log('warn', `Socket error: ${err.message}`)
				const wasConnected = this.connected
				this.closeSocket()
				if (wasConnected) {
					this.root.setConfigStatus(InstanceStatus.ConnectionFailure, err.message)
				}
				reject(new Error(`Socket error: ${err.message}`))
			})

			this.socket.on('message', (msg, rinfo) => {
				this.root.log('debug', `Received UDP message from ${rinfo.address}:${rinfo.port}`)

				this.root.setVariableValues({
					latest_received_client: rinfo.address,
					latest_received_port: rinfo.port,
				})

				onDataHandler(this.root, rinfo, msg)
			})

			this.socket.bind({ address: '0.0.0.0', port: this.port }, () => {
				this.root.log('info', `Listening for OSC messages on port ${this.port}`)
				this.connected = true
				resolve()
			})
		})
	}

	closeSocket() {
		if (this.socket) {
			try {
				this.socket.close()
			} catch {
				// Already closed
			}
			this.socket = null
		}
		this.connected = false
	}

	closeConnection() {
		if (this.socket) {
			this.closeSocket()
			this.root.log('info', 'UDP listener closed')
		}
		return Promise.resolve()
	}

	isConnected() {
		return this.connected
	}
}

module.exports = OSCUDPClient
