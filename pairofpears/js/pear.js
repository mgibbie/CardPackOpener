// pear.js — "A Pair of Pears": the memory / concentration card game with a roguelike charm +
// condition shop layer (a port of the owner's pear_game.lua / pear_charm_defs.lua). The RULES
// only: no drawing. The page (main.js) and a friend spectating draw from view(), which never
// shows a face-down card's fruit. Self-contained: a run carries its own Berries (the shop's
// currency) and Stars (Golden pairs) — in the Love2D build both were the Meandering Meadow's
// wallet, which is gone; a new run starts them at 0.
//
// Actions (each returns true when it changed something; refused ones return false):
//   startNewRun() · reveal(id) · continueClear() (the "Level N Complete" button: the shop, or
//   the end of the run) · nextLevel() (the shop's Next Level) · buy(slot) · pickCharm(i) ·
//   dropCharm(i) (-1 puts the held charm back) · sellHeld() · update(dt) (timers: true on a change)
// serialize() / restore(obj) carry a run across reloads (save.js).

// ---------- data ----------
export const LEVEL_DECKS = [
	['pear', 'apple', 'orange'],
	['pear', 'apple', 'orange', 'kiwi'],
	['pear', 'apple', 'orange', 'kiwi', 'strawberry'],
	['pear', 'apple', 'orange', 'kiwi', 'strawberry', 'watermelon'],
	['pear', 'apple', 'orange', 'kiwi', 'strawberry', 'watermelon', 'lemon'],
	['pear', 'apple', 'orange', 'kiwi', 'strawberry', 'watermelon', 'lemon', 'avocado'],
	['pear', 'apple', 'orange', 'kiwi', 'strawberry', 'watermelon', 'lemon', 'avocado', 'peach'],
	['pear', 'apple', 'orange', 'kiwi', 'strawberry', 'watermelon', 'lemon', 'avocado', 'peach', 'cherry'],
	['pear', 'apple', 'orange', 'kiwi', 'strawberry', 'watermelon', 'lemon', 'avocado', 'peach', 'cherry', 'carrot'],
	['pear', 'apple', 'orange', 'kiwi', 'strawberry', 'watermelon', 'lemon', 'avocado', 'peach', 'cherry', 'carrot', 'broccoli'],
	['pear', 'apple', 'orange', 'kiwi', 'strawberry', 'watermelon', 'lemon', 'avocado', 'peach', 'cherry', 'carrot', 'broccoli', 'pepper'],
	['pear', 'apple', 'orange', 'kiwi', 'strawberry', 'watermelon', 'lemon', 'avocado', 'peach', 'cherry', 'carrot', 'broccoli', 'pepper', 'tomato'],
	['pear', 'apple', 'orange', 'kiwi', 'strawberry', 'watermelon', 'lemon', 'avocado', 'peach', 'cherry', 'carrot', 'broccoli', 'pepper', 'tomato', 'potato'],
];
export const MAX_LEVEL = LEVEL_DECKS.length;
export const FRUITS = LEVEL_DECKS[LEVEL_DECKS.length - 1];
export const NEXT_FRUIT = { 1: 'Kiwi', 2: 'Strawberry', 3: 'Watermelon', 4: 'Lemon', 5: 'Avocado', 6: 'Peach', 7: 'Cherry', 8: 'Carrot', 9: 'Broccoli', 10: 'Pepper', 11: 'Tomato', 12: 'Potato' };

// (descriptions: pear_charm_defs.lua)
export const CHARMS = {
	coconut: { name: 'Coconut Charm', cost: 6, desc: 'The first 2 mismatches per round cost no Hearts.' },
	grape: { name: 'Grape Charm', cost: 6, desc: 'Each pair matched awards +4 Berries instead of +2.' },
	manzana: { name: 'Manzana Charm', cost: 6, desc: 'Matching Apples or Peppers grants +1.5 Hearts.' },
	rhubarb: { name: 'Rhubarb Charm', cost: 6, desc: 'If you have more than 15 Berries, mismatches cost 5 Berries instead of Hearts.' },
	crabapple: { name: 'Crabapple Charm', cost: 6, desc: 'Finish a round without revealing an Apple: +10 Berries.' },
	eggplant: { name: 'Eggplant Charm', cost: 6, desc: 'Adds 4 Tart Kiwi cards to your deck.' },
	pumpkin: { name: 'Pumpkin Charm', cost: 6, desc: 'Gain +1 Heart on level completion.' },
	lime: { name: 'Lime Charm', cost: 6, desc: 'The first 4 mismatches involving a Lemon, Kiwi or Avocado cost 1 Berry instead of Hearts.' },
	pineapple: { name: 'Pineapple Charm', cost: 6, desc: 'On level completion, grant a random condition to a random fruit.' },
	olive: { name: 'Olive Charm', cost: 6, desc: 'Clear a level with 1 Heart or less: +3 Hearts and +15 Berries.' },
	egg: { name: 'Egg Charm', cost: 6, desc: 'Its sell value grows by +5 on every level completion.' },
	plum: { name: 'Plum Charm', cost: 6, desc: 'Matches and mismatches merge the two cards’ conditions; 1 in 4 chance it vanishes after triggering.' },
	mango: { name: 'Mango Charm', cost: 6, desc: 'On level completion, grant Juicy to a random fruit.' },
	onion: { name: 'Onion Charm', cost: 6, desc: 'Whenever you lose half a Heart, gain +4 Berries.' },
	persimmon: { name: 'Persimmon Charm', cost: 20, unique: true, desc: 'Once per run, cheat death: Hearts go to 1 and you lose all Berries. Then it vanishes.' },
};
export const CHARM_ORDER = ['coconut', 'grape', 'manzana', 'rhubarb', 'crabapple', 'eggplant', 'pumpkin', 'lime', 'pineapple', 'olive', 'egg', 'plum', 'mango', 'onion', 'persimmon'];
export const CONDITIONS = ['juicy', 'golden', 'fresh', 'tart', 'sticky', 'rotten', 'flutter'];
// (pear_charm_defs.lua conditionDescriptions)
export const COND_INFO = {
	special: { name: 'Special', icon: 'feather', desc: 'Matching this pair instantly wins the round.' },
	juicy: { name: 'Juicy', icon: 'juicebox', desc: 'Matching this pair grants triple rewards.' },
	golden: { name: 'Golden', icon: 'sparkles', desc: 'Matching this pair grants +50 Stars.' },
	fresh: { name: 'Fresh', icon: 'droplet', desc: 'Matching this pair grants +10 Berries per card.' },
	tart: { name: 'Tart', icon: 'clock', desc: 'Match it within the first 3 pairs for +1 Heart and +20 Berries.' },
	sticky: { name: 'Sticky', icon: 'pin', desc: 'Stays face up once flipped.' },
	rotten: { name: 'Rotten', icon: 'skull', desc: 'The pair gives nothing and is removed from your deck.' },
	flutter: { name: 'Flutter', icon: 'flutter', desc: 'Matching it reveals a random card for a moment.' },
};
export const COND_ORDER = ['special', 'juicy', 'golden', 'fresh', 'sticky', 'rotten', 'tart', 'flutter'];
const LIME_FRUITS = new Set(['lemon', 'kiwi', 'avocado']);
export const CONDITION_COST = 15;
export const MAX_HEARTS = 15;
const FLIP_BACK = 0.75, FLUTTER_PEEK = 1.0;
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const rint = (n) => Math.floor(Math.random() * n) + 1;
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- run state ----------
let S = null;
export const run = () => S;
function fresh() {
	return {
		v: 1, level: 1, hearts: 3, berries: 0, stars: 0, cards: [], first: null, flipBackTimer: 0, nextId: 1,
		levelClearing: false, levelShopOpen: false, gameOver: false, runCompleted: false, pendingGameOver: false,
		charm: { inventory: [null, null, null, null], deckConditions: {}, extraCards: [], rottenRemoved: {}, persimmonVanished: false, eggplantApplied: false },
		round: { mismatchCount: 0, mismatchesByFruit: {}, fruitMatches: {}, pairsMatched: 0, fruitsRevealed: {}, coconut: 0, lime: 0 },
		shop: { offers: [null, null, null, null], generatedLevel: -1, dragging: null },
		n: 0, fx: [], fxSeq: 0, started: Date.now(),
	};
}
export function reset() { S = null; }
export function startNewRun() { S = fresh(); buildLevel(); bump('newrun', {}); return true; }

/** Something happened (the view's `n` moves; `fx` carries what to animate: matches, mismatches, ...). */
function bump(kind, o) {
	S.n++;
	if (kind) { S.fxSeq++; S.fx.push({ seq: S.fxSeq, kind, ...o }); if (S.fx.length > 12) S.fx.splice(0, S.fx.length - 12); }
}

// ---------- deck ----------
export const LAYOUT = { 6: [3, 2], 8: [4, 2], 10: [5, 2], 12: [4, 3], 14: [5, 3], 16: [4, 4], 18: [6, 3], 20: [5, 4], 22: [6, 4], 24: [6, 4], 26: [7, 4], 28: [7, 4], 30: [6, 5] };
export function gridFor(n) { return LAYOUT[n] || [Math.ceil(Math.sqrt(n)), Math.ceil(n / Math.ceil(Math.sqrt(n)))]; }
export function ownsCharm(id) { return !!S && S.charm.inventory.some((c) => c && c.id === id); }
function newCard(fruit, conds) { const c = { fruit, conditions: {} }; if (conds) for (const k of conds) c.conditions[k] = (c.conditions[k] || 0) + 1; return c; }

function buildLevel() {
	const list = LEVEL_DECKS[S.level - 1];
	const deck = [];
	for (const fruit of list) { deck.push(newCard(fruit)); deck.push(newCard(fruit)); }
	for (const ec of S.charm.extraCards) deck.push(newCard(ec.fruit, ec.conds));
	// rotten removal
	for (const [fruit, n] of Object.entries(S.charm.rottenRemoved)) { let left = n; for (let i = deck.length - 1; i >= 0 && left > 0; i--) if (deck[i].fruit === fruit) { deck.splice(i, 1); left--; } }
	// stored deck conditions + pears are special (instant win)
	for (const card of deck) {
		if (card.fruit === 'pear') card.conditions.special = (card.conditions.special || 0) + 1;
		const stored = S.charm.deckConditions[card.fruit];
		if (stored) for (const [cond, ct] of Object.entries(stored)) card.conditions[cond] = (card.conditions[cond] || 0) + ct;
	}
	// shuffle
	for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
	S.cards = deck.map((d) => ({ id: S.nextId++, fruit: d.fruit, conditions: d.conditions, faceUp: false, matched: false, peek: 0 }));
	S.first = null;
	S.round = { mismatchCount: 0, mismatchesByFruit: {}, fruitMatches: {}, pairsMatched: 0, fruitsRevealed: {}, coconut: 0, lime: 0 };
}
const byId = (id) => S.cards.find((c) => c.id === id) || null;

// ---------- update (timers) ----------
export function update(dt) {
	if (!S) return false;
	let changed = false;
	for (const c of S.cards) if (c.peek > 0) { c.peek = Math.max(0, c.peek - dt); if (!c.peek) changed = true; }
	if (S.flipBackTimer > 0) {
		S.flipBackTimer -= dt;
		if (S.flipBackTimer <= 0) {
			S.flipBackTimer = 0;
			const ids = [];
			for (const c of S.cards) if (c.faceUp && !c.matched && !(c.conditions.sticky)) { c.faceUp = false; ids.push(c.id); }
			if (S.pendingGameOver) { S.gameOver = true; S.pendingGameOver = false; S.berries = 0; bump('gameover', {}); }
			else bump('flipback', { ids });
			changed = true;
		}
	}
	return changed;
}

// ---------- matching ----------
const has = (c, cond) => (c.conditions[cond] || 0) >= 1;
function allMatched() { return S.cards.every((c) => c.matched); }

function handleMatchRewards(fruit, cards, pairIndex) {
	let berries = 0, hearts = 0, stars = 0, anyRotten = false;
	const grape = ownsCharm('grape'), manzana = ownsCharm('manzana');
	for (const card of cards) {
		let b = grape ? 2 : 1, hh = 0, st = 0;
		if (manzana && (fruit === 'apple' || fruit === 'pepper')) hh += 0.75;
		if (has(card, 'fresh')) b += 10;
		if (has(card, 'tart') && pairIndex <= 3) { b += 10; hh += 0.5; }
		if (has(card, 'golden')) st += 50;
		if (has(card, 'rotten')) anyRotten = true;
		const juice = has(card, 'juicy') ? 3 : 1;
		berries += b * juice; hearts += hh * juice; stars += st * juice;
	}
	if (anyRotten) { S.charm.rottenRemoved[fruit] = (S.charm.rottenRemoved[fruit] || 0) + 2; return { berries: 0, hearts: 0, stars: 0, rotten: true }; }
	S.stars = Math.max(0, S.stars + stars);
	S.berries += berries;
	S.hearts = Math.min(MAX_HEARTS, S.hearts + hearts);
	return { berries, hearts, stars, rotten: false };
}
function finalizeMatch(a, b) {
	a.matched = b.matched = true; a.faceUp = b.faceUp = true;
	const fruit = a.fruit;
	S.round.fruitMatches[fruit] = (S.round.fruitMatches[fruit] || 0) + 1;
	S.round.pairsMatched += 1;
	const r = handleMatchRewards(fruit, [a, b], S.round.pairsMatched);
	bump('match', { ids: [a.id, b.id], fruit, gain: r.berries, hearts: r.hearts, stars: r.stars, rotten: r.rotten });
	if (ownsCharm('plum')) plumSpread(a, b);
	// Flutter (pear_game.lua triggerFlutterReveal): a random face-down card shows for a moment
	if (has(a, 'flutter') || has(b, 'flutter')) {
		const hidden = S.cards.filter((c) => !c.faceUp && !c.matched);
		if (hidden.length) { const t = pickOne(hidden); t.peek = FLUTTER_PEEK; bump('flutter', { ids: [t.id] }); }
	}
	if (has(a, 'special') || has(b, 'special')) { beginLevelClear(true); return; }
	if (allMatched()) beginLevelClear(false);
}
function checkAutoMatches() {
	const byFruit = {};
	for (const c of S.cards) if (c.faceUp && !c.matched) (byFruit[c.fruit] = byFruit[c.fruit] || []).push(c);
	let did = false;
	for (const list of Object.values(byFruit)) while (list.length >= 2) { const a = list.shift(), b = list.shift(); finalizeMatch(a, b); did = true; }
	if (did) S.first = null; // only clear the pending selection when something actually matched
}
function plumSpread(a, b) {
	const merge = (x, y) => { for (const [k, v] of Object.entries(y.conditions)) x.conditions[k] = (x.conditions[k] || 0) + v; };
	const ca = { ...a.conditions }, cb = { ...b.conditions };
	merge(a, { conditions: cb }); merge(b, { conditions: ca });
	if (rint(4) === 1) { const i = S.charm.inventory.findIndex((c) => c && c.id === 'plum'); if (i >= 0) { S.charm.inventory[i] = null; bump('charmgone', { id: 'plum' }); } }
}
/** Why a card can't be flipped now (null = it can). */
export function revealRefusal(id) {
	if (!S) return 'no run';
	if (S.levelClearing || S.gameOver || S.runCompleted || S.pendingGameOver) return 'the round is over';
	if (S.flipBackTimer > 0) return 'wait for the cards to turn back';
	const card = byId(id);
	if (!card) return 'no such card';
	if (card.faceUp || card.matched) return 'that card is already face up';
	return null;
}
export function reveal(id) {
	if (revealRefusal(id)) return false;
	const card = byId(id);
	card.faceUp = true; card.peek = 0;
	S.round.fruitsRevealed[card.fruit] = true;
	bump('flip', { ids: [card.id] });
	if (!S.first) { S.first = card.id; checkAutoMatches(); return true; }
	const first = byId(S.first);
	if (!first || first === card) { S.first = card.id; return true; }
	if (card.fruit === first.fruit) finalizeMatch(first, card);
	else mismatch(first, card);
	S.first = null; // selection consumed either way (mismatched cards stay revealed until flip-back)
	checkAutoMatches();
	return true;
}
function mismatch(a, b) {
	S.round.mismatchCount += 1;
	for (const f of [a.fruit, b.fruit]) S.round.mismatchesByFruit[f] = (S.round.mismatchesByFruit[f] || 0) + 1;
	let heartPen = 0.5, berryPen = 0, saved = '';
	if (ownsCharm('coconut') && S.round.coconut < 2) { heartPen = 0; berryPen = 0; S.round.coconut++; saved = 'coconut'; }
	else if (ownsCharm('lime') && S.round.lime < 4 && S.berries >= 1 && (LIME_FRUITS.has(a.fruit) || LIME_FRUITS.has(b.fruit))) { heartPen = 0; berryPen = 1; S.round.lime++; saved = 'lime'; }
	else if (ownsCharm('rhubarb') && S.berries > 15) { heartPen = 0; berryPen = 5; saved = 'rhubarb'; }
	if (berryPen) S.berries = Math.max(0, S.berries - berryPen);
	let onion = 0;
	if (heartPen) { const before = S.hearts; S.hearts = Math.max(0, S.hearts - heartPen); if (ownsCharm('onion')) { const lost = (before - S.hearts) / 0.5; onion = Math.round(lost) * 4; S.berries += onion; } }
	bump('mismatch', { ids: [a.id, b.id], hearts: -heartPen, berries: -berryPen + onion, saved });
	if (ownsCharm('plum')) plumSpread(a, b);
	S.flipBackTimer = FLIP_BACK;
	if (S.hearts === 0) { if (!persimmonSave()) S.pendingGameOver = true; }
}
function persimmonSave() {
	if (!ownsCharm('persimmon') || S.charm.persimmonVanished) return false;
	S.hearts = Math.max(1, S.hearts); S.berries = 0; S.charm.persimmonVanished = true;
	const i = S.charm.inventory.findIndex((c) => c && c.id === 'persimmon'); if (i >= 0) S.charm.inventory[i] = null;
	bump('persimmon', {});
	return true;
}

// ---------- level flow ----------
function beginLevelClear(byPear) {
	S.hearts = Math.min(MAX_HEARTS, S.hearts + 2);
	S.levelClearing = true; S.levelShopOpen = false;
	for (const c of S.cards) c.matched = true;
	processEndCharms();
	bump('clear', { pear: !!byPear });
}
function processEndCharms() {
	if (ownsCharm('pumpkin')) S.hearts = Math.min(MAX_HEARTS, S.hearts + 1);
	if (ownsCharm('olive') && S.hearts <= 1) { S.hearts = Math.min(MAX_HEARTS, S.hearts + 3); S.berries += 15; }
	if (ownsCharm('crabapple') && !S.round.fruitsRevealed.apple) S.berries += 10;
	// Egg (pear_game.lua): the Egg charm's own sell value grows by 5
	for (const c of S.charm.inventory) if (c && c.id === 'egg') c.sellValue = (c.sellValue || 0) + 5;
	if (ownsCharm('pineapple')) applyRandomCondition();
	if (ownsCharm('mango')) { const fruits = [...new Set(S.cards.map((c) => c.fruit))]; if (fruits.length) applyStoredCondition(pickOne(fruits), 'juicy'); }
}
function applyStoredCondition(fruit, cond) { const d = S.charm.deckConditions[fruit] = S.charm.deckConditions[fruit] || {}; d[cond] = (d[cond] || 0) + 1; }
function applyRandomCondition() { const fruits = [...new Set(S.cards.map((c) => c.fruit))]; if (!fruits.length) return; applyStoredCondition(pickOne(fruits), pickOne(CONDITIONS)); }
function advanceLevel() {
	returnHeld();
	if (S.level >= MAX_LEVEL) { S.runCompleted = true; S.cards = []; bump('won', {}); return; }
	S.level += 1; S.levelClearing = false; S.levelShopOpen = false; buildLevel();
	bump('level', { level: S.level });
}
/** The "Level N Complete" panel's button: the level shop (or, after the last level, the end of the run). */
export function continueClear() {
	if (!S || !S.levelClearing || S.levelShopOpen || S.gameOver || S.runCompleted) return false;
	if (S.level >= MAX_LEVEL) advanceLevel();
	else { S.levelShopOpen = true; genOffers(); bump('shop', {}); }
	return true;
}
/** The shop's Next Level (Finish on the last level). */
export function nextLevel() {
	if (!S || !S.levelClearing || !S.levelShopOpen) return false;
	advanceLevel();
	return true;
}

// ---------- shop ----------
function genOffers() {
	if (S.shop.generatedLevel === S.level) return;
	S.shop.generatedLevel = S.level;
	const avail = CHARM_ORDER.filter((id) => !ownsCharm(id) && CHARMS[id].cost <= S.berries);
	const pool = avail.length ? avail : CHARM_ORDER.filter((id) => !ownsCharm(id));
	const pick = () => (pool.length ? pool.splice(Math.floor(Math.random() * pool.length), 1)[0] : null);
	const c1 = pick(), c2 = pick();
	const fruit = [...new Set(S.cards.map((c) => c.fruit))][0] || 'apple';
	const cond = pickOne(CONDITIONS);
	S.shop.offers = [
		c1 ? { kind: 'charm', id: c1, cost: CHARMS[c1].cost } : null,
		c2 ? { kind: 'charm', id: c2, cost: CHARMS[c2].cost } : null,
		{ kind: 'condition', fruit, cond, cost: CONDITION_COST },
		{ kind: 'sell' },
	];
}
const inShop = () => !!S && S.levelClearing && S.levelShopOpen && !S.gameOver && !S.runCompleted;
/** Why an offer can't be bought (null = it can). */
export function buyRefusal(slot) {
	if (!inShop()) return 'the shop is closed';
	const o = S.shop.offers[slot];
	if (!o || o.kind === 'sell') return 'nothing to buy there';
	if (S.berries < o.cost) return 'not enough Berries';
	if (o.kind === 'charm' && S.charm.inventory.indexOf(null) < 0) return 'your charm slots are full';
	return null;
}
export function buy(slot) {
	if (buyRefusal(slot)) return false;
	const o = S.shop.offers[slot];
	S.berries -= o.cost;
	if (o.kind === 'charm') {
		const empty = S.charm.inventory.indexOf(null);
		const c = CHARMS[o.id];
		S.charm.inventory[empty] = { id: o.id, name: c.name, sellValue: Math.max(1, Math.floor(o.cost * 0.5 + 0.5)) };
		if (o.id === 'eggplant' && !S.charm.eggplantApplied) { S.charm.eggplantApplied = true; for (let i = 0; i < 4; i++) S.charm.extraCards.push({ fruit: 'kiwi', conds: ['tart'] }); }
		bump('buy', { slot, id: o.id, to: empty });
	} else {
		applyStoredCondition(o.fruit, o.cond);
		bump('buy', { slot, cond: o.cond, fruit: o.fruit });
	}
	S.shop.offers[slot] = null;
	return true;
}

// ---------- charm slots (pick up / drop / sell: pear_game.lua's drag) ----------
export function pickCharm(i) {
	if (!inShop() || S.shop.dragging || !S.charm.inventory[i]) return false;
	S.shop.dragging = { origin: i, charm: S.charm.inventory[i] };
	S.charm.inventory[i] = null;
	bump(null);
	return true;
}
/** Drop the held charm on slot i (swapping with what is there); i < 0 puts it back. */
export function dropCharm(i) {
	if (!S || !S.shop.dragging) return false;
	const { origin, charm } = S.shop.dragging;
	if (i >= 0 && i < 4) { const occ = S.charm.inventory[i]; S.charm.inventory[i] = charm; S.charm.inventory[origin] = occ; }
	else S.charm.inventory[origin] = charm;
	S.shop.dragging = null;
	bump(i >= 0 && i !== origin ? 'swap' : null, { from: origin, to: i });
	return true;
}
function returnHeld() { if (S && S.shop.dragging) { const { origin, charm } = S.shop.dragging; if (!S.charm.inventory[origin]) S.charm.inventory[origin] = charm; S.shop.dragging = null; } }
/** Sell the held charm for its sell value (pear_game.lua sellCharmFromDrag). */
export function sellHeld() {
	if (!inShop() || !S.shop.dragging) return false;
	const ch = S.shop.dragging.charm;
	const value = Math.max(1, Math.floor((ch.sellValue || 0) + 0.5));
	S.berries += value;
	S.shop.dragging = null;
	bump('sell', { id: ch.id, value });
	return true;
}

// ---------- the view (what the page and a spectator draw) ----------
export function phase() {
	if (!S) return 'none';
	if (S.runCompleted) return 'won';
	if (S.gameOver) return 'over';
	if (S.levelClearing) return S.levelShopOpen ? 'shop' : 'clear';
	return 'play';
}
const condList = (c) => COND_ORDER.filter((k) => has(c, k));
export function view() {
	if (!S) return null;
	const ph = phase();
	const shown = (c) => c.faceUp || c.matched || c.peek > 0;
	const pairsTotal = Math.floor(S.cards.length / 2);
	return {
		game: 'pears', n: S.n, level: S.level, maxLevel: MAX_LEVEL, phase: ph,
		hearts: S.hearts, maxHearts: MAX_HEARTS, berries: Math.floor(S.berries), stars: S.stars,
		cards: S.cards.map((c) => (shown(c) ? { id: c.id, up: c.faceUp || c.peek > 0, m: c.matched, fruit: c.fruit, conds: condList(c), peek: c.peek > 0 } : { id: c.id, up: false, m: false })),
		grid: gridFor(S.cards.length),
		pairs: S.round.pairsMatched, pairsTotal, mismatches: S.round.mismatchCount,
		busy: S.flipBackTimer > 0 || S.pendingGameOver,
		next: NEXT_FRUIT[S.level] || null,
		charms: S.charm.inventory.map((c) => (c ? { id: c.id, sell: c.sellValue } : null)),
		held: S.shop.dragging ? { origin: S.shop.dragging.origin, id: S.shop.dragging.charm.id, sell: S.shop.dragging.charm.sellValue } : null,
		offers: ph === 'shop' ? S.shop.offers.map((o) => (o ? { ...o } : null)) : [],
		deckConds: S.charm.deckConditions,
		fx: S.fx.slice(-8),
	};
}
/** A short progress label for presence ("Pair of Pears · Level 5"). */
export function label() {
	if (!S) return 'Pair of Pears';
	if (S.runCompleted) return 'Pair of Pears · Harvest complete';
	if (S.gameOver) return 'Pair of Pears · Game over';
	return 'Pair of Pears · Level ' + S.level;
}

// ---------- save / resume ----------
export function serialize() {
	if (!S) return null;
	return JSON.parse(JSON.stringify(S));
}
/** Restore a saved run (null = none / unreadable: nothing changes). Missing fields take their defaults. */
export function restore(o) {
	if (!o || typeof o !== 'object' || !Array.isArray(o.cards) || !(o.level >= 1 && o.level <= MAX_LEVEL)) return false;
	const f = fresh();
	const r = { ...f, ...o, charm: { ...f.charm, ...(o.charm || {}) }, round: { ...f.round, ...(o.round || {}) }, shop: { ...f.shop, ...(o.shop || {}) } };
	if (!Array.isArray(r.charm.inventory) || r.charm.inventory.length !== 4) r.charm.inventory = [null, null, null, null];
	if (!Array.isArray(r.shop.offers) || r.shop.offers.length !== 4) r.shop.offers = [null, null, null, null];
	let id = 1;
	r.cards = o.cards.filter((c) => c && typeof c.fruit === 'string').map((c) => ({ id: Number.isFinite(c.id) ? c.id : id++, fruit: c.fruit, conditions: c.conditions && typeof c.conditions === 'object' ? c.conditions : {}, faceUp: !!c.faceUp, matched: !!c.matched, peek: 0 }));
	r.nextId = Math.max(r.nextId || 1, ...r.cards.map((c) => c.id + 1), 1);
	if (r.first != null && !r.cards.some((c) => c.id === r.first)) r.first = null;
	for (const k of ['hearts', 'berries', 'stars', 'flipBackTimer', 'n']) r[k] = Number.isFinite(+r[k]) ? +r[k] : f[k];
	r.hearts = Math.max(0, Math.min(MAX_HEARTS, r.hearts));
	r.fx = []; r.fxSeq = Number.isFinite(+o.fxSeq) ? +o.fxSeq : 0;
	S = r;
	return true;
}

// test hook: the run's cards with their fruit (the view hides face-down ones)
export function _cards() { return S ? S.cards.map((c) => ({ id: c.id, fruit: c.fruit, faceUp: c.faceUp, matched: c.matched, conditions: { ...c.conditions } })) : []; }
