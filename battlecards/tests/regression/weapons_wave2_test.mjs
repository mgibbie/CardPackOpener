// Missing HS weapons — wave 2: "After your hero attacks" weapons (hero-attacks ongoing).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 45) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const equip = (st, pi, id) => { const w = E.instantiate(cardsById[id], pi); w.zone = 'hand'; st.players[pi].hand.push(w); st.players[pi].mana.cur = 10; E.playCard(st, pi, w.uid, null, null, 0); return st.players[pi].weapon; };
const heroSwingFace = (st, pi) => { st.players[pi].heroAttacksUsed = 0; E.heroAttack(st, pi, { type: 'hero', player: 1 - pi }); };

for (const id of ['command_claw', 'painter_s_virtue', 'whetstone_hatchet', 'livewire_lance', 'tempest_hammer', 'crystalline_greatmace'])
	ok(`${id} is a weapon with a hero-attacks trigger`, cardsById[id]?.type === 'weapon' && cardsById[id].ongoing?.on === 'hero-attacks', id);

// Command Claw: after hero attacks, a random friendly minion +2 Attack
{
	const st = game(); const m = put(st, 0, null, dummy(2, 2, 'M'));
	equip(st, 0, 'command_claw'); heroSwingFace(st, 0);
	ok('Command Claw: friendly +2 Attack after attacking', m.attack === 4, m.attack);
}
// Painter's Virtue: Lifesteal; after hero attacks, minions in hand +1/+1
{
	const st = game(); const h = toHand(st, 0, dummy(1, 1, 'Hc'));
	const w = equip(st, 0, 'painter_s_virtue');
	ok('Painter\'s Virtue has Lifesteal', (w.keywords || []).includes('lifesteal'));
	heroSwingFace(st, 0);
	ok('Painter\'s Virtue: hand minion +1/+1', h.attack === 2 && h.maxHealth === 2, [h.attack, h.maxHealth]);
}
// Whetstone Hatchet: after hero attacks, a minion in hand +1 Attack
{
	const st = game(); const h = toHand(st, 0, dummy(1, 1, 'Hc'));
	equip(st, 0, 'whetstone_hatchet'); heroSwingFace(st, 0);
	ok('Whetstone Hatchet: hand minion +1 Attack', h.attack === 2, h.attack);
}
// Livewire Lance: after hero attacks, add a Lackey to hand
{
	const st = game(); const before = st.players[0].hand.length;
	equip(st, 0, 'livewire_lance'); heroSwingFace(st, 0);
	ok('Livewire Lance: a Lackey was added to hand', st.players[0].hand.length === before + 1 && st.players[0].hand.some(c => /lackey/i.test(c.name || c.id)), st.players[0].hand.map(c => c.id));
}
// Tempest Hammer: after hero attacks, deal 3 to the lowest-Health enemy
{
	const st = game(); const big = put(st, 1, null, dummy(1, 8, 'Big')); const low = put(st, 1, null, dummy(1, 4, 'Low'));
	equip(st, 0, 'tempest_hammer'); heroSwingFace(st, 0);
	ok('Tempest Hammer hit the lowest-Health enemy for 3', low.damage === 3 && big.damage === 0, [low.damage, big.damage]);
}
// Crystalline Greatmace: after hero attacks, Draenei in hand +2 Attack (others untouched)
{
	const st = game(); const dr = toHand(st, 0, dummy(2, 2, 'Dr', { tribe: 'Draenei' })); const other = toHand(st, 0, dummy(2, 2, 'Ot'));
	equip(st, 0, 'crystalline_greatmace'); heroSwingFace(st, 0);
	ok('Crystalline Greatmace: Draenei +2 Attack', dr.attack === 4, dr.attack);
	ok('Crystalline Greatmace: non-Draenei untouched', other.attack === 2, other.attack);
}

// Regression: weapon hero-attacks ongoings fire ONCE (was double — Truesilver
// Champion healed 4 instead of 2 via the redundant explicit + fireOngoing paths)
{
	const st = game(); st.players[0].life = 20;
	equip(st, 0, 'truesilver_champion'); // "Whenever your hero attacks, restore 2 Health to it."
	heroSwingFace(st, 0);
	ok('Truesilver Champion heals exactly 2 (single fire, not doubled)', st.players[0].life === 22, st.players[0].life);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
