// contest.js — Pokémon Contests, the faithful-lite engine (no DOM, node-testable).
//
// Data (overworld/data/contest.json, harvested from pokeemerald by
// tools/gen_contest.mjs): per-move category/appeal/jam/effect + the combo
// graph, the 96 real contest opponents, and berry flavors.
//
// The shape of the real thing, kept: five categories × four ranks, condition
// raised by BERRY FEEDING (the simplified Pokéblock — flavor -> its category,
// smoothness -> sheen, and a full-sheen mon can't eat more), a five-turn
// appeal round against three real opponents, combos, startles (jam), the
// crowd meter, and a RIBBON on the winning Pokémon.
//
// What's deliberately lite: appeal order is shuffled each turn (the real
// next-turn-order effects act on it but the full ordering dance isn't
// modeled), and only the load-bearing effect families are simulated — the
// rest appeal at face value.

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

	// pick 3 opponents for this category+rank (rank-true; pool-preferred)
	pickOpponents(category, rank, rng = Math.random) {
		const all = (this.data?.opponents || []).filter(o => o.rank === rank);
		const pooled = all.filter(o => o.pools[category]);
		const src = pooled.length >= 3 ? pooled : all;
		const picks = [];
		const bag = [...src];
		while (picks.length < 3 && bag.length) picks.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
		return picks;
	},

	// a new five-turn contest. `mon` is the player's live party member; the
	// battleTypes callback maps a move id to its battle type for the fallback.
	start({ category, rank, mon, rng = Math.random, battleTypes = () => null }) {
		const opps = this.pickOpponents(category, rank, rng);
		const me = {
			me: true, name: mon.nickname || mon.name, species: mon.speciesId, mon,
			moves: mon.moves.map(m => m.id),
			cond: { ...this.cond(mon) },
		};
		const cs = [me, ...opps.map(o => ({
			me: false, name: o.nick, species: o.species, trainer: o.trainer,
			moves: o.moves, cond: { ...o.cond, sheen: o.sheen },
		}))];
		for (const c of cs) Object.assign(c, { total: 0, lastMove: null, lockout: false, jamShield: 0, jamSusceptible: 1 });
		return { category, rank, turn: 0, turns: 5, crowd: 0, cs, rng, battleTypes, done: false, log: [] };
	},

	// simple, honest AI: best usable appeal, category preferred, combos taken
	aiPick(st, c) {
		if (c.lockout) return null;
		let best = null, bestScore = -1;
		for (const id of c.moves) {
			const mi = this.moveInfo(id, st.battleTypes(id));
			let score = mi.appeal + (mi.cat === st.category ? 15 : 0);
			if (c.lastMove) {
				const prev = this.moveInfo(c.lastMove, st.battleTypes(c.lastMove));
				if (prev.starter && (mi.combos || []).includes(prev.starter)) score += mi.appeal; // the combo doubles
				if (c.lastMove === id) score -= 20; // boring
			}
			if (score > bestScore) { bestScore = score; best = id; }
		}
		return best;
	},

	// play one full turn; playerMove is the id the player chose (null = pass).
	// Appends per-contestant entries to st.log and returns them.
	playTurn(st, playerMove) {
		if (st.done) return [];
		const order = [...st.cs].sort(() => st.rng() - 0.5);
		const entries = [];
		const appealedBefore = [];
		for (const c of order) {
			const id = c.me ? (c.lockout ? null : playerMove) : this.aiPick(st, c);
			const e = { who: c.name, me: c.me, move: id, hearts: 0, notes: [] };
			if (!id) {
				e.notes.push(c.lockout ? 'was too spent to move!' : 'stood still.');
				entries.push(e); st.log.push(e); c.lastMove = null; appealedBefore.push(c);
				continue;
			}
			const mi = this.moveInfo(id, st.battleTypes(id));
			let hearts = mi.appeal;
			// boring repetition (unless the move thrives on it)
			if (c.lastMove === id && mi.fx !== 'REPETITION_NOT_BORING') { hearts = Math.floor(hearts / 2); e.notes.push('repeated itself...'); }
			// combo: last turn set the starter this move continues
			if (c.lastMove && c.lastMove !== id) {
				const prev = this.moveInfo(c.lastMove, st.battleTypes(c.lastMove));
				if (prev.starter && (mi.combos || []).includes(prev.starter)) { hearts *= 2; e.notes.push('COMBO!'); }
			}
			// the load-bearing effect families
			switch (mi.fx) {
				case 'USER_MORE_EASILY_STARTLED': c.jamSusceptible = 2; break;
				case 'GREAT_APPEAL_BUT_NO_MORE_MOVES': c.lockout = true; e.notes.push('gave it everything!'); break;
				case 'AVOID_STARTLE_ONCE': case 'AVOID_STARTLE': case 'AVOID_STARTLE_SLIGHTLY': case 'USER_LESS_EASILY_STARTLED':
					c.jamShield = 1; e.notes.push('braced itself.'); break;
				case 'BETTER_IF_LAST': if (order[order.length - 1] === c) { hearts *= 2; e.notes.push('a grand finale!'); } break;
				case 'BETTER_IF_FIRST': if (order[0] === c) { hearts *= 2; e.notes.push('a bold opener!'); } break;
				case 'BETTER_WHEN_AUDIENCE_EXCITED': hearts += st.crowd * 10; break;
			}
			// startle (jam) the earlier appeals this turn
			if (mi.jam > 0 && appealedBefore.length) {
				const targets = mi.type === 'STARTLE_MON' ? [appealedBefore[appealedBefore.length - 1]] : appealedBefore;
				for (const t of targets) {
					if (t.jamShield > 0) { t.jamShield = 0; continue; }
					const dent = mi.jam * t.jamSusceptible;
					t.total = Math.max(0, t.total - dent);
					e.notes.push(`startled ${t.name}! (-${dent})`);
				}
			}
			// the crowd loves on-category appeals; five hearts bursts into a spectacle
			if (mi.cat === st.category) {
				st.crowd++;
				if (st.crowd >= 5) { st.crowd = 0; hearts += 30; e.notes.push('The crowd went WILD!'); }
			}
			e.hearts = hearts;
			e.cat = mi.cat;
			c.total += hearts;
			c.lastMove = id;
			appealedBefore.push(c);
			e.turn = st.turn;
			entries.push(e); st.log.push(e);
		}
		st.turn++;
		if (st.turn >= st.turns) {
			st.done = true;
			st.placements = this.judge(st);
		}
		return entries;
	},

	// final score: the category condition (+ sheen shine) carries round one,
	// the appeals carry round two at double weight — the Emerald proportions.
	judge(st) {
		const scored = st.cs.map(c => ({
			...c,
			score: (c.cond[st.category] | 0) + Math.round((c.cond.sheen | 0) / 4) + c.total * 2,
		}));
		scored.sort((a, b) => b.score - a.score);
		return scored;
	},
};
