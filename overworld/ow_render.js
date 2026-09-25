// ow_render.js — overworld rendering helpers: the map-editor view flag, camera, unlit-cave darkness, day/night tint, step ambience (grass rustle + footprints), the area-name banner and weather particles. The frame loop itself (tick) stays in main.js.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Clock from './clock.js';
import { META, VIEW_H, VIEW_W } from './engine.js';
import * as Story from './events.js';
import { player, world } from './ow_core.js';
import * as Settings from './settings.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { mapWeatherNow } from './ow_follower.js';
import {
	REDUCED_MOTION_OW,
} from './main.js';

// ---------- map-editor view ----------
// ?mapedit=1 turns the game into a plain map viewer: the camera stops following
// the player, the player and the follower stop drawing, and movement input is
// frozen so nothing warps or trips an encounter under the editor. Entities stay
// drawable behind a toggle — they're map data you often want to see while
// editing. Inert unless the (owner-gated) editor mounts and sets it.
export const editView = { on: false, cam: null, entities: true };

// ---------- camera ----------
export function cameraPos() {
	// the editor pans its own camera; the map is the subject, not the player
	if (editView.on && editView.cam) return [Math.round(editView.cam[0]), Math.round(editView.cam[1])];
	// center on player sprite (feet tile center), GBA-style; no bounds clamp
	const cx = Math.round(player.px + META / 2 - VIEW_W / 2);
	const cy = Math.round(player.py + META / 2 - VIEW_H / 2 - 8);
	return [cx, cy];
}

// day/night colour wash over the world (not menus/HUD). Keyed to the in-game
// hour with smooth dawn/dusk ramps; indoor maps stay untinted.
// ---------- unlit caves ----------
// FLASH had nothing to do. `HM_FIELD.flash` checked `map.requires_flash`, set a
// `flash_<map>` story flag — and NOTHING ANYWHERE read that flag, so even on the
// two Kanto maps that carried the field the cave was never dark. Crystal's
// thirteen PALETTE_DARK maps (Rock Tunnel among them, which is why Gen-2 Kanto
// hands you the HM at all) had no field at all.
//
// A dark map draws black except a small window around the player, until FLASH is
// used there. Generous enough to walk by, tight enough that you want the HM.
const DARK_RADIUS = 44, DARK_FADE = 26;
export function mapIsUnlit() {
	const m = world.current?.map;
	return !!(m?.requires_flash && !Story.getFlag('flash_' + m.id));
}
export function drawCaveDark(ctx, camX, camY) {
	if (editView.on || !mapIsUnlit()) return;
	const cx = Math.round(player.px + META / 2 - camX);
	const cy = Math.round(player.py + META / 2 - camY);
	ctx.save();
	// everything outside the sight radius is solid dark...
	ctx.fillStyle = 'rgba(0,0,0,0.94)';
	ctx.beginPath();
	ctx.rect(0, 0, VIEW_W, VIEW_H);
	ctx.arc(cx, cy, DARK_RADIUS, 0, Math.PI * 2);
	ctx.fill('evenodd');
	// ...and the rim fades in, so the edge of sight is soft rather than a cut circle
	const g = ctx.createRadialGradient(cx, cy, Math.max(0, DARK_RADIUS - DARK_FADE), cx, cy, DARK_RADIUS);
	g.addColorStop(0, 'rgba(0,0,0,0)');
	g.addColorStop(1, 'rgba(0,0,0,0.94)');
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(cx, cy, DARK_RADIUS, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

export function drawDayNightTint(context) {
	if (!Settings.get('dayNight')) return;
	if (world.current?.map?.map_type === 'MAP_TYPE_INDOOR' || world.current?.map?.indoor) return;
	const h = Clock.frac() * 24;
	// piecewise [color, alpha] control points across the day, lerped between
	const pts = [
		[0, [12, 18, 54], 0.42],   // deep night
		[5, [12, 18, 54], 0.42],   // pre-dawn
		[7, [80, 60, 70], 0.20],   // dawn (warm)
		[9, [255, 255, 255], 0.0], // full morning
		[17, [255, 255, 255], 0.0],// day
		[19, [90, 55, 60], 0.22],  // dusk (warm)
		[21, [12, 18, 54], 0.42],  // night falls
		[24, [12, 18, 54], 0.42],
	];
	let a = pts[0], b = pts[pts.length - 1];
	for (let i = 0; i < pts.length - 1; i++) {
		if (h >= pts[i][0] && h <= pts[i + 1][0]) { a = pts[i]; b = pts[i + 1]; break; }
	}
	const t = b[0] === a[0] ? 0 : (h - a[0]) / (b[0] - a[0]);
	const lerp = (x, y) => x + (y - x) * t;
	const col = [Math.round(lerp(a[1][0], b[1][0])), Math.round(lerp(a[1][1], b[1][1])), Math.round(lerp(a[1][2], b[1][2]))];
	const alpha = lerp(a[2], b[2]);
	if (alpha <= 0.01) return;
	context.save();
	context.globalCompositeOperation = 'multiply';
	context.globalAlpha = alpha;
	context.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
	context.fillRect(0, 0, VIEW_W, VIEW_H);
	context.restore();
}

// ---------- step ambience: grass rustle + sand/ash footprints ----------
// Static grass was the giveaway that this is a port. onArrive spawns a one-shot
// rustle when you step into tall/long grass, and a fading footprint pair when
// you step in deep sand / ashy grass. Purely cosmetic, screen-decay by real
// time, camera-relative, capped, REDUCED_MOTION-silent.
export const stepFx = []; // { kind:'rustle'|'print', tx, ty, born, facing }
const MB_DEEP_SAND = 0x0c, MB_ASHGRASS = 0x24; // desert floor (Route 111) + ashy grass (Route 113)
export function spawnStepFx() {
	if (REDUCED_MOTION_OW || !world.current) return;
	const b = world.behaviorAt(player.tx, player.ty);
	const now = performance.now();
	if (world.isTallGrass(player.tx, player.ty)) stepFx.push({ kind: 'rustle', tx: player.tx, ty: player.ty, born: now });
	else if (b === MB_DEEP_SAND || b === MB_ASHGRASS) stepFx.push({ kind: 'print', tx: player.tx, ty: player.ty, born: now, facing: player.facing });
	if (stepFx.length > 40) stepFx.splice(0, stepFx.length - 40);
}
// footprints go down with the ground (under sprites); rustle goes over feet.
export function drawStepFx(ctx, camX, camY, kind) {
	const now = performance.now();
	for (let i = stepFx.length - 1; i >= 0; i--) {
		const f = stepFx[i];
		const life = f.kind === 'print' ? 4500 : 260;
		const t = (now - f.born) / life;
		if (t >= 1) { if (kind === 'rustle') stepFx.splice(i, 1); continue; } // one pass owns removal
		if (f.kind !== kind) continue;
		const bx = f.tx * META - camX, by = f.ty * META - camY, cx = bx + META / 2, cy = by + META / 2;
		if (f.kind === 'print') {
			ctx.save();
			ctx.globalAlpha = 0.4 * (1 - t);
			ctx.fillStyle = '#5a4a34';
			const off = { down: [-3, 2], up: [3, -2], left: [2, 3], right: [-2, 3] }[f.facing] || [0, 3];
			ctx.fillRect(Math.round(cx - 3 + off[0]), Math.round(cy + off[1]), 2, 3);
			ctx.fillRect(Math.round(cx + 1 + off[0]), Math.round(cy + off[1]), 2, 3);
			ctx.restore();
		} else { // rustle: a quick low puff of pale-green flecks
			const k = Math.sin(Math.min(1, t) * Math.PI); // 0→1→0
			ctx.save();
			ctx.globalAlpha = 0.8 * k;
			ctx.fillStyle = '#e6ffcf';
			const spread = 3 + k * 5;
			for (const dx of [-spread, -1, spread]) ctx.fillRect(Math.round(cx + dx), Math.round(cy + 6 - k * 3), 2, 2);
			ctx.strokeStyle = `rgba(120,180,90,${0.7 * k})`;
			ctx.lineWidth = 1;
			ctx.beginPath(); ctx.moveTo(cx - spread, cy + 7); ctx.lineTo(cx, cy + 7 - k * 4); ctx.lineTo(cx + spread, cy + 7); ctx.stroke();
			ctx.restore();
		}
	}
}

// ---------- area-name banner ----------
// The classic location plaque that slides in when you enter a new outdoor area
// (town / route / cave). DOM overlay (crisp text, no canvas-scale math), like the
// MENU cluster; only fires on a name CHANGE so re-entries don't spam it.
let _areaBannerEl = null, _lastAreaName = null;
export function showAreaBanner(name) {
	if (!name || name === _lastAreaName || typeof document === 'undefined') return;
	_lastAreaName = name;
	if (!_areaBannerEl) {
		_areaBannerEl = document.createElement('div');
		_areaBannerEl.id = 'area-banner';
		Object.assign(_areaBannerEl.style, {
			position: 'fixed', top: '16px', left: '0', zIndex: '38', padding: '6px 18px 6px 22px',
			background: 'linear-gradient(90deg, rgba(18,14,30,0.94), rgba(34,26,54,0.9))', color: '#f4ecc9',
			font: '700 15px m6x11plus, "Segoe UI", sans-serif', letterSpacing: '1.5px',
			borderRadius: '0 10px 10px 0', borderRight: '2px solid #c9a24a',
			borderTop: '1px solid #6a5f3a', borderBottom: '1px solid #6a5f3a',
			boxShadow: '0 3px 10px rgba(0,0,0,0.5)', transform: 'translateX(-110%)',
			transition: 'transform 0.35s cubic-bezier(.2,.8,.2,1)', pointerEvents: 'none', whiteSpace: 'nowrap',
		});
		document.body.appendChild(_areaBannerEl);
	}
	// space out camelCase / number runs so "CherrygroveCity" reads "CHERRYGROVE CITY", "Route119" → "ROUTE 119"
	_areaBannerEl.textContent = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').toUpperCase();
	clearTimeout(_areaBannerEl._t);
	_areaBannerEl.style.transform = 'translateX(0)';                    // slide in
	_areaBannerEl._t = setTimeout(() => { if (_areaBannerEl) _areaBannerEl.style.transform = 'translateX(-110%)'; }, 2300); // hold, then out
}

// ---------- overworld weather ----------
// MAP_WEATHER only ever fed BATTLE weather; the route itself showed clear sky.
// A full-screen particle layer (rain/sandstorm/hail/ash) drawn on the GBA frame
// keyed off mapWeatherNow() gives the weather routes their sky. Particles live
// in screen space (they blanket the viewport, not the world), so no camera math.
// REDUCED_MOTION draws the colour wash only, no motion.
export const weatherFx = { type: null, parts: [], last: 0 };
const WEATHER_SPEC = {
	// n: particle count · tint [r,g,b,a] multiply wash · per-particle draw+move
	rain: { n: 90, tint: [70, 90, 130, 0.16], vx: -60, vy: 620, len: 9, draw(ctx, p) { ctx.strokeStyle = 'rgba(170,200,255,0.55)'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 1.4, p.y - p.spec.len); ctx.stroke(); } },
	sandstorm: { n: 130, tint: [150, 120, 70, 0.30], vx: 340, vy: 40, len: 7, draw(ctx, p) { ctx.strokeStyle = `rgba(214,188,130,${p.a})`; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.spec.len, p.y - 1); ctx.stroke(); } },
	hail: { n: 70, tint: [150, 170, 200, 0.16], vx: -20, vy: 200, len: 0, draw(ctx, p) { ctx.fillStyle = 'rgba(230,240,255,0.85)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); } },
	ash: { n: 60, tint: [90, 80, 78, 0.20], vx: 12, vy: 55, len: 0, draw(ctx, p) { ctx.fillStyle = `rgba(120,110,108,${p.a})`; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); } },
};
function spawnWeatherPart(spec, anywhere) {
	return {
		x: Math.random() * (VIEW_W + 40) - 20,
		y: anywhere ? Math.random() * VIEW_H : -Math.random() * 20,
		a: 0.35 + Math.random() * 0.5,
		vj: 0.6 + Math.random() * 0.8, // per-particle speed jitter
		spec,
	};
}
export function drawWeather(ctx) {
	const type = (Settings.get('weather') && !world.current?.map?.indoor
		&& world.current?.map?.map_type !== 'MAP_TYPE_INDOOR') ? mapWeatherNow() : null;
	if (!type || !WEATHER_SPEC[type]) { weatherFx.type = null; weatherFx.parts.length = 0; return; }
	const spec = WEATHER_SPEC[type];
	if (weatherFx.type !== type) {
		weatherFx.type = type;
		weatherFx.parts = Array.from({ length: spec.n }, () => spawnWeatherPart(spec, true));
	}
	// colour wash (multiply) — the sky's mood, drawn even under REDUCED_MOTION
	ctx.save();
	ctx.globalCompositeOperation = 'multiply';
	ctx.globalAlpha = spec.tint[3];
	ctx.fillStyle = `rgb(${spec.tint[0]},${spec.tint[1]},${spec.tint[2]})`;
	ctx.fillRect(0, 0, VIEW_W, VIEW_H);
	ctx.restore();
	if (REDUCED_MOTION_OW) return;
	const now = performance.now();
	const dt = Math.min((now - weatherFx.last) / 1000, 0.05);
	weatherFx.last = now;
	ctx.save();
	ctx.lineWidth = 1;
	for (const p of weatherFx.parts) {
		p.x += spec.vx * p.vj * dt;
		p.y += spec.vy * p.vj * dt;
		if (p.y > VIEW_H + 12 || p.x < -24 || p.x > VIEW_W + 24) Object.assign(p, spawnWeatherPart(spec, false));
		spec.draw(ctx, p);
	}
	ctx.restore();
	// storm extras for rain (past the REDUCED_MOTION_OW gate): ground ripples + lightning
	if (type === 'rain') {
		weatherFx.ripples = weatherFx.ripples || [];
		weatherFx.rippleAcc = (weatherFx.rippleAcc || 0) + dt;
		while (weatherFx.rippleAcc > 0.05) { weatherFx.rippleAcc -= 0.05; weatherFx.ripples.push({ x: Math.random() * VIEW_W, y: VIEW_H * (0.5 + Math.random() * 0.5), t: 0 }); }
		weatherFx.ripples = weatherFx.ripples.filter(r => (r.t += dt) < 0.5);
		ctx.save(); ctx.strokeStyle = 'rgba(190,215,255,1)'; ctx.lineWidth = 1;
		for (const r of weatherFx.ripples) { const rp = r.t / 0.5; ctx.globalAlpha = 0.4 * (1 - rp); ctx.beginPath(); ctx.ellipse(r.x, r.y, 2 + rp * 10, (2 + rp * 10) * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
		ctx.restore();
		weatherFx.nextBolt = weatherFx.nextBolt || now + 6000 + Math.random() * 12000;
		if (now > weatherFx.nextBolt && !weatherFx.bolt) { weatherFx.bolt = now; weatherFx.nextBolt = now + 9000 + Math.random() * 15000; }
		if (weatherFx.bolt) {
			const age = now - weatherFx.bolt;
			if (age > 520) weatherFx.bolt = null;
			else {
				let a = age < 90 ? 0.15 + 0.5 * (1 - age / 90) : (age > 160 && age < 260) ? 0.3 * (1 - (age - 160) / 100) : 0;
				if (a > 0) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#e0e8ff'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.restore(); }
			}
		}
	}
}

