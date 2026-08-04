// Missing HS weapons & locations — wave 3 (workflow batch): 37 cards produced by
// the wiring workflow, adversarially verified, strict-validated, smoke-tested.
// This test crash-checks every one and behaviourally spot-checks a sample.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const IDS = ["charged_hammer", "argent_lance", "dreadprison_glaive", "the_lobotomizer", "sword_of_the_fallen", "necrium_blade", "warglaives_of_azzinoth", "light_s_sorrow", "rinling_s_rifle", "ringmaster_s_baton", "defiled_spear", "jagged_edge_of_time", "chronoclaws", "idol_s_adoration", "cindersword", "interstellar_starslicer", "the_runespear", "foamrender", "hope_of_quel_thalas", "runed_mithril_rod", "shadowcloth_needle", "prismatic_jewel_kit", "counterfeit_blade", "leatherworking_kit", "time_lost_glaive", "staff_of_the_primus", "trusty_fishing_rod", "seedcloud_buckler", "battlepickaxe", "starshooter", "libram_of_judgment_corrupted", "muck_pools", "mosh_pit", "spawning_pool", "starport", "warp_gate", "fairy_tale_forest"];

const game = (seed = 46) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = ['chillwind_yeti', 'chillwind_yeti', 'explosive_trap']; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const swingMinion = (st, foeUid) => { st.players[0].heroAttacksUsed = 0; if (st.players[0].weapon?.attack > 0) E.heroAttack(st, 0, { type: 'creature', uid: foeUid, player: 1 }); };

// all present
ok('all 37 workflow cards exist', IDS.every(id => cardsById[id]), IDS.filter(id => !cardsById[id]));

// crash-check every card (equip/play + attack + break for weapons, play + tap for locations), strict effects on
{
	let crashed = [];
	for (const id of IDS) {
		try {
			const st = game(); st.debug = { strictEffects: true };
			const fr = put(st, 0, dummy(2, 3, 'Fr', { keywords: ['divine_shield'], deathrattle: [{ type: 'damage', value: 1, target: 'enemy-hero' }] }));
			const foe = put(st, 1, dummy(0, 4, 'Foe'));
			put(st, 1, dummy(0, 4, 'Foe2'));
			const c = cardsById[id];
			const inst = E.instantiate(c, 0); inst.zone = 'hand'; st.players[0].hand.push(inst);
			E.playCard(st, 0, inst.uid, c.type === 'location' ? null : null, null, 0);
			if (c.type === 'weapon') { swingMinion(st, foe.uid); st.players[0].heroAttacksUsed = 0; if (st.players[0].weapon?.attack > 0) E.heroAttack(st, 0, { type: 'hero', player: 1 }); if (st.players[0].weapon) E.breakWeapon(st, 0); }
			else { const loc = st.players[0].board.find(x => x.id === id); if (loc) E.tapLand(st, 0, loc.uid, 0, { type: 'creature', uid: fr.uid, player: 0 }); }
		} catch (e) { crashed.push(id + ':' + (e.message || e).slice(0, 60)); }
	}
	ok('no card crashes on equip/play/attack/break/tap (strict effects)', crashed.length === 0, crashed);
}

// --- behavioural spot-checks ---
// Warglaives of Azzinoth: after attacking a MINION, the hero may attack again
{
	const st = game(); const foe = put(st, 1, dummy(0, 5, 'Foe'));
	equip(st, 'warglaives_of_azzinoth'); swingMinion(st, foe.uid);
	ok('Warglaives: hero can attack again after hitting a minion', E.canHeroAttack(st, 0), st.players[0].heroAttacksUsed);
}
// Defiled Spear: after hero attacks, deal hero-Attack damage to a random enemy
// ("another random enemy" — can be a minion OR the enemy hero)
{
	const st = game(); const foe = put(st, 1, dummy(0, 5, 'Foe')); const other = put(st, 1, dummy(0, 8, 'Other'));
	const w = equip(st, 'defiled_spear'); const atk = w.attack;
	swingMinion(st, foe.uid);
	const totalToEnemies = (foe.damage || 0) + (other.damage || 0) + (30 - st.players[1].life); // swing + splash
	ok('Defiled Spear dealt the swing PLUS a hero-Attack splash to a random enemy', totalToEnemies >= atk * 2, [foe.damage, other.damage, st.players[1].life, atk]);
}
// Ringmaster's Baton: after hero attacks, a Mech in hand gets +1/+1
{
	const st = game(); const foe = put(st, 1, dummy(0, 5, 'Foe')); const mech = toHand(st, 0, dummy(2, 2, 'Mech', { tribe: 'Mech' }));
	equip(st, 'ringmaster_s_baton'); swingMinion(st, foe.uid);
	ok('Ringmaster\'s Baton: Mech in hand +1/+1', mech.attack === 3 && mech.maxHealth === 3, [mech.attack, mech.maxHealth]);
}
// Hope of Quel'Thalas: after hero attacks, your minions (board + hand) +1/+1
{
	const st = game(); const foe = put(st, 1, dummy(0, 5, 'Foe')); const board = put(st, 0, dummy(2, 2, 'B')); const hand = toHand(st, 0, dummy(2, 2, 'H'));
	equip(st, 'hope_of_quel_thalas'); swingMinion(st, foe.uid);
	ok('Hope of Quel\'Thalas buffs board and hand minions +1/+1', board.attack === 3 && hand.attack === 3, [board.attack, hand.attack]);
}
// Light's Sorrow: after a friendly minion loses Divine Shield, weapon +1 Attack
{
	const st = game(); const shielded = put(st, 0, dummy(2, 3, 'S', { keywords: ['divine_shield'] }));
	const attacker = put(st, 1, dummy(2, 2, 'Atk'));
	const w = equip(st, 'light_s_sorrow'); const a0 = w.attack;
	st.current = 1; E.attack(st, 1, attacker.uid, { type: 'creature', uid: shielded.uid, player: 0 }); // pop the shield in combat
	ok('the shield actually popped', !shielded.shield);
	ok('Light\'s Sorrow: weapon +1 Attack when a shield pops', st.players[0].weapon.attack === a0 + 1, [a0, st.players[0].weapon.attack]);
}
// Necrium Blade: Deathrattle triggers a random friendly minion's Deathrattle
{
	const st = game();
	put(st, 0, dummy(2, 2, 'DR', { keywords: ['deathrattle'], deathrattle: [{ type: 'damage', value: 3, target: 'enemy-hero' }] }));
	equip(st, 'necrium_blade'); E.breakWeapon(st, 0);
	ok('Necrium Blade re-triggered a friendly Deathrattle (enemy hero -3)', st.players[1].life === 27, st.players[1].life);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
