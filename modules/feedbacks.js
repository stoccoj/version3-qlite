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
        const isReadyConfirmed = status === 'ready-confirmed' && hold_status !== 'yes'

        /** Can be used to dynamically set colors based on config
        const readyColor = {
          color: self.config[`qlite${qliteNumber}-readyTxtColor`],
          bgcolor: self.config[`qlite${qliteNumber}-readyBgColor`],
        }
        **/

        if(isReady) {
          return self.boolValue ? ready : off
        }
        if(isReadyConfirmed) {
          return ready
        }

        return off
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

    self.setFeedbackDefinitions(feedbacks);
  }
}