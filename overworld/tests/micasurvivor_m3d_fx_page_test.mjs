// micasurvivor_m3d_fx_page_test.mjs — MicaSurvivor 3D: attacks are drawn with the 2D game's move art, in a real browser
// (micasurvivor/m3d/fx.js; Plans/MICASURVIVOR_TYPES_VFX_PLAN.md, part B: B1 + B2).
//
// The owner, 2026-11-13: "the worst part of those 3d modes is how unpolished the attacks look". A shot was a flat
// coloured sphere, whatever the move.
//   * the page bakes the 2D game's shapes into one atlas: every shape's frames across, every palette down
//   * Charmander's Ember flies as flames, Pikachu's Thunder Shock as bolts, Bulbasaur's Razor Leaf as leaves and its
//     Sludge as blobs: the move's own shape, not a sphere
//   * a shot has its light, and leaves a trail behind it
//   * a hit that lands shows an impact; a swing (Tackle) shows its blow in front of you
//   * the layer stays inside its budget, and the page raises no error
//   node overworld/tests/micasurvivor_m3d_fx_page_test.mjs      (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9918;
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(80); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"no"}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
const errors = [];
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); console.log('     screenshot: ' + path.join(SHOTS, name)); };
	const M = (f, ...a) => page.evaluate(f, ...a);
	// a fight on a generated level, and you cannot fall
	const boot = async (q) => {
		await page.goto(`http://localhost:${PORT}/micasurvivor/m3d/?gen=5&fight=1&${q}`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => M(() => !!(window.__m3d && window.__m3d.ready)), 30000);
		if (ok) await M(() => { const m = window.__m3d; m.world.pl.maxHp = m.world.pl.hp = 1e9; });
		return ok;
	};
	const fx = () => M(() => window.__m3d.fx());
	const shapes = async (want, ms = 25000) => { await waitFor(async () => { const v = await fx(); return !!v && want.every((s) => v.byShape[s] > 0); }, ms); return fx(); };

	// ---- 1. the atlas, and Ember
	A(await boot('dex=4&moves=ember:3'), '1. a fight boots (Charmander, Ember)');
	let v = await fx();
	A(!!v && v.atlas[0] >= 23 && v.atlas[1] === 19, '1. the 2D game\'s shapes are baked into one atlas: their frames across, 19 palettes down', v && v.atlas);
	v = await shapes(['fire']);
	A(v.byShape.fire > 0, '1. Ember flies as flames (the move\'s own shape, not a sphere)', v.byShape);
	await waitFor(async () => { const q = await fx(); return q.shots > 0 && q.glows > 0 && q.parts > 0; }, 20000);
	v = await fx();
	A(v.shots > 0 && v.glows >= v.shots && v.parts > 0, '1. a shot has its light, and leaves a trail', { shots: v.shots, glows: v.glows, parts: v.parts });
	await waitFor(async () => (await fx()).impacts > 0, 30000);
	v = await fx();
	A(v.impacts > 0 && v.byShape.impact > 0, '1. a hit that lands shows an impact', { impacts: v.impacts, impact: v.byShape.impact });
	await shot('fx-ember.png');

	// ---- 2. other moves, other shapes
	A(await boot('dex=25&moves=thunder-shock:3'), '2. Pikachu, Thunder Shock');
	v = await shapes(['bolt']);
	A(v.byShape.bolt > 0 && !v.byShape.fire, '2. Thunder Shock flies as bolts', v.byShape);
	await shot('fx-bolt.png');
	A(await boot('dex=1&moves=razor-leaf:3,sludge:2,tackle'), '2. Bulbasaur: Razor Leaf, Sludge, Tackle');
	v = await shapes(['leaf', 'blob']);
	A(v.byShape.leaf > 0 && v.byShape.blob > 0, '2. Razor Leaf flies as leaves, Sludge as blobs', v.byShape);
	// an enemy brought within arm's reach: Tackle swings
	await waitFor(() => M(() => { const m = window.__m3d, e = m.world.enemies.find((q) => !q.dead); if (!e) return false; e.a.x = m.state.x + 0.9; e.a.z = m.state.z; e.a.y = m.state.y; return m.fx().swings > 0; }), 30000);
	v = await fx();
	A(v.swings > 0, '2. a swing (Tackle) shows its blow in front of you', v.swings);
	await shot('fx-mix.png');

	// ---- 2b. the other kinds of move (B4): each is drawn by the layer, in the move's own shape
	// (an enemy is kept 3 m in front of you, so everything has a target and something to land on)
	const near = () => M(() => { const m = window.__m3d; for (const e of m.world.enemies) if (!e.dead) { e.a.x = m.state.x + 3; e.a.z = m.state.z; e.a.y = m.state.y; e.hp = e.maxHp = 1e9; break; } return m.fx(); });
	const until = async (keys, ms = 30000) => { await waitFor(async () => { const q = await near(); return keys.every((k) => q[k] > 0); }, ms); return fx(); };
	A(await boot('dex=25&moves=thunderbolt:2,discharge:2,quick-attack'), '2b. Pikachu: Thunderbolt (a chain), Discharge (an aura), Quick Attack (a dash)');
	v = await until(['chains', 'auras', 'dashes']);
	A(v.chains > 0 && v.auras > 0 && v.dashes > 0 && v.byShape.streak > 0, '2b. the chain is a run of bolts, the aura throws its pieces out, the dash leaves streaks', { chains: v.chains, auras: v.auras, dashes: v.dashes, streak: v.byShape.streak });
	await shot('fx-chain-aura.png');
	A(await boot('dex=7&moves=hydro-pump:2,rock-slide:2,spikes'), '2b. Squirtle: Hydro Pump (a beam), Rock Slide (meteors), Spikes (mines)');
	v = await until(['beams', 'blasts']);
	A(v.beams > 0 && v.byShape.drop > 0, '2b. the beam is a stream of drops', { beams: v.beams, drop: v.byShape.drop });
	A(v.blasts > 0 && v.byShape.rock > 0 && v.byShape.star > 0, '2b. a meteor falls as a rock and bursts where it lands; a mine lies there as its own shape', { blasts: v.blasts, rock: v.byShape.rock, star: v.byShape.star });
	await shot('fx-beam-meteor.png');

	// ---- 2c. the downloaded lights (B3: Kenney's Particle Pack, CC0, packed into m3d/fx/particles.png)
	{
		const info = JSON.parse(fs.readFileSync(path.join(ROOT, 'micasurvivor/m3d/fx/particles.json'), 'utf8')), credits = fs.readFileSync(path.join(ROOT, 'micasurvivor/CREDITS.md'), 'utf8');
		A(info.names.length === 24 && info.cols * info.rows >= 24 && /CC0/.test(info.source) && /Particle Pack/.test(credits) && /CC0/.test(credits) && /kenney\.nl/.test(credits), '2c. the atlas lists its 24 cells and its source; the pack, its author and its licence are in CREDITS.md', info.source);
		await waitFor(async () => { const q = await near(); return q.lit && ['muzzle', 'flare', 'burst', 'ring'].every((k) => q.byLight[k] > 0); }, 30000);
		v = await fx();
		A(v.lit && v.byLight.muzzle > 0 && v.byLight.flare > 0, '2c. a beam has a muzzle flash at its mouth and a flare at its end', v.byLight);
		A(v.byLight.burst > 0 && v.byLight.ring > 0, '2c. a blast is a burst of light with a ring opening out', v.byLight);
		A(v.lights <= v.max.LIGHTS, '2c. the lights are inside their budget', v.lights);
		await shot('fx-lights-beam.png');
		A(await boot('dex=25&moves=thunderbolt:2,tackle:2'), '2c. Pikachu: Thunderbolt, Tackle');
		await waitFor(async () => { const q = await M(() => { const m = window.__m3d; for (const e of m.world.enemies) if (!e.dead) { e.a.x = m.state.x + 1; e.a.z = m.state.z; e.a.y = m.state.y; e.hp = e.maxHp = 1e9; break; } return m.fx(); }); return q.lit && q.byLight.bolt > 0 && q.byLight.slash > 0 && q.byLight.star > 0; }, 30000);
		v = await fx();
		A(v.byLight.bolt > 0 && v.byLight.slash > 0 && v.byLight.star > 0, '2c. a chain is lightning from link to link, a swing has a slash of light, a hit has a flare', v.byLight);
		await shot('fx-lights-chain.png');
	}

	// ---- 3. the budget
	A(v.sprites <= v.max.SPRITES && v.glows <= v.max.GLOWS && v.parts <= v.max.PARTS, '3. the layer is inside its budget', { sprites: v.sprites, glows: v.glows, parts: v.parts });
	// ---- 2d. a KO is a burst, not a vanish (B5)
	{
		const k0 = (await fx()).kos;
		const dex = await M(() => { const m = window.__m3d, e = m.world.enemies.find((q) => !q.dead); if (!e) return 0; e.hp = e.maxHp = 1e9; m.world.hit(e, 2e9, 0, 0, 0); return e.dex; });
		await waitFor(async () => (await fx()).kos > k0, 8000);
		v = await fx();
		A(dex > 0 && v.kos > k0 && v.byLight.glint > 0 && (v.byLight.puff > 0 || v.byLight.smoke > 0), '2d. an enemy that goes down leaves a puff and a star of light where it stood', { kos: v.kos, k0, glint: v.byLight.glint });
	}
	A(errors.length === 0, '3. the page raised no error', errors.slice(0, 4));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
