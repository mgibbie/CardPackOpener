// Thirty-eighth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Folklore Sycamore Ritual (blanchwood_treefolk) -> "At the end of your turn, Bolster 1."
//   Armored Wolf-Rider  -> line break between Taunt and the cost aura
//   Axebane Stag        -> drop Trample
//   Bitterbow Sharpshooters -> "Battlecry: Deal 1 damage to any target"
//   Lightning Greaves   -> reworded to "Target creature gains Rush"
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 89) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };

// ---------- Folklore Sycamore Ritual: end-of-turn Bolster 1 ----------
{
	const c = cardsById.blanchwood_treefolk;
	ok('reads "At the end of your turn, Bolster 1."', c.description === 'At the end of your turn, Bolster 1.', JSON.stringify(c.description));
	ok('fires on turn-END with bolster 1', c.ongoing?.on === 'turn-end' && c.ongoing.effects[0].type === 'bolster' && c.ongoing.effects[0].value === 1, JSON.stringify(c.ongoing));
	const st = game();
	const weak = put(st, 0, E.instantiate({ id: 'w', name: 'W', type: 'creature', cost: 1, attack: 1, health: 1 }, 0));
	const ench = E.instantiate(c, 0); ench.zone = 'enchantment'; st.players[0].enchantments.push(ench);
	const a0 = weak.attack;
	E.fireOngoing(st, 0, 'turn-end', {});
	ok('Bolster 1 grows the weakest creature +1/+1 at end of turn', weak.attack === a0 + 1 && weak.maxHealth === 2, [weak.attack, weak.maxHealth]);
}

// ---------- Armored Wolf-Rider: line break ----------
ok('Armored Wolf-Rider reads "Taunt.\\nYour Beasts cost (1) less."', cardsById.armored_wolf_rider.description === 'Taunt.\nYour Beasts cost (1) less.', JSON.stringify(cardsById.armored_wolf_rider.description));

// ---------- Axebane Stag: Trample gone, rest intact ----------
{
	const c = cardsById.axebane_stag;
	ok('no longer has Trample', !(c.keywords || []).includes('trample'), JSON.stringify(c.keywords));
	ok('reads "Battlecry: Destroy target Hero Weapon.\\nConnect: Gain +2/+2."', c.description === 'Battlecry: Destroy target Hero Weapon.\nConnect: Gain +2/+2.', JSON.stringify(c.description));
	ok('still has the Battlecry destroy-weapon + Connect', (c.keywords || []).includes('battlecry') && c.effects?.[0]?.type === 'destroy-weapon' && c.ongoing?.on === 'self-hit-player', JSON.stringify([c.keywords, c.effects, c.ongoing]));
}

// ---------- Bitterbow Sharpshooters: Battlecry deal 1 to any target ----------
{
	const c = cardsById.bitterbow_sharpshooters;
	ok('reads "Deathtouch.\\nBattlecry: Deal 1 damage to any target."', c.description === 'Deathtouch.\nBattlecry: Deal 1 damage to any target.', JSON.stringify(c.description));
	ok('has Battlecry + a deal-1-to-any effect', (c.keywords || []).includes('battlecry') && c.effects?.[0]?.type === 'damage' && c.effects[0].value === 1 && c.effects[0].target === 'any', JSON.stringify([c.keywords, c.effects]));
	// FIRE it at the enemy hero
	const st = game();
	const life0 = st.players[1].life;
	const inst = E.instantiate(c, 0); inst.zone = 'hand'; st.players[0].hand.push(inst); st.players[0].mana.cur = 10;
	E.playCard(st, 0, inst.uid, { type: 'hero', player: 1 }, null, 0);
	ok('Battlecry dealt 1 to the enemy hero', st.players[1].life === life0 - 1, [life0, st.players[1].life]);
}

// ---------- Lightning Greaves: "Target creature gains Rush" ----------
{
	const c = cardsById.wastes_lightning_greaves;
	ok('reads "Target creature gains Rush."', c.description === 'Target creature gains Rush.', JSON.stringify(c.description));
	const st = game();
	const tgt = put(st, 0, E.instantiate({ id: 'v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2 }, 0));
	const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, { type: 'creature', uid: tgt.uid, player: 0 }, null, 0);
	ok('the target creature gained Rush', (tgt.keywords || []).includes('rush'), JSON.stringify(tgt.keywords));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
