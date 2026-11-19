// ow_scenes.js — the SCENE REGISTRY: what is on the player's screen besides the map, as data a friend can be shown
// (owner, 2026-11-19: "a friend can watch you walk around live ... with your battles and minigames shown as they
// happen", and "each play session is also recorded as a position/scene tape").
//
// One list, read three ways:
//   - live follow (ow_worldcast.js publishes { map, x, y, facing, scene } while a friend watches; ow_follow.js draws it)
//   - session tapes (ow_worldcast.js records the scene's snapshot each time it changes; ow_follow.js plays them)
//   - the follow / journey viewer draws a scene over the map with the entry's own draw()
//
// THE API (keep it small: minigames join through it later, one entry each)
//   SCENES: [{ id, active, snapshot, draw }]
//     id          a short stable name ('battle', 'dialog', 'slots' ...). It is stored in tapes: never rename one.
//     active()    -> true while this scene is on the player's screen. Checked in list order, first match wins, so a
//                    scene drawn OVER another (a battle over a dialog) comes first.
//     snapshot()  -> plain JSON (no live objects, no functions, no cycles), or null for "nothing to show yet". Keep it
//                    small: it is sent about once a second while watched, and kept in tapes each time it changes
//                    (a few hundred bytes; a few KB at most — the server refuses a world snapshot over 16 KB).
//     draw(ctx, W, H, snap)  paints the scene from a snapshot, on the full-resolution canvas (W x H), on the VIEWER's
//                    page: it must read nothing but `snap` (the viewer's own game state is not the player's).
//   registerScene(entry)      adds one (a minigame's module, at import time). An id already there is replaced.
//   currentScene()            -> { id, snap } for the scene on screen now, or null (exploring)
//   drawScene(ctx, W, H, sc)  draws { id, snap } with its entry -> true, or false when the id is unknown (a tape
//                             made by a newer build) — the viewer then just shows the map.
import { dialog, pvp } from './ow_core.js';
import { castable, factorySnapshot } from './ow_frontier.js';
import { pvpSnapshot } from './ow_battletape.js';
import { drawBattleBoard } from './factoryspec.js';
import { drawDialogBoxHi } from './dialog.js';

export const SCENES = [
	// any battle: wild, trainer, a contest's or the Safari's, the Battle Frontier, a match against a friend — the same
	// board the battle spectator and the battle replays show
	{
		id: 'battle',
		active: () => castable() || !!(pvp.active && !pvp.active.spectator),
		snapshot: () => castable() ? factorySnapshot() : pvpSnapshot(),
		draw: (ctx, W, H, snap) => drawBattleBoard(ctx, W, H, snap),
	},
	// a text box (an NPC, a sign, a cutscene's lines): the page on screen, whole (the typewriter is the player's)
	{
		id: 'dialog',
		active: () => dialog.blocking,
		snapshot: () => { const p = dialog.pages && dialog.pages[dialog.idx]; return p ? { lines: p.map(l => String(l).slice(0, 60)).slice(0, 4), more: dialog.idx < dialog.pages.length - 1 } : null; },
		draw: (ctx, W, H, snap) => drawDialogBoxHi(ctx, W, H, Array.isArray(snap && snap.lines) ? snap.lines.map(String) : [], !!(snap && snap.more)),
	},
];

export function registerScene(entry) {
	if (!entry || typeof entry.id !== 'string' || typeof entry.active !== 'function' || typeof entry.snapshot !== 'function' || typeof entry.draw !== 'function') throw new Error('registerScene: { id, active, snapshot, draw }');
	const i = SCENES.findIndex(s => s.id === entry.id);
	if (i >= 0) SCENES[i] = entry; else SCENES.push(entry);
}

export function currentScene() {
	for (const s of SCENES) {
		try {
			if (!s.active()) continue;
			const snap = s.snapshot();
			if (snap != null) return { id: s.id, snap };
		} catch (e) { /* a scene that cannot say what it shows is just not shown */ }
	}
	return null;
}

export function drawScene(ctx, W, H, sc) {
	const s = sc && SCENES.find(e => e.id === sc.id);
	if (!s) return false;
	try { s.draw(ctx, W, H, sc.snap); return true; } catch (e) { return false; }
}
