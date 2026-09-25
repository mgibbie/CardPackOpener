// ow_transitions.js — map transitions: moveToMap/warpTo/flyTo, per-map script loading, Fly points (split from main.js).
import { getImage, getJSON } from './engine.js';
import * as Story from './events.js';
import * as Fly from './flydata.js';
import { arcade, battle, blockers, cutscene, encounters, hud, items, npcs, player, portals, services, trainers, world } from './ow_core.js';
import { roamersOnMapChange, shoalFixup } from './ow_features.js';
import { silphDoorsApply } from './ow_fieldmoves.js';
import { refreshFollower } from './ow_follower.js';
import { POS_KEY, savePos } from './ow_input.js';
import { checkAwakeningTrigger } from './ow_legendaries.js';
import { hillPrepFloor } from './ow_minigames.js';
import { syncMapBgm } from './ow_music.js';
import { checkSafariGate, noteOutdoor } from './ow_places.js';
import { playerRegion } from './ow_progression.js';
import { showAreaBanner } from './ow_render.js';
import { S } from './ow_state.js';
import { checkIntroTrigger, checkOnFrame, checkRivalTrigger, checkVillainTrigger, runMapSetupScripts } from './ow_story.js';
import { trickHouseOpenDoors } from './ow_venues.js';
import * as Quest from './quest.js';
import { safeLoad, safeSave } from './safestore.js';
import { applySailFix } from './sail_fix.js';
import { sfx } from './sound.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import {
	fadeTo, refreshObjective, sharedScripts,
} from './main.js';

// ---------- map transitions ----------
// per-map ported scripts + resolved text (lazy-loaded, cached)
S.mapStrings = {}; S.mapScripts = {};
const scriptCache = new Map();
export async function loadMapScripts(stem) {
	S.mapScripts = {}; S.mapStrings = {};
	if (!stem) return;
	if (!scriptCache.has(stem)) {
		const scr = await getJSON(`data/scripts/${stem}.json`).catch(() => null);
		const str = await getJSON(`data/strings/${stem}.json`).catch(() => ({}));
		scriptCache.set(stem, { scr, str });
	}
	const c = scriptCache.get(stem);
	// Both decomps keep script bodies OUTSIDE the map file — in data/scripts/*.inc,
	// in event_scripts.s, and in another map's file when several maps share one
	// (every Silph Co floor points at one door script; the Dotted Hole's basements
	// at 1F's). The engine loads exactly ONE map's file, so all of that resolved to
	// nothing and the object was mute. sharedScripts is the recovered table — the
	// FireRed/Emerald counterpart of crystal_stds.js.
	//
	// Merged UNDER the map's own labels, so a map that defines a label keeps its
	// own version; the shared copy is only ever a fallback. Merging here rather
	// than at each call site means runScriptLabel, `goto` and `call` all resolve
	// through it without knowing it exists.
	S.mapScripts = applySailFix({ ...sharedScripts, ...(c.scr || {}) });
	S.mapStrings = c.str || {};
}

// fire-and-forget: warm the sprites a battle on THIS map would need (party
// back-sprites + the local encounter table's fronts) so a wild encounter
// doesn't stall on cold sprite fetches with the screen frozen. getImage
// memoizes, so battle start() finds these already resolved.
function warmBattleSprites() {
	try {
		const warm = f => { if (f) getImage(`data/pokemon/${f}`).catch(() => {}); };
		for (const m of S.party || []) if (m?.sprite) warm(m.sprite.replace(/\.(png|gif)$/, '-b.$1'));
		const groups = encounters.data?.[world.current?.map?.id] || {};
		const ids = new Set();
		for (const kind of ['land', 'water']) for (const s of groups[kind]?.slots || []) if (s.id != null) ids.add(s.id);
		let n = 0;
		for (const id of ids) { if (n++ >= 12) break; warm(battle.data?.species?.[id]?.sprite); }
	} catch { /* prefetch is best-effort */ }
}

export async function refreshMapContent(label) {
	S.strengthActive = false; S.strengthHinted = false; // STRENGTH must be re-used per map
	trickHouseOpenDoors(label);
	shoalFixup(label);
	silphDoorsApply(label);
	hillPrepFloor(label); // must precede npcs.loadForMap — it injects the guards
	roamersOnMapChange();
	S.radioTune = null; // leaving the room switches the radio off; map track resumes
	if (!/^SecretBase_/.test(label || '')) S.baseCtx = null; // left the base

	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	services.loadForMap();
	arcade.loadForMap();
	blockers.loadForMap();
	portals.loadForMap();
	items.loadForMap();
	// the real games wipe the TEMP flag range on every map transition
	// (ClearTempFieldEventData); ours persists it, so do it here
	Story.clearTempFlags();
	noteOutdoor();
	await loadMapScripts(world.current.name);
	hud.textContent = world.current.map.name || label;
	// classic sliding area-name banner on entering a new OUTDOOR area (not buildings)
	if (world.current.map.map_type !== 'MAP_TYPE_INDOOR' && !world.current.map.indoor) showAreaBanner(world.current.map.name);
	// arriving on a Fly-destination map registers it so you can fly back later
	markFlyPoint(world.current.map.id);
	savePos();
	S.loading = false;
	refreshFollower();
	warmBattleSprites();
	// run this map's ON_TRANSITION script (story vars, scene setup), then check
	// for an ON_FRAME auto-cutscene now that the map is set up. Guard the ported
	// plot triggers: a throwing story script must not break map entry itself
	// (the map is already loaded + loading cleared above).
	await runMapSetupScripts(false);
	try { checkOnFrame(); } catch (e) { console.warn('[plot] onFrame failed', e); if (cutscene.blocking) cutscene.stop(); }
	// a post-battle beat that was won before the game could run it (see above)
	S.postBattleCatchUpArmed = true;   // fired by the tick once the screen is free (see there)
	// a partyless new-game player who has reached the region's lab: run the
	// professor greeting + on-screen starter pick (Fork B authentic open)
	try { checkIntroTrigger(); } catch (e) { console.warn('[intro] trigger failed', e); }
	// villain-arc boss confrontation on entering an evil-team location
	try { checkVillainTrigger(); } catch (e) { console.warn('[villain] trigger failed', e); if (cutscene.blocking) cutscene.stop(); }
	// the recurring cross-region rival intercepts you at the current tier's gym town
	try { checkRivalTrigger(); } catch (e) { console.warn('[rival] trigger failed', e); if (cutscene.blocking) cutscene.stop(); }
	// Hoenn legendary-awakening beats (post-climax): KYOGRE/GROUDON clash -> RAYQUAZA
	try { checkAwakeningTrigger(); } catch (e) { console.warn('[awakening] trigger failed', e); if (cutscene.blocking) cutscene.stop(); }
	// the safari PA speaks the moment you cross into (or out of) the zone
	try { checkSafariGate(); } catch (e) { console.warn('[safari] gate check failed', e); }
	syncMapBgm();
	refreshObjective();
}

// visited Fly points (magepunk_flypoints); a town unlocks when you first stand on it
let flyPoints = null;
function loadFlyPoints() {
	if (flyPoints) return flyPoints;
	const fp = safeLoad('magepunk_flypoints', []);
	flyPoints = new Set(Array.isArray(fp) ? fp : []);
	return flyPoints;
}
export function markFlyPoint(mapId) {
	if (!mapId || !Fly.REGION_OF[mapId]) return;
	const fp = loadFlyPoints();
	if (fp.has(mapId)) return;
	fp.add(mapId);
	safeSave('magepunk_flypoints', [...fp]);
}
export function hasFlyPoint(mapId) { return loadFlyPoints().has(mapId); }

// nearest walkable tile to a preferred spot (spiral search)
export function findLanding(px, py) {
	for (let r = 0; r < 14; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
				const x = px + dx, y = py + dy;
				if (world.isPassable(x, y) && !world.isSurfable(x, y)) return [x, y];
			}
		}
	}
	return [px, py];
}
// nearest SURFABLE (water) tile to a preferred spot — used when emerging into a
// lake whose underwater twin is a different size (Sootopolis), so the same-tile
// clamp wouldn't land on water
export function findSurfLanding(px, py) {
	for (let r = 0; r < 24; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
				const x = px + dx, y = py + dy;
				if (world.isSurfable(x, y)) return [x, y];
			}
		}
	}
	return [px, py];
}

// direct travel (region select, ferries): land near the map's center
// load-guard: on any load failure world.load leaves world.current on the old
// (valid) map — this.current is only reassigned after a full successful render —
// so the player just stays put. Clear loading + kill any wedged cutscene so the
// game never freezes on a bad warp/connection.
export function afterLoadError(where, err) {
	console.warn(`[load-guard] ${where} failed`, err);
	S.loading = false;
	if (cutscene.blocking) cutscene.stop();
	hud.textContent = "That area couldn't be loaded.";
}

export async function moveToMap(file, px, py) {
	await fadeTo(1);              // dip to black before the swap (fades in below)
	S.loading = true;
	try {
		await world.load(file);
		const cx = px ?? Math.floor(world.current.layout.width / 2);
		const cy = py ?? Math.floor(world.current.layout.height / 2);
		player.setTile(...findLanding(cx, cy));
		player.surfing = false;
		await refreshMapContent(file);
	} catch (e) { afterLoadError('moveToMap ' + file, e); }
	fadeTo(0);                    // reveal the new map
}

export async function warpTo(mapId, destWarpId, destX, destY) {
	const file = world.fileFor(mapId);
	// An unresolvable destination used to just warn and return, leaving the player
	// standing on the warp tile. That is a SOFTLOCK wherever every exit is
	// unresolvable and there is no connection to walk out through — six elevators
	// (Silph Co, Rocket Hideout, Trainer Tower, Celadon/Lilycove dept stores,
	// Marine Cave) trapped you for good, since Fly is blocked indoors and Escape
	// Rope does nothing. backWarp() puts you back where you came from, and falls
	// back to the region's start town if even that is unknown.
	if (!file) {
		console.warn('unknown warp dest', mapId, '- returning the player instead of stranding them');
		await backWarp();
		return;
	}
	sfx('door');
	const source = { name: world.current.name, tx: player.tx, ty: player.ty };
	await fadeTo(1);             // dip to black as the door opens (fades in below)
	S.loading = true;
	try {
		await world.load(file);
		let idx = parseInt(destWarpId, 10);
		const lay = world.current.layout;
		const hasXY = Number.isInteger(destX) && Number.isInteger(destY) && destX >= 0 && destY >= 0
			&& destX < lay.width && destY < lay.height;
		// A scripted warp to a COORDINATE (the decomp's two-arg form) lands exactly
		// there. A door index wins when it names a real door; the coordinate is the
		// fallback — the decomp's own rule for its three-arg form.
		const w = (!isNaN(idx) && idx >= 0 && world.warps[idx]) || null;
		if (w) player.setTile(w.x, w.y);
		else if (hasXY) player.setTile(destX, destY);
		else if (world.warps[0]) player.setTile(world.warps[0].x, world.warps[0].y);
		else player.setTile(Math.floor(world.current.layout.width / 2), Math.floor(world.current.layout.height / 2));
		world.lastWarpSource = source;
		await refreshMapContent(file);
	} catch (e) { afterLoadError('warpTo ' + mapId, e); }
	fadeTo(0);                   // reveal the destination
}

// Fly: warp straight to a town's landing tile (no warp-index lookup)
export async function flyTo(mapId, tx, ty) {
	const file = world.fileFor(mapId);
	if (!file) { console.warn('unknown fly dest', mapId); return; }
	S.loading = true;
	player.surfing = false;
	try {
		await world.load(file);
		const lay = world.current.layout;
		const cx = Math.min(Math.max(0, tx), lay.width - 1);
		const cy = Math.min(Math.max(0, ty), lay.height - 1);
		player.setTile(...findLanding(cx, cy));
		await refreshMapContent(file);
	} catch (e) { afterLoadError('flyTo ' + mapId, e); }
}

// A Crystal -1 warp means "put me back where I came from". The source is
// remembered in memory and now also persisted with the save position — but this
// must NEVER be able to do nothing, because the maps that use it (Pokecenter2F,
// the dept-store elevators, the Fast Ship) have no other way out. If the source
// is somehow missing, fall back to the region's start town: a big hop, but the
// alternative is being sealed in a room forever.
export async function backWarp() {
	// in-memory source first, then the one saved alongside the position (this is
	// what survives a reload)
	const src = world.lastWarpSource || safeLoad(POS_KEY, null)?.back || null;
	// src.name is a map FILE stem (what world.load takes) — not a MAP_ id, so it
	// must not be validated through fileFor(), which maps ids TO stems.
	if (src?.name) {
		S.loading = true;
		try {
			await world.load(src.name);
			player.setTile(src.tx, src.ty);
			await refreshMapContent(src.name);
			world.lastWarpSource = null; // spent
			return;
		} catch (e) { console.warn('backWarp ' + src.name + ' failed, using the fallback', e); }
	}
	// last resort — a failed or missing source must never leave the player sealed in
	hud.textContent = 'You found your own way out.';
	await moveToMap(Quest.START[playerRegion()] || 'PalletTown');
}



