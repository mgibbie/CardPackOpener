// statusfx.js — status moves the shared tables (overworld/rules: MOVE_FX, STAT_MOVES) have no entry for, so they did
// nothing in any Poketactica mode until RULES_REV 5 (found by the moves sweep, tools/poketactica/sweep_moves.mjs).
// One small rule per move, as Pokémon has it, on the units the move's shape picked. Pure but for the helpers it is
// handed (h: boost, heal, cure, ev: battle.js's own, so berries, White Herb and the log behave as everywhere else).
//   EXTRA[id](h, u, v, rng) -> true if it did something to v (u: the user; v: one unit in the move's shape)
const ALL5 = { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }, STATS = ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva'];
const foe = (u, v) => v.side !== u.side;
const up = (changes) => (h, u, v) => { h.boost(v, changes); return true; };
const down = (changes) => (h, u, v) => { if (!foe(u, v)) return false; h.boost(v, changes); return true; };
/** Pay a share of max HP for a boost (never the last HP: the move fails if the user cannot afford it). */
const pay = (share, changes) => (h, u) => {
	const cost = Math.floor(u.maxHP * share);
	if (u.hp <= cost) return false;
	u.hp -= cost; h.ev({ t: 'hurt', uid: u.uid, n: cost, why: 'cost' });
	h.boost(u, changes);
	return true;
};
const swap = (keys) => (h, u, v) => {
	if (v === u) return false;
	for (const k of keys) { const t = u.boosts[k] || 0; u.boosts[k] = v.boosts[k] || 0; v.boosts[k] = t; }
	h.ev({ t: 'boost', uid: u.uid, changes: {} }); h.ev({ t: 'boost', uid: v.uid, changes: {} });
	return true;
};
const split = (keys) => (h, u, v) => {
	if (v === u) return false;
	for (const k of keys) { const avg = Math.floor((u.stats[k] + v.stats[k]) / 2); u.stats = { ...u.stats, [k]: avg }; v.stats = { ...v.stats, [k]: avg }; }
	return true;
};
const retype = (types) => (h, u, v) => { if (v.types.length === types.length && types.every((t) => v.types.includes(t))) return false; v.types = types.slice(); h.ev({ t: 'retype', uid: v.uid, types: v.types }); return true; };
const addType = (type) => (h, u, v) => { if (v.types.includes(type)) return false; v.types = [...v.types, type]; h.ev({ t: 'retype', uid: v.uid, types: v.types }); return true; };
const cure = (h, u, v) => { if (!v.status && !v.confused) return false; h.cure(v); return true; };
const grassOnly = (changes) => (h, u, v) => { if (!v.types.includes('Grass')) return false; h.boost(v, changes); return true; };

export const EXTRA = {
	// the user pays HP for power
	bellydrum: (h, u) => { const cost = Math.floor(u.maxHP / 2); if (u.hp <= cost || (u.boosts.atk || 0) >= 6) return false; u.hp -= cost; h.ev({ t: 'hurt', uid: u.uid, n: cost, why: 'cost' }); h.boost(u, { atk: 6 - (u.boosts.atk || 0) }); return true; },
	filletaway: pay(1 / 2, { atk: 2, spa: 2, spe: 2 }),
	clangoroussoul: pay(1 / 3, ALL5),
	// plain boosts the tables lack
	noretreat: (h, u) => { if (u.noRetreat) return false; u.noRetreat = true; h.boost(u, ALL5); return true; },
	geomancy: up({ spa: 2, spd: 2, spe: 2 }),
	charge: up({ spd: 1 }),
	tidyup: up({ atk: 1, spe: 1 }),
	takeheart: (h, u, v) => { h.cure(v); h.boost(v, { spa: 1, spd: 1 }); return true; },
	stockpile: (h, u) => { if ((u.stock || 0) >= 3) return false; u.stock = (u.stock || 0) + 1; h.boost(u, { def: 1, spd: 1 }); return true; },
	swallow: (h, u) => { const n = u.stock || 0; if (!n || u.hp >= u.maxHP) return false; h.heal(u, Math.floor(u.maxHP * [0, 1 / 4, 1 / 2, 1][n])); u.stock = 0; return true; },
	acupressure: (h, u, v, rng) => { const open = STATS.filter((k) => (v.boosts[k] || 0) < 6); if (!open.length) return false; h.boost(v, { [open[Math.floor(rng() * open.length)]]: 2 }); return true; },
	focusenergy: (h, u, v) => { if (v.focus) return false; v.focus = true; h.ev({ t: 'focus', uid: v.uid }); return true; },
	dragoncheer: (h, u, v) => { if (v.focus) return false; v.focus = true; h.ev({ t: 'focus', uid: v.uid }); return true; },
	coaching: up({ atk: 1, def: 1 }),
	aromaticmist: up({ spd: 1 }),
	decorate: up({ atk: 2, spa: 2 }),
	flowershield: grassOnly({ def: 1 }),
	rototiller: grassOnly({ atk: 1, spa: 1 }),
	// lowering a foe
	nobleroar: down({ atk: -1, spa: -1 }),
	partingshot: down({ atk: -1, spa: -1 }),   // (no switching out on a board: the drop is the move)
	venomdrench: (h, u, v) => { if (!foe(u, v) || (v.status !== 'psn' && v.status !== 'tox')) return false; h.boost(v, { atk: -1, spa: -1, spe: -1 }); return true; },
	spicyextract: up({ atk: 2, def: -2 }),
	memento: (h, u, v) => { if (!foe(u, v)) return false; h.boost(v, { atk: -2, spa: -2 }); h.faint(u, 'memento'); return true; },
	strengthsap: (h, u, v) => { if (!foe(u, v) || (v.boosts.atk || 0) <= -6) return false; h.heal(u, h.statNow(v, 'atk')); h.boost(v, { atk: -1 }); return true; },
	// stat stages moved about
	// (Haze is the whole board's, friend and foe: the first unit it reaches clears everyone)
	haze: (h) => { let did = false; for (const x of h.everyone()) { if (!Object.values(x.boosts).some((n) => n)) continue; for (const k of Object.keys(x.boosts)) x.boosts[k] = 0; h.ev({ t: 'boost', uid: x.uid, changes: {}, reset: true }); did = true; } return did; },
	psychup: (h, u, v) => { if (v === u || JSON.stringify(u.boosts) === JSON.stringify(v.boosts)) return false; u.boosts = { ...v.boosts }; h.ev({ t: 'boost', uid: u.uid, changes: {} }); return true; },
	topsyturvy: (h, u, v) => { if (!Object.values(v.boosts).some((n) => n)) return false; for (const k of Object.keys(v.boosts)) v.boosts[k] = -v.boosts[k] || 0; h.ev({ t: 'boost', uid: v.uid, changes: {} }); return true; },
	heartswap: swap(STATS), powerswap: swap(['atk', 'spa']), guardswap: swap(['def', 'spd']),
	speedswap: (h, u, v) => { if (v === u || u.stats.spe === v.stats.spe) return false; const t = u.stats.spe; u.stats = { ...u.stats, spe: v.stats.spe }; v.stats = { ...v.stats, spe: t }; return true; },
	powersplit: split(['atk', 'spa']), guardsplit: split(['def', 'spd']),
	powertrick: (h, u) => { u.stats = { ...u.stats, atk: u.stats.def, def: u.stats.atk }; return u.stats.atk !== u.stats.def; },
	// HP and status
	painsplit: (h, u, v) => { if (v === u) return false; const avg = Math.floor((u.hp + v.hp) / 2); if (avg === u.hp && avg === v.hp) return false; u.hp = Math.min(u.maxHP, avg); v.hp = Math.max(1, Math.min(v.maxHP, avg)); h.ev({ t: 'split', uid: u.uid, target: v.uid }); return true; },
	healbell: cure, aromatherapy: cure, refresh: cure,
	purify: (h, u, v) => { if (!v.status) return false; h.cure(v); h.heal(u, Math.floor(u.maxHP / 2)); return true; },
	psychoshift: (h, u, v) => { if (!u.status || v.status || v === u) return false; const st = u.status; if (!h.status(u, v, st)) return false; h.cure(u); return true; },
	// types
	soak: retype(['Water']), magicpowder: retype(['Psychic']), camouflage: retype(['Normal']),
	forestscurse: addType('Grass'), trickortreat: addType('Ghost'),
	reflecttype: (h, u, v) => { if (v === u || JSON.stringify(u.types) === JSON.stringify(v.types)) return false; u.types = v.types.slice(); h.ev({ t: 'retype', uid: u.uid, types: u.types }); return true; },
	conversion: (h, u) => { const t = h.firstMoveType(u); if (!t || (u.types.length === 1 && u.types[0] === t)) return false; u.types = [t]; h.ev({ t: 'retype', uid: u.uid, types: u.types }); return true; },
};
export const hasExtra = (id) => Object.prototype.hasOwnProperty.call(EXTRA, id);

/** Moves that answer the last hit the user took (the engine remembers it from RULES_REV 5: unit.lastHit = { n, phys }). */
const ANSWER = { counter: [2, true], mirrorcoat: [2, false], metalburst: [1.5, null], comeuppance: [1.5, null], bide: [2, null] };
export const isAnswer = (id) => Object.prototype.hasOwnProperty.call(ANSWER, id);
/** -> the damage it deals back (0: nothing to answer, or the wrong kind of hit) */
export function answerDamage(id, u) {
	const a = ANSWER[id], last = u.lastHit;
	if (!a || !last || !last.n || (a[1] != null && a[1] !== !!last.phys)) return 0;
	return Math.max(1, Math.floor(last.n * a[0]));
}
