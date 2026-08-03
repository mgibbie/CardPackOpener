// Group C (cost modification) wave 4 — self-scaling cost driven by per-game/turn
// counters (some pre-existing, some new tracking hooks).
import fs from 'fs';
import * as E from '../../engine.js';
import { drawCards } from '../../engine/zones.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 13) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'shaman', name: 'S', power: null }, { id: 'shaman', name: 'T', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	return st;
};
const eff = (st, pi, id, patch) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; if (patch) Object.assign(c, patch); st.players[pi].hand.push(c); return E.effectiveCost(st, pi, c); };

for (const id of ['frostwolf_warmaster', 'scribbling_stenographer', 'ur_zul_giant', 'frenzied_felwing', 'mantle_shaper', 'thing_from_below', 'gigantotem', 'snowfury_giant', 'haywire_hornswog', 'stitched_giant', 'playhouse_giant'])
	ok(`${id} carries selfCost`, cardsById[id].selfCost && cardsById[id].selfCost.per, id);

// counters set directly
{ const st = game(); st.players[0].cardsPlayedThisTurn = 2; ok('Frostwolf Warmaster: 4 - 2 cards played = 2', eff(st, 0, 'frostwolf_warmaster') === 2); ok('Scribbling Stenographer: 6 - 2 = 4', eff(st, 0, 'scribbling_stenographer') === 4); }
{ const st = game(); st.players[0].friendlyDeaths = 3; ok('Ur\'zul Giant: 13 - 3 friendly deaths = 10', eff(st, 0, 'ur_zul_giant') === 10); }
{ const st = game(); st.players[0].damageToEnemyHeroThisTurn = 2; ok('Frenzied Felwing: 4 - 2 dmg to opp this turn = 2', eff(st, 0, 'frenzied_felwing') === 2); }
{ const st = game(); ok('Mantle Shaper: 5 - 2 spells cast while held = 3', eff(st, 0, 'mantle_shaper', { spellsCastWhileHeld: 2 }) === 3); }
{ const st = game(); st.players[0].totemsSummonedGame = 4; ok('Gigantotem: 10 - 4 Totems = 6', eff(st, 0, 'gigantotem') === 6); }
{ const st = game(); st.players[0].overloadedGame = 5; ok('Snowfury Giant: 11 - 5 Overloaded = 6', eff(st, 0, 'snowfury_giant') === 6); }
{ const st = game(); st.players[0].overloadedGame = 3; ok('Haywire Hornswog: 6 - 3 Overloaded = 3', eff(st, 0, 'haywire_hornswog') === 3); }
{ const st = game(); st.players[0].corpsesSpentGame = 4; ok('Stitched Giant: 9 - 4 Corpses spent = 5', eff(st, 0, 'stitched_giant') === 5); }
{ const st = game(); st.players[0].cardsDrawnGame = 10; ok('Playhouse Giant: 25 - 10 cards drawn = 15', eff(st, 0, 'playhouse_giant') === 15); }

// end-to-end: the tracking hooks actually fire
// Totems summoned via summon()
{
	const st = game();
	E.summon(st, 0, { id: 'tot', name: 'Totem', type: 'creature', cost: 1, token: true, rarity: 'common', tribe: 'Totem', attack: 0, health: 2, description: 'x' });
	E.summon(st, 0, { id: 'tot', name: 'Totem', type: 'creature', cost: 1, token: true, rarity: 'common', tribe: 'Totem', attack: 0, health: 2, description: 'x' });
	ok('summon() increments totemsSummonedGame', st.players[0].totemsSummonedGame === 2);
	ok('Thing from Below: 6 - 2 Totems summoned = 4', eff(st, 0, 'thing_from_below') === 4, eff(st, 0, 'thing_from_below'));
}
// Corpses spent via spendCorpses
{
	const st = game(); st.players[0].corpses = 5;
	E.spendCorpses(st, 0, 3);
	ok('spendCorpses increments corpsesSpentGame', st.players[0].corpsesSpentGame === 3, st.players[0].corpsesSpentGame);
	ok('overspending only counts what was actually spent', (() => { const s2 = game(); s2.players[0].corpses = 2; E.spendCorpses(s2, 0, 5); return s2.players[0].corpsesSpentGame === 2; })());
}
// Cards drawn via drawCards
{
	const st = game(); st.players[0].deck = ['chillwind_yeti', 'wolfrider', 'boulderfist_ogre'].filter(id => cardsById[id]);
	const before = st.players[0].cardsDrawnGame || 0;
	drawCards(st, 0, 3);
	ok('drawCards increments cardsDrawnGame', (st.players[0].cardsDrawnGame || 0) === before + 3, st.players[0].cardsDrawnGame);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
