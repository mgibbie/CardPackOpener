// Scratch (D11 currency rescale): what a base Normal run pays and how many KOs an Expedition Classic run gets,
// by a fixed-step sim (invulnerable player, scripted circle walk, the first level-up card each time).
import http from 'http';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
const ROOT = 'C:/Users/guide/Desktop/CardPackOpener/.worktrees/expd10';
const AROOT = 'C:/Users/guide/Desktop/CardPackOpener';
const PORT = 8877;
const MODE = process.argv[2] || 'normal', MINS = +(process.argv[3] || 20);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { res.writeHead(404); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data|overworld\/item_icons)\//.test(f) ? AROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 1800000, args: ['--no-sandbox', '--mute-audio'] });
try {
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720 });
	await page.evaluateOnNewDocument(() => {
		const save = { v: 3, name: 'Trainer', created: 1, updated: 1, coins: 0, owned: { 1: { at: 1, from: 'starter' } }, shiny: {}, partner: 1, partnerShiny: false, starter: 1,
			personality: { trait: 'brave', scores: {} }, upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
			evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {}, stats: {} };
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
		localStorage.setItem('micasurvivor_lang', 'en');
	});
	page.on('pageerror', e => console.log('pageerr', e.message));
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300; i++) { if (await page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')).catch(() => false)) break; await new Promise(r => setTimeout(r, 100)); }
	await page.evaluate(() => { const b = document.getElementById('tap-start'); if (b && !b.classList.contains('hidden')) b.click(); });
	await new Promise(r => setTimeout(r, 1500));
	const r = await page.evaluate(async (MODE, MINS) => {
		G.Audio.sfx = () => {}; G.Audio.music = () => {};
		const wait = ms => new Promise(r => setTimeout(r, ms));
		if (MODE !== 'normal') { await G.Expedition.load(); await G.ExpSave.open(); G.Expedition.debugEnable(MODE); }
		let raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
		const ok = await G.Flow.play(MODE);
		await wait(300);
		const pl = G.Game.player;
		pl.hurt = () => {};
		let f = 0;
		G.Input.axis = () => {
			const pl = G.Game.player; let vx = 0, vy = 0;
			if (pl) for (const e of G.EnemyMgr.all()) { if (e.dead) continue; const dx = pl.x - e.x, dy = pl.y - e.y, d2 = dx * dx + dy * dy; if (d2 < 200 * 200 && d2 > 0) { vx += dx / d2; vy += dy / d2; } }
			if (vx || vy) { const a = Math.atan2(vy, vx) + 0.9; return [Math.cos(a), Math.sin(a)]; }
			const k = f % 150; if (k >= 60) return [0, 0]; const a = (Math.floor(f / 150) * 3 % 8) * Math.PI / 4; return [Math.cos(a), Math.sin(a)];
		};
		const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: '1', bubbles: true }));
		const marks = [];
		const total = MINS * 60 * 30;
		for (f = 0; f < total; f++) {
			const st = G.Game.state;
			if (st === 'playing') G.Game.debugStep(1, 1 / 30);
			else if (st === 'over') break;
			else { key('keydown', 'Digit1'); key('keyup', 'Digit1'); G.Game.debugStep(1, 1 / 30); if (G.ExpEco && G.ExpEco.pick) { G.ExpEco.pick.at = 0; G.ExpEco.choose(0); } }
			if (f % (60 * 30) === 0 && f) {
				const p = G.Game.player, t = G.Game.st.time;
				marks.push({ min: Math.round(t / 60), kills: p.kills, bosses: p.bosses, coins: Math.floor(p.coins || 0), level: p.level,
					basePay: Math.floor(t / 5) + Math.floor(p.kills * 0.25) + p.bosses * 80 + Math.floor(p.coins || 0),
					zone: G.ExpClassic && G.ExpClassic.run ? G.ExpClassic.run.zone : null });
			}
		}
		return { ok, mode: G.Modes.run && G.Modes.run.mode, marks, state: G.Game.state };
	}, MODE, MINS);
	console.log(JSON.stringify(r, null, 1));
} finally { await browser.close(); server.close(); }
