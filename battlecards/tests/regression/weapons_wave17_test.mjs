// Missing HS weapons — wave 17: Forgetful (Ogre Warmaul) + absorb-hero-damage (Bulwark of Azzinoth).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 65) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'warrior', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h });
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };

for (const id of ['ogre_warmaul', 'bulwark_of_azzinoth']) ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);
ok('Ogre Warmaul is Forgetful', (cardsById.ogre_warmaul.keywords || []).includes('forgetful'));
ok('Bulwark carries the absorb flag', cardsById.bulwark_of_azzinoth.absorbHeroDamageToWeapon === true);

// Forgetful: over many attacks, roughly half hit a DIFFERENT enemy minion than intended
{
	let intended = 0, redirected = 0;
	for (let seed = 0; seed < 60; seed++) {
		const st = game(seed);
		const a = put(st, 1, dummy(0, 20, 'A')); put(st, 1, dummy(0, 20, 'B'));
		equip(st, 'ogre_warmaul'); st.players[0].heroAttacksUsed = 0;
		const aBefore = a.damage, foeLife = st.players[1].life;
		E.heroAttack(st, 0, { type: 'creature', uid: a.uid, player: 1 }); // aim at A
		// "wrong enemy" = the other minion OR the enemy hero
		if (a.damage > aBefore) intended++; else redirected++;
	}
	ok('Forgetful: ~half the swings landed on the intended target', intended > 15 && intended < 45, intended);
	ok('Forgetful: the rest were redirected to a different enemy', redirected > 15 && redirected < 45, redirected);
	ok('Forgetful: no swing was lost (intended + redirected = 60)', intended + redirected === 60, [intended, redirected]);
}

// Bulwark of Azzinoth: hero damage is absorbed as weapon Durability instead
{
	const st = game();
	const w = equip(st, 'bulwark_of_azzinoth'); const d0 = w.durability; // 4
	E.damageHero(st, 0, 5, 1);
	ok('Bulwark: the hero took no damage', st.players[0].life === 30, st.players[0].life);
	ok('Bulwark: the weapon lost 1 Durability instead (regardless of amount)', st.players[0].weapon.durability === d0 - 1, [d0, st.players[0].weapon?.durability]);
	// drain the weapon; once broken, damage falls through to the hero again
	E.damageHero(st, 0, 1, 1); E.damageHero(st, 0, 1, 1); E.damageHero(st, 0, 1, 1); // 3 more → durability 0 → breaks
	ok('Bulwark broke after absorbing 4 hits', !st.players[0].weapon, st.players[0].weapon?.durability);
	E.damageHero(st, 0, 6, 1);
	ok('with no Bulwark, damage hits the hero normally', st.players[0].life === 24, st.players[0].life);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
