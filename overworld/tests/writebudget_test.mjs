// writebudget_test.mjs — D1 row writes are a hard daily quota, and three players
// exhausted it. This suite counts the row writes a single idle/roaming client
// causes, so the budget can't silently regress again.
//
// What went wrong (measured 2026-09-19):
//   heartbeat   wrote presence every 1.8s roaming / 0.45s co-located, whether or
//               not anything had changed          -> ~2,000-8,000 writes/hour
//   rateLimit() did a D1 setJSON on EVERY guarded call, doubling every write and
//               putting a row write behind read-only polls
//   ow-save     ran on a 10s cadence chosen before the revision made a missed
//               write harmless, and re-read its daily-backup bookkeeping per save
//   publishDuel republished an unchanged board at a flat 1Hz
//
//   node overworld/tests/writebudget_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { overworldSource } from './owsource.mjs';   // main.js + the modules split out of it

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- source ----------
{
	const sv = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	A(/function rateLimitMem/.test(sv), 'hot-path rate limiting is in-memory, not a D1 row');
	A(/const DURABLE_BUCKETS = \/\^\(login\|reg\|set-email\):/.test(sv),
		'brute-force buckets (login/register/set-email) stay durable');
	A(/prevDay !== today/.test(sv), 'the daily backup only does its bookkeeping on a new UTC day');
	const mn = overworldSource();
	A(/BEAT_FLOOR_MS/.test(mn) && /sig === _lastBeat/.test(mn), 'presence is only written when it changed');
	A(/setInterval\(\(\) => pushOw\(\), 30000\)/.test(mn), 'ow-save runs on the longer post-revision cadence');
	A(/coLocated\(\) && player\.moving/.test(mn), 'the fast presence cadence needs co-located AND moving');
	A(/const watched = coLocated\(\)/.test(mn) && /watched \? payload/.test(mn),
		'position is only part of the presence signature when someone can see it');
	const gm = fs.readFileSync(path.join(ROOT, 'battlecards/game.js'), 'utf8');
	A(/_lastDuelSig/.test(gm) && /DUEL_PUB_FLOOR_MS/.test(gm), 'an unchanged duel board is not republished');
	A(/publishDuel\(state\.over\)/.test(gm), 'a finished duel always publishes, never deduped away');
}

// ---------- live: count the writes a real client causes ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8981;
	const STATE = { username: 'budget', friendCode: 'BUDGET', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'squirtle', name: 'SQUIRTLE', level: 5, gender: 'M', friend: 70, types: ['Water'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 20, atk: 11, def: 12, spa: 11, spd: 11, spe: 10 }, maxHP: 20, curHP: 20,
		exp: 135, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's7.png', num: 7,
	}];
	// every action that writes at least one D1 row (from server/mp.mjs)
	const WRITERS = new Set(['heartbeat', 'ow-save', 'hit', 'async-list', 'my-current-match', 'quests', 'pack-timer', 'overworld-sync', 'card-publish', 'run-save', 'err']);
	const calls = new Map();
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let raw = ''; for await (const c of req) raw += c;
			let body = {}; try { body = JSON.parse(raw); } catch (e) {}
			calls.set(body.action, (calls.get(body.action) || 0) + 1);
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], ow: null, runs: {} }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	const sleep = ms => new Promise(r => setTimeout(r, ms));
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.setViewport({ width: 1100, height: 800 });
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route1`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
		await sleep(2000);

		// measure a 30s window of a player standing still — the common case, and the
		// one the old code billed at ~17 presence writes per 30s
		calls.clear();
		await sleep(30000);
		const writes = [...calls.entries()].filter(([a]) => WRITERS.has(a));
		const total = writes.reduce((n, [, c]) => n + c, 0);
		const beats = calls.get('heartbeat') || 0;
		console.log('   idle 30s write-capable calls:', JSON.stringify(Object.fromEntries(writes)));
		// at 1.8s flat this was ~17; the floor allows at most one per BEAT_FLOOR_MS
		A(beats <= 3, `an idle player sends at most a few presence writes in 30s (got ${beats})`);
		A(total <= 8, `an idle player causes very few write-capable calls in 30s (got ${total})`, JSON.stringify(Object.fromEntries(writes)));
		// projected: this is the number that blew the quota
		const perHour = Math.round(total * 120);
		console.log(`   -> <=${perHour} row writes/hour/player idle (upper bound) (3 players: ~${perHour * 3}/hr)`);
		// NOTE: this counts calls to write-CAPABLE actions, which is an upper bound —
		// several of them (pack-timer, quests) only write when something actually
		// accrued. The old budget was ~3,000/hr/player of REAL writes.
		A(perHour <= 800, `projected idle write ceiling stays far under the old ~3,000/hr (got <=${perHour})`);

		// TIER 4 — the case tiers 1-3 did NOT help: a solo player actually WALKING.
		// x/y changed every step, so every beat still wrote. Nobody was reading it.
		calls.clear();
		await page.evaluate(() => { window.__ow.player.tx = 12; window.__ow.player.ty = 34; });
		for (let i = 0; i < 10; i++) {
			await page.keyboard.down('ArrowUp'); await sleep(700); await page.keyboard.up('ArrowUp');
			await sleep(200);
		}
		const movedBeats = calls.get('heartbeat') || 0;
		console.log(`   solo walking ~9s: ${movedBeats} presence writes`);
		A(movedBeats === 0, `a solo player walking writes no presence at all (got ${movedBeats})`);

		// ...but the moment someone shares the map, full fidelity comes back
		await page.evaluate(() => {
			const ow = window.__ow;
			ow.ghosts.set('watcher', { tx: 1, ty: 1, facing: 'down', px: 16, py: 16 });
		});
		calls.clear();
		for (let i = 0; i < 4; i++) {
			await page.keyboard.down('ArrowDown'); await sleep(600); await page.keyboard.up('ArrowDown');
			await sleep(200);
		}
		const watchedBeats = calls.get('heartbeat') || 0;
		console.log(`   watched walking ~3s: ${watchedBeats} presence writes`);
		A(watchedBeats > 0, `once someone shares the map, position is sent again (got ${watchedBeats})`);
		await page.evaluate(() => window.__ow.ghosts.clear());

		// presence must still refresh often enough to stay "online" (server ONLINE_MS 90s)
		// presence liveness is a source invariant, not something a 30s window can show:
		// the client floor must stay comfortably under the server's ONLINE_MS (90s),
		// or an idle player would silently read as offline to their friends.
		const mnSrc = overworldSource();
		const floor = +(mnSrc.match(/const BEAT_FLOOR_MS = ([0-9_]+)/) || [])[1].replace(/_/g, '');
		const svSrc = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
		const online = +(svSrc.match(/const ONLINE_MS = ([0-9_]+)/) || [])[1].replace(/_/g, '');
		A(floor > 0 && online > 0 && floor < online / 2,
			'presence refreshes well inside the online window, so an idle player never reads as offline',
			`floor ${floor}ms vs ONLINE_MS ${online}ms`);
	} catch (e) {
		A(false, 'harness crashed: ' + e.message, e.stack);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
