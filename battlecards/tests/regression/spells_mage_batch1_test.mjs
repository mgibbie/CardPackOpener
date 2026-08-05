// Mage spell-import batch 1 — behavioral checks on the trickier survivors.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_secret = { id: 't_secret', name: 'Sec', type: 'secret', cost: 3, secret: { trigger: 'enemy-attack', effects: [] } };
cardsById.t_elem = { id: 't_elem', name: 'El', type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Elemental' };
cardsById.t_dragon = { id: 't_dragon', name: 'Dr', type: 'creature', cost: 4, attack: 4, health: 4, tribe: 'Dragon' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7, mana = 10) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'mage'; st.players[0].mana.max = mana; st.players[0].mana.cur = mana;
	return st;
};
const enemy = (st, hp = 5) => { const m = E.instantiate({ id: 'e', name: 'Ox', type: 'creature', cost: 1, attack: 0, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const cast = (st, id, target = null) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = st.players[0].mana.max; E.playCard(st, 0, s.uid, target, null, 0); };

for (const id of ['flurry_rank_1', 'hot_streak', 'evocation', 'snap_freeze', 'synthesize', 'ancient_mysteries', 'mirror_dimension', 'conjure_mana_biscuit', 'mana_biscuit']) ok(`${id} present`, cardsById[id], id);

// Flurry: freeze 1 enemy at <5 mana, 2 at 5, 3 at 10
{
	const st = game(7, 4); enemy(st, 5); enemy(st, 5); enemy(st, 5);
	cast(st, 'flurry_rank_1');
	ok('Flurry at 4 Mana: 1 frozen', st.players[1].board.filter(c => c.frozen).length === 1, st.players[1].board.filter(c => c.frozen).length);
}
{
	const st = game(7, 10); enemy(st, 5); enemy(st, 5); enemy(st, 5);
	cast(st, 'flurry_rank_1');
	ok('Flurry at 10 Mana: 3 frozen', st.players[1].board.filter(c => c.frozen).length === 3, st.players[1].board.filter(c => c.frozen).length);
}

// Hot Streak: your next Fire spell costs (2) less
{
	const st = game();
	cast(st, 'hot_streak');
	const fire = E.instantiate({ id: 'fs', name: 'FS', type: 'sorcery', cost: 4, tribe: 'Fire', effects: [] }, 0); fire.zone = 'hand'; st.players[0].hand.push(fire);
	ok('Hot Streak discounts the next Fire spell (4 -> 2)', E.effectiveCost(st, 0, fire) === 2, E.effectiveCost(st, 0, fire));
	const arc = E.instantiate({ id: 'as', name: 'AS', type: 'sorcery', cost: 4, tribe: 'Arcane', effects: [] }, 0); arc.zone = 'hand'; st.players[0].hand.push(arc);
	ok('Hot Streak does NOT discount a non-Fire spell', E.effectiveCost(st, 0, arc) === 4, E.effectiveCost(st, 0, arc));
}

// Evocation: fill hand with random Mage spells that are Temporary
{
	const st = game();
	cast(st, 'evocation');
	const added = st.players[0].hand.filter(c => c.temporary);
	ok('Evocation filled the hand with Temporary Mage spells', added.length >= 3 && added.every(c => (cardsById[c.id]?.cardClass) === 'mage'), added.length);
}

// Snap Freeze: freeze a minion; if already Frozen, destroy it
{
	const st = game();
	const foe = enemy(st, 5);
	cast(st, 'snap_freeze', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Snap Freeze froze the unfrozen minion', !!foe.frozen && foe.damage < foe.maxHealth, foe.frozen);
}
{
	const st = game();
	const foe = enemy(st, 5); foe.frozen = true;
	cast(st, 'snap_freeze', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Snap Freeze destroyed the already-Frozen minion', foe.damage >= foe.maxHealth || !st.players[1].board.includes(foe), foe.damage);
}

// Synthesize: add a 1-, 2-, and 3-Cost Elemental to hand
{
	const st = game();
	const before = st.players[0].hand.length;
	cast(st, 'synthesize');
	const added = st.players[0].hand.slice(before);
	const costs = added.map(c => cardsById[c.id]?.cost).sort();
	ok('Synthesize added 3 Elementals of Cost 1/2/3', added.length === 3 && added.every(c => (cardsById[c.id]?.tribe || '').includes('Elemental')) && costs.join(',') === '1,2,3', costs);
}

// Ancient Mysteries: draw a Secret from your deck; it costs (0)
{
	const st = game(); st.players[0].deck = ['t_elem', 't_secret', 't_elem'];
	cast(st, 'ancient_mysteries');
	const sec = st.players[0].hand.find(c => c.id === 't_secret');
	ok('Ancient Mysteries drew the Secret', !!sec, st.players[0].hand.map(c => c.id));
	ok('the drawn Secret costs 0', sec && sec.cost === 0, sec && sec.cost);
}

// Mirror Dimension: 0/4 Taunt; +another if holding a Dragon
{
	const st = game();
	cast(st, 'mirror_dimension');
	ok('Mirror Dimension: one 0/4 Taunt (no Dragon held)', st.players[0].board.filter(c => c.name === 'Mirror Image').length === 1, st.players[0].board.length);
}
{
	const st = game();
	const dr = E.instantiate(cardsById.t_dragon, 0); dr.zone = 'hand'; st.players[0].hand.push(dr);
	cast(st, 'mirror_dimension');
	ok('Mirror Dimension: two Taunts while holding a Dragon', st.players[0].board.filter(c => c.name === 'Mirror Image').length === 2, st.players[0].board.length);
}

// Conjure Mana Biscuit: adds a Biscuit that refreshes 2 Mana
{
	const st = game();
	cast(st, 'conjure_mana_biscuit');
	const b = st.players[0].hand.find(c => c.id === 'mana_biscuit');
	ok('Conjure Mana Biscuit added a Biscuit', !!b, st.players[0].hand.map(c => c.id));
	st.players[0].mana.cur = 0;
	E.playCard(st, 0, b.uid, null, null, 0);
	ok('the Biscuit refreshed 2 Mana Crystals', st.players[0].mana.cur === 2, st.players[0].mana.cur);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
