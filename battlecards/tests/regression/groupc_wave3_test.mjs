// Group C (cost modification) wave 3 — conditional self-cost ("Costs N if/while X"),
// via selfCostIf:{cond,setCost?,amount?}.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 12) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const boardCreature = (st, pi, opts = {}) => { const c = E.instantiate({ id: 'bc', name: 'BC', type: 'creature', cost: 2, rarity: 'common', attack: 1, health: 3, tribe: opts.tribe || null }, pi); c.zone = 'board'; c.sick = false; if (opts.frozen) c.frozen = 1; if (opts.dormant) c.dormantLeft = 2; st.players[pi].board.push(c); return c; };
const eff = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return E.effectiveCost(st, pi, c); };

for (const id of ['bladed_lady', 'lokholar_the_ice_lord', 'barrens_scavenger', 'second_rate_bruiser', 'happy_ghoul', 'prescient_slitherdrake', 'solitary_prisoner', 'anetheron', 'perennial_serpent', 'snow_shredder', 'bouldering_buddy', 'gladesong_siren', 'arcane_tyrant', 'anubisath_defender'])
	ok(`${id} carries selfCostIf`, cardsById[id].selfCostIf && cardsById[id].selfCostIf.cond, id);

// Bladed Lady (c6): costs 1 if hero has 6+ Attack
{ const st = game(); ok('Bladed Lady: full price with no hero attack', eff(st, 0, 'bladed_lady') === 6); st.players[0].heroTempAttack = 6; ok('Bladed Lady: costs 1 at 6 hero Attack', eff(st, 0, 'bladed_lady') === 1); }
// Lokholar (c10): -5 if 15 Health or less
{ const st = game(); ok('Lokholar: full at high health', eff(st, 0, 'lokholar_the_ice_lord') === 10); st.players[0].life = 15; ok('Lokholar: -5 at 15 Health', eff(st, 0, 'lokholar_the_ice_lord') === 5); }
// Barrens Scavenger (c6): costs 1 while deck has 10 or fewer
{ const st = game(); st.players[0].deck = new Array(20).fill('x'); ok('Barrens Scavenger: full with big deck', eff(st, 0, 'barrens_scavenger') === 6); st.players[0].deck = new Array(8).fill('x'); ok('Barrens Scavenger: costs 1 with small deck', eff(st, 0, 'barrens_scavenger') === 1); }
// Second-Rate Bruiser (c5): -2 if opponent has 3+ creatures
{ const st = game(); boardCreature(st, 1); boardCreature(st, 1); boardCreature(st, 1); ok('Second-Rate Bruiser: -2 with 3 enemy creatures', eff(st, 0, 'second_rate_bruiser') === 3); }
// Happy Ghoul (c3): costs 0 if hero healed this turn
{ const st = game(); ok('Happy Ghoul: full when not healed', eff(st, 0, 'happy_ghoul') === 3); st.players[0].healedThisTurn = true; ok('Happy Ghoul: 0 when healed this turn', eff(st, 0, 'happy_ghoul') === 0); }
// Prescient Slitherdrake (c7): -3 if holding another Dragon
{ const st = game(); const drag = E.instantiate({ id: 'd', name: 'D', type: 'creature', cost: 4, rarity: 'common', attack: 1, health: 1, tribe: 'Dragon' }, 0); drag.zone = 'hand'; st.players[0].hand.push(drag); ok('Slitherdrake: -3 holding a Dragon', eff(st, 0, 'prescient_slitherdrake') === 4); }
// Solitary Prisoner (c5): costs 2 if no creatures on the battlefield
{ const st = game(); ok('Solitary Prisoner: costs 2 on empty board', eff(st, 0, 'solitary_prisoner') === 2); boardCreature(st, 1); ok('Solitary Prisoner: full price once a creature exists', eff(st, 0, 'solitary_prisoner') === 5); }
// Anetheron (c6): costs 1 if hand is full
{ const st = game(); st.players[0].hand = new Array(14).fill(0).map(() => E.instantiate({ id: 'x', name: 'x', type: 'creature', cost: 1, rarity: 'common', attack: 1, health: 1 }, 0)); ok('Anetheron: costs 1 with a full hand (15 incl. itself)', eff(st, 0, 'anetheron') === 1); }
// Perennial Serpent (c8): -4 if a creature is Dormant
{ const st = game(); boardCreature(st, 0, { dormant: true }); ok('Perennial Serpent: -4 with a Dormant creature', eff(st, 0, 'perennial_serpent') === 4); }
// Snow Shredder (c4): costs 1 if a character is Frozen
{ const st = game(); boardCreature(st, 1, { frozen: true }); ok('Snow Shredder: costs 1 when something is Frozen', eff(st, 0, 'snow_shredder') === 1); }
// Bouldering Buddy (c7): costs 1 with 10+ Mana Crystals
{ const st = game(); st.players[0].mana.max = 10; ok('Bouldering Buddy: costs 1 at 10 crystals', eff(st, 0, 'bouldering_buddy') === 1); }
// Gladesong Siren (c6): costs 1 if you cast a Holy AND Shadow spell this turn
{ const st = game(); st.players[0].schoolsCastThisTurn = { Holy: true, Shadow: true }; ok('Gladesong Siren: costs 1 after Holy + Shadow', eff(st, 0, 'gladesong_siren') === 1); const st2 = game(); st2.players[0].schoolsCastThisTurn = { Holy: true }; ok('Gladesong Siren: full with only one school', eff(st2, 0, 'gladesong_siren') === 6); }
// Arcane Tyrant (c5): costs 0 if you cast a 5+ spell this turn
{ const st = game(); ok('Arcane Tyrant: full with no big spell', eff(st, 0, 'arcane_tyrant') === 5); st.players[0].castBigSpellThisTurn = true; ok('Arcane Tyrant: 0 after a 5+ spell', eff(st, 0, 'arcane_tyrant') === 0); }

// end-to-end: casting a real 5-cost spell flips Arcane Tyrant's flag
{
	const st = game();
	const big = raw.cards.find(c => (c.type === 'sorcery' || c.type === 'instant') && c.cost === 5 && !c.token && c.collectible !== false && !(c.colors && c.colors.length) && !E.targetSpec(st, 0, c));
	if (big) { const s = E.instantiate(big, 0); s.zone = 'hand'; st.players[0].hand.push(s); E.playCard(st, 0, s.uid, null, null, 0); ok('casting a real 5-cost spell sets the big-spell flag', st.players[0].castBigSpellThisTurn === true && eff(st, 0, 'arcane_tyrant') === 0); }
	else ok('(no untargeted 5-cost spell available to e2e test)', true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
