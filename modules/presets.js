const { combineRgb } = require('@companion-module/base')
const { off} = require("./styles");

module.exports = {
  initPresets() {
    let self = this; // required to have reference to outer `this`
    const count = Number(self.config?.numberOfQlites ?? 1)

    const presets = [];

    for (let i = 1; i <= count; i++) {
      presets.push({
        category: `Q-Lite #${i} Buttons`,
        name: `Q-Lite #${i} Ready`,
        type: 'button',
        style: {
          text: `Ready\n#${i}`,
          size: '18',
          color: off.color,
          bgcolor: off.bgcolor,
        },
        steps: [
          {
            down: [
              { actionId: 'ready', options: { number: String(i) } },
            ]
          }
        ],
        feedbacks: [
          { feedbackId: 'ready', options: { number: String(i) } },
          { feedbackId: 'ready_confirmed', options: { number: String(i) } },
        ]
      });

      presets.push({
        category: `Q-Lite #${i} Buttons`,
        name: `Q-Lite #${i} Go`,
        type: 'button',
        style: {
          text: `Go\n#${i}`,
          size: '18',
          color: off.color,
          bgcolor: off.bgcolor,
        },
        steps: [
          {
            down: [
              { actionId: 'go', options: { number: String(i) } },
            ]
          }
        ],
        feedbacks: [
          { feedbackId: 'go', options: { number: String(i) } }
        ]
      });

      presets.push({
        category: `Q-Lite #${i} Buttons`,
        name: `Q-Lite #${i} Clear`,
        type: 'button',
        style: {
          text: `Clear\n#${i}`,
          size: '18',
          color: off.color,
          bgcolor: off.bgcolor,
        },
        steps: [
          {
            down: [
              { actionId: 'clear', options: { number: String(i) } },
            ]
          }
        ]
      });
    }

    presets.push({
      category: `Q-Lite General Buttons`,
      name: `Q-Lite Ready All`,
      type: 'button',
      style: {
        text: `Ready\nAll`,
        size: '18',
        color: off.color,
        bgcolor: off.bgcolor,
      },
      steps: [
        {
          down: [
            { actionId: 'ready', options: { number: '0' } },
          ]
        }
      ]
    });

    presets.push({
      category: `Q-Lite General Buttons`,
      name: `Q-Lite Go All Ready`,
      type: 'button',
      style: {
        text: `Go All\nReady`,
        size: '18',
        color: off.color,
        bgcolor: off.bgcolor,
      },
      steps: [
        {
          down: [
            { actionId: 'go', options: { number: '0' } },
          ]
        }
      ]
    });

    presets.push({
      category: `Q-Lite General Buttons`,
      name: `Q-Lite Clear All`,
      type: 'button',
      style: {
        text: `Clear\nAll`,
        size: '18',
        color: off.color,
        bgcolor: off.bgcolor,
      },
      steps: [
        {
          down: [
            { actionId: 'clear', options: { number: '0' } },
          ]
        }
      ]
    });

    this.setPresetDefinitions(presets);
  },
}