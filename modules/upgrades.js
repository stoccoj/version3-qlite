// Upgrade scripts are applied by index, so this array must never shrink or be reordered.
// Index 0 was originally copied from the Generic OSC module (send_multiple sanitise), which does not apply to this
// module. It is kept as a no-op so the upgrade index already recorded for existing connections stays valid.
module.exports = [
	function noopLegacyUpgrade() {
		return {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: [],
		}
	},
]
