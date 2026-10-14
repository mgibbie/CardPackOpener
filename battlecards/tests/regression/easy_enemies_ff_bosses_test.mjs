// easy_enemies_ff_bosses_test.mjs — second easy-enemy pass + Final Fantasy final bosses (2026-10-14).
// Run on the simulator after #696 fixed its priority handling (the earlier later-rung numbers
// left out every fight a land's tap ability had stranded). Hero win rate before -> after:
//   buffs (stats/effects only — never a lower mana cost):
//     Middle-earth: Tom, Bert & William 65->51, Gríma 68->60, Master of Lake-town 66->60,
//       Shelob 63->58, Mouth of Sauron 69->60, Gollum 60->46
//     Sword Coast: Storvald 67->49, Old Gnawbone 68->56
//     Final Fantasy: Xande 63->52, Emperor of Palamecia 64->55, Cloud of Darkness 57->46,
//       final bosses Sephiroth 44->32, Chaos 39->35 (in line with Sword Coast's 29-32%)
//   nerf: The Watcher in the Water 28->35 (bounce hero power 3 mana, Mystic Confluence and
//     Great Gilded Boat +1)
// Pins every changed card and fires the changed hero powers.
import fs from 'fs';
import * as E from '../../engine.js';
import * as ME from '../../middleearth.js';
import * as SC from '../../swordcoast.js';
import * as FF from '../../finalfantasy.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 5, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const CARDS = {
	"me_sl_mirkwood": {"cost":2,"attack":2,"health":4},
	"me_sl_bats": {"cost":3,"attack":3,"health":3},
	"me_sl_oldfat": {"cost":3,"attack":3,"health":4},
	"me_mo_sig": {"cost":5,"attack":5,"health":5},
	"me_mo_notion": {"cost":3,"attack":3,"health":3},
	"me_mo_crebain": {"cost":2,"attack":2,"health":2},
	"me_mo_archivist": {"cost":4,"attack":4,"health":4},
	"me_mo_nazgul": {"cost":4,"attack":4,"health":3},
	"me_mo_hostage": {"cost":4,"attack":3,"health":3},
	"me_gm_crebain": {"cost":2,"attack":2,"health":2},
	"me_gm_bats": {"cost":3,"attack":3,"health":3},
	"me_gm_executioner": {"cost":3,"attack":3,"health":2},
	"me_gm_sig": {"cost":3,"attack":3,"health":4},
	"me_gm_haunt": {"cost":3,"attack":3,"health":3},
	"me_mlt_bowmasters": {"cost":2,"attack":2,"health":3},
	"me_mlt_nighthowl": {"cost":3,"attack":3,"health":3},
	"me_mlt_haunt": {"cost":3,"attack":3,"health":3},
	"me_mlt_executioner": {"cost":3,"attack":3,"health":3},
	"me_mlt_sig": {"cost":4,"attack":4,"health":5},
	"me_tb_stonehewer": {"cost":4,"attack":4,"health":4},
	"me_tb_olog": {"cost":4,"attack":4,"health":4},
	"me_gl_slinker": {"cost":2,"attack":3,"health":2},
	"me_gl_abandoned": {"cost":3,"attack":3,"health":4},
	"me_gl_notion": {"cost":3,"attack":3,"health":3},
	"me_gl_riddle": {"cost":3,"attack":3,"health":4},
	"me_wa_confluence": {"cost":6},
	"me_wa_art": {"cost":4},
	"sc_e_storvald_2": {"cost":4,"attack":4,"health":4},
	"sc_e_storvald_3": {"cost":4,"attack":4,"health":3},
	"sc_e_storvald_10": {"cost":5,"attack":5,"health":5},
	"sc_e_storvald_6": {"cost":2,"attack":2,"health":3},
	"sc_e_gnawbone_2": {"cost":4,"attack":4,"health":4},
	"sc_e_gnawbone_3": {"cost":4,"attack":4,"health":3},
	"sc_e_gnawbone_10": {"cost":5,"attack":5,"health":5},
	"sc_e_gnawbone_6": {"cost":2,"attack":2,"health":3},
	"ff_e_xande_2": {"cost":4,"attack":2,"health":3},
	"ff_e_xande_5": {"cost":3,"attack":3,"health":3},
	"ff_e_xande_15": {"cost":3,"attack":3,"health":2},
	"ff_e_xande_14": {"cost":4,"attack":3,"durability":3},
	"ff_e_emperor_3": {"cost":3,"attack":3,"health":3},
	"ff_e_emperor_5": {"cost":4,"attack":4,"health":4},
	"ff_e_emperor_4": {"cost":5,"attack":5,"health":4},
	"ff_e_emperor_6": {"cost":4,"attack":5,"health":4},
	"ff_e_emperor_2": {"cost":4,"attack":3,"health":4},
	"ff_e_cloudofdarkness_4": {"cost":3,"attack":2,"health":4},
	"ff_e_cloudofdarkness_5": {"cost":3,"attack":3,"health":3},
	"ff_e_cloudofdarkness_2": {"cost":4,"attack":3,"health":6},
	"ff_e_cloudofdarkness_15": {"cost":6,"attack":7,"health":5},
	"ff_e_chaos_1": {"cost":8,"attack":8,"health":8},
	"ff_e_chaos_2": {"cost":6,"attack":6,"health":6},
	"ff_e_chaos_4": {"cost":5,"attack":5,"health":5},
	"ff_e_chaos_5": {"cost":4,"attack":3,"health":4},
	"ff_e_sephiroth_1": {"cost":8,"attack":8,"health":8},
	"ff_e_sephiroth_3": {"cost":4,"attack":4,"health":4},
	"ff_e_sephiroth_4": {"cost":4,"attack":5,"health":2,"durability":2},
};
for (const [id, want] of Object.entries(CARDS)) {
	const c = byId[id];
	const got = c && { cost: c.cost, attack: c.attack, health: c.health, durability: c.durability };
	ok(`${id} (${c?.name})`, c && Object.keys(want).every(k => want[k] === got[k]), JSON.stringify(got));
}

const classes = JSON.parse(fs.readFileSync(new URL('../../classes.json', import.meta.url))).classes;
function boot(mod, ch) {
	const seat = n => { const cls = mod.classOf(n); const def = classes.find(c => c.id === cls) || { id: cls }; return { ...def, id: cls, name: n, power: mod.powerOf(n) }; };
	const st = E.createGame(byId, seededRng(4), ['_v', '_v', '_v', '_v', '_v', '_v'], 2, [seat(ch), seat(mod.HEROES[0])]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) p.mana = { cur: 10, max: 10, bonus: 0 };
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const fire = (mod, ch, pi, target) => { const st = boot(mod, ch); const foe = put(st, 1, '_v'); const mine = put(st, 0, '_v');
	const hp = st.players[0].heroPowers.find(h => h.name === mod.powerOf(ch).name);
	const t = target === 'foe' ? { type: 'creature', uid: foe.uid, player: 1 } : target === 'mine' ? { type: 'creature', uid: mine.uid, player: 0 } : null;
	E.useHeroPower(st, 0, hp.uid, t, null); return { st, foe, mine }; };

{ const { foe } = fire(ME, 'Shelob', 0, 'foe'); ok('Shelob: freeze + 2 damage', !!foe.frozen && E.hp(foe) === 3, [foe.frozen, E.hp(foe)]); }
{ const { foe } = fire(ME, 'Gríma Wormtongue', 0, 'foe'); ok('Gríma: freeze + 1 damage', !!foe.frozen && E.hp(foe) === 4, [foe.frozen, E.hp(foe)]); }
{ const { mine } = fire(ME, 'Gollum', 0, 'mine'); ok('Gollum: +1/+1 and Stealth', mine.attack === 3 && E.hp(mine) === 6 && E.has(mine, 'stealth'), [mine.attack, E.hp(mine)]); }
ok('Tom, Bert & William: 3 random damage', ME.powerOf('Tom, Bert & William').effects[0].value === 3);
ok('The Watcher in the Water: bounce costs 3', ME.powerOf('The Watcher in the Water').cost === 3);
{ const { foe } = fire(SC, 'Storvald, Frost Giant Jarl', 0, 'foe'); ok('Storvald: freeze + 1 damage', !!foe.frozen && E.hp(foe) === 4, [foe.frozen, E.hp(foe)]); }
{ const { foe } = fire(FF, 'Xande, Dark Mage', 0, 'foe'); ok('Xande: freeze + 1 damage', !!foe.frozen && E.hp(foe) === 4, [foe.frozen, E.hp(foe)]); }
{ const { foe } = fire(FF, 'Sephiroth, One-Winged Angel', 0, 'foe'); ok('Sephiroth: 4 damage', E.hp(foe) === 1, E.hp(foe)); }
for (const [mod, ch] of [[ME, 'Shelob'], [ME, 'Gríma Wormtongue'], [ME, 'Gollum'], [ME, 'Tom, Bert & William'], [SC, 'Storvald, Frost Giant Jarl'], [FF, 'Xande, Dark Mage'], [FF, 'Sephiroth, One-Winged Angel']])
	ok(`${ch}: buffed power still costs 2`, mod.powerOf(ch).cost === 2);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
