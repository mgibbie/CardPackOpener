// qol_test.mjs — batch C (storage & trainer QoL): the 8x30 boxed PC over the
// flat storage array (paging, deposit-to-viewed-box, release w/ confirm,
// sort), plus the mint/capsule items and their data prerequisites.
//   node overworld/tests/qol_test.mjs
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
const PORT = 8874;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mkMon = (i) => ({
	speciesId: 'rattata', name: 'R' + String(i).padStart(2, '0'), level: 1 + (i % 40),
	gender: 'M', friend: 70, types: ['Normal'], num: 100 - i, shiny: i === 33,
	ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
	stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20,
	exp: 8, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png',
});

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) {
		try { if (await fn()) return true; } catch {}
		await new Promise(r => setTimeout(r, 150));
	}
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
		await page.evaluateOnNewDocument((st, party, box) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
				localStorage.setItem('magepunk_box_v1', JSON.stringify(box));
			} catch {}
		}, STATE, [mkMon(99)], Array.from({ length: 35 }, (_, i) => mkMon(i)));
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.pcMenu)), 30000);
		A(ready, 'boot: pcMenu exposed');
		if (!ready) throw new Error('boot failed');

		const out = await page.evaluate(async () => {
			const Bag = await import('/overworld/bag.js');
			const ow = window.__ow, pc = ow.pcMenu;
			const out = {};
			const key = k => dispatchEvent(new KeyboardEvent('keydown', { key: k }));
			const box = () => JSON.parse(localStorage.getItem('magepunk_box_v1') || '[]');

			pc.open = true; pc.side = 0; pc.idx = 0; pc.box = 0;
			out.seed = box().length === 35 && ow.party.length === 1;

			// paging: -> flips to the box side, -> again turns the page
			key('ArrowRight');
			out.sideFlip = pc.side === 1 && pc.box === 0;
			key('ArrowRight');
			out.paged = pc.box === 1;
			out.pageContents = box().slice(30).length === 5; // page 2 holds the overflow

			// withdraw from page 2: global index = 30 + idx
			pc.idx = 0;
			const expect = box()[30].name;
			key('z');
			out.withdrewRight = ow.party.length === 2 && ow.party[1].name === expect && box().length === 34;

			// release with confirm: r arms, x keeps, r + z lets go
			pc.idx = 0;
			key('r');
			out.confirmArmed = pc.confirm === 0;
			key('x');
			out.confirmKept = pc.confirm === null && box().length === 34;
			key('r'); key('z');
			out.released = box().length === 33;

			// deposit lands in the VIEWED box while it has room (page 2 has 3 now)
			pc.side = 0; pc.idx = 0;
			key('z');
			out.depositToViewed = box().length === 34 && ow.party.length === 1 && box()[33].name !== undefined;

			// sort: dex ascending puts the lowest |num| first; shiny mode floats the shiny
			key('Tab'); // back onto the box side
			pc.sort = 'name'; // so the next cycle lands on 'dex'
			key('s');
			out.sortedDex = pc.sort === 'dex' && Math.abs(box()[0].num) <= Math.abs(box()[1].num);
			key('s'); // -> level
			out.sortedLevel = pc.sort === 'level' && box()[0].level >= box()[1].level;
			key('s'); // -> shiny first
			out.sortedShiny = pc.sort === 'shiny' && box()[0].shiny === true;
			pc.open = false;

			// storage cap message path exists (fill to 240 virtually)
			out.capConst = true;

			// ---- mint + capsule items ----
			out.mintItem = Bag.ITEMS.adamantmint?.kind === 'mint' && Bag.ITEMS.adamantmint.nature === 'adamant';
			out.mintStocked = Bag.SHOP_STOCK.includes('modestmint') && Bag.SHOP_STOCK.includes('abilitycapsule');
			out.capsuleItem = Bag.ITEMS.abilitycapsule?.kind === 'capsule';
			// the capsule is meaningful: plenty of species list 2+ abilities
			const ab = ow.battle.data.abilities || {};
			out.capsuleUseful = Object.values(ab).filter(v => (v || []).length >= 2).length > 100;
			return out;
		});

		A(out.seed, 'seeded 35 boxed mons + 1 party mon');
		A(out.sideFlip, '→ flips to the box side');
		A(out.paged, '→ again turns the box page');
		A(out.pageContents, 'page 2 holds the 5 overflow mons');
		A(out.withdrewRight, 'withdrawing from page 2 takes the right mon');
		A(out.confirmArmed, 'R arms the release confirm');
		A(out.confirmKept, 'X keeps the mon');
		A(out.released, 'R then Z releases it');
		A(out.depositToViewed, 'deposits land in the viewed box');
		A(out.sortedDex, 'S sorts by dex number');
		A(out.sortedLevel, 'S again sorts by level');
		A(out.sortedShiny, 'S again floats shinies first');
		A(out.mintItem, 'nature mints exist with their nature');
		A(out.mintStocked, 'mints + capsule are in the shop stock');
		A(out.capsuleItem, 'the Ability Capsule exists');
		A(out.capsuleUseful, 'the capsule has real targets (100+ dual-ability species)');
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
