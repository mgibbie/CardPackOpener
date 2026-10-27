// designwiki_pokermon_jokers_test.mjs — the design wiki's "Pokermon jokers not in the game yet" section
// (designwiki/#/pokermon-jokers; data/pokermon_jokers.json from tools/micatro/gen_designwiki_pokermon_jokers.mjs, art from
// tools/micatro/compose_missing_pokermon_jokers.mjs, the owner's designs via server/mp.mjs joker-design-*).
//   DATA  the committed list is EXACTLY the canonical species (dex 1-1025) with no joker in Pokermon / Nacho / Pokermon+,
//         recomputed from the mods as the game registers them (a mod upgrade that adds jokers fails this until the list is
//         regenerated); no listed species has a joker (by name) in any of the three, and every species they do cover is
//         off the list; listed + covered = 1025; the type table is the mods' own majority (primary type -> ptype)
//   ART   the art script re-composes every listed species (normal + Shiny) byte-identical to the committed PNGs, and none
//         is blank: 142 x 190, opaque, many colours, and the battle sprite painted 100+ pixels onto the card
//   WIKI  (the real dev server: real auth + the joker-design actions on a fresh sqlite) the index lists every species, grouped
//         by generation, with working generation / type / search filters; a card page shows its art (+ Shiny), name, dex,
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

let server, browser;
try {
	// ================================================================== DATA
	const PM = await imp('tools/micatro/pokermon_missing_jokers.mjs');
	const M = await PM.computeMissing({ fresh: true });
	const listed = D.species.map(s => s.dex);
	A(JSON.stringify(listed) === JSON.stringify(M.missing.map(s => s.dex)), `the committed list is exactly the mods' missing set (${listed.length})`,
		'committed-only: ' + listed.filter(d => !M.missing.some(s => s.dex === d)).join(',') + ' / mods-missing-only: ' + M.missing.filter(s => !listed.includes(s.dex)).map(s => s.dex).join(','));
	A(listed.every((d, i) => Number.isInteger(d) && d >= 1 && d <= 1025 && (!i || d > listed[i - 1])), 'dex numbers 1..1025, ascending, no duplicates (no fakemon)');
	const fields = ['key', 'name', 'gen', 'ptype', 'stage', 'rarity', 'cost'];
	const drift = D.species.filter(s => { const m = M.missing.find(x => x.dex === s.dex); return !m || fields.some(f => JSON.stringify(m[f]) === undefined || JSON.stringify(m[f]) !== JSON.stringify(s[f])) || JSON.stringify(m.line) !== JSON.stringify(s.line) || JSON.stringify(m.types) !== JSON.stringify(s.types); });
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
	A(['Bulbasaur', 'Pikachu', 'Mewtwo'].every(n => !D.species.some(s => s.name === n)) && D.species.some(s => s.name === 'Whismur'), 'spot check: Bulbasaur / Pikachu / Mewtwo have jokers, Whismur does not');
	// the type table is the mods' own majority (every primary type that has a clear one; Flying has none upstream)
	const badTypes = Object.entries(M.typeVotes).filter(([t, v]) => {
		if (t === 'Flying') return false;
		const [best] = Object.entries(v).sort((a, b) => b[1] - a[1]);
		return PM.TYPE_TO_PTYPE[t] !== best[0];
	});
	A(!badTypes.length, 'TYPE_TO_PTYPE = the majority of upstream ptypes per primary type', JSON.stringify(badTypes));
	A(D.species.every(s => PM.ptypeOf(s.types) === s.ptype && (s.types[0] === 'Flying' || Object.keys(D.conventions.typeToPtype).includes(s.types[0]))), 'each ptype follows from the primary type (Flying: the second type)');
	A(D.species.every(s => ['Basic', 'One', 'Two', 'Baby', 'Legendary'].includes(s.stage) && s.line.some(l => l.dex === s.dex)), 'every species has an upstream stage and sits in its own line');
	const sp = (n) => D.species.find(s => s.name === n);
	A(sp('Exploud')?.stage === 'Two' && sp('Loudred')?.stage === 'One' && sp('Toxel')?.stage === 'Baby' && sp('Arceus')?.stage === 'Legendary' && sp('Corviknight')?.ptype === 'Metal' && sp('Noibat')?.ptype === 'Dragon',
		'spot check: Exploud Stage 2, Loudred Stage 1, Toxel Baby, Arceus Legendary, Corviknight Metal, Noibat Dragon');

	// ================================================================== ART
	const C = await imp('tools/micatro/compose_pokermon_joker_art.mjs');
	const MJ = await imp('tools/micatro/compose_missing_pokermon_jokers.mjs');
	const ctx = await MJ.loadContext();
	let same = 0, blank = [], differs = [], thin = [];
	const t0 = Date.now();
	for (const s of ctx.M.missing) {
		const r = MJ.composeSpecies(ctx, s);
		for (const v of ['normal', 'shiny']) {
			const file = path.join(ROOT, 'designwiki', s.dex && (v === 'normal' ? D.species.find(x => x.dex === s.dex).art.normal : D.species.find(x => x.dex === s.dex).art.shiny));
			const bytes = C.encode(C.CELL_W, C.CELL_H, r[v]);
			if (fs.existsSync(file) && fs.readFileSync(file).equals(bytes)) same++; else differs.push(s.dex + ' ' + v);
			if (r[v + 'Painted'] < 100) thin.push(`${s.dex} ${v} (${r[v + 'Painted']})`);
			if (fs.existsSync(file)) {
				const img = C.decode(file);
				const colours = new Set(), art = new Set();
				let opaque = 0;
				for (let i = 0; i < img.w * img.h; i++) {
					const v32 = img.rgba.readUInt32LE(i * 4);
					if (img.rgba[i * 4 + 3] === 255) opaque++;
					colours.add(v32);
					const x = (i % img.w) >> 1, y = ((i / img.w) | 0) >> 1;
					if (C.inArt(x, y)) art.add(v32);
				}
				if (img.w !== 142 || img.h !== 190 || opaque < img.w * img.h * 0.9 || colours.size < 24 || art.size < 8) blank.push(`${s.dex} ${v}: ${img.w}x${img.h} opaque ${opaque} colours ${colours.size} art ${art.size}`);
			}
		}
	}
	A(D.species.every(s => s.art && fs.existsSync(path.join(ROOT, 'designwiki', s.art.normal)) && fs.existsSync(path.join(ROOT, 'designwiki', s.art.shiny))), 'every listed species has a normal + Shiny card in designwiki/sprites/pokermon_jokers/');
	A(!differs.length && same === listed.length * 2, `the art script re-composes all ${listed.length * 2} cards byte-identical (${Math.round((Date.now() - t0) / 1000)} s)`, differs.slice(0, 8).join(', '));
	A(!blank.length, 'no card is blank (142 x 190, 90%+ opaque — the corners are rounded —, 24+ colours, 8+ in the art window)', blank.slice(0, 5).join(' | '));
	A(!thin.length, 'the battle sprite painted 100+ pixels onto every card', thin.slice(0, 8).join(', '));
	const extra = fs.readdirSync(path.join(ROOT, 'designwiki/sprites/pokermon_jokers')).filter(f => !D.species.some(s => s.art.normal.endsWith('/' + f) || s.art.shiny.endsWith('/' + f)));
	A(!extra.length, 'no stale card art for species that now have jokers', extra.join(', '));

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
	await anon.page.type('#pjQ', 'whis');
	A(await waitFor(async () => (await anon.page.$$eval('.pj-tile', ts => ts.map(t => t.textContent))).join('|').match(/Whismur/) && await tiles(anon.page) === D.species.filter(s => /whis/i.test(s.name)).length, 4000), 'search by name');
	await anon.page.evaluate(() => { const q = document.getElementById('pjQ'); q.value = ''; q.dispatchEvent(new Event('input')); });
	await anon.page.type('#pjQ', '#0848');
	A(await waitFor(async () => await tiles(anon.page) === 1 && /Toxel/.test(await anon.page.$eval('.pj-tile', t => t.textContent)), 4000), 'search by dex number (#0848 = Toxel)');
	await go(anon.page, '#/pokermon-jokers');
	await shot(anon.page, 'desktop_index_signed_out');
	await go(anon.page, '#/pokermon-jokers/295');
	const card = await anon.page.evaluate(() => ({
		h1: document.querySelector('.pj-page h1')?.textContent, img: document.querySelector('.pj-art-big')?.naturalWidth, src: document.querySelector('.pj-art-big')?.getAttribute('src'),
		facts: document.querySelector('.pj-facts')?.textContent, line: [...document.querySelectorAll('.pj-line li')].map(l => l.textContent), box: !!document.querySelector('.pj-owner, #pjSubmit'),
		nullText: [...document.getElementById('content').childNodes].some(n => n.nodeType === 3 && /^\s*(null|undefined)\s*$/.test(n.textContent)),
	}));
	A(card.h1 === 'Exploud #0295' && card.img === 142 && /0295\.png$/.test(card.src), 'a card page shows the name, dex and its composed art', JSON.stringify(card));
	A(/Colorless/.test(card.facts) && /Stage 2/.test(card.facts) && JSON.stringify(card.line) === '["Whismur","Loudred","Exploud"]', 'type, stage and evolution line', JSON.stringify(card));
	A(!card.box, 'signed out: no Submit design box');
	A(!card.nullText, 'no stray null / undefined text where the box would be');
	await anon.page.click('.pj-flip');
	A(/0295_shiny\.png$/.test(await anon.page.$eval('.pj-art-big', i => i.getAttribute('src'))), 'the Shiny toggle swaps in the Shiny card');
	await shot(anon.page, 'desktop_card_signed_out');
	A(!anon.designCalls.length, 'signed out: the page never calls the joker-design API', anon.designCalls.join(','));
	A(!anon.errors.length, 'no console errors (signed out)', anon.errors.slice(0, 3).join(' | '));
	await anon.ctx.close();

	// ---------- a non-owner: no box ----------
	const pe = await open(peon, 'pjpeon');
	await go(pe.page, '#/pokermon-jokers/295');
	A(!(await pe.page.$('.pj-owner')) && !(await pe.page.$('#pjSubmit')), 'a non-owner: no Submit design box');
	await go(pe.page, '#/pokermon-jokers');
	A(!pe.designCalls.length, 'a non-owner: the page never calls the joker-design API', pe.designCalls.join(','));
	await pe.ctx.close();

	// ---------- the owner: box, submission round-trip ----------
	const ow = await open(owner, 'mgibbie');
	await go(ow.page, '#/pokermon-jokers/295');
	A(await ow.page.$('.pj-owner #pjSubmit') !== null, 'the owner sees the Submit design box');
	A(await ow.page.$eval('#pjRarity', s => s.value) === D.species.find(s => s.dex === 295).rarityLabel, 'the rarity defaults to the guess');
	const typed = { ability: 'Retrigger every scored 3\nGains X0.5 Mult per Loudred sold', rarity: 'Rare', cost: '9', notes: 'Shiny: X2 instead' };
	await ow.page.type('#pjAbility', typed.ability);
	await ow.page.select('#pjRarity', typed.rarity);
	await ow.page.type('#pjCost', typed.cost);
	await ow.page.type('#pjNotes', typed.notes);
	await ow.page.click('#pjSubmit');
	A(await waitFor(() => ow.page.$eval('.pj-msg', m => /filed ✓ \(1 design in the joker design list\)/.test(m.textContent)), 8000), 'submitting shows the confirmation', await ow.page.$eval('.pj-msg', m => m.textContent));
	const srv = await api('joker-design-list', {}, owner);
	const got = srv.designs && srv.designs[0];
	A(srv.designs?.length === 1 && got.dex === 295 && got.name === 'Exploud' && got.ability === typed.ability && got.rarity === 'Rare' && got.cost === 9 && got.notes === typed.notes,
		'the server holds exactly what was typed (owner_todo:jokers)', JSON.stringify(srv));
	A(await waitFor(() => ow.page.$$eval('.pj-design', ds => ds.length === 1 && ds[0].textContent.includes('Retrigger every scored 3')), 5000), 'the filed design shows on the card');
	A(await ow.page.$eval('#pjAbility', t => t.value) === '', 'the box clears after filing');
	await go(ow.page, '#/pokermon-jokers/295');
	A(await waitFor(() => ow.page.$$eval('.pj-design', ds => ds.length === 1 && /Rare/.test(ds[0].textContent) && /\$9/.test(ds[0].textContent) && /Shiny: X2/.test(ds[0].textContent)), 5000), 'after a reload the design is still listed, read-only (rarity, cost, notes)');
	A(await ow.page.$$eval('.pj-design textarea, .pj-design input', x => x.length) === 0, 'the filed designs are read-only');
	await ow.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await shot(ow.page, 'desktop_card_owner');
	await go(ow.page, '#/pokermon-jokers');
	A(await waitFor(() => ow.page.$eval('.pj-tile[data-dex="295"] .pj-designed', e => e.textContent === '✎ 1'), 5000), 'the index marks the tile the owner designed');
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
	await go(phO.page, '#/pokermon-jokers/295');
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
