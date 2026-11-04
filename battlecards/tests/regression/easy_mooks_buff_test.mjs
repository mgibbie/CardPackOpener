// easy_mooks_buff_test.mjs — slight buffs for the three easiest first-group enemies (2026-10-13).
// The AI-vs-AI simulation had heroes beating Shagrat 72%, Bill Ferny 61% (once his Coin loop
// was fixed, #690) and Ultros 61%, against 35-56% for the rest of their rungs. Owner rule for
// buffs: never lower a mana cost — stats and effects only. After: 52%, 54%, 55%.
//   Shagrat: hero power also deals 1 to an enemy creature; five creatures +1 Attack or Health
//   Bill Ferny: five creatures +1 Attack or Health
//   Ultros: hero power also deals 1 to the frozen creature; three cheap creatures +1 Health
import fs from 'fs';
import * as E from '../../engine.js';
import * as ME from '../../middleearth.js';
import * as FF from '../../finalfantasy.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

// stats (and costs unchanged)
const STATS = {
	me_sh_sig: [4, 4, 4], me_sh_opportunist: [3, 4, 2], me_sh_flunkies: [2, 2, 3], me_sh_noisemaker: [1, 2, 1], me_sh_stony: [2, 2, 3],
	me_bf_sig: [3, 3, 4], me_bf_corsairs: [4, 5, 4], me_bf_dog: [2, 3, 2], me_bf_scavenger: [2, 2, 3], me_bf_nabber: [3, 3, 3],
	ff_e_ultros_7: [2, 2, 2], ff_e_ultros_6: [3, 2, 2], ff_e_ultros_4: [4, 3, 4],
};
for (const [id, [cost, atk, hp]] of Object.entries(STATS)) {
	const c = byId[id];
	ok(`${c?.name} is a ${cost}-mana ${atk}/${hp}`, c && c.cost === cost && c.attack === atk && c.health === hp, c && [c.cost, c.attack, c.health]);
}

// hero powers, fired
function boot(mod, seatName) {
	const classes = JSON.parse(fs.readFileSync(new URL('../../classes.json', import.meta.url))).classes;
	const seat = ch => { const cls = mod.classOf(ch); const def = classes.find(c => c.id === cls) || { id: cls }; return { ...def, id: cls, name: ch, power: mod.powerOf(ch) }; };
	const st = E.createGame(byId, seededRng(3), ['_v', '_v', '_v', '_v', '_v', '_v'], 2, [seat(seatName), seat('Aragorn')]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) p.mana = { cur: 10, max: 10, bonus: 0 };
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
{ const st = boot(ME, 'Shagrat'); const t = put(st, 1, '_v'); const c0 = st.players[0].hand.filter(c => c.id === 'coin').length;
  const hp = st.players[0].heroPowers.find(h => h.name === 'Loot the Fallen');
  E.useHeroPower(st, 0, hp.uid, { type: 'creature', uid: t.uid, player: 1 }, null);
  ok('Shagrat power gains a Coin and deals 1', st.players[0].hand.filter(c => c.id === 'coin').length === c0 + 1 && E.hp(t) === 2, [E.hp(t)]);
  ok('Shagrat power still costs 2', ME.powerOf('Shagrat').cost === 2); }
{ const st = boot(FF, 'Ultros, Obnoxious Octopus'); const t = put(st, 1, '_v');
  const hp = st.players[0].heroPowers.find(h => h.name === 'Tentacle');
  E.useHeroPower(st, 0, hp.uid, { type: 'creature', uid: t.uid, player: 1 }, null);
  ok('Ultros power freezes and deals 1', !!t.frozen && E.hp(t) === 2, [t.frozen, E.hp(t)]);
  ok('Ultros power still costs 2', FF.powerOf('Ultros, Obnoxious Octopus').cost === 2); }
ok('Bill Ferny power unchanged (gain a Coin, 2 mana)', ME.powerOf('Bill Ferny').cost === 2 && ME.powerOf('Bill Ferny').effects.length === 1);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
