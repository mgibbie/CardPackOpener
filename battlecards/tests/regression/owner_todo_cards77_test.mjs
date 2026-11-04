// Owner inbox batch, 2026-10-02.
//   Futurist Spellthief            -> tribe Human Rogue
//   Mauhúr's Ragged Short Spear    -> "Swing: Luck: Add two Red cards to your hand." (the Mountain pool)
//   Mauhúr's Smite the Deathless   -> "Deal 3 damage to any target & Draw a card."
//   Mauhúr's Book of Mazarbul      -> "Alliance: Luck: Draw a creature."
//   Lightning Invocation           -> "Deal 2 damage to each creature you don't control.", cost 2, Nature
// Luck is a coin flip (state.rng() < 0.5), so each Luck card is fired over many
// seeds: every outcome must be all-or-nothing, and both halves must occur.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._ogre = { id: '_ogre', name: 'Ogre', type: 'creature', cost: 6, attack: 1, health: 9, rarity: 'common' };
byId._spell = { id: '_spell', name: 'Filler', type: 'sorcery', cost: 1, rarity: 'common', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh(seed = 77) {
	const st = E.createGame(byId, seededRng(seed), null, 2,
		[{ id: 'warrior', name: 'A', power: null }, { id: 'warrior', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.mana = { cur: 30, max: 30, bonus: 0 }; p.life = 30; p.armor = 0; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const give = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const ench = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'enchantment'; st.players[pi].enchantments.push(c); return c; };
const redPool = new Set(Object.values(byId).filter(d => d.landSet === 'Mountain').map(d => d.id));

// ---- 1) Futurist Spellthief ----
{
	const c = byId.ymid_futurist_spellthief;
	ok('Spellthief is a Human Rogue', c.tribe === 'Human Rogue', c.tribe);
	ok('...and still Discovers a spell', c.description === 'Battlecry: Discover a spell.' && c.effects[0].type === 'discover');
}

// ---- 2) Mauhúr's Ragged Short Spear ----
{
	const c = byId.me_ma_wep;
	ok('Spear text', c.description === 'Swing: Luck: Add two Red cards to your hand.', c.description);
	ok('the Mountain (Red) pool exists', redPool.size >= 30, redPool.size);
	const counts = new Set();
	for (let seed = 1; seed <= 24; seed++) {
		const st = fresh(seed);
		const w = E.instantiate(c, 0); w.zone = 'weapon'; st.players[0].weapon = w;
		E.heroAttack(st, 0, { type: 'hero', player: 1 });
		const h = st.players[0].hand;
		counts.add(h.length);
		ok(`[${seed}] the swing hits`, st.players[1].life === 27, st.players[1].life);
		ok(`[${seed}] Luck adds two cards or none`, h.length === 0 || h.length === 2, h.length);
		ok(`[${seed}] ...only Red (Mountain-pool) cards`, h.every(x => redPool.has(x.id) && (x.colors || []).includes('R')), JSON.stringify(h.map(x => [x.name, x.colors])));
	}
	ok('over 24 swings, both Luck outcomes happen', counts.has(0) && counts.has(2), JSON.stringify([...counts]));
}

// ---- 3) Mauhúr's Smite the Deathless ----
{
	const c = byId.me_ma_smite;
	ok('Smite text', c.description === 'Deal 3 damage to any target & Draw a card.', c.description);
	const cases = [
		['an enemy creature', st => { const t = put(st, 1, byId._ogre); return [{ type: 'creature', uid: t.uid, player: 1 }, () => t.damage === 3]; }],
		['your own creature', st => { const t = put(st, 0, byId._ogre); return [{ type: 'creature', uid: t.uid, player: 0 }, () => t.damage === 3]; }],
		['the enemy hero', st => [{ type: 'hero', player: 1 }, () => st.players[1].life === 27]],
	];
	for (const [what, mk] of cases) {
		const st = fresh();
		st.players[0].deck = ['_spell'];
		const [tgt, hit] = mk(st);
		const card = give(st, 0, c);
		E.playCard(st, 0, card.uid, tgt, null, 0);
		ok(`targets ${what} for 3`, hit(), JSON.stringify(tgt));
		ok(`...and draws a card (${what})`, st.players[0].hand.length === 1 && st.players[0].hand[0].id === '_spell', JSON.stringify(st.players[0].hand.map(x => x.id)));
	}
}

// ---- 4) Mauhúr's Book of Mazarbul ----
{
	const c = byId.me_ma_ench;
	ok('Book text', c.description === 'Alliance: Luck: Draw a creature.', c.description);
	const counts = new Set();
	for (let seed = 1; seed <= 24; seed++) {
		const st = fresh(seed);
		ench(st, 0, c);
		st.players[0].deck = ['_spell', '_ogre', '_spell'];
		E.fireOngoing(st, 0, 'creature-played', {});
		const h = st.players[0].hand;
		counts.add(h.length);
		ok(`[${seed}] Alliance + Luck draws a creature or nothing`, (h.length === 0 && st.players[0].deck.length === 3) || (h.length === 1 && h[0].id === '_ogre' && st.players[0].deck.length === 2), JSON.stringify({ hand: h.map(x => x.id), deck: st.players[0].deck.length }));
	}
	ok('over 24 creatures played, both Luck outcomes happen', counts.has(0) && counts.has(1), JSON.stringify([...counts]));
}

// ---- 5) Lightning Invocation (Duels treasure): 2 to each creature you don't control, cost 2, Nature ----
{
	const c = byId.duels_lightning_invocation;
	ok('Invocation text', c.description === "Deal 2 damage to each creature you don't control.", c.description);
	ok('Invocation costs 2', c.cost === 2, c.cost);
	ok('Invocation is a Nature spell (schoolOf reads tribe)', E.schoolOf(c) === 'Nature', E.schoolOf(c));
	const st = fresh();
	const mine = put(st, 0, byId._ogre), foe1 = put(st, 1, byId._ogre), foe2 = put(st, 1, byId._ogre);
	st.players[0].ironRoots = true;   // Iron Roots: a Nature spell buffs a random friendly +1/+1 & Taunt
	const card = give(st, 0, c);
	E.playCard(st, 0, card.uid, null, null, 0);
	ok('2 damage to each enemy creature, none to yours or the heroes', foe1.damage === 2 && foe2.damage === 2 && mine.damage === 0 && st.players[1].life === 30 && st.players[0].life === 30, JSON.stringify({ foe1: foe1.damage, foe2: foe2.damage, mine: mine.damage }));
	ok('...and it counts as a Nature spell when cast (Iron Roots fires)', mine.keywords.includes('taunt') && mine.attack === 2, JSON.stringify({ atk: mine.attack, kw: mine.keywords }));
	ok('...and costs 2 Mana', st.players[0].mana.cur === 28, st.players[0].mana.cur);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
