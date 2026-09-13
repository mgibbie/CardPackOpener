// Forty-eighth batch from the wiki's owner inbox (owner_todo), 2026-09-13.
//   doomed_traveler -> trim wording to "Deathrattle: Create a 1/1 Spirit." (mechanic unchanged)
//   ajani_welcome   -> "Alliance: Gain 2 Life." (Alliance = on creature-played; was
//                      "summoned" +1; now +2 Life each time you PLAY another creature)
//   ajani_grace     -> "Target creature gains +0/+3 & Divine Shield." — reworded AND
//                      broadened from friendly-creature to ANY creature (matches the
//                      "Target creature gains" convention: blessing_of_might / fortify)
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

// ---------- Doomed Traveler ----------
{
	const def = cardsById.doomed_traveler;
	ok('Doomed Traveler text trimmed to "Deathrattle: Create a 1/1 Spirit."', def.description === 'Deathrattle: Create a 1/1 Spirit.', JSON.stringify(def.description));
	ok('Doomed Traveler still summons a 1/1 Spirit on death', (def.deathrattle || []).some(e => e.type === 'summon' && e.name === 'Spirit' && e.attack === 1 && e.health === 1), JSON.stringify(def.deathrattle));
	const st = game(1);
	const dt = E.instantiate(def, 0); dt.zone = 'board'; dt.sick = false; st.players[0].board.push(dt);
	dt.damage = dt.maxHealth; E.sweepDeaths(st);
	const sp = st.players[0].board.find(c => c.name === 'Spirit');
	ok('Deathrattle spawned a 1/1 Spirit', sp && sp.attack === 1 && E.hp(sp) === 1 && (sp.tribe || '').includes('Spirit'), sp && [sp.attack, E.hp(sp), sp.tribe]);
}

// ---------- Ajani's Welcome: Alliance ----------
{
	const def = cardsById.ajani_welcome;
	ok("Ajani's Welcome text is \"Alliance: Gain 2 Life.\"", def.description === 'Alliance: Gain 2 Life.', JSON.stringify(def.description));
	ok('it triggers on creature-played (Alliance)', def.ongoing && def.ongoing.on === 'creature-played', JSON.stringify(def.ongoing));
	ok('it heals the hero 2', def.ongoing && def.ongoing.effects.some(e => e.type === 'heal' && e.value === 2 && e.target === 'self'), JSON.stringify(def.ongoing));
	const st = game(2);
	st.players[0].enchantments.push(E.instantiate(def, 0));
	st.players[0].life = 30;
	const play = () => { const c = E.instantiate(cardsById.grizzly_bears, 0); c.zone = 'hand'; st.players[0].hand.push(c); st.players[0].mana = { cur: 10, max: 10, bonus: 0 }; E.playCard(st, 0, c.uid, null, null, 0); };
	play();
	ok('gained 2 Life on the first creature played (30 -> 32)', st.players[0].life === 32, st.players[0].life);
	play();
	ok('gained 2 more on the second (32 -> 34)', st.players[0].life === 34, st.players[0].life);
}

// ---------- Ajani's Grace: buff + Divine Shield, any target ----------
{
	const def = cardsById.ajani_grace;
	ok("Ajani's Grace text is \"Target creature gains +0/+3 & Divine Shield.\"", def.description === 'Target creature gains +0/+3 & Divine Shield.', JSON.stringify(def.description));
	const e = (def.effects || [])[0];
	ok('it buffs +0/+3 and grants Divine Shield', e && e.type === 'buff' && e.attack === 0 && e.health === 3 && e.grant === 'divine_shield', JSON.stringify(def.effects));
	ok('it targets any creature (not friendly-only)', e && e.target === 'creature', e && e.target);
	// FIRE on a friendly creature
	const st = game(3);
	const own = E.instantiate(cardsById.grizzly_bears, 0); own.zone = 'board'; own.sick = false; st.players[0].board.push(own);
	const foe = E.instantiate(cardsById.grizzly_bears, 1); foe.zone = 'board'; foe.sick = false; st.players[1].board.push(foe);
	const h0 = E.hp(own);
	const g = E.instantiate(def, 0); g.zone = 'hand'; st.players[0].hand.push(g); st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	E.playCard(st, 0, g.uid, { type: 'creature', uid: own.uid, player: 0 }, null, 0);
	ok('friendly target gained +3 Health', E.hp(own) === h0 + 3, [h0, E.hp(own)]);
	ok('friendly target gained Divine Shield', (own.keywords || []).includes('divine_shield'), JSON.stringify(own.keywords));
	// legality: enemy creatures are now valid targets too
	const spec = E.targetSpec(st, 0, E.instantiate(def, 0));
	const legal = E.legalTargets(st, 0, spec);
	ok('an enemy creature is a legal target', legal.some(t => t.uid === foe.uid), legal.map(t => t.uid));
	ok('a friendly creature is a legal target', legal.some(t => t.uid === own.uid), legal.map(t => t.uid));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
