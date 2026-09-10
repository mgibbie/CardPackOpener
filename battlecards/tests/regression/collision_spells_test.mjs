// collision_spells_test.mjs — the 8 HS spells imported under VARIANT NAMES
// (owner ruling 2026-09-11): their real names collide with existing non-HS
// cards (Bear Trap, Counterspell, Lightning Bolt, Naturalize, Divination,
// Flame Geyser, Mirror Image, Wanted Poster), so each carries a fresh display
// name and its faithful HS mechanics. Every card is FIRED, never inspected.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'Dummy', type: 'creature', cost: 1, attack: 2, health: 9, rarity: 'common' };
byId._bolt = { id: '_bolt', name: 'Test Bolt', type: 'sorcery', cost: 1, rarity: 'common', effects: [{ type: 'damage', value: 2, target: 'enemy-hero' }] };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(88), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v']; p.board = []; p.secrets = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const give = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// ---- collision guard: every variant name is UNIQUE in the whole pool ----
{
	const namesOf = n => raw.cards.filter(c => (c.name || '').toLowerCase() === n.toLowerCase());
	for (const n of ['Baited Bear Trap', 'Arcane Counterspell', "Stormcaller's Bolt", 'Renaturalize', 'Wisp Divination', 'Molten Geyser', 'Mirror Images', 'Arrest Warrant'])
		ok(`"${n}" has exactly one card`, namesOf(n).length === 1, namesOf(n).map(c => c.id).join(','));
	// and the incumbents still exist untouched
	for (const id of ['bear_trap', 'counterspell', 'lightning_bolt', 'naturalize', 'divination', 'flame_geyser', 'mirror_image', 'wanted_poster'])
		ok(`incumbent ${id} still exists`, !!byId[id]);
}

// ---- Baited Bear Trap: hero attacked -> a 3/3 Bear with Taunt ----
{
	const st = fresh();
	const trap = give(st, 0, 'baited_bear_trap');
	E.playCard(st, 0, trap.uid, null);
	ok('the trap arms as a secret', st.players[0].secrets.length === 1);
	const atk = put(st, 1, '_v');
	st.current = 1;
	E.attack(st, 1, atk.uid, { type: 'hero', player: 0 });
	const bear = st.players[0].board.find(c => c.name === 'Bear');
	ok('a Bear answers the attack', !!bear);
	ok('...a 3/3 with Taunt', bear && bear.attack === 3 && bear.maxHealth === 3 && (bear.keywords || []).includes('taunt'), bear && JSON.stringify([bear.attack, bear.maxHealth, bear.keywords]));
	ok('the secret is spent', st.players[0].secrets.length === 0);
}

// ---- Arcane Counterspell: the opponent's next spell is countered ----
{
	const st = fresh();
	const cs = give(st, 0, 'arcane_counterspell');
	E.playCard(st, 0, cs.uid, null);
	st.current = 1;
	const bolt = give(st, 1, '_bolt');
	const hpBefore = st.players[0].life;
	E.playCard(st, 1, bolt.uid, null);
	ok('the countered bolt never lands', st.players[0].life === hpBefore, `${hpBefore} -> ${st.players[0].life}`);
	ok('the counter secret is spent', st.players[0].secrets.length === 0);
	ok('it IS a counter card (correspondence-banned family)', st.players[0].secrets.length === 0 && !!byId.arcane_counterspell.secret.effects.find(e => e.type === 'counter'));
}

// ---- Stormcaller's Bolt: 3 damage to anything, Overload (1) ----
{
	const st = fresh();
	const foe = put(st, 1, '_v');
	const bolt = give(st, 0, 'stormcallers_bolt');
	E.playCard(st, 0, bolt.uid, { type: 'creature', uid: foe.uid, player: 1 });
	ok('the bolt deals 3', foe.damage === 3, foe.damage);
	ok('and locks 1 mana next turn', (st.players[0].overloadPending || 0) === 1, st.players[0].overloadPending);
}

// ---- Renaturalize: destroy a creature, an opponent draws two ----
{
	const st = fresh();
	const foe = put(st, 1, '_v');
	const nat = give(st, 0, 'renaturalize');
	const handBefore = st.players[1].hand.length;
	E.playCard(st, 0, nat.uid, { type: 'creature', uid: foe.uid, player: 1 });
	ok('the target dies', !st.players[1].board.some(c => c.uid === foe.uid && !E.isDead(c)));
	ok('the opponent draws two', st.players[1].hand.length === handBefore + 2, st.players[1].hand.length);
}

// ---- Wisp Divination: a friendly Wisp pays for three cards ----
{
	const st = fresh();
	const wisp = put(st, 0, 'wisp');
	const div = give(st, 0, 'wisp_divination');
	const handBefore = st.players[0].hand.length;
	E.playCard(st, 0, div.uid, null);
	ok('the Wisp is consumed', !st.players[0].board.some(c => c.uid === wisp.uid && !E.isDead(c)));
	// net: the spell leaves the hand (-1), three cards arrive (+3)
	ok('and three cards arrive', st.players[0].hand.length === handBefore - 1 + 3, st.players[0].hand.length - handBefore);
}
{
	// no Wisp -> the whole spell fizzles (an ordinary creature is NOT eaten)
	const st = fresh();
	const bystander = put(st, 0, '_v');
	const div = give(st, 0, 'wisp_divination');
	const handBefore = st.players[0].hand.length;
	E.playCard(st, 0, div.uid, null);
	ok('with no Wisp, nothing is sacrificed', st.players[0].board.some(c => c.uid === bystander.uid && !E.isDead(c)));
	// net: only the spell itself left the hand — zero cards drawn
	ok('...and nothing is drawn', st.players[0].hand.length === handBefore - 1, st.players[0].hand.length - handBefore);
}

// ---- Molten Geyser: 2 damage + a 1/2 Elemental in hand ----
{
	const st = fresh();
	const foe = put(st, 1, '_v');
	const gey = give(st, 0, 'molten_geyser');
	E.playCard(st, 0, gey.uid, { type: 'creature', uid: foe.uid, player: 1 });
	ok('the geyser deals 2', foe.damage === 2, foe.damage);
	const elem = st.players[0].hand.find(c => c.name === 'Elemental');
	ok('a 1/2 Elemental lands in hand', elem && elem.attack === 1 && elem.maxHealth === 2 && elem.token, elem && JSON.stringify([elem.attack, elem.maxHealth]));
}

// ---- Mirror Images: two 0/2 Taunt tokens ----
{
	const st = fresh();
	const mi = give(st, 0, 'mirror_images');
	E.playCard(st, 0, mi.uid, null);
	const images = st.players[0].board.filter(c => c.name === 'Mirrored Image');
	ok('two Mirrored Images appear', images.length === 2, images.length);
	ok('...each a 0/2 with Taunt', images.every(c => c.attack === 0 && c.maxHealth === 2 && (c.keywords || []).includes('taunt')));
}

// ---- Arrest Warrant: Discover a (5)+ creature, the pick gains Prepare ----
{
	const st = fresh();
	const aw = give(st, 0, 'arrest_warrant');
	E.playCard(st, 0, aw.uid, null);
	const pend = st.pickQueue && st.pickQueue[0];
	ok('a Discover is offered', !!pend && Array.isArray(pend.ids) && pend.ids.length > 0);
	ok('every option is a creature costing (5) or more', pend && pend.ids.every(id => byId[id] && byId[id].type === 'creature' && (byId[id].cost || 0) >= 5),
		pend && pend.ids.map(id => `${id}:${byId[id]?.cost}`).join(','));
	if (pend) {
		E.resolvePick(st, pend.ids[0]);
		const picked = st.players[0].hand.find(c => c.id === pend.ids[0]);
		ok('the pick lands in hand with Prepare', picked && picked.prepare === true, picked && picked.prepare);
		ok('...and canPrepare agrees', picked && E.canPrepare(st, 0, picked));
		if (picked) {
			const before = picked.cost;
			E.prepareCard(st, 0, picked.uid);
			ok('Preparing cuts its Cost', picked.cost < before, `${before} -> ${picked.cost}`);
			ok('...and locks it for the turn', picked.lockedUntilTurn === st.turnNumber + 1);
		}
	}
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
