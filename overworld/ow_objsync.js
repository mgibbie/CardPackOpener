// ow_objsync.js — a story flag that changes WHILE you stand on the map reaches its objects.
//
// THE GBA RE-READS AN OBJECT'S HIDE FLAG WHENEVER IT SCROLLS BACK INTO VIEW. Objects
// only live while they are near the camera: RemoveObjectEventsOutsideView drops the
// ones that leave the view window, and TrySpawnObjectEvents re-creates a template as
// it comes back in — only `if (!FlagGet(template->flagId))` (pokeemerald
// src/event_object_movement.c). So a script can `setflag FLAG_HIDE_X` for a crowd
// it never `removeobject`s, and the crowd is simply not there when you walk over.
//
// This port builds a map's objects ONCE, on entry, and never looked at the flags
// again until the next load. Mt Chimney is the case a tester hit (2026-11-02): Maxie's
// script removes Maxie, Tabitha and two named grunts, then sets
// FLAG_HIDE_MT_CHIMNEY_TEAM_MAGMA / _AQUA for the other ~20 — the anonymous grunts and
// POOCHYENA fighting across the only path south (y39). They stayed, solid and
// talkable, until the player left the map and came back. Every same-map "set the
// flag, let the camera do the rest" beat had the same lag.
//
// So, the camera's rule, for FireRed/Emerald maps:
//   - a loaded object whose hide flag has turned SET since it was built leaves once it
//     is outside the GBA's object window (both its tile and its home tile, as
//     RemoveObjectEventIfOutsideView checks) — never in front of you;
//   - an object that was hidden by its flag when the map loaded, and whose flag has
//     since CLEARED, appears once its home tile is inside that window (the Lava Cookie
//     lady, cleared by the same Maxie script).
// Nothing runs while a cutscene owns the screen: a scene's own actors are its
// business (addobject brings on an actor whose flag is still set — those are marked
// `forceShown` and left alone, like the villain grunts a quest beat populates).
// Crystal maps are not touched: its scripts `disappear`/`appear` their objects
// explicitly, and its object flags already follow those ops.
import { objectHiddenByFlag } from './events.js';
import { cutscene, npcs, player, trainers, world } from './ow_core.js';

// the GBA object window around the player, in tiles (RemoveObjectEventIfOutsideView:
// pos.x-2 .. pos.x+17 and pos.y .. pos.y+16 in MAP_OFFSET (7) coordinates)
export const OBJECT_VIEW = { left: -9, right: 10, top: -7, bottom: 9 };
export function inObjectView(x, y, px = player.tx, py = player.ty) {
	const dx = x - px, dy = y - py;
	return dx >= OBJECT_VIEW.left && dx <= OBJECT_VIEW.right && dy >= OBJECT_VIEW.top && dy <= OBJECT_VIEW.bottom;
}

const spawning = new Set();   // evs whose late spawn is in flight

// one pass; returns what it changed (tests read it)
export function syncFlaggedObjects() {
	const map = world.current?.map;
	const out = { hidden: [], shown: [] };
	if (!map || map._crystal_tileset || cutscene.blocking || !player) return out;
	// leave: built visible, flag set since, and out of the window
	for (const o of [...(npcs.list || []), ...(trainers.list || [])]) {
		const ev = o.ev;
		if (!ev || o.hidden || o.forceShown || !ev.flag || ev.flag === '0') continue;
		if (!objectHiddenByFlag(ev)) continue;
		if (inObjectView(o.tx, o.ty) || inObjectView(+ev.x, +ev.y)) continue;
		o.hidden = true;
		o.flagHidden = true;
		out.hidden.push(ev);
	}
	// come back: an object this sync hid whose flag cleared again
	for (const o of npcs.list || []) {
		if (!o.flagHidden || objectHiddenByFlag(o.ev) || !inObjectView(+o.ev.x, +o.ev.y)) continue;
		o.hidden = false; o.flagHidden = false;
		out.shown.push(o.ev);
	}
	// appear: hidden by its flag at load, flag clear now, home tile in the window
	const skipped = npcs.flagSkipped || [];
	for (let i = skipped.length - 1; i >= 0; i--) {
		const ev = skipped[i];
		if (spawning.has(ev) || objectHiddenByFlag(ev) || !inObjectView(+ev.x, +ev.y)) continue;
		skipped.splice(i, 1);
		if ((npcs.list || []).some(n => n.ev === ev)) continue;
		spawning.add(ev);
		const gen = npcs._loadGen;
		npcs.build(ev).then(n => {
			spawning.delete(ev);
			// a newer map load owns the list now, or something else spawned it meanwhile
			if (!n || gen !== npcs._loadGen || npcs.list.some(o => o.ev === ev)) return;
			npcs.list.push(n);
		}).catch(() => spawning.delete(ev));
		out.shown.push(ev);
	}
	return out;
}
