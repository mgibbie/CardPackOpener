// Group E ("after you <action>" triggers) wave 2 — spell-on-friendly + location use.
// Pelagos (after you cast a spell on a friendly minion, even its stats up to the
// higher of the two) and XB-931 Housekeeper (after you use a location, +3 Armor).
//
// NOTE: wave-2's original in-hand candidates — Bolvar Fordragon, Blood Herald,
// Blubber Baron — were ALREADY faithful (scripted in death.js / core.js, and the
// handDeathGrowth field), as were Patches/Parachute/Djinni/Zentimo/Augmented Elekk.
// This wave adds only the two that had zero engine wiring.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 34) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; c.summonedThisTurn = false; c.attacksUsed = 0; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name = 'D', extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 3, rarity: 'basic', attack: a, health: h, ...extra });
// a 0-cost spell that adds +1 Attack to a targeted creature (so evening is visible in Health)
const touchSpell = { id: 't_touch', name: 'Touch', type: 'sorcery', cost: 0, rarity: 'basic', effects: [{ type: 'buff', attack: 1, health: 0, target: 'creature' }] };
cardsById.t_touch = touchSpell;

// data sanity
ok('Pelagos carries a spell-cast-on-creature trigger gated friendlyTarget', cardsById.pelagos.ongoing?.on === 'spell-cast-on-creature' && cardsById.pelagos.ongoing.if?.friendlyTarget === true);
ok('XB-931 carries a location-used → armor trigger', cardsById.xb931_housekeeper.ongoing?.on === 'location-used' && cardsById.xb931_housekeeper.ongoing.effects?.[0]?.type === 'armor');

// Pelagos: cast a spell on a friendly minion → its Attack & Health become the higher of the two
{
	const st = game();
	put(st, 0, 'pelagos');
	const wisp = put(st, 0, null, dummy(4, 1, 'Wisp')); // 4/1 friendly
	const spell = E.instantiate(touchSpell, 0); spell.zone = 'hand'; st.players[0].hand.push(spell);
	E.playCard(st, 0, spell.uid, { type: 'creature', uid: wisp.uid, player: 0 }, null, 0);
	// the touch made it 5/1; Pelagos then evens to max(5,1) = 5/5
	ok('Pelagos evened the friendly minion to 5/5', wisp.attack === 5 && E.hp(wisp) === 5, [wisp.attack, E.hp(wisp)]);
}
// Pelagos ignores a spell cast on an ENEMY minion
{
	const st = game();
	put(st, 0, 'pelagos');
	const foe = put(st, 1, null, dummy(4, 1, 'Foe')); // 4/1 enemy
	const spell = E.instantiate(touchSpell, 0); spell.zone = 'hand'; st.players[0].hand.push(spell);
	E.playCard(st, 0, spell.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
	ok('Pelagos did NOT even out the enemy minion (still 5/1 from the touch)', foe.attack === 5 && E.hp(foe) === 1, [foe.attack, E.hp(foe)]);
}
// Pelagos evens DOWNWARD only up to the max — a minion whose Health already exceeds Attack grows in Attack
{
	const st = game();
	put(st, 0, 'pelagos');
	const tank = put(st, 0, null, dummy(1, 6, 'Tank')); // 1/6 friendly
	const spell = E.instantiate(touchSpell, 0); spell.zone = 'hand'; st.players[0].hand.push(spell);
	E.playCard(st, 0, spell.uid, { type: 'creature', uid: tank.uid, player: 0 }, null, 0);
	// touch → 2/6; Pelagos evens to max(2,6) = 6/6
	ok('Pelagos raised the tank to 6/6 (Attack up to the Health)', tank.attack === 6 && E.hp(tank) === 6, [tank.attack, E.hp(tank)]);
}

// XB-931 Housekeeper: using a location grants +3 Armor
{
	const st = game();
	put(st, 0, 'xb931_housekeeper');
	const locDef = { id: 't_loc', name: 'Spa', type: 'location', cost: 2, durability: 3, rarity: 'common', taps: [{ text: 'Draw a card.', effects: [{ type: 'draw', value: 0 }] }] };
	cardsById.t_loc = locDef;
	const loc = E.instantiate(locDef, 0); loc.zone = 'board'; loc.sick = false; loc.tapped = false; st.players[0].board.push(loc);
	E.recomputeAuras(st);
	const before = st.players[0].armor || 0;
	const used = E.tapLand(st, 0, loc.uid, 0, null);
	ok('the location was used (tapLand returned true)', used === true, used);
	ok('XB-931 granted +3 Armor on location use', (st.players[0].armor || 0) === before + 3, [before, st.players[0].armor]);
	// a second housekeeper stacks — the first location is now tapped (double-tap),
	// so use a FRESH location to prove two Housekeepers each fire
	put(st, 0, 'xb931_housekeeper');
	const loc2 = E.instantiate(locDef, 0); loc2.zone = 'board'; loc2.sick = false; loc2.tapped = false; st.players[0].board.push(loc2);
	E.recomputeAuras(st);
	const arm2 = st.players[0].armor || 0;
	E.tapLand(st, 0, loc2.uid, 0, null);
	ok('two Housekeepers grant +6 on the next use', (st.players[0].armor || 0) === arm2 + 6, [arm2, st.players[0].armor]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
