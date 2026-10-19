// micasurvivor_pokedex_test.mjs — MicaSurvivor batch B1 "complete the Pokédex" (owner decision 2026-10-19,
// Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md: all 1025 canon Pokémon can appear as enemies in every mode).
// The game shipped with the 966 Pokémon that had Idle + Walk + Attack sheets on SpriteCollab. B1 adds the 17 of
// the missing 59 that SpriteCollab has usable sheets for (partial ones filled by the sprite generator's own
// FALLBACK table, four from an alternate-form folder); the other 42 have no sheet at all and wait for the owner's
// call on a fallback (PENDING_ART below). Checked:
//   - data: every dex 1..1025 is in G.DEX (with its sprite meta) or listed as pending art, never both; the 17 new
//     rows (gen, legendary flag, rarity by the generator's rule, Paradox rules), an ability each, credits
//   - sheets: every animation of every Pokémon in sprites-meta.js is on disk with the geometry the meta says
//     (13.5k files, PNG headers), and in the browser every sheet of the 17 new ones (normal + shiny) loads
//     with no 404 and its first frame decodes to real pixels
//   - spawning: each new non-legendary is a candidate of a tier (or a boss slot) of a normal run and really spawns,
//     forced into the run's cast through the test hooks, walking with its sheet drawn; the boss-eligible ones
//     come as bosses; each new legendary comes as the rift's legendary boss in its arena
//   - Lexicon: each new Pokémon's entry opens, with its English name
//   - English: the official English names (overworld/data/species_index.json when present)
// Screenshots (MICASURVIVOR_SHOTS=<dir>): new enemies on screen (Gen 5, Paradox), a legendary as the rift boss,
// and a new Pokémon's Lexicon entry.
// Covers micasurvivor/js/data/pokedex.js, js/data/sprites-meta.js, js/data/enemies.js, js/systems/abilities.js,
// js/core/sprites.js, js/data/lang-en.js, micasurvivor/CREDITS.md, tools/micasurvivor/fetch_sprites.py,
// tools/micasurvivor/fetch_pokedex.py.
//   node overworld/tests/micasurvivor_pokedex_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MS = path.join(ROOT, 'micasurvivor');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8795;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

// ---- the batch: the 17 added, and the 42 SpriteCollab has no sheet for (pending the owner's call on a fallback)
const NEW = {
	593: 'Jellicent', 618: 'Stunfisk', 683: 'Aromatisse', 733: 'Toucannon', 865: 'Sirfetch\u2019d', 870: 'Falinks', 879: 'Copperajah',
	929: 'Dolliv', 945: 'Grafaiai', 948: 'Toedscool', 990: 'Iron Treads', 999: 'Gimmighoul', 1003: 'Ting-Lu', 1008: 'Miraidon',
	1020: 'Gouging Fire', 1021: 'Raging Bolt', 1025: 'Pecharunt',
};
const NEW_DEX = Object.keys(NEW).map(Number);
const NEW_LEG = [1003, 1008, 1025];
export const PENDING_ART = [514, 516, 520, 522, 523, 538, 558, 564, 565, 591, 592, 616, 626, 668, 732, 735, 756, 765, 837, 838, 839, 866,
	878, 893, 931, 942, 943, 944, 947, 949, 950, 954, 956, 962, 973, 986, 993, 1001, 1002, 1014, 1022, 1023];
const GEN_END = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
const genOf = d => GEN_END.findIndex(e => d <= e) + 1;

// ================= 1. data (no browser) =================
const G = {};
const ctx = vm.createContext({ G, console });
for (const f of ['js/data/pokedex.js', 'js/data/sprites-meta.js']) vm.runInContext(fs.readFileSync(path.join(MS, f), 'utf8'), ctx, { filename: f });
{
	const have = new Set(G.DEX.map(p => p.dex)), pend = new Set(PENDING_ART);
	const missing = [], both = [];
	for (let d = 1; d <= 1025; d++) { if (!have.has(d) && !pend.has(d)) missing.push(d); if (have.has(d) && pend.has(d)) both.push(d); }
	A(missing.length === 0 && both.length === 0 && G.DEX.length === 983 && PENDING_ART.length === 42 && G.DEX.length + PENDING_ART.length === 1025,
		`every dex 1..1025 is in the game (${G.DEX.length}) or pending art with the owner (${PENDING_ART.length}), never both`, JSON.stringify({ missing: missing.slice(0, 10), both }));
	const noMeta = G.DEX.filter(p => !G.SPRITE_META[p.dex]).map(p => p.dex), orphan = Object.keys(G.SPRITE_META).map(Number).filter(d => !have.has(d));
	A(noMeta.length === 0 && orphan.length === 0, 'the Pokédex and sprites-meta.js list exactly the same Pokémon (fetch_pokedex.py follows fetch_sprites.py)', JSON.stringify({ noMeta, orphan }));
	A(NEW_DEX.every(d => have.has(d)) && PENDING_ART.every(d => !G.SPRITE_META[d]), 'the 17 new Pokémon are in; none of the 42 pending has sprite meta (so nothing spawns them)');
	const rar = p => (p.leg || p.bst >= 580 ? 5 : p.bst >= 495 ? 4 : p.bst >= 410 ? 3 : p.bst >= 320 ? 2 : 1);
	const bad = NEW_DEX.map(d => G.DEX_BY[d]).filter(p => p.gen !== genOf(p.dex) || p.rarity !== rar(p) || !!p.leg !== NEW_LEG.includes(p.dex) || p.starter
		|| !(p.hp > 70 && p.spd > 78 && p.atk > 0.7) || !p.types.length);
	A(bad.length === 0, 'the 17 new rows: generation, rarity by the generator\'s BST rule, legendary flag (Ting-Lu, Miraidon, Pecharunt), not starters, game stats', JSON.stringify(bad));
	// Paradox Pokémon follow the existing Paradox rows: not legendary; the 570 ones rarity 4 (Iron Thorns), the 590 ones 5 (Walking Wake)
	const P = d => G.DEX_BY[d];
	A(!P(990).leg && P(990).rarity === P(995).rarity && !P(1020).leg && !P(1021).leg && P(1020).rarity === P(1009).rarity && P(1021).rarity === 5,
		'Paradox rules: Iron Treads like Iron Thorns (rarity 4, regular enemy), Gouging Fire / Raging Bolt like Walking Wake (rarity 5, boss-only, not legendary)');
	A(P(1003).leg && P(1008).leg && P(1025).leg && P(1008).rarity === 5, 'the new legendaries / mythical are flagged leg (rift arena / judgment / tower legend pools only)');
	A(['Ferrodada', 'Flamariete', 'Electrofuria'].every(n => G.DEX.some(p => p.name === n)), 'the Spanish names come from PokéAPI as for the other 966 (Ferrodada, Flamariete, Electrofuria)');
	const credits = fs.readFileSync(path.join(MS, 'CREDITS.md'), 'utf8');
	const rows = credits.split(/\r?\n/).filter(l => /^\| .* \| .* \| [\d, ]+ \|$/.test(l)).map(l => l.split('|')[3].split(',').map(x => +x.trim()));
	const uncredited = NEW_DEX.filter(d => !rows.some(r => r.includes(d)));
	A(uncredited.length === 0, 'every new sheet has its SpriteCollab artist(s) in CREDITS.md (CC BY-NC 4.0 attribution; the in-game Credits screen reads it)', JSON.stringify(uncredited));
	// one-frame Walk sheets (the partial ones the FALLBACK table filled from a one-frame Idle) are only new Pokémon
	const oneWalk = Object.entries(G.SPRITE_META).filter(([, m]) => m.a.Walk && m.a.Walk.n === 1).map(([d]) => +d);
	A(oneWalk.length === 8 && oneWalk.every(d => NEW_DEX.includes(d)), `the one-frame Walk sheets (which get the walking hop) are all new ones (${oneWalk.join(', ')}), so the 966 draw as before`);
}

// ================= 2. every sheet on disk: present, PNG, the meta's geometry =================
const ASSETS = fs.existsSync(path.join(MS, 'assets/pokemon/1'));
function pngSize(file) {
	const b = fs.readFileSync(file);
	if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 12, 16) !== 'IHDR') return null;
	return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), buf: b };
}
if (!ASSETS) console.log('note: micasurvivor/assets/pokemon is missing locally — the sheet checks are skipped (run with the assets present)');
else {
	let files = 0; const bad = [];
	for (const [d, m] of Object.entries(G.SPRITE_META)) {
		const check = (anim, g, shiny) => {
			const f = path.join(MS, 'assets/pokemon', d, shiny ? 's' : '', anim + '.png');
			if (!fs.existsSync(f)) { bad.push(`${d}/${shiny ? 's/' : ''}${anim} missing`); return; }
			files++;
			const s = pngSize(f);
			if (!s) { bad.push(`${d}/${anim} not a PNG`); return; }
			if (Math.floor(s.h / g.h) !== g.r || Math.floor(s.w / g.w) < g.n || g.d.length !== g.n) bad.push(`${d}/${shiny ? 's/' : ''}${anim} ${s.w}x${s.h} vs ${g.w}x${g.h} n${g.n} r${g.r}`);
		};
		for (const [anim, g] of Object.entries(m.a)) check(anim, g, false);
		if (m.sh) for (const anim of Object.keys(m.a)) if (!(m.sm || []).includes(anim)) check(anim, (m.sa && m.sa[anim]) || m.a[anim], true);
	}
	A(bad.length === 0 && files > 13000, `every sheet of the ${Object.keys(G.SPRITE_META).length} Pokémon is on disk with its meta's geometry (${files} PNGs, normal + shiny)`, JSON.stringify(bad.slice(0, 10)));
	// the 17 new: the whole image data inflates (a broken download would not)
	const broken = [];
	for (const d of NEW_DEX) {
		const dir = path.join(MS, 'assets/pokemon', String(d));
		for (const f of [...fs.readdirSync(dir).filter(x => x.endsWith('.png')), ...(fs.existsSync(path.join(dir, 's')) ? fs.readdirSync(path.join(dir, 's')).map(x => 's/' + x) : [])]) {
			const s = pngSize(path.join(dir, f));
			const idat = []; let o = 8;
			while (o < s.buf.length) { const len = s.buf.readUInt32BE(o), t = s.buf.toString('ascii', o + 4, o + 8); if (t === 'IDAT') idat.push(s.buf.subarray(o + 8, o + 8 + len)); o += 12 + len; }
			try { if (!zlib.inflateSync(Buffer.concat(idat)).length) broken.push(d + '/' + f); } catch { broken.push(d + '/' + f); }
		}
	}
	A(broken.length === 0, 'every PNG of the 17 new Pokémon inflates completely', JSON.stringify(broken));
	A(PENDING_ART.every(d => !fs.existsSync(path.join(MS, 'assets/pokemon', String(d)))), 'no asset folder for the 42 pending (nothing half-made is published)');
}

// ================= 3+. in the browser =================
const ROW = { rev: 0, save: null };
const notFound = [];
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = '';
		req.on('data', c => { raw += c; });
		req.on('end', () => {
			let body = {}; try { body = JSON.parse(raw || '{}'); } catch { }
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
		if (e) { notFound.push(u); res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

const BEFORE = () => {
	localStorage.setItem('magepunk_mp_token_v1', 'pokedex-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'pokedextester' }));
};

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(BEFORE);
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/status of (404|409)/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	const E = (fn, ...a) => page.evaluate(fn, ...a);
	const visible = (id) => E(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const shot = async (name) => {
		if (!SHOTS) return;
		await E(() => { document.querySelectorAll('#ach-pop, .toast').forEach(e => { e.style.display = 'none'; }); if (G.Game.state !== 'ui') G.Spawner.say('', 0); });
		await sleep(120); fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) });
	};

	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.LexiconUI), 30000), 'boots (logged in to a stubbed Magepunk account)', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	await waitFor(() => visible('scr-test'), 10000);
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	A(await E(() => G.I18n.lang) === 'en', 'English mode');

	// ---- English names and abilities
	{
		const r = await E(NEW => Object.keys(NEW).map(d => { const p = G.DEX_BY[d]; return [+d, p && G.I18n.t(p.name), G.Abilities.BY_DEX[d] || null, !!(G.Abilities.FX[G.Abilities.BY_DEX[d]])]; }), NEW);
		const wrong = r.filter(([d, en]) => en !== NEW[d]);
		A(wrong.length === 0, 'the 17 show their official English names (Iron Treads, Gouging Fire, Raging Bolt, Sirfetch\u2019d...)', JSON.stringify(wrong));
		const idxFile = path.join(ROOT, 'overworld/data/species_index.json');
		if (fs.existsSync(idxFile)) {
			const idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')), official = {};
			for (const [k, v] of Object.entries(idx)) if (v.num > 0 && !k.includes('_') && !official[v.num]) official[v.num] = v.name.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
			const off = r.filter(([d, en]) => official[d] !== en);
			A(off.length === 0, 'and they match overworld/data/species_index.json', JSON.stringify(off.map(([d, en]) => [d, en, official[d]])));
		}
		const noAb = r.filter(x => !x[2] || !x[3]);
		A(noAb.length === 0, 'each new Pokémon has a defined ability (abilities.js BY_DEX)', JSON.stringify(noAb));
		const wild = await E(() => G.I18n.t('¡{x} salvaje apareció!'.replace('{x}', G.DEX_BY[990].name)));
		A(wild === 'A wild Iron Treads appeared!', `the wild-encounter notice uses the English name ("${wild}")`);
	}

	// ---- every sheet of the 17 loads in the browser and its first frame has pixels
	if (ASSETS) {
		const r = await E(async (NEW_DEX) => {
			const out = { n: 0, bad: [] };
			const cv = document.createElement('canvas'), x = cv.getContext('2d', { willReadFrequently: true });
			for (const d of NEW_DEX) {
				const m = G.SPRITE_META[d];
				const sets = [[false, m.a]];
				if (m.sh) sets.push([true, m.a]);
				for (const [shiny, anims] of sets) for (const anim of Object.keys(anims)) {
					if (shiny && (m.sm || []).includes(anim)) continue;
					const g = G.Sprites.animMeta(d, anim, shiny);
					const img = new Image(); img.src = `assets/pokemon/${d}/${shiny ? 's/' : ''}${anim}.png`;
					try { await img.decode(); } catch { out.bad.push(d + '/' + (shiny ? 's/' : '') + anim + ' failed'); continue; }
					cv.width = g.w; cv.height = g.h; x.clearRect(0, 0, g.w, g.h); x.drawImage(img, 0, 0, g.w, g.h, 0, 0, g.w, g.h);
					const px = x.getImageData(0, 0, g.w, g.h).data; let on = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 40) on++;
					if (!on || img.naturalWidth < g.w * g.n || img.naturalHeight < g.h * g.r) out.bad.push(d + '/' + anim + ' empty/short'); else out.n++;
				}
			}
			return out;
		}, NEW_DEX);
		A(r.bad.length === 0 && r.n >= 17 * 7 + 16 * 7, `every sheet of the 17 new Pokémon loads in the browser and its first frame decodes to pixels (${r.n} sheets, normal + shiny)`, JSON.stringify(r.bad.slice(0, 8)));
	}

	// ---- a normal run: each new non-legendary is a real candidate, and really spawns
	await E(() => {
		window.__T = {
			withRandom(v, fn) { const r = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = r; } },
			start(mode = 'normal') {
				G.Game.startRun(null, mode);
				if (G.Game.state === 'playing') G.Game.togglePause();
				G.UI.hideAll();
				const pl = G.Game.player; pl.invuln = 1e9; G.EnemyMgr.clear();
				return G.Game.mode;
			},
			/** rolls the run's cast with `dex` forced in (the cast picks go through G.U.pickN / G.U.pick) */
			rollWith(dex) {
				const U = G.U, pn = U.pickN, pk = U.pick;
				U.pickN = (arr, n) => { const r = pn(arr, n); const i = arr.findIndex(p => p && p.dex === dex); if (i >= 0 && n > 0 && !r.includes(arr[i])) r[0] = arr[i]; return r; };
				U.pick = (arr) => arr.find(p => p && p.dex === dex) || pk(arr);
				try { return G.Enemies.rollRun(); } finally { U.pickN = pn; U.pick = pk; }
			},
			/** spawns one enemy of that def through the real spawner */
			spawnDef(def, t) {
				const bag = G.Enemies.bagAt, free = G.World.isFree;
				G.Enemies.bagAt = () => [def]; G.World.isFree = () => true;
				try { return G.Spawner.spawnOne(G.Game.player, t); } finally { G.Enemies.bagAt = bag; G.World.isFree = free; }
			},
		};
	});
	A(await E(() => __T.start('normal')) === 'normal', 'a normal run starts');
	{
		const r = await E((NEW_DEX, NEW_LEG) => {
			const out = [];
			const T = G.Enemies.TIERS;
			for (const d of NEW_DEX) {
				if (NEW_LEG.includes(d)) continue;
				const p = G.DEX_BY[d];
				const tiers = T.map((t, i) => (G.Enemies.candidates(t).includes(p) ? i : -1)).filter(i => i >= 0);
				const row = { d, tiers, boss: false, spawned: false, cast: false, beh: null };
				if (tiers.length) {
					const { cast } = __T.rollWith(d);
					const ti = tiers[0], def = cast[ti].list.find(e => e.dex === d);
					row.cast = !!def;
					if (def) {
						row.beh = def.behavior;
						G.EnemyMgr.clear();
						const e = __T.spawnDef(def, T[ti].from + 5);
						row.spawned = !!(e && e.dex === d && G.EnemyMgr.all().includes(e) && e.hp > 0);
						// it is in the run's bag at its tier's time (the normal spawn path)
						row.inBag = G.Enemies.bagAt(T[ti].from + 5, '').some(x => x.dex === d);
					}
				}
				// the boss-eligible ones (BST in a boss slot, not legendary) come as bosses
				const slots = G.Enemies.BOSS_SLOTS.filter(s => p.bst >= s.bst[0] && p.bst <= s.bst[1]);
				if (slots.length) {
					const { bosses } = __T.rollWith(d);
					const b = bosses.find(x => x.dex === d);
					row.boss = !!b;
					if (b) { G.EnemyMgr.clear(); const e = G.Spawner.spawnBoss(G.Game.player, b.at, b); row.bossSpawned = !!(e && e.boss && e.dex === d); }
				}
				out.push(row);
			}
			G.EnemyMgr.clear();
			G.Enemies.rollRun();
			return out;
		}, NEW_DEX, NEW_LEG);
		const reg = r.filter(x => x.tiers.length), bossOnly = r.filter(x => !x.tiers.length);
		A(reg.length === 12 && reg.every(x => x.cast && x.inBag && x.spawned), `the ${reg.length} new regular enemies are tier candidates of a normal run, join its cast through the hooks, sit in its spawn bag and really spawn`, JSON.stringify(r));
		A(bossOnly.map(x => x.d).join() === '1020,1021' && bossOnly.every(x => x.boss && x.bossSpawned), 'Gouging Fire and Raging Bolt (rarity 5, not legendary) are boss-only, like Walking Wake: they come as a normal run\'s bosses', JSON.stringify(bossOnly));
		const asBoss = r.filter(x => x.boss).map(x => x.d);
		A([865, 879, 990, 1020, 1021].every(d => asBoss.includes(d)) && r.filter(x => x.boss).every(x => x.bossSpawned), `the boss-eligible new ones spawn as bosses (${asBoss.join(', ')})`);
		const beh = Object.fromEntries(r.map(x => [x.d, x.beh]));
		A(beh[683] === 'healer' && beh[879] === 'tank' && beh[990] === 'zoner', 'roles fit: Aromatisse heals (its Healer ability), Copperajah tanks, Iron Treads lays zones', JSON.stringify(beh));
	}

	// ---- drawn on screen: several new enemies around the player, walking with their own sheets
	{
		const r = await E(async (NEW_DEX, NEW_LEG) => {
			G.Spawner.update = () => {}; G.Events.update = () => {};   // no other enemies / events while we look
			G.EnemyMgr.clear();
			const pl = G.Game.player, list = NEW_DEX.filter(d => !NEW_LEG.includes(d));
			const es = list.map((d, i) => {
				const p = G.DEX_BY[d], a = (i / list.length) * Math.PI * 2;
				const def = { dex: d, name: p.name, behavior: 'chase', hp: 500, spd: 18, dmg: 0, xp: 1 };
				const e = new G.Enemy(def, pl.x + Math.cos(a) * 230, pl.y + Math.sin(a) * 150, { hp: 1, spd: 1, dmg: 1 });
				G.EnemyMgr.add(e); return e;
			});
			await G.Sprites.preload(list, 8000);
			if (G.Game.state !== 'playing') G.Game.togglePause();
			await new Promise(res => setTimeout(res, 900));
			const out = es.map(e => {
				const cur = e.anim.cur, s = G.Sprites.sheet(e.dex, cur, e.anim.shiny);
				return { d: e.dex, cur, base: e.anim.base, ready: !!(s && s.ready), alive: G.EnemyMgr.all().includes(e) };
			});
			return out;
		}, NEW_DEX, NEW_LEG);
		const bad = r.filter(x => !x.ready || !x.alive || x.base !== 'Walk');
		A(bad.length === 0, `the ${r.length} new enemies walk on screen with their own sheets loaded (no fallback ball)`, JSON.stringify(bad));
		await shot('b1_new_enemies.png');
		// close-ups: a Gen 5 one (Jellicent / Stunfisk) and the Paradox ones (Iron Treads, Gouging Fire, Raging Bolt)
		for (const [name, ids] of [['b1_gen5_jellicent_stunfisk.png', [593, 618]], ['b1_paradox_irontreads_gougingfire_ragingbolt.png', [990, 1020, 1021]]]) {
			await E(ids => {
				G.EnemyMgr.clear(); const pl = G.Game.player;
				ids.forEach((d, i) => { const p = G.DEX_BY[d]; const e = new G.Enemy({ dex: d, name: p.name, behavior: 'chase', hp: 500, spd: 10, dmg: 0, xp: 1 }, pl.x - 160 + i * 160, pl.y - 110, { hp: 1, spd: 1, dmg: 1 }); G.EnemyMgr.add(e); });
			}, ids);
			await sleep(700);
			await shot(name);
		}
		await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); G.EnemyMgr.clear(); });
	}

	// ---- each new legendary is the rift's legendary boss in its arena (a fresh run each; Miraidon last, for the screenshot)
	{
		const all = [];
		for (const d of [1003, 1025, 1008]) {
			await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); });
			await E(() => __T.start('normal'));
			all.push(await E(async d => {
				G.Spawner.update = () => {}; G.Events.update = () => {};
				const pool = G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex]);
				// only this one may be drawn: the others' leg flag is off for the draw
				const off = pool.filter(p => p.dex !== d); off.forEach(p => { p.leg = false; });
				try { G.EnemyMgr.clear(); G.Rift.debugArena(); } finally { off.forEach(p => { p.leg = true; }); }
				const e = G.EnemyMgr.all().find(x => x.legend);
				const out = { d, inPool: pool.some(p => p.dex === d), arena: G.Rift.inArena, legend: !!e, dex: e && e.dex, boss: !!(e && e.boss), type: G.Rift.arena && G.Rift.arena.type, types: G.DEX_BY[d].types };
				if (e) {
					await G.Sprites.preload([d], 8000);
					G.Game.togglePause(); await new Promise(res => setTimeout(res, 900)); G.Game.togglePause();
					const s = G.Sprites.sheet(d, e.anim.cur, e.anim.shiny); out.drawn = !!(s && s.ready) && G.EnemyMgr.all().includes(e);
				}
				return out;
			}, d));
		}
		if (SHOTS) { await E(() => { const e = G.EnemyMgr.all().find(x => x.legend), pl = G.Game.player; if (e) { pl.x = e.x; pl.y = e.y + 70; } if (G.Game.state !== 'playing') G.Game.togglePause(); }); await sleep(600); await shot('b1_legendary_miraidon_rift_boss.png'); await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); }); }
		const bad = all.filter(x => !x.inPool || !x.arena || !x.legend || x.dex !== x.d || !x.boss || !x.types.includes(x.type));
		A(all.length === 3 && bad.length === 0, 'Ting-Lu, Miraidon and Pecharunt are in the rift\'s legendary pool and each comes as the arena\'s legendary boss (an arena of one of its types)', JSON.stringify(all));
		A(all.every(x => x.drawn), 'each is drawn in the arena with its own sheets (Miraidon: Low-Power Mode; Ting-Lu: the full "Temp" sheet)', JSON.stringify(all.map(x => [x.d, x.drawn])));
		const ach = await E(legs => legs.map(d => !!G.AchDefs.LIST.find(a => a.dex === d)), NEW_LEG);
		A(ach.every(Boolean), 'each new legendary gets its "defeat" achievement like the others (achievements.js)', JSON.stringify(ach));
	}

	// ---- the Lexicon: each new Pokémon's entry opens, in English
	{
		await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); G.Game.quit(); G.UI.hideAll(); G.MenuUI.open(); });
		await sleep(300);
		// (one of them owned, so its entry shows the sprite rather than the silhouette)
		await E(() => { G.DB.save.owned[1020] = { at: Date.now(), from: 'gacha' }; G.LexiconUI.open('p'); }); await sleep(250);
		const res = [];
		for (const d of NEW_DEX) {
			const g = G.DEX_BY[d].gen;
			await E(g => { const b = document.querySelector(`#lex-body .lex-gens [data-gen="${g}"]`); if (b) b.click(); }, g); await sleep(120);
			res.push(await E(async d => {
				const c = document.querySelector(`#lex-body .lex-card[data-lex="p:${d}"]`);
				if (!c) return { d, card: false };
				c.click(); await new Promise(r => setTimeout(r, 30));
				const pop = document.getElementById('lexpop-body'), shown = !document.getElementById('scr-lexpop').classList.contains('hidden');
				const out = { d, card: true, shown, key: pop.dataset.key, h: pop.querySelector('h2') && pop.querySelector('h2').textContent.trim(), text: pop.innerText };
				return out;
			}, d));
			if (d === 1020) await shot('b1_lexicon_gouging_fire.png');
			await E(() => { const b = document.getElementById('lexpop-close'); if (b) b.click(); });
		}
		const bad = res.filter(x => !x.card || !x.shown || x.key !== 'p:' + x.d || x.h !== NEW[x.d] || !/Ability/.test(x.text) || /[¡¿ñ]|Habilidad|Rareza/.test(x.text));
		A(bad.length === 0, 'the Lexicon entry of each of the 17 opens, titled with its English name, in English', JSON.stringify(bad.slice(0, 4).map(x => [x.d, x.card, x.shown, x.key, x.h])));
		const cnt = await E(() => { const L = G.LexiconUI, g0 = L.gen; let n = 0; for (let g = 1; g <= 9; g++) { L.gen = g; n += L.entries('p').length; } L.gen = g0; return n; });
		A(cnt === 983, `the Lexicon lists all ${cnt} Pokémon`);
	}

	const missing = notFound.filter(u => !(u.startsWith('/micasurvivor/assets/') && !ASSETS));
	A(missing.length === 0, 'no 404s', missing.slice(0, 5).join(' | '));
	A(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
	console.log(errors.slice(0, 5).join(' | '));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
