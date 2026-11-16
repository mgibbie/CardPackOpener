// sinnoh_postgame_test.mjs — SINNOH after its Champion: every fakemon that only the Ransei rift held lives on a
// Sinnoh map that suits it (tools/gen_sinnoh_postgame.mjs -> overworld/encounters_sinnoh_postgame.js; encounters.js).
// The owner, 2026-11-16: "redo the postgame and place all the fakemon that are only found in the rift on
// random/appropriate routes/locations throughout sinnoh".
//   * every fakemon is now on a wild table of its own; the 474 the rift alone held are each on exactly one Sinnoh
//     post-game table, and nothing already placed elsewhere was moved there
//   * a table is the map's own POKeMON at about 60% and its fakemon at about 40%; species and levels are real
//   * appropriate: a fakemon shares a type with the place it was given (or is a Water type in water); the Steel
//     ones on Iron Island are Steel, the snow routes' are Ice
//   * in a browser: before Sinnoh's crown a Sinnoh route gives none of them; after it, about 4 picks in 10 are its
//     fakemon and each of them turns up; another region's route is as it was
//   node overworld/tests/sinnoh_postgame_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { SINNOH_POSTGAME } from '../encounters_sinnoh_postgame.js';
import { DAYNIGHT } from '../encounters_daynight.js';
import { FREM_NIGHT } from '../encounters_frem_night.js';
import { POSTGAME } from '../encounters_postgame.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9977;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(120); } return false; }
const J = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));

// ===== 1. the tables =====
const species = J('species_battle.json'), base = J('encounters.json'), index = J('map_index.json');
const isFake = id => (species[id]?.num || 0) <= 0;
const fakemon = Object.keys(species).filter(id => isFake(id) && (species[id].learnset || []).length);
const elsewhere = new Set();
const note = slots => { for (const s of slots || []) if (s && s.id) elsewhere.add(s.id); };
for (const t of Object.values(base)) for (const g of Object.values(t)) note(g && g.slots);
for (const t of Object.values(DAYNIGHT)) for (const ph of Object.values(t)) for (const slots of Object.values(ph || {})) note(slots);
for (const t of Object.values(FREM_NIGHT)) note(t.land && t.land.night);
for (const t of Object.values(POSTGAME)) for (const v of Object.values(t)) { if (Array.isArray(v)) note(v); else for (const slots of Object.values(v || {})) note(slots); }
const here = new Map();   // fakemon -> [map:kind] on Sinnoh's post-game tables
for (const [map, t] of Object.entries(SINNOH_POSTGAME)) for (const [kind, slots] of Object.entries(t)) for (const s of slots) if (isFake(s.id)) here.set(s.id, [...(here.get(s.id) || []), map + ':' + kind]);
const riftOnly = fakemon.filter(id => !elsewhere.has(id));
const nowhere = riftOnly.filter(id => !here.has(id)), twice = [...here].filter(([, v]) => v.length !== 1).map(([k]) => k), moved = [...here.keys()].filter(id => elsewhere.has(id));
A(riftOnly.length >= 400 && nowhere.length === 0, `the ${riftOnly.length} fakemon no other wild table holds each have a home in Sinnoh: none is left to the rift alone`, nowhere.slice(0, 8));
A(twice.length === 0 && moved.length === 0, 'each is on exactly one table, and none that already lived elsewhere was placed again', [twice.slice(0, 5), moved.slice(0, 5)]);
A(fakemon.every(id => elsewhere.has(id) || here.has(id)), `all ${fakemon.length} fakemon are now on a wild table`);

const maps = Object.keys(SINNOH_POSTGAME), badSlot = [], share = [];
for (const [map, t] of Object.entries(SINNOH_POSTGAME)) for (const [kind, slots] of Object.entries(t)) {
	if (!index[map] || !base[map] || !base[map][kind]) badSlot.push(map + ':' + kind + ' is not a table the map has');
	for (const s of slots) if (!species[s.id] || !(s.min >= 1 && s.max >= s.min && s.w > 0)) badSlot.push(map + ' ' + s.id);
	const f = slots.filter(s => isFake(s.id)), tot = slots.reduce((a, s) => a + s.w, 0);
	if (f.length) share.push([map + ':' + kind, f.reduce((a, s) => a + s.w, 0) / tot]);
}
A(maps.length >= 120 && maps.every(m => m.startsWith('MAP_SINNOH_')) && badSlot.length === 0, `${maps.length} Sinnoh maps have a post-game table; every slot is a real species at a real level on a table the map has`, badSlot.slice(0, 6));
const off = share.filter(([, v]) => v < 0.37 || v > 0.43);
A(share.length >= 120 && off.length === 0, `on each of the ${share.length} tables with fakemon they are about 40% of the rolls, the map's own POKéMON the rest`, off.slice(0, 5));
const perMap = maps.map(m => Object.values(SINNOH_POSTGAME[m]).flat().filter(s => isFake(s.id)).length);
A(Math.max(...perMap) <= 10 && perMap.filter(n => n > 0).length >= 120, `they are spread out: at most ${Math.max(...perMap)} on a map, on ${perMap.filter(n => n > 0).length} maps`);

// appropriate
const typesOn = re => [...here].filter(([, v]) => re.test(v[0])).map(([id, v]) => [id, species[id].types, v[0].split(':')[1]]);
const iron = typesOn(/IRON_ISLAND/), snow = typesOn(/ROUTE216|ROUTE217|SNOWPOINT_TEMPLE|ACUITY/), stark = typesOn(/STARK_MOUNTAIN/), chateau = typesOn(/OLD_CHATEAU|LOST_TOWER/);
const mostly = (list, types) => list.filter(([, t, kind]) => t.some(x => types.includes(x)) || (kind === 'water' && t.includes('Water'))).length / Math.max(1, list.length);
A(iron.length >= 5 && mostly(iron, ['Steel', 'Rock', 'Ground', 'Fighting']) === 1 && iron.some(([, t]) => t.includes('Steel')), `Iron Island's ${iron.length} are Steel, Rock, Ground or Fighting`, iron.slice(0, 6));
A(snow.length >= 5 && mostly(snow, ['Ice', 'Steel', 'Fighting', 'Dark']) === 1 && snow.filter(([, t]) => t.includes('Ice')).length >= snow.length / 2, `the snow routes' and Snowpoint Temple's ${snow.length} are mostly Ice`, snow.slice(0, 6));
A(stark.length >= 3 && stark.filter(([, t]) => t.includes('Fire')).length >= stark.length / 2 && chateau.length >= 3 && mostly(chateau, ['Ghost', 'Dark', 'Psychic', 'Poison']) === 1, "Stark Mountain's are mostly Fire; the Old Chateau's and Lost Tower's are Ghost, Dark, Psychic or Poison", [stark, chateau]);
const wet = [...here].filter(([, v]) => v[0].endsWith(':water'));
A(wet.length >= 30 && wet.every(([id]) => species[id].types.includes('Water')), `the ${wet.length} placed in water (surfing) are all Water types`, wet.filter(([id]) => !species[id].types.includes('Water')).slice(0, 5));

// ===== 2. in the game =====
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120, exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19 }];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) { } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
	const page = await browser.newPage(), errors = [];
	await page.setViewport({ width: 960, height: 640 });
	page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument((st, party) => {
		localStorage.setItem('magepunk_mp_token_v1', 'smoke-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); localStorage.setItem('magepunk_region', 'hoenn');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_started: true, intro_greeted: true, intro_done: true, story_seeded: true, newgame_flags_seeded: true, rival_tier0_done: true }, vars: {} }));
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=SinnohRoute201`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.world && window.__ow.world.current && window.__ow.battle && window.__ow.battle.data)), 60000), 'the game boots on Route 201');
	await sleep(1500);
	const picks = (map, kind, n) => page.evaluate(async (map, kind, n) => { const C = await import('/overworld/ow_core.js'); const c = {}; for (let i = 0; i < n; i++) { const p = C.encounters.pick(map, kind, 'day'); if (p) c[p.id] = (c[p.id] || 0) + 1; } return c; }, map, kind, n);
	const guests = SINNOH_POSTGAME.MAP_SINNOH_ROUTE201.land.filter(s => isFake(s.id)).map(s => s.id);
	const before = await picks('MAP_SINNOH_ROUTE201', 'land', 600);
	A(guests.length >= 3 && guests.every(g => !before[g]) && (before.starly || 0) + (before.bidoof || 0) > 300, "before Sinnoh's crown Route 201 is Starly and Bidoof, with none of its fakemon", before);
	const hoennBefore = await picks('MAP_ROUTE101', 'land', 400);
	await page.evaluate(async () => { (await import('/overworld/badges.js')).crown('SINNOH'); });
	const after = await picks('MAP_SINNOH_ROUTE201', 'land', 2000), nFake = guests.reduce((a, g) => a + (after[g] || 0), 0);
	A(guests.every(g => after[g] > 0) && nFake / 2000 > 0.33 && nFake / 2000 < 0.47, `after it, each of its ${guests.length} fakemon turns up, about 4 picks in 10 (${Math.round(nFake / 20)}%)`, after);
	const hoennAfter = await picks('MAP_ROUTE101', 'land', 400);
	A(Object.keys(hoennAfter).every(id => !isFake(id) || hoennBefore[id]) && JSON.stringify(Object.keys(hoennAfter).sort()) === JSON.stringify(Object.keys(hoennBefore).sort()), "Hoenn's Route 101 gives what it gave", [hoennBefore, hoennAfter]);
	const wetMap = Object.keys(SINNOH_POSTGAME).find(m => (SINNOH_POSTGAME[m].water || []).some(s => isFake(s.id)));
	const wetPicks = await picks(wetMap, 'water', 800), wetGuests = SINNOH_POSTGAME[wetMap].water.filter(s => isFake(s.id)).map(s => s.id);
	A(wetGuests.every(g => wetPicks[g] > 0), `and surfing on ${wetMap.replace('MAP_SINNOH_', '')} meets its water fakemon (${wetGuests.join(', ')})`, wetPicks);
	A(errors.length === 0, 'no page error', errors.slice(0, 3));
} finally { if (browser) await browser.close(); server.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
