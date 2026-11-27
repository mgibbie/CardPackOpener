// poketactica_maze_deck_test.mjs — Tower Defense, MAZE BUILDER: a DECK WORTH BUILDING (rules revision 15; owner,
// 2026-11-24: "remove and upgrade"; Plans/POKETACTICA_MAZE_BUILDER_IMPROVEMENT_PLAN.md item 11). A reward may take a card
// out of a hero's deck, or put a bonus on a plain one. The usual rewards are what they always were; a run with no hero,
// and a run recorded under rules 14, are offered neither.
//   node overworld/tests/poketactica_maze_deck_test.mjs
import * as TD from '../../poketactica/js/td/sim.js';
import * as C from '../../poketactica/js/td/cards.js';
import * as H from '../../poketactica/js/td/heroes.js';
import { MAZE_MAPS_SMALL as MAZE_MAPS } from '../../poketactica/js/td/maps.js';   // (the small maps: the fixtures these checks were written on; the big ones: poketactica_maze_big_test.mjs)
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';
import { loadData } from '../../tools/poketactica/td_auto.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();
const J = JSON.stringify;
const FIELD = MAZE_MAPS[0];
const squad = () => ['blastoise', 'pikachu'].map((sp) => makeFigurine(sp, 60, makeRng('deck' + sp), data, { id: 'deck-' + sp, shinyRate: 0 }));
const run = (hero, o = {}) => TD.newRun(o.seed || 'deck', { map: FIELD, squad: squad(), ...(hero ? { hero } : {}), rev: o.rev || 19 }, data);   // (rules 19: these are the deck's rules as they were before each hero had a card of their own, rules 20; poketactica_maze_herocards_test.mjs)
const ap = (S, a) => TD.applyInput(S, a, data);
const key = (c) => (typeof c === 'string' ? c : c.shape + (c.bonus ? ':' + c.bonus : ''));
const DECK12 = H.heroById('brock').deck.map((c) => ({ ...c }));
const kindsOf = (pick) => pick.opts.map((o) => o.k);

A(TD.TD_RULES_REV >= 15, 'the rules revision is 15 or later');

// ---------- the offer: on its own stream, in place of the last of the usual set
{
	let same = true, lastOnly = true, n0 = 0, trims = 0, ups = 0, bossAlways = true;
	for (let n = 1; n <= 200; n++) {
		const boss = n % 10 === 0, base = C.rewardsOf('offer', n, boss, n % 3 === 0), got = C.withDeckOffer(base, 'offer', n, boss, DECK12);
		const changed = got.opts.findIndex((o, i) => J(o) !== J(base.opts[i]));
		if (got.pick !== base.pick || got.opts.length !== base.opts.length) same = false;
		if (changed >= 0) { n0++; if (changed !== base.opts.length - 1 || got.opts.filter((o, i) => J(o) !== J(base.opts[i])).length !== 1) lastOnly = false; const o = got.opts[changed]; if (o.k === 'trim') trims++; else if (o.k === 'upgrade' && C.BONUS[o.bonus]) ups++; else lastOnly = false; }
		else if (boss) bossAlways = false;
		if (J(C.rewardsOf('offer', n, boss, n % 3 === 0)) !== J(base)) same = false;
	}
	A(same && lastOnly, 'the usual rewards are what they always were; an offer takes the place of the last one only');
	A(n0 > 60 && n0 < 130 && trims > 20 && ups > 20 && bossAlways, 'about four waves in ten offer one (after a boss wave, always): some take a card out, some put a bonus on one', [n0, trims, ups]);
	A(J(C.withDeckOffer(C.rewardsOf('a', 7, false, false), 'a', 7, false, DECK12)) === J(C.withDeckOffer(C.rewardsOf('a', 7, false, false), 'a', 7, false, DECK12)), 'the same seed and wave: the same offer');
	const base = C.rewardsOf('offer', 10, true, false);
	A(C.withDeckOffer(base, 'offer', 10, true, null) === base && C.withDeckOffer(base, 'offer', 10, true, []) === base, 'no deck (a run with no hero): no offer');
	const small = DECK12.slice(0, C.DECK_MIN), allBonus = DECK12.map((c) => ({ shape: c.shape, bonus: 'tall' }));
	let smallTrim = 0, bonusUp = 0, neither = 0;
	for (let n = 10; n <= 400; n += 10) {
		if (kindsOf(C.withDeckOffer(C.rewardsOf('s', n, true, false), 's', n, true, small)).includes('trim')) smallTrim++;
		if (kindsOf(C.withDeckOffer(C.rewardsOf('s', n, true, false), 's', n, true, allBonus)).includes('upgrade')) bonusUp++;
		const k = kindsOf(C.withDeckOffer(C.rewardsOf('s', n, true, false), 's', n, true, small.map((c) => ({ shape: c.shape, bonus: 'tall' }))));
		if (k.includes('trim') || k.includes('upgrade')) neither++;
	}
	A(C.DECK_MIN === 6 && smallTrim === 0 && bonusUp === 0 && neither === 0, 'a deck of six is never offered a trim; a deck with no plain card is never offered an upgrade; a deck with neither, nothing');
	A(J(C.deckKinds(DECK12).map((k) => [k.shape, k.bonus, k.n, k.at])) === J([['O', null, 3, 0], ['I', null, 2, 3], ['L', null, 2, 5], ['J', null, 2, 7], ['T', null, 1, 9], ['three', null, 1, 10], ['corner', null, 1, 11]]), 'the deck by kind, each with how many and where its first one is', C.deckKinds(DECK12));
}

// ---------- taking a card out
{
	const S = run('brock');
	const deck0 = S.deck.map(key), hand0 = S.hand.map(key), bag0 = S.bag.map(key);
	A(S.rev >= 15 && S.deck.length === 12 && S.hand.length === 5 && S.bag.length === 7, '(Brock: a deck of 12, five in hand, seven still to come)');
	S.pick = { pick: 1, opts: [{ k: 'trim' }, { k: 'gold', n: 5 }, { k: 'life' }] };
	A(ap(S, { t: 'pick', i: 0 }) === 'choose a card of your deck' && ap(S, { t: 'pick', i: 0, card: 99 }) === 'choose a card of your deck' && ap(S, { t: 'pick', i: 0, card: -1 }) === 'choose a card of your deck' && S.pick && S.deck.length === 12, 'a trim wants a card of the deck');
	const at = S.deck.findIndex((c, i) => S.bag.some((b) => key(b) === key(c)) && i >= 0), gone = key(S.deck[at]);
	A(ap(S, { t: 'pick', i: 0, card: at }) === null && S.deck.length === 11 && !S.pick, 'taken out: the deck is one card smaller, the reward is spent');
	const lost = (a, b) => { const x = a.slice(); for (const k of b) { const i = x.indexOf(k); if (i >= 0) x.splice(i, 1); } return x; };
	A(J(lost(deck0, S.deck.map(key))) === J([gone]) && J(lost(bag0, S.bag.map(key))) === J([gone]) && J(S.hand.map(key)) === J(hand0), 'that card, and its copy still to come this time through; the hand is untouched', [gone, S.bag.map(key)]);
	// through the rest of the cards and round again: the deck that comes round is the smaller one
	const before = S.bagN;
	S.hand = []; while (S.bag.length) C.drawCard(S); S.hand = []; C.drawCard(S);
	A(S.bagN === before + 1 && S.bag.length === 10 && J([...S.bag.map(key), key(S.hand[0])].sort()) === J(S.deck.map(key).sort()), 'shuffled again: eleven cards come round, the one taken out is not among them');
	// never below six
	const T = run('brock', { seed: 'small' });
	T.deck = T.deck.slice(0, 6); T.pick = { pick: 1, opts: [{ k: 'trim' }, { k: 'gold', n: 5 }] };
	A(ap(T, { t: 'pick', i: 0, card: 0 }) === 'your deck is too small' && T.deck.length === 6 && T.pick.opts[0], 'a deck of six cannot be trimmed (and the reward is not spent)');
	A(ap(T, { t: 'pick', i: 1 }) === null && T.gold > 0, '(another reward can be taken instead)');
}

// ---------- putting a bonus on a card
{
	const S = run('brock', { seed: 'up' });
	S.pick = { pick: 2, opts: [{ k: 'upgrade', bonus: 'lava' }, { k: 'upgrade', bonus: 'tall' }, { k: 'gold', n: 5 }] };
	const at = S.deck.findIndex((c) => !c.bonus && S.bag.some((b) => key(b) === key(c))), shape = S.deck[at].shape;
	const bagHas = (k) => S.bag.filter((b) => key(b) === k).length, b0 = bagHas(shape);
	A(ap(S, { t: 'pick', i: 0, card: at }) === null && key(S.deck[at]) === shape + ':lava' && S.deck.length === 12, 'upgraded: that card of the deck is a Lava block now', S.deck[at]);
	A(bagHas(shape + ':lava') === 1 && bagHas(shape) === b0 - 1, 'and its copy still to come this time through is too');
	A(ap(S, { t: 'pick', i: 1, card: at }) === 'that card has a bonus already' && S.pick && S.pick.pick === 1, 'a card with a bonus cannot take another');
	const other = S.deck.findIndex((c) => !c.bonus);
	A(ap(S, { t: 'pick', i: 1, card: other }) === null && S.deck[other].bonus === 'tall' && !S.pick, 'the second upgrade goes on another plain card');
	S.hand = []; while (S.bag.length) C.drawCard(S);
	const round = []; S.hand = []; C.drawCard(S); round.push(key(S.hand[0])); while (S.bag.length) { C.drawCard(S); } round.push(...S.hand.slice(1).map(key));
	A(round.filter((k) => k.endsWith(':lava')).length === 1 && round.filter((k) => k.endsWith(':tall')).length === 1 && round.length === 12, 'the next time through, the deck deals one Lava and one Tall block among its twelve', round);
	// a laid upgraded card is that bonus block
	const U = run('brock', { seed: 'lay' });
	U.pick = { pick: 1, opts: [{ k: 'upgrade', bonus: 'tall' }] };
	ap(U, { t: 'pick', i: 0, card: 0 });
	U.hand = []; U.bag = U.deck.map((c) => ({ ...c })); const c = C.drawCard(U);
	A(c.bonus === 'tall' && c.shape === U.deck[0].shape, 'drawn, it is a Tall block card');
}

// ---------- who is offered it: a hero under rules 15; not a run with no hero, not a run recorded under 14
{
	const play = (S, waves) => { const seen = []; for (let w = 0; w < waves && !S.over; w++) {
		S.lives = 9999;
		ap(S, { t: 'call' });
		for (let i = 0; i < 20 * 400 && !S.over && (S.phase === 'wave' || i < 2); i++) TD.step(S, [], data);
		if (S.pick) { seen.push(kindsOf(TD.view(S).pick)); while (S.pick) { const i = S.pick.opts.findIndex((o) => o && (o.k === 'gold' || o.k === 'life' || o.k === 'bonus')); if (i < 0 || ap(S, { t: 'pick', i })) break; } }
		if (S.perks) ap(S, { t: 'perk', i: 0 });
	} return seen; };
	const hero = play(run('brock', { seed: 'who' }), 12), again = play(run('brock', { seed: 'who' }), 12);
	const has = (list) => list.some((ks) => ks.includes('trim') || ks.includes('upgrade'));
	A(hero.length === 12 && has(hero) && (hero[9].includes('trim') || hero[9].includes('upgrade')), 'a hero run under rules 15: some waves offer one, and the boss wave (10) does', hero.map((k) => k.join('/')));
	A(J(hero) === J(again), 'the same run is offered the same things');
	A(!has(play(run('brock', { seed: 'who', rev: 14 }), 12)), 'a run recorded under rules 14 is offered neither');
	A(!has(play(run(null, { seed: 'who' }), 12)), 'a run with no hero (no deck) is offered neither');
	// a reroll keeps to the rules too
	const R = run('brock', { seed: 'who' }); play(R, 9); R.lives = 9999; ap(R, { t: 'call' }); for (let i = 0; i < 20 * 400 && (R.phase === 'wave' || i < 2); i++) TD.step(R, [], data);
	R.gold = 500;
	const first = kindsOf(TD.view(R).pick);
	A(ap(R, { t: 'reroll' }) === null && (kindsOf(TD.view(R).pick).includes('trim') || kindsOf(TD.view(R).pick).includes('upgrade')) && R.pick.opts.length === first.length, 'the boss wave\'s rewards changed for gold still hold a deck offer', [first, kindsOf(TD.view(R).pick)]);
	A(TD.view(R).deckCards.length === R.deck.length && TD.view(run(null)).deckCards === null, 'the view lists the deck\'s cards (none for a run with no hero)');
}

// ---------- a snapshot keeps the deck as it now is
{
	const S = run('brock', { seed: 'snap' });
	S.pick = { pick: 2, opts: [{ k: 'trim' }, { k: 'upgrade', bonus: 'ice' }] };
	ap(S, { t: 'pick', i: 0, card: 0 }); ap(S, { t: 'pick', i: 1, card: 0 });
	const B = TD.fromSnapshot(TD.toSnapshot(S));
	A(J(B.deck) === J(S.deck) && J(B.bag) === J(S.bag) && TD.hashOf(B) === TD.hashOf(S) && S.deck.length === 11 && S.deck[0].bonus === 'ice', 'a snapshot carries the trimmed and upgraded deck, to the same fingerprint');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
