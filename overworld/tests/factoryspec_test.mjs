// factoryspec_test.mjs — spectate a BATTLE FRONTIER run. Covers the two pieces this
// feature adds on the client: the board SNAPSHOT emitted from the live battle, and the
// read-only spectate view rendering a snapshot. (The relay endpoints publish-factory /
// factory-state are line-for-line clones of the tested card handlers.) Headless.
//   node overworld/tests/factoryspec_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8893;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'fs', friendCode: 'FSPEC', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 120)); } return false; }

// /api/mp mock: enough for MP_ON + the publish/poll calls to no-op cleanly
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let action = ''; try { action = JSON.parse(raw).action; } catch { }
		const extra = action === 'publish-factory' ? { watchers: 3, watcherNames: ['pat', 'sam', 'lee'] } : {};
		res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, snapshot: null, ...extra })); return;
	}
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
			localStorage.setItem('magepunk_mp_token_v1', 'fs-token'); // MP_ON = true (exercises the publish call)
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.removeItem('magepunk_badges_v1'); localStorage.removeItem('magepunk_bp');
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'metagross', name: 'METAGROSS', level: 60, gender: 'M', ability: 'Clear Body', types: ['Steel', 'Psychic'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 210, atk: 200, def: 180, spa: 150, spd: 150, spe: 130 }, maxHP: 210, curHP: 210, exp: 300000, moves: [{ id: 'meteormash', name: 'Meteor Mash', pp: 10, maxPp: 10 }], num: 376, sprite: 's376.png' }]));
		} catch { }
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LittlerootTown`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.factorySnapshot && window.__ow.factorySpec)), 30000);
	await page.evaluate(() => window.__ow.Badges.crown('HOENN'));

	// no run yet -> no snapshot
	A(await page.evaluate(() => window.__ow.factorySnapshot()) === null, 'no snapshot when no Frontier run is active');

	// start a Factory run and get into a battle -> the snapshot describes the live board
	const snap = await page.evaluate(async () => {
		window.__ow.startFacility('factory');
		const d = window.__ow.dialog;
		for (let i = 0; i < 40; i++) { if (window.__ow.battle.blocking) break; if (d.blocking) d.key('x'); await new Promise(r => setTimeout(r, 60)); }
		return window.__ow.factorySnapshot();
	});
	A(!!(snap && snap.me && snap.foe), 'a live Factory battle produces a board snapshot with both active mons', JSON.stringify(!!snap));
	A(snap && snap.me.maxHP > 0 && typeof snap.me.name === 'string' && Array.isArray(snap.me.types), 'the snapshot carries name/HP/types for the near mon');
	A(snap && Array.isArray(snap.meTeam) && Array.isArray(snap.foeTeam) && /FACTORY/i.test(snap.facility || ''), 'the snapshot carries team dots + the facility label', JSON.stringify({ facility: snap && snap.facility }));
	A(await page.evaluate(() => window.__ow.frontier.active) === true, 'presence/publish are active during the run (frontier.active)');

	// the runner captures the live watcher count from the publish response (drives the badge)
	A(await waitFor(() => page.evaluate(() => window.__ow.frontierWatchers === 3), 4000), 'the runner picks up the "N watching" count from the relay (badge input)');

	// the spectate view renders a snapshot read-only without crashing
	const spec = await page.evaluate(async (theSnap) => {
		const fsv = window.__ow.factorySpec;
		fsv.start('mgibbie');               // begins polling the (mock) relay
		fsv.active.polling = false;          // stop the poll so our injected snapshot stays
		fsv.ingest({ snapshot: theSnap, seq: 7, watchers: 3, over: false });
		await new Promise(r => setTimeout(r, 300)); // let the draw loop render it a few frames
		const out = { blocking: fsv.blocking, name: fsv.active?.snap?.me?.name, watchers: fsv.active?.watchers };
		fsv.quit();
		return { ...out, closed: !fsv.blocking };
	}, snap);
	A(spec.blocking && spec.name === snap.me.name && spec.watchers === 3, 'the spectate view ingests + renders a snapshot (read-only)', JSON.stringify(spec));
	A(spec.closed, 'leaving the spectate view (quit) closes it');

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
