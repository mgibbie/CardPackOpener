// ow_scene_minigames.js — the overworld's minigames as SCENES a friend can watch live and a replay can show (owner,
// 2026-11-19: "make sure every single mode of every game type has spectation and replays").
//
// Each entry has the scene registry's shape (ow_scenes.js): { id, active(), snapshot(), draw(ctx, W, H, snap) }.
//   snapshot(): the minigame's own state, as plain data (the fields its draw function reads; no images, no functions)
//   draw():     W, H are the whole screen (as the game loop's SW, SH); the minigame's OWN draw function, given that state: the state is lent to the module's state object for the
//               one call and put back at once, so a watcher's screen shows exactly what the player's does
// Minigames made of battles and walking (Trainer Hill, the Bug-Catching Contest, the Safari Zone, the Trick House) need
// no entry: the battle scene and the live follow show them.
import { vfMenu, gcMenu, drawVfMenu, drawGcMenu } from './ow_gamecorner.js';
import { slotsMenu, drawSlots } from './ow_minigames.js';
import { crystalSlots, drawCrystalSlots } from './ow_crystalslots.js';
import { unownPuzzle, drawUnownPuzzle, loadGfx as loadUnownGfx } from './unown_puzzle.js';
import { contestMenu, contestScreen, drawContest, loadContestData } from './contest_ui.js';
import { cardFlip, cardFlipScreen, drawCardFlip, loadGfx as loadCardFlipGfx } from './minigames/cardflip/cardflip.js';
import { blender, drawBerryBlender, loadBlenderGfx } from './minigames/blender/blender.js';
import { SlotsEngine } from './minigames/slots/slots_engine.js';
import { sctx } from './ow_core.js';

const MAX_SNAP_CHARS = 12_000;   // (a scene rides in a live frame, which the server caps at 16 KB, and in a replay tape)
/** Plain data: functions and images dropped, cycles cut. */
function plain(v) {
	const seen = new WeakSet();
	try {
		const s = JSON.stringify(v, (k, x) => {
			if (typeof x === 'function') return undefined;
			if (typeof HTMLImageElement !== 'undefined' && (x instanceof HTMLImageElement || x instanceof HTMLCanvasElement)) return undefined;
			if (x && typeof x === 'object') { if (seen.has(x)) return undefined; seen.add(x); }
			return x;
		});
		return s && s.length <= MAX_SNAP_CHARS ? JSON.parse(s) : null;
	} catch (e) { return null; }
}
// (the menu-band minigames draw in the same band the game loop gives them: ow_loop.js MH)
const band = (W, H) => Math.min(H, Math.round(W / 1.5));
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
/** A scene over a module's state object: `keys` are the fields its draw reads; `prepare` turns plain data back into what
 *  the draw expects (a class instance); `load` fetches its pictures once, on the watcher's side. */
function stateScene({ id, state, keys, active = () => !!state.open, drawFn, prepare = s => s, load = null, extra = null }) {
	let loading = null, loadedFor = null;
	return {
		id, active,
		// (extra: what the draw reads besides the state object, e.g. Card Flip's tile maps: { get(), set(s) -> what was there })
		snapshot: () => plain(extra ? { ...pick(state, keys), _x: extra.get() } : pick(state, keys)),
		draw(ctx, W, H, snap) {
			if (!snap) return;
			// (the pictures, once, on the watcher's side; again when the snapshot needs others: another Unown puzzle)
			const key = load ? JSON.stringify(load.key ? load.key(snap) : 1) : null;
			if (load && (!loading || key !== loadedFor)) { loadedFor = key; loading = Promise.resolve().then(() => (load.run || load)(snap)).catch(() => { loading = null; }); }
			const { _x, ...data } = structuredClone(snap);
			const saved = pick(state, [...keys, 'open']), savedX = extra && _x ? extra.set(_x) : null;
			Object.assign(state, prepare(data), { open: true });
			try { drawFn(ctx || sctx, W, H); } catch (e) { /* a picture still loading: the next frame draws it */ }
			finally { Object.assign(state, saved); if (savedX) extra.set(savedX); }
		},
	};
}

export const MINIGAME_SCENES = [
	stateScene({ id: 'voltorbflip', state: vfMenu, keys: ['game', 'cur', 'flash'], drawFn: (c, W, H) => drawVfMenu(W, band(W, H)) }),
	stateScene({ id: 'gamecorner', state: gcMenu, keys: ['mode', 'idx', 'flash'], drawFn: (c, W, H) => drawGcMenu(W, band(W, H)) }),
	stateScene({ id: 'slots', state: slotsMenu, keys: ['game', 'bet', 'msg'], drawFn: (c, W, H) => drawSlots(W, band(W, H)) }),
	stateScene({ id: 'crystalslots', state: crystalSlots, keys: ['engine'], drawFn: (c, W, H) => drawCrystalSlots(W, band(W, H)),
		// (the engine is a class: its fields come back on its prototype, with a bank, dice and sounds that do nothing)
		prepare: s => { if (s.engine) { Object.setPrototypeOf(s.engine, SlotsEngine.prototype); s.engine.bank = { get: () => 0, set() {} }; s.engine.rng = () => 0; s.engine.sfx = () => {}; } return s; } }),
	stateScene({ id: 'unownpuzzle', state: unownPuzzle, keys: ['which', 'pieces', 'cursor', 'held', 'solved'], drawFn: (c, W, H) => drawUnownPuzzle(W, band(W, H)), load: { key: s => s.which, run: s => loadUnownGfx(s.which) } }),
	stateScene({ id: 'cardflip', state: cardFlip, keys: ['deck', 'discard', 'numPlayed', 'which', 'faceUp', 'cursorY', 'cursorX', 'phase', 'text', 'lastPayout'], drawFn: (c, W, H) => drawCardFlip(c, W, H), load: loadCardFlipGfx, extra: cardFlipScreen }),
	// (the Contest itself rides as `extra`: its data table stays behind, contest_ui.js contestScreen)
	stateScene({ id: 'contest', state: contestMenu, keys: ['phase'], active: () => !!(contestMenu.open && contestMenu.st), drawFn: (c, W, H) => drawContest(c, W, H), load: loadContestData, extra: contestScreen }),
	stateScene({ id: 'blender', state: blender, keys: ['phase', 'numPlayers', 'opponents', 'blendMaster', 'names', 'items', 'berries', 'arrowPos', 'speed', 'maxRPM', 'progress', 'maxProgress', 'gameFrameTime', 'slowdownTimer', 'scores', 'arrowIdToPlayerId', 'playerIdToArrowId', 'centerScale', 'bgX', 'bgY', 'text', 'yesNo', 'list', 'pokeblock', 'places'],
		drawFn: (c, W, H) => drawBerryBlender(c, W, H), load: loadBlenderGfx }),
];
/** The minigame being played now, as { id, snap }, or null. */
export function currentMinigame() {
	for (const s of MINIGAME_SCENES) { try { if (s.active()) { const snap = s.snapshot(); if (snap) return { id: s.id, snap }; } } catch (e) { /* never break the frame */ } }
	return null;
}
export const minigameScene = id => MINIGAME_SCENES.find(s => s.id === id) || null;
