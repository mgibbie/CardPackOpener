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

// ---------- RULES_REV 6: marks that last (unit.fx = { name: turns left }), Leech Seed (unit.seed = who planted it),
// abilities meddled with. What each mark DOES is in battle.js where it applies (a screen halves a hit, Taunt refuses a
// status move ...); how they wear off and what bites every turn is upkeep() below.
export const MARK_TURNS = 5, FOREVER = 999;
const mark = (name, turns = MARK_TURNS, onlyFoe = false) => (h, u, v) => { if (onlyFoe && !foe(u, v)) return false; v.fx = { ...(v.fx || {}), [name]: turns }; h.ev({ t: 'mark', uid: v.uid, what: name, turns }); return true; };
const self = (name, turns) => (h, u) => { u.fx = { ...(u.fx || {}), [name]: turns }; h.ev({ t: 'mark', uid: u.uid, what: name, turns }); return true; };
const setAbility = (h, v, ab) => { if (v.ability === ab) return false; v.ability = ab; h.ev({ t: 'ability', uid: v.uid, ability: ab }); return true; };
export const EXTRA6 = {
	// screens and guards: on each ally the move's shape reaches, for 5 turns
	reflect: mark('reflect'), lightscreen: mark('lightscreen'),
	auroraveil: (h, u, v) => { v.fx = { ...(v.fx || {}), reflect: MARK_TURNS, lightscreen: MARK_TURNS }; h.ev({ t: 'mark', uid: v.uid, what: 'auroraveil', turns: MARK_TURNS }); return true; },
	safeguard: mark('safeguard'), luckychant: mark('luckychant'),
	// on a foe
	taunt: mark('taunt', 3, true), healblock: mark('healblock', MARK_TURNS, true),
	foresight: mark('identified', FOREVER, true), odorsleuth: mark('identified', FOREVER, true),
	leechseed: (h, u, v) => { if (!foe(u, v) || v.seed || v.types.includes('Grass')) return false; v.seed = u.uid; h.ev({ t: 'mark', uid: v.uid, what: 'leechseed' }); return true; },
	yawn: (h, u, v) => { if (!foe(u, v) || v.status || (v.fx && v.fx.yawn) || (v.fx && v.fx.safeguard)) return false; v.fx = { ...(v.fx || {}), yawn: 2 }; h.ev({ t: 'mark', uid: v.uid, what: 'yawn', turns: 2 }); return true; },
	nightmare: (h, u, v) => { if (!foe(u, v) || v.status !== 'slp' || (v.fx && v.fx.nightmare)) return false; v.fx = { ...(v.fx || {}), nightmare: FOREVER }; h.ev({ t: 'mark', uid: v.uid, what: 'nightmare' }); return true; },
	spite: (h, u, v) => { const id = foe(u, v) && Object.keys(v.pp || {}).find((k) => v.pp[k] > 0); if (!id) return false; v.pp[id] = Math.max(0, v.pp[id] - 4); h.ev({ t: 'spite', uid: v.uid, move: id }); return true; },
	// on the user / an ally
	aquaring: self('aquaring', FOREVER), ingrain: self('ingrain', FOREVER), wish: self('wish', 2),
	endure: self('endure', 1), lockon: self('sureHit', 2), mindreader: self('sureHit', 2), laserfocus: self('sureCrit', 2),
	helpinghand: (h, u, v) => { if (v === u) return false; v.fx = { ...(v.fx || {}), helped: 2 }; h.ev({ t: 'mark', uid: v.uid, what: 'helped', turns: 2 }); return true; },
	// abilities
	gastroacid: (h, u, v) => foe(u, v) && setAbility(h, v, null),
	worryseed: (h, u, v) => foe(u, v) && setAbility(h, v, 'insomnia'),
	simplebeam: (h, u, v) => foe(u, v) && setAbility(h, v, 'simple'),
	entrainment: (h, u, v) => v !== u && setAbility(h, v, u.ability),
	roleplay: (h, u, v) => v !== u && !!v.ability && setAbility(h, u, v.ability),
	doodle: (h, u, v) => v !== u && !!v.ability && setAbility(h, u, v.ability),
	skillswap: (h, u, v) => { if (v === u || u.ability === v.ability) return false; const t = u.ability; setAbility(h, u, v.ability); setAbility(h, v, t); return true; },
};
/** What a mark is called, and its tag over a unit's HP bar. */
export const MARK_SAY = { reflect: ['Reflect', 'RFL'], lightscreen: ['Light Screen', 'LSC'], auroraveil: ['Aurora Veil', 'VEIL'], safeguard: ['Safeguard', 'SAFE'], luckychant: ['Lucky Chant', 'LUCK'],
	taunt: ['Taunted', 'TAUNT'], healblock: ['Heal Block', 'NOHEAL'], identified: ['Identified', 'SEEN'], leechseed: ['Seeded', 'SEED'], yawn: ['Drowsy', 'YAWN'], nightmare: ['Nightmare', 'NMARE'],
	aquaring: ['Aqua Ring', 'RING'], ingrain: ['Ingrain', 'ROOT'], wish: ['Wish', 'WISH'], endure: ['Endure', 'ENDURE'], sureHit: ['Lock-On', 'AIM'], sureCrit: ['Laser Focus', 'CRIT'], helped: ['Helping Hand', 'HELP'],
	focus: ['Focus Energy', 'FOCUS'], stock: ['Stockpile', 'STOCK'],
	// (rev 10: statusfx2.js)
	mist: ['Mist', 'MIST'], float: ['Floating', 'FLOAT'], tailwind: ['Tailwind', 'WIND'], attract: ['Infatuated', 'LOVE'], trapped: ['Trapped', 'TRAP'], octolock: ['Octolock', 'LOCK'], torment: ['Tormented', 'TORM'],
	disable: ['Disabled', 'DISAB'], encore: ['Encore', 'ENCORE'], wideguard: ['Wide Guard', 'WIDE'], quickguard: ['Quick Guard', 'QUICK'], magiccoat: ['Magic Coat', 'COAT'], center: ['Centre of attention', 'HERE'], sub: ['Substitute', 'SUB'] };
/** The lasting effects on a unit, for the page. -> [{ id, name, tag, turns? }] (turns: what is left, when it runs out) */
export function marksOf(u) {
	const out = [];
	if (!u) return out;
	for (const [k, n] of Object.entries(u.fx || {})) if (n > 0 && MARK_SAY[k]) out.push({ id: k, name: MARK_SAY[k][0], tag: MARK_SAY[k][1], ...(n < FOREVER / 2 ? { turns: n } : {}) });
	if (u.seed) out.push({ id: 'leechseed', name: MARK_SAY.leechseed[0], tag: MARK_SAY.leechseed[1] });
	if (u.focus) out.push({ id: 'focus', name: MARK_SAY.focus[0], tag: MARK_SAY.focus[1] });
	if (u.sub) out.push({ id: 'sub', name: MARK_SAY.sub[0], tag: MARK_SAY.sub[1] });
	if (u.stock) out.push({ id: 'stock', name: MARK_SAY.stock[0] + ' ×' + u.stock, tag: MARK_SAY.stock[1] + u.stock });
	return out;
}
export const hasExtra6 = (id) => Object.prototype.hasOwnProperty.call(EXTRA6, id);
export const has = (u, name) => !!(u.fx && u.fx[name]);

/**
 * Every turn of a unit's (a battle: the end of its side's phase; the maze: every 10th turn of its own, as a burn bites
 * there): Leech Seed drains, Aqua Ring and Ingrain heal, a Nightmare bites a sleeper, and the marks count down (a Wish
 * comes true, a Yawn puts it to sleep).
 */
export function upkeep(h, u) {
	if (u.hp <= 0) return;
	if (u.seed) {
		const by = h.unit(u.seed);
		if (!by || by.hp <= 0) u.seed = null;
		else { const n = Math.min(u.hp, Math.max(1, Math.floor(u.maxHP / 8))); h.hurt(u, n, 'leechseed'); h.heal(by, n); }
	}
	const fx = u.fx;
	if (!fx || u.hp <= 0) return;
	if ((fx.aquaring || fx.ingrain) && u.hp < u.maxHP) h.heal(u, Math.max(1, Math.floor(u.maxHP / 16)));
	if (fx.nightmare) { if (u.status === 'slp') h.hurt(u, Math.max(1, Math.floor(u.maxHP / 4)), 'nightmare'); else delete fx.nightmare; }
	for (const k of Object.keys(fx)) {
		if (--fx[k] > 0) continue;
		delete fx[k];
		if (u.hp <= 0) continue;
		if (k === 'wish') h.heal(u, Math.floor(u.maxHP / 2));
		else if (k === 'yawn' && !u.status) h.status(u, u, 'slp');
	}
}

/**
 * What an 'ability' event says on screen. Two kinds share the name: an ability that FIRED ({ ab }: Intimidate, Sturdy ...)
 * is named; an ability that was CHANGED by a move ({ ability }: Skill Swap, Gastro Acid ...) says so.
 * names: id -> the ability's name (species_abilities.json's _names). -> { pop, line } (line follows the unit's name)
 */
export function abilitySay(e, names) {
	if (e.ab) { const n = (names && names[e.ab]) || e.ab; return { pop: n + '!', line: "'s " + n }; }
	return e.ability ? { pop: 'Ability changed', line: "'s ability changed" } : { pop: 'Ability gone', line: ' lost its ability' };
}
/** Moves that answer the last hit the user took (the engine remembers it from RULES_REV 5: unit.lastHit = { n, phys }). */
const ANSWER = { counter: [2, true], mirrorcoat: [2, false], metalburst: [1.5, null], comeuppance: [1.5, null], bide: [2, null] };
export const isAnswer = (id) => Object.prototype.hasOwnProperty.call(ANSWER, id);
/** -> the damage it deals back (0: nothing to answer, or the wrong kind of hit) */
export function answerDamage(id, u) {
	const a = ANSWER[id], last = u.lastHit;
	if (!a || !last || !last.n || (a[1] != null && a[1] !== !!last.phys)) return 0;
	return Math.max(1, Math.floor(last.n * a[0]));
}
