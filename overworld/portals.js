// portals.js — inter-region PORTAL PADS. The three shared regions (Kanto / Johto /
// Hoenn) are isolated map graphs, so the cross-region badge-thirds progression (beat
// gym N in every region before gym N+1 anywhere — see quest.js globalTier) needs a way
// to hop between them in one save. A portal pad sits beside each gym town's Pokemon
// Center and links the three regions' SAME-TIER gym towns, at all 8 tiers (Pewter↔
// Violet↔Rustboro, Cerulean↔Azalea↔Dewford, … up to gym 8). Placed programmatically per
// map id (the blockers.js pattern — map data is read-only). Rendered as a glowing canvas
// pad; using it (face + A) opens a small destination menu (wired in main.js) that flies
// you to the chosen region's same-tier gym town and flips the current region so all the
// region-derived logic (gating, objective, white-out, villain arcs) tracks where you are.
//
// JohKanto (the Gen-2 Kanto 16-badge post-game path) is deliberately excluded — only the
// three shared regions' FireRed/Crystal/Emerald gym towns are wired.
import { META } from './engine.js';
import { GYMS } from './quest.js';
import { FLY } from './flydata.js';

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

// where to try placing the pad relative to the PC door: the side tiles first (never the
// vertical approach column [0,±1], which would wall the door), then a widening ring.
const OFFSETS = [
	[-1, 0], [1, 0], [-1, 1], [1, 1], [-1, -1], [1, -1],
	[-2, 0], [2, 0], [-2, 1], [2, 1], [-1, 2], [1, 2], [-2, -1], [2, -1],
	[-3, 0], [3, 0], [0, 2], [0, 3], [-2, 2], [2, 2],
];

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
		const tile = this.placeNear(ax, ay);
		if (!tile) return; // no open spot found — skip rather than wall anything
		this.list.push({ tx: tile[0], ty: tile[1], tier: spec.tier, region: spec.region, dests: destsFor(spec.region, spec.tier) });
	}

	// a walkable, warp-free tile adjacent to the PC door (not the door itself)
	placeNear(ax, ay) {
		const w = this.world;
		const isWarp = (x, y) => (w.current.map.warp_events || []).some(e => +e.x === x && +e.y === y);
		for (const [dx, dy] of OFFSETS) {
			const x = ax + dx, y = ay + dy;
			if (w.isPassable(x, y) && !w.isSurfable(x, y) && !isWarp(x, y)) return [x, y];
		}
		return null;
	}

	blocks(tx, ty) { return this.list.some(p => p.tx === tx && p.ty === ty); }
	at(tx, ty) { return this.list.find(p => p.tx === tx && p.ty === ty) || null; }

	// a pulsing arcane pad — pure canvas (no art). Drawn in the world layer, camera-relative.
	draw(ctx, camX, camY) {
		const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
		const pulse = 0.5 + 0.5 * Math.sin(now * 3);
		for (const p of this.list) {
			const px = p.tx * META - camX, py = p.ty * META - camY;
			const cx = px + META / 2, cy = py + META / 2;
			ctx.save();
			// glowing footprint
			const g = ctx.createRadialGradient(cx, cy + META * 0.2, 1, cx, cy + META * 0.2, META * 0.95);
			g.addColorStop(0, 'rgba(190,130,255,0.9)');
			g.addColorStop(0.55, `rgba(90,180,255,${0.4 + 0.3 * pulse})`);
			g.addColorStop(1, 'rgba(40,20,80,0)');
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.ellipse(cx, cy + META * 0.22, META * 0.78, META * 0.5, 0, 0, Math.PI * 2);
			ctx.fill();
			// rising shimmer ring
			ctx.strokeStyle = `rgba(210,235,255,${0.55 * pulse + 0.2})`;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.ellipse(cx, cy - 2 - 4 * pulse, META * 0.42 * (0.6 + 0.4 * pulse), META * 0.2, 0, 0, Math.PI * 2);
			ctx.stroke();
			// a couple of sparks
			ctx.fillStyle = `rgba(235,245,255,${0.7 * pulse})`;
			ctx.fillRect(Math.round(cx - 1), Math.round(cy - META * 0.5 * pulse - 2), 2, 2);
			ctx.fillRect(Math.round(cx + META * 0.3 - 1), Math.round(cy - META * 0.2 * pulse), 2, 2);
			ctx.restore();
		}
	}
}
