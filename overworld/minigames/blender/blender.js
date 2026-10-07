// blender.js — the BERRY BLENDER (pokeemerald src/berry_blender.c), the local
// game behind `special DoBerryBlending` in the Lilycove Contest Lobby: you and
// 1-3 NPCs (or the BLEND MASTER) each drop a BERRY in and press A as the spinning
// arrow passes your mark. A BEST / GOOD / MISS speeds or slows the blender; the
// progress bar fills with speed; the top RPM sets the POKeBLOCK's flavor level.
//
// It runs the decomp's own frame loop, one GBA frame per step():
//   CB2_StartBlenderLocal   berries thrown in (60 frames each), the blender drops
//                           in (+0x200 arrow, +4 scale a frame), lands (20-frame
//                           shake), 3-2-1 + START sprites
//   CB2_PlayBlender         arrow += speed; A -> GetArrowProximity; the slowdown
//                           (speed-1 every 6 frames); the NPC tasks (their odds per
//                           speed band, incl. opponent 1's no-BEST-at-low-speed bug)
//                           land a frame later, as RunTasks runs after the scores;
//                           progress += speed/55 (BEST) or /70 (GOOD); maxRPM
//   CB2_EndBlenderGame      speed -32 a frame to 0, RANKING, RESULTS, the block
//                           (pokeblock.js calculatePokeblock), "blend another?"
// Graphics are the decomp's (tools/gen_blender_gfx.py -> this folder): BG1's
// frame/plates/progress bar/RPM by tile id, BG2's center rotated by arrowPos,
// the OBJ arrows, score symbols, sparkles, countdown and START.
//
// Tests drive it frame by frame: blender.manual = true, then step(n) / key().
import * as Bag from '../../bag.js';
import { sfx } from '../../sound.js';
import { itemIconFile } from '../../itemicon.js';
import * as PB from '../../pokeblock.js';

const MAX_PROGRESS_BAR = 1000;
const MIN_ARROW_SPEED = 0x80;
const ARROW_FALL_ROTATION = 0x5800;
const NO_PLAYER = 0xff;
const PLAYER_ID_MAP = [[NO_PLAYER, 0, 1, NO_PLAYER], [NO_PLAYER, 0, 1, 2], [0, 1, 2, 3]];
const ARROW_START_POS = [0, 0xc000, 0x4000, 0x8000];
const ARROW_START_POS_IDS = [1, 1, 0];
const ARROW_HIT_RANGE_START = [32, 224, 96, 160];
const PLAYER_ARROW_POS = [[72, 32], [168, 32], [72, 128], [168, 128]];
const PLAYER_ARROW_QUADRANT = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const SPEED_DIVISOR = [1, 1, 2, 3, 4];
const PROXIMITY_MISS = 0, PROXIMITY_GOOD = 1, PROXIMITY_BEST = 2;
const BEST = 'BEST', GOOD = 'GOOD', MISS = 'MISS';
const SCORE_IDX = { BEST: 0, GOOD: 1, MISS: 2 };
const NAMES = { MISTER: 'MISTER', LADDIE: 'LADDIE', LASSIE: 'LASSIE', MASTER: 'MASTER', DUDE: 'DUDE', MISS: 'MISS' };

export const blender = {
	open: false,
	manual: false,       // tests: no wall-clock loop; they call step()
	rng: null,           // () => 0..65535 (the decomp's Random()); tests seed it
	onExit: null,
	music: false,        // MUS_CYCLING while the blender spins (ow_music.js)
	// live state (the decomp's struct BerryBlender names), readable by tests
	phase: 'off', numPlayers: 0, opponents: 0, blendMaster: false, names: [], items: [], berries: [],
	arrowPos: 0, speed: 0, maxRPM: 0, progress: 0, maxProgress: 0, gameFrameTime: 0, slowdownTimer: 0,
	scores: [], arrowIdToPlayerId: [], playerIdToArrowId: [], centerScale: 0, bgX: 0, bgY: 0,
	text: '', yesNo: null, list: null, pokeblock: null, places: [],
};
const rand = () => (blender.rng ? blender.rng() : Math.floor(Math.random() * 65536)) & 0xffff;

// ---------- graphics ----------
let gfx = null, gfxLoading = null;
function loadImage(url) {
	return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
}
export function loadBlenderGfx() {
	if (gfx) return Promise.resolve(gfx);
	if (!gfxLoading) {
		const u = f => new URL(f, import.meta.url).href;
		gfxLoading = Promise.all(['outer_tiles.png', 'center.png', 'arrow.png', 'score_symbols.png', 'particles.png', 'countdown.png', 'start.png']
			.map(f => loadImage(u(f))).concat([fetch(u('blender.json')).then(r => r.json())]))
			.then(([outer, center, arrow, score, particles, countdown, start, meta]) => (gfx = { outer, center, arrow, score, particles, countdown, start, meta }))
			.catch(e => { gfxLoading = null; throw e; });
	}
	return gfxLoading;
}
const berryIcons = {};
function berryIcon(itemId) {
	if (!(itemId in berryIcons)) {
		berryIcons[itemId] = null;
		const f = itemIconFile(itemId);
		if (f && typeof Image !== 'undefined') loadImage(new URL(`../../item_icons/${f}`, import.meta.url).href).then(i => { berryIcons[itemId] = i; }).catch(() => {});
	}
	return berryIcons[itemId];
}

// ---------- input ----------
let keyQueue = [];
let pressA = false, pressB = false, pressUp = false, pressDown = false;
const KEYMAP = { z: 'A', Enter: 'A', ' ': 'A', x: 'B', Escape: 'B', Backspace: 'B', ArrowUp: 'UP', ArrowDown: 'DOWN' };
export function blenderKey(k) {
	const b = KEYMAP[k];
	if (b && blender.open) keyQueue.push(b);
}

// ---------- sprites (score symbols, sparkles, berries, countdown, START) ----------
let sprites = [];
function scoreSymbol(kind, arrowId) {
	const [ax, ay] = PLAYER_ARROW_POS[arrowId], [qx, qy] = PLAYER_ARROW_QUADRANT[arrowId];
	sprites.push({ kind: 'score', score: kind, x: ax - 10 * qx, y: ay - 10 * qy, t: 0, life: kind === BEST ? 20 : 20 });
	sfx(kind === BEST ? 'ui_select' : kind === GOOD ? 'ui_move' : 'ui_denied');
	// CreateParticleSprites: 1-2 sparkles off the arrow's tip
	const n = (rand() % 2) + 1;
	for (let i = 0; i < n; i++) {
		const r = (blender.arrowPos + (rand() % 20)) & 0xffff;
		const a = ((r & 0xff) / 256) * Math.PI * 2;
		sprites.push({ kind: 'spark', x: 120 + Math.round(Math.cos(a) * 64), y: 80 + Math.round(Math.sin(a) * 64), dx: 16 - (rand() % 32), dy: 16 - (rand() % 32), px: 0, py: 0, t: 0, life: 19 });
	}
}
function tickSprites() {
	for (const s of sprites) {
		s.t++;
		if (s.kind === 'spark') { s.px += s.dx; s.py += s.dy; }
	}
	sprites = sprites.filter(s => s.life == null || s.t < s.life);
}

// ---------- the game ----------
// GetArrowProximity: (arrowPos / 256) + 24 against the arrow's 48-wide range,
// the middle 8 of it BEST
export function arrowProximity(arrowPos, playerId) {
	const pos = (arrowPos >> 8) + 24;
	const start = ARROW_HIT_RANGE_START[blender.playerIdToArrowId[playerId]];
	if (pos >= start && pos < start + 48) return pos >= start + 20 && pos < start + 28 ? PROXIMITY_BEST : PROXIMITY_GOOD;
	return PROXIMITY_MISS;
}
const arrowSpeedToRPM = speed => Math.floor((60 * 60 * 100 * speed) / 0x10000);

let recv = [];        // gRecvCmds[i][BLENDER_COMM_SCORE] for this frame
let sendCmd = null;   // gSendCmd[BLENDER_COMM_SCORE]
let oppDidInput = [];
let missTasks = [];   // { playerId, timer, delay }
let st = 0, framesToWait = 0, throwId = 0, countdown = null, startSprite = null, msgPages = [], afterMsg = null;

function initPlayers() {
	const n = blender.opponents;
	blender.numPlayers = n + 1;
	const names = ['PLAYER'];
	if (n === 1) names.push(blender.blendMaster ? NAMES.MASTER : NAMES.MISTER);
	if (n === 2) names.push(NAMES.DUDE, NAMES.LASSIE);
	if (n === 3) names.push(NAMES.MISS, NAMES.LADDIE, NAMES.LASSIE);
	names[0] = blender.playerName || 'PLAYER';
	blender.names = names;
}
function setPlayerIdMaps() {
	const map = PLAYER_ID_MAP[blender.numPlayers - 2];
	blender.arrowIdToPlayerId = map.slice();
	blender.playerIdToArrowId = [NO_PLAYER, NO_PLAYER, NO_PLAYER, NO_PLAYER];
	for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (map[i] === j) blender.playerIdToArrowId[j] = i;
}

function say(pages, then) { msgPages = Array.isArray(pages) ? pages.slice() : [pages]; blender.text = msgPages.shift(); afterMsg = then; }

// begin (or begin again: "blend another" goes back through DoBerryBlending)
function beginBlend() {
	blender.items = []; blender.berries = []; blender.pokeblock = null; blender.places = [];
	blender.yesNo = null; blender.list = null;
	sprites = []; recv = [0, 0, 0, 0]; sendCmd = null; oppDidInput = [false, false, false, false]; missTasks = [];
	blender.scores = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
	Object.assign(blender, { arrowPos: 0, speed: 0, maxRPM: 0, progress: 0, maxProgress: 0, gameFrameTime: 0, slowdownTimer: 0, centerScale: 0, bgX: 0, bgY: 0 });
	initPlayers();
	setPlayerIdMaps();
	blender.phase = 'intro';
	say(['Starting up the BERRY BLENDER.', 'Please select a BERRY from your BAG\nto put in the BERRY BLENDER.'], () => openBerryList());
}
// the bag's BERRIES pocket (what the blender knows a flavor for)
export function blendableBerries() {
	return PB.berries().filter(b => Bag.count(b.id) > 0).map(b => ({ id: b.id, name: `${b.name} BERRY`, n: Bag.count(b.id) }));
}
function openBerryList() {
	blender.phase = 'pick';
	blender.list = { items: blendableBerries(), idx: 0 };
	blender.text = '';
}
function chooseBerry(itemId) {
	blender.list = null;
	const all = [itemId, ...PB.opponentBerries(itemId, blender.numPlayers, blender.blendMaster)];
	blender.items = all;
	blender.berries = all.map(id => PB.toBlenderBerry(id));
	blender.phase = 'throw';
	st = 11; throwId = 0; framesToWait = 0;
}

function startPlay() {
	blender.phase = 'play';
	recv = [0, 0, 0, 0]; sendCmd = null;
	blender.speed = MIN_ARROW_SPEED;
	blender.gameFrameTime = 0;
	blender.slowdownTimer = 0;
	blender.music = true;
}

// Task_HandleOpponent1/2/3 + Task_HandleBerryMaster (RunTasks, after the scores)
function runOpponentTasks() {
	const n = blender.opponents;
	if (n === 1 && blender.blendMaster) {
		if (arrowProximity(blender.arrowPos, 1) === PROXIMITY_BEST) { if (!oppDidInput[1]) { recv[1] = BEST; oppDidInput[1] = true; } }
		else oppDidInput[1] = false;
	} else if (n >= 1) opponent1();
	if (n >= 2) opponent23(2, [66], [65, 40, 10]);
	if (n >= 3) opponent23(3, [88], [60, 55, 5]);
	// Task_OpponentMiss (priority 80: after the opponents)
	missTasks = missTasks.filter(t => { if (++t.timer > t.delay) { recv[t.playerId] = MISS; return false; } return true; });
}
const roll = () => Math.floor(rand() / 655) & 0xff;   // u8 rand = Random() / 655
function opponent1() {
	if (arrowProximity(blender.arrowPos, 1) !== PROXIMITY_BEST) { oppDidInput[1] = false; return; }
	if (oppDidInput[1]) return;
	const r = roll(), speed = blender.speed;
	if (speed < 500) {
		recv[1] = r > 75 ? BEST : GOOD;
		recv[1] = GOOD;   // the decomp's bug (no BUGFIX): opponent 1 can't get a BEST at low speed
	} else if (speed < 1500) {
		if (r > 80) recv[1] = BEST;
		else if (((r - 21) & 0xff) < 60) recv[1] = GOOD;
		else if (r < 10) missTasks.push({ playerId: 1, timer: 0, delay: 5 });
	} else if (r <= 90) {
		if (((r - 71) & 0xff) < 20) recv[1] = GOOD;
		else if (r < 30) missTasks.push({ playerId: 1, timer: 0, delay: 5 });
	} else recv[1] = BEST;
	oppDidInput[1] = true;
}
function opponent23(id, [lowBest], [hiBest, hiGood, hiMiss]) {
	const v = ((blender.arrowPos + 0x1800) & 0xffff) >> 8;
	const start = ARROW_HIT_RANGE_START[blender.playerIdToArrowId[id]];
	if (!(v > start + 20 && v < start + 40)) { oppDidInput[id] = false; return; }
	if (oppDidInput[id]) return;
	const r = roll();
	if (blender.speed < 500) recv[id] = r > lowBest ? BEST : GOOD;
	else if (id === 2) {
		if (r > hiBest) recv[id] = BEST;
		if (r > hiGood && r <= hiBest) recv[id] = GOOD;
		if (r < hiMiss) missTasks.push({ playerId: id, timer: 0, delay: 5 });
	} else {
		if (r > hiBest) recv[id] = BEST;
		else if (r > hiGood && r <= hiBest) recv[id] = GOOD;
		if (r < hiMiss) missTasks.push({ playerId: id, timer: 0, delay: 5 });
	}
	oppDidInput[id] = true;
}
// UpdateSpeedFromHit
function speedFromHit(kind) {
	const div = SPEED_DIVISOR[blender.numPlayers];
	if (kind === BEST) {
		if (blender.speed < 1500) blender.speed += Math.trunc(384 / div);
		else {
			blender.speed += Math.trunc(128 / div);
			const s = Math.trunc(blender.speed / 100) - 10;
			if (s > 0) { if (blender.bgX === 0) blender.bgX = (rand() % s) - Math.trunc(s / 2); if (blender.bgY === 0) blender.bgY = (rand() % s) - Math.trunc(s / 2); }
		}
	} else if (kind === GOOD) {
		if (blender.speed < 1500) blender.speed += Math.trunc(256 / div);
	} else if (kind === MISS) {
		blender.speed -= Math.trunc(256 / div);
		if (blender.speed < MIN_ARROW_SPEED) blender.speed = MIN_ARROW_SPEED;
	}
}
// UpdateOpponentScores (local: the player's send lands at once)
function updateScores() {
	if (sendCmd) { recv[0] = sendCmd; sendCmd = null; }
	for (let i = 0; i < blender.numPlayers; i++) {
		const c = recv[i];
		if (!c) continue;
		const arrowId = blender.playerIdToArrowId[i];
		if (c === BEST) {
			speedFromHit(BEST);
			blender.progress = Math.min(MAX_PROGRESS_BAR, blender.progress + Math.trunc(blender.speed / 55));
			scoreSymbol(BEST, arrowId);
			blender.scores[i][0]++;
		} else if (c === GOOD) {
			speedFromHit(GOOD);
			blender.progress += Math.trunc(blender.speed / 70);
			scoreSymbol(GOOD, arrowId);
			blender.scores[i][1]++;
		} else if (c === MISS) {
			scoreSymbol(MISS, arrowId);
			speedFromHit(MISS);
			if (blender.scores[i][2] < 999) blender.scores[i][2]++;
		}
	}
	recv = [0, 0, 0, 0];
}
function restoreBg() {
	for (const k of ['bgX', 'bgY']) { if (blender[k] < 0) blender[k]++; else if (blender[k] > 0) blender[k]--; }
}
function updateRPM() {
	const rpm = arrowSpeedToRPM(blender.speed & 0xffff);
	if (blender.maxRPM < rpm) blender.maxRPM = rpm;
}
// SortScores: BEST x1e6 + GOOD x1e3 + (1000 - MISS)
function sortScores() {
	const n = blender.numPlayers, places = [...Array(n).keys()];
	const pts = blender.scores.slice(0, n).map(s => 1000000 * s[0] + 1000 * s[1] + 1000 - s[2]);
	for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (pts[places[i]] > pts[places[j]]) [places[i], places[j]] = [places[j], places[i]];
	blender.places = places;
}

// one GBA frame
export function step(n = 1) {
	for (let f = 0; f < n && blender.open; f++) frame();
}
function frame() {
	const k = keyQueue.shift() || null;
	pressA = k === 'A'; pressB = k === 'B'; pressUp = k === 'UP'; pressDown = k === 'DOWN';
	tickSprites();
	const b = blender;
	// a message: A turns the page, then whatever it was waiting to do
	if (b.text && !b.yesNo && b.phase !== 'play') {
		if (pressA || pressB) {
			sfx('ui_select');
			if (msgPages.length) b.text = msgPages.shift();
			else { b.text = ''; const then = afterMsg; afterMsg = null; then?.(); }
		}
		return;
	}
	if (b.yesNo) {
		if (pressUp || pressDown) { b.yesNo.idx ^= 1; sfx('ui_move'); }
		if (pressA || pressB) { const yes = pressA && b.yesNo.idx === 0; const cb = b.yesNo.cb; b.yesNo = null; sfx('ui_select'); cb(yes); }
		return;
	}
	switch (b.phase) {
		case 'pick': {
			const L = b.list, rows = L.items.length;
			if (!rows) { finish(); return; }
			if (pressUp) { L.idx = (L.idx + rows - 1) % rows; sfx('ui_move'); }
			if (pressDown) { L.idx = (L.idx + 1) % rows; sfx('ui_move'); }
			if (pressB) { sfx('ui_cancel'); finish(); return; }   // closing the bag leaves the blender
			if (pressA) { sfx('ui_select'); chooseBerry(L.items[L.idx].id); }
			return;
		}
		case 'throw':   // states 11/12: one berry every 60 frames
			if (st === 11) {
				const playerId = throwId;
				const arrowId = PLAYER_ID_MAP[b.numPlayers - 2].indexOf(playerId);
				sprites.push({ kind: 'berry', item: b.items[playerId], arrowId, t: 0, life: 40 });
				framesToWait = 0; st = 12; throwId++;
			} else if (++framesToWait > 60) {
				if (throwId >= b.numPlayers) {
					b.arrowPos = (ARROW_START_POS[ARROW_START_POS_IDS[b.numPlayers - 2]] - ARROW_FALL_ROTATION) & 0xffff;
					b.phase = 'fall'; setPlayerIdMaps(); b.centerScale = 0;
				} else st = 11;
				framesToWait = 0;
			}
			return;
		case 'fall':    // state 14: drops in spinning
			b.arrowPos = (b.arrowPos + 0x200) & 0xffff;
			b.centerScale += 4;
			if (b.centerScale > 255) {
				b.centerScale = 256;
				b.arrowPos = ARROW_START_POS[ARROW_START_POS_IDS[b.numPlayers - 2]];
				framesToWait = 0;
				sfx('bump');
				b.phase = 'land';
			}
			return;
		case 'land':    // UpdateBlenderLandScreenShake
			if (framesToWait === 0) { b.bgX = 0; b.bgY = 0; }
			framesToWait++;
			for (const key of ['bgX', 'bgY']) {
				const strength = framesToWait < 10 ? 16 : 8;
				if (b[key] === 0) b[key] = (rand() % strength) - strength / 2;
				else if (b[key] < 0) b[key]++; else b[key]--;
			}
			if (framesToWait === 20) {
				b.bgX = 0; b.bgY = 0;
				b.phase = 'countdown';
				countdown = { state: 0, y: 0, delay: 0, anim: 0 };   // sYPos (the sprite sits at y -16 + sYPos)
			}
			return;
		case 'countdown': { // SpriteCB_CountdownNumber, then SpriteCB_Start
			if (countdown) {
				const c = countdown;
				if (c.state === 0) { c.y += 8; if (c.y > 88) { c.y = 88; c.state = 1; sfx('ui_move'); } }
				else if (c.state === 1) { if (++c.delay > 20) { c.state = 2; c.delay = 0; } }
				else { c.y += 4; if (c.y > 176) { if (++c.anim === 3) { countdown = null; startSprite = { state: 0, y: 0, t: 0 }; } else { c.state = 0; c.y = -16; } } }
			} else if (startSprite) {
				const s = startSprite;
				if (s.state === 0) { s.y += 8; if (s.y > 92) { s.y = 92; s.state = 1; sfx('ui_select'); } }
				else if (s.state === 1) { if (++s.t > 20) s.state = 2; }
				else { s.y += 4; if (s.y > 176) { startSprite = null; startPlay(); } }
			}
			return;
		}
		case 'play':
			// CB2_PlayBlender
			b.arrowPos = (b.arrowPos + b.speed) & 0xffff;
			if (b.gameFrameTime < 99 * 60 * 60 + 59 * 60) b.gameFrameTime++;
			// HandlePlayerInput
			if (pressA) {
				const p = arrowProximity(b.arrowPos, 0);
				sendCmd = p === PROXIMITY_BEST ? BEST : p === PROXIMITY_GOOD ? GOOD : MISS;
				b.pressFlash = 10;
			}
			if (++b.slowdownTimer > 5) { if (b.speed > MIN_ARROW_SPEED) b.speed--; b.slowdownTimer = 0; }
			updateScores();
			// TryUpdateProgressBar: the bar creeps 2 a frame toward the value
			if (b.maxProgress < b.progress) b.maxProgress += 2;
			updateRPM();
			restoreBg();
			if (b.maxProgress >= MAX_PROGRESS_BAR) {
				b.progress = MAX_PROGRESS_BAR;
				b.phase = 'stop';
				missTasks = []; recv = [0, 0, 0, 0];
				return;
			}
			runOpponentTasks();
			if (b.pressFlash) b.pressFlash--;
			return;
		case 'stop':    // CB2_EndBlenderGame 2: spin down 32 a frame
			b.arrowPos = (b.arrowPos + b.speed) & 0xffff;
			b.speed -= 32;
			if (b.speed <= 0) {
				b.speed = 0;
				b.music = false;
				b.phase = 'ranking'; framesToWait = 255; st = 1;
			}
			updateRPM(); restoreBg();
			return;
		case 'ranking': // PrintBlendingRanking
			if (st === 1) { framesToWait -= 10; if (framesToWait < 0) { framesToWait = 0; st = 2; } }
			else if (st === 2) { if (++framesToWait > 20) { framesToWait = 0; sortScores(); b.showRanking = true; st = 4; } }
			else if (st === 4) { if (++framesToWait > 20) st = 5; }
			else if (st === 5 && pressA) { sfx('ui_select'); b.showRanking = false; b.phase = 'results'; st = 1; framesToWait = 17; }
			return;
		case 'results': // PrintBlendingResults
			if (st === 1) { framesToWait -= 10; if (framesToWait < 0) { framesToWait = 0; st = 2; } }
			else if (st === 2) { if (++framesToWait > 20) { framesToWait = 0; b.showResults = true; st = 4; } }
			else if (st === 4 && pressA) {
				b.showResults = false;
				const block = PB.calculatePokeblock(b.berries, b.maxRPM, rand);
				b.pokeblock = block;
				Bag.consume(b.items[0]);
				PB.addPokeblock(block);
				// TryUpdateBerryBlenderRecord
				const rec = blenderRecords();
				if (rec[b.numPlayers - 2] < b.maxRPM) { rec[b.numPlayers - 2] = b.maxRPM; saveBlenderRecords(rec); }
				sfx('levelup');
				st = 6;
				say(PB.madeText(block), () => askAgain());
			}
			return;
		default: return;
	}
}
function askAgain() {
	const b = blender;
	b.phase = 'again';
	b.text = 'Would you like to blend another BERRY?';
	b.yesNo = { idx: 0, cb: yes => {
		b.text = '';
		if (!yes) { finish(); return; }
		if (!blendableBerries().length) { b.phase = 'msg'; say("You've run out of BERRIES for\nblending in the BERRY BLENDER.", () => finish()); return; }
		if (PB.firstFreeSlot() < 0) { b.phase = 'msg'; say('Your POKeBLOCK CASE is full.', () => finish()); return; }
		beginBlend();
	} };
}

// ---------- records (gSaveBlock1Ptr->berryBlenderRecords: 2/3/4 players) ----------
const REC_KEY = 'magepunk_blender_records_v1';
export function blenderRecords() {
	try { const r = JSON.parse(localStorage.getItem(REC_KEY) || 'null'); if (Array.isArray(r) && r.length === 3) return r.map(v => v | 0); } catch (e) {}
	return [0, 0, 0];
}
function saveBlenderRecords(r) { try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {} }
const rpmText = v => `${String(Math.floor(v / 100)).padStart(3, ' ')}.${String(v % 100).padStart(2, '0')} RPM`;
export const recordText = () => ['BERRY BLENDER\nMAXIMUM SPEED RECORD!', ...blenderRecords().map((r, i) => `${i + 2} PLAYERS  ${rpmText(r)}`)].join('\n');

// ---------- open / close ----------
let timer = null;
export async function startBerryBlender({ opponents, blendMaster = false, playerName = 'PLAYER' }, onExit) {
	await loadBlenderGfx().catch(e => console.warn('[blender] gfx', e));
	keyQueue = [];
	Object.assign(blender, { open: true, onExit, opponents: Math.max(1, Math.min(3, opponents | 0)), blendMaster: !!blendMaster, playerName, music: false, showRanking: false, showResults: false, pressFlash: 0 });
	beginBlend();
	if (!blender.manual && !timer) {
		let last = performance.now(), acc = 0;
		const loop = now => {
			if (!blender.open) { timer = null; return; }
			acc += Math.min(250, now - last); last = now;
			while (acc >= 1000 / 60) { acc -= 1000 / 60; if (!blender.manual) frame(); }
			timer = requestAnimationFrame(loop);
		};
		timer = requestAnimationFrame(loop);
	}
}
function finish() {
	const b = blender;
	if (!b.open) return;
	b.open = false; b.phase = 'off'; b.music = false; b.text = ''; b.yesNo = null; b.list = null;
	if (timer) { cancelAnimationFrame(timer); timer = null; }
	const cb = b.onExit; b.onExit = null;
	cb?.();
}
export const closeBerryBlender = finish;

// ---------- draw ----------
let screen = null, sctx2 = null;
function tileAt(id, hflip, vflip, x, y) {
	const sx = (id % 16) * 8, sy = Math.floor(id / 16) * 8;
	if (!hflip && !vflip) { sctx2.drawImage(gfx.outer, sx, sy, 8, 8, x, y, 8, 8); return; }
	sctx2.save(); sctx2.translate(x + (hflip ? 8 : 0), y + (vflip ? 8 : 0)); sctx2.scale(hflip ? -1 : 1, vflip ? -1 : 1);
	sctx2.drawImage(gfx.outer, sx, sy, 8, 8, 0, 0, 8, 8); sctx2.restore();
}
function cellsWithOverrides() {
	const cells = gfx.meta.outerMap.slice();
	// UpdateProgressBar: row 0 cols 11-18 (top) and row 1 (bottom), 8 segments of 8
	const filled = Math.floor((blender.maxProgress * 64) / MAX_PROGRESS_BAR), full = Math.floor(filled / 8), part = filled % 8;
	for (let i = 0; i < 8; i++) {
		let top = 0x80e1, bot = 0x80f1;
		if (i < full) { top = 0x80e9; bot = 0x80f9; } else if (i === full && part) { top = 0x80e1 + part; bot = 0x80f1 + part; }
		cells[11 + i] = top; cells[43 + i] = bot;
	}
	// UpdateRPM: the current RPM's five digits at row 17, cols 12-14 and 16-17
	let rpm = arrowSpeedToRPM(blender.speed & 0xffff);
	const d = []; for (let i = 0; i < 5; i++) { d.push(rpm % 10); rpm = Math.floor(rpm / 10); }
	const at = 17 * 32;
	cells[at + 12] = 0x8072 + d[4]; cells[at + 13] = 0x8072 + d[3]; cells[at + 14] = 0x8072 + d[2]; cells[at + 16] = 0x8072 + d[1]; cells[at + 17] = 0x8072 + d[0];
	return cells;
}
export function drawBerryBlender(ctx, SW, SH) {
	ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SW, SH);
	if (!gfx) return;
	if (!screen) { screen = document.createElement('canvas'); screen.width = 240; screen.height = 160; sctx2 = screen.getContext('2d'); }
	const b = blender;
	sctx2.imageSmoothingEnabled = false;
	sctx2.fillStyle = gfx.meta.backdrop; sctx2.fillRect(0, 0, 240, 160);
	// BG2: the center, scaled while it drops in, rotated by arrowPos
	const showCenter = !['intro', 'pick', 'throw'].includes(b.phase) || b.centerScale > 0;
	if (showCenter && b.centerScale > 0) {
		sctx2.save();
		sctx2.translate(120 - b.bgX, 80 - b.bgY);
		sctx2.rotate(-(b.arrowPos / 0x10000) * Math.PI * 2);
		const s = b.centerScale / 256;
		sctx2.scale(s, s);
		sctx2.drawImage(gfx.center, -120, -80);
		sctx2.restore();
	}
	// BG1: the frame (shaken by bg_X/bg_Y)
	const cells = cellsWithOverrides();
	for (let cy = 0; cy < 21; cy++) for (let cx = 0; cx < 31; cx++) {
		const v = cells[cy * 32 + cx]; if ((v >> 12) !== 8) continue;
		tileAt(v & 0x3ff, v & 0x400, v & 0x800, cx * 8 - b.bgX, cy * 8 - b.bgY);
	}
	// OBJ: player arrows (Off for empty seats; flash on a press)
	if (b.centerScale >= 256 || ['countdown', 'play', 'stop', 'ranking', 'results', 'again', 'msg'].includes(b.phase)) {
		for (let a = 0; a < 4; a++) {
			const pid = b.arrowIdToPlayerId[a];
			let fr = pid === NO_PLAYER || pid == null ? 0 : 1;
			if (pid === 0 && b.pressFlash > 0) fr = b.pressFlash > 5 ? 3 : 2;
			const [x, y] = PLAYER_ARROW_POS[a], hf = a % 2 === 0, vf = a < 2;
			sctx2.save(); sctx2.translate(x - b.bgX, y - b.bgY); sctx2.scale(hf ? -1 : 1, vf ? -1 : 1);
			sctx2.drawImage(gfx.arrow, 0, fr * 32, 32, 32, -16, -16, 32, 32); sctx2.restore();
		}
	}
	for (const s of sprites) {
		if (s.kind === 'score') {
			const fr = s.score === GOOD ? 0 : s.score === MISS ? 1 : (Math.floor(s.t / 4) % 2 ? 3 : 2);
			const dy = s.score === BEST ? -Math.min(12, s.t * 2) : -Math.floor(s.t / 3);
			sctx2.save(); sctx2.translate(s.x, s.y + dy); if (s.score === MISS) sctx2.scale(-1, 1);
			sctx2.drawImage(gfx.score, 0, fr * 16, 16, 16, -8, -8, 16, 16); sctx2.restore();
		} else if (s.kind === 'spark') {
			const seq = [0, 0, 0, 1, 1, 1, 1, 3, 3, 3, 3, 3, 1, 1, 1, 1, 0, 0, 0];
			sctx2.drawImage(gfx.particles, 0, (seq[s.t] || 0) * 8, 8, 8, s.x + Math.trunc(s.px / 8) - 4, s.y + Math.trunc(s.py / 8) - 4, 8, 8);
		} else if (s.kind === 'berry') {
			const [x0, y0] = PLAYER_ARROW_POS[s.arrowId], k = Math.min(1, s.t / 40);
			const icon = berryIcon(s.item);
			const x = x0 + (120 - x0) * k, y = y0 + (80 - y0) * k - Math.sin(k * Math.PI) * 24;
			if (icon) sctx2.drawImage(icon, Math.round(x - 12), Math.round(y - 12), 24, 24);
			else { sctx2.fillStyle = '#c0304a'; sctx2.beginPath(); sctx2.arc(x, y, 5, 0, Math.PI * 2); sctx2.fill(); }
		}
	}
	if (countdown) sctx2.drawImage(gfx.countdown, 0, (2 - countdown.anim) * 32, 32, 32, 104, -16 + countdown.y - 16, 32, 32);
	if (startSprite) sctx2.drawImage(gfx.start, 88, -20 + startSprite.y - 16);
	// scale the GBA screen up
	const k = Math.min(SW / 240, SH / 160), w = Math.floor(240 * k), h = Math.floor(160 * k);
	const ox = Math.floor((SW - w) / 2), oy = Math.floor((SH - h) / 2);
	ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(screen, ox, oy, w, h); ctx.restore();
	const X = x => ox + x * k, Y = y => oy + y * k;
	const font = px => `${Math.round(px * k)}px m6x11plus, monospace`;
	// name plates (PrintPlayerNames: windows at tiles (1,6) (22,6) (1,12) (22,12), 7x2)
	if (b.centerScale >= 256 && b.names.length) {
		const plates = [[8, 48], [176, 48], [8, 96], [176, 96]];
		ctx.font = font(11); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
		for (let a = 0; a < 4; a++) {
			const pid = b.arrowIdToPlayerId[a]; if (pid === NO_PLAYER || pid == null) continue;
			ctx.fillStyle = pid === 0 ? '#e83030' : '#383838';
			ctx.fillText(b.names[pid] || '', X(plates[a][0] + 28 - b.bgX), Y(plates[a][1] + 8 - b.bgY));
		}
		ctx.textAlign = 'left';
	}
	const win = (x, y, w2, h2) => {
		ctx.fillStyle = '#f8f8f8'; ctx.fillRect(X(x), Y(y), w2 * k, h2 * k);
		ctx.strokeStyle = '#506078'; ctx.lineWidth = Math.max(2, k); ctx.strokeRect(X(x), Y(y), w2 * k, h2 * k);
	};
	ctx.textBaseline = 'top';
	if (b.showRanking) {
		win(40, 24, 168, 112);
		ctx.font = font(12); ctx.fillStyle = '#383838';
		ctx.textAlign = 'center'; ctx.fillText('RANKING', X(124), Y(28)); ctx.textAlign = 'left';
		ctx.fillText('BEST  GOOD  MISS', X(112), Y(44));
		b.places.forEach((p, i) => {
			const y = 60 + i * 16;
			ctx.fillText(`${i + 1}. ${b.names[p]}`, X(44), Y(y));
			ctx.fillText(String(b.scores[p][0]).padStart(3), X(118), Y(y));
			ctx.fillText(String(b.scores[p][1]).padStart(3), X(150), Y(y));
			ctx.fillText(String(b.scores[p][2]).padStart(3), X(182), Y(y));
		});
	}
	if (b.showResults) {
		win(40, 24, 168, 112);
		ctx.font = font(12); ctx.fillStyle = '#383838';
		ctx.textAlign = 'center'; ctx.fillText('RESULTS OF BLENDING', X(124), Y(28)); ctx.textAlign = 'left';
		const y0 = b.numPlayers === 4 ? 41 : 45;
		b.places.forEach((p, i) => {
			ctx.fillText(`${i + 1}. ${b.names[p]}`, X(48), Y(y0 + i * 16));
			ctx.fillText(`${PB.berryInfo(b.items[p])?.name || ''} BERRY`, X(124), Y(y0 + i * 16));
		});
		ctx.fillText('MAXIMUM SPEED', X(44), Y(105)); ctx.textAlign = 'right';
		ctx.fillText(`${Math.floor(b.maxRPM / 100)}.${String(b.maxRPM % 100).padStart(2, '0')} RPM`, X(204), Y(105));
		ctx.textAlign = 'left'; ctx.fillText('Time:', X(44), Y(121)); ctx.textAlign = 'right';
		const sec = Math.floor(b.gameFrameTime / 60) % 60, min = Math.floor(b.gameFrameTime / 3600);
		ctx.fillText(`${String(min).padStart(2, '0')} min. ${String(sec).padStart(2, '0')} sec.`, X(204), Y(121));
		ctx.textAlign = 'left';
	}
	if (b.list) {
		win(120, 8, 112, 104);
		ctx.font = font(11); ctx.fillStyle = '#383838';
		const L = b.list, first = Math.max(0, Math.min(L.idx - 3, L.items.length - 6));
		L.items.slice(first, first + 6).forEach((it, i) => {
			const idx = first + i;
			ctx.fillText(`${idx === L.idx ? '▶' : ' '}${it.name}`, X(124), Y(14 + i * 16));
			ctx.textAlign = 'right'; ctx.fillText(`x${it.n}`, X(228), Y(14 + i * 16)); ctx.textAlign = 'left';
		});
		if (!L.items.length) ctx.fillText('No BERRIES.', X(128), Y(14));
	}
	if (b.text) {
		win(8, 116, 224, 40);
		ctx.font = font(12); ctx.fillStyle = '#383838';
		b.text.split('\n').forEach((line, i) => ctx.fillText(line, X(16), Y(122 + i * 15)));
	}
	if (b.yesNo) {
		win(168, 72, 40, 40);
		ctx.font = font(12); ctx.fillStyle = '#383838';
		['YES', 'NO'].forEach((t, i) => ctx.fillText(`${b.yesNo.idx === i ? '▶' : ' '}${t}`, X(174), Y(78 + i * 16)));
	}
	ctx.textBaseline = 'alphabetic';
}
// test hooks
export const blenderTest = { arrowProximity, step, blendableBerries, sprites: () => sprites.length };
