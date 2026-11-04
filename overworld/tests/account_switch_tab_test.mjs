// account_switch_tab_test.mjs — one account's Overworld was pushed up as another's
// (bug:1793284798179).
//
// instinctgauntlet's server save (a 10-badge Ecruteak run, rev 2739) was replaced
// at 2026-10-28T14:10:43Z by instinctloretest0918's game: the same blob at rev
// 48835 + 1, with gauntlet's dex merged in. That fingerprint is hydrateOw's "local
// ahead" branch running on a page whose LOCAL data was instinctloretest0918's while
// the login token was instinctgauntlet's. The token is one device-wide key, but a
// page picks its local data once, at load (site/account_silo.js): a page still
// running — or still booting — on the first account's data when another tab signs
// in as someone else went on sending requests with the new token. And the silo
// chose a page's account by the CACHED STATE's username, which a reply landing
// after the switch could leave naming the old account beside the new token.
//
// Covered: (1) an overworld booting as alice while bob signs in elsewhere pushes
// nothing of alice's as bob, then comes back as bob with bob's exact server game;
// (2) a token for bob beside a stale cached state naming alice runs as bob (his own
// namespace), never on alice's data; (3) a reply that lands after the switch does
// not write the old account's state; a page never sends as an account it was not
// loaded for. alice's local data is untouched throughout.
//
//   node overworld/tests/account_switch_tab_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9812;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// real-shaped tokens: <user>.<exp>.<64 hex> — the server authenticates the user inside
const tokenFor = u => `${u}.9999999999999.${'ab'.repeat(32)}`;
const userOf = auth => { const m = /^Bearer (.+)\.(\d+)\.([0-9a-f]{64})$/.exec(auth || ''); return m ? m[1] : null; };
const stateOf = u => ({ username: u, friendCode: u.toUpperCase().slice(0, 6), decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } });

const STORY = JSON.stringify({ flags: { intro_done: true, story_seeded: true }, vars: {} });
// alice: the long-played original account (in this browser's global keys)
const ALICE = {
	magepunk_region: 'HOENN', magepunk_ow_rev: '48835', magepunk_money: '2477',
	magepunk_pos_v1: JSON.stringify({ map: 'Route112', x: 10, y: 10 }),
	magepunk_party_v1: JSON.stringify([{ speciesId: 'blastoise', name: 'BLASTOISE', level: 80 }]),
	magepunk_badges_v1: JSON.stringify({ badges: { HOENN: { stone: true, knuckle: true } }, champion: {} }),
	magepunk_dex_v1: JSON.stringify({ seen: ['blastoise'], caught: ['blastoise'] }),
	magepunk_story: STORY,
};
// bob: the new account, whose game lives on the server
const BOB = {
	magepunk_region: 'HOENN', magepunk_ow_rev: '2739', magepunk_money: '6',
	magepunk_pos_v1: JSON.stringify({ map: 'MauvilleCity', x: 20, y: 12 }),
	magepunk_party_v1: JSON.stringify([{ speciesId: 'ivysaur', name: 'IVYSAUR', level: 29 }]),
	magepunk_badges_v1: JSON.stringify({ badges: { HOENN: { stone: true } }, champion: {} }),
	magepunk_dex_v1: JSON.stringify({ seen: ['ivysaur', 'harptera'], caught: ['ivysaur'] }),
	magepunk_story: STORY,
};
let SERVER_OW = {};
const OW_SAVES = [];
// a boot fetch the test can hold, to sign in "in another tab" while the page boots
let holdBoot = false, bootHeld = false, releaseBoot = () => {};
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		const who = userOf(req.headers.authorization);
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: who && SERVER_OW[who] ? { ow: SERVER_OW[who], updated_at: 1 } : null }));
		if (b.action === 'ow-save') {
			const ow = b.ow || {};
			OW_SAVES.push({ user: who, ow });
			const cur = SERVER_OW[who], rev = +ow.magepunk_ow_rev || 0;
			if (!b.force && cur && rev < (+cur.magepunk_ow_rev || 0)) return res.end(JSON.stringify({ error: 'stale revision', conflict: true, rev: +cur.magepunk_ow_rev }));
			SERVER_OW[who] = ow;
			return res.end(JSON.stringify({ ok: true, rev }));
		}
		if (b.action === 'run-load') return res.end(JSON.stringify({ ok: true, runs: {} }));
		return res.end(JSON.stringify({ ok: true, state: stateOf(who || 'nobody'), friends: [], challenges: [] }));
	}
	if (holdBoot && /trainer_teams\.json$/.test(u)) {
		bootHeld = true;
		await new Promise(r => { releaseBoot = r; });
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

const leakedToBob = () => OW_SAVES.filter(x => x.user === 'bob' && (/blastoise/i.test(x.ow.magepunk_party_v1 || '') || (+x.ow.magepunk_ow_rev || 0) >= 48835));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
	const fresh = async () => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		page.on('pageerror', e => console.log('  (pageerror) ' + String(e.message).slice(0, 160)));
		return { ctx, page };
	};
	const raw = (page, k) => page.evaluate(k => { const d = Object.getOwnPropertyDescriptor(localStorage, k); return d ? d.value : null; }, k);
	const seedAlice = async (page, stateUser, tokenUser) => {
		await page.goto(`http://localhost:${PORT}/stats.html`, { waitUntil: 'domcontentloaded' });
		await page.evaluate((data, tok, st) => {
			localStorage.clear();
			for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
			localStorage.setItem('magepunk_mp_token_v1', tok);
			localStorage.setItem('magepunk_mp_state_v1', st);
			localStorage.setItem('magepunk_local_owner_v1', JSON.stringify({ user: 'alice', at: new Date().toISOString(), why: 'test' }));
		}, ALICE, tokenFor(tokenUser), JSON.stringify(stateOf(stateUser)));
	};
	const waitWorld = async page => {
		for (let i = 0; i < 300; i++) {
			if (await page.evaluate(() => !!(window.__ow?.world?.current)).catch(() => false)) break;
			await sleep(100);
		}
		await sleep(3000);   // hydrate + the 30s push are async; give any push time to land
	};
	const aliceGlobal = async page => ({ party: await raw(page, 'magepunk_party_v1'), rev: await raw(page, 'magepunk_ow_rev'), dex: await raw(page, 'magepunk_dex_v1') });

	// ---- (1) the overworld is booting as alice; bob signs in in another tab ----
	{
		SERVER_OW = { alice: { ...ALICE }, bob: { ...BOB } };
		OW_SAVES.length = 0;
		const { ctx, page } = await fresh();
		await seedAlice(page, 'alice', 'alice');
		holdBoot = true; bootHeld = false;
		page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
		for (let i = 0; i < 300 && !bootHeld; i++) await sleep(100);
		A(bootHeld, 'the overworld booted as alice (on her local game) and is mid-boot');
		const silo1 = await page.evaluate(() => ({ user: window.MagepunkSilo?.user, scope: window.MagepunkSilo?.scope }));
		A(silo1.user === 'alice' && silo1.scope === null, '...the page was loaded for alice: her global keys', JSON.stringify(silo1));
		// another tab: the login page signs bob in (token + state are device-wide keys)
		const other = await ctx.newPage();
		await other.goto(`http://localhost:${PORT}/stats.html`, { waitUntil: 'domcontentloaded' });
		await other.evaluate((tok, st) => {
			window.MagepunkSilo?.onAuth('login', 'bob');
			localStorage.setItem('magepunk_mp_token_v1', tok);
			localStorage.setItem('magepunk_mp_state_v1', st);
		}, tokenFor('bob'), JSON.stringify(stateOf('bob')));
		await other.close();
		holdBoot = false; releaseBoot();
		await waitWorld(page);
		await sleep(1500);
		await waitWorld(page);
		const leaked = leakedToBob();
		A(!leaked.length, '[1793284798179] nothing of alice\'s game is pushed as bob (no rev-48836 Blastoise save on bob\'s server copy)',
			JSON.stringify(leaked.map(x => ({ rev: x.ow.magepunk_ow_rev, party: x.ow.magepunk_party_v1 }))));
		A(/ivysaur/i.test(SERVER_OW.bob.magepunk_party_v1 || '') && +SERVER_OW.bob.magepunk_ow_rev < 48835, '...bob\'s server game is still his own (IVYSAUR, rev below alice\'s)', JSON.stringify({ rev: SERVER_OW.bob.magepunk_ow_rev }));
		const after = await page.evaluate(() => ({ scope: window.MagepunkSilo?.scope, party: localStorage.getItem('magepunk_party_v1') || '', rev: localStorage.getItem('magepunk_ow_rev'), live: (window.__ow?.S?.party || []).map(m => m.speciesId) }));
		A(after.scope === 'bob' && /ivysaur/.test(after.party) && !/blastoise/.test(after.party), '...and the page comes back as bob, playing bob\'s exact server game', JSON.stringify(after));
		const g = await aliceGlobal(page);
		A(/blastoise/.test(g.party || '') && !/ivysaur|harptera/.test(g.dex || ''), '...while alice\'s local game keeps her party and gets none of bob\'s dex', JSON.stringify({ rev: g.rev, dex: g.dex }));
		await ctx.close();
	}

	// ---- (2) bob's token beside a stale cached state that still names alice ----
	{
		SERVER_OW = { alice: { ...ALICE }, bob: { ...BOB } };
		OW_SAVES.length = 0;
		const { ctx, page } = await fresh();
		await seedAlice(page, 'alice', 'bob');
		await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
		await waitWorld(page);
		const s = await page.evaluate(() => ({ user: window.MagepunkSilo?.user, scope: window.MagepunkSilo?.scope }));
		A(s.user === 'bob' && s.scope === 'bob', '[1793284798179] the token names bob, so the page is bob\'s (his namespace), whatever the cached state says', JSON.stringify(s));
		const leaked = leakedToBob();
		A(!leaked.length, '...and alice\'s game is not pushed to bob\'s server copy', JSON.stringify(leaked.map(x => x.ow.magepunk_ow_rev)));
		const g = await aliceGlobal(page);
		A(/blastoise/.test(g.party || '') && g.rev === '48835' && !/ivysaur/.test(g.dex || ''), '...and alice\'s local game is byte-for-byte untouched', JSON.stringify(g));
		await ctx.close();
	}

	// ---- (3) the account layer itself ----
	{
		const { ctx, page } = await fresh();
		await seedAlice(page, 'alice', 'alice');
		await page.goto(`http://localhost:${PORT}/stats.html`, { waitUntil: 'domcontentloaded' });
		const r = await page.evaluate(async (bobTok, bobState) => {
			const MP = await import('/battlecards/mpmode.js');
			const realFetch = window.fetch;
			let sent = 0;
			// a reply for alice that lands after bob signed in elsewhere
			window.fetch = async () => {
				sent++;
				localStorage.setItem('magepunk_mp_token_v1', bobTok);
				localStorage.setItem('magepunk_mp_state_v1', bobState);
				return new Response(JSON.stringify({ ok: true, state: { username: 'alice' } }), { status: 200 });
			};
			await MP.call('state');
			const stateAfter = JSON.parse(localStorage.getItem('magepunk_mp_state_v1')).username;
			// the next request from this (alice) page
			const blocked = await MP.call('ow-save', { ow: { magepunk_ow_rev: '1' } });
			window.fetch = realFetch;
			return { stateAfter, sent, blocked };
		}, tokenFor('bob'), JSON.stringify(stateOf('bob'))).catch(e => ({ err: String(e.message) }));
		A(r.stateAfter === 'bob', '[1793284798179] a reply that lands after the switch does not write alice\'s name beside bob\'s token', JSON.stringify(r));
		A(r.sent === 1 && r.blocked && r.blocked.accountChanged, '...and the alice page sends nothing more once bob is signed in (refused, page reloads)', JSON.stringify(r));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
