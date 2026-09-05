// portals.js — inter-region PORTAL PADS. The three shared regions (Kanto / Johto /
// Hoenn) are isolated map graphs, so the cross-region badge-thirds progression (beat
// gym N in every region before gym N+1 anywhere — see quest.js globalTier) needs a way
// to hop between them in one save. A pair of portals FLANKS each gym town's Pokemon
// Center door (one left, one right) and links the three regions' SAME-TIER gym towns,
// at all 8 tiers (Pewter↔Violet↔Rustboro, Cerulean↔Azalea↔Dewford, … up to gym 8).
// Placed programmatically per map id (the blockers.js pattern — map data is read-only).
// Using one (face + A) opens a small destination menu (wired in main.js) that flies you
// to the chosen region's same-tier gym town and flips the current region so all the
// region-derived logic (gating, objective, white-out, villain arcs) tracks where you are.
//
// JohKanto (the Gen-2 Kanto 16-badge post-game path) is deliberately excluded — only the
// three shared regions' FireRed/Crystal/Emerald gym towns are wired.
//
// Portal art: fx/portal.png — 6 frames of 32x32, a purple swirl with a green highlight
// arm. Derived (downscale + recolour) from "Pixel Dimensional Portal 32x32" by
// Pixelnauta (https://pixelnauta.itch.io/pixel-dimensional-portal-32x32), CC-BY 4.0;
// recolouring is expressly permitted by the author. Credit: @pxlnauta.
import { META, getImage } from './engine.js';
import { GYMS, globalTier } from './quest.js';
import { FLY } from './flydata.js';

let portalSheet = null; // 192x32 (6 frames); the procedural glow is the fallback
getImage('fx/portal.png').then(img => { portalSheet = img; }).catch(() => {});
const FRAMES = 6, FW = 32, FH = 32;

const SHARED = ['KANTO', 'JOHTO', 'HOENN'];
const LOWER = { KANTO: 'kanto', JOHTO: 'johto', HOENN: 'hoenn' };

// a town's file stem (e.g. 'PewterCity') -> its MAP_ id (e.g. 'MAP_PEWTER_CITY').
// CamelCase → SCREAMING_SNAKE; verified to hold for all 24 gym towns (recon).
function mapIdOf(townMap) {
	return 'MAP_' + townMap.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}
// a town's registered Fly landing (front of its Pokemon Center) — reused as the arrival
// tile so you step out right next to that town's own portal pad.
function landingFor(mapId) {
	for (const r of Object.keys(FLY)) { const e = FLY[r].find(d => d.map === mapId); if (e) return { x: e.x, y: e.y }; }
	return { x: 0, y: 0 };
}

// PORTAL_TOWNS[MAP_id] = { region, tier } for the 24 shared-region gym towns
export const PORTAL_TOWNS = (() => {
	const t = {};
	for (const region of SHARED) GYMS[region].forEach((g, tier) => { t[mapIdOf(g.townMap)] = { region, tier }; });
	return t;
})();

// the two OTHER shared regions' gym town at the same tier — the travel destinations
export function destsFor(region, tier) {
	return SHARED.filter(r => r !== region).map(r => {
		const g = GYMS[r][tier];
		const mapId = mapIdOf(g.townMap);
		const land = landingFor(mapId);
		return { region: r, regionLower: LOWER[r], mapId, town: g.town, x: land.x, y: land.y };
	});
}

// the town-side Pokemon Center door across all three regions' naming conventions:
//   FireRed  MAP_<TOWN>_CITY_POKEMON_CENTER_1F
//   Emerald  MAP_<TOWN>_CITY|TOWN_POKEMON_CENTER_1F
//   Crystal  MAP_<TOWN>_POKECENTER_1F   (no MON_, town suffix dropped)
const PC_RE = /POKE(?:MON_)?CENTER_1F$/;

// where to try placing each pad relative to the PC door: one portal LEFT of the
// entrance, one RIGHT (never the vertical approach column [0,±1], which would wall
// the door). Each side walks outward until a free tile takes; a side that finds no
// spot is skipped rather than walling anything.
const LEFT_OFFSETS = [
	[-1, 0], [-2, 0], [-1, 1], [-2, 1], [-1, -1], [-2, -1], [-3, 0], [-3, 1], [-1, 2], [-2, 2],
];
const RIGHT_OFFSETS = LEFT_OFFSETS.map(([dx, dy]) => [-dx, dy]);

export class Portals {
	constructor(world) { this.world = world; this.list = []; }

	loadForMap() {
		this.list = [];
		const map = this.world.current.map;
		const spec = PORTAL_TOWNS[map.id];
		if (!spec) return;
		// anchor to the town's Pokemon Center door (a walkable tile); centre as a fallback
		const warps = map.warp_events || [];
		const pc = warps.find(w => PC_RE.test(String(w.dest_map || '')));
		const ax = pc ? +pc.x : Math.floor(this.world.current.layout.width / 2);
		const ay = pc ? +pc.y : Math.floor(this.world.current.layout.height / 2);
		// Match the SHARED PROGRESSION, not this town's gym number. Town order != gym
		// order — Kanto's first reachable gym town is VIRIDIAN, whose gym is #8 — so a
		// tier-by-gym-number portal would fling an early player to the other regions'
		// endgame towns (too far), where the badge gate then TRAPS them (they can't
		// step out of that town's Pokemon Center). Clamp to globalTier so the pad never
		// sends you past where you're allowed to be.
		const destTier = Math.min(spec.tier, globalTier());
		const dests = destsFor(spec.region, destTier);
		for (const side of [LEFT_OFFSETS, RIGHT_OFFSETS]) {
			const tile = this.placeNear(ax, ay, side);
			if (!tile) continue; // this side has no open spot — skip rather than wall anything
			this.list.push({ tx: tile[0], ty: tile[1], tier: destTier, region: spec.region, dests });
		}
	}

	// a walkable, warp-free tile beside the PC door (not the door itself, and never a
	// tile another pad already claimed)
	placeNear(ax, ay, offsets) {
		const w = this.world;
		const isWarp = (x, y) => (w.current.map.warp_events || []).some(e => +e.x === x && +e.y === y);
		for (const [dx, dy] of offsets) {
			const x = ax + dx, y = ay + dy;
			if (w.isPassable(x, y) && !w.isSurfable(x, y) && !isWarp(x, y) && !this.blocks(x, y)) return [x, y];
		}
		return null;
	}

	blocks(tx, ty) { return this.list.some(p => p.tx === tx && p.ty === ty); }
	at(tx, ty) { return this.list.find(p => p.tx === tx && p.ty === ty) || null; }

	// the swirl sprite (fx/portal.png) standing on a soft glowing footprint; the
	// old procedural pad is the fallback while the sheet loads. Camera-relative.
	draw(ctx, camX, camY) {
		const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
		const pulse = 0.5 + 0.5 * Math.sin(now * 3);
		const frame = Math.floor(now * 8) % FRAMES;
		for (const p of this.list) {
			const px = p.tx * META - camX, py = p.ty * META - camY;
			const cx = px + META / 2, cy = py + META / 2;
			ctx.save();
			// glowing footprint under the swirl
			const g = ctx.createRadialGradient(cx, cy + META * 0.2, 1, cx, cy + META * 0.2, META * 0.95);
			g.addColorStop(0, `rgba(190,130,255,${portalSheet ? 0.45 : 0.9})`);
			g.addColorStop(0.55, `rgba(110,220,140,${(portalSheet ? 0.18 : 0.4) + 0.2 * pulse})`);
			g.addColorStop(1, 'rgba(40,20,80,0)');
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.ellipse(cx, cy + META * 0.22, META * 0.78, META * 0.5, 0, 0, Math.PI * 2);
			ctx.fill();
			if (portalSheet) {
				// 32x32 upright swirl, centred on the tile, base planted on the pad
				ctx.imageSmoothingEnabled = false;
				ctx.drawImage(portalSheet, frame * FW, 0, FW, FH,
					Math.round(cx - FW / 2), Math.round(py + META - FH + 2), FW, FH);
			} else {
				// fallback: the original procedural shimmer ring + sparks
				ctx.strokeStyle = `rgba(210,235,255,${0.55 * pulse + 0.2})`;
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.ellipse(cx, cy - 2 - 4 * pulse, META * 0.42 * (0.6 + 0.4 * pulse), META * 0.2, 0, 0, Math.PI * 2);
				ctx.stroke();
				ctx.fillStyle = `rgba(235,245,255,${0.7 * pulse})`;
				ctx.fillRect(Math.round(cx - 1), Math.round(cy - META * 0.5 * pulse - 2), 2, 2);
				ctx.fillRect(Math.round(cx + META * 0.3 - 1), Math.round(cy - META * 0.2 * pulse), 2, 2);
			}
			ctx.restore();
		}
	}
}
