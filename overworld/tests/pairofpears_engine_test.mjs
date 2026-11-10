// pairofpears_engine_test.mjs — Pair of Pears' rules (pairofpears/js/pear.js) and its save
// (pairofpears/js/save.js), in node:
//   the level decks, matching / mismatching, Hearts and the flip-back, the Pears' instant win, the level
//   clear + shop (charms, conditions, selling), a few charms and conditions, the view a spectator gets
//   (never a face-down card's fruit), save / resume on the exact frame, and old / odd / broken saves.
//   node overworld/tests/pairofpears_engine_test.mjs
import * as P from '../../pairofpears/js/pear.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// a localStorage for save.js
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const SV = await import('../../pairofpears/js/save.js');

// helpers: the engine's own card list (with the fruit) and a perfect / bad move
const hidden = () => P._cards().filter((c) => !c.faceUp && !c.matched);
const settle = () => { for (let i = 0; i < 4 && P.run().flipBackTimer > 0; i++) P.update(0.5); };
function matchPair(avoidPear = true) {
	settle();
	const cs = hidden();
	const pool = avoidPear && cs.some((c) => c.fruit !== 'pear') ? cs.filter((c) => c.fruit !== 'pear') : cs;
	const a = pool[0], b = cs.find((c) => c !== a && c.fruit === a.fruit);
	P.reveal(a.id); if (b) P.reveal(b.id);
	return a.fruit;
}
function mismatchPair() {
	settle();
	const cs = hidden();
	const a = cs.find((c) => c.fruit !== 'pear') || cs[0], b = cs.find((c) => c.fruit !== a.fruit);
	P.reveal(a.id); P.reveal(b.id);
	return [a, b];
}
function clearLevel(avoidPear = true) { for (let g = 0; g < 60 && P.phase() === 'play'; g++) matchPair(avoidPear); }

// ---------- a new run ----------
P.startNewRun();
let v = P.view();
A(v.level === 1 && v.cards.length === 6 && v.hearts === 3 && v.phase === 'play', 'a new run: level 1, 6 cards (pear, apple, orange pairs), 3 Hearts');
A(v.berries === 0 && v.stars === 0, 'self-contained: a run starts with 0 Berries and 0 Stars (no meadow wallet)');
A(v.cards.every((c) => !c.up && !c.fruit), "the view never carries a face-down card's fruit (a spectator can't cheat)");
A(P._cards().filter((c) => c.fruit === 'pear').every((c) => c.conditions.special === 1), 'the Pears are Special (an instant win)');
const sizes = [];
for (let l = 1; l <= P.MAX_LEVEL; l++) sizes.push(P.LEVEL_DECKS[l - 1].length * 2);
A(JSON.stringify(sizes) === JSON.stringify([6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]) && P.MAX_LEVEL === 13, '13 levels, one new fruit pair each (6 .. 30 cards)');

// ---------- a match pays, a mismatch costs half a Heart, then the cards turn back ----------
const fr = matchPair();
v = P.view();
A(v.pairs === 1 && v.berries === 2 && v.cards.filter((c) => c.m).length === 2 && v.cards.filter((c) => c.m).every((c) => c.fruit === fr), 'a match: the pair stays matched (face up in the view) and pays 2 Berries');
A(v.fx.some((f) => f.kind === 'match' && f.gain === 2), "the view's fx says so (a spectator animates it)");
const [ma, mb] = mismatchPair();
v = P.view();
A(v.hearts === 2.5 && v.busy && v.cards.find((c) => c.id === ma.id).up && v.cards.find((c) => c.id === mb.id).up, 'a mismatch: -0.5 Hearts, both cards stay up while the flip-back runs');
A(P.revealRefusal(hidden()[0].id) && !P.reveal(hidden()[0].id), "no third card while they're up");
P.update(0.4); A(P.view().busy, 'still up after 0.4 s');
A(P.update(0.4) && !P.view().busy && !P.view().cards.find((c) => c.id === ma.id).up, 'after 0.75 s they turn back face down (update reports the change)');
A(!P.reveal(P._cards().find((c) => c.matched).id), "a matched card can't be flipped again");

// ---------- the Pears win the level on the spot ----------
P.startNewRun();
settle();
const pears = P._cards().filter((c) => c.fruit === 'pear');
P.reveal(pears[0].id); P.reveal(pears[1].id);
v = P.view();
A(v.phase === 'clear' && v.hearts === 5 && v.cards.every((c) => c.m && c.fruit), 'matching the Pears clears the level at once (+2 Hearts), every card revealed');
A(v.fx.some((f) => f.kind === 'clear' && f.pear), 'the clear fx marks it as a Pear win');
A(P.continueClear() && P.phase() === 'shop', '"To the Shop" opens the level shop');
v = P.view();
A(v.offers.length === 4 && v.offers[3].kind === 'sell' && v.offers[2].kind === 'condition' && v.offers.slice(0, 2).every((o) => !o || o.kind === 'charm'), 'the shop: 2 charms, a condition and the Sell slot');
A(P.buyRefusal(0) === 'not enough Berries' && !P.buy(0), "a charm you can't afford is refused");

// ---------- shop: buy, move, sell (pear_game.lua sellCharmFromDrag), Egg grows its own sell value ----------
P.run().berries = 30;
P.run().shop.offers[0] = { kind: 'charm', id: 'egg', cost: 6 };
P.run().shop.offers[1] = { kind: 'charm', id: 'grape', cost: 6 };
A(P.buy(0) && P.buy(1) && P.run().berries === 18, 'buying two 6-Berry charms');
v = P.view();
A(v.charms[0].id === 'egg' && v.charms[1].id === 'grape' && v.charms[0].sell === 3 && v.offers[0] === null, 'they fill the first slots (sell value: half the cost), the offers are sold');
A(P.pickCharm(1) && P.view().held.id === 'grape' && P.view().charms[1] === null, 'picking up a charm holds it');
A(P.dropCharm(3) && P.view().charms[3].id === 'grape', '...and drops it on another slot');
A(P.pickCharm(3) && P.dropCharm(0) && P.view().charms[0].id === 'grape' && P.view().charms[3].id === 'egg', 'dropping on a full slot swaps the two');
const b0 = P.run().berries;
A(P.pickCharm(0) && P.sellHeld() && P.run().berries === b0 + 3 && !P.view().charms.some((c) => c && c.id === 'grape'), 'Sell: the held charm goes for its sell value (+3 Berries)');
A(!P.sellHeld(), 'nothing held: nothing to sell');
A(P.pickCharm(3) && P.nextLevel() && P.view().charms[3] && P.view().charms[3].id === 'egg' && !P.view().held, 'Next Level with a charm still held puts it back (it is never lost)');
v = P.view();
A(v.level === 2 && v.cards.length === 8 && v.phase === 'play', 'level 2: 8 cards (kiwi added)');
clearLevel();
A(P.view().charms[3].sell === 8, 'Egg Charm: its own sell value grows by +5 on each level completion (3 -> 8)', P.view().charms[3].sell);

// ---------- charms + conditions ----------
P.startNewRun();
P.run().charm.inventory[0] = { id: 'coconut', name: 'Coconut Charm', sellValue: 3 };
mismatchPair(); settle(); mismatchPair(); settle();
A(P.view().hearts === 3, 'Coconut Charm: the first 2 mismatches of a round cost no Hearts');
mismatchPair(); settle();
A(P.view().hearts === 2.5, '...the third one does');
P.startNewRun();
P.run().charm.inventory[0] = { id: 'grape', name: 'Grape Charm', sellValue: 3 };
matchPair();
A(P.view().berries === 4, 'Grape Charm: a pair pays 4 Berries');
P.startNewRun();
for (const c of P.run().cards) if (c.fruit === 'apple') c.conditions.juicy = 1;
settle();
{ const ap = P._cards().filter((c) => c.fruit === 'apple'); P.reveal(ap[0].id); P.reveal(ap[1].id); }
A(P.view().berries === 6, 'Juicy: triple rewards (2 -> 6 Berries)');
P.startNewRun();
for (const c of P.run().cards) if (c.fruit === 'orange') c.conditions.golden = 1;
{ const or = P._cards().filter((c) => c.fruit === 'orange'); P.reveal(or[0].id); P.reveal(or[1].id); }
A(P.view().stars === 100, 'Golden: +50 Stars a card');
P.startNewRun();
for (const c of P.run().cards) if (c.fruit === 'apple') c.conditions.rotten = 1;
{ const ap = P._cards().filter((c) => c.fruit === 'apple'); P.reveal(ap[0].id); P.reveal(ap[1].id); }
A(P.view().berries === 0 && P.run().charm.rottenRemoved.apple === 2, 'Rotten: no reward, and the pair leaves the deck');
P.startNewRun();
for (const c of P.run().cards) if (c.fruit === 'apple') c.conditions.flutter = 1;
{ const ap = P._cards().filter((c) => c.fruit === 'apple'); P.reveal(ap[0].id); P.reveal(ap[1].id); }
v = P.view();
const peek = v.cards.filter((c) => c.peek);
A(peek.length === 1 && peek[0].fruit && !P._cards().find((c) => c.id === peek[0].id).faceUp, 'Flutter (pear_game.lua): a match reveals a random face-down card for a moment');
P.update(1.1);
A(!P.view().cards.some((c) => c.peek) && P.view().cards.filter((c) => !c.up && !c.m).every((c) => !c.fruit), '...then it is hidden again');
P.startNewRun();
for (const c of P.run().cards) if (c.fruit === 'orange') c.conditions.sticky = 1;
{ const o = P._cards().find((c) => c.fruit === 'orange'), a = P._cards().find((c) => c.fruit === 'apple'); P.reveal(o.id); P.reveal(a.id); settle();
	A(P.view().cards.find((c) => c.id === o.id).up && !P.view().cards.find((c) => c.id === a.id).up, 'Sticky: stays face up after a mismatch'); }

// ---------- out of Hearts; the Persimmon ----------
P.startNewRun();
P.run().berries = 9;
for (let i = 0; i < 6 && P.phase() === 'play'; i++) { mismatchPair(); settle(); }
v = P.view();
A(v.phase === 'over' && v.hearts === 0 && v.berries === 0, 'six mismatches empty 3 Hearts: the run is over (and the Berries go, as in the original)');
A(P.label() === 'Pair of Pears · Game over' && !P.reveal(P._cards()[0].id), 'nothing plays after the end');
P.startNewRun();
P.run().hearts = 0.5; P.run().berries = 7;
P.run().charm.inventory[2] = { id: 'persimmon', name: 'Persimmon Charm', sellValue: 10 };
mismatchPair(); settle();
v = P.view();
A(v.phase === 'play' && v.hearts === 1 && v.berries === 0 && !v.charms.some((c) => c && c.id === 'persimmon'), 'Persimmon Charm cheats death once: 1 Heart, no Berries, the charm vanishes');

// ---------- a whole run, to the harvest ----------
P.startNewRun();
for (let g = 0; g < 2000 && P.phase() !== 'won' && P.phase() !== 'over'; g++) {
	const ph = P.phase();
	if (ph === 'play') matchPair();
	else if (ph === 'clear') P.continueClear();
	else if (ph === 'shop') P.nextLevel();
}
A(P.phase() === 'won' && P.view().level === 13 && P.label() === 'Pair of Pears · Harvest complete', 'a perfect run clears all 13 levels (the harvest)');

// ---------- serialize / restore: the exact frame ----------
P.startNewRun();
matchPair(); mismatchPair(); P.update(0.3);
const mid = P.serialize(), before = JSON.stringify({ ...P.view(), fx: null });
P.reset();
A(P.restore(JSON.parse(JSON.stringify(mid))) && JSON.stringify({ ...P.view(), fx: null }) === before, 'a run mid flip-back restores to the same view');
A(P.update(0.5) && !P.view().busy, '...and its flip-back timer carries on');
P.startNewRun(); P.run().berries = 50; clearLevel(); P.continueClear(); P.run().shop.offers[0] = { kind: 'charm', id: 'egg', cost: 6 }; P.buy(0); P.pickCharm(0);
const shopFrame = P.serialize(), shopView = JSON.stringify({ ...P.view(), fx: null });
P.reset(); P.restore(shopFrame);
A(JSON.stringify({ ...P.view(), fx: null }) === shopView && P.view().held.id === 'egg', 'a run in the shop with a charm held restores exactly');
A(!P.restore(null) && !P.restore({}) && !P.restore({ level: 99, cards: [] }) && !P.restore({ level: 2, cards: 'x' }), "a broken run is refused (nothing changes)");
{
	// an older / odd run object: missing fields take defaults; cards without ids get some
	const ok = P.restore({ level: 3, hearts: 2, cards: [{ fruit: 'apple', faceUp: true }, { fruit: 'apple' }, { fruit: 'pear', conditions: { special: 1 } }, { fruit: 'pear', conditions: { special: 1 } }] });
	v = P.view();
	A(ok && v.level === 3 && v.cards.length === 4 && new Set(v.cards.map((c) => c.id)).size === 4 && v.berries === 0 && v.charms.length === 4, 'a run object missing fields still restores (defaults, ids)');
	A(P.reveal(v.cards[1].id) && P.view().pairs === 1, '...and plays on');
}

// ---------- save.js: one row, never wiped; old / foreign / broken saves ----------
mem.clear();
A(SV.loadRun() === null && SV.stats().runs === 0 && JSON.stringify(SV.readSave()) === '{}', 'no save: no run to continue, zero stats (a first visit)');
P.startNewRun(); matchPair();
SV.saveRun(P.serialize());
const row = JSON.parse(mem.get(SV.SAVE_KEY));
A(row.v === SV.SAVE_VERSION && row.run && row.run.level === 1 && SV.SAVE_KEY === 'magepunk_pears_v1', 'a run saves to magepunk_pears_v1 (per account through site/account_silo.js)');
P.reset();
A(P.restore(SV.loadRun()) && P.view().pairs === 1, 'and loads back');
// a save from another build: meadow data (the Love2D shell's wallet) + a future field ride along untouched
mem.clear();
const legacy = { v: 1, meadow: { starCount: 412, berryCount: 37, photographedBirds: { cardinal: true } }, future: { x: 1 }, run: { level: 4, hearts: 3.5, cards: [{ id: 1, fruit: 'kiwi' }, { id: 2, fruit: 'kiwi' }] } };
mem.set(SV.SAVE_KEY, JSON.stringify(legacy));
A(P.restore(SV.loadRun()) && P.view().level === 4 && P.view().hearts === 3.5, 'an old save with meadow data loads its card-game run');
P.reveal(1); P.reveal(2);
SV.saveRun(P.serialize());
const after = JSON.parse(mem.get(SV.SAVE_KEY));
A(after.meadow && after.meadow.starCount === 412 && after.meadow.photographedBirds.cardinal && after.future.x === 1, 'writing the run keeps the meadow data (and anything else it does not know) untouched');
A(mem.get(SV.PREV_KEY) === JSON.stringify(legacy), "the save as this page found it was backed up before the first write");
A(SV.rollback() && mem.get(SV.SAVE_KEY) === JSON.stringify(legacy), 'rollback() puts it back exactly');
// a save that won't parse: kept aside, never overwritten blind
mem.clear();
mem.set(SV.SAVE_KEY, '{"run": {"level": 2, oops');
A(SV.loadRun() === null && mem.get(SV.BAD_KEY) === '{"run": {"level": 2, oops', 'a broken save is not offered, and is copied to magepunk_pears_bad_v1 as it was');
SV.recordRun(5, false); SV.recordRun(13, true);
A(JSON.stringify(SV.stats()) === JSON.stringify({ runs: 2, wins: 1, bestLevel: 13 }), 'lifetime stats (runs, harvests, best level)');
SV.clearRun();
A(SV.loadRun() === null && SV.stats().runs === 2, 'a finished run is cleared from the save; the stats stay');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
