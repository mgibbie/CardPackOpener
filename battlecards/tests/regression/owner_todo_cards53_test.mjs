// Fifty-third batch from the wiki's owner inbox (owner_todo), 2026-09-14.
//   wastes_sword_of_fire_and_ice -> reword to "Swing: Draw a card & deal 2 damage
//        to each opponent." (mechanic unchanged: hero-attacks draw + 2 to each opp)
//   bontus_cartouche -> +1/+1 -> +3/+3; target broadened from friendly-creature to
//        any creature (matches its "Target creature gains" wording / convention)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.graveyard = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};

// ---------- Sword of Fire and Ice: Swing wording ----------
{
	const def = cardsById.wastes_sword_of_fire_and_ice;
	ok('Sword text is the Swing wording (batch 62 reworded to "loses 2 Life")', def.description === 'Swing: Draw a card & each opponent loses 2 Life.', JSON.stringify(def.description));
	ok('Sword still fires on the hero swing (hero-attacks)', def.ongoing && def.ongoing.on === 'hero-attacks', JSON.stringify(def.ongoing));
	ok('Swing draws a card', def.ongoing.effects.some(e => e.type === 'draw' && e.value === 1), JSON.stringify(def.ongoing));
	ok('Swing deals 2 to each opponent', def.ongoing.effects.some(e => e.type === 'damage' && e.value === 2 && e.target === 'enemy-heroes'), JSON.stringify(def.ongoing));
	// FIRE just the ongoing: +1 card, each opponent -2 Life
	const st = game(1);
	st.players[0].deck = ['grizzly_bears', 'grizzly_bears'];
	const w = E.instantiate(def, 0); w.zone = 'hand'; st.players[0].hand.push(w);
	E.playCard(st, 0, w.uid, null, null, 0);
	const life0 = st.players[1].life, hand0 = st.players[0].hand.length;
	E.fireOngoing(st, 0, 'hero-attacks');
	ok('a Swing drew a card', st.players[0].hand.length === hand0 + 1, [hand0, st.players[0].hand.length]);
	ok('a Swing dealt 2 to the opponent', st.players[1].life === life0 - 2, [life0, st.players[1].life]);
}

// ---------- Bontu's Cartouche: +3/+3 & Lifesteal, any target ----------
{
	const def = cardsById.bontus_cartouche;
	ok("Cartouche text is \"Target creature gains +3/+3 & Lifesteal.\"", def.description === 'Target creature gains +3/+3 & Lifesteal.', JSON.stringify(def.description));
	const e = (def.effects || [])[0];
	ok('it buffs +3/+3 and grants Lifesteal', e && e.type === 'buff' && e.attack === 3 && e.health === 3 && e.grant === 'lifesteal', JSON.stringify(def.effects));
	ok('it targets any creature (not friendly-only)', e && e.target === 'creature', e && e.target);
	// FIRE on a friendly creature
	const st = game(2);
	const own = E.instantiate({ id: 'o', name: 'O', type: 'creature', cost: 2, attack: 2, health: 2 }, 0); own.zone = 'board'; own.sick = false; st.players[0].board.push(own);
	const foe = E.instantiate({ id: 'f', name: 'F', type: 'creature', cost: 2, attack: 2, health: 2 }, 1); foe.zone = 'board'; foe.sick = false; st.players[1].board.push(foe);
	const a0 = own.attack, h0 = E.hp(own);
	const c = E.instantiate(def, 0); c.zone = 'hand'; st.players[0].hand.push(c);
	E.playCard(st, 0, c.uid, { type: 'creature', uid: own.uid, player: 0 }, null, 0);
	ok('friendly target gained +3/+3 (2/2 -> 5/5)', own.attack === a0 + 3 && E.hp(own) === h0 + 3, [own.attack, E.hp(own)]);
	ok('friendly target gained Lifesteal', (own.keywords || []).includes('lifesteal'), JSON.stringify(own.keywords));
	// legality: enemy creatures are valid targets too
	const spec = E.targetSpec(st, 0, E.instantiate(def, 0));
	const legal = E.legalTargets(st, 0, spec);
	ok('an enemy creature is a legal target', legal.some(t => t.uid === foe.uid), legal.map(t => t.uid));
	ok('a friendly creature is a legal target', legal.some(t => t.uid === own.uid), legal.map(t => t.uid));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
