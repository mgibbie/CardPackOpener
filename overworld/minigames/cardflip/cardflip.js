// cardflip.js — Crystal's CARD FLIP (pokecrystal engine/games/card_flip.asm),
// the Game Corner card table behind `special CardFlip` (Goldenrod, and Celadon
// in JohKanto). A port of the decomp's own jumptable on the decomp's own tiles:
// bg.png / obj.png / cardflip.json are made by tools/gen_cardflip_gfx.py from
// gfx/card_flip (+ the font and frame the game loads beside them), and the
// 160x144 screen is composed tile by tile — BG attrs, the 9 CGB palettes and
// the cursor's OAM shapes (with their BG-priority bit) as the game has them.
//
// The deck is 24 cards: card = (level-1)*4 + mon (0 PIKACHU, 1 JIGGLYPUFF,
// 2 POLIWAG, 3 ODDISH), levels 1-6. Each game deals two cards face down from
// the deck (wDeck[2n], wDeck[2n+1]); you pick one by stopping the flashing
// border, bet on the 8x6 grid, and the card turns. 12 games use the deck up,
// then it is reshuffled. A game costs 3 coins; the payouts are the decomp's:
//   mon pair (2 of 4)  x6     one mon   x12    level pair  x9
//   one level          x18    one exact card            x72
import * as Bag from '../../bag.js';
import { sfx } from '../../sound.js';
import { payoutFor } from './rules.js';

const W = 20, H = 18;            // SCREEN_WIDTH x SCREEN_HEIGHT in tiles
const DECK_SIZE = 24;            // CARDFLIP_DECK_SIZE
const MAX_COINS = 9999;
const LAMP_OFF = 0xef, LAMP_ON = 0xf5, GREEN = 0x29;
const OAM_XFLIP = 0x20, OAM_YFLIP = 0x40, OAM_PRIO = 0x80;

export const cardFlip = {
	open: false,
	rng: null,          // () => 0..255 (tests seed it); defaults to Math.random
	onExit: null,
	// live state, readable by tests: the decomp's wram names
	deck: new Array(DECK_SIZE).fill(0), discard: new Array(DECK_SIZE).fill(0),
	numPlayed: 0, which: 0, faceUp: -1, cursorY: 2, cursorX: 2,
	phase: 'off',       // AskPlayWithThree / DeductCoins / ChooseACard / PlaceYourBet / CheckTheCard / TabulateTheResult / PlayAgain / Quit
	text: '',           // the textbox's current text
	lastPayout: 0,
};

// ---------- the decomp's data ----------
const FACE_DOWN = [
	[0x08, 0x09, 0x09, 0x09, 0x0a],
	[0x0b, 0x28, 0x2b, 0x28, 0x0c],
	[0x0b, 0x2c, 0x2d, 0x2e, 0x0c],
	[0x0b, 0x2f, 0x30, 0x31, 0x0c],
	[0x0b, 0x32, 0x33, 0x34, 0x0c],
	[0x0d, 0x0e, 0x0e, 0x0e, 0x0f],
];
const FACE_UP = [
	[0x18, 0x19, 0x19, 0x19, 0x1a],
	[0x1b, 0x35, 0x7f, 0x7f, 0x1c],
	[0x0b, 0x28, 0x28, 0x28, 0x0c],
	[0x0b, 0x28, 0x28, 0x28, 0x0c],
	[0x0b, 0x28, 0x28, 0x28, 0x0c],
	[0x1d, 0x1e, 0x1e, 0x1e, 0x1f],
];
const PIC_ANCHOR = [0x4e, 0x57, 0x69, 0x60]; // .Deck: Pikachu, Jigglypuff, Poliwag, Oddish (3x3)

// sprite shapes: [x tile, y tile, x px, y px, tile, attr] (dbsprite)
const S_ = (tx, ty, px, py, t, a) => [tx, ty, px, py, t, a];
const CARD_BORDER = [
	S_(0, 0, 0, 0, 4, 0), S_(1, 0, 0, 0, 6, 0), S_(2, 0, 0, 0, 6, 0), S_(3, 0, 0, 0, 6, 0), S_(4, 0, 0, 0, 4, OAM_XFLIP),
	...[1, 2, 3, 4].flatMap(y => [S_(0, y, 0, 0, 5, 0), S_(4, y, 0, 0, 5, OAM_XFLIP)]),
	S_(0, 5, 0, 0, 4, OAM_YFLIP), S_(1, 5, 0, 0, 6, OAM_YFLIP), S_(2, 5, 0, 0, 6, OAM_YFLIP), S_(3, 5, 0, 0, 6, OAM_YFLIP),
	S_(4, 5, 0, 0, 4, OAM_XFLIP | OAM_YFLIP),
];
const P = OAM_PRIO;
const SHAPES = {
	SingleTile: [
		S_(-1, 0, 7, 0, 0, P), S_(0, 0, 0, 0, 2, P), S_(1, 0, 0, 0, 3, P),
		S_(-1, 0, 7, 5, 0, OAM_YFLIP | P), S_(0, 0, 0, 5, 2, OAM_YFLIP | P), S_(1, 0, 0, 5, 3, P),
	],
	PokeGroup: [
		S_(-1, 0, 7, 0, 0, P), S_(0, 0, 0, 0, 2, P), S_(1, 0, 0, 0, 0, OAM_XFLIP | P),
		S_(-1, 1, 7, 0, 1, P), S_(1, 1, 0, 0, 1, OAM_XFLIP | P),
		...[2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap(y => [S_(-1, y, 7, 0, 1, P), S_(1, y, 0, 0, 3, P)]),
		S_(-1, 10, 7, 1, 0, OAM_YFLIP | P), S_(0, 10, 0, 1, 2, OAM_YFLIP | P), S_(1, 10, 0, 1, 3, P),
	],
	NumGroup: [
		S_(-1, 0, 7, 0, 0, P), S_(0, 0, 0, 0, 2, P), S_(1, 0, 0, 0, 2, P),
		...[2, 3, 4, 5, 6, 7, 8].map(x => S_(x, 0, 0, 0, x % 2 ? 2 : 3, P)),
		S_(-1, 0, 7, 5, 0, OAM_YFLIP | P), S_(0, 0, 0, 5, 2, OAM_YFLIP | P), S_(1, 0, 0, 5, 2, OAM_YFLIP | P),
		...[2, 3, 4, 5, 6, 7, 8].map(x => S_(x, 0, 0, 5, x % 2 ? 2 : 3, x % 2 ? OAM_YFLIP | P : P)),
	],
	NumGroupPair: [
		S_(0, 0, 0, 0, 0, P), S_(1, 0, 0, 0, 2, P), S_(2, 0, 0, 0, 2, P),
		...[3, 4, 5, 6, 7, 8, 9].map(x => S_(x, 0, 0, 0, x % 2 ? 3 : 2, P)),
		...[1, 2].flatMap(y => [S_(0, y, 0, 0, 1, P), ...[3, 5, 7, 9].map(x => S_(x, y, 0, 0, 3, P))]),
		S_(0, 2, 0, 1, 0, OAM_YFLIP | P), S_(1, 2, 0, 1, 2, OAM_YFLIP | P), S_(2, 2, 0, 1, 2, OAM_YFLIP | P),
		...[3, 4, 5, 6, 7, 8, 9].map(x => S_(x, 2, 0, 1, 3, P)),
	],
	PokeGroupPair: [
		...[0, 1, 2].flatMap(y => [S_(-1, y, 7, 0, y ? 1 : 0, P), S_(3, y, 0, 0, y ? 1 : 0, OAM_XFLIP | P)]),
		...[3, 4, 5, 6, 7, 8, 9, 10, 11].flatMap(y => [S_(-1, y, 7, 0, 1, P), S_(1, y, 0, 0, 3, P), S_(3, y, 0, 0, 3, P)]),
		S_(-1, 11, 7, 1, 0, OAM_YFLIP | P), S_(0, 11, 0, 1, 2, OAM_YFLIP | P), S_(1, 11, 0, 1, 3, OAM_YFLIP | P),
		S_(2, 11, 0, 1, 2, OAM_YFLIP | P), S_(3, 11, 0, 1, 3, OAM_XFLIP | OAM_YFLIP | P),
	],
	Impossible: [
		S_(0, 0, 0, 0, 0, P), S_(1, 0, 0, 0, 0, OAM_XFLIP | P),
		S_(0, 1, 0, 0, 0, OAM_YFLIP | P), S_(1, 1, 0, 0, 0, OAM_XFLIP | OAM_YFLIP | P),
	],
};
// CardFlip_UpdateCursorOAM.OAMData, row-major by CollapseCursorPosition (y*6+x):
// [x tile, y tile, x px, y px, shape]
const C_ = (tx, ty, a, b, c) => (c === undefined ? [tx, ty, 0, 0, a] : [tx, ty, a, b, c]);
const CURSOR = [
	C_(11, 2, 'Impossible'), C_(12, 2, 'Impossible'), C_(13, 2, 'PokeGroupPair'), C_(13, 2, 'PokeGroupPair'), C_(17, 2, 'PokeGroupPair'), C_(17, 2, 'PokeGroupPair'),
	C_(11, 3, 'Impossible'), C_(12, 3, 'Impossible'), C_(13, 3, 'PokeGroup'), C_(15, 3, 'PokeGroup'), C_(17, 3, 'PokeGroup'), C_(19, 3, 'PokeGroup'),
];
for (let row = 0; row < 6; row++) {
	const ty = 5 + 3 * (row >> 1) + (row & 1), dy = row & 1 ? 4 : 0;
	CURSOR.push(C_(11, 5 + 3 * (row >> 1), 'NumGroupPair'));
	CURSOR.push(row & 1 ? C_(12, ty, 0, dy, 'NumGroup') : C_(12, ty, 'NumGroup'));
	for (const tx of [13, 15, 17, 19]) CURSOR.push(row & 1 ? C_(tx, ty, 0, dy, 'SingleTile') : C_(tx, ty, 'SingleTile'));
}

// ---------- graphics ----------
let gfx = null;     // { bg: Uint8Array(256*64), obj: Uint8Array, board, pals: [[[r,g,b]x4]x9] }
let gfxLoading = null;
async function decodeGray(url) {
	const img = new Image();
	img.src = url;
	await img.decode();
	const c = document.createElement('canvas');
	c.width = img.width; c.height = img.height;
	const x = c.getContext('2d');
	x.drawImage(img, 0, 0);
	const d = x.getImageData(0, 0, img.width, img.height).data;
	const tilesW = img.width / 8, n = tilesW * (img.height / 8);
	const out = new Uint8Array(n * 64);
	for (let t = 0; t < n; t++) for (let y = 0; y < 8; y++) for (let xx = 0; xx < 8; xx++) {
		const px = ((Math.floor(t / tilesW) * 8 + y) * img.width + (t % tilesW) * 8 + xx) * 4;
		out[t * 64 + y * 8 + xx] = 3 - Math.round(d[px] / 85);   // 255->0 170->1 85->2 0->3
	}
	return out;
}
export function loadGfx() {
	if (gfx) return Promise.resolve(gfx);
	if (!gfxLoading) {
		const u = f => new URL(f, import.meta.url).href;
		gfxLoading = Promise.all([decodeGray(u('bg.png')), decodeGray(u('obj.png')), fetch(u('cardflip.json')).then(r => r.json())])
			.then(([bg, obj, meta]) => {
				gfx = { bg, obj, board: meta.board, pals: meta.palettes.map(p => p.map(c => c.map(v => Math.round(v * 255 / 31)))) };
				return gfx;
			})
			.catch(e => { gfxLoading = null; throw e; });
	}
	return gfxLoading;
}

// ---------- the screen (wTilemap / wAttrmap / OAM) ----------
const tilemap = new Uint8Array(W * H).fill(GREEN);
const attrmap = new Uint8Array(W * H);
let oam = [];       // [screenX, screenY, tile, attr]
const put = (x, y, t) => { if (x >= 0 && x < W && y >= 0 && y < H) tilemap[y * W + x] = t; };
const fillBox = (x, y, h, w, t, map = tilemap) => { for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) map[(y + r) * W + x + c] = t; };
const copyBox = (x, y, rows) => rows.forEach((row, r) => row.forEach((t, c) => put(x + c, y + r, t)));
const CHAR = ch => {
	if (ch >= 'A' && ch <= 'Z') return 0x80 + ch.charCodeAt(0) - 65;
	if (ch >= 'a' && ch <= 'z') return 0xa0 + ch.charCodeAt(0) - 97;
	if (ch >= '0' && ch <= '9') return 0xf6 + ch.charCodeAt(0) - 48;
	return { '…': 0x75, '.': 0xe8, '?': 0xe6, '!': 0xe7, ',': 0xf4, '▶': 0xed, '▼': 0xee, '-': 0xe3, "'": 0xe0 }[ch] ?? 0x7f;
};
const placeString = (x, y, s) => [...s].forEach((ch, i) => put(x + i, y, CHAR(ch)));
// Textbox: a frame around an inner h x w box at (x, y)
function textbox(x, y, h, w) {
	put(x, y, 0x79); for (let c = 1; c <= w; c++) put(x + c, y, 0x7a); put(x + w + 1, y, 0x7b);
	for (let r = 1; r <= h; r++) { put(x, y + r, 0x7c); for (let c = 1; c <= w; c++) put(x + c, y + r, 0x7f); put(x + w + 1, y + r, 0x7c); }
	put(x, y + h + 1, 0x7d); for (let c = 1; c <= w; c++) put(x + c, y + h + 1, 0x7a); put(x + w + 1, y + h + 1, 0x7e);
}

// ---------- frame timing + input ----------
let session = 0;          // bumps on close, so a stale coroutine stops
let keyQueue = [];
let keyWaiter = null;
class Abort extends Error {}
const frames = n => new Promise((res, rej) => {
	const s = session;
	setTimeout(() => (s === session ? res() : rej(new Abort())), Math.round(n * 1000 / 60));
});
// hJoyLast: the next fresh press (consumed), or null after a frame
function joyLast() { return keyQueue.shift() || null; }
async function waitButton(set) {
	for (;;) {
		const k = joyLast();
		if (k && set.includes(k)) return k;
		await frames(1);
	}
}
const KEYMAP = { z: 'A', Enter: 'A', ' ': 'A', x: 'B', Escape: 'B', Backspace: 'B', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT' };
export function cardFlipKey(k) {
	const b = KEYMAP[k];
	if (b && cardFlip.open) keyQueue.push(b);
}

// ---------- the game's routines ----------
const rand = () => (cardFlip.rng ? cardFlip.rng() : Math.floor(Math.random() * 256)) & 0xff;
function shuffleDeck() {
	const deck = new Array(DECK_SIZE).fill(0);
	for (let c = DECK_SIZE - 1; c > 0;) {
		const a = rand() & 0x1f;
		if (a >= DECK_SIZE || deck[a]) continue;
		deck[a] = c--;
	}
	cardFlip.deck = deck;
	cardFlip.numPlayed = 0;
	cardFlip.discard = new Array(DECK_SIZE).fill(0);
}
function initTilemap() {
	tilemap.fill(GREEN);
	copyBox(9, 0, gfx.board);
	textbox(0, 12, 4, 18);
}
function initAttrPals() {
	attrmap.fill(0);
	fillBox(12, 1, 2, 2, 1, attrmap); fillBox(14, 1, 2, 2, 2, attrmap);
	fillBox(16, 1, 2, 2, 3, attrmap); fillBox(18, 1, 2, 2, 4, attrmap);
	fillBox(9, 0, 12, 1, 1, attrmap);
}
function printCoinBalance() {
	textbox(9, 15, 1, 9);
	placeString(10, 16, 'COIN');
	placeString(15, 16, String(Math.min(9999, Bag.getCoins())).padStart(4, '0'));
}
// PrintTextboxText into the (0,12) box; `prompt` text waits for A/B on a blinking ▼
async function showText(text, prompt = false) {
	cardFlip.text = text;
	textbox(0, 12, 4, 18);
	text.split('\n').forEach((line, i) => placeString(1, 14 + 2 * i, line));
	if (prompt) await blinkWait();
	printCoinBalance();
}
async function blinkWait() {
	const under = tilemap[17 * W + 18];
	let t = 0;
	try {
		for (;;) {
			put(18, 17, (t++ >> 4) % 2 ? under : 0xee);
			const k = joyLast();
			if (k === 'A' || k === 'B') return k;
			await frames(1);
		}
	} finally { put(18, 17, under); }
}
// YesNoBox at (14,7): A on YES = yes; A on NO or B = no
async function yesNo() {
	const saved = tilemap.slice();
	textbox(14, 7, 3, 4);
	placeString(16, 8, 'YES'); placeString(16, 10, 'NO');
	let idx = 0;
	try {
		for (;;) {
			put(15, 8, idx === 0 ? 0xed : 0x7f); put(15, 10, idx === 1 ? 0xed : 0x7f);
			const k = joyLast();
			if (k === 'UP' && idx) { idx = 0; sfx('ui_move'); }
			else if (k === 'DOWN' && !idx) { idx = 1; sfx('ui_move'); }
			else if (k === 'A') { sfx('ui_select'); await frames(15); return idx === 0; }
			else if (k === 'B') { sfx('ui_cancel'); await frames(15); return false; }
			await frames(1);
		}
	} finally { tilemap.set(saved); }
}
const chosenCoords = () => (cardFlip.which ? { x: 2, y: 6, px: 16, py: 48 } : { x: 2, y: 0, px: 16, py: 0 });
function placeCardBorder() {
	const { px, py } = chosenCoords();
	oam = CARD_BORDER.map(([tx, ty, ox, oy, t, a]) => [px + tx * 8 + ox, py + ty * 8 + oy, t, a]);
}
function updateCursorOAM() {
	const [tx, ty, ox, oy, shape] = CURSOR[cardFlip.cursorY * 6 + cardFlip.cursorX];
	const bx = tx * 8 + ox - 8, by = ty * 8 + oy - 16;   // dbpixel is OAM space
	oam = SHAPES[shape].map(([sx, sy, px, py, t, a]) => [bx + sx * 8 + px, by + sy * 8 + py, t, a]);
}
function displayCardFaceUp() {
	const { x, y } = chosenCoords();
	const card = cardFlip.faceUp;
	copyBox(x, y, FACE_UP);
	put(x + 3, y + 1, CHAR(String((card >> 2) + 1)));
	let t = PIC_ANCHOR[card & 3];
	for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) put(x + 1 + c, y + 2 + r, t++);
	fillBox(x, y, 6, 5, (card & 3) + 1, attrmap);
}
function blankDiscardedCardSlot() {
	const e = cardFlip.faceUp, col = 13 + 2 * (e & 3), lvl = e >> 2, d = cardFlip.discard;
	switch (lvl) {
		case 0: put(col, 3, 0x36); put(col, 4, d[e + 4] ? 0x3d : 0x37); break;
		case 1: put(col, 4, d[e - 4] ? 0x3d : 0x3b); put(col, 5, 0x3a); break;
		case 2: put(col, 6, 0x36); put(col, 7, d[e + 4] ? 0x3d : 0x38); break;
		case 3: put(col, 7, d[e - 4] ? 0x3d : 0x3c); put(col, 8, 0x3a); break;
		case 4: put(col, 9, 0x36); put(col, 10, d[e + 4] ? 0x3d : 0x39); break;
		case 5: put(col, 10, d[e - 4] ? 0x3d : 0x3c); put(col, 11, 0x3a); break;
	}
}
// ChooseCard_HandleJoypad
function handleJoypad(k) {
	const f = cardFlip;
	let moved = false;
	const toNumGroup = () => { f.cursorY = 2; f.cursorX = 1; moved = true; };
	const toMonGroup = () => { f.cursorY = 1; f.cursorX = 2; moved = true; };
	if (k === 'LEFT') {
		if (f.cursorY === 0) { f.cursorX &= 0xe; if (f.cursorX < 3) toNumGroup(); else { f.cursorX -= 2; moved = true; } }
		else if (f.cursorY === 1) { if (f.cursorX < 3) toNumGroup(); else { f.cursorX--; moved = true; } }
		else if (f.cursorX) { f.cursorX--; moved = true; }
	} else if (k === 'RIGHT') {
		if (f.cursorY === 0) { f.cursorX &= 0xe; if (f.cursorX < 4) { f.cursorX += 2; moved = true; } }
		else if (f.cursorX < 5) { f.cursorX++; moved = true; }
	} else if (k === 'UP') {
		if (f.cursorX === 0) { f.cursorY &= 0xe; if (f.cursorY < 3) toMonGroup(); else { f.cursorY -= 2; moved = true; } }
		else if (f.cursorX === 1) { if (f.cursorY < 3) toMonGroup(); else { f.cursorY--; moved = true; } }
		else if (f.cursorY) { f.cursorY--; moved = true; }
	} else if (k === 'DOWN') {
		if (f.cursorX === 0) { f.cursorY &= 0xe; if (f.cursorY < 6) { f.cursorY += 2; moved = true; } }
		else if (f.cursorY < 7) { f.cursorY++; moved = true; }
	}
	if (moved) sfx('ui_move');   // SFX_POKEBALLS_PLACED_ON_TABLE
}

async function game() {
	const f = cardFlip;
	initTilemap();
	initAttrPals();
	f.cursorY = 2; f.cursorX = 2;
	let idx = 0;
	for (;;) {
		switch (idx) {
			case 0: // .AskPlayWithThree
				f.phase = 'AskPlayWithThree';
				await showText('Play with three\ncoins?');
				if (!(await yesNo())) { idx = 7; break; }
				shuffleDeck();
				idx = 1; break;
			case 1: // .DeductCoins
				f.phase = 'DeductCoins';
				if (Bag.getCoins() < 3) { await showText('Not enough coins…', true); idx = 7; break; }
				Bag.spendCoins(3);
				sfx('money');           // SFX_TRANSACTION
				printCoinBalance();
				await frames(20);
				idx = 2; break;
			case 2: { // .ChooseACard
				f.phase = 'ChooseACard';
				fillBox(0, 0, 12, 9, GREEN);
				put(9, f.numPlayed, LAMP_ON);
				await frames(20);
				copyBox(2, 0, FACE_DOWN);
				await frames(20);
				copyBox(2, 6, FACE_DOWN);
				await showText('Choose a card.');
				f.which = 0;
				keyQueue = [];
				for (;;) {      // the border flashes between the cards until A
					await frames(1);
					if (joyLast() === 'A') break;
					sfx('ui_move');     // SFX_KINESIS
					placeCardBorder();
					await frames(4);
					f.which ^= 1;
				}
				sfx('ui_select');       // SFX_SLOT_MACHINE_START
				for (let i = 0; i < 3; i++) { placeCardBorder(); await frames(4); oam = []; await frames(4); }
				const keep = f.which;
				f.which ^= 1;
				const o = chosenCoords();
				fillBox(o.x, o.y, 6, 5, GREEN);
				f.which = keep;
				idx = 3; break;
			}
			case 3: // .PlaceYourBet
				f.phase = 'PlaceYourBet';
				await showText('Place your bet.');
				keyQueue = [];
				for (;;) {
					const k = joyLast();
					if (k === 'A') break;
					if (k) handleJoypad(k);
					updateCursorOAM();
					await frames(1);
				}
				idx = 4; break;
			case 4: // .CheckTheCard
				f.phase = 'CheckTheCard';
				updateCursorOAM();
				sfx('ui_select');       // SFX_CHOOSE_A_CARD
				await frames(15);
				f.faceUp = f.deck[2 * f.numPlayed + f.which];
				f.discard[f.faceUp] = 1;
				displayCardFaceUp();
				idx = 5; break;
			case 5: { // .TabulateTheResult
				f.phase = 'TabulateTheResult';
				const pay = payoutFor(f.cursorY, f.cursorX, f.faceUp);
				f.lastPayout = pay;
				if (!pay) {
					sfx('ui_denied');   // SFX_WRONG
					await showText('Darn…');
				} else {
					await showText('Yeah!');
					sfx('levelup');     // SFX_2ND_PLACE
					await frames(30);
					for (let i = 0; i < pay; i++) {
						if (Bag.getCoins() < MAX_COINS) { Bag.addCoins(1); if (i % 4 === 0) sfx('money'); }  // SFX_PAY_DAY
						printCoinBalance();
						await frames(2);
					}
				}
				await blinkWait();
				idx = 6; break;
			}
			case 6: // .PlayAgain
				f.phase = 'PlayAgain';
				oam = [];
				await showText('Want to play\nagain?');
				if (!(await yesNo())) { idx = 7; break; }
				f.numPlayed++;
				if (f.numPlayed >= 12) {
					initTilemap();
					shuffleDeck();
					await showText('The cards have\nbeen shuffled.', true);
				} else {
					blankDiscardedCardSlot();
				}
				idx = 1; break;
			default: // .Quit
				f.phase = 'Quit';
				sfx('ui_cancel');       // SFX_QUIT_SLOTS
				await frames(10);
				return;
		}
	}
}

// open the table; resolves when the player leaves. onExit runs on close.
export async function startCardFlip(onExit) {
	await loadGfx();
	session++;
	keyQueue = [];
	oam = [];
	Object.assign(cardFlip, { open: true, onExit, text: '', phase: 'start', faceUp: -1, lastPayout: 0 });
	const me = session;
	try { await game(); } catch (e) { if (!(e instanceof Abort)) console.warn('[cardflip]', e); }
	if (me !== session) return;
	closeCardFlip();
}
export function closeCardFlip() {
	if (!cardFlip.open) return;
	session++;
	cardFlip.open = false;
	cardFlip.phase = 'off';
	oam = [];
	const cb = cardFlip.onExit;
	cardFlip.onExit = null;
	cb?.();
}

// ---------- draw: compose the 160x144 screen and scale it onto the canvas ----------
let screenCanvas = null, screenImg = null;
const bgIdx = new Uint8Array(160 * 144);
export function drawCardFlip(sctx, SW, SH) {
	sctx.fillStyle = '#000';
	sctx.fillRect(0, 0, SW, SH);
	if (!gfx) return;
	if (!screenCanvas) {
		screenCanvas = document.createElement('canvas');
		screenCanvas.width = 160; screenCanvas.height = 144;
		screenImg = screenCanvas.getContext('2d').createImageData(160, 144);
	}
	const px = screenImg.data, pals = gfx.pals;
	for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
		const t = tilemap[ty * W + tx], pal = pals[attrmap[ty * W + tx] & 7];
		for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
			const ci = gfx.bg[t * 64 + y * 8 + x], p = (ty * 8 + y) * 160 + tx * 8 + x;
			bgIdx[p] = ci;
			const c = pal[ci];
			px[p * 4] = c[0]; px[p * 4 + 1] = c[1]; px[p * 4 + 2] = c[2]; px[p * 4 + 3] = 255;
		}
	}
	const opal = pals[8];
	for (const [sx, sy, t, a] of oam) {
		for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
			const X = sx + x, Y = sy + y;
			if (X < 0 || X >= 160 || Y < 0 || Y >= 144) continue;
			const ci = gfx.obj[t * 64 + (a & OAM_YFLIP ? 7 - y : y) * 8 + (a & OAM_XFLIP ? 7 - x : x)];
			if (!ci) continue;
			const p = Y * 160 + X;
			if ((a & OAM_PRIO) && bgIdx[p]) continue;   // behind BG colours 1-3
			const c = opal[ci];
			px[p * 4] = c[0]; px[p * 4 + 1] = c[1]; px[p * 4 + 2] = c[2];
		}
	}
	screenCanvas.getContext('2d').putImageData(screenImg, 0, 0);
	const k = Math.min(SW / 160, SH / 144);
	const w = Math.floor(160 * k), h = Math.floor(144 * k);
	sctx.save();
	sctx.imageSmoothingEnabled = false;
	sctx.drawImage(screenCanvas, Math.floor((SW - w) / 2), Math.floor((SH - h) / 2), w, h);
	sctx.restore();
}
// test/diagnostic view of the tilemap
export const cardFlipTilemap = () => Array.from(tilemap);
