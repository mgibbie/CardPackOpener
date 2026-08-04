// Wave 22: Poisoned Blade — your Hero Power gives this +1 Attack instead of replacing it.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
const classes = JSON.parse(fs.readFileSync(new URL('../../classes.json', import.meta.url)));
const roguePower = classes.classes.find(x => /rogue/i.test(x.id || x.name)).power;
const magePower = classes.classes.find(x => /mage/i.test(x.id || x.name)).power;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (heroClass, power, seed = 3) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: heroClass, name: 'M', power }, { id: 'warrior', name: 'N', power: null }]);
	st.current = 0; st.players[0].mana.cur = 10; st.players[0].mana.max = 10;
	st.players[0].heroClass = heroClass;
	return st;
};
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const refreshHP = (st) => { for (const hp of st.players[0].heroPowers) hp.usedThisTurn = false; st.players[0].mana.cur = 10; };

ok('poisoned_blade exists', cardsById.poisoned_blade);

// Rogue: equip Poisoned Blade, then Hero Power buffs it +1 instead of equipping a Wicked Knife
{
	const st = game('rogue', roguePower);
	const w = equip(st, 'poisoned_blade');
	ok('equipped Poisoned Blade at 1/3', w && w.attack === 1 && w.durability === 3, w && [w.attack, w.durability]);
	const hp = st.players[0].heroPowers[0];
	st.players[0].mana.cur = 10;
	E.useHeroPower(st, 0, hp.uid, null, null);
	const now = st.players[0].weapon;
	ok('weapon is still Poisoned Blade (not replaced by a Wicked Knife)', now && now.id === 'poisoned_blade', now && now.name);
	ok('Hero Power gave it +1 Attack (1 -> 2)', now && now.attack === 2, now && now.attack);
	ok('durability unchanged (still 3)', now && now.durability === 3, now && now.durability);
	// again next turn -> +1 more
	refreshHP(st);
	E.useHeroPower(st, 0, hp.uid, null, null);
	ok('second Hero Power stacks (2 -> 3)', st.players[0].weapon.attack === 3, st.players[0].weapon.attack);
}

// Non-rogue (Mage): Poisoned Blade still gains +1 even though the Hero Power doesn't equip
{
	const st = game('mage', magePower);
	const w = equip(st, 'poisoned_blade');
	const hp = st.players[0].heroPowers[0];
	st.players[0].mana.cur = 10;
	// Mage Fireblast targets a hero; aim at the enemy
	E.useHeroPower(st, 0, hp.uid, { type: 'hero', player: 1 }, null);
	ok('Mage: Poisoned Blade gained +1 from a non-equipping Hero Power', st.players[0].weapon.attack === 2, st.players[0].weapon.attack);
}

// Control: a normal Rogue weapon (Wicked Knife) IS replaced by the Hero Power
{
	const st = game('rogue', roguePower);
	// give the player a plain weapon first via the hero power itself
	const hp = st.players[0].heroPowers[0];
	E.useHeroPower(st, 0, hp.uid, null, null);
	const first = st.players[0].weapon;
	ok('rogue HP equipped a Wicked Knife (1/2)', first && first.attack === 1 && first.durability === 2, first && [first.name, first.attack, first.durability]);
	refreshHP(st);
	E.useHeroPower(st, 0, hp.uid, null, null);
	const second = st.players[0].weapon;
	ok('a plain weapon is REPLACED (durability reset to 2, not +1 attack)', second && second.attack === 1 && second.durability === 2, second && [second.attack, second.durability]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
