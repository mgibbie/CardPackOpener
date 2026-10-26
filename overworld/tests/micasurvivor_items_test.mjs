// micasurvivor_items_test.mjs — MicaSurvivor M5 batch 3 ("Items + Upgrades"): the 15 held items and 4
// permanent upgrades the Godot Android port by JayElDragon (poke-survivor: types_data.gd ITEMS,
// save_data.gd UPGRADES / perks / tm_pool, menu.gd _tm_panel, their hooks in main.gd) adds, driven
// headlessly with a Magepunk account (an in-test stub of micasurvivor-save-get/-put with the
// server's compare-and-set) and a SYNTHETIC gamepad:
//   - data: 26 items in the port's order, 15 new with the port's icons (data/icons.json "ui",
//     icons.gd EXTRA for the Colossal Orb); 17 upgrades with the port's costs / levels; English
//   - upgrades screen: Caliber (6 levels, 80 x 1.4^n), TM (2000), Second Chance (2 levels, 2500 x2),
//     (Backpack: retired in DLC D17, not on sale) bought with Pokémonedas; the TM editor ("Choose") opened and used with the
//     gamepad only: the pool is the Pokémon's types + Normal without support moves (Mew: all), the
//     pick becomes the starting move and leaves the ban list
//   - upgrades persist (pushed to the account, back after a reload) and merge safely: a newer save
//     from another device (409) is merged with max levels, nothing bought is lost, a hand-edited
//     level above the max is clamped, the TM pick of each Pokémon is kept
//   - a run with them: x1.48 size, 2 hearts, ONE item slot (DLC D17), the TM move first; the web's free card
//     reroll is still there
//   - every new item with the port's numbers: Never-Melt Ice (30 % slow, 2 s, real contact loop),
//     Scope Lens (+15 % crit), Expert Belt (x1.25 super effective), Wide Lens (x1.2 radius), Colossal
//     Orb (x1.3 size + the batch-1 alternative evolution), Type Gem (x1.2 own type), Sitrus Berry
//     (below 50 % heals 30 %, every 90 s), Heavy-Duty Boots / Safety Goggles (map traps / weather chip,
//     through G.Abilities' immunity checks), Weakness Policy (x1.5 attack for 8 s after a super
//     effective hit), Rare Candy (+1 level at once, no slot taken), Pure Incense (x0.75 spawn rate,
//     x1.3 HP, x1.5 XP, x1.25 coins), Light Ball / Thick Club (species-locked: x2 Electric for
//     Pikachu/Pichu/Raichu, x1.5 Ground for Cubone/Marowak, and they only drop for them), Silver Powder
//   - one held item (DLC D17: replaces "carry two"): the first is worn; a second opens the 2-card choice (keep / switch, also
//     with an old save's Backpack flag); the HUD shows it
//   - Second Chance: a lethal hit revives with full HP (2.5 s invulnerable) and knocks enemies within
//     260 away (500); Focus Sash still fires first; no hearts left -> down
// Screenshots go to MICASURVIVOR_SHOTS=<dir> when set.
// Covers micasurvivor/js/data/items.js, data/upgrades.js, data/starters.js, data/achievements.js,
// data/lang-en.js, entities/player.js, game.js, systems/combat.js, systems/spawner.js,
// systems/abilities.js, core/db.js, ui/menu.js, ui/run-ui.js, ui/hud.js, ui/icons.js, css/style.css,
// index.html.
//   node overworld/tests/micasurvivor_items_test.mjs
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
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8829;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

// the account row micasurvivor:<user>, with the server's compare-and-set (server/mp.mjs)
const ROW = { rev: 0, save: null };
const apiLog = [];
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = '';
		req.on('data', c => { raw += c; });
		req.on('end', () => {
			let body = {}; try { body = JSON.parse(raw || '{}'); } catch { }
			apiLog.push(body.action);
			let out = {}, status = 200;
			if (body.action === 'micasurvivor-save-get') out = { rev: ROW.rev, save: ROW.save };
			else if (body.action === 'micasurvivor-save-put') {
				if (body.rev === ROW.rev) { ROW.rev++; ROW.save = JSON.parse(JSON.stringify(body.save)); out = { ok: true, rev: ROW.rev }; }
				else { status = 409; out = { error: 'stale', rev: ROW.rev, save: ROW.save }; }
			}
			res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
		});
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

// the synthetic Gamepad API + a Magepunk login, before any page script runs
const BEFORE = () => {
	window.__pads = [];
	window.__mkPad = (i, id) => ({
		index: i, id, connected: true, mapping: 'standard', timestamp: 0,
		buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
		axes: [0, 0, 0, 0],
		vibrationActuator: { playEffect() { return Promise.resolve('complete'); } },
	});
	window.__btn = (b, on, p = 0) => { const pad = window.__pads[p]; if (pad) pad.buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; };
	Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value() { return [0, 1, 2, 3].map(i => window.__pads[i] || null); } });
	localStorage.setItem('magepunk_mp_token_v1', 'items-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'itemtester' }));
};

// the port's numbers (save_data.gd UPGRADES + up_cost): round(base * grow^lvl / 10) * 10
const UP = { size: [6, 80, 1.4], tm: [1, 2000, 1], revive: [2, 2500, 2], bag: [1, 7500, 1] };
const costs = id => Array.from({ length: UP[id][0] }, (_, l) => Math.round(UP[id][1] * Math.pow(UP[id][2], l) / 10) * 10);
const NEW_ITEMS = ['eternalice', 'scopelens', 'expertbelt', 'widelens', 'bigorb', 'typegem', 'sitrusberry', 'heavyboots', 'safetygoggles', 'weaknesspolicy', 'rarecandy', 'pureincense', 'lightball', 'thickclub', 'silverpowder'];
const PORT_ORDER = ['leftovers', 'choiceband', 'quickclaw', 'focussash', 'shellbell', 'amuletcoin', 'luckyegg', 'lifeorb', 'choicescarf', 'rockyhelmet', 'eternalice', 'assaultvest', 'scopelens', 'expertbelt', 'widelens', 'bigorb', 'typegem', 'sitrusberry', 'heavyboots', 'safetygoggles', 'weaknesspolicy', 'rarecandy', 'pureincense', 'lightball', 'thickclub', 'silverpowder'];

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(BEFORE);
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
	const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const shot = async (name, clip) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), ...(clip ? { clip } : {}) }); } };
	const E = (fn, ...a) => page.evaluate(fn, ...a);
	const press = async (b) => { await E(b => __btn(b, true), b); await sleep(80); await E(b => __btn(b, false), b); await sleep(110); };
	const B = { cancel: 0, confirm: 1, up: 12, down: 13, left: 14, right: 15 };   // Nintendo default (site standard)
	const navTo = async (sel) => {
		for (let i = 0; i < 60; i++) {
			const d = await E(sel => {
				const f = document.querySelector('.pad-focus'), t = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length);
				if (!f || !t) return 'missing';
				if (f === t) return 'here';
				const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
				const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
				return Math.abs(dy) > 8 && (Math.abs(dy) >= Math.abs(dx) * 0.5 || Math.abs(dx) < 8) ? (dy > 0 ? 13 : 12) : (dx > 0 ? 15 : 14);
			}, sel);
			if (d === 'here') return true;
			if (d === 'missing') return false;
			if (process.env.PAD_DEBUG) console.log('  nav', d, await E(() => { const f = document.querySelector('.pad-focus'); const r = f.getBoundingClientRect(); return (f.textContent || '').trim().slice(0, 20) + ' @' + Math.round(r.left) + ',' + Math.round(r.top); }));
			await press(d);
		}
		return false;
	};

	// ---------- boot (logged in) -> personality test -> menu
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready), 30000), 'boots logged in (Magepunk account)', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	A(await waitFor(() => visible('scr-test'), 10000), 'straight to the personality test');
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	// Charmander as partner (fire: Blaze does nothing at full HP), with plenty of Pokémonedas
	await E(() => { const s = G.DB.save; G.DB.grant(4, 'starter'); s.partner = 4; s.partnerShiny = false; s.coins = 50000; G.DB.commit(true); G.UI.refreshCoins(); });

	// ================= 1. data =================
	{
		const r = await E((NEW) => ({
			ids: G.Items.LIST.map(i => i.id),
			icons: G.Items.LIST.filter(i => !G.Icons.UI[i.id]).map(i => i.id),
			upIcons: G.Upgrades.LIST.filter(u => !G.Icons.UI[u.icon]).map(u => u.id),
			ups: G.Upgrades.LIST.map(u => u.id),
			defs: ['size', 'tm', 'revive', 'bag'].map(id => { const u = G.Upgrades.BY[id]; return [id, u.max, Array.from({ length: u.max }, (_, l) => G.Upgrades.cost(id, l))]; }),
			sizes: ['eternalice', 'bigorb', 'tm'].map(id => [G.Icons.canvas(id).width, G.Icons.canvas(id).height]),
			en: G.Items.LIST.filter(i => NEW.includes(i.id)).flatMap(i => [i.name, i.desc]).concat(['size', 'tm', 'revive', 'bag'].flatMap(id => [G.Upgrades.BY[id].name, G.Upgrades.BY[id].unit])).map(s => [s, G.I18n.t(s)]),
			only: G.Items.LIST.filter(i => i.only).map(i => [i.id, i.only]),
			instant: G.Items.LIST.filter(i => i.instant).map(i => i.id),
		}), NEW_ITEMS);
		A(JSON.stringify(r.ids) === JSON.stringify(PORT_ORDER), `26 items in the port's order (${r.ids.length}; 15 new)`, JSON.stringify(r.ids));
		A(r.icons.length === 0 && r.upIcons.length === 0, 'every item and upgrade has its pixel-art icon', JSON.stringify([r.icons, r.upIcons]));
		A(JSON.stringify(r.sizes) === '[[20,20],[16,16],[20,20]]', 'the port\'s icons copied as-is (20x20; the Colossal Orb 16x16 from icons.gd)', JSON.stringify(r.sizes));
		A(JSON.stringify(r.ups) === JSON.stringify(['hp', 'atk', 'spd', 'cd', 'def', 'regen', 'magnet', 'xp', 'coins', 'moves', 'crit', 'size', 'reroll', 'tm', 'ban', 'revive', 'bag']), '17 upgrades, the 4 new in the port\'s places', JSON.stringify(r.ups));
		A(JSON.stringify(r.defs) === JSON.stringify(['size', 'tm', 'revive', 'bag'].map(id => [id, UP[id][0], costs(id)])),
			`costs and levels: Caliber ${costs('size')}, TM ${costs('tm')}, Second Chance ${costs('revive')}, Backpack ${costs('bag')}`, JSON.stringify(r.defs));
		A(JSON.stringify(r.only) === '[["lightball",[172,25,26]],["thickclub",[104,105]]]' && JSON.stringify(r.instant) === '["rarecandy"]', 'species locks (Light Ball: Pichu/Pikachu/Raichu, Thick Club: Cubone/Marowak) and Rare Candy is instant', JSON.stringify([r.only, r.instant]));
		const bad = r.en.filter(([es, en]) => es === en || /[¡¿ñáéíóú]/i.test(en.replace(/Poké/g, '')));
		A(bad.length === 0, `every new item / upgrade string has English (${r.en.length})`, JSON.stringify(bad));
		const names = Object.fromEntries(r.en.map(([es, en]) => [es, en]));
		A(names['Seguro Debilidad'] === 'Weakness Policy' && names['Mochila'] === 'Backpack' && names['MT'] === 'TM' && names['Esfera Colosal'] === 'Colossal Orb' && names['Botas Gruesas'] === 'Heavy-Duty Boots', 'the port\'s English names', JSON.stringify(names));
		const achGoal = await E(() => (G.AchDefs.BY.itemsAll || {}).goal);
		A(achGoal === 26, `"Item collector" asks for all ${achGoal} items (port: TD.ITEMS.size())`);
	}

	// ================= 2. upgrades screen: buy the 4 new ones =================
	await E(() => document.querySelector('#scr-menu [data-go=upgrades]').click());
	A(await waitFor(() => visible('scr-upgrades'), 5000), 'upgrades screen');
	await sleep(400);
	{
		// (DLC D17: the shop lists the upgrades on sale, G.Upgrades.live(): Backpack is retired)
		const row = id => E(id => { const i = G.Upgrades.live().findIndex(u => u.id === id); const el = i < 0 ? null : document.querySelectorAll('#upg-list .upg-item')[i]; return el ? el.innerText.replace(/\s+/g, ' ').trim() : null; }, id);
		const buy = id => E(id => { const i = G.Upgrades.live().findIndex(u => u.id === id); const c0 = G.DB.save.coins; document.querySelectorAll('#upg-list .upg-item')[i].querySelector('[data-buy]').click(); return c0 - G.DB.save.coins; }, id);
		const noTmBefore = await E(() => !document.querySelector('[data-tm]'));
		A(noTmBefore, 'no TM editor button before the TM is bought');
		A(/Caliber/.test(await row('size')) && /\+8% size for projectiles, orbs and areas/.test(await row('size')) && /TM Choose your starting move \(from your types\)/.test(await row('tm'))
			&& /Second Chance/.test(await row('revive')) && (await row('bag')) === null, 'the 3 new rows on sale, in English (Backpack retired: not listed, DLC D17)', JSON.stringify([await row('size'), await row('tm'), await row('revive'), await row('bag')]));
		const paid = {};
		for (const id of ['size', 'tm', 'revive']) { paid[id] = []; for (let i = 0; i < UP[id][0] + 1; i++) paid[id].push(await buy(id)); }
		A(JSON.stringify(paid) === JSON.stringify(Object.fromEntries(['size', 'tm', 'revive'].map(id => [id, [...costs(id), 0]]))), 'each level costs the port\'s price and a maxed upgrade cannot be bought again', JSON.stringify(paid));
		const lv = await E(() => G.DB.upgradesOf(4));
		A(lv.size === 6 && lv.tm === 1 && lv.revive === 2 && !lv.bag, 'levels saved per Pokémon (save.pupg[4])', JSON.stringify(lv));
		const perks = await E(() => G.Upgrades.perks(G.DB.upgradesOf(4)));
		A(near(perks.size, 1.48) && perks.tm === 1 && perks.revives === 2 && perks.bag === false && perks.rerolls === 0, 'perks: size x1.48 (+8% x6), TM on, 2 hearts, no Backpack (retired), no bought rerolls', JSON.stringify(perks));
		A(/Max/.test(await row('tm')), 'maxed rows say "Max."', await row('tm'));
		await shot('upgrades.png');
	}

	// ================= 3. the TM editor, with the gamepad only =================
	{
		const pool = await E(() => ({ c: G.tmPool(4), mew: G.tmPool(151).length, all: G.Moves.ALL.filter(m => m.kind !== 'buff').length,
			bad: G.tmPool(4).filter(id => { const m = G.Moves.BY_ID[id]; return m.kind === 'buff' || !['normal', 'fire'].includes(m.type); }),
			missing: G.Moves.ALL.filter(m => m.kind !== 'buff' && ['normal', 'fire'].includes(m.type) && !G.tmPool(4).includes(m.id)).map(m => m.id) }));
		A(pool.bad.length === 0 && pool.missing.length === 0 && pool.c.includes('flamethrower') && pool.c.includes('tackle'), `TM pool: Charmander's Fire + Normal moves, no support moves (${pool.c.length})`, JSON.stringify(pool));
		A(pool.mew === pool.all, `Mew can pick any attacking move (${pool.mew}/${pool.all})`);
		await E(() => { G.DB.save.pban = G.DB.save.pban || {}; G.DB.save.pban[4] = ['flamethrower', 'fire-spin']; });
		await E(() => { window.__pads[0] = window.__mkPad(0, 'Synthetic Pro Controller (STANDARD GAMEPAD)'); });
		await press(B.confirm);   // the first press takes the pad (focus ring only)
		A(await E(() => G.Pad.active), 'the pad drives the menus (logged in)');
		A(await navTo('[data-tm]'), 'D-pad reaches the TM "Choose" button');
		if (process.env.PAD_DEBUG) console.log('focus', await E(() => { const f = document.querySelector('.pad-focus'); return f && f.outerHTML.slice(0, 120); }));
		await press(B.confirm);
		A(await waitFor(() => visible('tm-picker'), 3000), 'confirm opens the TM editor');
		if (process.env.PAD_DEBUG) console.log('after', await E(() => { const f = document.querySelector('.pad-focus'); return [f && f.outerHTML.slice(0, 120), G.Pad.topScope() && G.Pad.topScope().id]; }));
		const sub = await E(() => document.querySelector('#tm-picker .sub').innerText);
		A(sub === 'Choose the move you start every run with. You can change it for free whenever you want.', 'the editor explains itself in English', sub);
		const onBefore = await E(() => [...document.querySelectorAll('#tm-picker .chip.on')].map(b => b.dataset.tmId));
		A(JSON.stringify(onBefore) === '["ember"]', 'the current starting move (Ember) is marked', JSON.stringify(onBefore));
		A(await navTo('#tm-picker [data-tm-id="flamethrower"]'), 'D-pad reaches Flamethrower in the editor');
		await press(B.confirm);
		await sleep(200);
		const after = await E(() => ({ ptm: G.DB.save.ptm[4], start: G.startMoveOf(4), natural: G.naturalStartOf(4), ban: G.DB.save.pban[4], on: [...document.querySelectorAll('#tm-picker .chip.on')].map(b => b.dataset.tmId), still: !!document.getElementById('tm-picker') }));
		A(after.ptm === 'flamethrower' && after.start === 'flamethrower' && after.natural === 'ember' && after.still && JSON.stringify(after.on) === '["flamethrower"]', 'confirm picks Flamethrower: it is now the starting move (the editor stays open, marked)', JSON.stringify(after));
		A(JSON.stringify(after.ban) === '["fire-spin"]', 'the picked move leaves the ban list (save_data.gd tm_set)', JSON.stringify(after.ban));
		await shot('tm_editor.png');
		const el = await page.$('#tm-picker');
		if (SHOTS && el) await el.screenshot({ path: path.join(SHOTS, 'tm_editor_panel.png') });
		// without the TM the pick is ignored
		const noTm = await E(() => { const u = G.DB.upgradesOf(4); u.tm = 0; const s = G.startMoveOf(4); u.tm = 1; return s; });
		A(noTm === 'ember', 'without the TM upgrade the saved pick is ignored (natural start move)', noTm);
		await E(() => { window.__pads[0] = null; G.Pad.release && G.Pad.release(); });
	}

	// ================= 4. persisted to the account + merged safely =================
	{
		await E(() => G.DB.flush());
		await waitFor(() => ROW.save && ROW.save.pupg && ROW.save.pupg['4'] && ROW.save.pupg['4'].revive === 2, 5000);
		A(ROW.save && JSON.stringify(ROW.save.pupg['4']) === JSON.stringify({ size: 6, tm: 1, revive: 2 }) && ROW.save.ptm['4'] === 'flamethrower', 'the upgrades and the TM pick reach the account row', JSON.stringify(ROW.save && [ROW.save.pupg, ROW.save.ptm]));
		// another device saved meanwhile (newer): fewer levels on 4, a hand-edited one above the max, other picks
		const other = JSON.parse(JSON.stringify(ROW.save));
		other.pupg['4'] = { size: 99, hp: 3 };
		other.pupg['7'] = { revive: 1 };
		other.ptm = { '7': 'water-gun' };
		other.updated = Date.now() + 60000;
		ROW.save = other; ROW.rev++;
		await E(() => { G.DB.save.coins += 1; G.DB.commit(true); return G.DB.flush(); });
		await sleep(300);
		await E(() => G.DB.flush());
		const m = { row: ROW.save && ROW.save.pupg, ptm: ROW.save && ROW.save.ptm, local: await E(() => [G.DB.save.pupg, G.DB.save.ptm]) };
		const sorted = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
		A(m.row && sorted(m.row['4']) === sorted({ size: 6, hp: 3, tm: 1, revive: 2 }) && m.row['7'] && m.row['7'].revive === 1,
			'a stale write (409) merges: the max of every level, nothing bought on either device lost, the hand-edited 99 clamped to 6', JSON.stringify(m));
		A(m.ptm && m.ptm['4'] === 'flamethrower' && m.ptm['7'] === 'water-gun', 'each Pokémon\'s TM pick survives the merge', JSON.stringify(m.ptm));
		const direct = await E(() => {
			const a = { updated: 1, coins: 0, tickets: { t1: 0, t10: 0 }, pupg: { 4: { tm: 1, bag: 1 } }, ptm: { 4: 'flamethrower' }, owned: {}, shiny: {}, upgrades: {} };
			const b = { updated: 2, coins: 0, tickets: { t1: 0, t10: 0 }, pupg: { 4: { size: 2 } }, ptm: {}, owned: {}, shiny: {}, upgrades: {} };
			const r1 = G.DB.merge(a, b), r2 = G.DB.merge(b, a);
			return [r1.pupg, r1.ptm, JSON.stringify(r1.pupg) === JSON.stringify(G.DB.merge(r1, b).pupg), JSON.stringify(r2.pupg)];
		});
		A(JSON.stringify(direct[0]) === '{"4":{"size":2,"tm":1,"bag":1}}' && direct[1][4] === 'flamethrower' && direct[2], 'G.DB.merge: max levels, picks kept from the older save, idempotent', JSON.stringify(direct));
		// a reload brings it all back from the account
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden')), 30000);
		await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
		A(await waitFor(() => visible('scr-menu'), 10000), 'after a reload: the menu (same account)');
		const back = await E(() => [G.DB.upgradesOf(4), G.DB.save.ptm[4], G.startMoveOf(4)]);
		A(back[0].size === 6 && back[0].tm === 1 && back[0].revive === 2 && !back[0].bag && back[1] === 'flamethrower' && back[2] === 'flamethrower', 'after a reload the upgrades and the TM pick are still there', JSON.stringify(back));
	}

	// ================= 5. a run with the upgrades =================
	await E(() => document.querySelector('#scr-menu [data-go=play]').click());
	A(await waitFor(() => E(() => G.Game.state === 'playing'), 15000), 'run starts');
	await sleep(800);
	{
		const r = await E(() => { const pl = G.Game.player; return { size: pl.sizePerk, sizeK: pl.sizeK(), revives: pl.revives, bag: pl.bag, slots: pl.itemSlots(), first: pl.moves[0].id, free: Math.max(0, 1 + (pl.rerollBonus || 0) - (pl.rerolls || 0)), bonus: pl.rerollBonus }; });
		A(near(r.size, 1.48) && near(r.sizeK, 1.48), `Caliber 6: projectiles, orbs and areas x${r.size} (Player.sizeK)`);
		A(r.revives === 2 && !r.bag && r.slots === 1, 'Second Chance 2: two hearts; ONE item slot (DLC D17)', JSON.stringify(r));
		A(r.first === 'flamethrower', `the TM pick is the run's first move (${r.first})`);
		A(r.free === 1 && r.bonus === 0, `the web's free card reroll is kept (${r.free} left, no reroll upgrade bought)`);
		const drawn = await E(async () => {
			const seen = [];
			const P = CanvasRenderingContext2D.prototype, f = P.drawImage;
			let hearts = 0;
			const heart = G.Icons.canvas('revive');
			P.drawImage = function (img, ...a) { if (img === heart) hearts++; return f.call(this, img, ...a); };
			await new Promise(r => setTimeout(r, 300));
			P.drawImage = f;
			return hearts;
		});
		A(drawn > 0, 'the HUD draws the Second Chance hearts');
		await shot('hud_hearts.png', { x: 0, y: 0, width: 420, height: 110 });
	}
	// pause: from here the test steps the world by hand
	await E(() => {
		G.Game.togglePause();
		G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields();
		window.T = {
			mk(dex, dx, dy, o = {}) {
				const pl = G.Game.player;
				const def = { dex, name: 'T' + dex, hp: o.hp || 100000, spd: o.spd || 40, dmg: o.dmg || 10, xp: 1, behavior: o.behavior || 'chaser' };
				const e = new G.Enemy(def, pl.x + dx, pl.y + dy, { hp: 1, spd: 1, dmg: 1 }, !!o.boss);
				e.flying = true;
				G.EnemyMgr.add(e); G.EnemyMgr.rebuildGrid();
				return e;
			},
			reset() { G.EnemyMgr.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.EnemyMgr.rebuildGrid(); },
			only(id, lvl = 1) {
				const pl = G.Game.player;
				G.Projectiles.clearOrbs(pl);
				const m = G.Moves.instance(id, lvl);
				pl.moves = [m]; pl.slots = [[m]]; pl.active = 0;
				return m;
			},
			// a clean player: no defence, buffs, items, weather, hearts; big HP; a ranged move; Blaze (idle at full HP)
			clean() {
				const pl = G.Game.player;
				pl.equip(null, 1); pl.equip(null, 2);
				pl.dmgReduce = 0; for (const k in pl.buffs) pl.buffs[k].n = 0;
				if (pl.power) { pl.power.def.off(pl); pl.power = null; }
				pl.slowT = 0; pl.inLiquid = false; pl.wpT = 0; pl.sitrusT = -999; pl.sashT = -Infinity; pl.revives = 0;
				G.Weather.clear();
				G.Abilities.set(pl, 'blaze'); pl.abT = 1000; pl.abSturdyT = -999;
				T.only('ember');
				pl.dead = false; pl.maxHp = 100000; pl.hp = pl.maxHp; pl.invuln = 0;
				return pl;
			},
			eq(...ids) { const pl = T.clean(); ids.forEach((id, i) => pl.equip(id, i + 1)); return pl; },
			hurt(amount, type = null, pure = false) { const pl = G.Game.player; pl.invuln = 0; const h = pl.hp; pl.hurt(amount, type, pure); return h - pl.hp; },
			withRandom(v, fn) { const R = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = R; } },
			weather(kind) { G.Weather.clear(); if (kind) { G.Weather.force(kind, 60); G.Weather.update(4, 0, null); } },
			// one hit of a `type` move from the player on `e`, with or without the items (same roll)
			hit(e, type, kind = 'projectile') { return G.Combat.land(e, 100, '#fff', 1, 0, 0, { type, kind }, false, G.Game.player); },
		};
	});
	A(await E(() => G.Game.state) === 'paused', 'run paused for stepping');

	// ================= 6. damage items: Expert Belt, Type Gem, Silver Powder, Light Ball, Thick Club, Scope Lens =================
	{
		const r = await E(() => {
			const out = {};
			const grass = T.mk(1, 300, 0), normal = T.mk(19, 300, 40);   // Bulbasaur (grass/poison), Rattata (normal)
			const ratio = (id, e, type) => { T.clean(); const a = T.hit(e, type); T.eq(id); const b = T.hit(e, type); return b / a; };
			out.belt = [ratio('expertbelt', grass, 'fire'), ratio('expertbelt', normal, 'fire'), ratio('expertbelt', grass, 'water')];
			out.gem = [ratio('typegem', normal, 'fire'), ratio('typegem', normal, 'water')];   // Charmander: fire
			out.powder = [ratio('silverpowder', normal, 'bug'), ratio('silverpowder', normal, 'fire')];
			const pl = G.Game.player, dex0 = pl.dex;
			out.light = {};
			for (const d of [25, 26, 172, 4]) { pl.dex = d; out.light[d] = [ratio('lightball', normal, 'electric'), ratio('lightball', normal, 'fire')]; }
			out.club = {};
			for (const d of [104, 105, 4]) { pl.dex = d; out.club[d] = [ratio('thickclub', normal, 'ground'), ratio('thickclub', normal, 'rock')]; }
			pl.dex = dex0;
			T.clean(); const c0 = pl.critChance; T.eq('scopelens'); const c1 = pl.critChance; T.clean(); const c2 = pl.critChance;
			out.scope = [c1 - c0, c2 - c0];
			// two at once multiply (item + item2, as an old run carried them): Expert Belt + Type Gem on a super-effective fire hit
			out.both = ratio('expertbelt', grass, 'fire') && (() => { T.clean(); const a = T.hit(grass, 'fire'); T.eq('expertbelt', 'typegem'); return T.hit(grass, 'fire') / a; })();
			// a real Ember projectile carries the item bonus (Type Gem)
			const cast = withGem => {
				const p = withGem ? T.eq('typegem') : T.clean(); T.reset(); T.only('ember');
				const e = T.mk(19, 18, 0, { spd: 0 }); p.aim = 0; p.target = e; p.activeMove().t = 0;
				const d0 = p.dmgDealt;
				T.withRandom(0.99, () => {
					G.Combat.tick(0.016, p, performance.now() / 1000);
					for (let i = 0; i < 30 && p.dmgDealt === d0; i++) { G.Projectiles.update(0.016); G.Combat.resolve(0.016, p, performance.now() / 1000 + i); }
				});
				const d = p.dmgDealt - d0; T.reset(); return d;
			};
			out.real = cast(true) / cast(false);
			T.reset(); T.clean();
			return out;
		});
		A(near(r.belt[0], 1.25) && near(r.belt[1], 1) && near(r.belt[2], 1), `Expert Belt: x1.25 on super-effective hits only (${r.belt.map(x => x.toFixed(3))})`);
		A(near(r.gem[0], 1.2) && near(r.gem[1], 1), `Type Gem: x1.2 with your Pokémon's type (Charmander: Fire ${r.gem[0].toFixed(3)}, Water ${r.gem[1].toFixed(3)})`);
		A(near(r.powder[0], 1.2) && near(r.powder[1], 1), `Silver Powder: x1.2 Bug moves (${r.powder.map(x => x.toFixed(3))})`);
		A([25, 26, 172].every(d => near(r.light[d][0], 2) && near(r.light[d][1], 1)) && near(r.light[4][0], 1), 'Light Ball: x2 Electric for Pikachu / Raichu / Pichu only (Charmander holding it: x1)', JSON.stringify(r.light));
		A([104, 105].every(d => near(r.club[d][0], 1.5) && near(r.club[d][1], 1)) && near(r.club[4][0], 1), 'Thick Club: x1.5 Ground for Cubone / Marowak only', JSON.stringify(r.club));
		A(near(r.scope[0], 0.15) && near(r.scope[1], 0), `Scope Lens: +15% crit chance while held (+${r.scope[0].toFixed(2)}, back to +${r.scope[1]} when removed)`);
		A(near(r.both, 1.5), `two items stack (item + item2, as an old run carried them): Expert Belt x Type Gem = x${r.both.toFixed(3)}`);
		A(near(r.real, 1.2, 1e-6), `a real Ember projectile carries the Type Gem bonus (x${r.real.toFixed(4)})`);
	}

	// ================= 7. Wide Lens, Colossal Orb (+ the alternative evolution), Never-Melt Ice =================
	{
		const r = await E(() => {
			const out = {};
			const pl = T.clean();
			const aura = G.Moves.ALL.find(m => m.kind === 'aura' && m.radius);
			const m = G.Moves.instance(aura.id, 1);
			const rad = () => G.Combat.eff(pl, m).radius;
			const r0 = rad(); T.eq('widelens'); const r1 = rad();
			out.wide = { move: aura.id, k: r1 / r0, sizePerk: pl.sizePerk };
			T.clean(); const s0 = pl.sizeK(); T.eq('bigorb'); const s1 = pl.sizeK(); T.eq('bigorb', 'widelens'); const r2 = rad();
			out.orb = { k: s1 / s0, withWide: r2 / r0 };
			// the batch-1 alternative evolution waits for the Colossal Orb (fire-spin -> Fire Vortex)
			T.clean(); T.only('fire-spin', 5); pl.statsTaken = { rgn: 1 };
			out.noOrb = [...new Set(Array.from({ length: 20 }, () => G.LevelUp.offer(pl).filter(c => c.type === 'evo').map(c => c.key)).flat())].sort();
			T.eq('bigorb'); T.only('fire-spin', 5);
			out.orbEvo = [...new Set(Array.from({ length: 20 }, () => G.LevelUp.offer(pl).filter(c => c.type === 'evo').map(c => c.key)).flat())].sort();
			pl.statsTaken = {};
			// Never-Melt Ice: an enemy that touches you is slowed 30 % for 2 s (the real contact loop)
			const touch = id => {
				const p = id ? T.eq(id) : T.clean(); T.reset();
				const e = T.mk(19, 0, 0, { dmg: 1, spd: 0 }); e.touchCd = 0;
				G.Combat.resolve(0.016, p, 1);
				const o = [e.slow, e.slowT]; T.reset(); return o;
			};
			out.ice = [touch('eternalice'), touch(null)];
			T.clean();
			return out;
		});
		A(near(r.wide.k, 1.2), `Wide Lens: x1.2 radius (${r.wide.move}: x${r.wide.k.toFixed(3)}, on top of Caliber x${r.wide.sizePerk})`);
		A(near(r.orb.k, 1.3) && near(r.orb.withWide, 1.2 * 1.3), `Colossal Orb: x1.3 size (x${r.orb.k.toFixed(3)}); with Wide Lens the radius is x${r.orb.withWide.toFixed(3)}`);
		A(JSON.stringify(r.noOrb) === '["evo:fire-spin"]' && JSON.stringify(r.orbEvo) === '["evo:fire-spin","evo:fire-spin:alt"]', 'holding the Colossal Orb enables Fire Spin\'s alternative evolution (batch-1 hook)', JSON.stringify([r.noOrb, r.orbEvo]));
		A(near(r.ice[0][0], 0.3) && near(r.ice[0][1], 2) && r.ice[1][0] === 0, `Never-Melt Ice: an enemy that hits you is 30% slower for 2 s (${JSON.stringify(r.ice)})`);
	}

	// ================= 8. Sitrus Berry, Weakness Policy, Heavy-Duty Boots, Safety Goggles =================
	{
		const r = await E(() => {
			const out = {};
			let pl = T.eq('sitrusberry');
			pl.hp = 60000; T.hurt(20000); out.s1 = pl.hp;              // 40 000 < 50 % -> +30 000
			pl.hp = 60000; T.hurt(20000); out.s2 = pl.hp;              // within 90 s: nothing
			pl.itemClock += 90.5; pl.hp = 60000; T.hurt(20000); out.s3 = pl.hp;
			pl.hp = 90000; T.hurt(20000); out.s4 = pl.hp;              // still above 50 %: nothing (and no clock)
			pl = T.clean(); pl.hp = 60000; T.hurt(20000); out.s0 = pl.hp;
			// Weakness Policy: Charmander hit by Water (super effective) -> x1.5 attack for 8 s
			pl = T.eq('weaknesspolicy'); const a0 = pl.atk;
			T.hurt(100, 'normal'); out.wpNeutral = [pl.wpT, pl.atk / a0];
			T.hurt(100, 'water'); out.wp = [pl.wpT, pl.atk / a0];
			pl.update(7.9); out.wp79 = pl.atk / a0;
			pl.update(0.2); out.wp81 = [pl.wpT, pl.atk / a0];
			pl = T.clean(); T.hurt(100, 'water'); out.wpNone = pl.wpT;
			// map traps (G.Interact.trapEffect) and the sandstorm chip, via G.Abilities' immunity checks
			const trap = id => {
				const p = id ? T.eq(id) : T.clean();
				G.Interact.trapEffect({ x: p.x, y: p.y + 8, kind: 0 }); const p1 = p.maxHp - p.hp; p.hp = p.maxHp;
				G.Interact.trapEffect({ x: p.x, y: p.y + 8, kind: 1 }); const sticky = p.slowT; p.slowT = 0;
				return { p1, sticky, imm: G.Abilities.trapImmune(p) };
			};
			out.trap = { boots: trap('heavyboots'), none: trap(null), goggles: trap('safetygoggles') };
			const chip = id => {
				const p = id ? T.eq(id) : T.clean();
				T.weather('sand'); G.Weather.update(2.1, 0, p); G.Weather.update(2.1, 0, p);
				const lost = p.maxHp - p.hp; T.weather(null); return { lost, imm: G.Abilities.weatherImmune(p) };
			};
			out.chip = { goggles: chip('safetygoggles'), none: chip(null), boots: chip('heavyboots') };
			T.clean();
			return out;
		});
		A(r.s1 === 70000 && r.s2 === 40000 && r.s3 === 70000 && r.s4 === 70000 && r.s0 === 40000, `Sitrus Berry: below 50% heals 30% of max HP, once every 90 s (${r.s1}, ${r.s2}, ${r.s3}, ${r.s4}; without: ${r.s0})`);
		A(r.wpNeutral[0] === 0 && near(r.wpNeutral[1], 1) && r.wp[0] === 8 && near(r.wp[1], 1.5) && near(r.wp79, 1.5) && r.wp81[0] === 0 && near(r.wp81[1], 1) && r.wpNone === 0,
			'Weakness Policy: a super-effective hit gives x1.5 attack for 8 s (neutral hits: nothing)', JSON.stringify(r));
		A(r.trap.boots.p1 === 0 && r.trap.boots.sticky === 0 && r.trap.boots.imm && r.trap.none.p1 > 0 && r.trap.none.sticky > 0 && !r.trap.goggles.imm, 'Heavy-Duty Boots: map traps don\'t affect you (G.Abilities.trapImmune)', JSON.stringify(r.trap));
		A(r.chip.goggles.lost === 0 && r.chip.goggles.imm && r.chip.none.lost > 0 && !r.chip.boots.imm, `Safety Goggles: no sandstorm damage (G.Abilities.weatherImmune; without: -${r.chip.none.lost})`, JSON.stringify(r.chip));
	}

	// ================= 9. Rare Candy, Pure Incense, species locks in the drops =================
	{
		const r = await E(() => {
			const out = {};
			const pl = T.eq('leftovers', 'quickclaw');
			const lv = pl.level, pend = G.Game.pendingLevels;
			G.Game.offerItem('rarecandy');
			out.candy = { up: pl.level - lv, pend: G.Game.pendingLevels - pend, xpNext: pl.xpNext === G.Player.xpNeed(pl.level) /* (M5 batch 9: x the adaptive XP factor) */, items: [pl.item, pl.item2], choice: !document.getElementById('scr-item').classList.contains('hidden'), found: !!G.DB.save.itemsFound.rarecandy };
			const pl2 = T.clean(); const lv2 = pl2.level; G.Game.offerItem('rarecandy');
			out.candyEmpty = { up: pl2.level - lv2, items: [pl2.item, pl2.item2] };
			// Pure Incense: the same enemy with and without (x1.3 HP, x1.5 XP); x0.75 spawn rate; x1.25 coins
			const free = G.World.isFree; G.World.isFree = () => true;
			const one = id => { const p = id ? T.eq(id) : T.clean(); T.reset(); const e = T.withRandom(0.37, () => G.Spawner.spawnOne(p, 100)); const o = [e.maxHp, e.hp, e.xp, e.dex]; T.reset(); return o; };
			const a = one(null), b = one('pureincense');
			out.inc = { hp: b[0] / a[0], full: b[1] === b[0], xp: b[2] / a[2], same: a[3] === b[3] };
			const count = id => {
				const p = id ? T.eq(id) : T.clean(); T.reset();
				const add = G.EnemyMgr.add, boss = G.EnemyMgr.bossAlive; let n = 0;
				G.EnemyMgr.add = e => { if (!e.boss) n++; }; G.EnemyMgr.bossAlive = () => false;
				try { G.Spawner.reset(); for (let i = 0; i < 250; i++) G.Spawner.update(0.1, [p], 150); }
				finally { G.EnemyMgr.add = add; G.EnemyMgr.bossAlive = boss; }
				return n;
			};
			const n0 = count(null), n1 = count('pureincense');
			const ak = G.Adaptive.rateK();   // (M5 batch 9: the normal run's adaptive difficulty multiplies the spawn rate too)
			out.rate = { n0, n1, ak, expect0: Math.floor(G.Spawner.rate(150) * 25 * ak), expect1: Math.floor(G.Spawner.rate(150) * 25 * 0.75 * ak) };
			G.World.isFree = free;
			const coins = (id, rnd) => { const p = id ? T.eq(id) : T.clean(); const c = p.coins; T.withRandom(rnd, () => G.Game.debugCollect({ kind: 'coin', value: 10, x: p.x, y: p.y })); return p.coins - c; };
			out.coins = [coins('pureincense', 0), coins('pureincense', 0.6), coins(null, 0.6)];
			// species locks: what drops is rolled for your Pokémon (main.gd _item_ok_for)
			T.clean();
			const rolls = (who, n = 3000) => { const s = {}; for (let i = 0; i < n; i++) { const id = G.Items.roll(who); s[id] = (s[id] || 0) + 1; } return s; };
			const char = rolls(undefined);                   // the run's player (Charmander), like the chests and bosses do
			const pika = rolls({ dex: 25, item: null, item2: null }), cub = rolls({ dex: 104, item: 'leftovers', item2: 'thickclub' }), cubone = rolls({ dex: 104, item: null, item2: null });
			out.locks = { charLight: char.lightball || 0, charClub: char.thickclub || 0, charKinds: Object.keys(char).length, pikaLight: pika.lightball || 0, pikaClub: pika.thickclub || 0,
				cubClub: cubone.thickclub || 0, heldClub: cub.thickclub || 0, heldLeft: cub.leftovers || 0,
				ok: [G.Items.okFor('lightball', 25), G.Items.okFor('lightball', 26), G.Items.okFor('lightball', 172), G.Items.okFor('lightball', 4), G.Items.okFor('thickclub', 105), G.Items.okFor('thickclub', 25), G.Items.okFor('leftovers', 4)] };
			const heldNow = T.eq('scopelens', 'bigorb'); const held = rolls(undefined, 1500);
			out.locks.heldSkip = (held.scopelens || 0) + (held.bigorb || 0);
			T.clean();
			return out;
		});
		A(r.candy.up === 1 && r.candy.pend === 1 && r.candy.xpNext && JSON.stringify(r.candy.items) === '["leftovers","quickclaw"]' && !r.candy.choice && r.candy.found,
			'Rare Candy: +1 level at once (with its level-up cards), both slots untouched, no choice screen', JSON.stringify(r.candy));
		A(r.candyEmpty.up === 1 && JSON.stringify(r.candyEmpty.items) === '[null,null]', 'Rare Candy never takes an empty slot either', JSON.stringify(r.candyEmpty));
		A(r.inc.same && near(r.inc.hp, 1.3, 0.01) && r.inc.full && near(r.inc.xp, 1.5, 0.05), `Pure Incense: enemies with x${r.inc.hp.toFixed(3)} HP and x${r.inc.xp.toFixed(3)} XP`, JSON.stringify(r.inc));
		A(Math.abs(r.rate.n0 - r.rate.expect0) <= 1 && Math.abs(r.rate.n1 - r.rate.expect1) <= 1 && r.rate.n1 < r.rate.n0, `Pure Incense: 25% fewer enemies (${r.rate.n1} vs ${r.rate.n0} in 25 s at minute 2:30)`, JSON.stringify(r.rate));
		A(JSON.stringify(r.coins) === '[12,13,10]', `Pure Incense: x1.25 coins, the fraction rounded at random (10 -> ${r.coins[0]} / ${r.coins[1]}; without: ${r.coins[2]})`);
		A(r.locks.charLight === 0 && r.locks.charClub === 0 && r.locks.charKinds === 24, `Charmander never gets the Light Ball or Thick Club (24 kinds rolled in 3000)`, JSON.stringify(r.locks));
		A(r.locks.pikaLight > 0 && r.locks.pikaClub === 0 && r.locks.cubClub > 0 && r.locks.heldClub === 0 && r.locks.heldLeft === 0, 'Pikachu can find the Light Ball, Cubone the Thick Club; never one you already hold', JSON.stringify(r.locks));
		A(JSON.stringify(r.locks.ok) === '[true,true,true,false,true,false,true]' && r.locks.heldSkip === 0, 'G.Items.okFor + the drops skip both held items', JSON.stringify(r.locks));
	}

	// ================= 10. one held item (DLC D17, owner 2026-10-26: "1 slot for an equipped held item in both modes";
	// this replaces M5 batch 3's "carry two (Backpack)": Backpack is retired and refunded, see micasurvivor_oneitem_test) =================
	{
		const step = await E(() => {
			const out = {};
			const pl = T.clean(); pl.bag = true;   // (an old save's Backpack flag: no second slot any more)
			const c0 = pl.critChance;
			out.slots = pl.itemSlots();
			G.Game.offerItem('scopelens'); out.a = [pl.item, pl.item2];
			G.Game.offerItem('scopelens'); out.dup = [pl.item, pl.item2, document.getElementById('scr-item').classList.contains('hidden')];
			out.crit = pl.critChance - c0;
			G.Game.offerItem('weaknesspolicy');
			return out;
		});
		await sleep(400);   // the English pass runs on the DOM change (MutationObserver)
		Object.assign(step, await E(() => ({
			cards: [...document.querySelectorAll('#item-cards .card')].map(c => c.innerText.replace(/\s+/g, ' ').trim()),
			sub: document.getElementById('item-sub').innerText,
		})));
		A(step.slots === 1 && JSON.stringify(step.a) === '["scopelens",null]', 'one held slot even with an old Backpack flag: the first item is worn', JSON.stringify(step));
		A(JSON.stringify(step.dup) === '["scopelens",null,true]' && near(step.crit, 0.15), 'one you already hold changes nothing; the held item works (Scope Lens +15%)', JSON.stringify(step));
		A(await visible('scr-item') && step.cards.length === 2 && /Keep Scope Lens/.test(step.cards[0]) && /Switch to Weakness Policy/.test(step.cards[1]) && /only hold one/.test(step.sub),
			'a second item: the replace screen, 2 cards (keep yours / switch), in English', JSON.stringify(step));
		await shot('item_choice_one.png');
		// keyboard: 2 picks the second card (the item screen reads its keys whatever the run state)
		await page.keyboard.press('Digit2');
		await sleep(200);
		const k2 = await E(() => { const pl = G.Game.player; return [pl.item, pl.item2, document.getElementById('scr-item').classList.contains('hidden'), pl.critChance]; });
		const crit = await E(() => { const pl = G.Game.player; const c = pl.critChance; pl.equip('scopelens', 1); const d = pl.critChance - c; pl.equip('weaknesspolicy', 1); return d; });
		A(JSON.stringify(k2.slice(0, 3)) === '["weaknesspolicy",null,true]' && near(crit, 0.15), 'key 2 switches: the Scope Lens comes off (its +15% crit with it)', JSON.stringify([k2, crit]));
		await E(() => G.Game.offerItem('expertbelt'));
		await E(() => document.querySelectorAll('#item-cards .card')[0].click());
		const kept = await E(() => [G.Game.player.item, G.Game.player.item2]);
		A(JSON.stringify(kept) === '["weaknesspolicy",null]', '"Keep" changes nothing', JSON.stringify(kept));
		// HUD: the one slot drawn with its name
		const drawn = await E(async () => {
			G.UI.hide('scr-pause');
			const pl = G.Game.player; pl.equip('heavyboots', 1);
			const seen = [];
			const P = CanvasRenderingContext2D.prototype, f = P.fillText;
			P.fillText = function (t, ...a) { seen.push(String(t)); return f.call(this, t, ...a); };
			await new Promise(r => setTimeout(r, 300));
			P.fillText = f;
			return [...new Set(seen)];
		});
		// (the HUD draws the Spanish source; the i18n canvas wrapper underneath translates it)
		A(drawn.includes('Botas Gruesas') && (await E(() => G.I18n.t('Botas Gruesas'))) === 'Heavy-Duty Boots', 'the HUD shows the held item with its name', JSON.stringify(drawn.slice(0, 40)));
		// a few of the new items lying on the ground (their icons)
		await E(() => { const pl = G.Game.player; ['eternalice', 'sitrusberry', 'lightball', 'rarecandy', 'pureincense', 'bigorb'].forEach((id, i) => G.Pickups.drop('item', pl.x - 75 + i * 30, pl.y + 38, id)); });
		await sleep(400);
		await shot('hud_one_item.png');
		await shot('hud_items_zoom.png', { x: 360, y: 440, width: 560, height: 280 });
		await E(() => G.Pickups.clear());
	}

	// ================= 11. Second Chance =================
	{
		const r = await E(() => {
			const out = {};
			let pl = T.clean(); T.reset(); pl.revives = 2;
			const e1 = T.mk(19, 100, 0, { spd: 0 }), e2 = T.mk(19, 0, -200, { spd: 0 }), e3 = T.mk(19, 300, 0, { spd: 0 });
			pl.hp = 10; T.hurt(5000);
			out.first = { hp: pl.hp, max: pl.maxHp, dead: pl.dead, revives: pl.revives, invuln: pl.invuln, k1: [Math.round(e1.kx), Math.round(e1.ky)], k2: [Math.round(e2.kx), Math.round(e2.ky)], k3: [e3.kx, e3.ky] };
			pl.invuln = 0; pl.hp = 10; T.hurt(5000); out.second = { hp: pl.hp, revives: pl.revives, dead: pl.dead };
			pl.invuln = 0; pl.hp = 10; T.hurt(5000); out.third = { hp: pl.hp, dead: pl.dead };
			// Focus Sash fires first and keeps the heart
			pl = T.eq('focussash'); pl.revives = 1; pl.hp = 10; T.hurt(5000);
			out.sash = { hp: pl.hp, revives: pl.revives, dead: pl.dead };
			// regression: a NEW player's Focus Sash works in the first minute after the page loaded
			// (sashT started at -999 ms, so performance.now() - sashT > 60000 failed for a minute)
			const fresh = new G.Player(G.DEX_BY[4], {}); fresh.equip('focussash'); fresh.hp = 10;
			const now = performance.now; performance.now = () => 5000;
			try { fresh.hurt(5000); } finally { performance.now = now; }
			out.fresh = { hp: fresh.hp, dead: fresh.dead };
			T.reset(); T.clean();
			return out;
		});
		A(r.first.hp === r.first.max && !r.first.dead && r.first.revives === 1 && r.first.invuln === 2.5, 'Second Chance: a lethal hit spends a heart and revives you with full HP (2.5 s invulnerable)', JSON.stringify(r.first));
		A(JSON.stringify(r.first.k1) === '[500,0]' && JSON.stringify(r.first.k2) === '[0,-500]' && JSON.stringify(r.first.k3) === '[0,0]', 'and knocks every enemy within 260 away (500); one at 300 is not touched', JSON.stringify(r.first));
		A(r.second.hp > 0 && r.second.revives === 0 && !r.second.dead && r.third.dead && r.third.hp === 0, 'the second heart saves you once more; with none left you go down', JSON.stringify([r.second, r.third]));
		A(r.sash.hp === 1 && r.sash.revives === 1 && !r.sash.dead, 'Focus Sash fires first (1 HP) and the heart is kept', JSON.stringify(r.sash));
		A(r.fresh.hp === 1 && !r.fresh.dead, 'regression: Focus Sash also saves you in the first minute after the page loads', JSON.stringify(r.fresh));
	}

	const errs = errors.filter(e => !/status of 409/.test(e));   // section 4's stale write is a 409 on purpose
	A(errs.length === 0, 'no console errors', errs.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: exception ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
