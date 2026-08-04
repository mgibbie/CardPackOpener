// Missing HS weapons — wave 1: battlecry/deathrattle weapons on existing effects.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 44) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const equip = (st, pi, id) => { const w = E.instantiate(cardsById[id], pi); w.zone = 'hand'; st.players[pi].hand.push(w); st.players[pi].mana.cur = 10; E.playCard(st, pi, w.uid, null, null, 0); return st.players[pi].weapon; };

for (const id of ['glaivezooka', 'woodcutter_s_axe', 'powermace', 'coghammer', 'shadowblade', 'blood_razor', 'headhunter_s_hatchet', 'king_s_defender'])
	ok(`${id} exists as a weapon`, cardsById[id] && cardsById[id].type === 'weapon', id);

// Glaivezooka: Battlecry give a random friendly minion +1 Attack
{
	const st = game(); const m = put(st, 0, null, dummy(2, 2, 'M'));
	equip(st, 0, 'glaivezooka');
	ok('Glaivezooka: friendly minion +1 Attack', m.attack === 3, m.attack);
}
// Woodcutter's Axe: Deathrattle +2/+1 to a random friendly
{
	const st = game(); const m = put(st, 0, null, dummy(2, 2, 'M'));
	const w = equip(st, 0, 'woodcutter_s_axe');
	E.breakWeapon(st, 0);
	ok('Woodcutter\'s Axe deathrattle: +2/+1', m.attack === 4 && E.hp(m) === 3, [m.attack, E.hp(m)]);
}
// Powermace: Deathrattle +2/+2 to a random friendly MECH (non-mech unaffected)
{
	const st = game(); const mech = put(st, 0, null, dummy(2, 2, 'Mech', { tribe: 'Mech' })); const bio = put(st, 0, null, dummy(2, 2, 'Bio'));
	equip(st, 0, 'powermace'); E.breakWeapon(st, 0);
	ok('Powermace buffs the Mech +2/+2', mech.attack === 4 && E.hp(mech) === 4, [mech.attack, E.hp(mech)]);
	ok('Powermace leaves the non-Mech alone', bio.attack === 2, bio.attack);
}
// Coghammer: Battlecry give a random friendly Divine Shield AND Taunt
{
	const st = game(); const m = put(st, 0, null, dummy(2, 2, 'M'));
	equip(st, 0, 'coghammer');
	ok('Coghammer grants Divine Shield and Taunt', (m.keywords || []).includes('divine_shield') && (m.keywords || []).includes('taunt') && m.shield === true, m.keywords);
}
// Shadowblade: Battlecry hero Immune this turn
{
	const st = game();
	equip(st, 0, 'shadowblade');
	E.damageHero(st, 0, 5, 1);
	ok('Shadowblade: hero is Immune (no damage)', st.players[0].life === 30, st.players[0].life);
}
// Blood Razor: Battlecry AND Deathrattle deal 1 to all minions
{
	const st = game(); const a = put(st, 0, null, dummy(2, 3, 'A')); const b = put(st, 1, null, dummy(2, 3, 'B'));
	equip(st, 0, 'blood_razor');
	ok('Blood Razor battlecry dealt 1 to all minions', a.damage === 1 && b.damage === 1, [a.damage, b.damage]);
	E.breakWeapon(st, 0);
	ok('Blood Razor deathrattle dealt another 1 (both at 2)', a.damage === 2 && b.damage === 2, [a.damage, b.damage]);
}
// Headhunter's Hatchet: +1 Durability if you control a Beast
{
	const st = game(); put(st, 0, null, dummy(2, 2, 'Wolf', { tribe: 'Beast' }));
	const w = equip(st, 0, 'headhunter_s_hatchet');
	ok('Headhunter\'s Hatchet gains +1 Durability with a Beast (2→3)', w.durability === 3, w.durability);
}
{
	const st = game(); // no beast
	const w = equip(st, 0, 'headhunter_s_hatchet');
	ok('Headhunter\'s Hatchet stays 2 Durability without a Beast', w.durability === 2, w.durability);
}
// King's Defender: +1 Durability if you have a Taunt minion
{
	const st = game(); put(st, 0, null, dummy(2, 2, 'T', { keywords: ['taunt'] }));
	const w = equip(st, 0, 'king_s_defender');
	ok('King\'s Defender gains +1 Durability with a Taunt (2→3)', w.durability === 3, w.durability);
}
{
	const st = game();
	const w = equip(st, 0, 'king_s_defender');
	ok('King\'s Defender stays 2 without a Taunt', w.durability === 2, w.durability);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
