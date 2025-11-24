const { combineRgb } = require("@companion-module/base");

module.exports = {
  off: {
    color: combineRgb(255, 255, 255),    // text color (white)
    bgcolor: combineRgb(0, 0, 0),    // background (black)
  },
  hold: {
    color: combineRgb(255, 255, 255),    // text color (white)
    bgcolor: combineRgb(255, 0, 0),    // background (red)
  },
  ready: {
    color: combineRgb(0, 0, 0),    // text color (white)
    bgcolor: combineRgb(255, 255, 0),    // background (yellow)
  },
  go: {
    color: combineRgb(0, 0, 0),    // text color (black)
    bgcolor: combineRgb(0, 255, 0),    // background (green)
  }
}