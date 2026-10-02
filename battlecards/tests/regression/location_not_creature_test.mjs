// location_not_creature_test.mjs — a location is not a creature.
//
// 2026-10-02 (a player, Middle-earth vs Tom, Bert & William): "I think he
// attacked me with his locations??" — he had. The replay shows the trolls'
// two Hammerheim LOCATIONS (they share the board row with creatures) turned
// into 2/2s by Troll Negotiations ("Give your creatures +2/+2"), then attacking
// and killing a Citadel Guard. The player's own Minas Tirith was 2/2 the same way.
//   1. Troll Negotiations buffs the trolls' creatures but not their Hammerheims
//   2. even a location that somehow has Attack can never attack (canAttackWith)
//   3. "give your creatures" effects on the player's side skip Minas Tirith too
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._grunt = { id: '_grunt', name: 'Grunt', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(5), null, 2, [{ id: 'paladin', name: 'A', power: null }, { id: 'warrior', name: 'B', power: null }]);
	st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.board = []; p.life = 30; p.armor = 0; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return E.playCard(st, pi, c.uid, null, null, 0); };

ok('setup: Hammerheim is a location', byId.me_tb_loc && byId.me_tb_loc.type === 'location');
ok('setup: Troll Negotiations gives your creatures +2/+2', byId.me_tb_negotiations && byId.me_tb_negotiations.effects[0].target === 'friendly-creatures');

// 1. the replay's turn: two Hammerheims + a troll, then Troll Negotiations
{
	const st = fresh(); st.current = 1;
	const h1 = put(st, 1, byId.me_tb_loc), h2 = put(st, 1, byId.me_tb_loc), troll = put(st, 1, byId._grunt);
	const a0 = h1.attack, m0 = h1.maxHealth;
	cast(st, 1, 'me_tb_negotiations');
	ok('1. the troll gets +2/+2', troll.attack === 5 && troll.maxHealth === 5, `${troll.attack}/${troll.maxHealth}`);
	ok('1. the Hammerheims do NOT (they are locations)', h1.attack === a0 && h1.maxHealth === m0 && h2.attack === a0, JSON.stringify({ before: [a0, m0], h1: [h1.attack, h1.maxHealth], h2: [h2.attack, h2.maxHealth] }));
	ok('1. ...so the AI has no location to attack with', !E.attackersFor(st, 1).some(c => c.type === 'location'), JSON.stringify(E.attackersFor(st, 1).map(c => c.name)));
}

// 2. a location with Attack (from anywhere) still can't attack
{
	const st = fresh(); st.current = 1;
	const h = put(st, 1, byId.me_tb_loc); h.attack = 4; h.maxHealth = 4;
	const foe = put(st, 0, byId._grunt);
	ok('2. canAttackWith refuses a location even with 4 Attack', !E.canAttackWith(st, 1, h));
	ok('2. ...and attack() does nothing', E.attack(st, 1, h.uid, { type: 'creature', uid: foe.uid, player: 0 }) === false && foe.damage === 0);
}

// 3. the player's side: Minas Tirith stays a location under a mass buff
{
	const st = fresh(); st.current = 0;
	const mt = put(st, 0, byId.me_aragorn_minastirith), guard = put(st, 0, byId._grunt);
	const a0 = mt.attack, m0 = mt.maxHealth;
	E.execEffects(st, 0, [{ type: 'buff', attack: 2, health: 2, target: 'friendly-creatures' }], null, null);
	ok('3. your creatures get +2/+2', guard.attack === 5);
	ok('3. Minas Tirith (a location) does not', mt.type === 'location' && mt.attack === a0 && mt.maxHealth === m0, JSON.stringify({ type: mt.type, before: [a0, m0], after: [mt.attack, mt.maxHealth] }));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
