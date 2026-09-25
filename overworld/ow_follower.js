// ow_follower.js — the follower (your lead POKeMON walks behind you, HG/SS style), plus what sat in the same stretch of main.js: the static-legendary triggers (legendaryHere / startLegendaryBattle), rift wilds, dex milestones, map weather (mapWeatherNow) and the battle backdrop (battle.stageOf).
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Bag from './bag.js';
import * as Clock from './clock.js';
import { META, getImage } from './engine.js';
import * as Story from './events.js';
import { battle, dialog, evolution, hud, player, world } from './ow_core.js';
import { LEGENDARY_ENCOUNTERS } from './ow_legendaries.js';
import { whiteOut } from './ow_places.js';
import { syncOverworldAchievements } from './ow_saves.js';
import { scaleLegendaryLevel } from './ow_scaling.js';
import { offerNickname } from './ow_screens.js';
import { S } from './ow_state.js';
import { addCaught, leadMon, saveParty } from './party.js';
import * as Dex from './pokedex.js';
import * as Settings from './settings.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import {
	legendStats,
} from './main.js';

// ---------- follower (lead POKeMON walks behind you, HG/SS style) ----------
// 4x4 walk sheet from data/pokemon_follow/<id>.png: rows down/left/right/up,
// cols = walk frames. It trails onto whatever tile the player just vacated.
export const followCache = new Map();
export function followSheet(id) {
	if (!id) return null;
	// fakemon (negative dex numbers) have no dedicated follower sheet — always fall
	// back to the battle-sprite mini. Also cache-proofs the removed AI sheets: even
	// if a stale CDN copy of data/pokemon_follow/<fakemon>.png lingers, we never load it.
	if ((battle.data?.species?.[id]?.num || 0) < 0) { if (followCache.get(id) !== 'none') followCache.set(id, 'none'); return null; }
	if (!followCache.has(id)) {
		followCache.set(id, null);
		getImage(`data/pokemon_follow/${id}.png`).then(img => followCache.set(id, img)).catch(() => {
			// a FORM falls back to its base species' walk sheet
			// (aegislash_blade -> aegislash); 'none' marks the search exhausted
			const base = id.includes('_') ? id.split('_')[0] : null;
			if (base) getImage(`data/pokemon_follow/${base}.png`).then(img => followCache.set(id, img)).catch(() => followCache.set(id, 'none'));
			else followCache.set(id, 'none');
		});
	}
	const v = followCache.get(id);
	return v === 'none' ? null : v;
}
// 855 species (the Ransei fakemon + the newest dex) have no walk sheet at all:
// their battle sprite trots along as a bobbing mini instead of vanishing
const followMiniCache = new Map();
export function followMini(id) {
	if (!followMiniCache.has(id)) {
		followMiniCache.set(id, null);
		const sp = battle.data.species[id];
		if (sp?.sprite) getImage(`data/pokemon/${sp.sprite}`).then(img => followMiniCache.set(id, img)).catch(() => {});
	}
	return followMiniCache.get(id);
}
// a crisp, pre-shrunk mini for fakemon followers. A battle sprite is 64–256px; a
// single nearest-neighbour shrink to ~20px aliased it to mush. This box-downscales
// in halving steps at high quality (the standard way to shrink detailed art),
// caches the result canvas, and the follower draws it 1:1 — much cleaner.
const MINI_PX = 20; // a touch over a grid square (META 16) — more detail, still tile-ish
const miniCvCache = new Map();
function followMiniCanvas(id) {
	if (miniCvCache.has(id)) return miniCvCache.get(id);
	const src = followMini(id);
	if (!src || !src.width) return null;              // still loading — retry next frame (not cached)
	let cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
	let cx = cv.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
	cx.drawImage(src, 0, 0);
	while (Math.max(cv.width, cv.height) > MINI_PX * 2) {   // halve until within 2x of target
		const nw = Math.max(1, Math.round(cv.width / 2)), nh = Math.max(1, Math.round(cv.height / 2));
		const nc = document.createElement('canvas'); nc.width = nw; nc.height = nh;
		const ncx = nc.getContext('2d'); ncx.imageSmoothingEnabled = true; ncx.imageSmoothingQuality = 'high';
		ncx.drawImage(cv, 0, 0, nw, nh); cv = nc;
	}
	const s = MINI_PX / Math.max(cv.width, cv.height);
	const fw = Math.max(1, Math.round(cv.width * s)), fh = Math.max(1, Math.round(cv.height * s));
	const fc = document.createElement('canvas'); fc.width = fw; fc.height = fh;
	const fcx = fc.getContext('2d'); fcx.imageSmoothingEnabled = true; fcx.imageSmoothingQuality = 'high';
	fcx.drawImage(cv, 0, 0, fw, fh);
	// crisp it: the smooth shrink leaves a soft semi-transparent edge halo that
	// looks blurry once the frame is nearest-upscaled. Snap alpha to hard on/off so
	// the silhouette reads sharp (canvas is CORS-clean, so getImageData works).
	try {
		const im = fcx.getImageData(0, 0, fw, fh), d = im.data;
		for (let p = 3; p < d.length; p += 4) d[p] = d[p] >= 96 ? 255 : 0;
		fcx.putImageData(im, 0, 0);
	} catch (e) { /* tainted (no CORS) — keep the smooth version */ }
	miniCvCache.set(id, fc);
	return fc;
}
const FOLLOW_ROW = { down: 0, left: 1, right: 2, up: 3 };
export let follower = null;
let lastPlayerTile = null;
export function refreshFollower() {
	follower = null;
	lastPlayerTile = { x: player.tx, y: player.ty };
	if (!Settings.get('followers') || !S.party) return;
	const lead = S.party.find(m => m.curHP > 0) || S.party[0];
	if (!lead || !lead.speciesId) return;
	follower = { id: lead.speciesId, tx: player.tx, ty: player.ty, px: player.tx * META, py: player.ty * META,
		facing: player.facing, moving: false, from: null, to: null, t: 0, dur: 0.13, step: 0 };
}
// force a follower of ANY species, independent of the party — the owner
// follower-test tool must preview sprites even on a save with no party (which is
// why refreshFollower(), which builds from the party lead, made no follower).
export function setFollowerSpecies(id) {
	if (!id) { follower = null; return; }
	follower = { id, tx: player.tx, ty: player.ty, px: player.tx * META, py: player.ty * META,
		facing: player.facing, moving: false, from: null, to: null, t: 0, dur: 0.13, step: 0 };
	lastPlayerTile = { x: player.tx, y: player.ty };
}
function stepFollower(tx, ty) {
	if (!follower) return;
	if (follower.tx === tx && follower.ty === ty) return;
	if (follower.moving) { follower.px = follower.to[0]; follower.py = follower.to[1]; follower.tx = Math.round(follower.px / META); follower.ty = Math.round(follower.py / META); }
	const dx = tx - follower.tx, dy = ty - follower.ty;
	follower.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
	follower.from = [follower.px, follower.py];
	follower.to = [tx * META, ty * META];
	follower.tx = tx; follower.ty = ty; follower.moving = true; follower.t = 0;
	follower.step ^= 1;
	// keep pace with a running/biking player
	follower.dur = player.biking ? 0.07 : player.run ? 0.08 : 0.13;
}
export function updateFollower(dt) {
	if (!Settings.get('followers')) { follower = null; return; }
	if (!follower) { if (S.party) refreshFollower(); return; }
	// the player moved onto a new tile — trail onto the one they left
	if (lastPlayerTile && (player.tx !== lastPlayerTile.x || player.ty !== lastPlayerTile.y)) {
		stepFollower(lastPlayerTile.x, lastPlayerTile.y);
		lastPlayerTile = { x: player.tx, y: player.ty };
	}
	if (follower.moving) {
		follower.t += dt / follower.dur;
		if (follower.t >= 1) { follower.px = follower.to[0]; follower.py = follower.to[1]; follower.moving = false; }
		else { follower.px = follower.from[0] + (follower.to[0] - follower.from[0]) * follower.t; follower.py = follower.from[1] + (follower.to[1] - follower.from[1]) * follower.t; }
	}
}
export function drawFollower(ctx, camX, camY) {
	if (!follower || player.surfing) return;
	const img = followSheet(follower.id);
	if (!img) {
		if (followCache.get(follower.id) !== 'none') return; // sheets still loading
		const mini = followMiniCanvas(follower.id);          // pre-shrunk, crisp (see followMiniCanvas)
		if (!mini) return;
		const w = mini.width, h = mini.height;               // already at final size — draw 1:1
		const bob = follower.moving && follower.step ? -1 : 0;
		const mx = Math.round(follower.px + META / 2 - w / 2 - camX);
		const my = Math.round(follower.py + META - h - camY + bob);
		ctx.imageSmoothingEnabled = false;
		if (follower.facing === 'right') {          // mirror the single sprite to face the way it's walking
			ctx.save();
			ctx.translate(mx + w, my); ctx.scale(-1, 1);
			ctx.drawImage(mini, 0, 0);
			ctx.restore();
		} else {
			ctx.drawImage(mini, mx, my);
		}
		return;
	}
	const fs = img.width / 4;                 // 4 columns
	const col = follower.moving ? (follower.step ? 1 : 3) : 0;
	const row = FOLLOW_ROW[follower.facing] ?? 0;
	const dw = 26, dh = 26;                    // a touch bigger than a tile
	const dx = Math.round(follower.px + META / 2 - dw / 2 - camX);
	const dy = Math.round(follower.py + META - dh - camY);
	ctx.drawImage(img, col * fs, row * fs, fs, fs, dx, dy, dw, dh);
}
// all un-caught, requirement-met legendaries on the current map (a map may hold
// several, e.g. the Tin Tower beasts — stored as an array)
export function legendariesHere() {
	const v = LEGENDARY_ENCOUNTERS[world.current.map.id];
	if (!v) return [];
	return (Array.isArray(v) ? v : [v]).filter(e => !Story.getFlag(e.flag) && (!e.requires || e.requires()));
}
export function legendaryHere() { return legendariesHere()[0] || null; } // the first (single-per-map back-compat)
export function startLegendaryBattle(e) {
	if (!S.party || !leadMon(S.party) || battle.blocking) return;
	Dex.markSeen(e.species);
	dialog.open(e.intro, () => {
		battle.themeHint = /^regi(rock|ce|steel)/.test(e.species) ? 'regi' : 'legendary';
		battle.endSpec = { kind: 'legendary', species: e.species, flag: e.flag };
		battle.start(S.party, e.species, scaleLegendaryLevel(e.level), result => {
			if (result === 'caught' && battle.lastCaught) {
				Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
				const where = addCaught(S.party, battle.lastCaught);
				hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
				offerNickname(battle.lastCaught);
				Story.setFlag(e.flag);
				syncOverworldAchievements(); // a legendary was CAUGHT (only catches count toward the sets)
			} else if (result === 'victory') {
				Story.setFlag(e.flag); // fainted it — it won't reappear (matches the games)
				evolution.check(S.party, battle.data);
			} else if (result === 'defeat') {
				whiteOut();
			} else {
				saveParty(S.party); // ran / fled: leave it catchable
			}
		});
	});
}
// on-arrive: standing on a legendary's tile starts that encounter
export function checkLegendaryTrigger() {
	const e = legendariesHere().find(x => player.tx === x.x && player.ty === x.y);
	if (e) { startLegendaryBattle(e); return true; }
	return false;
}

// the Ransei rift pool: imported fakemon (dex num <= 0) with usable learnsets
let riftPool = null;
export function riftSpecies() {
	if (!riftPool) {
		riftPool = Object.entries(battle.data.species)
			.filter(([, s]) => (s.num || 0) <= 0 && s.learnset?.length)
			.map(([id]) => id);
	}
	return riftPool.length ? riftPool[Math.floor(Math.random() * riftPool.length)] : null;
}

// pokédex milestones: grant newly crossed rewards with a fanfare
export function dexMilestoneCheck() {
	const won = Dex.claimMilestones();
	if (won.length) {
		for (const m of won) Bag.addItem(m.item, m.count);
		dialog.open('POKeDEX MILESTONE!\n\n' + won.map(m => `${m.t} caught — you received ${m.label}!`).join('\n'));
	}
	// catching ALL the placed legendaries is its own summit — checked here
	// because every catch path already funnels through this function
	if (!Story.getFlag('all_legends_caught')) {
		const { caught, total } = legendStats();
		if (total > 0 && caught >= total) {
			Story.setFlag('all_legends_caught');
			Bag.addItem('legendcharm', 1); Bag.registerName('legendcharm', 'LEGEND CHARM');
			Bag.addItem('masterball', 3);
			if (!dialog.blocking) dialog.open(`Every legendary POKeMON — all ${total} — is yours.\n\nYou received the LEGEND CHARM and 3 MASTER BALLS!`);
			syncOverworldAchievements();
		}
	}
}

// ---------- ambient weather ----------
// The in-battle weather engine has been complete for ages; nothing ever handed
// it an ENVIRONMENTAL value, so Hoenn's desert and rainforest routes began every
// fight in clear skies. Endless (Infinity turns) — moves and abilities overwrite
// it with their own timed spells as usual. Emerald's canonical weather routes,
// plus hail on the Mt Silver climb (its Gen-4 identity).
const MAP_WEATHER = {
	MAP_ROUTE111: 'sandstorm',   // the Hoenn desert
	MAP_ROUTE113: 'ash',         // volcanic ashfall from Mt Chimney
	MAP_ROUTE119: 'rain',        // the rain belt
	MAP_ROUTE120: 'rain',
	MAP_ROUTE123: 'rain',
	MAP_SILVER_CAVE_OUTSIDE: 'hail',
};
export function mapWeatherNow() { return MAP_WEATHER[world.current?.map?.id] || null; }
// which visual battle STAGE this encounter happens on — the battle can't see the
// overworld, so we hand it a { terrain, night } derived from the current map.
// Terrain drives the backdrop + platform (battle.js drawStage/drawSide).
function battleStageNow() {
	let terrain = 'grass';
	const m = world.current?.map || {};
	const t = m.map_type || '', id = m.id || '';
	if (player.surfing) terrain = 'water';
	else if (t === 'MAP_TYPE_UNDERGROUND') terrain = 'cave';
	else if (t === 'MAP_TYPE_INDOOR') terrain = 'indoor';
	else if (/DESERT|SAND|BEACH/.test(id)) terrain = 'sand';
	else if (/FOREST|WOODS|ILEX/.test(id)) terrain = 'forest';
	else if (/CITY|TOWN/.test(id)) terrain = 'city';
	let night = false; try { night = Clock.phase() === 'night'; } catch (e) { /* clock optional */ }
	return { terrain, night };
}
battle.stageOf = battleStageNow; // battle.js reads this at start()/startTrainer()

// last position on an outdoor map — DIG's exit point. Updated on every map
// entry (refreshMapContent), so stepping into a cave remembers the doorstep.
