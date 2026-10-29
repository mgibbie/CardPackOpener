// designwiki_pokermon_jokers_test.mjs — the design wiki's "Pokermon jokers not in the game yet" section
// (designwiki/#/pokermon-jokers; data/pokermon_jokers.json from tools/micatro/gen_designwiki_pokermon_jokers.mjs, art from
// tools/micatro/compose_missing_pokermon_jokers.mjs, the owner's designs via server/mp.mjs joker-design-*).
//   DATA  the committed list is EXACTLY the canonical species (dex 1-1025) with no joker in Pokermon / Nacho / Pokermon+,
//         recomputed from the mods as the game registers them (a mod upgrade that adds jokers fails this until the list is
//         regenerated); no listed species has a joker (by name) in any of the three, and every species they do cover is
//         off the list; listed + covered = 1025; the type table is the mods' own majority (primary type -> ptype)
//   TYPE  owner rule: the type the CARD shows wins. The art typer (tools/micatro/pokermon_art_type.mjs, type-icon template matching)
//         is first validated leave-one-out on the registered Pokermon jokers (100%); then every wiki card with upstream art has
//         ptype = its art's type (type_source 'art'), the mapping only where no card / icon exists ('mapping'); mapped_ptype is
//         the mapping's guess; spot checks of cards whose art differs from the mapping (Tyrunt Dragon, Phantump Grass...)
//   ART   UPSTREAM FIRST: every species Pokermon 3.9.1's sprite table draws (tools/micatro/specs/pokermon_391_sprite_table.json
//         — checked against the game's own lookups, data391.js sprites and the owner's jokers' poke_sprite391 — with a non-empty
//         cell on the shipped sheet) uses that card, pixel-identical to the sheet's cell (+ its soul layer); only the rest are
//         composed, none blank (142 x 190, opaque, many colours, the battle sprite painted 100+ pixels); art.source records
//         which; the art script re-makes every card byte-identical, and re-running the generator gives the same JSON + PNGs
//   WIKI  (the real dev server: real auth + the joker-design actions on a fresh sqlite) the index lists every species, grouped
//         by generation, with working generation / type / search filters; a card page shows its art (+ Shiny) and the art
//         source label ("Art: Pokermon upstream" / "Art: composed (no upstream card yet)", by art.source), name, dex,
//         type, stage and evolution line; the "Submit design" box appears ONLY for the owner (signed out and a non-owner
//         see none, and the page never calls the joker-design API for them); the owner's submission round-trips (the server
//         holds exactly what was typed, the card shows it read-only, and the index marks the tile); no horizontal scroll at
//         390 px; no console errors
//   node overworld/tests/designwiki_pokermon_jokers_test.mjs
//   (PJ_SHOTS=<dir>: also saves desktop + 390 px screenshots, with the owner box shown and hidden)
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const SHOTS = process.env.PJ_SHOTS || '';
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9617, BASE = `http://localhost:${PORT}`;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'designwiki/data/pokermon_jokers.json'), 'utf8'));
const sp0 = (n) => D.species.find(s => s.name === n);

let server, browser;
try {
	// ================================================================== DATA
	const PM = await imp('tools/micatro/pokermon_missing_jokers.mjs');
	const M = await PM.computeMissing({ fresh: true });
	const listed = D.species.map(s => s.dex);
	A(JSON.stringify(listed) === JSON.stringify(M.missing.map(s => s.dex)), `the committed list is exactly the mods' missing set (${listed.length})`,
		'committed-only: ' + listed.filter(d => !M.missing.some(s => s.dex === d)).join(',') + ' / mods-missing-only: ' + M.missing.filter(s => !listed.includes(s.dex)).map(s => s.dex).join(','));
	A(listed.every((d, i) => Number.isInteger(d) && d >= 1 && d <= 1025 && (!i || d > listed[i - 1])), 'dex numbers 1..1025, ascending, no duplicates (no fakemon)');
	const fields = ['key', 'name', 'gen', 'stage', 'rarity', 'cost'];
	const drift = D.species.filter(s => { const m = M.missing.find(x => x.dex === s.dex); return !m || m.ptype !== s.mapped_ptype || fields.some(f => JSON.stringify(m[f]) === undefined || JSON.stringify(m[f]) !== JSON.stringify(s[f])) || JSON.stringify(m.line) !== JSON.stringify(s.line) || JSON.stringify(m.types) !== JSON.stringify(s.types); });
	A(!drift.length, 'every entry (type, stage, rarity, cost, line) matches a fresh computation', drift.slice(0, 5).map(s => s.dex).join(','));
	// independently of computeMissing's coverage: the mods' jokers, by name
	const jokers = M.jokers;
	A(PM.MODS.every(m => jokers.some(j => j.mod === m)), 'all three mods registered jokers');
	const names = new Set(jokers.map(j => String(j.name).toLowerCase()));
	const named = D.species.filter(s => names.has(s.key) || names.has(s.key.replace(/_/g, '')) || names.has('mega_' + s.key));
	A(!named.length, 'no listed species has a joker named after it in Pokermon / Nacho / Pokermon+', named.map(s => s.name).join(', '));
	const coveredDex = new Set(jokers.map(j => PM.speciesOfJoker(j.name, M.species.numOfKey)).filter(Boolean));
	A([...coveredDex].every(d => !listed.includes(d)), 'every species a mod joker covers (incl. Megas / forms) is off the list');
	A(coveredDex.size + listed.length === 1025 && D.counts.covered === coveredDex.size && D.counts.missing === listed.length, `listed (${listed.length}) + covered (${coveredDex.size}) = 1025`);
	for (const m of PM.MODS) A(D.counts.byMod[m].species === M.coverage[m].size, `${m}: ${D.counts.byMod[m].species} species covered`);
	A(['Bulbasaur', 'Pikachu', 'Mewtwo'].every(n => !D.species.some(s => s.name === n)) && D.species.some(s => s.name === 'Pikipek'), 'spot check: Bulbasaur / Pikachu / Mewtwo have jokers, Pikipek does not');
	// the type table is the mods' own majority (every primary type that has a clear one; Flying has none upstream)
	const badTypes = Object.entries(M.typeVotes).filter(([t, v]) => {
		if (t === 'Flying') return false;
		const [best] = Object.entries(v).sort((a, b) => b[1] - a[1]);
		return PM.TYPE_TO_PTYPE[t] !== best[0];
	});
	A(!badTypes.length, 'TYPE_TO_PTYPE = the majority of upstream ptypes per primary type', JSON.stringify(badTypes));
	A(D.species.every(s => PM.ptypeOf(s.types) === s.mapped_ptype && (s.types[0] === 'Flying' || Object.keys(D.conventions.typeToPtype).includes(s.types[0]))), 'each mapped_ptype follows from the primary type (Flying: the second type)');
	// ---- TYPE: the card's own type wins (owner rule). First the detector, on the jokers whose ptype upstream registered.
	const AT = await imp('tools/micatro/pokermon_art_type.mjs');
	const typer = await AT.loadArtTyper({ jokers });
	const val = typer.validate();
	A(val.total >= 540 && val.ok === val.total && val.minMargin >= 0.2, `the art typer reads ${val.ok} / ${val.total} registered Pokermon jokers' types right, leave-one-out (min margin ${val.minMargin.toFixed(2)})`,
		val.wrong.slice(0, 8).map(w => `${w.name} ${w.ptype}->${w.got}`).join(', '));
	A(AT.POKETYPES.every(t => typer.training.filter(r => r.ptype === t).length >= 10), 'its training covers all 12 Pokermon types (10+ cards each)');
	const MJT = await imp('tools/micatro/compose_missing_pokermon_jokers.mjs');
	const tBad = [], srcWrong = [];
	for (const s of D.species) {
		const e = s.art.source === 'upstream' ? MJT.upstreamEntry(typer.table, s) : null;
		const r = e ? typer.typeOfEntry(e) : null;
		const want = r && r.ptype ? { ptype: r.ptype, src: 'art' } : { ptype: s.mapped_ptype, src: 'mapping' };
		if (s.ptype !== want.ptype) tBad.push(`${s.name} ${s.ptype} (card: ${want.ptype})`);
		if (s.type_source !== want.src) srcWrong.push(`${s.name} ${s.type_source}`);
	}
	A(!tBad.length, `every wiki card's type is the type its card art shows (${D.species.filter(s => s.type_source === 'art').length} from the art)`, tBad.slice(0, 8).join(', '));
	A(!srcWrong.length && D.species.every(s => ['art', 'mapping'].includes(s.type_source)), 'type_source records where each type came from (art, else mapping)', srcWrong.slice(0, 8).join(', '));
	A(D.counts.typeSource.art + D.counts.typeSource.mapping === D.species.length && D.counts.typeFromArtDiffers === D.species.filter(s => s.ptype !== s.mapped_ptype).length, 'counts.typeSource / typeFromArtDiffers match the list');
	A(!sp0('Latias') && sp0('Tyrunt')?.ptype === 'Dragon' && sp0('Phantump')?.ptype === 'Grass' && sp0('Cutiefly')?.ptype === 'Fairy' && sp0('Kyurem')?.ptype === 'Water' && sp0('Stunfisk')?.ptype === 'Lightning'
		&& sp0('Keldeo')?.ptype === 'Fighting' && sp0('Keldeo')?.type_source === 'art' && sp0('Keldeo')?.mapped_ptype === 'Water', 'spot check (the card wins; Latias, Dwebble, Venipede and Sandile are in the game now): Tyrunt Dragon, Phantump Grass, Cutiefly Fairy, Kyurem Water, Stunfisk Lightning; Keldeo Fighting from its art (the mapping said Water)');
	A(D.species.every(s => ['Basic', 'One', 'Two', 'Baby', 'Legendary'].includes(s.stage) && s.line.some(l => l.dex === s.dex)), 'every species has an upstream stage and sits in its own line');
	const sp = sp0;
	A(sp('Toucannon')?.stage === 'Two' && sp('Trumbeak')?.stage === 'One' && sp('Toxel')?.stage === 'Baby' && sp('Yveltal')?.stage === 'Legendary' && sp('Corviknight')?.ptype === 'Metal' && sp('Noibat')?.ptype === 'Dragon',
		'spot check: Toucannon Stage 2, Trumbeak Stage 1, Toxel Baby, Yveltal Legendary, Corviknight Metal, Noibat Dragon');

	// ================================================================== ART
	// UPSTREAM FIRST: a species Pokermon 3.9.1's sprite table draws (tools/micatro/specs/pokermon_391_sprite_table.json, a
	// non-empty cell on the shipped sheet) shows THAT card, pixel-identical to the sheet's cell (+ its soul layer); only the rest
	// are composed (and those must not be blank).
	const C = await imp('tools/micatro/compose_pokermon_joker_art.mjs');
	const MJ = await imp('tools/micatro/compose_missing_pokermon_jokers.mjs');
	const ctx = await MJ.loadContext();
	const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/micatro/specs/pokermon_391_sprite_table.json'), 'utf8')).sprites;
	const SHEETS = ctx.assets; // micatro/mods/pokermon/assets/2x/Basic Series (the shipped 3.9.1 sheets; a worktree's link to the main checkout)
	// the table is the game's own lookup: data391.js sprites (every 3.9.1 joker the port has) and the owner's jokers' poke_sprite391
	const D391 = (await imp('micatro/mods/pokermon/data391.js')).default;
	const tblBad = Object.entries(D391.sprites).filter(([n, e]) => !e.extra && (!TABLE[n] || TABLE[n].atlas !== e.atlas || TABLE[n].pos.join() !== `${e.pos.x},${e.pos.y}`
		|| (TABLE[n].soul || []).join() !== (e.soul_pos ? `${e.soul_pos.x},${e.soul_pos.y}` : '')));
	A(Object.keys(D391.sprites).length > 500 && !tblBad.length, `the sprite table agrees with data391.js sprites for all ${Object.keys(D391.sprites).length} ported jokers`, tblBad.slice(0, 5).map(([n]) => n).join(','));
	const designsSrc = fs.readFileSync(path.join(ROOT, 'micatro/mods/pokermon/jokers/pokejokers_designs.js'), 'utf8');
	const designCells = [...designsSrc.matchAll(/name: '(\w+)', poke_sprite391: sprite\('(\w+)', (\d+), (\d+)(?:, \[(\d+), (\d+)\])?\)/g)];
	const PORT_NAME = { urshifu_single: 'urshifu_single_strike', urshifu_rapid: 'urshifu_rapid_strike' }; // (the port's keys for upstream's names)
	const dBad = designCells.map(([m, n, ...r]) => [m, PORT_NAME[n] || n, ...r]).filter(([, n, sh, x, y, sx, sy]) => !TABLE[n] || TABLE[n].atlas !== 'AtlasJokersBasic' + sh || TABLE[n].pos.join() !== `${x},${y}` || (TABLE[n].soul || []).join() !== (sx ? `${sx},${sy}` : ''));
	A(designCells.length >= 30 && !dBad.length, `... and with the owner's ${designCells.length} jokers' poke_sprite391 cells`, dBad.map(m => m[1]).join(','));
	// independently: which species have an upstream card (by name; punctuation dropped: tapukoko = tapu_koko), read off the sheets
	const nm = (n) => String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
	const sheetCache = new Map(), sheet = (atlas) => { if (!sheetCache.has(atlas)) sheetCache.set(atlas, C.decode(path.join(SHEETS, atlas + '-391.png'))); return sheetCache.get(atlas); };
	const crop = (sh, [cx, cy]) => { const o = Buffer.alloc(142 * 190 * 4); for (let y = 0; y < 190; y++) for (let x = 0; x < 142; x++) { const at = ((cy * 190 + y) * sh.w + cx * 142 + x) * 4; sh.rgba.copy(o, (y * 142 + x) * 4, at, at + 4); } return o; };
	const opaque = (b) => { let n = 0; for (let i = 3; i < b.length; i += 4) if (b[i]) n++; return n; };
	const upstreamOf = (s) => {
		const names = TABLE[s.key] ? [s.key] : Object.keys(TABLE).filter(n => nm(n) === nm(s.key));
		if (names.length !== 1) return null;
		const e = TABLE[names[0]], cells = {};
		for (const v of ['normal', 'shiny']) {
			const sh = sheet(e.atlas + (v === 'shiny' ? 'Shiny' : ''));
			cells[v] = { base: crop(sh, e.pos), soul: e.soul ? crop(sh, e.soul) : null };
			if (opaque(cells[v].base) < 20000 || (e.soul && !opaque(cells[v].soul))) return null;
		}
		return { name: names[0], e, cells };
	};
	let same = 0;
	const blank = [], differs = [], thin = [], srcBad = [], notUp = [], pixBad = [], composed = [];
	const t0 = Date.now();
	for (const s of ctx.M.missing) {
		const d = D.species.find(x => x.dex === s.dex);
		const up = upstreamOf(s);
		const r = MJ.artFor(ctx, s);
		if (up && r.source !== 'upstream') notUp.push(s.name);
		if (d.art.source !== r.source || (!up && r.source !== 'composed')) srcBad.push(`${s.name} data ${d.art.source} / script ${r.source} / upstream ${!!up}`);
		if (r.source === 'composed') composed.push(s);
		for (const v of ['normal', 'shiny']) {
			const file = path.join(ROOT, 'designwiki', d.art[v]);
			const bytes = C.encode(C.CELL_W, C.CELL_H, r[v]);
			if (fs.existsSync(file) && fs.readFileSync(file).equals(bytes)) same++; else differs.push(s.dex + ' ' + v);
			if (r.source === 'composed' && r[v + 'Painted'] < 100) thin.push(`${s.dex} ${v} (${r[v + 'Painted']})`);
			if (!fs.existsSync(file)) continue;
			const img = C.decode(file);
			if (up && r.source === 'upstream') {
				// pixel-identical to the sheet: the base cell where the soul is clear, the soul where it is opaque, "over" between
				const { base, soul } = up.cells[v];
				let bad = 0;
				for (let i = 0; i < 142 * 190 * 4; i += 4) {
					const sa = soul ? soul[i + 3] : 0;
					const want = sa === 0 ? base : sa === 255 ? soul : null;
					if (want) { for (let k = 0; k < 4; k++) if (img.rgba[i + k] !== want[i + k]) { bad++; break; } }
					else if (img.rgba[i + 3] < Math.max(sa, base[i + 3])) bad++;
				}
				if (img.w !== 142 || img.h !== 190 || bad) pixBad.push(`${s.name} ${v}: ${bad} px`);
			}
			const colours = new Set(), art = new Set();
			let opq = 0;
			for (let i = 0; i < img.w * img.h; i++) {
				const v32 = img.rgba.readUInt32LE(i * 4);
				if (img.rgba[i * 4 + 3] === 255) opq++;
				colours.add(v32);
				const x = (i % img.w) >> 1, y = ((i / img.w) | 0) >> 1;
				if (C.inArt(x, y)) art.add(v32);
			}
			if (img.w !== 142 || img.h !== 190 || opq < img.w * img.h * 0.9 || colours.size < 24 || art.size < 8) blank.push(`${s.dex} ${v}: ${img.w}x${img.h} opaque ${opq} colours ${colours.size} art ${art.size}`);
		}
	}
	const nUp = D.species.filter(s => s.art.source === 'upstream').length, nCo = D.species.filter(s => s.art.source === 'composed').length;
	console.log(`     art: ${nUp} upstream, ${nCo} composed (${composed.map(s => s.name).join(', ') || 'none'})`);
	A(D.species.every(s => s.art && fs.existsSync(path.join(ROOT, 'designwiki', s.art.normal)) && fs.existsSync(path.join(ROOT, 'designwiki', s.art.shiny))), 'every listed species has a normal + Shiny card in designwiki/sprites/pokermon_jokers/');
	A(nUp + nCo === listed.length && D.counts.art.upstream === nUp && D.counts.art.composed === nCo
		&& Object.entries(D.counts.artByGen).every(([g, v]) => v.upstream + v.composed === D.counts.byGen[g]), `every card records its source (art.source: upstream ${nUp} + composed ${nCo}), and the counts match`);
	A(!notUp.length, 'every species with an upstream 3.9.1 card uses it', notUp.join(', '));
	A(!srcBad.length, 'the recorded source is what the script makes (composed ONLY where upstream has no card)', srcBad.slice(0, 5).join(' | '));
	A(!pixBad.length && nUp > 0, `every upstream card is pixel-identical to its cell on the shipped 3.9.1 sheet (+ soul layer) (${nUp} x 2)`, pixBad.slice(0, 5).join(' | '));
	A(D.species.every(s => s.art.source === 'upstream' ? /^Pokermon 3\.9\.1 AtlasJokersBasic\w+-391\.png cell \d+,\d+/.test(s.art.recipe?.upstream || '') : !!s.art.recipe?.frame), 'each recipe names its source (the sheet + cell, or the composed frame)');
	A(!differs.length && same === listed.length * 2, `the art script re-makes all ${listed.length * 2} cards byte-identical (${Math.round((Date.now() - t0) / 1000)} s)`, differs.slice(0, 8).join(', '));
	A(!blank.length, 'no card is blank (142 x 190, 90%+ opaque — the corners are rounded —, 24+ colours, 8+ in the art window)', blank.slice(0, 5).join(' | '));
	A(!thin.length, 'every composed card: the battle sprite painted 100+ pixels onto it', thin.slice(0, 8).join(', '));
	// the composer stays working for species upstream doesn't draw (none today): a Basic, a Stage 1, a Baby and a Legendary
	const fallback = ['Toucannon', 'Trumbeak', 'Toxel', 'Yveltal'].map(n => ctx.M.missing.find(s => s.name === n)).filter(Boolean).map(s => [s.name, MJ.composeSpecies(ctx, s)]);
	A(fallback.length === 4 && fallback.every(([, r]) => r.normalPainted >= 100 && r.shinyPainted >= 100 && r.recipe.frame), 'the composer (the fallback) still composes a real card (Toucannon, Trumbeak, Toxel, Yveltal)', fallback.map(([n, r]) => n + ' ' + r.normalPainted).join(', '));
	const extra = fs.readdirSync(path.join(ROOT, 'designwiki/sprites/pokermon_jokers')).filter(f => !D.species.some(s => s.art.normal.endsWith('/' + f) || s.art.shiny.endsWith('/' + f)));
	A(!extra.length, 'no stale card art for species that now have jokers', extra.join(', '));
	// re-running the generator (into a scratch folder) gives the committed JSON and art, byte for byte
	const GEN = await imp('tools/micatro/gen_designwiki_pokermon_jokers.mjs');
	const tmpArt = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-art-'));
	const regen = JSON.stringify(await GEN.buildData({ art: true, out: tmpArt })) + '\n';
	const genFiles = fs.readdirSync(tmpArt).sort(), artDir = path.join(ROOT, 'designwiki/sprites/pokermon_jokers');
	const genDiff = genFiles.filter(f => !fs.existsSync(path.join(artDir, f)) || !fs.readFileSync(path.join(tmpArt, f)).equals(fs.readFileSync(path.join(artDir, f))));
	A(regen === fs.readFileSync(GEN.OUT_JSON, 'utf8').replace(/\r\n/g, '\n') && genFiles.length === listed.length * 2 && !genDiff.length,
		`re-running the generator is byte-identical (data/pokermon_jokers.json + ${genFiles.length} PNGs)`, genDiff.slice(0, 5).join(','));
	fs.rmSync(tmpArt, { recursive: true, force: true });

	// ================================================================== WIKI
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pj-wiki-')), 'users.sqlite');
	server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile } });
	const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 150)); } return false; };
	A(await waitFor(() => fetch(BASE + '/designwiki/').then(r => r.ok), 20000), 'dev server is up');
	const api = (action, body = {}, token) => fetch(BASE + '/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }).then(r => r.json());
	const owner = (await api('register', { username: 'mgibbie', password: 'localdev1' })).token;
	const peon = (await api('register', { username: 'pjpeon', password: 'localdev1' })).token;
	A(owner && peon, 'owner + non-owner accounts');

	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
	const open = async (token, username, w = 1280, hgt = 900) => {
		const ctxB = await browser.createBrowserContext();
		const page = await ctxB.newPage();
		await page.setViewport({ width: w, height: hgt, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument((t, u) => { try { if (t) localStorage.setItem('magepunk_mp_token_v1', t); if (u) localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: u })); } catch { } }, token, username);
		const errors = [], designCalls = [];
		page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text() + ' ' + ((m.location() || {}).url || ''))) errors.push(m.text()); });
		page.on('pageerror', e => errors.push(String(e)));
		page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
		page.on('request', r => { if (r.url().endsWith('/api/mp') && /joker-design/.test(r.postData() || '')) designCalls.push(JSON.parse(r.postData()).action); });
		return { page, ctx: ctxB, errors, designCalls };
	};
	const go = async (page, hash) => {
		await page.goto(BASE + '/designwiki/' + hash, { waitUntil: 'networkidle2', timeout: 30000 });
		await page.waitForFunction(() => !/Loading/.test(document.getElementById('content').textContent.slice(0, 40)), { timeout: 20000 });
	};
	const tiles = page => page.$$eval('.pj-tile', ts => ts.length);
	const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
	const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };

	// ---------- signed out: the index, its filters, a card, no box ----------
	const anon = await open(null, null);
	await go(anon.page, '#/pokermon-jokers');
	A(await tiles(anon.page) === listed.length, `the index lists all ${listed.length} species`, await tiles(anon.page));
	const gens = await anon.page.$$eval('.pj-gen', ss => ss.map(s => [+s.dataset.gen, s.querySelectorAll('.pj-tile').length]));
	A(JSON.stringify(gens) === JSON.stringify(Object.entries(D.counts.byGen).filter(([, n]) => n).map(([g, n]) => [+g, n])), 'grouped by generation, in order, with the right counts', JSON.stringify(gens));
	A(await anon.page.$('#sidebar a[href="#/pokermon-jokers"].active') !== null, 'the nav link is there and lit');
	await anon.page.select('#pjGen', '5');
	const g5 = await anon.page.$$eval('.pj-tile', ts => ts.map(t => +t.dataset.dex));
	A(g5.length === D.counts.byGen[5] && g5.every(d => d >= 494 && d <= 649), 'the generation filter shows only Generation 5', g5.length);
	A(/gen=5/.test(await anon.page.evaluate(() => location.hash)), 'the filter is kept in the hash');
	await anon.page.select('#pjType', 'Water');
	const w5 = await anon.page.$$eval('.pj-tile', ts => ts.map(t => t.dataset.ptype));
	A(w5.length === D.species.filter(s => s.gen === 5 && s.ptype === 'Water').length && w5.every(t => t === 'Water'), 'the type filter narrows to Water (in Gen 5)', w5.length);
	await anon.page.select('#pjGen', ''); await anon.page.select('#pjType', '');
	await anon.page.type('#pjQ', 'pikip');
	A(await waitFor(async () => (await anon.page.$$eval('.pj-tile', ts => ts.map(t => t.textContent))).join('|').match(/Pikipek/) && await tiles(anon.page) === D.species.filter(s => /pikip/i.test(s.name)).length, 4000), 'search by name');
	await anon.page.evaluate(() => { const q = document.getElementById('pjQ'); q.value = ''; q.dispatchEvent(new Event('input')); });
	await anon.page.type('#pjQ', '#0848');
	A(await waitFor(async () => await tiles(anon.page) === 1 && /Toxel/.test(await anon.page.$eval('.pj-tile', t => t.textContent)), 4000), 'search by dex number (#0848 = Toxel)');
	await go(anon.page, '#/pokermon-jokers');
	await shot(anon.page, 'desktop_index_signed_out');
	await go(anon.page, '#/pokermon-jokers/733');
	const card = await anon.page.evaluate(() => ({
		h1: document.querySelector('.pj-page h1')?.textContent, img: document.querySelector('.pj-art-big')?.naturalWidth, src: document.querySelector('.pj-art-big')?.getAttribute('src'),
		facts: document.querySelector('.pj-facts')?.textContent, line: [...document.querySelectorAll('.pj-line li')].map(l => l.textContent), box: !!document.querySelector('.pj-owner, #pjSubmit'),
		nullText: [...document.getElementById('content').childNodes].some(n => n.nodeType === 3 && /^\s*(null|undefined)\s*$/.test(n.textContent)),
	}));
	A(card.h1 === 'Toucannon #0733' && card.img === 142 && /0733\.png(\?|$)/.test(card.src), 'a card page shows the name, dex and its art', JSON.stringify(card));
	const LABEL = { upstream: 'Art: Pokermon upstream', composed: 'Art: composed (no upstream card yet)' };
	const label = () => anon.page.evaluate(() => { const e = document.querySelector('.pj-page-art .pj-artsrc'); return e && { text: e.textContent, src: e.dataset.source }; });
	const want733 = D.species.find(s => s.dex === 733).art.source;
	A(JSON.stringify(await label()) === JSON.stringify({ text: LABEL[want733], src: want733 }), `the card is labelled with its art source (${LABEL[want733]})`, JSON.stringify(await label()));
	A(/Colorless/.test(card.facts) && /Stage 2/.test(card.facts) && JSON.stringify(card.line) === '["Pikipek","Trumbeak","Toucannon"]', 'type, stage and evolution line', JSON.stringify(card));
	A(!card.box, 'signed out: no Submit design box');
	A(!card.nullText, 'no stray null / undefined text where the box would be');
	await anon.page.click('.pj-flip');
	A(/0733_shiny\.png(\?|$)/.test(await anon.page.$eval('.pj-art-big', i => i.getAttribute('src'))), 'the Shiny toggle swaps in the Shiny card');
	await shot(anon.page, 'desktop_card_signed_out');
	// a Legendary (soul layer) card, and its label
	await go(anon.page, '#/pokermon-jokers/717');
	const want717 = D.species.find(s => s.dex === 717).art.source;
	A(JSON.stringify(await label()) === JSON.stringify({ text: LABEL[want717], src: want717 }) && await anon.page.$eval('.pj-art-big', i => i.naturalWidth) === 142, `Yveltal (Legendary): its card and label (${LABEL[want717]})`);
	await shot(anon.page, 'desktop_card_legendary');
	A(!anon.designCalls.length, 'signed out: the page never calls the joker-design API', anon.designCalls.join(','));
	A(!anon.errors.length, 'no console errors (signed out)', anon.errors.slice(0, 3).join(' | '));
	await anon.ctx.close();

	// ---------- the composed label (no species is composed today, so the data is flipped for one card in the browser) ----------
	const cp = await open(null, null);
	await cp.page.setRequestInterception(true);
	cp.page.on('request', r => {
		if (!/\/designwiki\/data\/pokermon_jokers\.json/.test(r.url())) return r.continue();
		const j = JSON.parse(JSON.stringify(D));
		const t = j.species.find(s => s.dex === 848);
		t.art.source = 'composed'; t.art.recipe = { frame: 'Lightning Baby frame (test)', background: 'a scene (test)', sprite: 'toxel.png x2' };
		r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
	});
	await go(cp.page, '#/pokermon-jokers/848');
	const cl = await cp.page.evaluate(() => ({ text: document.querySelector('.pj-artsrc')?.textContent, src: document.querySelector('.pj-artsrc')?.dataset.source, recipe: document.querySelector('.pj-recipe')?.textContent }));
	A(cl.text === LABEL.composed && cl.src === 'composed' && /Lightning Baby frame \(test\)/.test(cl.recipe || ''), 'a composed card is labelled "Art: composed (no upstream card yet)" with its recipe', JSON.stringify(cl));
	await cp.ctx.close();

	// ---------- a non-owner: no box ----------
	const pe = await open(peon, 'pjpeon');
	await go(pe.page, '#/pokermon-jokers/733');
	A(!(await pe.page.$('.pj-owner')) && !(await pe.page.$('#pjSubmit')), 'a non-owner: no Submit design box');
	await go(pe.page, '#/pokermon-jokers');
	A(!pe.designCalls.length, 'a non-owner: the page never calls the joker-design API', pe.designCalls.join(','));
	await pe.ctx.close();

	// ---------- the owner: box, submission round-trip ----------
	const ow = await open(owner, 'mgibbie');
	await go(ow.page, '#/pokermon-jokers/733');
	A(await ow.page.$('.pj-owner #pjSubmit') !== null, 'the owner sees the Submit design box');
	A(await ow.page.$eval('#pjRarity', s => s.value) === D.species.find(s => s.dex === 733).rarityLabel, 'the rarity defaults to the guess');
	const typed = { ability: 'Retrigger every scored 3\nGains X0.5 Mult per Trumbeak sold', rarity: 'Rare', cost: '9', notes: 'Shiny: X2 instead' };
	await ow.page.type('#pjAbility', typed.ability);
	await ow.page.select('#pjRarity', typed.rarity);
	await ow.page.type('#pjCost', typed.cost);
	await ow.page.type('#pjNotes', typed.notes);
	await ow.page.click('#pjSubmit');
	A(await waitFor(() => ow.page.$eval('.pj-msg', m => /filed ✓ \(1 design in the joker design list\)/.test(m.textContent)), 8000), 'submitting shows the confirmation', await ow.page.$eval('.pj-msg', m => m.textContent));
	const srv = await api('joker-design-list', {}, owner);
	const got = srv.designs && srv.designs[0];
	A(srv.designs?.length === 1 && got.dex === 733 && got.name === 'Toucannon' && got.ability === typed.ability && got.rarity === 'Rare' && got.cost === 9 && got.notes === typed.notes,
		'the server holds exactly what was typed (owner_todo:jokers)', JSON.stringify(srv));
	A(await waitFor(() => ow.page.$$eval('.pj-design', ds => ds.length === 1 && ds[0].textContent.includes('Retrigger every scored 3')), 5000), 'the filed design shows on the card');
	A(await ow.page.$eval('#pjAbility', t => t.value) === '', 'the box clears after filing');
	await go(ow.page, '#/pokermon-jokers/733');
	A(await waitFor(() => ow.page.$$eval('.pj-design', ds => ds.length === 1 && /Rare/.test(ds[0].textContent) && /\$9/.test(ds[0].textContent) && /Shiny: X2/.test(ds[0].textContent)), 5000), 'after a reload the design is still listed, read-only (rarity, cost, notes)');
	A(await ow.page.$$eval('.pj-design textarea, .pj-design input', x => x.length) === 0, 'the filed designs are read-only');
	await ow.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await shot(ow.page, 'desktop_card_owner');
	await go(ow.page, '#/pokermon-jokers');
	A(await waitFor(() => ow.page.$eval('.pj-tile[data-dex="733"] .pj-designed', e => e.textContent === '✎ 1'), 5000), 'the index marks the tile the owner designed');
	A(!ow.errors.length, 'no console errors (owner)', ow.errors.slice(0, 3).join(' | '));
	await ow.ctx.close();

	// ---------- phones (390 px): no horizontal scroll, owner box shown / hidden ----------
	const phA = await open(null, null, 390, 844);
	await go(phA.page, '#/pokermon-jokers');
	A(await noHScroll(phA.page), '390 px index: no horizontal scroll');
	A(await phA.page.evaluate(() => { const t = document.querySelectorAll('.pj-tile'); return t.length > 3 && t[0].getBoundingClientRect().top === t[2].getBoundingClientRect().top; }), '390 px index: three cards to a row');
	await shot(phA.page, 'phone_index_signed_out');
	await go(phA.page, '#/pokermon-jokers/848');
	A(await noHScroll(phA.page) && !(await phA.page.$('.pj-owner')), '390 px card, signed out: no horizontal scroll, no box');
	await shot(phA.page, 'phone_card_signed_out');
	await phA.ctx.close();
	const phO = await open(owner, 'mgibbie', 390, 844);
	await go(phO.page, '#/pokermon-jokers/733');
	A(await waitFor(() => phO.page.$$eval('.pj-design', d => d.length === 1), 5000) && await noHScroll(phO.page), '390 px card, owner: the box and the filed design fit with no horizontal scroll');
	A(await phO.page.evaluate(() => { const b = document.querySelector('.pj-owner').getBoundingClientRect(); return b.left >= 0 && b.right <= window.innerWidth; }), '390 px: the owner box sits inside the screen');
	await phO.page.evaluate(() => document.querySelector('.pj-owner').scrollIntoView());
	await shot(phO.page, 'phone_card_owner');
	await phO.ctx.close();
} catch (e) {
	fail++;
	console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => { });
	if (server) server.kill();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
