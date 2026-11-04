// contest.js — the CONDITION side of Pokémon Contests: the per-move contest data
// lookup, a mon's condition and berry feeding (the berry blender corner), from
// data/contest.json (harvested from pokeemerald by tools/gen_contest.mjs).
//
// The contest itself — pokeemerald's rules, rule for rule — is contest_engine.js,
// played by contest_ui.js.

export const CATS = ['cool', 'beauty', 'cute', 'smart', 'tough'];
export const RANKS = ['NORMAL', 'SUPER', 'HYPER', 'MASTER'];
export const FLAVOR2CAT = { spicy: 'cool', dry: 'beauty', sweet: 'cute', bitter: 'smart', sour: 'tough' };
// a move with no harvested data (custom/fakemon moves) appeals by its TYPE
const TYPE2CAT = {
	Fire: 'cool', Fighting: 'cool', Electric: 'cool', Dragon: 'cool',
	Water: 'beauty', Ice: 'beauty', Grass: 'beauty', Flying: 'beauty',
	Normal: 'cute', Fairy: 'cute', Psychic: 'smart', Ghost: 'smart', Dark: 'smart', Poison: 'smart',
	Rock: 'tough', Ground: 'tough', Steel: 'tough', Bug: 'tough',
};
const MAX_COND = 255, MAX_SHEEN = 255;

export const Contest = {
	data: null, // set by the host: the parsed contest.json
	init(data) { this.data = data; },

	moveInfo(id, battleType) {
		const m = this.data?.moves?.[id];
		if (m) return m;
		return { cat: TYPE2CAT[battleType] || 'cute', fx: 'HIGHLY_APPEALING', appeal: 30, jam: 0, type: 'APPEAL' };
	},

	cond(mon) {
		if (!mon.contest) mon.contest = { cool: 0, beauty: 0, cute: 0, smart: 0, tough: 0, sheen: 0 };
		return mon.contest;
	},

	// feed one berry: flavors raise their categories, smoothness fills sheen.
	// Returns { gains, sheen } or null when the mon can't eat another (sheen full).
	feed(mon, berryId) {
		const b = this.data?.berries?.[berryId];
		if (!b) return null;
		const c = this.cond(mon);
		if (c.sheen >= MAX_SHEEN) return null;
		const gains = {};
		for (const [flavor, cat] of Object.entries(FLAVOR2CAT)) {
			const v = b[flavor] | 0;
			if (v <= 0) continue;
			const before = c[cat];
			c[cat] = Math.min(MAX_COND, c[cat] + v);
			if (c[cat] > before) gains[cat] = c[cat] - before;
		}
		c.sheen = Math.min(MAX_SHEEN, c.sheen + Math.max(1, Math.round((b.smooth | 0) / 2)));
		return { gains, sheen: c.sheen };
	},

};
