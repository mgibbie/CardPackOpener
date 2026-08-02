// Outfitted Jouster (4, 2/2): Battlecry draw an Equipment/Weapon; Frenzy return
// one from your graveyard. Heir to Dragonfire (2, 2/2): Firebreathing; {3}:
// reveal a Dragon in hand -> +3/+3 & Divine Shield, once per game.
import fs from 'fs';
import * as E from '../../engine.js';
import { damageCreature } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(cardsById, seededRng(9), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
	st.current = 0; st.players[1].hand = []; // no enemy responses so abilities auto-resolve
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.summonedThisTurn = false; st.players[pi].board.push(c); return c; };

// pick real Equipment (artifact w/ equip) + Weapon ids from the pool for the deck
const equipId = raw.cards.find(c => c.type === 'artifact' && c.equip)?.id;
const weaponId = raw.cards.find(c => c.type === 'weapon')?.id;
ok('found an Equipment + a Weapon card to test with', equipId && weaponId, [equipId, weaponId]);

// ---- Outfitted Jouster: Battlecry tutors an Equipment/Weapon from the deck ----
{
	const st = game();
	// deck: some vanilla creatures + one equipment; battlecry must pull the equipment
	st.players[0].deck = ['wisp', 'wisp', equipId, 'wisp'];
	const handBefore = st.players[0].hand.length;
	const j = E.instantiate(cardsById['outfitted_jouster'], 0); j.zone = 'hand'; st.players[0].hand.push(j);
	E.playCard(st, 0, j.uid, null, null, 0);
	const drewEquip = st.players[0].hand.some(c => c.id === equipId);
	ok('Jouster Battlecry drew the Equipment from the deck', drewEquip && !st.players[0].deck.includes(equipId), st.players[0].hand.map(c => c.id));
}

// ---- Outfitted Jouster: Frenzy returns an Equipment/Weapon from the graveyard ----
{
	const st = game();
	st.players[0].deck = ['wisp']; // battlecry finds no equip/weapon -> fine
	// seed the graveyard with a dead weapon
	const deadWeapon = E.instantiate(cardsById[weaponId], 0); deadWeapon.zone = 'graveyard'; st.players[0].graveyard.push(deadWeapon);
	const jouster = put(st, 0, cardsById['outfitted_jouster']); // 2/2 with the Frenzy ongoing
	const handBefore = st.players[0].hand.length;
	// deal 1 damage: it survives (2 health) -> Frenzy fires once
	damageCreature(st, jouster, 1, null);
	ok('Frenzy returned the Weapon from graveyard to hand', st.players[0].hand.some(c => c.id === weaponId) && st.players[0].graveyard.every(c => c.id !== weaponId), st.players[0].hand.map(c => c.id));
	// a second hit does NOT fire again (Frenzy is once)
	const handAfter = st.players[0].hand.length;
	damageCreature(st, jouster, 1, null);
	ok('Frenzy is once — a second hit returns nothing more', st.players[0].hand.length === handAfter, st.players[0].hand.length - handAfter);
}

// ---- Heir to Dragonfire: Firebreathing + the once-per-game reveal ability ----
{
	const st = game();
	const heir = put(st, 0, cardsById['heir_to_dragonfire']);
	// firebreathing grants a repeatable "pay 1: +1 Attack" ability; the custom
	// {3} ability is index 0
	ok('Heir has the {3} dragon ability + Firebreathing', heir.activated && heir.activated.length >= 2 && heir.activated[0].oncePerGame && heir.keywords.includes('firebreathing'), heir.activated && heir.activated.map(a => a.text || 'firebreathing'));

	// with NO Dragon in hand, the {3} ability can't be used
	st.players[0].hand = [];
	ok('cannot activate without a Dragon in hand', E.canActivate(st, 0, heir, 0) === false);

	// put a Dragon in hand -> now usable
	const dragonId = raw.cards.find(c => (c.tribe || '').includes('Dragon') && c.type === 'creature')?.id;
	const dragon = E.instantiate(cardsById[dragonId], 0); dragon.zone = 'hand'; st.players[0].hand.push(dragon);
	st.players[0].mana.cur = 10;
	ok('can activate with a Dragon in hand', E.canActivate(st, 0, heir, 0) === true, dragonId);
	const a0 = heir.attack, h0 = E.hp(heir);
	E.activateAbility(st, 0, heir.uid, 0, null);
	ok('reveal ability gives +3/+3 & Divine Shield (Dragon stays in hand)', heir.attack === a0 + 3 && E.hp(heir) === h0 + 3 && heir.keywords.includes('divine_shield') && heir.shield === true && st.players[0].hand.some(c => c.id === dragonId), [heir.attack, E.hp(heir), heir.keywords, heir.shield]);
	// once per game: cannot use it again even with a Dragon in hand and mana
	st.players[0].mana.cur = 10; heir.abilityUsedThisTurn = false;
	ok('the {3} ability is once per game', E.canActivate(st, 0, heir, 0) === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
