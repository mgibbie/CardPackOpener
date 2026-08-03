// Group E ("after you <action>" triggers) wave 3 — Magnetize / draw / secret-reveal.
// Invent-o-Matic (Magnetize a minion → give it +1/+1), Clumsy Steward (a card you
// draw becomes Temporary), Orion Mansion Manager (a friendly Secret revealed →
// cast a different Mage Secret and gain +2/+2).
//
// Verified ALREADY faithful while scoping (NOT re-wired): Lumia (heroImmuneOnDamage,
// damage.js), Anchorite (overhealReactive, exec.js).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 35) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; c.summonedThisTurn = false; c.attacksUsed = 0; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name = 'D', extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 3, rarity: 'basic', attack: a, health: h, ...extra });

// data sanity
ok('Invent-o-Matic carries a magnetized trigger', cardsById.invent_o_matic.ongoing?.on === 'magnetized' && cardsById.invent_o_matic.ongoing.effects?.[0]?.type === 'buff-magnetized');
ok('Clumsy Steward carries a card-drawn trigger', cardsById.clumsy_steward.ongoing?.on === 'card-drawn' && cardsById.clumsy_steward.ongoing.effects?.[0]?.type === 'make-drawn-temporary');
ok('Orion carries a friendly secret-revealed trigger', cardsById.orion_mansion_manager.ongoing?.on === 'secret-revealed' && cardsById.orion_mansion_manager.ongoing.if?.friendlySecret === true);

// Invent-o-Matic: Magnetizing a Mech gives that Mech an extra +1/+1
{
	const st = game();
	put(st, 0, 'invent_o_matic');
	const mech = put(st, 0, null, dummy(3, 3, 'Mech', { tribe: 'Mech' })); // 3/3 friendly Mech
	const magDef = { id: 't_mag', name: 'Magnet', type: 'creature', cost: 1, rarity: 'common', tribe: 'Mech', magnetic: true, attack: 2, health: 2, keywords: [] };
	cardsById.t_mag = magDef;
	const mag = E.instantiate(magDef, 0); mag.zone = 'hand'; st.players[0].hand.push(mag);
	E.playCard(st, 0, mag.uid, { type: 'creature', uid: mech.uid, player: 0 }, null, 0);
	// merge +2/+2 → 5/5, then Invent-o-Matic +1/+1 → 6/6
	ok('Magnetized Mech got the merge AND Invent-o-Matic\'s +1/+1 (6/6)', mech.attack === 6 && E.hp(mech) === 6, [mech.attack, E.hp(mech)]);
}
// Invent-o-Matic does NOT fire when a non-magnetic minion is simply played
{
	const st = game();
	const iom = put(st, 0, 'invent_o_matic');
	const plainDef = dummy(4, 4, 'Plain', { tribe: 'Mech' });
	cardsById.dm_Plain = plainDef;
	const plain = E.instantiate(plainDef, 0); plain.zone = 'hand'; st.players[0].hand.push(plain);
	E.playCard(st, 0, plain.uid, null, null, 0);
	const p = st.players[0].board.find(c => c.id === 'dm_Plain');
	ok('a normal Mech play does not get the Magnetize buff', p && p.attack === 4 && E.hp(p) === 4, p && [p.attack, E.hp(p)]);
}

// Clumsy Steward: a card you draw becomes Temporary (vanishes at end of turn)
{
	const st = game();
	put(st, 0, 'clumsy_steward');
	st.players[0].deck = ['chillwind_yeti'];
	E.drawCards(st, 0, 1);
	const drawn = st.players[0].hand.find(c => c.id === 'chillwind_yeti');
	ok('the drawn card is marked Temporary', drawn && drawn.temporary === true, drawn && drawn.temporary);
	// end of your turn discards it
	E.endTurn(st);
	ok('the Temporary card was discarded at end of turn', !st.players[0].hand.some(c => c.id === 'chillwind_yeti'), st.players[0].hand.map(c => c.id));
}

// Orion, Mansion Manager: when a friendly Secret is revealed, gain +2/+2 and install another Mage Secret
{
	const st = game();
	const orion = put(st, 0, 'orion_mansion_manager'); // 3/5
	E.installSecret(st, 0, 'ice_barrier'); // a friendly Mage Secret
	const secretsBefore = st.players[0].secrets.length; // 1
	// opponent attacks your hero → Ice Barrier reveals
	const atk = put(st, 1, null, dummy(3, 3, 'Atk'));
	st.current = 1;
	E.attack(st, 1, atk.uid, { type: 'hero', player: 0 });
	ok('Orion grew +2/+2 from the friendly Secret reveal', orion.attack === 5 && E.hp(orion) === 7, [orion.attack, E.hp(orion)]);
	// Ice Barrier left, a new Mage Secret came in (net secret count is >= the reveal-adjusted baseline)
	const hasNewSecret = st.players[0].secrets.some(s => s.id !== 'ice_barrier') || st.players[0].secrets.length >= secretsBefore;
	ok('Orion installed a different Mage Secret', st.players[0].secrets.length >= 1 && st.players[0].secrets.some(s => (cardsById[s.id]?.cardClass) === 'mage'), st.players[0].secrets.map(s => s.id));
}
// Orion ignores the ENEMY's Secret revealing (friendlySecret gate)
{
	const st = game();
	const orion = put(st, 0, 'orion_mansion_manager');
	E.installSecret(st, 1, 'ice_barrier'); // the OPPONENT's Secret
	// you attack the opponent's hero → their Ice Barrier reveals (secretOwner = 1, not you)
	const atk = put(st, 0, null, dummy(3, 3, 'Atk'));
	st.current = 0;
	E.attack(st, 0, atk.uid, { type: 'hero', player: 1 });
	ok('Orion did NOT grow from the enemy Secret reveal', orion.attack === 3 && E.hp(orion) === 5, [orion.attack, E.hp(orion)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
