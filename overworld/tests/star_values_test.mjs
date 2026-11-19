// star_values_test.mjs — every tradeable thing on the site has a value in stars (site/values.js).
// Owner, 2026-11-19: "everything needs to have an equivalent value in stars. 1 star = 100p (the money from the
// overworld). 20 stars equals 1 dust. every single thing needs to have a star value." His choices: a card is worth what
// it breaks down for in dust x20; a Pokémon its species' rarity plus its level (shiny x10); key and story items cannot be
// traded; every other item its shop price / 100.
//   1. the owner's ratios, exactly: 100 P = 1 ★, 1 dust = 20 ★, a Pocket ◆ (5 dust) = 100 ★, ◆◆ 500 ★, ★ 8,000 ★; a
//      Battlecards card by its break-down dust; and the ratios derived from the games' own prices (gold, Game Corner
//      coins, MicaSurvivor coins and tickets, packs)
//   2. the walk: EVERY Pocket printing, EVERY Battlecards card, EVERY overworld item and EVERY species has a whole value of
//      at least 1 ★, and every key item, HM and story item is null (cannot be traded); the species table is up to date
//   3. a Pokémon's value: rarer species are worth more; shiny x10; level and perfect IVs add a little
//   4. the REAL server (server/mp.mjs bundled over sqlite): a trade carries each side's worth (every kind priced at the
//      owner's ratios), and an offer with a key item in it is refused and leaves the offer as it was
//   5. the Inventory page: each holding shows its value, the page the account's total; in its trade window each offered
//      thing shows its value and each side its total, on both screens; key items are not offered
//   node overworld/tests/star_values_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';
import * as V from '../../site/values.js';
import * as C from '../../pocketenhanced/js/collection.js';
import { PRINTS } from '../../pocketenhanced/js/data/packs.js';
import { ITEMS } from '../../overworld/bag.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9617;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(120); } return false; };
const sv = V.starValue, whole = v => Number.isInteger(v) && v >= 1;
const DATA = fs.existsSync(path.join(ROOT, 'overworld/data/species_battle.json'));

// ===== 1. the owner's ratios =====
{
	const of = r => PRINTS.find(p => p[2] === r)[0];
	A(V.STAR_PER_P === 1 / 100 && V.STARS_PER_DUST === 20, 'the constants: STAR_PER_P = 1/100, STARS_PER_DUST = 20');
	A(sv({ kind: 'money', n: 100 }) === 1 && sv({ kind: 'money', n: 3000 }) === 30 && sv({ kind: 'money', n: 1_000_000 }) === 10000 && sv({ kind: 'money', n: 0 }) === 0, '100 P = 1 ★ (3,000 P = 30 ★, 1,000,000 P = 10,000 ★; nothing is worth nothing)');
	A(sv({ kind: 'dust', n: 1 }) === 20 && sv({ kind: 'dust', n: 250 }) === 5000, '1 dust = 20 ★ (250 dust = 5,000 ★)');
	A(sv({ kind: 'stars', n: 7 }) === 7, 'a star is a star');
	A(sv({ kind: 'pk-card', id: of('1D') }) === 100 && sv({ kind: 'pk-card', id: of('2D') }) === 500 && sv({ kind: 'pk-card', id: of('1S') }) === 8000 && sv({ kind: 'pk-card', id: of('1D'), n: 3 }) === 300, 'Pocket: a ◆ breaks down for 5 dust = 100 ★, a ◆◆ for 25 dust = 500 ★, a ★ for 400 dust = 8,000 ★ (three ◆ = 300 ★)');
	A(PRINTS.filter(p => C.DUST_FOR[p[2]]).every(p => sv({ kind: 'pk-card', id: p[0] }) === C.DUST_FOR[p[2]] * 20), 'every Pocket printing that breaks down is worth exactly its DUST_FOR x20');
	A(sv({ kind: 'bc-card', rarity: 'common' }) === 100 && sv({ kind: 'bc-card', rarity: 'uncommon' }) === 200 && sv({ kind: 'bc-card', rarity: 'rare' }) === 400 && sv({ kind: 'bc-card', rarity: 'epic' }) === 2000 && sv({ kind: 'bc-card', rarity: 'legendary' }) === 8000, 'Battlecards: a card is its break-down dust x20 (common 5 -> 100 ★, uncommon 200, rare 400, epic 2,000, legendary 8,000)');
	A(sv({ kind: 'gold', n: 150 }) === 100 && sv({ kind: 'bc-pack' }) === 100 && sv({ kind: 'pk-pack' }) === 100 && sv({ kind: 'pk-booster', id: 'C', n: 2 }) === 200, 'a pack (Battlecards or Pocket) is 100 ★, so 150 gold (the price of a Battlecards pack) = 100 ★');
	A(sv({ kind: 'coins', n: 50 }) === 10 && sv({ kind: 'coins', n: 1 }) === 1, 'Game Corner coins: 50 cost $1,000, so 50 coins = 10 ★ (one coin still rounds up to 1 ★)');
	A(sv({ kind: 'ms-t1' }) === 20 && sv({ kind: 'ms-t10' }) === 200 && sv({ kind: 'ms-coins', n: 100 }) === 50, 'MicaSurvivor: a ticket (one pull) 20 ★, a 10-pull ticket 200 ★, 2 coins = 1 ★');
	A(sv({ kind: 'item', id: 'potion' }) === 3 && sv({ kind: 'item', id: 'ultraball', n: 10 }) === 120 && sv({ kind: 'item', id: 'razzberry', n: 5 }) === 1 && sv({ kind: 'item', id: 'razzberry' }) === 1 && sv({ kind: 'item', id: 'rarecandy' }) === 80, 'an item is its shop price / 100 (Potion 300 P = 3 ★; ten Ultra Balls 120 ★; five Razz Berries at 20 P are 1 ★ together, and one alone is still 1 ★)');
	A(sv({ kind: 'item', id: 'masterball' }) === 500 && sv({ kind: 'item', id: 'fullrestore' }) === 30 && sv({ kind: 'item', id: 'ppmax' }) === 3 * sv({ kind: 'item', id: 'ppup' }), 'an item no shop sells is valued from what it does (Master Ball 500 ★, Full Restore 30 ★, a PP Max three PP Ups)');
	const mp = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	A(/const DUST_VALUE = BC_DUST;/.test(mp) && /const GOLD_PACK_PRICE = GOLD_PACK_PRICE_VALUE;/.test(mp) && V.GOLD_PACK_PRICE === 150 && JSON.stringify(V.BC_DUST) === JSON.stringify({ common: 5, uncommon: 10, rare: 20, epic: 100, legendary: 400 }), "the server's break-down dust and pack price are the values module's own (one place)");
}

// ===== 2. walk every thing =====
{
	const bad = []; let n = 0;
	for (const p of PRINTS) { n++; if (!whole(sv({ kind: 'pk-card', id: p[0] }))) bad.push(p[0]); }
	A(!bad.length && n === PRINTS.length && n > 1000, `every Pocket printing (${n}) has a whole value of at least 1 ★`, bad.slice(0, 10));
	const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'battlecards/cards.json'), 'utf8')).cards, pool = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/pool-rarity.json'), 'utf8'));
	const badBc = cards.filter(c => !whole(sv({ kind: 'bc-card', id: c.id, rarity: (pool[c.id] || [c.rarity])[0] }))).map(c => c.id);
	const wrongPool = Object.entries(pool).filter(([, [r]]) => r !== 'mythic' && sv({ kind: 'bc-card', rarity: r }) !== V.BC_DUST[r] * 20).map(([id]) => id);
	A(!badBc.length && cards.length > 10000, `every Battlecards card (${cards.length}, pack pool or not) has a whole value of at least 1 ★`, badBc.slice(0, 10));
	A(!wrongPool.length && sv({ kind: 'bc-card', rarity: 'mythic' }) === 8000 && sv({ kind: 'bc-card', rarity: undefined }) === 100, 'each pack-pool card is worth exactly its dust x20 (the one Mythic as a Legendary; a card with no rarity as a Common)', wrongPool.slice(0, 5));
	const keyish = ([, it]) => ['key', 'hm', 'form', 'charm'].includes(it.kind);
	const items = Object.entries(ITEMS), keys = items.filter(keyish), rest = items.filter(e => !keyish(e));
	const badKey = keys.filter(([id]) => sv({ kind: 'item', id }) !== null || V.itemTradeable(id)).map(([id]) => id), badItem = rest.filter(([id]) => !whole(sv({ kind: 'item', id }))).map(([id]) => id);
	A(!badItem.length && rest.length > 300, `every overworld item that is not a key item (${rest.length}) has a whole value of at least 1 ★`, badItem);
	A(!badKey.length && keys.length > 80 && ['bicycle', 'machbike', 'hm1', 'hm8', 'keystone', 'riftprism', 'shinycharm', 'ssticket', 'cardkey'].every(id => V.starValue({ kind: 'item', id }) === null), `every key item, HM and story item (${keys.length}: the bikes, the HMs, the Key Stone, the Rift Prism, the Shiny Charm, passes and keys) is null: it cannot be traded`, badKey);
	A(whole(sv({ kind: 'item', id: 'nugget' })) && whole(sv({ kind: 'item', id: 'tm43' })) && whole(sv({ kind: 'item', id: 'bigmushroom' })) && sv({ kind: 'item', id: 'hm05' }) === null && sv({ kind: 'item', id: 'elevatorkey' }) === null && sv({ kind: 'item', id: 'eonticket' }) === null, 'a picked-up id the bag does not define is valued too (a Nugget, a TM, a Big Mushroom), unless it reads like a key item (an HM, a key, a ticket)');
	if (DATA) {
		const bat = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8')), ids = Object.keys(bat).filter(k => !k.startsWith('_'));
		const { SPECIES_BASE } = await import('../../site/values_species.js');
		const badMon = ids.filter(id => !whole(sv({ kind: 'pokemon', mon: { speciesId: id, level: 1 } })) || !whole(SPECIES_BASE[id]));
		A(!badMon.length && ids.length >= 1751, `every species (${ids.length}) has a whole base value of its own, and a Pokémon of it is worth at least 1 ★`, badMon.slice(0, 10));
		const { buildTable, render } = await import(pathToFileURL(path.join(ROOT, 'tools/gen_values_species.mjs')).href);
		A(render(await buildTable()) === fs.readFileSync(path.join(ROOT, 'site/values_species.js'), 'utf8').replace(/\r\n/g, '\n'), 'site/values_species.js is what the species data gives now (node tools/gen_values_species.mjs)');
	} else console.log('skip - overworld/data not present: the species walk');
	A([null, undefined, {}, { kind: 'nope' }, { kind: 'pk-card', id: 'no-such' }].every(t => sv(t) === null), 'something that is not a tradeable thing has no value (null)');
}

// ===== 3. Pokémon =====
{
	const B = id => V.monValue({ speciesId: id, level: 1 }) - 1;
	const mon = (id, extra) => V.monValue({ speciesId: id, level: 50, ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ...extra });
	A(B('rattata') < B('raticate') && B('pidgey') < B('pidgeot') && B('bulbasaur') < B('venusaur') && B('magikarp') < B('gyarados'), 'an evolved Pokémon is worth more than its first stage (Raticate > Rattata, Pidgeot > Pidgey, Venusaur > Bulbasaur, Gyarados > Magikarp)', [B('rattata'), B('raticate'), B('bulbasaur'), B('venusaur')]);
	A(B('rattata') <= 20 && B('zubat') <= 20 && B('articuno') === 2000 && B('mewtwo') === 5000 && B('mew') === 10000 && B('arceus') === 10000 && B('mewtwo') > B('dragonite'), 'common route Pokémon are cheap (Rattata, Zubat); a legendary 2,000 ★, a box legendary 5,000 ★, a mythical 10,000 ★', { rattata: B('rattata'), dragonite: B('dragonite') });
	A(mon('pikachu', { shiny: true }) - 50 === 10 * (mon('pikachu') - 50) && mon('pikachu', { level: 100 }) === mon('pikachu') + 50 && mon('pikachu', { ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } }) === mon('pikachu') + 60, 'shiny x10 of its base; each level adds 1 ★; each perfect IV 10 ★', [mon('pikachu'), mon('pikachu', { shiny: true })]);
	A(V.monValue({ speciesId: 'no-such-mon', level: 5 }) >= 1 && V.monValue(null) === null, 'a Pokémon of a species the table does not know is still worth something');
}

// ===== 4. the real server =====
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const stmt = sqlite.prepare(sql), bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-values-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => { const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }); const res = await handler(req, { MP_DB }); return { ...(await res.json()), status: res.status }; };
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').run(k, JSON.stringify(v), Date.now());
const tokens = {};
for (const n of ['ann', 'bob']) tokens[n] = (await call('register', { username: n, password: 'values-e2e-pass' })).token;
await call('add-friend', { username: 'bob' }, tokens.ann); await call('add-friend', { username: 'ann' }, tokens.bob);
const D1 = PRINTS.filter(p => p[2] === '1D').map(p => p[0]);
setRow('ann', { ...row('ann'), collection: { white_knight: 3, fireball: 1 }, packs: 2, dust: 300, gold: 150 });
setRow('bob', { ...row('bob'), collection: { fireball: 2 }, packs: 0, dust: 0, gold: 300 });
setRow('pkcol:ann', { rev: 1, col: { ...C.newCollection(), packs: 2 }, at: 1, ids: [] });
setRow('pkcol:bob', { rev: 1, col: { ...C.newCollection(), prints: { ...C.newCollection().prints, [D1[40]]: 2 } }, at: 1, ids: [] });
setRow('stars:ann', { rev: 1, e: { devann01: 700 }, s: {}, at: 1 });
setRow('micasurvivor:ann', { rev: 4, save: { v: 3, coins: 1234, tickets: { t1: 7, t10: 2 }, owned: { 25: { at: 1 } } } });
A(tokens.ann && tokens.bob && row('ann').gold === 150, 'two real accounts on the real server, friends, with things of every kind');
{
	await call('challenge', { to: 'bob', battleType: 'trade' }, tokens.ann);
	const o = await call('trade-open', { from: 'ann' }, tokens.bob), id = o.tradeId;
	const MEW = { speciesId: 'mew', name: 'MEW', level: 10, shiny: false, ivs: { hp: 31, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, _src: 'party:0' };
	const offer = { cards: { white_knight: 1, fireball: 1 }, packs: 1, dust: 2, gold: 150, stars: 5, pk: { prints: { [D1[0]]: 2 }, packs: 1, own: { C: 1 } }, ms: { coins: 10, t1: 1, t10: 1 }, pokemon: [MEW], items: [{ id: 'potion', count: 5 }, { id: 'masterball', count: 1 }], money: 1000, coins: 50 };
	const u = await call('trade-update', { id, offer }, tokens.ann), w = u.trade && u.trade.worthA;
	const want = { cards: { white_knight: 200, fireball: 100 }, packs: 100, dust: 40, gold: 100, stars: 5, pk: { prints: { [D1[0]]: 200 }, packs: 100, own: { C: 100 } }, ms: { coins: 5, t1: 20, t10: 200 }, pokemon: [10000 + 10 + 10], items: { potion: 15, masterball: 500 }, money: 10, coins: 10 };
	const sum = 200 + 100 + 100 + 40 + 100 + 5 + 200 + 100 + 100 + 5 + 20 + 200 + 10020 + 15 + 500 + 10 + 10;
	const got = w ? { ...w } : null; if (got) delete got.total;
	A(w && JSON.stringify(got) === JSON.stringify(want) && w.total === sum, `the trade carries ann's offer's worth, every kind at the owner's ratios: an uncommon card 200 ★, a common 100 ★, a pack 100 ★, 2 dust 40 ★, 150 gold 100 ★, two ◆ 200 ★, MicaSurvivor 10 coins 5 ★ / a ticket 20 ★ / a 10-pull 200 ★, a Lv 10 Mew with one perfect IV 10,020 ★, five Potions 15 ★, a Master Ball 500 ★, $1,000 10 ★, 50 coins 10 ★: ${sum} ★ in all`, w);
	const p = await call('trade-poll', { id }, tokens.bob);
	A(p.trade?.worthA?.total === sum && p.trade?.worthB?.total === 0, 'bob, polling, sees the same worth for her side, and 0 for his empty one');
	const k = await call('trade-update', { id, offer: { ...offer, items: [{ id: 'potion', count: 1 }, { id: 'bicycle', count: 1 }] } }, tokens.ann);
	const k2 = await call('trade-update', { id, offer: { items: [{ id: 'hm1', count: 1 }] } }, tokens.ann), k3 = await call('trade-update', { id, offer: { items: [{ id: 'shinycharm', count: 1 }] } }, tokens.ann);
	const after = await call('trade-poll', { id }, tokens.ann);
	A(k.status === 400 && /key items cannot be traded: bicycle/.test(k.error) && k2.status === 400 && k3.status === 400 && after.trade.offerA.items.length === 2 && after.trade.offerA.items[0].count === 5 && after.trade.worthA?.total === sum, 'an offer with a key item in it (the Bicycle, an HM, the Shiny Charm) is refused, and the offer stays as it was', [k.status, k.error, k2.status, k3.status, after.trade.offerA.items]);
	await call('trade-cancel', { id }, tokens.ann);
}

// ===== 5. the Inventory page =====
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.6.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
try {
	if (!DATA) throw new Error('skip');
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
	const PIKA = { speciesId: 'pikachu', name: 'PIKACHU', level: 20, sprite: 's800.png', ivs: { hp: 31, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 } };
	const BAG = { potion: 5, masterball: 1, bicycle: 1, hm1: 1 };
	const open = async who => {
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1280, height: 900 });
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		const st = (await call('state', {}, tokens[who])).state;
		await page.evaluateOnNewDocument((tok, st2, mon, bag) => {
			if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
			localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st2));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([mon])); localStorage.setItem('magepunk_bag_v1', JSON.stringify(bag));
			localStorage.setItem('magepunk_money', '3000'); localStorage.setItem('magepunk_coins_v1', '100');
		}, tokens[who], st, PIKA, BAG);
		await page.goto(`http://localhost:${PORT}/inventory/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__inventory && window.__inventory.ready)), 30000);
		const q = fn => page.evaluate(fn);
		const click = async sel => { const r = await page.evaluate(s2 => { const e = document.querySelector(s2); if (!e) return 'no ' + s2; e.scrollIntoView({ block: 'center' }); e.click(); return null; }, sel); if (r) throw new Error(r); await sleep(250); };
		const win = () => page.evaluate(() => { const side = k => { const hh = document.querySelector(`.tw .half.${k}`); return hh ? { total: +((hh.querySelector('.tot') || {}).dataset || {}).total, totText: (hh.querySelector('.tot') || {}).textContent || '', rows: [...hh.querySelectorAll('.slot')].map(s2 => [s2.querySelector('.sn').childNodes[0].textContent, +s2.querySelector('.sv').dataset.v, s2.querySelector('.sv').textContent]) } : null; }; const tw = document.querySelector('.tw'); return { cls: tw ? tw.className : '', mine: side('mine'), theirs: side('theirs') }; });
		return { page, errors, q, click, win };
	};
	const ann = await open('ann');
	// what ann holds, valued by the module itself (its exact numbers are checked in part 1)
	const pkc = row('pkcol:ann').col, pkPrints = Object.entries(pkc.prints).reduce((a, [id, n]) => a + sv({ kind: 'pk-card', id, n }), 0);
	const parts = { stars: 700, dust: 6000, gold: 100, bcpacks: 200, bccards: 3 * 200 + 100, pkpacks: 100 * (2 + C.ownPacks(pkc)), pkcards: pkPrints, mscoins: 617, mst1: 140, mst10: 400, money: 30, coins: 20, pokemon: V.monValue(PIKA), items: 15 + 500 };
	const want = Object.values(parts).reduce((a, b) => a + b, 0);
	A(await waitFor(() => ann.q(() => { const w = document.getElementById('worth'); return w && !w.dataset.counting; }), 30000), "the Inventory page shows ann's total once the Battlecards cards' rarities are in");
	const page = await ann.q(() => ({ total: +document.getElementById('worth').dataset.total, text: document.getElementById('worth').textContent, chips: Object.fromEntries([...document.querySelectorAll('.wallet .chip')].map(c => [c.dataset.k, c.querySelector('.cv') ? +c.querySelector('.cv').dataset.v : null])), bccards: (document.querySelector('[data-k="bccards"] .cv') || {}).textContent || '', mon: (document.querySelector('[data-mon="0"] .cv') || {}).textContent || '', items: Object.fromEntries([...document.querySelectorAll('[data-item]')].map(e => [e.dataset.item, (e.querySelector('.cv') || {}).textContent || ''])) }));
	A(page.total === want && /Everything here that can be traded is worth/.test(page.text) && page.text.includes(want.toLocaleString('en-US') + ' ★'), `the page says what everything ann holds is worth: ${want.toLocaleString('en-US')} ★`, { page: page.total, want, parts });
	A(page.chips.dust === 6000 && page.chips.gold === 100 && page.chips.bcpacks === 200 && page.chips.mscoins === 617 && page.chips.mst1 === 140 && page.chips.mst10 === 400 && page.chips.money === 30 && page.chips.coins === 20 && page.chips.pkpoints === null, 'each currency shows its value: 300 dust 6,000 ★, 150 gold 100 ★, 2 packs 200 ★, MicaSurvivor 1,234 coins 617 ★ / 7 tickets 140 ★ / 2 10-pull tickets 400 ★, $3,000 30 ★, 100 coins 20 ★ (pack points are not tradeable: no value)', page.chips);
	A(page.bccards === '700 ★' && page.mon === V.starText(V.monValue(PIKA)) && page.items.potion === '15 ★' && page.items.masterball === '500 ★' && /not tradeable/.test(page.items.bicycle) && /not tradeable/.test(page.items.hm1), "and each holding: her Battlecards cards 700 ★, her Pikachu, five Potions 15 ★, a Master Ball 500 ★; the Bicycle and the HM say they cannot be traded", page);
	// the trade window
	const bob = await open('bob');
	await ann.click('#open-trade'); await bob.click('#open-trade');
	await waitFor(() => ann.q(() => !!document.querySelector('[data-k="ask:bob"]')), 8000); await ann.click('[data-k="ask:bob"]');
	await waitFor(() => bob.q(() => !!document.querySelector('[data-k="accept:ann"]')), 8000); await bob.click('[data-k="accept:ann"]');
	A(await waitFor(async () => /win/.test((await ann.win()).cls) && /win/.test((await bob.win()).cls), 12000), 'ann and bob open the trade window');
	const amount = async (p, k, n) => { await p.page.evaluate((k2, n2) => { const i = document.querySelector(`[data-amt="${k2}"]`); i.value = String(n2); i.dispatchEvent(new Event('change')); }, k, n); await sleep(250); };
	await amount(ann, 'dust', 3); await ann.click('[data-tab="bc"]'); await ann.click('[data-add="bc:white_knight"]');
	await ann.click('[data-tab="ow"]');
	await waitFor(() => ann.q(() => !document.getElementById('owwhy')), 8000);
	const owList = await ann.q(() => [...document.querySelectorAll('[data-add]')].map(b => b.dataset.add));
	A(owList.includes('item:potion') && owList.includes('item:masterball') && !owList.includes('item:bicycle') && !owList.includes('item:hm1'), "the window's Overworld tab offers the Potions and the Master Ball, never the Bicycle or the HM", owList);
	if (owList.includes('item:masterball')) await ann.click('[data-add="item:masterball"]');
	await bob.click('[data-tab="money"]'); await amount(bob, 'gold', 300);
	const annWant = 60 + 200 + 500, bobWant = 200;
	A(await waitFor(async () => { const a = await ann.win(), b = await bob.win(); return a.mine.total === annWant && b.theirs.total === annWant && a.theirs.total === bobWant && b.mine.total === bobWant; }, 10000), `each side shows its total on both screens: ann's 3 dust + White Knight + Master Ball = ${annWant} ★, bob's 300 gold = ${bobWant} ★`, [await ann.win(), await bob.win()]);
	const wb = await bob.win();
	A(JSON.stringify(wb.theirs.rows.map(r => r[1])) === JSON.stringify([60, 200, 500]) && wb.theirs.rows.every(r => / ★$/.test(r[2])) && /760 ★/.test(wb.theirs.totText), 'and bob sees each thing ann put up with its value: 3 dust 60 ★, the White Knight 200 ★, the Master Ball 500 ★', wb.theirs.rows);
	const ph = await ann.q(() => document.documentElement.scrollWidth <= innerWidth + 1);
	A(ph, 'nothing in the window overflows sideways');
	await ann.click('#tcancel');
	A(!ann.errors.length && !bob.errors.length, 'no page errors', [...ann.errors, ...bob.errors].slice(0, 3).join(' | '));
} catch (e) {
	if (e && e.message === 'skip') console.log('skip - overworld/data not present: the pages');
	else { fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e)); }
} finally {
	if (browser) await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
