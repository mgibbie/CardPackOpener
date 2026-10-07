// unown_puzzle.js — the Ruins of Alph UNOWN PUZZLE (`special UnownPuzzle`),
// ported from pokecrystal engine/games/unown_puzzle.asm with its own graphics
// (gfx/unown_puzzle/ -> overworld/minigames/unown/).
//
// The 160x144 screen is rebuilt tile for tile: a 6x6 grid of 3x3-tile slots, the
// inner 4x4 is the picture's frame, and the 16 pieces start scattered at random
// on the 16 border slots the cursor can reach (the bottom row's middle is the
// START > CANCEL box). A picks a piece up / puts it down on an empty slot; START
// quits (B too here — the GB ignores it). The pieces are the decomp's 48x48
// picture doubled to 96x96 and cut 4x4, with tile_borders OR'd onto each piece's
// edge tiles, exactly as ConvertLoadedPuzzlePieces builds them in VRAM. Solving
// it plays the fanfare, waits for A/B, and answers TRUE in the script var, so
// the map script's `iftrue .PuzzleComplete` opens the floor.
import { getImage } from './engine.js';
import * as Story from './events.js';
import { sctx } from './ow_core.js';
import { sfx } from './sound.js';

export const PUZZLES = ['kabuto', 'omanyte', 'aerodactyl', 'hooh'];   // UNOWNPUZZLE_* order
// .PuzzlePieceInitialPositions: the 16 reachable border slots (row * 6 + col)
const INITIAL = [0, 1, 2, 3, 4, 5, 6, 11, 12, 17, 18, 23, 24, 29, 30, 35];
const at = (r, c) => r * 6 + c;

export const unownPuzzle = { open: false, which: 0, pieces: new Array(36).fill(0), cursor: 0, held: 0, solved: false, onDone: null, started: 0 };

// InitUnownPuzzlePiecePositions: piece c (1..16) goes to a random free initial slot
export function initPieces(rand = Math.random) {
	const p = new Array(36).fill(0);
	for (let c = 1; c <= 16; c++) {
		let s;
		do s = INITIAL[Math.floor(rand() * 16) & 15]; while (p[s]);
		p[s] = c;
	}
	return p;
}
// CheckSolvedUnownPuzzle: pieces 1..16 in reading order in the inner 4x4, all else empty
export function isSolved(p) {
	for (let i = 0; i < 36; i++) {
		const r = Math.floor(i / 6), c = i % 6;
		const want = r >= 1 && r <= 4 && c >= 1 && c <= 4 ? (r - 1) * 4 + c : 0;
		if (p[i] !== want) return false;
	}
	return true;
}
// UnownPuzzleJumptable's d-pad, rule for rule (the START > CANCEL box blocks the
// bottom row's middle; left/right on that row jump across it)
export function moveCursor(pos, dir) {
	if (dir === 'up') return pos < at(1, 0) ? pos : pos - 6;
	if (dir === 'down') {
		if ([at(4, 1), at(4, 2), at(4, 3), at(4, 4)].includes(pos) || pos >= at(5, 0)) return pos;
		return pos + 6;
	}
	if (dir === 'left') {
		if (pos % 6 === 0) return pos;
		return pos === at(5, 5) ? at(5, 0) : pos - 1;
	}
	if (dir === 'right') {
		if (pos % 6 === 5) return pos;
		return pos === at(5, 0) ? at(5, 5) : pos + 1;
	}
	return pos;
}

// ---- graphics: the decomp PNGs as GB colour indices, painted with the CGB palettes ----
// PREDEFPAL_UNOWN_PUZZLE (BG, $e4 = as is); OBJ pal 0 is the same with colour 0
// set to red, remapped by DmgToCgbObjPal0 $24 (index 3 -> colour 0: a RED cursor
// and red edges on the piece in hand)
const rgb5 = (r, g, b) => [r, g, b].map(v => (v << 3) | (v >> 2));
const BG = [rgb5(31, 31, 31), rgb5(24, 20, 11), rgb5(18, 13, 11), rgb5(0, 0, 0)];
const RED = rgb5(31, 0, 0);
const OBJ = [null, BG[1], BG[2], RED];
const GFX = {};
let gfxReady = null;
const shadeIndex = v => (v >= 213 ? 0 : v >= 128 ? 1 : v >= 43 ? 2 : 3);
async function indices(name) {
	const img = await getImage(`minigames/unown/${name}.png`);
	const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
	const x = c.getContext('2d'); x.drawImage(img, 0, 0);
	const d = x.getImageData(0, 0, img.width, img.height).data;
	const idx = new Uint8Array(img.width * img.height);
	for (let i = 0; i < idx.length; i++) idx[i] = shadeIndex(d[i * 4]);
	return { w: img.width, h: img.height, idx };
}
function paint({ w, h, idx }, pal) {
	const c = document.createElement('canvas'); c.width = w; c.height = h;
	const x = c.getContext('2d'), im = x.createImageData(w, h);
	for (let i = 0; i < idx.length; i++) {
		const col = pal[idx[i]];
		if (!col) continue;   // OBJ colour 0: transparent
		im.data.set([col[0], col[1], col[2], 255], i * 4);
	}
	x.putImageData(im, 0, 0);
	return c;
}
// ConvertLoadedPuzzlePieces: 48x48 -> 96x96 (each pixel doubled), then
// UnownPuzzle_AddPuzzlePieceBorders ORs tile_borders' 8 tiles onto each piece's
// corner/edge tiles ($00 $01 $02 / $0c . $0e / $18 $19 $1a)
async function piecesFor(which) {
	const src = await indices(PUZZLES[which]), bord = GFX.borders;
	const idx = new Uint8Array(96 * 96);
	for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) idx[y * 96 + x] = src.idx[(y >> 1) * 48 + (x >> 1)];
	const SPOTS = [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]];
	for (let pr = 0; pr < 4; pr++) for (let pc = 0; pc < 4; pc++) {
		SPOTS.forEach(([tx, ty], t) => {
			for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
				const o = (pr * 24 + ty * 8 + y) * 96 + pc * 24 + tx * 8 + x;
				idx[o] |= bord.idx[y * 64 + t * 8 + x];
			}
		});
	}
	const sheet = { w: 96, h: 96, idx };
	return { bg: paint(sheet, BG), obj: paint(sheet, OBJ) };
}
function loadGfx(which) {
	gfxReady = (async () => {
		if (!GFX.borders) {
			GFX.borders = await indices('tile_borders');
			GFX.startCancel = paint(await indices('start_cancel'), BG);
			GFX.cursor = paint(await indices('cursor'), OBJ);
		}
		GFX.pieces = await piecesFor(which);
		return true;
	})().catch(e => { console.warn('[unownpuzzle] graphics failed', e); return false; });
	return gfxReady;
}

// the special: open, and resume the script with TRUE (solved) / FALSE (quit)
export function openUnownPuzzle(which, onDone, rand) {
	const u = unownPuzzle;
	u.which = (which | 0) & 3;   // maskbits NUM_UNOWN_PUZZLES
	u.pieces = initPieces(rand);
	u.cursor = 0; u.held = 0; u.solved = false; u.onDone = onDone || null;
	u.started = performance.now();
	u.open = true;
	GFX.pieces = null;
	loadGfx(u.which);
	return 'wait';
}
function close(solved) {
	const u = unownPuzzle;
	u.open = false; u.held = 0;
	const f = u.onDone; u.onDone = null;
	if (f) f(solved);
}
// the script hook: setval UNOWNPUZZLE_* is in VAR_RESULT; the answer goes back there
export function unownPuzzleSpecial(resume) {
	return openUnownPuzzle(Story.getVar('VAR_RESULT'), solved => { Story.setVar('VAR_RESULT', solved ? 1 : 0); resume(); });
}

export function unownPuzzleKey(k) {
	const u = unownPuzzle;
	if (u.solved) { if (['z', 'x', 'Enter', 'Escape'].includes(k)) close(true); return; }   // SimpleWaitPressAorB
	if (k === 'Enter' || k === 'x' || k === 'Escape') { close(false); return; }   // UnownPuzzle_Quit
	const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[k];
	if (dir) {
		const n = moveCursor(u.cursor, dir);
		if (n !== u.cursor) { u.cursor = n; sfx('ui_move'); }   // SFX_POUND / SFX_MOVE_PUZZLE_PIECE
		return;
	}
	if (k !== 'z') return;
	const here = u.pieces[u.cursor];
	if (!u.held) {
		if (!here) { sfx('ui_denied'); return; }   // SFX_WRONG
		u.held = here; u.pieces[u.cursor] = 0; sfx('hit_normal');   // SFX_MEGA_KICK
		return;
	}
	if (here) { sfx('ui_denied'); return; }
	u.pieces[u.cursor] = u.held; u.held = 0; sfx('ui_select');   // SFX_PLACE_PUZZLE_PIECE_DOWN
	if (isSolved(u.pieces)) { u.solved = true; sfx('fanfare_badge'); }   // SFX_1ST_PLACE
}

// ---- drawing: the GB screen into a 160x144 buffer, scaled up into the menu band ----
let screen = null;
const slotXY = s => [(1 + (s % 6) * 3) * 8, Math.floor(s / 6) * 3 * 8];   // UnownPuzzleCoordData tilemap coords
export function drawUnownPuzzle(W, H) {
	const u = unownPuzzle;
	if (!screen) { screen = document.createElement('canvas'); screen.width = 160; screen.height = 144; }
	const g = screen.getContext('2d');
	g.imageSmoothingEnabled = false;
	g.fillStyle = '#000'; g.fillRect(0, 0, 160, 144);
	const sc = GFX.startCancel;
	const tile = (t, tx, ty) => { if (sc) g.drawImage(sc, t * 8, 0, 8, 8, tx * 8, ty * 8, 8, 8); };
	if (sc && GFX.pieces) {
		// PUZZLE_BORDER everywhere, PUZZLE_VOID in the 12x12 frame at (4,3)
		for (let ty = 0; ty < 18; ty++) for (let tx = 0; tx < 20; tx++) tile(tx >= 4 && tx < 16 && ty >= 3 && ty < 15 ? 2 : 1, tx, ty);
		// the START > CANCEL box (PlaceStartCancelBox); once solved only its frame stays
		tile(3, 4, 15); for (let i = 0; i < 10; i++) tile(4, 5 + i, 15); tile(5, 15, 15);
		tile(6, 4, 16); for (let i = 0; i < 10; i++) tile(u.solved ? 2 : 9 + i, 5 + i, 16); tile(6, 15, 16);
		tile(7, 4, 17); for (let i = 0; i < 10; i++) tile(4, 5 + i, 17); tile(8, 15, 17);
		// placed pieces (PlaceUnownPuzzlePieceGFX)
		for (let s = 0; s < 36; s++) {
			const p = u.pieces[s];
			if (!p) continue;
			const [x, y] = slotXY(s);
			g.drawImage(GFX.pieces.bg, ((p - 1) % 4) * 24, Math.floor((p - 1) / 4) * 24, 24, 24, x, y, 24, 24);
		}
		// sprites: the piece in hand (always shown), else the cursor blinking on
		// hVBlankCounter bit 4 (16 frames on, 16 off); none once solved (ClearSprites)
		const [cx, cy] = slotXY(u.cursor);
		const frame = Math.floor((performance.now() - u.started) * 60 / 1000);
		if (!u.solved && u.held) {
			g.drawImage(GFX.pieces.obj, ((u.held - 1) % 4) * 24, Math.floor((u.held - 1) / 4) * 24, 24, 24, cx, cy, 24, 24);
		} else if (!u.solved && (frame & 0x10) && GFX.cursor) {
			// .OAM_NotHoldingPiece: the 16x16 cursor's 4 tiles mirrored into a 24x24 frame
			const C = GFX.cursor;
			const part = (t, dx, dy, fx, fy) => {
				g.save(); g.translate(cx + dx + (fx ? 8 : 0), cy + dy + (fy ? 8 : 0)); g.scale(fx ? -1 : 1, fy ? -1 : 1);
				g.drawImage(C, (t % 2) * 8, Math.floor(t / 2) * 8, 8, 8, 0, 0, 8, 8); g.restore();
			};
			part(0, 0, 0); part(1, 8, 0); part(0, 16, 0, true);
			part(2, 0, 8); part(3, 8, 8); part(2, 16, 8, true);
			part(0, 0, 16, false, true); part(1, 8, 16, false, true); part(0, 16, 16, true, true);
		}
	}
	// the GB screen, integer-scaled and centred in the band
	sctx.fillStyle = '#0b0a12'; sctx.fillRect(0, 0, W, H);
	const k = Math.max(1, Math.floor(Math.min(W / 160, (H * 0.9) / 144)));
	const sw = 160 * k, sh = 144 * k, ox = Math.floor((W - sw) / 2), oy = Math.floor((H - sh) / 2);
	sctx.imageSmoothingEnabled = false;
	sctx.drawImage(screen, ox, oy, sw, sh);
	sctx.fillStyle = 'rgba(255,255,255,0.6)';
	sctx.font = `${Math.max(11, Math.round(H / 40))}px m6x11plus, monospace`;
	sctx.textAlign = 'center';
	sctx.fillText(u.solved ? 'Z: continue' : 'Z: pick up / put down   ENTER or X: quit', W / 2, Math.min(H - 6, oy + sh + Math.max(14, H / 30)));
	sctx.textAlign = 'left';
}

// ---- the chamber floors: closed until each puzzle is solved ----
// In Crystal the warps at (3,3)/(4,3) sit under the closed floor blocks, which
// carry no warp collision, so they only drop you once the puzzle opens the hole.
// The port fires any warp_event on arrival, so standing in front of the panel
// would have pitched you into the inner chamber unsolved.
const CHAMBER_FLAG = {
	RuinsOfAlphKabutoChamber: 'EVENT_SOLVED_KABUTO_PUZZLE',
	RuinsOfAlphOmanyteChamber: 'EVENT_SOLVED_OMANYTE_PUZZLE',
	RuinsOfAlphAerodactylChamber: 'EVENT_SOLVED_AERODACTYL_PUZZLE',
	RuinsOfAlphHoOhChamber: 'EVENT_SOLVED_HO_OH_PUZZLE',
};
export function ruinsFloorClosed(mapName, w) {
	const f = CHAMBER_FLAG[mapName];
	return !!f && !!w && w.dest_map === 'MAP_RUINS_OF_ALPH_INNER_CHAMBER' && !Story.getFlag(f);
}
export const ruinsPuzzleFlags = () => Object.values(CHAMBER_FLAG);
