// npctrades_test.mjs — in-game NPC trades ("my ONIX for your BELLSPROUT").
//
// Reported by a tester against the Bellsprout-for-Onix trade. Nothing traded
// anywhere, for two unrelated reasons:
//   Kanto/Hoenn  the scripts survived but drive the trade through four `special`
//                ops this port never implemented (0 occurrences in main.js), so
//                the NPC talked and nothing happened.
//   Johto        Crystal's `tradenpc` has no counterpart in the port's op set,
//                so the transpile DROPPED those scripts — Kyle is literally
//                [faceplayer, end], which is why he seemed to do nothing.
//
// Both are now intercepted at the script label and run through one flow.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/npctrades_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8903;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mk = (speciesId, name, num) => ({
	speciesId, name, level: 22, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60,
	exp: 10648, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num,
});
// a Bellsprout for Kyle, plus a spare so the party is never emptied
const PARTY = [mk('bellsprout', 'BELLSPROUT', 69), mk('rattata', 'SPARE', 19)];

// ---------- static: the generated table ----------
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/trades.json'), 'utf8'));
A(Object.keys(T.trades).length >= 19, `the table carries every decomp trade (${Object.keys(T.trades).length})`);
A(Object.keys(T.npcs).length >= 13, `and maps the reachable NPCs onto it (${Object.keys(T.npcs).length})`);
const kyle = T.trades[T.npcs['VioletKylesHouse:Kyle']];
A(kyle && kyle.want === 'bellsprout' && kyle.give === 'onix',
	"the reported trade is Kyle's BELLSPROUT -> ONIX", JSON.stringify(kyle));
A(kyle.nickname === 'ROCKY' && kyle.otName === 'KYLE' && kyle.heldItem === 'bitterberry',
	'with the decomp nickname, OT and held item', JSON.stringify(kyle));
// the Crystal macro packs the DVs as TWO bytes; a naive parse shifts every later
// field, which shows up as an OT called "48926" holding item "66"
A(Object.values(T.trades).every(t => !/^\d+$/.test(t.otName || 'x')),
	'no OT name is a stray number (the packed-DV off-by-one)',
	Object.values(T.trades).filter(t => /^\d+$/.test(t.otName || 'x')).map(t => t.otName).join(','));
A(Object.values(T.trades).every(t => t.heldItem === null || /^[a-z]/.test(t.heldItem)),
	'and no held item is a stray number');
// both dialects present
const srcs = new Set(Object.values(T.trades).map(t => t.source));
A(srcs.has('crystal') && srcs.has('firered') && srcs.has('emerald'),
	'all three decomps contributed', [...srcs].join(','));

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
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
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'JOHTO');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=VioletKylesHouse`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.Trades)), 30000);
		A(ready, "boot into Kyle's house with a BELLSPROUT");
		if (!ready) throw new Error('boot failed');

		A(await page.evaluate(() => window.__ow.Trades.count() >= 19), 'the table loaded at runtime');
		A(await page.evaluate(() => !!window.__ow.Trades.forScript('VioletKylesHouse', 'Kyle')),
			'Kyle resolves to a trade despite his script being empty');

		// ---- talking to Kyle opens the offer, not silence ----
		const offer = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.runScriptLabel('Kyle', null);
			await new Promise(r => setTimeout(r, 300));
			return { blocking: !!ow.dialog.blocking, text: JSON.stringify(ow.dialog.pages || ow.dialog.text || '') };
		});
		A(offer.blocking, 'Kyle now says something at all');
		A(/ONIX/.test(offer.text) && /BELLSPROUT/.test(offer.text),
			'and names both sides of the trade', offer.text.slice(0, 120));

		// ---- accept -> the party picker opens ----
		const picker = await page.evaluate(async () => {
			const ow = window.__ow;
			// the offer is a 2-page dialog; each Z advances one page and the last
			// one fires its onClose, which is what opens the picker
			for (let i = 0; i < 6 && ow.dialog.blocking; i++) { ow.dialog.key('z'); await new Promise(r => setTimeout(r, 120)); }
			await new Promise(r => setTimeout(r, 300));
			return { open: !!ow.tradeMenu.open, want: ow.tradeMenu.trade?.want };
		});
		A(picker.open, 'accepting opens a party picker', JSON.stringify(picker));
		A(picker.want === 'bellsprout', 'for the species he asked for');

		// ---- offering the WRONG POKeMON is refused ----
		const wrong = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.tradeMenu.idx = 1;          // the SPARE rattata
			ow.tradeMenu.flash = null;
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }));
			await new Promise(r => setTimeout(r, 300));
			return { flash: ow.tradeMenu.flash, stillOpen: !!ow.tradeMenu.open, party: ow.party.map(m => m.speciesId) };
		});
		A(/not a BELLSPROUT/i.test(wrong.flash || ''), 'the wrong POKeMON is refused', JSON.stringify(wrong.flash));
		A(wrong.stillOpen, 'and the picker stays open to try again');
		A(wrong.party.join(',') === 'bellsprout,rattata', 'nothing was taken', wrong.party.join(','));

		// ---- offering the right one completes the trade ----
		const done = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.tradeMenu.idx = 0;          // the BELLSPROUT
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }));
			await new Promise(r => setTimeout(r, 500));
			const got = ow.party.find(m => m.speciesId === 'onix');
			return {
				menuClosed: !ow.tradeMenu.open,
				party: ow.party.map(m => m.speciesId),
				got: got ? { name: got.name, level: got.level, ot: got.otName, held: got.heldItem, traded: !!got.traded } : null,
				dex: ow.Dex.isCaught('onix'),
				flag: ow.Story.getFlag('trade_done_npc_trade_kyle'),
				text: JSON.stringify(ow.dialog.pages || ow.dialog.text || ''),
			};
		});
		A(done.menuClosed, 'the picker closes on a successful trade');
		A(!done.party.includes('bellsprout'), 'your BELLSPROUT is gone', done.party.join(','));
		A(done.party.includes('onix'), 'and an ONIX is in the party', done.party.join(','));
		A(done.got?.name === 'ROCKY', 'it has the trade nickname', JSON.stringify(done.got));
		A(done.got?.level === 22, 'at the level of the POKeMON you gave — no laundering past the cap',
			String(done.got?.level));
		A(done.got?.ot === 'KYLE' && done.got?.held === 'bitterberry',
			'with the right OT and held item', JSON.stringify(done.got));
		A(done.dex === true, 'and it is registered as caught in the POKeDEX');
		A(done.flag === true, 'the trade is flagged done');

		// ---- and it only happens once ----
		const again = await page.evaluate(async () => {
			const ow = window.__ow;
			for (let i = 0; i < 6 && ow.dialog.blocking; i++) { ow.dialog.key('z'); await new Promise(r => setTimeout(r, 100)); }
			ow.runScriptLabel('Kyle', null);
			await new Promise(r => setTimeout(r, 300));
			return { menu: !!ow.tradeMenu.open, text: JSON.stringify(ow.dialog.pages || ow.dialog.text || '') };
		});
		A(!again.menu, 'talking to him again does NOT reopen the picker');
		A(/ROCKY|glad we traded/i.test(again.text), 'he asks after the POKeMON instead', again.text.slice(0, 100));

		// ---- the OTHER dialect: a Kanto script-driven trade ----
		// Kyle's script was dropped entirely; Norma's SURVIVED and just called four
		// unimplemented specials. Same interception, so prove that path too.
		const p2 = await browser.newPage();
		await p2.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
		}, STATE, [mk('venonat', 'VENONAT', 48), mk('rattata', 'SPARE', 19)]);
		await p2.goto(`http://localhost:${PORT}/overworld/index.html?map=CinnabarIsland_PokemonLab_Lounge`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => p2.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.Trades)), 30000);
		const kanto = await p2.evaluate(async () => {
			const ow = window.__ow;
			ow.runScriptLabel('CinnabarIsland_PokemonLab_Lounge_EventScript_Norma', null);
			await new Promise(r => setTimeout(r, 300));
			const offered = JSON.stringify(ow.dialog.pages || ow.dialog.text || '');
			for (let i = 0; i < 6 && ow.dialog.blocking; i++) { ow.dialog.key('z'); await new Promise(r => setTimeout(r, 120)); }
			await new Promise(r => setTimeout(r, 300));
			const opened = !!ow.tradeMenu.open;
			ow.tradeMenu.idx = 0; // the VENONAT
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }));
			await new Promise(r => setTimeout(r, 500));
			const got = ow.party.find(m => m.speciesId === 'tangela');
			return { offered, opened, party: ow.party.map(m => m.speciesId),
				got: got ? { name: got.name, level: got.level, ot: got.otName } : null };
		});
		A(/TANGELA/.test(kanto.offered) && /VENONAT/.test(kanto.offered),
			'a Kanto script-driven NPC offers its trade too', kanto.offered.slice(0, 110));
		A(kanto.opened, 'and opens the same picker');
		A(kanto.party.includes('tangela') && !kanto.party.includes('venonat'),
			'the Kanto trade completes', kanto.party.join(','));
		A(kanto.got?.name === 'TANGENY' && kanto.got?.ot === 'NORMA',
			'with its own nickname and OT', JSON.stringify(kanto.got));
		// mk()'s third arg is the DEX NUMBER, not the level -- both party mons are Lv22
		A(kanto.got?.level === 22, 'and the level you handed over', String(kanto.got?.level));
		await p2.close();

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
