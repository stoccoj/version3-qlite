// Fallbacks for configs saved before these fields existed (setInterval/setTimeout with undefined runs every ~1 ms)
const DEFAULT_RATE = 1000
const DEFAULT_ON_TIME = 1000
const DEFAULT_OFF_TIME = 500

const msOrDefault = (value, fallback) => {
	const ms = Number(value)
	return Number.isFinite(ms) && ms >= 100 ? ms : fallback
}

module.exports = {
	startInterval: function () {
		let self = this
		self.stopInterval()

		if (self.config.specifyCustomOnOff) {
			self.flipTimeout()
		} else {
			self.INTERVAL = setInterval(
				() => {
					self.boolValue = !self.boolValue
					self.checkFeedbacks()
				},
				msOrDefault(self.config.rate, DEFAULT_RATE),
			)
		}
	},

	flipTimeout() {
		let self = this

		self.boolValue = !self.boolValue
		self.checkFeedbacks()

		self.INTERVAL = setTimeout(
			() => {
				self.flipTimeout()
			},
			self.boolValue
				? msOrDefault(self.config.onTime, DEFAULT_ON_TIME)
				: msOrDefault(self.config.offTime, DEFAULT_OFF_TIME),
		)
	},

	stopInterval: function () {
		let self = this
		clearInterval(self.INTERVAL)
		clearTimeout(self.INTERVAL)
		self.INTERVAL = null
	},

	setOnOffTimes: function (onTime, offTime) {
		let self = this
		self.config.onTime = onTime
		self.config.offTime = offTime
		self.checkVariables()
		self.saveConfig(self.config)
		self.startInterval()
	},

	setRate: function (rate) {
		let self = this
		self.config.rate = rate
		self.checkVariables()
		self.saveConfig(self.config)
		self.startInterval()
	},
}
