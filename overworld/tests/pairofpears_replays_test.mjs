// pairofpears_replays_test.mjs — Pair of Pears runs are REPLAYS now (owner 2026-11-19: every mode has live spectating
// AND replays). pear.js draws every random pick from a seeded rng (the seed, the level, a saved counter) and records
// its accepted actions + flip-back timer firings as a one-char-per-step recipe; replay(seed, recipe) rebuilds the run.
//   - engine: the same seed deals the same table; played runs (shop, charms, mismatches, timers) replay to the exact
//     end state; a resumed run plays on identically; an old saved run (no seed) gets one and is marked not replayable
//   - server: publish-pears {over, replay} relays the ?replay= param to the spectator; malformed / oversized dropped
//   - page: alice plays a seeded run to its end (the page's hooks) while bob watches: her Replays list and end screen
//     offer it, bob's end screen offers "Watch the full run", and the replay ends in exactly alice's state
//     (score / level / hearts / charms); the viewer steps by touch and plays / pauses by keyboard (the pad's reticle)
//   node overworld/tests/pairofpears_replays_test.mjs
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
const PORT = 9988;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-pears-rp-')), 'mp.bundle.mjs');
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
		const ip = req.headers['x-test-ip'] || ('10.8.0.' + (req.socket.remotePort % 250 + 1));
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

// ---------- the engine on its own: seeded, recorded, replayed ----------
const P = await import(pathToFileURL(path.join(ROOT, 'pairofpears/js/pear.js')).href);
const has = (k) => typeof P[k] === 'function';
A(has('replay') && has('applyToken') && has('parseActions'), 'pear.js has replays (replay / applyToken / parseActions)');
const endSig = () => { const r = P.run(), v = P.view(); return JSON.stringify({ phase: P.phase(), level: r.level, hearts: r.hearts, berries: r.berries, stars: r.stars, charms: v.charms, held: v.held, deck: v.deckConds, cards: P._cards() }); };
// A player who remembers every card but slips now and then (k-th decision), buys in the shop, picks up / sells /
// swaps charms; the flip-back timer runs as the page's frame loop would (small dt steps). `stopLevel`: from there
// on it only mismatches, so the run ends.
function playPolicy(stopLevel, maxSteps = 6000) {
	let k = 0;
	for (let g = 0; g < maxSteps; g++) {
		const ph = P.phase();
		if (ph === 'over' || ph === 'won') return;
		k++;
		if (ph === 'clear') { P.continueClear(); continue; }
		if (ph === 'shop') {
			for (const s of [0, 1, 2]) if (!P.buyRefusal(s)) P.buy(s);
			const inv = P.view().charms;
			if (k % 3 === 0 && inv[0]) { P.pickCharm(0); if (k % 2) P.sellHeld(); else P.dropCharm(3); }
			else if (k % 5 === 0 && inv[1]) { P.pickCharm(1); P.dropCharm(-1); }
			P.nextLevel();
			continue;
		}
		if (P.run().flipBackTimer > 0 || P.run().pendingGameOver) { P.update(0.1); continue; }
		const hid = P._cards().filter((c) => !c.faceUp && !c.matched);
		if (!hid.length) { P.update(0.1); continue; }
		const up = P._cards().find((c) => c.faceUp && !c.matched && !(c.conditions.sticky) && c.id === P.run().first);
		const slip = P.run().level >= stopLevel || k % 7 === 0;
		if (up) {
			const mate = hid.find((c) => c.fruit === up.fruit), other = hid.find((c) => c.fruit !== up.fruit);
			P.reveal((slip && other ? other : mate || other || hid[0]).id);
		} else {
			const a = hid.find((c) => c.fruit !== 'pear') || hid[0];
			P.reveal(a.id);
		}
		if (k % 4 === 0) P.update(0.3);
	}
}
try {
	P.startNewRun('rp-a'); const d1 = JSON.stringify(P._cards().map((c) => c.fruit));
	P.startNewRun('rp-a'); const d2 = JSON.stringify(P._cards().map((c) => c.fruit));
	P.startNewRun('rp-b'); const d3 = JSON.stringify(P._cards().map((c) => c.fruit));
	A(d1 === d2 && d1 !== d3, 'the same seed deals the same table; another seed another one');
	let ok = 0, n = 0, longest = 0, levels = 0, charms = 0;
	for (const seed of ['rp1', 'rp2', 'rp3', 'rp4', 'rp5', 'rp6']) {
		P.startNewRun(seed);
		playPolicy(5 + (n % 4));
		const want = endSig(), acts = P.run().actions || '';
		longest = Math.max(longest, acts.length); levels = Math.max(levels, P.run().level); charms += P.view().charms.filter(Boolean).length;
		if (has('replay')) { P.replay(seed, acts); if (endSig() === want && P.run().actions === acts) ok++; else console.log('   diverged on ' + seed); }
		n++;
	}
	A(ok === n, `${n} played runs (shop, charms, mismatches, timers) replay to exactly the same end state`, ok + '/' + n);
	A(levels >= 5 && charms > 0, 'those runs reached deep levels and held charms', levels + ' levels, ' + charms + ' charms');
	A(longest > 50 && longest <= 6000, 'a recipe is compact (one char per action) and under the server cap', longest);
	// a run resumed from its save (Continue) plays on exactly as if it had never stopped
	P.startNewRun('rp-resume');
	for (let i = 0; i < 40; i++) { const hid = P._cards().filter((c) => !c.faceUp && !c.matched); if (P.phase() !== 'play' || !hid.length) break; if (P.run().flipBackTimer > 0) P.update(1); else P.reveal(hid[0].id); }
	const mid = JSON.stringify(P.serialize());
	playPolicy(6); const straight = endSig();
	P.restore(JSON.parse(mid)); playPolicy(6); const resumed = endSig();
	A(straight === resumed, 'a resumed run (save -> restore) draws exactly what it would have (the rng counter is saved)');
	if (has('replay')) { const acts = P.run().actions; P.replay('rp-resume', acts); A(endSig() === resumed, "a resumed run's replay still rebuilds it from the start"); }
	// a run saved before replays existed: it gets a seed and plays on, but offers no replay (its start can't be rebuilt)
	P.startNewRun('legacy'); const old = P.serialize(); delete old.seed; delete old.actions; delete old.rngN; delete old.replayable;
	A(P.restore(old) && /^[A-Za-z0-9_-]{1,24}$/.test(String(P.run().seed)) && P.run().replayable === false, 'an old saved run (no seed) gets one on load and is marked not replayable');
	const hid = P._cards().filter((c) => !c.faceUp); P.reveal(hid[0].id);
	A(P.phase() === 'play' && P._cards().filter((c) => c.faceUp).length === 1, 'the old run still plays (Continue works)');
	if (has('parseActions')) A(P.parseActions('AB_0_9-0') && P.parseActions('AB_0_9-0').length === 6 && P.parseActions('A_x') === null && P.parseActions('A.B') === null, 'recipes parse (and malformed ones are refused)');
} catch (e) { A(false, 'the engine checks ran through', e && e.message); }

// ---------- accounts ----------
const tokens = {};
for (const n of ['alice', 'bob', 'carol']) tokens[n] = (await call('register', { username: n, password: 'pears-rp-pass' })).token;
await call('add-friend', { username: 'alice' }, tokens.bob);
await call('add-friend', { username: 'bob' }, tokens.alice);
await call('add-friend', { username: 'carol' }, tokens.bob);
await call('add-friend', { username: 'bob' }, tokens.carol);
A(tokens.alice && tokens.bob && tokens.carol, 'three real accounts; bob is friends with alice and carol');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };

// ---------- the server relays a finished run's replay (shape-checked, capped) ----------
{
	const param = 'rp1.ABCD-AB0_9';
	await call('publish-pears', { seq: 1, label: 'Pair of Pears · Level 1', snapshot: { game: 'pears', cards: [], level: 1 } }, tokens.carol);
	await call('publish-pears', { seq: 2, label: 'Pair of Pears · Game over', over: true, replay: param, snapshot: { game: 'pears', cards: [], level: 1 } }, tokens.carol);
	A((await call('pears-state', { username: 'carol' }, tokens.bob)).replay === param, "a finished run's replay param reaches its spectator (pears-state)");
	let seq = 3;
	for (const [bad, why] of [['rp1.AB.CD', 'a second dot'], ['rp1.' + 'A'.repeat(6001), 'over the 6000-action cap'], ['bad seed!.AB', 'a bad seed'], [['rp1.AB'], 'not a string']]) {
		await call('publish-pears', { seq: seq++, label: 'x', over: true, replay: bad, snapshot: { game: 'pears', cards: [], level: 1 } }, tokens.carol);
		A((await call('pears-state', { username: 'carol' }, tokens.bob)).replay == null, 'a malformed replay is dropped: ' + why);
	}
}

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async (who, url, vp = { width: 1600, height: 900, deviceScaleFactor: 1 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = who ? await stateOf(who) : null;
		await page.evaluateOnNewDocument((tok, st) => {
			try {
				localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
			} catch { /* ignore */ }
		}, who ? tokens[who] : null, st);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors };
	};
	const ready = (page) => waitFor(() => page.evaluate(() => !!(window.__pears && window.__pears.ready)), 30000);
	// what the replay must end on: score / level / hearts / charms (and the rest of the table)
	const endOf = (page) => page.evaluate(() => { const v = window.__pears.view(); return v && JSON.stringify({ phase: v.phase, level: v.level, hearts: v.hearts, berries: v.berries, stars: v.stars, charms: v.charms, deck: v.deckConds, pairs: v.pairs, mismatches: v.mismatches }); });

	// alice plays a seeded run to its end through the page's own actions (the frame loop runs the flip-back timer)
	const alice = await open('alice', '/pairofpears/?seed=rpweb1');
	A(await ready(alice.page), 'alice: game ready (signed in)');
	await alice.page.evaluate(() => window.__pears.newRun({ seed: 'rpweb1' }));
	const bob = await open('bob', '/pairofpears/?spectate=alice');
	A(await ready(bob.page), 'bob: spectator ready');
	A(await waitFor(() => bob.page.evaluate(() => !!(window.__pears.view() && window.__pears.view().cards)), 15000), "bob sees alice's run");
	await alice.page.evaluate(async () => {
		const W = window.__pears, P = W.engine, wait = (ms) => new Promise((r) => setTimeout(r, ms));
		let k = 0;
		for (let g = 0; g < 600; g++) {
			const ph = P.phase();
			if (ph === 'over' || ph === 'won') break;
			k++;
			if (ph === 'clear') { W.act('continue'); continue; }
			if (ph === 'shop') {
				for (const s of [0, 1, 2]) if (!P.buyRefusal(s)) W.act('buy', s);
				if (W.view().charms[0] && k % 2) { W.act('pick', 0); W.act('sell'); }
				W.act('next');
				continue;
			}
			if (W.view().busy) { await wait(120); continue; }
			const hid = P._cards().filter((c) => !c.faceUp && !c.matched);
			const first = P.run().first != null ? P._cards().find((c) => c.id === P.run().first) : null;
			const slip = P.run().level >= 4 || k % 6 === 0;
			if (first) { const mate = hid.find((c) => c.fruit === first.fruit), other = hid.find((c) => c.fruit !== first.fruit); W.act('reveal', (slip && other ? other : mate || other || hid[0]).id); }
			else W.act('reveal', (hid.find((c) => c.fruit !== 'pear') || hid[0]).id);
			await wait(30);
		}
	});
	A(await waitFor(() => alice.page.evaluate(() => ['over', 'won'].includes(window.__pears.engine.phase())), 20000), "alice's run is over");
	const recipe = await alice.page.evaluate(() => window.__pears.recipe());
	const aliceEnd = await endOf(alice.page);
	A(recipe && recipe.seed === 'rpweb1' && recipe.replayable && recipe.actions.length > 10, 'the run recorded its seed and its actions', JSON.stringify(recipe || {}).slice(0, 80));
	A(/"level":[3-9]/.test(aliceEnd) || /"level":1\d/.test(aliceEnd), 'it went a few levels deep', aliceEnd);
	const want = '/pairofpears/?replay=' + (recipe && recipe.seed) + '.' + (recipe && recipe.actions);
	// this device's Replays list keeps it; the end screen offers it
	const kept = await alice.page.evaluate(() => window.__pears.save.listReplays ? window.__pears.save.listReplays()[0] : null);
	A(kept && recipe && kept.seed === recipe.seed && kept.actions === recipe.actions, "the finished run is in this device's Replays list");
	A(await waitFor(() => alice.page.evaluate(() => !!document.querySelector('.pp-over-modal .b-watch-replay')), 10000), 'the end screen offers "Watch replay"');
	await alice.page.evaluate(() => window.__pears.mainMenu());
	await alice.page.evaluate(() => document.querySelector('.b-replays') && document.querySelector('.b-replays').click());
	A(await waitFor(() => alice.page.evaluate(() => document.querySelectorAll('.pp-replays .b-rp-watch').length === 1), 5000), 'the menu has a Replays list with the run');

	// bob's end screen links the full run, and that replay ends exactly where alice's run did
	const specBtn = await waitFor(() => bob.page.evaluate(() => !!document.querySelector('.pp-over-modal .b-spec-replay')), 20000);
	A(specBtn, 'bob\'s end screen offers "Watch the full run"');
	if (specBtn) {
		await bob.page.evaluate(() => document.querySelector('.pp-over-modal .b-spec-replay').click());
		A(await waitFor(() => bob.page.evaluate((w) => location.pathname + location.search === w, want), 10000), "bob's button opens alice's replay link");
		A(await ready(bob.page), 'the replay viewer loads');
		const total = await bob.page.evaluate(() => window.__pears.replayTotal);
		A(recipe && total > 10 && total <= recipe.actions.length, 'the viewer has the whole recipe', total);
		await bob.page.evaluate(() => window.__pears.replayTo(window.__pears.replayTotal));
		const replayEnd = await endOf(bob.page);
		A(replayEnd === aliceEnd, "the replay ends in exactly alice's state (score / level / hearts / charms)", replayEnd + '\n   vs ' + aliceEnd);
		A(await waitFor(() => bob.page.evaluate(() => !!document.querySelector('.pp-over-modal')), 5000), 'the replay ends on the end screen');
	}

	// the viewer by hand: touch (tap the step button), keyboard (arrows + Z on Play), a controller works the same reticle
	const v = await open(null, want);
	A(await ready(v.page), 'a guest opens the replay link');
	A(await v.page.evaluate(() => window.__pears.replayAt() === 0 && !document.querySelector('.menu-modal')), 'it starts at move 0, no menu');
	const tap = async (sel) => { const r = await v.page.evaluate((s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel); await v.page.mouse.click(r.x, r.y); };
	await tap('.b-rp-step'); await tap('.b-rp-step');
	A(await v.page.evaluate(() => window.__pears.replayAt() === 2), 'tapping ▶| steps the run forward');
	await tap('.b-rp-back');
	A(await v.page.evaluate(() => window.__pears.replayAt() === 1), 'tapping ◀ steps back');
	let onPlay = false;
	for (let i = 0; i < 12 && !onPlay; i++) {
		await v.page.keyboard.press(i === 0 ? 'ArrowDown' : i % 2 ? 'ArrowRight' : 'ArrowLeft');
		await sleep(80);
		onPlay = await v.page.evaluate(() => { const f = window.__pears.focus(); return !!(f && f.classList.contains('b-rp-play')); });
	}
	A(onPlay, 'the keyboard reticle reaches ▶ Play');
	if (onPlay) {
		await v.page.keyboard.press('z');
		A(await waitFor(() => v.page.evaluate(() => window.__pears.replayAt() >= 4), 8000), 'Z on ▶ Play plays the replay on its own');
		await v.page.keyboard.press('z');
		const at = await v.page.evaluate(() => window.__pears.replayAt());
		await sleep(1500);
		A(await v.page.evaluate((a) => window.__pears.replayAt() <= a + 1, at), 'Z again pauses it');
	}
	A(await v.page.evaluate(() => { const r = window.__pears.view(); return !!r && r.cards.length > 0; }), 'the replay draws the table');
	// a bad link doesn't crash the page
	const bad = await open(null, '/pairofpears/?replay=nope');
	A(await ready(bad.page), 'a malformed ?replay= still loads the game (the menu)');
	for (const [n, p] of [['alice', alice], ['bob', bob], ['viewer', v], ['bad link', bad]]) A(!p.errors.length, `${n}: no page errors`, p.errors.slice(0, 3).join(' | '));
} catch (e) {
	A(false, 'the page checks ran through', e && e.message);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
