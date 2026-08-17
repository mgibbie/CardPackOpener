// frontier_test.mjs — the BATTLE FRONTIER (Battle Tower MVP): opponent generation,
// BP currency, and that taking the challenge actually starts a battle. Headless.
//   node overworld/tests/frontier_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8891;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'ft', friendCode: 'FRONT', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 120)); } return false; }

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
	await page.evaluateOnNewDocument((st) => {
		try {
			localStorage.setItem('magepunk_mp_token_v1', 'ft-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.removeItem('magepunk_badges_v1'); localStorage.removeItem('magepunk_bp'); localStorage.removeItem('magepunk_frontier_best');
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'metagross', name: 'METAGROSS', level: 60, gender: 'M', ability: 'Clear Body', types: ['Steel', 'Psychic'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 210, atk: 200, def: 180, spa: 150, spd: 150, spe: 130 }, maxHP: 210, curHP: 210, exp: 300000, moves: [{ id: 'meteormash', name: 'Meteor Mash', pp: 10, maxPp: 10 }], num: 376, sprite: 's376.png' }]));
		} catch { }
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LittlerootTown`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.Frontier && window.__ow.startFrontierChallenge && window.__ow.battle)), 30000);
	await page.evaluate(() => window.__ow.Badges.crown('HOENN'));

	// opponent generation: a full team of distinct, battle-ready mons at the level
	const gen = await page.evaluate(() => {
		const t = window.__ow.Frontier.genTeam(window.__ow.battle.data, 50, 3);
		return { n: t.length, allValid: t.every(m => m && m.stats && (m.moves || []).length > 0 && m.level === 50), distinct: new Set(t.map(m => m.speciesId)).size };
	});
	A(gen.n === 3 && gen.allValid, 'genTeam builds a full team of battle-ready mons at the requested level', JSON.stringify(gen));
	A(gen.distinct === 3, 'the generated opponents are distinct species');

	// BP currency: earn, spend, and refuse an over-spend
	const bp = await page.evaluate(() => {
		const F = window.__ow.Frontier;
		const start = F.getBP(); F.addBP(5); const after = F.getBP();
		const ok = F.spendBP(3); const left = F.getBP();
		const bad = F.spendBP(999); const still = F.getBP();
		return { start, after, ok, left, bad, still };
	});
	A(bp.after === bp.start + 5 && bp.ok === true && bp.left === bp.after - 3, 'BP is earned and spent correctly');
	A(bp.bad === false && bp.still === bp.left, 'an over-spend of BP is refused');

	// the Frontier is reachable and the challenge actually starts a battle
	await page.evaluate(async () => { await window.__ow.moveToMap('BattleFrontier_BattleTowerLobby'); });
	await waitFor(() => page.evaluate(() => /BattleTowerLobby/.test(window.__ow.world.current?.name || '')), 8000);
	const started = await page.evaluate(async () => {
		window.__ow.startFrontierChallenge();
		const d = window.__ow.dialog;
		for (let i = 0; i < 40; i++) { if (window.__ow.battle.blocking) break; if (d.blocking) d.key('x'); await new Promise(r => setTimeout(r, 60)); }
		return { active: window.__ow.frontier.active, inBattle: window.__ow.battle.blocking };
	});
	A(started.active && started.inBattle, 'taking the BATTLE TOWER challenge starts a real battle', JSON.stringify(started));

	const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
	A(fatal.length === 0, 'no uncaught client errors during the run', fatal.slice(0, 4).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message); console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
