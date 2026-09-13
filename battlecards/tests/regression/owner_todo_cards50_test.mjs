// Fiftieth batch from the wiki's owner inbox (owner_todo), 2026-09-13.
// (Arrived while batch 49 was in flight — three more Wastes-pool cards.)
//   wastes_skullclamp      -> "Avenge 1: Draw a card." (weapon; ongoings every:1)
//   wastes_swiftfoot_boots -> Sorcery -> Equipment granting Elusive; Equip (1)
//   wastes_grafted_wargear -> reword to "Swing: Creatures you control gain +1 Attack."
//                             (mechanic unchanged: hero-attacks +1/+0 to friendly creatures)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.graveyard = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};

// ---------- Skullclamp: Avenge 1 -> Draw ----------
{
	const def = cardsById.wastes_skullclamp;
	ok('Skullclamp text is "Avenge 1: Draw a card."', def.description === 'Avenge 1: Draw a card.', JSON.stringify(def.description));
	ok('Skullclamp is still a weapon', def.type === 'weapon', def.type);
	const t = (def.ongoings || [])[0];
	ok('Avenge 1 is a friendly-creature-died trigger (every:1) that draws', t && t.on === 'friendly-creature-died' && t.every === 1 && t.effects.some(e => e.type === 'draw' && e.value === 1), JSON.stringify(def.ongoings));
	// FIRE: a friendly creature dies -> draw a card
	const st = game(1);
	st.players[0].deck = ['grizzly_bears', 'grizzly_bears'];
	st.players[0].weapon = E.instantiate(def, 0);
	const cr = E.instantiate({ id: 'tmob', name: 'T', type: 'creature', cost: 1, attack: 1, health: 1 }, 0); cr.zone = 'board'; st.players[0].board.push(cr);
	const h0 = st.players[0].hand.length;
	cr.damage = cr.maxHealth; E.sweepDeaths(st);
	ok('a friendly death drew a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]);
}

// ---------- Swiftfoot Boots: Equipment granting Elusive ----------
{
	const def = cardsById.wastes_swiftfoot_boots;
	ok('Swiftfoot Boots is an artifact (Equipment)', def.type === 'artifact', def.type);
	ok('Swiftfoot Boots equip grants Elusive', def.equip && (def.equip.keywords || []).includes('elusive'), JSON.stringify(def.equip));
	ok('Swiftfoot Boots equips for 1', def.equip && def.equip.cost === 1, def.equip && def.equip.cost);
	ok('Swiftfoot Boots has no leftover spell effects', def.effects === undefined, JSON.stringify(def.effects));
	ok('Swiftfoot Boots text is the Equipment format', def.description === 'Equipped creature has Elusive.\nEquip (1).', JSON.stringify(def.description));
	// FIRE: play + equip -> creature gains Elusive
	const st = game(2);
	const cr = E.instantiate({ id: 'tmob2', name: 'T', type: 'creature', cost: 3, attack: 3, health: 3 }, 0); cr.zone = 'board'; cr.sick = false; st.players[0].board.push(cr);
	const b = E.instantiate(def, 0); b.zone = 'hand'; st.players[0].hand.push(b);
	E.playCard(st, 0, b.uid, null, null, 0);
	const inPlay = st.players[0].artifacts.find(a => a.id === 'wastes_swiftfoot_boots');
	ok('played into the artifact zone', !!inPlay, st.players[0].artifacts.map(a => a.id));
	const okEquip = E.equip(st, 0, inPlay.uid, cr.uid); E.recomputeAuras(st);
	ok('equip succeeds and grants Elusive', okEquip && (cr.keywords || []).includes('elusive'), [okEquip, cr.keywords]);
}

// ---------- Grafted Wargear: Swing wording, mechanic unchanged ----------
{
	const def = cardsById.wastes_grafted_wargear;
	ok('Grafted Wargear text is the Swing wording', def.description === 'Swing: Creatures you control gain +1 Attack.', JSON.stringify(def.description));
	ok('Grafted Wargear still fires on the hero swing (hero-attacks)', def.ongoing && def.ongoing.on === 'hero-attacks' && def.ongoing.effects.some(e => e.type === 'buff' && e.attack === 1 && e.target === 'friendly-creatures'), JSON.stringify(def.ongoing));
	// FIRE: equip + swing -> friendly creatures get +1 Attack
	const st = game(3);
	const c1 = E.instantiate({ id: 'f1', name: 'F1', type: 'creature', cost: 2, attack: 2, health: 3 }, 0); c1.zone = 'board'; c1.sick = false; st.players[0].board.push(c1);
	const foe = E.instantiate({ id: 'vf', name: 'VF', type: 'creature', cost: 2, attack: 1, health: 4 }, 1); foe.zone = 'board'; foe.sick = false; st.players[1].board.push(foe);
	const w = E.instantiate(def, 0); w.zone = 'hand'; st.players[0].hand.push(w);
	E.playCard(st, 0, w.uid, null, null, 0); st.players[0].heroAttacksUsed = 0;
	const a0 = c1.attack;
	E.heroAttack(st, 0, { type: 'hero', player: 1 });
	ok('a Swing gives your creatures +1 Attack (2 -> 3)', c1.attack === a0 + 1, [a0, c1.attack]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
