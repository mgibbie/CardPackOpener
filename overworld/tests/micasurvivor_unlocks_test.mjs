// micasurvivor_unlocks_test.mjs — one unlock list for every MicaSurvivor mode (js/systems/unlocks.js; owner 2026-11-02:
// "You either have a mon unlocked for all 3 modes or you don't ... catching a pokemon in the overworld ... should unlock it
// in MicaSurvivor. Then we have the gacha game and unlocking in expedition/dive as well"; "I don't want unlocking something
// to unlock the entire family. Evolving into something should unlock it"; the free starters: free everywhere).
//   1. the main menu syncs: the 27 starter trios' first stages are in the collection (from: starter)
//   2. this device's overworld Pokédex (magepunk_dex_v1): its caught species join the collection (from: overworld); a
//      regional form counts as its species (raichualola -> Raichu); a fakemon and a seen-only species don't
//   3. only that species: Gengar caught -> Gastly / Haunter stay locked; Expedition's League plays the family only AS Gengar
//   4. Expedition: an evolution reached in a run and a Pokémon caught in a run unlock that species in the collection
//   5. the collection is what Survival's partner picker offers (G.DB.owns), so the three modes agree
//   node overworld/tests/micasurvivor_unlocks_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8962;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(/^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
const SAVE = {
	v: 3, name: 'Trainer', created: 1, updated: 1, coins: 500, owned: { 4: { at: 1, from: 'starter' }, 25: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 4, partnerShiny: false, starter: 4, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {},
};
const BEFORE = (save) => {
	try {
		localStorage.setItem('micasurvivor_dev', 'dunlock1');
		localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
		localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
		localStorage.setItem('micasurvivor_save.guest', JSON.stringify(save));
		// this device's overworld game: Gengar, Alolan Raichu and Squirtle caught; a fakemon caught; Mew only seen
		localStorage.setItem('magepunk_dex_v1', JSON.stringify({ seen: ['gengar', 'raichu_alola', 'squirtle', 'selkid', 'mew'], caught: ['gengar', 'raichu_alola', 'squirtle', 'selkid'] }));
	} catch (e) { /* the boot wait reports it */ }
};

const T0 = Date.now();
await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--mute-audio'] });
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 1280, height: 720 });
	await page.evaluateOnNewDocument(BEFORE, SAVE);
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
	await page.evaluate(() => { const t = document.getElementById('tap-start'); if (t && !t.classList.contains('hidden')) t.click(); });
	await waitFor(() => page.evaluate(() => !document.getElementById('scr-menu').classList.contains('hidden')), 15000);
	await waitFor(() => page.evaluate(() => !!(G.DB.save.owned[94])), 8000);
	const r1 = await page.evaluate(() => {
		const o = G.DB.save.owned, from = d => o[d] && o[d].from;
		return { starters: G.STARTERS.map(s => s.dex).concat([172]).filter(d => !o[d]), extras: [54, 79, 172].filter(d => !o[d] || o[d].from !== 'starter' && o[d].from !== 'gacha'), nStarters: G.STARTERS.length, s1: from(1), gengar: from(94), raichu: from(26), squirtle: from(7), mew: !!o[151], gastly: !!o[92], haunter: !!o[93], pichu: !!o[172], toast: document.body.innerText.includes('from the overworld unlocked') };
	});
	A(r1.nStarters === 29 && r1.starters.length === 0 && r1.extras.length === 0 && r1.s1 === 'starter', 'the main menu: every starter pick is free for all (the 27 trios, Psyduck, Slowpoke) and Pichu', JSON.stringify(r1));
	A(r1.gengar === 'overworld' && r1.raichu === 'overworld', 'the overworld\'s caught Pokémon join the collection (Gengar; Alolan Raichu as Raichu)', JSON.stringify(r1));
	A(r1.squirtle === 'starter' && !r1.mew, 'already unlocked stays as it was (Squirtle, a starter); a species only SEEN there is not unlocked (Mew)', JSON.stringify(r1));
	A(!r1.gastly && !r1.haunter, 'only that species: Gengar caught leaves Gastly and Haunter locked', JSON.stringify(r1));
	// Expedition: the League plays the Gastly family only as Gengar; an evolution and a catch unlock their species
	const r2 = await page.evaluate(async () => {
		await G.Expedition.load(); await G.ExpSave.open();
		const LG = G.ExpLeague, out = {};
		out.family = G.FAMILY[94]; out.playable = LG.playable(92); out.open = [92, 93, 94].map(LG.formOpen); out.start = LG.formFor(92);
		// an evolution reached in a run: the run's record unlocks the forms (Charmeleon here)
		const before = !!G.DB.save.owned[5];
		G.Unlocks.add([5], 'expedition');
		out.evo = [before, G.DB.save.owned[5] && G.DB.save.owned[5].from, LG.formOpen(5)];
		// the Expedition save's old unlocks merge once (a form reached before this change)
		G.ExpSave.add('league.form', 2);
		const n = G.Unlocks.expedition();
		out.merge = [n >= 1, !!G.DB.save.owned[2], !!G.DB.save.owned[3]];
		// Survival's picker reads the same collection
		out.owns = [94, 26, 2, 5].every(d => G.DB.owns(d));
		return out;
	});
	A(r2.family === 92 && r2.playable && JSON.stringify(r2.open) === '[false,false,true]' && r2.start === 94, 'Expedition / Dive: the Gastly family plays only AS Gengar (the one unlocked)', JSON.stringify(r2));
	A(r2.evo[0] === false && r2.evo[1] === 'expedition' && r2.evo[2] === true, 'an evolution reached in a run unlocks that species everywhere', JSON.stringify(r2));
	A(r2.merge[0] && r2.merge[1] && !r2.merge[2], 'the Expedition save\'s earlier unlocks join the collection once (Ivysaur), not their families (Venusaur stays locked)', JSON.stringify(r2));
	A(r2.owns, 'the three modes read one list: Survival\'s collection has every one of them', JSON.stringify(r2));
	// the capture code path: a Pokémon caught in a run unlocks that species
	const src = fs.readFileSync(path.join(ROOT, 'micasurvivor/js/expedition/capture.js'), 'utf8');
	A(/G\.Unlocks\.add\(\[c\.dex\], 'expedition'\)/.test(src), 'a Pokémon caught in an Expedition / Dive run unlocks that species (capture.js -> G.Unlocks.add)');
	const pe = errors.filter(e => !/AudioContext|play\(\) failed|NotAllowedError/.test(e));
	A(pe.length === 0, 'no page errors', pe.join(' | '));
	await ctx.close();
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
