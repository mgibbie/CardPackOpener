// battlecards_async_spectate_replay_test.mjs — play-by-mail (?async=) Battlecards matches get live SPECTATING and a
// REPLAY OF THE WHOLE MATCH, like every other mode (owner, 2026-11-19: "every mode of every game").
// The REAL server handler (server/mp.mjs, bundled over node:sqlite like pocketenhanced_spectate_e2e_test.mjs) behind a
// static server, headless browsers, two accounts playing a mail match over several visits (each visit = a page load
// that makes one move):
//   visit 1  quill accepts + deals the opening        visit 2  penny takes her turn (fran WATCHES it live)
//   visit 3  quill takes his turn                      visit 4  penny wins the match
// Asserts: the player taking a turn publishes the board (mode 'async', "Mail duel vs <name>") and a friend's
// ?spectate= page renders it; every turn's frames land beside the match (async-tape-put); the finished match's replay
// (?amreplay=, public) covers EVERY turn of every visit; the finish screen and the reopen overlay both offer
// Watch replay / Copy replay link; and the replays list names the Sword Coast / Final Fantasy / Multiverse / mail tapes.
//   node overworld/tests/battlecards_async_spectate_replay_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8679;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }

// ---------- the real handler over sqlite ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-bc-async-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return res.json();
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const ip = '10.8.0.' + (req.socket.remotePort % 250 + 1);
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try {
			const r = await handler(request, { MP_DB });
			res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text());
		} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));

// ---------- accounts: penny and quill play, fran (penny's friend) watches, nosy is nobody's friend ----------
const tokens = {};
for (const n of ['penny', 'quill', 'fran', 'nosy']) tokens[n] = (await call('register', { username: n, password: 'mail-e2e-pass' })).token;
await call('add-friend', { username: 'quill' }, tokens.penny);
await call('add-friend', { username: 'penny' }, tokens.fran);
A(tokens.penny && tokens.quill && tokens.fran && tokens.nosy, 'four accounts; penny is friends with quill and fran');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };
const deckOf = async (n) => { const st = await stateOf(n); return (st.decks || []).find((d) => /mage/i.test(d.classId || '')) || st.decks[0]; };
const pDeck = await deckOf('penny'), qDeck = await deckOf('quill');
const created = await call('async-create', { to: 'quill', party: { deck: pDeck.cards, classId: pDeck.classId, commander: null, companion: null } }, tokens.penny);
A(created.ok && created.match && /^[A-Z]{12}$/.test(created.match.id), 'penny challenged quill to a mail match', JSON.stringify(created).slice(0, 200));
const MID = created.match.id;
const matchRow = async () => (await call('async-get', { id: MID }, tokens.penny)).match;
const tapeIdx = () => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get('amtape:' + MID); return r ? JSON.parse(r.value) : null; };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async (who, url) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = who ? await stateOf(who) : null;
		await page.evaluateOnNewDocument((tok, st) => {
			try {
				localStorage.setItem('magepunk_sfx_muted', '1');
				if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
			} catch { /* ignore */ }
			// window.open is the Watch button's new tab: record where it points instead
			window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return {}; };
		}, who ? tokens[who] : null, st);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors, close: () => ctx.close() };
	};
	const myTurnLive = (page) => waitFor(() => page.evaluate(() => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && !g.state.over && g.state.current === g.HUMAN); }), 45000);
	// one visit = load the match, end the turn, wait for the server to hand it over
	const turnVisit = async (who, label, before) => {
		const v = await open(who, `/battlecards/index.html?async=${MID}`);
		A(await myTurnLive(v.page), `${label}: ${who}'s page loaded the match on their turn`, v.errors.slice(0, 2).join(' | '));
		await sleep(1500); // let the opening animations settle (frames get recorded on settle)
		await v.page.evaluate(() => document.getElementById('end-turn').click());
		A(await waitFor(async () => (await matchRow()).turnNumber > before, 20000), `${label}: the turn was sent to the server`);
		return v;
	};

	// ---- visit 1: quill accepts from the lobby link (deals the opening; penny moves first) ----
	{
		const v = await open('quill', `/battlecards/index.html?async=${MID}&adeck=${encodeURIComponent(qDeck.id)}`);
		A(await waitFor(async () => (await matchRow()).turnNumber >= 1, 45000), 'visit 1: quill accepted and dealt the opening', v.errors.slice(0, 2).join(' | '));
		let m = await matchRow();
		if (m.turn === 'quill') { // the coin gave quill the first turn: play it in this same visit
			await sleep(1500);
			await v.page.evaluate(() => document.getElementById('end-turn').click());
			await waitFor(async () => (await matchRow()).turn === 'penny', 20000);
			m = await matchRow();
		}
		A(m.turn === 'penny', 'visit 1: the match waits on penny');
		await v.close();
	}
	const segsAfter1 = (tapeIdx() || { segs: [] }).segs.length;
	A(segsAfter1 >= 1 && tapeIdx().segs.every((s) => s.by === 'quill'), 'visit 1: quill\'s page stored its frames beside the match (amtape)', JSON.stringify(tapeIdx()));

	// ---- server rules on the tape ----
	{
		const { packString } = await import(pathToFileURL(path.join(ROOT, 'battlecards/codec.js')).href);
		const code = await packString(JSON.stringify({ v: 1, meta: {}, frames: [{ snap: {}, cap: 'x' }] }));
		const out = await call('async-tape-put', { id: MID, code, frames: 1 }, tokens.quill);
		A(out.error === 'not your turn', 'a tape segment is refused out of turn', JSON.stringify(out));
		const nosy = await call('async-tape-put', { id: MID, code, frames: 1 }, tokens.nosy);
		A(nosy.error === 'not your match', 'a stranger cannot add to the tape', JSON.stringify(nosy));
		const junk = await call('async-tape-put', { id: MID, code: 'nope', frames: 1 }, tokens.penny);
		A(junk.error === 'bad replay', 'junk is not stored as a tape', JSON.stringify(junk));
		const early = await call('amreplay-get', { id: MID });
		A(early.error && /still being played/.test(early.error), 'the replay is not readable while the match is on (it would show a hand)', JSON.stringify(early));
	}

	// ---- visit 2: penny takes her turn while fran watches it live ----
	{
		const before = (await matchRow()).turnNumber;
		const v = await open('penny', `/battlecards/index.html?async=${MID}`);
		A(await myTurnLive(v.page), "visit 2: penny's page loaded the match on her turn", v.errors.slice(0, 2).join(' | '));
		const cs = await waitFor(async () => { const r = await call('cardstate', { username: 'penny' }, tokens.fran); return r.snapshot && r.label === 'Mail duel vs quill'; }, 15000);
		A(cs, "visit 2: penny's page publishes the board while she takes the turn (label \"Mail duel vs quill\")");
		const pres = JSON.parse(sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get('presence:penny')?.value || '{}');
		A(pres.status === 'card:async', "visit 2: penny's presence says she is in a mail duel (friends list Watch)", JSON.stringify(pres));
		const turnNo = await v.page.evaluate(() => window.__game.state.turnNumber);
		const w = await open('fran', '/battlecards/index.html?spectate=penny');
		A(await waitFor(() => w.page.evaluate((t) => { const g = window.__game; return !!(g && g.state && Array.isArray(g.state.players) && g.state.players.length === 2 && g.state.turnNumber === t); }, turnNo), 30000),
			"visit 2: fran's ?spectate=penny page renders penny's live mail-match board", w.errors.slice(0, 2).join(' | '));
		const watchers = await waitFor(async () => (await call('cardstate', { username: 'penny' }, tokens.fran)).watchers >= 1, 10000);
		A(watchers, 'visit 2: fran counts as a watcher of the mail match');
		await sleep(1000);
		await v.page.evaluate(() => document.getElementById('end-turn').click());
		A(await waitFor(async () => (await matchRow()).turnNumber > before, 20000), 'visit 2: the turn was sent to the server');
		await w.close(); await v.close();
	}

	// ---- visit 3: quill takes his turn ----
	{ const before = (await matchRow()).turnNumber; const v = await turnVisit('quill', 'visit 3', before); await v.close(); }

	// ---- visit 4: penny wins (quill's hero falls) ----
	let finishLabels = [];
	{
		const before = (await matchRow()).turnNumber;
		const v = await open('penny', `/battlecards/index.html?async=${MID}`);
		A(await myTurnLive(v.page), "visit 4: penny's page loaded the match on her turn");
		await sleep(1500);
		await v.page.evaluate(() => { const g = window.__game; g.E.concede(g.state, 1 - g.HUMAN); g.pump(); });
		const m = await waitFor(async () => { const r = await matchRow(); return r.status === 'over' && r.turnNumber > before; }, 20000);
		A(m && (await matchRow()).winner === 'penny', 'visit 4: the finished match is on the server, penny won');
		A(await waitFor(() => v.page.evaluate(() => /VICTORY/.test(document.getElementById('dungeon-overlay')?.textContent || '')), 10000), 'visit 4: the finish screen shows');
		finishLabels = await v.page.evaluate(() => [...document.querySelectorAll('#dungeon-overlay button')].map((b) => b.textContent));
		A(finishLabels.includes('▶ Watch replay') && finishLabels.includes('🔗 Copy replay link'), 'visit 4: the finish screen offers Watch replay + Copy replay link', JSON.stringify(finishLabels));
		await v.page.evaluate(() => [...document.querySelectorAll('#dungeon-overlay button')].find((b) => b.textContent === '▶ Watch replay').click());
		const opened = await v.page.evaluate(() => window.__opened.slice());
		A(opened.length === 1 && opened[0] === `index.html?amreplay=${MID}`, 'visit 4: Watch replay opens the whole match\'s replay', JSON.stringify(opened));
		await v.close();
	}

	// ---- the tape covers every visit ----
	const idx = tapeIdx();
	const bys = idx ? idx.segs.map((s) => s.by) : [];
	A(idx && idx.segs.length >= 4 && bys.slice(-3).join(',') === 'penny,quill,penny', 'every turn of every visit is stored, in order (quill, penny, quill, penny)', JSON.stringify(idx && idx.segs));
	const totalFrames = idx ? idx.segs.reduce((n, s) => n + s.frames, 0) : 0;
	A(idx && idx.segs[idx.segs.length - 1].frames >= 2, 'the winning turn keeps its frames up to the final board (not just the last one)', JSON.stringify(idx && idx.segs.slice(-1)));
	const pub = await call('amreplay-get', { id: MID });
	A(Array.isArray(pub.segs) && pub.segs.length === idx.segs.length && pub.players.join() === 'penny,quill' && pub.winner === 'penny', 'amreplay-get: the finished match\'s replay index is public', JSON.stringify(pub).slice(0, 200));

	// ---- the replay (logged out: a shared link) plays all of it ----
	{
		const v = await open(null, `/battlecards/index.html?amreplay=${MID}`);
		A(await waitFor(() => v.page.evaluate(() => !!(window.__replay && window.__replay.total > 0)), 45000), 'the ?amreplay= link opens a replay, logged out', v.errors.slice(0, 2).join(' | '));
		const r = await v.page.evaluate(() => window.__replay);
		A(r.total === totalFrames && totalFrames >= 4, `the replay holds every stored frame of every turn (${r.total} of ${totalFrames})`);
		// the turn markers: one per stored segment, and the turns go up across visits
		const marks = await v.page.evaluate(async (n) => {
			const out = [];
			const next = () => document.getElementById('rb-next').click();
			for (let i = 0; i < n; i++) { const cap = document.getElementById('rb-cap').textContent; if (cap.startsWith('✉ Turn')) out.push(cap.slice(0, 40)); next(); }
			return out;
		}, totalFrames);
		A(marks.length === idx.segs.length && marks.some((c) => /quill/.test(c)) && marks.some((c) => /penny/.test(c)), 'the scrubber marks where each visit\'s turn starts, for both players', JSON.stringify(marks));
		await v.close();
	}

	// ---- reopening the finished match: the overlay offers the replay too ----
	{
		const v = await open('quill', `/battlecards/index.html?async=${MID}`);
		A(await waitFor(() => v.page.evaluate(() => /DEFEAT/.test(document.getElementById('dungeon-overlay')?.textContent || '')), 30000), 'reopening the finished match shows its result');
		const labels = await v.page.evaluate(() => [...document.querySelectorAll('#dungeon-overlay button')].map((b) => b.textContent));
		A(labels.includes('▶ Watch replay') && labels.includes('🔗 Copy replay link'), 'the reopen overlay offers Watch replay + Copy replay link', JSON.stringify(labels));
		await v.close();
	}

	// ---- the replays list names every mode ----
	{
		const v = await open('penny', '/battlecards/replays.html');
		await v.page.evaluate(() => {
			const rows = ['swordcoast', 'finalfantasy', 'multiverse', 'async'].map((mode, i) => ({ id: 'r_t' + i, meta: { mode, result: 'win', frames: 3, when: Date.now() }, code: 'R1.x' }));
			localStorage.setItem('magepunk_replays_v1', JSON.stringify(rows));
		});
		await v.page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => v.page.evaluate(() => document.querySelectorAll('.rep').length === 4), 10000);
		const rows = await v.page.evaluate(() => [...document.querySelectorAll('.rep')].map((r) => r.querySelector('.rp-icon').textContent + ' ' + r.querySelector('.rp-title').textContent.split(' Victory')[0].trim()));
		A(JSON.stringify(rows) === JSON.stringify(['🐉 Sword Coast', '⭐ Final Fantasy', '🕸️ Multiverse', '✉️ Mail Duel']), 'the replays list names and icons Sword Coast, Final Fantasy, Multiverse and mail duels', JSON.stringify(rows));
		await v.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
	console.error(e);
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
