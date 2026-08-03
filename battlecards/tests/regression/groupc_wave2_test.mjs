// Group C (cost modification) wave 2 — self-scaling cost that reads current state
// ("Costs N less for each X"), via selfCost:{per,amount}.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 11) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = []; st.players[0].graveyard = []; st.players[1].graveyard = [];
	return st;
};
const boardCreature = (st, pi, opts = {}) => { const c = E.instantiate({ id: opts.id || 'bc', name: 'BC', type: 'creature', cost: 2, rarity: 'common', attack: 1, health: opts.health || 3, tribe: opts.tribe || null }, pi); c.zone = 'board'; c.sick = false; if (opts.damage) c.damage = opts.damage; if (opts.frozen) c.frozen = 1; st.players[pi].board.push(c); return c; };
const handCard = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const eff = (st, pi, id) => E.effectiveCost(st, pi, handCard(st, pi, id));

for (const id of ['crypt_keeper', 'contract_conjurer', 'floecaster', 'curious_outsider', 'skycap_n_kragg', 'eredar_brute', 'rabble_bouncer', 'bloodboil_brute', 'clockwork_giant', 'tent_trasher', 'mogu_fleshshaper', 'fye_the_setting_sun'])
	ok(`${id} carries selfCost`, cardsById[id].selfCost && cardsById[id].selfCost.per, id);

// Crypt Keeper (c8): -1 per Armor
{ const st = game(); st.players[0].armor = 3; ok('Crypt Keeper: 8 - 3 Armor = 5', eff(st, 0, 'crypt_keeper') === 5, eff(st, 0, 'crypt_keeper')); }
// Contract Conjurer (c6): -3 per Secret you control
{ const st = game(); st.players[0].secrets = [{ id: 's1' }, { id: 's2' }]; ok('Contract Conjurer: 6 - 3*2 secrets = 0', eff(st, 0, 'contract_conjurer') === 0); }
// Floecaster (c6): -2 per Frozen enemy
{ const st = game(); boardCreature(st, 1, { frozen: true }); boardCreature(st, 1, { frozen: true }); ok('Floecaster: 6 - 2*2 frozen enemies = 2', eff(st, 0, 'floecaster') === 2, eff(st, 0, 'floecaster')); }
// Curious Outsider (c10): -1 per Beast you control
{ const st = game(); boardCreature(st, 0, { tribe: 'Beast' }); boardCreature(st, 0, { tribe: 'Beast' }); boardCreature(st, 1, { tribe: 'Beast' }); ok('Curious Outsider: 10 - 2 friendly Beasts = 8 (enemy Beast ignored)', eff(st, 0, 'curious_outsider') === 8, eff(st, 0, 'curious_outsider')); }
// Skycap'n Kragg (c7): -1 per friendly Pirate
{ const st = game(); boardCreature(st, 0, { tribe: 'Pirate' }); boardCreature(st, 0, { tribe: 'Pirate' }); ok('Skycapn Kragg: 7 - 2 Pirates = 5', eff(st, 0, 'skycap_n_kragg') === 5); }
// Eredar Brute (c7): -1 per enemy creature
{ const st = game(); boardCreature(st, 1); boardCreature(st, 1); boardCreature(st, 0); ok('Eredar Brute: 7 - 2 enemy creatures = 5 (own ignored)', eff(st, 0, 'eredar_brute') === 5, eff(st, 0, 'eredar_brute')); }
// Bloodboil Brute (c7): -1 per damaged creature (both sides)
{ const st = game(); boardCreature(st, 0, { damage: 1 }); boardCreature(st, 1, { damage: 2 }); boardCreature(st, 1, {}); ok('Bloodboil Brute: 7 - 2 damaged = 5', eff(st, 0, 'bloodboil_brute') === 5, eff(st, 0, 'bloodboil_brute')); }
// Clockwork Giant (c12): -1 per card in opponent hand
{ const st = game(); st.players[1].hand = [1, 2, 3, 4].map(() => E.instantiate({ id: 'x', name: 'x', type: 'creature', cost: 1, rarity: 'common', attack: 1, health: 1 }, 1)); ok('Clockwork Giant: 12 - 4 enemy hand = 8', eff(st, 0, 'clockwork_giant') === 8, eff(st, 0, 'clockwork_giant')); }
// Mogu Fleshshaper (c9): -1 per creature on the battlefield (both sides)
{ const st = game(); boardCreature(st, 0); boardCreature(st, 0); boardCreature(st, 1); ok('Mogu Fleshshaper: 9 - 3 creatures = 6', eff(st, 0, 'mogu_fleshshaper') === 6, eff(st, 0, 'mogu_fleshshaper')); }
// Fye (c9): -1 per Dragon in your graveyard
{ const st = game(); cardsById.__testdragon = { id: '__testdragon', tribe: 'Dragon' }; st.players[0].graveyard = [{ id: '__testdragon' }, { id: '__testdragon' }, { id: '__testdragon' }]; ok('Fye: 9 - 3 Dragons in graveyard = 6', eff(st, 0, 'fye_the_setting_sun') === 6, eff(st, 0, 'fye_the_setting_sun')); }
// Tent Trasher (c5): -1 per friendly creature with a UNIQUE type
{ const st = game(); boardCreature(st, 0, { tribe: 'Murloc' }); boardCreature(st, 0, { tribe: 'Beast' }); boardCreature(st, 0, { tribe: 'Beast' }); ok('Tent Trasher: 5 - 1 unique type (Murloc; the two Beasts are not unique) = 4', eff(st, 0, 'tent_trasher') === 4, eff(st, 0, 'tent_trasher')); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
