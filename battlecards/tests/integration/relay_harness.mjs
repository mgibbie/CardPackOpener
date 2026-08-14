// relay_harness.mjs — end-to-end multi-client relay integration test.
//
// Wires the REAL backend (server/mp.mjs handler) to an in-memory D1 shim, then:
//   1. registers 3 accounts + matchmakes them into a size-3 FFA (real backend),
//   2. launches 3 headless browser clients into the duel (real game.js host+guests),
//   3. asserts the relay: all clients CONVERGE on the host's authoritative board,
//      a host end-turn propagates to the guests, and a guest end-turn relays back
//      through the host and re-converges (the host↔guest round-trip the per-intent
//      race fix protects).
//
// Standalone (needs headless Chrome + puppeteer-core); NOT part of tests/run-all.mjs.
//   node battlecards/tests/integration/relay_harness.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');            // repo root
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8871;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- in-memory D1 shim (the exact SQL shapes userStore uses) ----------
function mockD1() {
	const m = new Map();
	return {
		prepare(sql) {
			return {
				_a: [],
				bind(...args) { this._a = args; return this; },
				async first() { const k = this._a[0]; return m.has(k) ? { value: m.get(k) } : null; },
				async run() {
					if (/^\s*INSERT/i.test(sql)) m.set(this._a[0], this._a[1]);
					else if (/DELETE .* WHERE key IN/i.test(sql)) this._a.forEach(k => m.delete(k));
					else if (/DELETE .* WHERE key = \?/i.test(sql)) m.delete(this._a[0]);
					return { success: true };
				},
				async all() { // SELECT key, value ... WHERE key LIKE ? ORDER BY key
					const prefix = String(this._a[0]).replace(/%$/, '');
					const rows = [...m.entries()].filter(([k]) => k.startsWith(prefix))
						.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(([key, value]) => ({ key, value }));
					return { results: rows };
				},
			};
		},
		_map: m,
	};
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

// mp.mjs uses attribute-less JSON imports (fine on Cloudflare, but Node 22 needs
// `with { type: 'json' }`). Patch a temp copy in server/ so its relative imports
// still resolve, load the handler from it, and clean it up afterward.
const TMP_MP = path.join(ROOT, 'server', '__mp_harness_tmp.mjs');
async function loadHandler() {
	const src = fs.readFileSync(path.join(ROOT, 'server', 'mp.mjs'), 'utf8')
		.replace(/from ('\.\/[\w.-]+\.json')/g, "from $1 with { type: 'json' }");
	fs.writeFileSync(TMP_MP, src);
	return (await import(pathToFileURL(TMP_MP).href + '?t=' + Date.now())).default;
}

// ---------- run ----------
(async () => {
	const handler = await loadHandler();
	const db = mockD1();
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			const chunks = []; for await (const c of req) chunks.push(c);
			const body = Buffer.concat(chunks).toString();
			const request = new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: body || undefined });
			let act = ''; try { act = JSON.parse(body).action; } catch {}
			try {
				const response = await handler(request, { MP_DB: db });
				const txt = await response.text();
				// card-* permission 4xx would mean the relay is misrouted (a real bug); other
				// 4xx (chat-poll "not in this room", etc.) are benign and client-handled
				if (response.status >= 400 && /^card-/.test(act)) console.log(`   [relay ${response.status}] ${act}: ${txt.slice(0, 70)}`);
				res.writeHead(response.status, { 'content-type': 'application/json' });
				res.end(txt);
			} catch (e) { console.log(`   [api 500] ${act}: ${e.message}`); res.writeHead(500); res.end(JSON.stringify({ error: 'harness: ' + e.message })); }
			return;
		}
		let f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	const api = async (action, payload = {}, token = null) => {
		const r = await fetch(`http://localhost:${PORT}/api/mp`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
			body: JSON.stringify({ action, ...payload }),
		});
		return r.json();
	};

	let browser;
	try {
		// ---- 1. register 3 accounts + matchmake into a size-3 FFA (real backend) ----
		const users = [];
		for (const name of ['relayhost', 'relayg1', 'relayg2']) {
			const reg = await api('register', { username: name, password: 'harness123' });
			if (reg.error) throw new Error('register ' + name + ': ' + reg.error);
			const deck = reg.state.decks[0];
			users.push({ name, token: reg.token, party: { deck: deck.cards, classId: deck.classId, commander: deck.commander || null, companion: deck.companion || null } });
		}
		for (const u of users) { const j = await api('matchmake-join', { party: u.party, size: 3 }, u.token); if (j.error) throw new Error('join ' + u.name + ': ' + j.error); await sleep(15); }
		// poll: the oldest waiter (relayhost) mints the match as host/seat 0; the others get matched
		let matchId = null;
		for (const u of users) {
			let r; for (let i = 0; i < 30 && !(r && r.status === 'matched'); i++) { r = await api('matchmake-poll', {}, u.token); if (r.status !== 'matched') await sleep(120); }
			if (!r || r.status !== 'matched') throw new Error('matchmaking never matched ' + u.name + ' (' + JSON.stringify(r) + ')');
			u.seat = r.seat; u.role = r.role; matchId = r.matchId;
		}
		A(matchId && users.every(u => u.seat != null), 'matchmaking paired 3 players into one size-3 match');
		A(users.filter(u => u.seat === 0).length === 1 && users.some(u => u.role === 'host'), 'exactly one host (seat 0) assigned');
		users.sort((a, b) => a.seat - b.seat);

		// ---- 2. launch clients into the duel (host first so it deals + publishes) ----
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
		const errors = [];
		const snap = p => p.evaluate(() => { const s = window.__game && window.__game.state; return s ? { turn: s.turnNumber, current: s.current, over: s.over, winner: s.winner, life: s.players.map(x => x.life), elim: s.players.map(x => !!x.eliminated), n: s.players.length } : null; }).catch(() => null);
		const allSnaps = () => Promise.all(users.map(u => snap(u.page)));
		const same = ss => { const a = ss[0]; return a && ss.every(s => s && s.turn === a.turn && s.current === a.current && s.n === a.n && JSON.stringify(s.life) === JSON.stringify(a.life)); };
		const waitFor = async (fn, ms) => { for (let t = 0; t < ms; t += 250) { if (await fn()) return true; await sleep(250); } return false; };
		async function boot(u) {
			// each client needs an ISOLATED context — same-origin pages share localStorage,
			// so without this all three would clobber the one token key and become one user
			u.ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
			u.page = await u.ctx.newPage();
			u.page.on('pageerror', e => errors.push(u.name + ' pageerr: ' + e.message));
			u.page.on('console', m => { if (m.type() === 'error') errors.push(u.name + ' console: ' + m.text().slice(0, 120)); });
			await u.page.evaluateOnNewDocument(t => localStorage.setItem('magepunk_mp_token_v1', t), u.token);
			await u.page.goto(`http://localhost:${PORT}/battlecards/index.html?cardpvp=${matchId}&mp=1`, { waitUntil: 'domcontentloaded' });
		}
		const host = users.find(u => u.seat === 0);
		await boot(host);
		const hostUp = await waitFor(async () => { const s = await snap(host.page); return s && s.n === 3; }, 18000); // host deals + publishes
		for (const u of users) if (u.seat !== 0) { await boot(u); await sleep(400); }
		const booted = hostUp && await waitFor(async () => (await allSnaps()).every(s => s && s.n === 3), 20000);
		A(booted, 'all 3 clients booted the duel with 3 players', JSON.stringify(await allSnaps()) + (errors.length ? ' | errs: ' + errors.slice(0, 3).join(' | ') : ''));

		if (booted) {
			// ---- 3. the relay: clients converge on the host's board ----
			const conv0 = await waitFor(async () => same(await allSnaps()), 12000);
			A(conv0, 'clients converge on the host\'s authoritative board (initial)', JSON.stringify(await allSnaps()));

			// dismiss the opening mulligan on a client if it's showing
			const keepHand = p => p.evaluate(() => { const m = document.querySelector('#scry-modal'); if (m && getComputedStyle(m).display !== 'none' && /mulligan|tap cards to swap/i.test(m.textContent)) { const b = m.querySelector('.mull-actions button'); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true; } } return false; });

			// drive a full round of end-turns (host → guest1 → guest2), asserting the relay
			// round-trip converges after EACH move (host publish + guest relay both ways)
			for (let step = 0; step < 3; step++) {
				const before = await snap(host.page); // host = authoritative
				if (!before || before.over) break;
				const cur = before.current;
				const client = users.find(u => u.seat === cur);
				await keepHand(client.page);                 // resolve this player's opening mulligan
				await sleep(400);
				await client.page.evaluate(() => document.querySelector('#end-turn')?.click());
				const advanced = await waitFor(async () => { const s = await snap(host.page); return s && (s.turn > before.turn || s.current !== cur); }, 10000);
				A(advanced, `seat ${cur}'s end-turn advanced the game (relay ${cur === 0 ? 'host→guests' : 'guest→host→all'})`);
				const converged = await waitFor(async () => same(await allSnaps()), 12000);
				A(converged, `all clients re-converged after seat ${cur} acted`, JSON.stringify(await allSnaps()));
			}
			// ---- 4. concede → game over ----
			const concede = async page => {
				await page.evaluate(() => document.querySelector('#concede')?.click());
				await sleep(350);
				await page.evaluate(() => { const b = [...document.querySelectorAll('#dungeon-overlay button')].find(x => x.textContent.trim() === 'Concede'); if (b) b.click(); });
			};
			const g1 = users.find(u => u.seat === 1), g2 = users.find(u => u.seat === 2);
			await concede(g1.page);
			const elim1 = await waitFor(async () => { const s = await snap(host.page); return s && (s.elim[1] || s.over); }, 12000);
			A(elim1, 'a guest\'s concede is applied on the host (seat 1 eliminated)', JSON.stringify(await snap(host.page)));
			const g2sees = await waitFor(async () => { const s = await snap(g2.page); return s && s.elim[1]; }, 8000);
			A(g2sees, 'the other active guest sees the concede via its poll');

			await concede(g2.page);
			const gameOver = await waitFor(async () => { const s = await snap(host.page); return s && s.over; }, 12000);
			A(gameOver, 'the last concede ends the game', JSON.stringify(await snap(host.page)));
			A((await snap(host.page))?.winner === 0, 'the last player standing (the host) wins');
			const g1over = await g1.page.evaluate(() => { const o = document.querySelector('#duel-over'); return !!o && /concede/i.test(o.textContent); });
			A(g1over, 'a conceded guest sees the "You conceded" screen');

			// ---- 5. rematch ----
			// conceders correctly don't get a UI rematch button (they left), so exercise the
			// real rematch handler against the REAL finished match: all three opt in → mint.
			// the #duel-over overlay renders after the elimination animations settle (state
			// goes `over` before the overlay paints), so wait for the Rematch button
			const hostRematchBtn = await waitFor(() => host.page.evaluate(() => { const o = document.querySelector('#duel-over'); return !!(o && [...o.querySelectorAll('button')].some(b => /rematch/i.test(b.textContent))); }), 10000);
			A(hostRematchBtn, 'the host over-screen offers a Rematch');
			let rematchId = null;
			for (let i = 0; i < 12 && !rematchId; i++) {
				for (const u of users) { const r = await api('duel-rematch', { id: matchId, op: 'offer' }, u.token); if (r.matchId || r.rematchMatchId) { rematchId = r.matchId || r.rematchMatchId; break; } }
				if (!rematchId) for (const u of users) { const r = await api('duel-rematch', { id: matchId, op: 'poll' }, u.token); if (r.rematchMatchId) { rematchId = r.rematchMatchId; break; } }
				await sleep(120);
			}
			A(!!rematchId, 'a rematch mints when all three opt in (real handler, finished match)');
			const raw = rematchId && db._map.get('cardmatch:' + rematchId);
			const ncm = raw ? JSON.parse(raw) : null;
			A(ncm && ncm.size === 3 && (ncm.humans || []).length === 3 && ncm.rematchOf === matchId && ncm.seats.every(s => !s.ai && s.deck),
				'the rematch reuses all 3 humans + their decks', JSON.stringify(ncm && { size: ncm.size, humans: ncm.humans, rematchOf: ncm.rematchOf }));

			// the desync self-heal fingerprint must not false-alarm on a HEALTHY game:
			// every guest ingested many authoritative snapshots above, and each verified
			// its rebuilt state against the host's stateDigest — all round-trips must match
			const desyncs = await Promise.all(users.map(u => u.page.evaluate(() => (window.__game && window.__game.duelDebug ? window.__game.duelDebug.desyncs : -1)).catch(() => -1)));
			A(desyncs.every(d => d === 0), 'zero snapshot-digest desyncs across all clients (round-trip fidelity held live)', 'desyncs=' + JSON.stringify(desyncs));

			// uncaught JS errors are fatal; benign network 4xx (chat-poll for a room you're
			// not in) surface as "Failed to load resource" and are client-handled
			const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
			A(fatal.length === 0, 'no fatal client errors across the whole flow', fatal.slice(0, 3).join(' | '));
		}
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
		console.error(e);
	} finally {
		if (browser) await browser.close();
		server.close();
		try { fs.unlinkSync(TMP_MP); } catch {}
	}

	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
