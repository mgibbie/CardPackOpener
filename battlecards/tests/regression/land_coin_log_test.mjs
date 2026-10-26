// land_coin_log_test.mjs — bug review 2026-10-26 (instinctgauntlet, keys bug:1792769290075,
// 1792769323226, 1792770792536, 1792770816125, 1792939390720, 1792941128298, 1792941664023).
//
// "The Coin" kept landing in the NON-acting player's hand on the opponent's turn with no
// visible cause. Verdict: the grants follow the rules — developing OR upgrading a land costs
// 3 mana and hands EACH OPPONENT The Coin (engine buyLand / upgradeLand) — every reported
// grant sits on a boss land develop/upgrade. Two real defects made it look like a bug:
//   1. an UPGRADE logged nothing (no 'landUpgraded' case in the game log), and no Coin line
//      named its cause. Now the upgrade logs "X upgraded Swamp into Temple of Bontu" and the
//      grant reads "You got The Coin (X upgraded Swamp into Temple of Bontu)".
//   2. the opening "got The Coin" printed twice for a run boss: createGame deals seat 1 its
//      hand + Coin, then the boot re-deals the boss (resetDeckAndHand + addCoin) — and the
//      wiped hand's queued events still played. resetDeckAndHand now drops them. Replays
//      showed one line because a frame keeps only the LAST log line.
//   (+ a Coin PLAY logged "played The Coin" AND "played The Coin (+1 mana)": now one line.)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._c = { id: '_c', name: 'C', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(byId, seededRng(7), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	for (const p of st.players) { p.hand = []; p.deck = ['_c', '_c', '_c', '_c', '_c']; p.board = []; p.lands = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	E.takeEvents(st);
	return st;
};
const coinsIn = (st, pi) => st.players[pi].hand.filter(c => c.id === 'coin').length;

// ---- the rule: the BOSS (seat 1) develops then upgrades on its turn; YOU (seat 0) get the Coins ----
{
	const st = game(); st.current = 1;
	ok('boss develops a Swamp', E.buyLand(st, 1, 'swamp'));
	ok('...you (the opponent) got exactly one Coin', coinsIn(st, 0) === 1 && coinsIn(st, 1) === 0, [coinsIn(st, 0), coinsIn(st, 1)]);
	let evs = E.takeEvents(st);
	const g1 = evs.filter(e => e.type === 'coinGiven');
	ok('one coinGiven, to seat 0, naming the develop', g1.length === 1 && g1[0].player === 0 && g1[0].cause && g1[0].cause.kind === 'land' && g1[0].cause.by === 1 && g1[0].cause.land === 'Swamp' && !g1[0].cause.from, g1.map(e => e.cause));
	const sw = st.players[1].lands[0].uid;
	const up = E.availableUpgrades(st, 1, sw).find(d => d.id === 'temple_of_malakir') || E.availableUpgrades(st, 1, sw)[0];
	ok('an upgrade is on offer for the Swamp', !!up);
	ok('boss upgrades it', E.upgradeLand(st, 1, sw, up.id));
	ok('...you got a second Coin, the boss none', coinsIn(st, 0) === 2 && coinsIn(st, 1) === 0);
	evs = E.takeEvents(st);
	const g2 = evs.filter(e => e.type === 'coinGiven'), lu = evs.find(e => e.type === 'landUpgraded');
	ok('the upgrade Coin names before AND after', g2.length === 1 && g2[0].cause && g2[0].cause.by === 1 && g2[0].cause.from === 'Swamp' && g2[0].cause.land === up.name, g2.map(e => e.cause));
	ok('landUpgraded carries the land it replaced', lu && lu.from === 'Swamp' && lu.card.name === up.name, lu && lu.from);
}
// a Coin from anything else keeps the plain event (no cause)
{ const st = game(); E.addCoin(st, 0); const ev = E.takeEvents(st).find(e => e.type === 'coinGiven'); ok('a plain addCoin has no cause', ev && !('cause' in ev)); }

// ---- the double opening line: a run boss re-deal leaves ONE coinGiven for seat 1 ----
{
	const st = E.createGame(byId, seededRng(3), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	E.resetDeckAndHand(st, 1, ['_c', '_c', '_c', '_c', '_c', '_c', '_c', '_c']);
	E.drawCards(st, 1, 4);
	E.addCoin(st, 1);   // exactly what every run boot does
	const evs = E.takeEvents(st);
	const coinEvs = evs.filter(e => e.type === 'coinGiven' && e.player === 1);
	ok('one "got The Coin" event for the re-dealt boss (was 2)', coinEvs.length === 1, coinEvs.length);
	ok('...and it is the Coin really in hand', coinEvs[0] && st.players[1].hand.includes(coinEvs[0].card));
	ok('the wiped hand\'s draw events are gone too (4 draws = the real hand)', evs.filter(e => e.type === 'draw' && e.player === 1).length === 4, evs.filter(e => e.type === 'draw' && e.player === 1).length);
	ok('seat 0\'s opening draws are untouched', evs.filter(e => e.type === 'draw' && e.player === 0).length === 4);   // 3 opening + the turn-1 draw
	ok('state: exactly one Coin in the boss hand', coinsIn(st, 1) === 1);
}

// ---- the game log wording (game.js) ----
const src = fs.readFileSync(new URL('../../game.js', import.meta.url), 'utf8');
const m = /function coinCauseText\(cause\) \{[\s\S]*?\n\}/.exec(src);
ok('coinCauseText exists', !!m);
if (m) {
	const nameOf = pi => (pi === 0 ? 'You' : 'Ugluk');
	const coinCauseText = new Function('nameOf', m[0] + '\nreturn coinCauseText;')(nameOf);
	ok('develop cause text', coinCauseText({ kind: 'land', by: 1, land: 'Mountain' }) === ' (Ugluk developed Mountain)', coinCauseText({ kind: 'land', by: 1, land: 'Mountain' }));
	ok('upgrade cause text', coinCauseText({ kind: 'land', by: 1, land: 'Temple of Erebos', from: 'Swamp' }) === ' (Ugluk upgraded Swamp into Temple of Erebos)');
	ok('no cause: no suffix', coinCauseText(undefined) === '');
}
ok("game.js logs coinGiven with its cause", /case 'coinGiven':[^\n]*got The Coin\$\{coinCauseText\(ev\.cause\)\}/.test(src));
ok("game.js has a 'landUpgraded' log line", /case 'landUpgraded':[\s\S]{0,120}log\(`\$\{nameOf\(ev\.player\)\} upgraded/.test(src));
ok("a Coin play logs once (the 'play' line skips The Coin)", /coinPlayBy = ev\.card\.id === 'coin' \? ev\.player : null;\r?\n\t+if \(coinPlayBy == null\) log\(/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
