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
	A(v.impacts > 0 && (v.byShape.impact > 0 || v.bySheet.hit > 0), '1. a hit that lands shows an impact (the burst from the games; the 2D star without the atlas)', { impacts: v.impacts, impact: v.byShape.impact, hit: v.bySheet.hit });
	await shot('fx-ember.png');

	// ---- 2. other moves, other shapes
	A(await boot('dex=25&moves=thunder-shock:3'), '2. Pikachu, Thunder Shock');
	v = await shapes(['bolt']);
	A(v.byShape.bolt > 0 && !v.byShape.fire, '2. Thunder Shock flies as bolts', v.byShape);
	await shot('fx-bolt.png');
	A(await boot('dex=1&moves=razor-leaf:3,sludge:2,tackle'), '2. Bulbasaur: Razor Leaf, Sludge, Tackle');
	await waitFor(async () => { const q = await fx(); return (q.byShape.leaf > 0 || q.bySheet.leaf > 0) && (q.byShape.blob > 0 || q.bySheet.poison_bubble > 0); }, 25000); v = await fx();   // (the games' own leaf and poison bubble when the anims atlas is there; the 2D shapes without it)
	A((v.byShape.leaf > 0 || v.bySheet.leaf > 0) && (v.byShape.blob > 0 || v.bySheet.poison_bubble > 0), '2. Razor Leaf flies as leaves, Sludge as blobs', { shapes: v.byShape, sheets: v.bySheet });
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
	// ---- 2e. what belongs on the floor lies on the floor; a whirl, a wave and a patch are drawn (B4, the rest)
	{
		A(await boot('dex=7&moves=whirlpool,surf,toxic'), '2e. Squirtle: Whirlpool (a vortex), Surf (a wave), Toxic (a trail of patches)');
		await waitFor(async () => { const q = await M(() => { const m = window.__m3d, s = m.state; for (const e of m.world.enemies) if (!e.dead) { e.a.x = s.x + 3; e.a.z = s.z; e.a.y = s.y; e.hp = e.maxHp = 1e9; break; } return m.fx(); }); return q.lit && q.vortexes > 0 && q.waves > 0 && q.patches > 0 && q.flat > 0; }, 40000);
		v = await fx();
		A(v.vortexes > 0 && v.byLight.twirl > 0, '2e. a vortex is a whirl turning on the floor', { vortexes: v.vortexes, twirl: v.byLight.twirl });
		A(v.waves > 0 && v.patches > 0, '2e. a wave is a ring travelling out; a patch is a stain with pieces rising', { waves: v.waves, patches: v.patches });
		const flatSeen = await waitFor(async () => (await fx()).flat > 0, 15000);
		A(flatSeen, '2e. those lights lie flat on the floor, not facing the camera');
		await shot('fx-ground.png');
	}

	// ---- 2f. what an enemy is suffering is drawn on it; the weather is in the air (B6)
	{
		const mark = () => M(() => { const m = window.__m3d, s = m.state, e = m.world.enemies.find((q) => !q.dead); if (!e) return null; e.a.x = s.x + 3; e.a.z = s.z; e.a.y = s.y; e.hp = e.maxHp = 1e9; e.burn = 3; e.burnT = 3; e.poison = 3; e.poisonT = 4; e.slow = 0.4; e.slowT = 2; e.paraT = 3; e.confT = 3; return m.fx().marks; });
		await waitFor(async () => { const q = await mark(); return !!q && ['burn', 'poison', 'para', 'conf', 'slow'].every((k) => q[k] > 0); }, 20000);
		let mk = await mark();
		A(!!mk && mk.burn > 0 && mk.poison > 0 && mk.para > 0 && mk.conf > 0 && mk.slow > 0, '2f. a burned, poisoned, paralysed, confused and slowed enemy wears each of those', mk);
		await shot('fx-status.png');
		await M(() => { const m = window.__m3d, e = m.world.enemies.find((q) => !q.dead); e.paraT = 0; e.confT = 0; e.sleepT = 4; });
		await waitFor(async () => (await fx()).marks.sleep > 0, 8000);
		await M(() => { const m = window.__m3d, e = m.world.enemies.find((q) => !q.dead); e.sleepT = 0; e.frozenT = 2; });
		const frozen = await waitFor(async () => (await fx()).marks.frozen > 0, 8000);
		A(frozen, '2f. …and one asleep, then frozen, wears that');
		const seen = {};
		for (const kind of ['rain', 'snow', 'sand', 'fog', 'sun']) { await M((k) => window.__m3d.setWeather(k, 30), kind); await M(() => { const w = window.__m3d.world.weather; if (w) w.t = 5; }); seen[kind] = await waitFor(async () => (await fx()).weather[kind] > 0, 12000); if (kind === 'rain' && SHOTS) { await sleep(700); await shot('fx-rain.png'); } }
		A(Object.values(seen).every(Boolean), '2f. rain, snow, sand, fog and sun are each in the air round you, not only a tint on the screen', seen);
		v = await fx();
		A(v.parts <= v.max.PARTS && v.lights <= v.max.LIGHTS, '2f. …inside the budget', { parts: v.parts, lights: v.lights });
	}

	// ---- 2g. the enemies' attacks: what they mark on the ground, what goes off, what they do for each other
	{
		A(await boot('dex=4&moves=agility&cast='), '2g. a quiet fight (a buff only, nobody arriving by themselves)');
		await waitFor(async () => (await fx()).lit, 15000);
		await M(() => { const m = window.__m3d, s = m.state; m.world.enemies.length = 0; const put = (b, dx, dz) => { const e = m.addEnemy(19, s.x + dx, s.z + dz, { behavior: b }); e.hp = e.maxHp = 1e9; return e; }; put('zoner', 7, 0); put('beamer', -7, 0); put('shielder', 0, 6); put('summoner', 0, -7); const hurt = put('chase', 6, 6); hurt.dummy = true; hurt.hp = 5e8; put('healer', 7, 7); });
		await waitFor(async () => { const q = await fx(); return q.warns > 0 && q.booms > 0; }, 40000);
		v = await fx();
		A(v.warns > 0 && v.byLight.rune > 0, '2g. an enemy marks the ground before it strikes: a turning circle of light, ringed in red', { warns: v.warns, rune: v.byLight.rune });
		A(v.booms > 0, '2g. …and it goes off as a blast or a beam of its type', v.booms);
		await waitFor(async () => { const q = await fx(); return q.helps.heal > 0 && q.helps.shield > 0 && q.helps.summon > 0; }, 40000);
		v = await fx();
		A(v.helps.heal > 0 && v.helps.shield > 0 && v.helps.summon > 0, '2g. a healer, a shielder and a summoner each show what they do', v.helps);
		await shot('fx-enemy.png');
	}

	// ---- 2d. a KO is a burst, not a vanish (B5)
	{
		A(await boot('dex=4&moves=ember:3'), '2d. a fight with a move that hurts (Ember)');
		const k0 = (await fx()).kos;
		const weaken = () => M(() => { const m = window.__m3d; let n = 0; for (const q of m.world.enemies) if (!q.dead) { q.hp = q.maxHp = 1; q.a.x = m.state.x + 2.5; q.a.z = m.state.z; q.a.y = m.state.y; n++; } return n; });   // (one hit from your own moves fells them: the KO comes through the fight's own events)
		let dex = 0; await waitFor(async () => { dex += await weaken(); return (await fx()).kos > k0; }, 30000);   // (enemies arrive in their own time: each is weakened as it comes)
		v = await fx();
		A(dex > 0 && v.kos > k0 && v.byLight.glint > 0 && (v.byLight.puff > 0 || v.byLight.smoke > 0), '2d. an enemy that goes down leaves a puff and a star of light where it stood', { kos: v.kos, k0, glint: v.byLight.glint });
	}
	// ---- 2h. the games' own battle animations (the owner, 2026-11-14): an atlas from the Emerald decomp, in the assets project
	{
		const manifest = fs.readFileSync(path.join(ROOT, 'tools/cloud/micasurvivor_manifest.txt'), 'utf8');
		A(/^fx\/anims1\.png$/m.test(manifest) && /^fx\/anims1\.json$/m.test(manifest) && !fs.existsSync(path.join(ROOT, 'micasurvivor/m3d/fx/anims1.png')), '2h. the atlas is in the assets manifest (deployed with the game\'s other art), not in the repository');
		A(await boot('dex=1&moves=tackle:2,razor-leaf:2,rock-slide'), '2h. Bulbasaur: Tackle, Razor Leaf, Rock Slide');
		const ready = await waitFor(async () => (await fx()).animated, 20000);
		A(ready, '2h. the page loaded the atlas');
		await waitFor(async () => { const q = await M(() => { const m = window.__m3d; for (const e of m.world.enemies) if (!e.dead) { e.a.x = m.state.x + 1.2; e.a.z = m.state.z; e.a.y = m.state.y; e.hp = e.maxHp = 1e9; break; } return m.fx(); }); return q.bySheet.hit > 0 && q.bySheet.punch_impact > 0 && q.bySheet.explosion_2 > 0; }, 40000);
		v = await fx();
		A(v.bySheet.hit > 0, '2h. a hit is the games\' own burst', v.bySheet);
		A(v.bySheet.punch_impact > 0, '2h. Tackle\'s blow is the games\' own', v.bySheet);
		A(v.bySheet.explosion_2 > 0, '2h. a meteor goes off as the games\' explosion', v.bySheet);
		A(v.anims <= v.max.ANIMS, '2h. …inside the budget', v.anims);
		await shot('fx-anims.png');
	}
	A(errors.length === 0, '3. the page raised no error', errors.slice(0, 4));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
