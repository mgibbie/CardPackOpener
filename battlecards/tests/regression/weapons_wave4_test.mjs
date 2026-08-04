// Missing HS weapons — wave 4: dynamic weapon attack, noFace, unlimited attacks,
// double hero damage (new core hooks).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 47) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const HAV = (st) => E.heroAttackValue(st, st.players[0]);

for (const id of ['bladed_gauntlet', 'cogmaster_s_wrench', 'spirit_claws', 'fool_s_bane', 'lightbringer_s_hammer', 'cursed_blade'])
	ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// Bladed Gauntlet: Attack = your Armor; can't attack heroes
{
	const st = game(); equip(st, 'bladed_gauntlet');
	st.players[0].armor = 0;
	ok('Bladed Gauntlet: 0 Attack at 0 Armor', HAV(st) === 0, HAV(st));
	st.players[0].armor = 5;
	ok('Bladed Gauntlet: Attack tracks Armor (5)', HAV(st) === 5, HAV(st));
	put(st, 1, dummy(0, 4, 'Foe'));
	const targets = E.heroAttackTargets(st, 0);
	ok('Bladed Gauntlet: can hit minions but NOT the enemy hero', targets.some(t => t.type === 'creature') && !targets.some(t => t.type === 'hero'), targets.map(t => t.type));
}
// Cogmaster's Wrench: +2 Attack while you have a Mech
{
	const st = game(); equip(st, 'cogmaster_s_wrench'); const base = cardsById.cogmaster_s_wrench.attack;
	ok('Cogmaster: base Attack without a Mech', HAV(st) === base, HAV(st));
	put(st, 0, dummy(2, 2, 'M', { tribe: 'Mech' }));
	ok('Cogmaster: +2 Attack with a Mech', HAV(st) === base + 2, HAV(st));
}
// Spirit Claws: +2 Attack while you have Spell Damage
{
	const st = game(); equip(st, 'spirit_claws'); const base = cardsById.spirit_claws.attack;
	ok('Spirit Claws: base Attack without Spell Damage', HAV(st) === base, HAV(st));
	put(st, 0, dummy(1, 1, 'SD', { static: { type: 'spell-damage', value: 1 } }));
	ok('Spirit Claws: +2 Attack with Spell Damage', HAV(st) === base + 2, HAV(st));
}
// Fool's Bane: unlimited attacks; can't attack heroes
{
	const st = game(); equip(st, 'fool_s_bane');
	put(st, 1, dummy(0, 4, 'Foe'));
	st.players[0].heroAttacksUsed = 5;
	ok('Fool\'s Bane: hero can still attack after many swings', E.canHeroAttack(st, 0));
	ok('Fool\'s Bane: no enemy-hero target (Can\'t attack heroes)', !E.heroAttackTargets(st, 0).some(t => t.type === 'hero'));
}
// Lightbringer's Hammer: Lifesteal (heals hero on attack) + can't attack heroes
{
	const st = game(); const foe = put(st, 1, dummy(0, 6, 'Foe'));
	const w = equip(st, 'lightbringer_s_hammer'); st.players[0].life = 20;
	ok('Lightbringer\'s Hammer has Lifesteal', (w.keywords || []).includes('lifesteal'));
	st.players[0].heroAttacksUsed = 0; E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
	ok('Lightbringer\'s Hammer: attacking heals the hero (Lifesteal)', st.players[0].life === 20 + w.attack, [st.players[0].life, w.attack]);
	ok('Lightbringer\'s Hammer: cannot target the enemy hero', !E.heroAttackTargets(st, 0).some(t => t.type === 'hero'));
}
// Cursed Blade: double all damage dealt to your hero
{
	const st = game(); equip(st, 'cursed_blade'); st.players[0].life = 30;
	E.damageHero(st, 0, 3, 1);
	ok('Cursed Blade: 3 damage becomes 6', st.players[0].life === 24, st.players[0].life);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
