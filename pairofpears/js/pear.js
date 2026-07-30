// pear.js — "A Pair of Pears": a memory/concentration card game with a
// roguelike charm + condition shop layer. Native-JS port of pear_game.lua /
// pear_charm_defs.lua. Position-based interaction (act(x,y)) driven by the
// cursor (Z=A) or direct taps; B backs out. Shares Berries/Stars with G.
import { G, W, H } from './state.js';
import { img } from './assets.js';

// ---------- data ----------
const LEVEL_DECKS = [
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
const MAX_LEVEL = LEVEL_DECKS.length;
const NEXT_FRUIT = { 1: 'Kiwi', 2: 'Strawberry', 3: 'Watermelon', 4: 'Lemon', 5: 'Avocado', 6: 'Peach', 7: 'Cherry', 8: 'Carrot', 9: 'Broccoli', 10: 'Pepper', 11: 'Tomato', 12: 'Potato' };

const CHARMS = {
	coconut: { name: 'Coconut Charm', cost: 6, desc: 'First 2 mismatches per round cost no Hearts.' },
	grape: { name: 'Grape Charm', cost: 6, desc: 'Each matched pair awards +4 Berries.' },
	manzana: { name: 'Manzana Charm', cost: 6, desc: 'Matching Apples or Peppers grants +1.5 Hearts.' },
	rhubarb: { name: 'Rhubarb Charm', cost: 6, desc: 'If Berries > 15, mismatches cost 5 Berries instead of Hearts.' },
	crabapple: { name: 'Crabapple Charm', cost: 6, desc: 'Finish a round without revealing an Apple: +10 Berries.' },
	eggplant: { name: 'Eggplant Charm', cost: 6, desc: 'Adds 4 Tart Kiwi cards to your deck.' },
	pumpkin: { name: 'Pumpkin Charm', cost: 6, desc: '+1 Heart on level completion.' },
	lime: { name: 'Lime Charm', cost: 6, desc: 'First 4 Lemon/Kiwi/Avocado mismatches cost 1 Berry.' },
	pineapple: { name: 'Pineapple Charm', cost: 6, desc: 'On level completion, apply a random condition to a random fruit.' },
	olive: { name: 'Olive Charm', cost: 6, desc: 'Clear a level with <=1 Heart: +3 Hearts, +15 Berries.' },
	egg: { name: 'Egg Charm', cost: 6, desc: 'Sell value increases by +5 each level completion.' },
	plum: { name: 'Plum Charm', cost: 6, desc: 'On match/mismatch, merge the two cards’ conditions. May vanish.' },
	mango: { name: 'Mango Charm', cost: 6, desc: 'On level completion, grant Juicy to a random fruit.' },
	onion: { name: 'Onion Charm', cost: 6, desc: 'Lose half a Heart: +4 Berries.' },
	persimmon: { name: 'Persimmon Charm', cost: 20, unique: true, desc: 'Once per run, cheat death (lose all Berries).' },
};
const CHARM_ORDER = ['coconut', 'grape', 'manzana', 'rhubarb', 'crabapple', 'eggplant', 'pumpkin', 'lime', 'pineapple', 'olive', 'egg', 'plum', 'mango', 'onion', 'persimmon'];
const CONDITIONS = ['juicy', 'golden', 'fresh', 'tart', 'sticky', 'rotten', 'flutter'];
const COND_ICON = { special: 'feather', sticky: 'pin', golden: 'sparkles', juicy: 'juicebox', tart: 'clock', fresh: 'droplet', rotten: 'skull', flutter: 'flutter' };
const LIME_FRUITS = new Set(['lemon', 'kiwi', 'avocado']);
const CONDITION_COST = 15;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const rint = n => Math.floor(Math.random() * n) + 1;

// ---------- run state ----------
let S = null;
function fresh() {
	return {
		level: 1, hearts: 3, cards: [], first: null, second: null, flipBackTimer: 0,
		levelClearing: false, levelShopOpen: false, gameOver: false, runCompleted: false, pendingGameOver: false,
		charm: { inventory: [null, null, null, null], deckConditions: {}, extraCards: [], rottenRemoved: {}, persimmonVanished: false, eggplantApplied: false, sellBonus: 0 },
		round: { mismatchCount: 0, mismatchesByFruit: {}, fruitMatches: {}, pairsMatched: 0, fruitsRevealed: {}, coconut: 0, lime: 0 },
		shop: { offers: [null, null, null, null], generatedLevel: -1, dragging: null },
	};
}
export function reset() { S = null; }
export function startNewRun() { S = fresh(); buildLevel(); }

// ---------- deck / layout ----------
const LAYOUT = { 6: [3, 2], 8: [4, 2], 10: [5, 2], 12: [4, 3], 14: [5, 3], 16: [4, 4], 18: [6, 3], 20: [5, 4], 22: [6, 4], 24: [6, 4], 26: [7, 4], 28: [7, 4], 30: [6, 5] };
function ownsCharm(id) { return S.charm.inventory.some(c => c && c.id === id); }
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
	// layout
	const n = deck.length;
	let [cols, rows] = LAYOUT[n] || [Math.ceil(Math.sqrt(n)), Math.ceil(n / Math.ceil(Math.sqrt(n)))];
	const leftInset = 122, availW = W - leftInset - 20, availH = H * 0.62;
	let cw = Math.min(170, Math.max(34, (availW - (cols - 1) * 16) / cols));
	for (let g = 0; g < 40; g++) { const ch = cw * 1.25, gw = cols * cw + (cols - 1) * Math.max(14, cw * 0.18), gh = rows * ch + (rows - 1) * Math.max(12, ch * 0.2); if (gw <= availW && gh <= availH) break; cw *= 0.95; }
	const ch = cw * 1.25, sx = Math.max(14, cw * 0.18), sy = Math.max(12, ch * 0.2);
	const gw = cols * cw + (cols - 1) * sx, gh = rows * ch + (rows - 1) * sy;
	const startX = leftInset + (availW - gw) / 2, startY = H * 0.45 - gh / 2;
	S.cards = deck.map((d, i) => { const r = Math.floor(i / cols), c = i % cols; return { fruit: d.fruit, conditions: d.conditions, x: startX + c * (cw + sx), y: startY + r * (ch + sy), w: cw, h: ch, faceUp: false, matched: false, flip: 0, flipTarget: 0, vanish: 0 }; });
	S.first = S.second = null;
	S.round = { mismatchCount: 0, mismatchesByFruit: {}, fruitMatches: {}, pairsMatched: 0, fruitsRevealed: {}, coconut: 0, lime: 0 };
}

// ---------- update ----------
export function update(dt) {
	if (!S) return;
	for (const c of S.cards) {
		c.flip += (c.flipTarget - c.flip) * Math.min(1, dt * 12);
		if (Math.abs(c.flipTarget - c.flip) < 0.01) c.flip = c.flipTarget;
		if (c.matched) c.vanish += (1 - c.vanish) * Math.min(1, dt * 4);
	}
	if (S.flipBackTimer > 0) {
		S.flipBackTimer -= dt;
		if (S.flipBackTimer <= 0) {
			S.flipBackTimer = 0;
			for (const c of S.cards) if (c.faceUp && !c.matched && !(c.conditions.sticky)) { c.faceUp = false; c.flipTarget = 0; }
			if (S.pendingGameOver) { S.gameOver = true; S.pendingGameOver = false; G.berryCount = 0; }
		}
	}
}

// ---------- matching ----------
const has = (c, cond) => (c.conditions[cond] || 0) >= 1;
function allMatched() { return S.cards.every(c => c.matched); }

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
	if (anyRotten) { S.charm.rottenRemoved[fruit] = (S.charm.rottenRemoved[fruit] || 0) + 2; return 0; }
	G.starCount = Math.max(0, G.starCount + stars);
	G.berryCount += berries;
	S.hearts = Math.min(15, S.hearts + hearts);
	return berries;
}
function finalizeMatch(a, b) {
	a.matched = b.matched = true; a.flipTarget = b.flipTarget = 1;
	const fruit = a.fruit;
	S.round.fruitMatches[fruit] = (S.round.fruitMatches[fruit] || 0) + 1;
	S.round.pairsMatched += 1;
	const gain = handleMatchRewards(fruit, [a, b], S.round.pairsMatched);
	a.pop = { txt: '+' + gain, t: 0 }; b.pop = { txt: '+' + gain, t: 0 };
	if (ownsCharm('plum')) plumSpread(a, b);
	if (has(a, 'special') || has(b, 'special')) { beginLevelClear(); return; }
	if (allMatched()) beginLevelClear();
}
function checkAutoMatches() {
	const byFruit = {};
	for (const c of S.cards) if (c.faceUp && !c.matched) (byFruit[c.fruit] = byFruit[c.fruit] || []).push(c);
	let did = false;
	for (const list of Object.values(byFruit)) while (list.length >= 2) { const a = list.shift(), b = list.shift(); finalizeMatch(a, b); did = true; }
	if (did) S.first = S.second = null; // only clear the pending selection when something actually matched
}
function plumSpread(a, b) {
	const merge = (x, y) => { for (const [k, v] of Object.entries(y.conditions)) x.conditions[k] = (x.conditions[k] || 0) + v; };
	const ca = { ...a.conditions }, cb = { ...b.conditions };
	merge(a, { conditions: cb }); merge(b, { conditions: ca });
	if (rint(4) === 1) { const i = S.charm.inventory.findIndex(c => c && c.id === 'plum'); if (i >= 0) S.charm.inventory[i] = null; }
}
function reveal(card) {
	if (S.levelClearing || S.gameOver || S.runCompleted || S.pendingGameOver || S.flipBackTimer > 0) return;
	if (card.faceUp || card.matched) return;
	card.faceUp = true; card.flipTarget = 1;
	S.round.fruitsRevealed[card.fruit] = true;
	if (!S.first) { S.first = card; checkAutoMatches(); return; }
	if (S.first === card) return;
	S.second = card;
	if (card.fruit === S.first.fruit) finalizeMatch(S.first, card);
	else mismatch(S.first, card);
	S.first = S.second = null; // selection consumed either way (mismatched cards stay revealed until flip-back)
	checkAutoMatches();
}
function mismatch(a, b) {
	S.round.mismatchCount += 1;
	for (const f of [a.fruit, b.fruit]) S.round.mismatchesByFruit[f] = (S.round.mismatchesByFruit[f] || 0) + 1;
	let heartPen = 0.5, berryPen = 0;
	if (ownsCharm('coconut') && S.round.coconut < 2) { heartPen = 0; berryPen = 0; S.round.coconut++; }
	else if (ownsCharm('lime') && S.round.lime < 4 && G.berryCount >= 1 && (LIME_FRUITS.has(a.fruit) || LIME_FRUITS.has(b.fruit))) { heartPen = 0; berryPen = 1; S.round.lime++; }
	else if (ownsCharm('rhubarb') && G.berryCount > 15) { heartPen = 0; berryPen = 5; }
	if (berryPen) G.berryCount = Math.max(0, G.berryCount - berryPen);
	if (heartPen) { const before = S.hearts; S.hearts = Math.max(0, S.hearts - heartPen); if (ownsCharm('onion')) { const lost = (before - S.hearts) / 0.5; G.berryCount += Math.round(lost) * 4; } }
	if (ownsCharm('plum')) plumSpread(a, b);
	S.flipBackTimer = 0.75;
	if (S.hearts === 0) { if (!persimmonSave()) S.pendingGameOver = true; }
}
function persimmonSave() {
	if (!ownsCharm('persimmon') || S.charm.persimmonVanished) return false;
	S.hearts = Math.max(1, S.hearts); G.berryCount = 0; S.charm.persimmonVanished = true;
	const i = S.charm.inventory.findIndex(c => c && c.id === 'persimmon'); if (i >= 0) S.charm.inventory[i] = null;
	return true;
}

// ---------- level flow ----------
function beginLevelClear() {
	S.hearts = Math.min(15, S.hearts + 2);
	S.levelClearing = true; S.levelShopOpen = false;
	for (const c of S.cards) c.matched = true;
	processEndCharms();
}
function processEndCharms() {
	if (ownsCharm('pumpkin')) S.hearts = Math.min(15, S.hearts + 1);
	if (ownsCharm('olive') && S.hearts <= 1) { S.hearts = Math.min(15, S.hearts + 3); G.berryCount += 15; }
	if (ownsCharm('crabapple') && !S.round.fruitsRevealed['apple']) G.berryCount += 10;
	if (ownsCharm('egg')) S.charm.sellBonus += 5;
	if (ownsCharm('pineapple')) applyRandomCondition();
	if (ownsCharm('mango')) { const fruits = [...new Set(S.cards.map(c => c.fruit))]; if (fruits.length) applyStoredCondition(fruits[Math.floor(Math.random() * fruits.length)], 'juicy'); }
}
function applyStoredCondition(fruit, cond) { const d = S.charm.deckConditions[fruit] = S.charm.deckConditions[fruit] || {}; d[cond] = (d[cond] || 0) + 1; }
function applyRandomCondition() { const fruits = [...new Set(S.cards.map(c => c.fruit))]; if (!fruits.length) return; applyStoredCondition(fruits[Math.floor(Math.random() * fruits.length)], CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)]); }
function advanceLevel() {
	if (S.level >= MAX_LEVEL) { S.runCompleted = true; S.cards = []; return; }
	S.level += 1; S.levelClearing = false; S.levelShopOpen = false; buildLevel();
}

// ---------- shop ----------
function genOffers() {
	if (S.shop.generatedLevel === S.level) return;
	S.shop.generatedLevel = S.level;
	const avail = CHARM_ORDER.filter(id => !ownsCharm(id) && CHARMS[id].cost <= G.berryCount);
	const pool = avail.length ? avail : CHARM_ORDER.filter(id => !ownsCharm(id));
	const pick = () => pool.length ? pool.splice(Math.floor(Math.random() * pool.length), 1)[0] : null;
	const c1 = pick(), c2 = pick();
	const fruit = [...new Set(S.cards.map(c => c.fruit))][0] || 'apple';
	const cond = CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)];
	S.shop.offers = [
		c1 ? { kind: 'charm', id: c1, cost: CHARMS[c1].cost } : null,
		c2 ? { kind: 'charm', id: c2, cost: CHARMS[c2].cost } : null,
		{ kind: 'condition', fruit, cond, cost: CONDITION_COST },
		{ kind: 'sell' },
	];
}
function buyCharm(slot) {
	const o = S.shop.offers[slot]; if (!o || o.kind !== 'charm') return;
	const empty = S.charm.inventory.indexOf(null); if (empty < 0 || G.berryCount < o.cost) return;
	G.berryCount -= o.cost;
	const c = CHARMS[o.id];
	S.charm.inventory[empty] = { id: o.id, name: c.name, sellValue: Math.max(1, Math.floor(o.cost * 0.5 + 0.5)) + S.charm.sellBonus };
	if (o.id === 'eggplant' && !S.charm.eggplantApplied) { S.charm.eggplantApplied = true; for (let i = 0; i < 4; i++) S.charm.extraCards.push({ fruit: 'kiwi', conds: ['tart'] }); }
	S.shop.offers[slot] = null;
}
function buyCondition(slot) {
	const o = S.shop.offers[slot]; if (!o || o.kind !== 'condition' || G.berryCount < o.cost) return;
	G.berryCount -= o.cost; applyStoredCondition(o.fruit, o.cond); S.shop.offers[slot] = null;
}

// ---------- charm slots (drag = pick up / drop) ----------
const SLOT = i => [20, Math.round(H * 0.5 - 172) + i * 90, 74, 74];
function charmSlotAt(x, y) { for (let i = 0; i < 4; i++) { const r = SLOT(i); if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) return i; } return -1; }
function charmClick(i) {
	if (S.shop.dragging) { // drop
		if (i >= 0) { const from = S.shop.dragging.origin, ch = S.shop.dragging.charm; const occ = S.charm.inventory[i]; S.charm.inventory[i] = ch; S.charm.inventory[from] = occ; }
		else if (S.charm.inventory[S.shop.dragging.origin] === null) S.charm.inventory[S.shop.dragging.origin] = S.shop.dragging.charm;
		S.shop.dragging = null; return;
	}
	if (i >= 0 && S.charm.inventory[i]) { S.shop.dragging = { origin: i, charm: S.charm.inventory[i] }; S.charm.inventory[i] = null; }
}

// ---------- interaction ----------
const OVERLAY = getOverlayRect();
const OVERLAY_BTN = [W / 2 - 120, OVERLAY[1] + OVERLAY[3] - 84, 240, 60];
const SHOP_NEXT = [OVERLAY[0] + OVERLAY[2] - 220, OVERLAY[1] + OVERLAY[3] - 80, 200, 60];
function getOverlayRect() { const w = Math.min(520, W - 40), h = Math.min(520, H - 40); return [(W - w) / 2, H * 0.45 - h / 2, w, h]; }
function shopSlotRect(i) { const p = OVERLAY, sw = (p[2] - 56 - 24) / 2, sh = (p[3] - 150 - 140 - 24) / 2; const col = i % 2, row = Math.floor(i / 2); return [p[0] + 28 + col * (sw + 24), p[1] + 150 + row * (sh + 24), sw, sh]; }
const hit = (x, y, r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

export function act(x, y) {
	if (!S) return null;
	if (S.gameOver || S.runCompleted) { if (hit(x, y, OVERLAY_BTN)) return 'back_to_splash'; return null; }
	if (S.levelClearing) {
		if (!S.levelShopOpen) { // "Level N Complete" -> open shop or finish
			if (hit(x, y, OVERLAY_BTN)) { if (S.level >= MAX_LEVEL) advanceLevel(); else { S.levelShopOpen = true; genOffers(); } }
			return null;
		}
		// shop phase
		if (hit(x, y, SHOP_NEXT)) { advanceLevel(); return null; }
		const ci = charmSlotAt(x, y);
		if (ci >= 0 || S.shop.dragging) { charmClick(ci); return null; }
		for (let i = 0; i < 4; i++) if (hit(x, y, shopSlotRect(i))) { const o = S.shop.offers[i]; if (!o) return null; if (o.kind === 'charm') buyCharm(i); else if (o.kind === 'condition') buyCondition(i); return null; }
		return null;
	}
	// active board: reveal a card
	for (const c of S.cards) if (!c.matched && !c.faceUp && hit(x, y, [c.x, c.y, c.w, c.h])) { reveal(c); return null; }
	return null;
}

// ---------- drawing ----------
function text(ctx, s, x, y, { size = 16, color = '#fff', align = 'left', baseline = 'top' } = {}) { ctx.font = `${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = baseline; ctx.fillText(s, x, y); }
function rr(ctx, x, y, w, h, rad) { ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); }
function fitSprite(ctx, key, cx, cy, box) { const im = img(key); if (!im || !im.complete || !im.naturalWidth) return; const s = box / Math.max(im.naturalWidth, im.naturalHeight); ctx.drawImage(im, cx - im.naturalWidth * s / 2, cy - im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s); }

export function draw(ctx) {
	ctx.fillStyle = '#141f1a'; ctx.fillRect(0, 0, W, H);
	if (!S) return;
	// level badge + HUD
	text(ctx, `Level ${S.level}`, W / 2, 20, { size: 20, align: 'center' });
	fitSprite(ctx, 'star', 32, 32, 24); text(ctx, String(G.starCount), 54, 26, { size: 16 });
	fitSprite(ctx, 'berry', 32, 62, 24); text(ctx, String(Math.floor(G.berryCount)), 54, 56, { size: 16 });
	// hearts
	for (let i = 0; i < 15; i++) { const full = S.hearts - i; if (full <= 0) break; const hx = 20 + i * 42; if (full >= 1) fitSprite(ctx, 'heart', hx + 16, 548 + 16, 32); else { ctx.save(); ctx.beginPath(); ctx.rect(hx, 548, 16, 32); ctx.clip(); fitSprite(ctx, 'heart', hx + 16, 548 + 16, 32); ctx.restore(); } }
	// charm slots
	for (let i = 0; i < 4; i++) { const r = SLOT(i); ctx.fillStyle = 'rgba(20,30,24,0.85)'; rr(ctx, r[0], r[1], r[2], r[3], 10); ctx.fill(); const ch = S.charm.inventory[i]; if (ch) fitSprite(ctx, ch.id, r[0] + 37, r[1] + 37, 54); else text(ctx, 'Empty', r[0] + 37, r[1] + 37, { size: 12, align: 'center', baseline: 'middle', color: '#5a6a5f' }); }
	// cards
	for (const c of S.cards) drawCard(ctx, c);
	// close X
	ctx.fillStyle = '#7f2626'; rr(ctx, 744, 20, 36, 36, 6); ctx.fill();
	ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(753, 29); ctx.lineTo(771, 47); ctx.moveTo(771, 29); ctx.lineTo(753, 47); ctx.stroke();
	// overlays
	if (S.gameOver) drawPanel(ctx, 'Game Over', 'Out of hearts!', 'Try Again');
	else if (S.runCompleted) drawPanel(ctx, 'Harvest Complete!', 'You cleared every level!', 'Play Again');
	else if (S.levelClearing) { if (S.levelShopOpen) drawShop(ctx); else drawLevelComplete(ctx); }
	// dragging charm follows the cursor
	if (S.shop.dragging) fitSprite(ctx, S.shop.dragging.charm.id, G.cursor.x, G.cursor.y, 64);
}
function drawCard(ctx, c) {
	const a = 1 - c.vanish; if (a <= 0.02) return;
	const scaleX = Math.abs(Math.cos(c.flip * Math.PI));
	const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
	ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(Math.max(0.02, scaleX), 1); ctx.translate(-cx, -cy);
	ctx.fillStyle = '#293e33'; rr(ctx, c.x, c.y, c.w, c.h, 14); ctx.fill();
	ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.stroke();
	const front = c.flip >= 0.5 || c.matched;
	if (front) {
		fitSprite(ctx, c.fruit, cx, cy, Math.min(c.w, c.h) * 0.65);
		// condition badges bottom-right
		let bx = c.x + c.w - c.w * 0.14, by = c.y + c.h - c.w * 0.14;
		for (const cond of ['special', 'juicy', 'golden', 'fresh', 'sticky', 'rotten', 'tart', 'flutter']) if (has(c, cond)) { fitSprite(ctx, COND_ICON[cond], bx, by, c.w * 0.22); by -= c.w * 0.22 + 3; }
	} else fitSprite(ctx, 'flowercursor', cx, cy, Math.min(c.w, c.h) * 0.5);
	ctx.restore();
	if (c.pop) { c.pop.t += 1 / 60; const rise = 26 * Math.min(1, c.pop.t / 0.9); ctx.globalAlpha = Math.max(0, 1 - c.pop.t / 0.9); text(ctx, c.pop.txt, cx, c.y - 6 - rise, { size: 16, align: 'center', color: '#ffe27a' }); ctx.globalAlpha = 1; if (c.pop.t >= 0.9) c.pop = null; }
}
function drawPanel(ctx, title, msg, btn) {
	ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = 'rgba(18,32,26,0.97)'; rr(ctx, OVERLAY[0], OVERLAY[1], OVERLAY[2], OVERLAY[3], 16); ctx.fill();
	text(ctx, title, W / 2, OVERLAY[1] + 60, { size: 34, align: 'center' });
	text(ctx, msg, W / 2, OVERLAY[1] + 120, { size: 16, align: 'center', color: '#bcd' });
	button(ctx, OVERLAY_BTN, btn);
}
function drawLevelComplete(ctx) {
	ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = 'rgba(18,32,26,0.97)'; rr(ctx, OVERLAY[0], OVERLAY[1], OVERLAY[2], OVERLAY[3], 16); ctx.fill();
	text(ctx, `Level ${S.level} Complete!`, W / 2, OVERLAY[1] + 60, { size: 30, align: 'center' });
	const nf = NEXT_FRUIT[S.level]; if (nf) text(ctx, `Added 2 ${nf} to your deck.`, W / 2, OVERLAY[1] + 116, { size: 16, align: 'center', color: '#bcd' });
	button(ctx, OVERLAY_BTN, S.level >= MAX_LEVEL ? 'Finish Run' : 'Next');
}
function drawShop(ctx) {
	ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = 'rgba(18,32,26,0.97)'; rr(ctx, OVERLAY[0], OVERLAY[1], OVERLAY[2], OVERLAY[3], 16); ctx.fill();
	text(ctx, 'Level Shop', OVERLAY[0] + 20, OVERLAY[1] + 30, { size: 26 });
	text(ctx, 'Buy charms & conditions. Drag a charm onto Sell for Berries.', OVERLAY[0] + 20, OVERLAY[1] + 98, { size: 13, color: '#9fb0a6' });
	for (let i = 0; i < 4; i++) {
		const r = shopSlotRect(i), o = S.shop.offers[i];
		ctx.fillStyle = 'rgba(30,46,38,0.9)'; rr(ctx, r[0], r[1], r[2], r[3], 10); ctx.fill();
		ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
		if (!o) { text(ctx, 'Sold', r[0] + r[2] / 2, r[1] + r[3] / 2, { size: 14, align: 'center', baseline: 'middle', color: '#7a8a7f' }); continue; }
		if (o.kind === 'sell') { text(ctx, 'SELL', r[0] + r[2] / 2, r[1] + r[3] / 2 - 8, { size: 18, align: 'center', baseline: 'middle', color: '#e0b060' }); text(ctx, 'drop a charm here', r[0] + r[2] / 2, r[1] + r[3] / 2 + 14, { size: 11, align: 'center', baseline: 'middle', color: '#9fb0a6' }); continue; }
		if (o.kind === 'charm') { fitSprite(ctx, o.id, r[0] + r[2] - 26, r[1] + 26, r[2] * 0.26); text(ctx, CHARMS[o.id].name, r[0] + 10, r[1] + 10, { size: 14 }); wrap(ctx, CHARMS[o.id].desc, r[0] + 10, r[1] + 32, r[2] - 20, 14, 11, '#aeb9b0'); }
		else { fitSprite(ctx, COND_ICON[o.cond], r[0] + r[2] - 26, r[1] + 26, r[2] * 0.26); text(ctx, `${cap(o.cond)} → ${cap(o.fruit)}`, r[0] + 10, r[1] + 10, { size: 14 }); }
		fitSprite(ctx, 'berry', r[0] + 20, r[1] + r[3] - 18, 22); text(ctx, String(o.cost), r[0] + 36, r[1] + r[3] - 24, { size: 14, color: G.berryCount >= o.cost ? '#fff' : '#c88' });
	}
	button(ctx, SHOP_NEXT, S.level >= MAX_LEVEL ? 'Finish' : 'Next Level');
}
function button(ctx, r, label) { ctx.fillStyle = '#347348'; rr(ctx, r[0], r[1], r[2], r[3], 10); ctx.fill(); text(ctx, label, r[0] + r[2] / 2, r[1] + r[3] / 2, { size: 18, align: 'center', baseline: 'middle' }); }
function wrap(ctx, str, x, y, maxW, lh, size, color) { ctx.font = `${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; let line = '', yy = y; for (const w of str.split(' ')) { if (ctx.measureText(line + w + ' ').width > maxW && line) { ctx.fillText(line, x, yy); line = w + ' '; yy += lh; } else line += w + ' '; } ctx.fillText(line, x, yy); }

export function dbg() { return S; }
