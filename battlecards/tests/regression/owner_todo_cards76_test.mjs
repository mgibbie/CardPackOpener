// Owner inbox batch, 2026-10-01.
//   Long List of the Ents      -> "Alliance, Constellation & Inspire: Gain 1 Life & Deal 1 damage to a
//                                  random creature or planeswalker you don't control."
//   Mirkwood Pathmaker         -> + "Deathrattle: Add two random Green cards to your hand." (the Forest pool)
//   Garruk's Savagery          -> "Honorable Kill & Overkill: Summon a 3/3 Beast with Trample."
//   Urabrask's Aggression      -> "Alliance: Discover a Red Card." (the Mountain pool)
//   Emrakul's Breach of Reality -> triple tap
//
// random-damage learns pool 'enemy-creatures-walkers' (planeswalkers take loyalty damage).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._ogre = { id: '_ogre', name: 'Ogre', type: 'creature', cost: 6, attack: 1, health: 9, rarity: 'common' };
byId._mouse = { id: '_mouse', name: 'Mouse', type: 'creature', cost: 1, attack: 1, health: 4, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh(seed = 76) {
	const st = E.createGame(byId, seededRng(seed), null, 2,
		[{ id: 'hunter', name: 'A', power: null }, { id: 'hunter', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.mana = { cur: 30, max: 30, bonus: 0 }; p.life = 30; p.armor = 0; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const ench = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'enchantment'; st.players[pi].enchantments.push(c); return c; };
const walker = (st, pi, loyalty = 5) => { const w = E.instantiate({ id: '_pw', name: 'Walker', type: 'planeswalker', cost: 4, loyalty, rarity: 'common' }, pi); w.zone = 'planeswalker'; w.loyalty = loyalty; st.players[pi].planeswalkers.push(w); return w; };
const greenPool = new Set(Object.values(byId).filter(d => d.landSet === 'Forest').map(d => d.id));
const redPool = new Set(Object.values(byId).filter(d => d.landSet === 'Mountain').map(d => d.id));

// ---- 1) Long List of the Ents ----
{
	const c = byId.me_legolas_hunt;
	ok('Ents text', c.description === "Alliance, Constellation & Inspire: Gain 1 Life & Deal 1 damage to a random creature or planeswalker you don't control.", c.description);
	ok('Ents has the three triggers', (c.ongoings || []).map(o => o.on).sort().join() === 'creature-played,enchantment-played,hero-power-used', JSON.stringify(c.ongoings));
	for (const when of ['creature-played', 'enchantment-played', 'hero-power-used']) {
		for (const seed of [1, 2, 3, 4, 5, 6]) {
			const st = fresh(seed);
			ench(st, 0, c);
			const mine = put(st, 0, byId._ogre);
			const foe = put(st, 1, byId._ogre), pw = walker(st, 1, 5);
			st.players[0].life = 20;
			E.fireOngoing(st, 0, when, {});
			const hits = foe.damage + (5 - pw.loyalty);
			ok(`[${when} ${seed}] gains 1 Life`, st.players[0].life === 21, st.players[0].life);
			ok(`[${when} ${seed}] 1 damage to exactly one enemy creature or planeswalker`, hits === 1 && mine.damage === 0 && st.players[1].life === 30, JSON.stringify({ foe: foe.damage, pw: pw.loyalty, mine: mine.damage, hero: st.players[1].life }));
		}
	}
	// a planeswalker alone is a legal target
	const st = fresh(9); ench(st, 0, c); const pw = walker(st, 1, 3);
	E.fireOngoing(st, 0, 'hero-power-used', {});
	ok('with only an enemy planeswalker, it takes the 1 (loyalty 3 -> 2)', pw.loyalty === 2, pw.loyalty);
	// nothing to hit: still gain the Life, no error
	const s2 = fresh(9); ench(s2, 0, c); s2.players[0].life = 20;
	E.fireOngoing(s2, 0, 'creature-played', {});
	ok('with no enemy creature or walker it still gains 1 Life', s2.players[0].life === 21 && s2.players[1].life === 30);
}

// ---- 2) Mirkwood Pathmaker ----
{
	const c = byId.me_legolas_pathmaker;
	ok('Pathmaker text', c.description === 'Poisonous & Rush.\nDeathrattle: Add two random Green cards to your hand.', c.description);
	ok('Pathmaker keeps Poisonous & Rush', c.keywords.includes('poisonous') && c.keywords.includes('rush'));
	ok('the Forest pool exists (70 cards)', greenPool.size >= 60, greenPool.size);
	for (const seed of [1, 2, 3]) {
		const st = fresh(seed);
		const p = put(st, 0, c);
		p.damage = p.maxHealth; E.sweepDeaths(st);
		const h = st.players[0].hand;
		ok(`[${seed}] dying adds exactly two cards to your hand`, h.length === 2, h.length);
		ok(`[${seed}] ...both from the Forest (Green) pool`, h.every(x => greenPool.has(x.id) && (x.colors || []).includes('G')), JSON.stringify(h.map(x => [x.name, x.colors])));
	}
}

// ---- 3) Garruk's Savagery ----
{
	const c = byId.garruk_savagery;
	ok('Savagery text', c.description === 'Honorable Kill & Overkill: Summon a 3/3 Beast with Trample.', c.description);
	const equip = st => { const w = E.instantiate(c, 0); w.zone = 'weapon'; st.players[0].weapon = w; return w; };
	const beasts = st => st.players[0].board.filter(x => x.name === 'Beast' && x.attack === 3 && x.maxHealth === 3 && x.keywords.includes('trample'));
	// Honorable Kill: exactly lethal (4 into a 4-Health creature)
	{ const st = fresh(); equip(st); const t = put(st, 1, byId._mouse);
		E.heroAttack(st, 0, { type: 'creature', uid: t.uid, player: 1 });
		ok('Honorable Kill (exactly lethal) summons a 3/3 Trample Beast', beasts(st).length === 1, JSON.stringify(st.players[0].board.map(x => x.name))); }
	// Overkill: more than lethal (4 into a 1-Health creature)
	{ const st = fresh(); equip(st); const t = put(st, 1, { ...byId._mouse, id: '_tiny', health: 1 });
		E.heroAttack(st, 0, { type: 'creature', uid: t.uid, player: 1 });
		ok('Overkill (excess damage) summons a 3/3 Trample Beast', beasts(st).length === 1, JSON.stringify(st.players[0].board.map(x => x.name))); }
	// no kill: nothing
	{ const st = fresh(); equip(st); const t = put(st, 1, byId._ogre);
		E.heroAttack(st, 0, { type: 'creature', uid: t.uid, player: 1 });
		ok('a hit that does not kill summons nothing', beasts(st).length === 0); }
}

// ---- 4) Urabrask's Aggression ----
{
	const c = byId.urabrask_aggression;
	ok('Urabrask text', c.description === 'Alliance: Discover a Red Card.', c.description);
	ok('the Mountain (Red) pool exists', redPool.size >= 30, redPool.size);
	const st = fresh();
	ench(st, 0, c);
	E.fireOngoing(st, 0, 'creature-played', {});
	const q = (st.pickQueue || [])[0];
	const opts = q && (q.ids || []);
	ok('playing a creature offers a Discover', !!q && opts.length >= 1, JSON.stringify(q && Object.keys(q)));
	ok('...of Red (Mountain-pool) cards only', opts.every(o => redPool.has(o.id || o)), JSON.stringify(opts.map(o => o.id || o)));
}

// ---- 5) Emrakul's Breach of Reality: triple tap ----
{
	const c = byId.emrakul_breach_of_reality;
	ok('Breach text', c.description === '{T}{T}{T}: Bounce target enemy creature.', c.description);
	const st = fresh();
	const art = E.instantiate(c, 0); art.zone = 'artifact'; st.players[0].artifacts.push(art);
	const foe = put(st, 1, byId._ogre);
	ok('it bounces the target', E.tapArtifact(st, 0, art.uid, { type: 'creature', uid: foe.uid, player: 1 }) && !st.players[1].board.includes(foe));
	const tappedAt = [];
	for (let t = 0; t < 3; t++) {
		E.endTurn(st, 0); st.priority = null; st.stack = [];
		E.endTurn(st, 1); st.priority = null; st.stack = [];
		tappedAt.push(art.tapped);
	}
	ok('it stays tapped for two of your turn-starts and untaps on the third', JSON.stringify(tappedAt) === '[true,true,false]', JSON.stringify(tappedAt));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
