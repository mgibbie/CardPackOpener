// martcures_test.mjs — every Mart sells the status cures, and they work.
//
// Playtest 2026-09-26: a full-party Koga attempt blacked out to Toxic with no
// cure in the bag and $394 in hand. ANTIDOTE / PARLYZ HEAL / AWAKENING / BURN
// HEAL / ICE HEAL / FULL HEAL were defined and usable but in no Mart's stock (the
// only buyable answer was a $500 LUM BERRY). They are in the shared stock now,
// at their Gen-3 prices. Also: a battle-bag cure now clears Toxic's counter, as
// every other cure path already did.
//
//   node overworld/tests/martcures_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9133;
const STATE = { username: 'martcures', friendCode: 'MCURE0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], ow: null }));
	}
	fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's131.png', num: 131 };
const B = ids => Object.fromEntries(ids.map(i => [i, true]));

const CURES = { antidote: 100, parlyzheal: 200, awakening: 250, burnheal: 250, iceheal: 250, fullheal: 600 };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, lead) => {
		if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
		localStorage.setItem('magepunk_mp_token_v1', 'martcures-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true } }, champion: {} }));
		localStorage.setItem('magepunk_money', '394');   // the reporter's cash after the Koga blackout
		localStorage.setItem('magepunk_repel_v1', '99999');
	}, STATE, LEAD);
	const boot = async (map, x, y) => {
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data)).catch(() => false)); i++) await sleep(200);
		await sleep(1800);
	};
	// face the Mart clerk (2,3) from (3,3) and talk through interact()
	const openShop = () => page.evaluate(async () => {
		const W = window.__ow, p = W.player;
		p.tx = 3; p.ty = 3; p.px = 48; p.py = 48; p.facing = 'left'; p.moving = false;
		W.interact();
		for (let i = 0; i < 40 && !W.shopMenu.open; i++) {
			if (W.dialog.blocking) { W.dialog.revealed = 1e9; W.dialog.key('z'); }
			await new Promise(r => setTimeout(r, 80));
		}
		return { open: W.shopMenu.open, mode: W.shopMenu.mode, stock: W.shopStockNow(),
			prices: Object.fromEntries(W.shopStockNow().map(id => [id, W.Bag.ITEMS[id]?.price])) };
	});
	const key = async k => { await page.keyboard.press(k); await sleep(60); };
	const state = () => page.evaluate(() => ({ money: window.__ow.Bag.getMoney(), idx: window.__ow.shopMenu.idx,
		bag: Object.fromEntries(['antidote', 'fullheal'].map(id => [id, window.__ow.Bag.count(id)])) }));

	// 1. the ordinary Fuchsia and Pewter Marts: every cure, at its price
	for (const mart of ['FuchsiaCity_Mart', 'PewterCity_Mart']) {
		await boot(mart, 3, 4);
		const s = await openShop();
		A(s.open && s.mode === 'buy', `${mart}: talking to the clerk opens the BUY list`, JSON.stringify({ open: s.open, mode: s.mode }));
		const missing = Object.keys(CURES).filter(id => !s.stock.includes(id));
		A(!missing.length, `${mart}: the BUY list carries all six status cures`, missing.join(','));
		const wrong = Object.entries(CURES).filter(([id, p]) => s.prices[id] !== p);
		A(!wrong.length, `${mart}: ...at their Gen-3 prices (ANTIDOTE $100 ... FULL HEAL $600)`, JSON.stringify(wrong));
		A(!s.stock.includes('rarecandy'), `${mart}: no premium-counter stock leaks into an ordinary Mart`);
	}

	// 2. buy two ANTIDOTES through the UI on the reporter's $394
	const s = await openShop();
	const target = s.stock.indexOf('antidote');
	for (let i = 0; i < target; i++) await key('ArrowDown');
	A((await state()).idx === target, 'the cursor reaches ANTIDOTE in the list', String(target));
	await key('z'); await key('z');
	const bought = await state();
	A(bought.money === 194 && bought.bag.antidote === 2, 'two ANTIDOTES cost $200: $394 -> $194', JSON.stringify(bought));
	await key('x');
	await sleep(400);

	// 3. in battle: a badly poisoned lead is cured, Toxic's counter with it
	const fight = await page.evaluate(async () => {
		const W = window.__ow, b = W.battle;
		b.start(W.party, 'magikarp', 2, () => {});
		for (let i = 0; i < 100 && !(b.active?.me && b.active.phase === 'menu'); i++) {
			if (b.active?.queue?.length || b.active?.msg) b.key('z');
			await new Promise(r => setTimeout(r, 100));
		}
		const a = b.active;
		if (!a?.me) return { error: 'no battle' };
		a.me.status = 'psn'; a.me.badPsn = true; a.me.toxicN = 4;
		b.useItem('antidote');
		for (let i = 0; i < 60 && a.me.status; i++) { b.key('z'); await new Promise(r => setTimeout(r, 80)); }
		return { status: a.me.status, badPsn: !!a.me.badPsn, toxicN: a.me.toxicN ?? null, left: W.Bag.count('antidote') };
	});
	A(!fight.error, 'a wild battle starts', fight.error);
	A(fight.status == null, 'the ANTIDOTE cures the badly poisoned lead', JSON.stringify(fight));
	A(!fight.badPsn && fight.toxicN == null, "...and clears Toxic's escalation counter (a later plain poison won't escalate)", JSON.stringify(fight));
	A(fight.left === 1, '...spending exactly one ANTIDOTE', JSON.stringify(fight));

	// 4. the purchase survives a reload
	await boot('FuchsiaCity_Mart', 3, 4);
	const after = await state();
	A(after.money === 194 && after.bag.antidote === 1, 'cash and the remaining ANTIDOTE survive a reload', JSON.stringify(after));
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 2)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
