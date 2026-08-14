// relay_fuzz.mjs — adversarial fuzz of the host's guest-intent handler.
//
// In the host-authoritative relay the host applies UNTRUSTED guest intents via
// applyGuestIntent (game.js): turn-gated, queue-guarded, seat-checked, wrapped in
// try/catch, and now shape/size-validated at the server. That path was never
// fuzzed. game.js isn't node-importable (THREE/DOM), so we boot ONE real host
// into a 3-human FFA (the two guests never connect, so their seats stay human and
// intents actually apply — a never-polled seat is never marked stale), then fire
// a firehose of adversarial intents at window.__game.applyGuestIntent IN-BROWSER,
// asserting after each:
//   • it never throws (the try/catch must hold),
//   • validateGameState(state) == 0 (no adversarial intent corrupts the game),
//   • turn integrity — the current player is never left eliminated (unless over),
//   • rejection integrity — an intent tagged with the HOST seat / a junk seat
//     mutates NOTHING (the state fingerprint is unchanged): no cross-seat leakage.
//
// Standalone (needs headless Chrome + puppeteer-core); NOT in run-all.mjs.
//   node battlecards/tests/integration/relay_fuzz.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8874;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

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
				async all() {
					const prefix = String(this._a[0]).replace(/%$/, '');
					const rows = [...m.entries()].filter(([k]) => k.startsWith(prefix)).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([key, value]) => ({ key, value }));
					return { results: rows };
				},
			};
		},
		_map: m,
	};
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

const TMP_MP = path.join(ROOT, 'server', '__mp_fuzz_tmp.mjs');
async function loadHandler() {
	const src = fs.readFileSync(path.join(ROOT, 'server', 'mp.mjs'), 'utf8')
		.replace(/from ('\.\/[\w.-]+\.json')/g, "from $1 with { type: 'json' }");
	fs.writeFileSync(TMP_MP, src);
	return (await import(pathToFileURL(TMP_MP).href + '?t=' + Date.now())).default;
}

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(150); }
	return false;
}

(async () => {
	const handler = await loadHandler();
	const db = mockD1();
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			const chunks = []; for await (const c of req) chunks.push(c);
			const request = new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() || undefined });
			try {
				const response = await handler(request, { MP_DB: db });
				const txt = await response.text();
				res.writeHead(response.status, { 'content-type': 'application/json' }); res.end(txt);
			} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: 'harness: ' + e.message })); }
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	const api = async (action, payload = {}, token = null) => {
		const r = await fetch(`http://localhost:${PORT}/api/mp`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...payload }) });
		return r.json();
	};

	let browser;
	try {
		// 3 humans matchmake into a size-3 FFA; only the host will actually boot
		const users = [];
		for (const name of ['fuzzhost', 'fuzzg1', 'fuzzg2']) {
			const reg = await api('register', { username: name, password: 'fuzz12345' });
			if (reg.error) throw new Error('register ' + name + ': ' + reg.error);
			const deck = reg.state.decks[0];
			users.push({ name, token: reg.token, party: { deck: deck.cards, classId: deck.classId, commander: deck.commander || null, companion: deck.companion || null } });
		}
		for (const u of users) { const j = await api('matchmake-join', { party: u.party, size: 3 }, u.token); if (j.error) throw new Error('join: ' + j.error); await sleep(15); }
		let matchId = null, host = null;
		for (const u of users) {
			let r; for (let i = 0; i < 30 && !(r && r.status === 'matched'); i++) { r = await api('matchmake-poll', {}, u.token); if (r.status !== 'matched') await sleep(120); }
			if (!r || r.status !== 'matched') throw new Error('never matched ' + u.name);
			u.seat = r.seat; matchId = r.matchId; if (r.role === 'host') host = u;
		}
		A(!!host && matchId, 'matchmade a size-3 FFA and found the host (seat 0)');

		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument(t => localStorage.setItem('magepunk_mp_token_v1', t), host.token);
		await page.goto(`http://localhost:${PORT}/battlecards/index.html?cardpvp=${matchId}&mp=1`, { waitUntil: 'domcontentloaded' });

		const dealt = await waitFor(() => page.evaluate(() => {
			const g = window.__game;
			return !!(g && g.state && g.state.players && g.state.players.length === 3 && !g.state.over && g.applyGuestIntent);
		}), 20000);
		A(dealt, 'the host dealt a 3-player FFA and exposed applyGuestIntent');

		// the two guest seats must be HUMAN (not auto-piloted) or every intent is dropped
		const aiCount = await page.evaluate(() => { const s = window.__game.duel.aiSeats; return s ? s.size : 0; });
		A(aiCount === 0, 'both guest seats are human (applyGuestIntent will actually apply)', 'aiSeats=' + aiCount);

		// validateGameState is a test-only oracle, correctly kept OUT of the client E
		// bundle — load it into the page the same way the node suites import it directly
		const gotValidator = await page.evaluate(async () => {
			try { window.__V = (await import('/battlecards/engine/validate.js')).validateGameState; return typeof window.__V === 'function'; }
			catch (e) { window.__Verr = e.message; return false; }
		});
		A(gotValidator, 'loaded the validateGameState oracle into the page', await page.evaluate(() => window.__Verr || ''));

		// ---- in-browser adversarial fuzz of applyGuestIntent ----
		const result = await page.evaluate((ITER) => {
			const g = window.__game, E = g.E, validate = window.__V;
			let a = 0x1234abcd >>> 0;
			const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
			const pick = arr => arr[Math.floor(rnd() * arr.length)];
			// real kinds applyGuestIntent switches on, plus junk (concede excluded so the
			// game doesn't end in a couple of forfeits — concede is covered by relay_harness)
			const KINDS = ['play', 'adventure', 'power', 'planeswalk', 'activate', 'equip', 'walker', 'tap', 'sacland', 'tapart', 'sactoken', 'heroattack', 'attack', 'land', 'trade', 'prepare', 'forge', 'unmask', 'coin', 'endTurn', 'mulligan', 'scry', 'discard', 'pick', 'ask', 'sac', 'dredge', 'respond', '__junk__', '', undefined];
			const N = g.state.players.length;
			const INVALID_SEATS = [0, N + 2, N + 5, -1, null, undefined, 'x']; // all rejected by the top guard
			const failures = [];
			let i = 0, applied = 0, invalidChecked = 0, hostAdvances = 0;
			for (; i < ITER; i++) {
				let st = g.state;
				if (!st || st.over) break;
				// guests can't advance the host's own turn (seat 0 is rejected) — nudge it so
				// the turn cycles back to a guest and their intents get exercised
				if (st.current === 0) { try { E.endTurn(st); g.pump(); hostAdvances++; } catch (e) { failures.push({ i, err: 'host endTurn threw: ' + e.message }); break; } if (g.state.over) break; st = g.state; }
				const cur = st.current;
				const useInvalid = rnd() < 0.35;
				const seat = useInvalid ? pick(INVALID_SEATS) : pick([cur, 1, 2].filter(s => s >= 1 && s < N).concat([cur]));
				const pl = (typeof seat === 'number' && st.players[seat]) || st.players[cur];
				const myCards = pl ? [...(pl.hand || []), ...(pl.board || [])] : [];
				const uid = myCards.length && rnd() < 0.8 ? pick(myCards).uid : (rnd() < 0.5 ? 987654321 : undefined);
				const tgts = [];
				for (const p of st.players) for (const c of [...(p.board || []), ...(p.hand || [])]) tgts.push(c.uid);
				const target = rnd() < 0.5 ? null : (tgts.length ? pick(tgts) : 123456);
				const q = st.pickQueue[0] || st.scryQueue[0] || st.dredgeQueue[0];
				const intent = {
					k: pick(KINDS), seat, uid, attacker: uid, target,
					choice: rnd() < 0.5 ? 0 : (rnd() < 0.5 ? null : 3), position: 0,
					id: rnd() < 0.5 ? '__junk_id__' : (q && q.ids ? pick(q.ids) : uid),
					picks: rnd() < 0.5 ? [] : [uid], uids: uid ? [uid] : [], yes: rnd() < 0.5,
					ability: 0, tapIndex: 0, defId: '__junk__', useAlt: rnd() < 0.5, kicked: false,
				};
				const before = E.stateDigest(g.state);
				let threw = null;
				try { g.applyGuestIntent(intent); } catch (e) { threw = e && e.message; }
				const after = E.stateDigest(g.state);
				if (threw) { failures.push({ i, k: intent.k, seat, err: 'threw: ' + threw }); continue; }
				// rejection integrity: a host/junk seat must mutate nothing
				if (useInvalid) { invalidChecked++; if (after !== before) failures.push({ i, k: intent.k, seat: String(seat), err: 'invalid seat mutated state' }); }
				if (after !== before) applied++;
				const v = validate(g.state);
				if (v.length) failures.push({ i, k: intent.k, seat: String(seat), err: 'invalid state: ' + v.join(' | ') });
				const s2 = g.state;
				if (!s2.over && s2.players[s2.current] && s2.players[s2.current].eliminated) failures.push({ i, k: intent.k, err: 'current player eliminated + not over' });
				if (failures.length >= 25) break;
			}
			return { iterations: i, applied, invalidChecked, hostAdvances, over: g.state.over, failures: failures.slice(0, 12) };
		}, 1500);

		console.log(`   fuzzed ${result.iterations} intents (${result.applied} applied, ${result.invalidChecked} invalid-seat rejections checked, ${result.hostAdvances} host turn-advances, over=${result.over})`);
		A(result.failures.length === 0, 'no adversarial intent corrupted state, threw, or leaked across seats', JSON.stringify(result.failures));
		A(result.applied > 20, 'the fuzz actually exercised the accept path (intents applied)', 'applied=' + result.applied);
		A(result.invalidChecked > 5, 'the fuzz exercised the reject path (invalid seats)', 'checked=' + result.invalidChecked);
		A(errors.filter(e => !/Failed to load resource/i.test(e)).length === 0, 'no uncaught client errors during the fuzz', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message); console.error(e);
	} finally {
		if (browser) await browser.close();
		server.close();
		try { fs.unlinkSync(TMP_MP); } catch {}
	}

	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
