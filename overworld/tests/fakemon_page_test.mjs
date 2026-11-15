// fakemon_page_test.mjs — the owner's FAKEMON page (/fakemon/) and the SPECIES SWAPS behind it
// (overworld/species_swaps.js, server tuning-save kind 'species').
// The owner, 2026-11-15: "i also want to have that swap page for fakemon. it should list every place that the fakemon is
// actually placed in the game as well as the sprite and stats/movesets/abilities and evolution information."
//   * the swap table: a placement's own swap wins over "everywhere"; a species the game lacks is ignored; a table with no
//     swap in it is handed back untouched
//   * the list of placements (fakemon/placements.json) is up to date with the game's tables
//   * the server: only the owner saves swaps; anybody reads them; only placement keys -> species ids get in
//   * the page: a stranger is locked out; the owner sees every fakemon with its sprite, stats, abilities, moves,
//     evolutions and places; swaps one place and one "everywhere"; saves
//   * the game plays by it: a wild table's slot, a trainer's member, and the Pokémon a wild battle starts with
//   node overworld/tests/fakemon_page_test.mjs      (SHOTS=<dir> for a screenshot of the page)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9949, BASE = `http://localhost:${PORT}`, SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = (action, body = {}, token) => fetch(BASE + '/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }).then(r => r.json());
async function tokenFor(username, password) { let r = await api('register', { username, password }); if (!r.token) r = await api('login', { username, password }); if (!r.token) throw new Error(username + ' auth failed: ' + JSON.stringify(r)); return r.token; }
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }

const PL = JSON.parse(fs.readFileSync(path.join(ROOT, 'fakemon/placements.json'), 'utf8'));
// a fakemon with a place of its own, and that place: the first by name (the generator sorts)
const [FK, FKP] = Object.entries(PL.placements).find(([, a]) => a.length && a[0].key);
const KEY = FKP[0].key, [, TBL, MAP, KIND, PHASE, SLOT] = KEY.split(':');

// ===== 1. the swap table =====
{
	const S = await import(pathToFileURL(path.join(ROOT, 'overworld/species_swaps.js')).href);
	const slots = [{ id: 'aaa', min: 3, max: 4, w: 60 }, { id: 'bbb', min: 5, max: 5, w: 40 }];
	A(S.slotsFor('night', 'MAP_X', 'land', 'night', slots) === slots && S.everywhere('aaa') === 'aaa' && S.at('trainer:T:0', 'aaa') === 'aaa', 'with no swaps a table is handed back untouched and everyone is themselves');
	S.setLocal({ 'all:aaa': 'ccc', 'wild:night:MAP_X:land:night:0': 'ddd', 'trainer:T:1': 'eee', 'all:bbb': 'nope' });
	S.setKnown((id) => id !== 'nope');
	const out = S.slotsFor('night', 'MAP_X', 'land', 'night', slots), other = S.slotsFor('night', 'MAP_Y', 'land', 'night', slots);
	A(out[0].id === 'ddd' && out[0].w === 60 && out[0].min === 3 && out[1] === slots[1] && slots[0].id === 'aaa', 'a slot\'s own swap replaces its species and nothing else (its levels and share stay; the game\'s table is not written to)', out);
	A(other[0].id === 'ccc' && S.everywhere('aaa') === 'ccc' && S.at('trainer:T:0', 'aaa') === 'ccc' && S.at('trainer:T:1', 'aaa') === 'eee', '"everywhere" covers the other tables and trainers; a placement\'s own swap wins over it', other);
	A(S.everywhere('bbb') === 'bbb' && other[1] === slots[1], 'a swap to a species the game does not have is ignored');
	S.setLocal({}); S.setKnown(null);
	A(S.slotsFor('night', 'MAP_X', 'land', 'night', slots) === slots, 'clearing the table puts everything back');
	const chk = spawnSync(process.execPath, [path.join(ROOT, 'tools/gen_fakemon_placements.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
	A(chk.status === 0, 'the list of placements (fakemon/placements.json) is up to date with the game\'s tables', chk.stderr);
	A(PL.count >= 600 && PL.placed >= 100 && TBL && MAP.startsWith('MAP_') && KIND === 'land', `it covers ${PL.count} fakemon, ${PL.placed} with a place of their own`, KEY);
}

// ===== 1b. the Uranium and Ransei evolutions (overworld/fakemon_evos.js) =====
// The owner, 2026-11-15: "look online for evolution data for the uranium fakemon as well".
{
	const { FAKEMON_EVOS, applyFakemonEvos } = await import(pathToFileURL(path.join(ROOT, 'overworld/fakemon_evos.js')).href);
	const { pickEvolution } = await import(pathToFileURL(path.join(ROOT, 'overworld/evo_pick.js')).href);
	const SP = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8')), EX = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_extra.json'), 'utf8'));
	const bag = fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8'), all = Object.entries(FAKEMON_EVOS), bad = [];
	for (const [id, evos] of all) for (const e of evos) {
		if (!SP[id] || SP[id].num > -100) bad.push(id + ': not a Uranium or Ransei fakemon');
		if (!SP[e.target] || e.target === id) bad.push(id + ' -> ' + e.target + ': no such species');
		if (e.type === 'level' ? !(e.param >= 2 && e.param <= 100) : e.type === 'item' ? !new RegExp('\\b' + e.param + '\\b').test(bag) : e.type === 'friendship' ? e.param !== 220 : true) bad.push(id + ': ' + e.type + ' ' + e.param);
		if (e.time && e.time !== 'day' && e.time !== 'night') bad.push(id + ': time ' + e.time);
	}
	const uranium = all.filter(([id]) => SP[id] && SP[id].num >= -265).length;
	A(uranium >= 70 && bad.length === 0, `${uranium} Uranium fakemon have an evolution, each to a species the game has, by a way the game can do (a level, an item it has, friendship)`, bad.slice(0, 6));
	const E = FAKEMON_EVOS, is = (id, type, param, target) => (E[id] || []).some((e) => e.type === type && e.param === param && e.target === target);
	A(is('orchynx', 'level', 28, 'metalynx') && is('cocaran', 'level', 24, 'cararalm') && is('fallengel', 'level', 72, 'beliaddon') && is('luxi', 'friendship', 220, 'luxor') && is('luxor', 'item', 'shinystone', 'luxelong') && is('minicorn', 'item', 'shinystone', 'kiricorn') && is('minicorn', 'item', 'duskstone', 'oblivicorn') && !E.neopunk,
		'as the Uranium wiki has them: a starter by level, a chain\'s stages each their own, friendship, stones, a branch; one that does not evolve has none', ['orchynx', 'cocaran', 'fallengel', 'luxi', 'luxor', 'minicorn', 'neopunk'].map((id) => E[id]));
	A(is('linkite', 'item', 'linkingcord', 'chainite') && E.linkite[0].was === 'traded' && is('felunge', 'level', 40, 'feliger') && /Rest/.test(E.felunge[0].was) && E.cararalm[0].type === 'level' && /Coconut Milk/.test(E.cararalm[0].was),
		'a way the game cannot do becomes one it can, and says what it was: a trade is the Linking Cord, "knowing a move" is the level it learns it, an item the game lacks is a level', [E.linkite, E.felunge, E.cararalm]);
	const pu = E.pufluff || [], fast = pickEvolution({ speciesId: 'pufluff', stats: { spe: 60, atk: 40 } }, pu), strong = pickEvolution({ speciesId: 'pufluff', stats: { spe: 40, atk: 60 } }, pu);
	A(pu.length === 2 && fast && fast.target === 'alpico' && strong && strong.target === 'anderind', 'Pufluff becomes Alpico when its Speed is above its Attack, Anderind otherwise', [pu, fast, strong]);
	const data = { species: SP, extra: JSON.parse(JSON.stringify(EX)) }, cap = Object.keys(EX).find((id) => SP[id] && SP[id].num < 0 && SP[id].num >= -78 && (EX[id].evos || []).length), before = JSON.stringify(EX[cap]);
	applyFakemonEvos(data);
	A(data.extra.orchynx.evos[0].target === 'metalynx' && JSON.stringify(data.extra[cap]) === before && data.extra.bulbasaur.evos[0].target === 'ivysaur', 'the game lays them over its species data at load, and leaves what it already had (CAP, the official species) as it was');
}

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fakemon-')), 'users.sqlite');
const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile } });
let browser;
try {
	A(await waitFor(() => fetch(BASE + '/fakemon/').then(r => r.ok), 20000), 'dev server is up');
	const owner = await tokenFor('mgibbie', 'localdev1'), peon = await tokenFor('fakepeon', 'localdev1');

	// ===== 2. the server =====
	const good = { ['all:' + FK]: 'pikachu', [KEY]: 'eevee', 'trainer:Route102_EventScript_Allen:0': 'mew' };
	A((await api('tuning-save', { kind: 'species', content: good }, peon)).error === 'owner only' && (await api('tuning-save', { kind: 'species', content: good })).error, 'nobody but the owner can save species swaps');
	const bad = [{ 'all:x': 5 }, { 'gift:x': 'pikachu' }, { 'all:x': 'Pika Chu' }, { 'all:x': '<b>' }, { 'all:<x>': 'pikachu' }, { 'all:x': 'a'.repeat(60) }];
	const refused = []; for (const b of bad) refused.push((await api('tuning-save', { kind: 'species', content: b }, owner)).error || null);
	A(refused.every((e) => e === 'bad swap') && (await api('tuning-get')).species == null, 'only placement keys -> species ids get in (a number, an unknown kind of key, a name with spaces, markup, a long value are refused, and leave nothing behind)', refused);

	// ===== 3. the page =====
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
	const seed = async (ctx, token, username, extra) => { const page = await ctx.newPage(); await page.evaluateOnNewDocument((t, u, x) => { try { if (t) localStorage.setItem('magepunk_mp_token_v1', t); if (u) localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: u })); for (const [k, v] of Object.entries(x || {})) localStorage.setItem(k, v); } catch { } }, token, username, extra || null); return page; };
	const pctx = await browser.createBrowserContext(), pp = await seed(pctx, peon, 'fakepeon');
	await pp.goto(BASE + '/fakemon/', { waitUntil: 'networkidle2', timeout: 30000 });
	A(await waitFor(() => pp.evaluate(() => document.body.textContent.includes('owner tool') && !document.getElementById('list')), 8000), 'somebody else gets the lock screen, and none of the page');
	await pp.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 }); await sleep(600);
	A(await pp.evaluate(() => document.getElementById('tile-fakemon').hidden === true), 'its tile on the home page is hidden from them');
	await pctx.close();

	const page = await seed(browser.defaultBrowserContext(), owner, 'mgibbie'), errors = [];
	await page.setViewport({ width: 1240, height: 900 });
	page.on('pageerror', e => errors.push(e.message));
	await page.goto(BASE + '/fakemon/#' + FK, { waitUntil: 'networkidle2', timeout: 40000 });
	A(await waitFor(() => page.evaluate(() => !!window.__fakemon), 20000), 'the owner gets the page');
	const seen = await page.evaluate((FK) => {
		const T = window.__fakemon, m = document.getElementById('main'), txt = m.textContent;
		return { n: T.ids().length, listed: document.querySelectorAll('#list .item').length, sel: T.sel(), art: [...m.querySelectorAll('.top .art img')].map((i) => i.naturalWidth), stats: m.querySelectorAll('.statbar').length,
			abilities: /Abilities:\s*\S/.test(txt), moves: m.querySelectorAll('.moves div').length, evo: /Evolution/.test(txt), places: T.placements(FK).length, rows: m.querySelectorAll('.pl tr').length, boxes: m.querySelectorAll('input.to').length, rift: /Ransei rift/.test(txt) };
	}, FK);
	A(seen.n >= 600 && seen.listed === seen.n && seen.sel === FK, `it lists all ${seen.n} fakemon, and opens on the one in the address`, seen);
	A(seen.art[0] > 0 && seen.stats === 6 && seen.abilities && seen.moves > 3 && seen.evo, 'a fakemon shows its sprite, its six base stats, its abilities, its level-up moves and its evolution', seen);
	A(seen.places === FKP.length && seen.rows === FKP.length && seen.boxes === FKP.length + 1 && seen.rift, 'and every place it is placed, each with a box to swap it, one box for "everywhere", and the rift it shares with the others', seen);
	if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'fakemon-page.png') }); }
	const evo = await page.evaluate(() => { const T = window.__fakemon, d = [...document.querySelectorAll('#dl-species option')].length; document.getElementById('filter').value = 'cap'; document.getElementById('filter').dispatchEvent(new Event('change')); const cap = document.querySelectorAll('#list .item').length; document.getElementById('filter').value = ''; document.getElementById('filter').dispatchEvent(new Event('change')); document.getElementById('q').value = 'orchynx'; document.getElementById('q').dispatchEvent(new Event('input')); const it = document.querySelector('#list .item'); if (it) it.click(); return { d, cap, sel: T.sel(), chips: document.querySelectorAll('#main .evo').length }; });
	A(evo.d > 1700 && evo.cap > 50 && evo.cap < 100 && evo.sel === 'orchynx' && evo.chips >= 1, 'the list filters by source and by name; a fakemon that evolves shows what it comes from or becomes; a swap can be any species the game has', evo);
	const edit = await page.evaluate(([FK, KEY]) => {
		const T = window.__fakemon, out = {}; T.show(FK);
		out.wrong = T.set(KEY, 'notapokemon'); out.slot = T.set(KEY, 'Eevee'); out.all = T.set('all:' + FK, 'pikachu'); out.self = T.set('all:pikachu', 'pikachu');
		out.work = T.work(); out.dirty = T.dirty(); out.badge = (document.querySelector('#list .item.on .sw') || {}).textContent || document.querySelector('#list .item .sw')?.textContent;
		return out;
	}, [FK, KEY]);
	A(edit.wrong === false && edit.slot && edit.all && edit.self && JSON.stringify(edit.work) === JSON.stringify({ [KEY]: 'eevee', ['all:' + FK]: 'pikachu' }) && edit.dirty, 'a box takes a species by id or name, not something else; swapping one for itself is no swap', edit);
	await page.click('#save');
	A(await waitFor(() => page.evaluate(() => !window.__fakemon.dirty() && /Saved/.test(document.getElementById('status').textContent)), 10000), 'Save sends it');
	const after = await api('tuning-get');
	A(after.species && after.species[KEY] === 'eevee' && after.species['all:' + FK] === 'pikachu' && Object.keys(after.species).length === 2, 'and it is on the server for everybody (no sign-in)', after.species);
	A(errors.length === 0, 'the page raised no error', errors.slice(0, 3));

	// ===== 4. the game plays by it =====
	const PARTY = [{ speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120, exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19 }];
	const gctx = await browser.createBrowserContext();
	const game = await seed(gctx, owner, 'mgibbie', { magepunk_party_v1: JSON.stringify(PARTY), magepunk_region: 'JOHTO' });
	await game.goto(BASE + '/overworld/index.html?map=NewBarkTown', { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => game.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.SpeciesSwap)), 60000), 'the overworld boots (a fresh browser: the swaps come from the server)');
	await waitFor(() => game.evaluate(() => Object.keys(window.SpeciesSwap.SWAPS).length === 2), 10000);
	const play = await game.evaluate(async ([FK, MAP, KIND, PHASE, SLOT]) => {
		const ow = window.__ow, S = window.SpeciesSwap, out = {};
		const picks = (n) => { const c = {}; for (let i = 0; i < n; i++) { const p = ow.encounters.pick(MAP, KIND, PHASE); if (p) c[p.id] = (c[p.id] || 0) + 1; } return c; };
		out.swapped = picks(600);                                                       // (the slot is Eevee; the fakemon's other slots here, if any, are Pikachu)
		S.setLocal({ 'trainer:Route102_EventScript_Allen:0': 'mew', 'all:taillow': 'pidgey' });
		out.own = picks(600);
		const t = { ev: { script: 'Route102_EventScript_Allen' }, x: 0, y: 0 };
		try { out.team = ow.trainers.buildBattle(t, ow.battle.data).party.map((m) => m.speciesId); } catch (e) { out.team = String(e && e.message); }
		S.setLocal({}); try { out.teamOwn = ow.trainers.buildBattle(t, ow.battle.data).party.map((m) => m.speciesId); } catch (e) { out.teamOwn = String(e && e.message); }
		S.setLocal({ 'all:rattata': 'bulbasaur' });
		ow.startWildBattle({ id: 'rattata', level: 5 });
		for (let i = 0; i < 200 && !(ow.battle.active && ow.battle.active.foe); i++) await new Promise((r) => setTimeout(r, 60));
		const foe = ow.battle.active && ow.battle.active.foe; out.wild = foe && (foe.speciesId || foe.id);
		out.evo = (ow.battle.data.extra.orchynx || {}).evos;
		return out;
	}, [FK, MAP, KIND, PHASE, +SLOT]);
	A(play.swapped.eevee > 0 && !play.swapped[FK] && play.own[FK] > 0 && !play.own.eevee, `the wild table plays by it: ${FK}'s slot on ${MAP} gives Eevee, and ${FK} again once the swap is gone`, play);
	A(Array.isArray(play.team) && play.team.join() === 'mew,pidgey' && Array.isArray(play.teamOwn) && play.teamOwn.join() === 'zigzagoon,taillow', 'a trainer\'s member is swapped by its slot, another by "everywhere"; with no swaps the roster is its own', [play.team, play.teamOwn]);
	A(play.wild === 'bulbasaur', 'a wild battle starts with the species swapped in "everywhere"', play.wild);
	A(play.evo && play.evo[0].target === 'metalynx' && play.evo[0].param === 28, 'in the running game Orchynx (Uranium) evolves into Metalynx at level 28', play.evo);
	await gctx.close();
} finally {
	if (browser) await browser.close();
	server.kill();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
