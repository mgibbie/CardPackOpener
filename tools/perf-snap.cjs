// perf-snap.cjs — visual + perf iteration harness for the three player surfaces:
//   overworld  (Canvas2D RPG: walk PalletTown -> Route 1, map-edge crossings)
//   battle     (overworld/battle.js: wild battle, every menu phase)
//   board      (battlecards Three.js: 4-player FFA with every board filled)
//
// For each scenario it boots the page headlessly (same stub-server pattern as
// overworld/tests/boot_smoke.mjs — no login backend needed), drives the game to
// the target state, samples rAF FPS + PerformanceObserver longtasks while the
// scenario runs, then saves labeled screenshots. Phone = 390x844 DPR3 touch
// (portrait AND landscape for battlecards); laptop = 1440x900 DPR1.
//
//   node tools/perf-snap.cjs <overworld|battle|board|all> [--viewport=phone|laptop|both]
//                            [--label=before] [--outdir=tools/perf-shots] [--visible]
//
// Prints one JSON metrics line per (scenario, viewport) — diff these across
// runs to see what a change did. Screenshots land in --outdir.
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8899;

const arg = (name, dflt) => {
	const hit = process.argv.find(a => a.startsWith(`--${name}=`));
	return hit ? hit.split('=').slice(1).join('=') : dflt;
};
const SCENARIO = process.argv[2] || 'all';
const VIEWPORT = arg('viewport', 'both');
const LABEL = arg('label', 'now');
const OUTDIR = path.resolve(ROOT, arg('outdir', 'tools/perf-shots'));
const VISIBLE = process.argv.includes('--visible');
fs.mkdirSync(OUTDIR, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'perfsnap', friendCode: 'PERFSN', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };

// a battle-ready 3-mon party (shape mirrors legendary_test.mjs's seed)
const mon = (speciesId, name, num, types, moves) => ({
	speciesId, name, level: 14, gender: 'M', ability: 'Blaze', types,
	ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
	stats: { hp: 45, atk: 30, def: 28, spa: 32, spd: 30, spe: 34 },
	maxHP: 45, curHP: 45, exp: 2744,
	moves: moves.map(([id, nm, pp]) => ({ id, name: nm, pp, maxPp: pp })),
	num, sprite: `s${num}.png`,
});
// sprite files are keyed s<num*32>.png (charmeleon #5 -> s160.png), with a
// -b back variant — use the exact names from species_battle.json
const PARTY = [
	{ ...mon('charmeleon', 'CHARMELEON', 5, ['Fire'], [['ember', 'Ember', 25], ['scratch', 'Scratch', 35], ['growl', 'Growl', 40], ['smokescreen', 'Smokescreen', 20]]), sprite: 's160.png' },
	{ ...mon('pidgeotto', 'PIDGEOTTO', 17, ['Normal', 'Flying'], [['gust', 'Gust', 35], ['tackle', 'Tackle', 35]]), sprite: 's544.png' },
	{ ...mon('rattata', 'RATTATA', 19, ['Normal'], [['tackle', 'Tackle', 35], ['tailwhip', 'Tail Whip', 30]]), sprite: 's608.png' },
];
const BAG = { potion: 3, superpotion: 2, pokeball: 5, greatball: 2 };

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, every = 150) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch {} await sleep(every); }
	return false;
}

function startServer() {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) { /* drain */ }
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	return new Promise(r => server.listen(PORT, () => r(server)));
}

const VIEWPORTS = {
	phone: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
	phoneLandscape: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
	laptop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// injected before page scripts: canvas census (texture-cost proxy) — every
// canvas the page creates is recorded so we can total texture-sized ones later
const CANVAS_HOOK = `(() => {
	const list = []; window.__canvases = list;
	const orig = Document.prototype.createElement;
	Document.prototype.createElement = function (tag, ...a) {
		const el = orig.call(this, tag, ...a);
		if (String(tag).toLowerCase() === 'canvas') list.push(el);
		return el;
	};
})();`;

const PERF_SAMPLER = `
window.__perfStart = () => {
	const P = window.__perf = { frames: 0, t0: performance.now(), last: performance.now(), gaps50: 0, maxGap: 0, longtasks: [], running: true };
	const loop = (t) => {
		if (!P.running) return;
		P.frames++;
		const gap = t - P.last;
		if (gap > 50) P.gaps50++;
		if (gap > P.maxGap) P.maxGap = gap;
		P.last = t;
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
	try {
		P.obs = new PerformanceObserver(l => { for (const e of l.getEntries()) P.longtasks.push(Math.round(e.duration)); });
		P.obs.observe({ entryTypes: ['longtask'] });
	} catch {}
};
window.__perfStop = () => {
	const P = window.__perf; if (!P) return null;
	P.running = false;
	try { P.obs.disconnect(); } catch {}
	const dt = (performance.now() - P.t0) / 1000;
	return {
		seconds: +dt.toFixed(1), fps: +(P.frames / dt).toFixed(1),
		gaps50: P.gaps50, maxGapMs: Math.round(P.maxGap),
		longtasks: P.longtasks.length,
		longtaskTotalMs: P.longtasks.reduce((a, b) => a + b, 0),
		worstLongtaskMs: P.longtasks.length ? Math.max(...P.longtasks) : 0,
	};
};`;

async function newPage(browser, vp) {
	const page = await browser.newPage();
	await page.setViewport(VIEWPORTS[vp]);
	if (VIEWPORTS[vp].isMobile) await page.setUserAgent(PHONE_UA);
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
	await page.evaluateOnNewDocument(CANVAS_HOOK);
	await page.evaluateOnNewDocument(PERF_SAMPLER);
	await page.evaluateOnNewDocument((st, party, bag) => {
		try {
			localStorage.setItem('magepunk_mp_token_v1', 'perfsnap-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_bag_v1', JSON.stringify(bag));
			localStorage.setItem('magepunk_money', '3000');
		} catch {}
	}, STATE, PARTY, BAG);
	return { page, errors };
}

const shotName = (scenario, vp, tag) => path.join(OUTDIR, `${scenario}-${vp}-${LABEL}-${tag}.png`);
async function shot(page, scenario, vp, tag) {
	const file = shotName(scenario, vp, tag);
	await page.screenshot({ path: file });
	console.log('  shot:', path.relative(ROOT, file));
}

async function canvasStats(page) {
	return page.evaluate(() => {
		const sizes = {};
		let textureBytes = 0, textureCount = 0;
		for (const c of (window.__canvases || [])) {
			if (!c.width || !c.height) continue;
			const k = c.width + 'x' + c.height;
			sizes[k] = (sizes[k] || 0) + 1;
			if (c.width >= 128 && c.height >= 128) { textureBytes += c.width * c.height * 4; textureCount++; }
		}
		return { canvases: (window.__canvases || []).length, textureCount, textureMB: +(textureBytes / 1048576).toFixed(1), sizes };
	});
}

// ---------- scenarios ----------

async function scenarioOverworld(browser, vp) {
	const { page, errors } = await newPage(browser, vp);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
	const booted = await waitFor(() => page.evaluate(() =>
		!!(window.__ow && window.__ow.world?.current?.layout?.width > 0 && window.__ow.player)), 30000);
	if (!booted) throw new Error('overworld did not boot');
	await sleep(1500); // sprite pre-warm etc.
	await page.evaluate(() => window.__perfStart());
	// walk a loop that crosses the PalletTown <-> Route 1 edge both ways
	await page.evaluate(async () => {
		const ow = window.__ow;
		await ow.pumpPlayer('up', false, 3500);
		await ow.pumpPlayer('left', false, 1200);
		await ow.pumpPlayer('right', false, 1200);
		await ow.pumpPlayer('down', false, 3500);
	});
	const metrics = await page.evaluate(() => window.__perfStop());
	await shot(page, 'overworld', vp, 'walk');
	const info = await page.evaluate(() => ({ map: window.__ow.world.current.name || window.__ow.world.current.map?.id }));
	await page.close();
	return { ...metrics, map: info.map, errors: errors.slice(0, 4) };
}

async function scenarioBattle(browser, vp) {
	const { page, errors } = await newPage(browser, vp);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
	const booted = await waitFor(() => page.evaluate(() =>
		!!(window.__ow && window.__ow.world?.current?.layout?.width > 0 && window.__ow.party)), 30000);
	if (!booted) throw new Error('overworld did not boot (battle)');
	await page.evaluate(() => window.__perfStart());
	// deterministic wild battle (no 10% double-battle roll): call battle.start directly
	await page.evaluate(() => {
		const ow = window.__ow;
		ow.battle.start(ow.party, 'pidgey', 5, () => {}, null);
	});
	const inBattle = await waitFor(() => page.evaluate(() => window.__ow.battle.blocking), 10000);
	if (!inBattle) throw new Error('battle did not start');
	// advance the intro to the action menu
	const atMenu = await waitFor(() => page.evaluate(() => {
		const b = window.__ow.battle;
		if (b.active?.phase === 'msg') b.key('z');
		return b.active?.phase === 'menu';
	}), 15000, 250);
	const metrics = await page.evaluate(() => window.__perfStop());
	if (!atMenu) throw new Error('battle never reached the menu phase');
	await sleep(300);
	await shot(page, 'battle', vp, 'menu');
	// button geometry in CSS px — THE portrait-layout metric
	const geom = await page.evaluate(() => {
		const b = window.__ow.battle;
		const screen = document.getElementById('screen');
		const cssPerCanvasPx = screen.getBoundingClientRect().width / screen.width;
		const r = screen.getBoundingClientRect();
		return {
			canvas: { cssW: Math.round(r.width), cssH: Math.round(r.height), deviceW: screen.width, deviceH: screen.height },
			viewport: { w: innerWidth, h: innerHeight },
			buttons: (b.ui || []).filter(x => x.id !== 'advance').map(x => ({
				id: x.id, label: x.label, cssW: +(x.w * cssPerCanvasPx).toFixed(1), cssH: +(x.h * cssPerCanvasPx).toFixed(1),
			})),
		};
	});
	// moves screen
	await page.evaluate(() => { const b = window.__ow.battle; b.active.menuIdx = 0; b.key('z'); });
	await sleep(300);
	await shot(page, 'battle', vp, 'moves');
	const movesGeom = await page.evaluate(() => {
		const b = window.__ow.battle;
		const screen = document.getElementById('screen');
		const k = screen.getBoundingClientRect().width / screen.width;
		return (b.ui || []).filter(x => x.id !== 'advance').map(x => ({ id: x.id, cssH: +(x.h * k).toFixed(1) }));
	});
	// bag
	await page.evaluate(() => { const b = window.__ow.battle; b.key('x'); b.active.menuIdx = 1; b.key('z'); });
	await sleep(300);
	await shot(page, 'battle', vp, 'bag');
	// switch
	await page.evaluate(() => { const b = window.__ow.battle; b.key('x'); b.active.menuIdx = 2; b.key('z'); });
	await sleep(300);
	await shot(page, 'battle', vp, 'switch');
	await page.close();
	return { ...metrics, geom, movesGeom, errors: errors.slice(0, 4) };
}

async function scenarioBoard(browser, vp) {
	const { page, errors } = await newPage(browser, vp);
	await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=4`, { waitUntil: 'domcontentloaded' });
	const booted = await waitFor(() => page.evaluate(() =>
		!!(window.__game && window.__game.state && window.__game.state.players?.length)), 45000);
	if (!booted) throw new Error('battlecards did not boot');
	await sleep(3000); // opening hands settle, art streams in
	// fill EVERY board: 7 distinct real minions per player via the engine's summon
	const filled = await page.evaluate(() => {
		const g = window.__game, s = g.state, E = g.E;
		const defs = Object.values(s.cardsById)
			.filter(c => c && c.type === 'creature' && c.attack != null && c.health != null)
			.slice(0, 4000);
		let n = 0;
		for (let pi = 0; pi < s.players.length; pi++) {
			for (let i = 0; i < 7; i++) {
				const d = defs[((pi * 7 + i) * 131) % defs.length];
				if (E.summon(s, pi, d)) n++;
			}
		}
		g.pump();
		return n;
	});
	await sleep(4000); // art for the new tokens arrives + repaint queue drains
	await page.evaluate(() => window.__perfStart());
	await sleep(6000); // observe the full board at rest (idle gate should hold FPS)
	// wiggle the pointer so the interactive path (raycasts, hover) is in the sample
	const vpDef = VIEWPORTS[vp];
	for (let i = 0; i < 12; i++) {
		await page.mouse.move(vpDef.width / 2 + (i % 4) * 40, vpDef.height / 2 + (i % 3) * 30);
		await sleep(120);
	}
	const metrics = await page.evaluate(() => window.__perfStop());
	await shot(page, 'board', vp, 'full');
	const stats = await canvasStats(page);
	const three = await page.evaluate(() => {
		const g = window.__game;
		return g.rendererInfo ? g.rendererInfo() : null; // hook may not exist yet
	});
	await page.close();
	return { ...metrics, summoned: filled, canvasStats: stats, three, errors: errors.slice(0, 4) };
}

// ---------- main ----------
(async () => {
	if (!CHROME) { console.error('no Chrome/Edge found — set CHROME=path'); process.exit(1); }
	const server = await startServer();
	const browser = await puppeteer.launch({
		executablePath: CHROME, headless: VISIBLE ? false : 'new',
		args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
	});
	const scenarios = { overworld: scenarioOverworld, battle: scenarioBattle, board: scenarioBoard };
	const wanted = SCENARIO === 'all' ? Object.keys(scenarios) : [SCENARIO];
	const vps = VIEWPORT === 'both' ? ['phone', 'laptop'] : [VIEWPORT];
	const out = {};
	try {
		for (const sc of wanted) {
			for (const vp of vps) {
				console.log(`\n=== ${sc} @ ${vp} ===`);
				try {
					out[`${sc}:${vp}`] = await scenarios[sc](browser, vp);
				} catch (e) {
					out[`${sc}:${vp}`] = { error: e.message };
					console.log('  ERROR:', e.message);
				}
			}
			// battlecards is landscape-first on phones — capture that orientation too
			if (sc === 'board' && vps.includes('phone')) {
				console.log(`\n=== ${sc} @ phoneLandscape ===`);
				try { out[`${sc}:phoneLandscape`] = await scenarios[sc](browser, 'phoneLandscape'); }
				catch (e) { out[`${sc}:phoneLandscape`] = { error: e.message }; }
			}
		}
	} finally {
		await browser.close();
		server.close();
	}
	const metricsFile = path.join(OUTDIR, `metrics-${LABEL}.json`);
	let prev = {};
	try { prev = JSON.parse(fs.readFileSync(metricsFile, 'utf8')); } catch {}
	fs.writeFileSync(metricsFile, JSON.stringify({ ...prev, ...out }, null, 2));
	console.log('\nmetrics ->', path.relative(ROOT, metricsFile));
	console.log(JSON.stringify(out, null, 1));
})();
