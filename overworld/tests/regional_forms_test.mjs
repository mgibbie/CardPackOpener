// regional_forms_test.mjs — regional forms play like themselves.
//
// 1. MOVEPOOLS. All 58 regional forms ran their BASE species' moves: Alolan Vulpix
//    learned Ember and Flamethrower and could not be taught Ice Beam, because
//    species_battle.json copied the base learnset and tm_learnsets.json never matched
//    a form id. Each form's learnset must now be its Showdown one (regional_forms_data.js,
//    re-checked against the vendored learnsets.ts when the Reference folder is present),
//    modulo the moves this engine lacks (UNIMPLEMENTED -> MOVE_SUBS or dropped).
// 2. REGIONAL EVOLUTIONS via a held ALOLA / GALAR / HISUI CHARM: every base -> regional
//    branch, with and without the charm (the charm is held, not consumed); regional
//    lines evolve within their region; the three lines that could not evolve at all
//    (Galarian Farfetch'd, Galarian Yamask, Hisuian Qwilfish) now can.
// 3. The charms are picked up on JohKanto's postgame routes, persist across a reload
//    (bag, held item, collected record), and battles use the new moves.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/regional_forms_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8897;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, sprite, num) => ({
	speciesId, name, level: 60, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 140, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 }, maxHP: 140, curHP: 140,
	exp: 300000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite, num,
});
const PARTY = [mon('rattata', 'LEAD', 's608.png', 19), mon('pidgey', 'BENCH', 's16.png', 16)];
const STORY = { flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} };

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

// ---------- static checks (node) ----------
let data = null;
try { data = await import(pathToFileURL(path.join(ROOT, 'overworld/regional_forms_data.js')).href); } catch {}
A(!!data?.SOURCE, 'regional_forms_data.js exists and exports each form\'s Showdown SOURCE');
const species = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
const FORMS = Object.keys(species).filter(id => /_(alola|galar|hisui|paldea)(_|$)/.test(id)).sort();
A(FORMS.length === 58, `58 regional forms in the battle data (${FORMS.length})`);
if (data?.SOURCE) {
	A(FORMS.every(id => data.SOURCE[id]?.level?.length), 'every form has a SOURCE level-up learnset',
		FORMS.filter(id => !data.SOURCE[id]?.level?.length).join(','));
	A(JSON.stringify(data.UNIMPLEMENTED.map(u => [u.move, u.sub])) === JSON.stringify([['eeriespell', 'extrasensory']]),
		'the only Showdown move this engine lacks is EERIE SPELL, mapped to EXTRASENSORY', JSON.stringify(data.UNIMPLEMENTED));
	// the vendored Showdown file, when present (CI has no Reference folder)
	const REF = process.env.MAGEPUNK_REF || [path.resolve(ROOT, '..', 'Magepunk66', 'Reference'), path.resolve(ROOT, '..', '..', '..', 'Magepunk66', 'Reference')]
		.find(p => fs.existsSync(path.join(p, 'pokemon-showdown-master/data/learnsets.ts')));
	if (REF) {
		const src = fs.readFileSync(path.join(REF, 'pokemon-showdown-master/data/learnsets.ts'), 'utf8').replace(/\r/g, '');
		const block = key => {
			const at = src.indexOf(`\n\t${key}: {\n`);
			if (at < 0) return null;
			const end = src.indexOf('\n\t},\n', at);
			const ls = {};
			for (const m of src.slice(at, end).matchAll(/\n\t{3}([a-z0-9]+): \[([^\]]*)\]/g)) ls[m[1]] = m[2].replace(/"/g, '').split(',').map(s => s.trim()).filter(Boolean);
			return ls;
		};
		const bad = [];
		for (const id of FORMS) {
			const ls = block((id === 'darmanitan_galar_zen' ? 'darmanitan_galar' : id).replace(/_/g, ''));
			const s = data.SOURCE[id];
			const lv = Object.entries(ls).flatMap(([m, c]) => c.filter(x => x.startsWith(s.gen + 'L')).map(x => +x.slice(2) + ':' + m)).sort();
			const ours = s.level.map(([l, m]) => l + ':' + m).sort();
			const tm = Object.keys(ls).filter(m => ls[m].some(c => /^\d[MT]$/.test(c))).sort();
			const newest = Math.max(...Object.values(ls).flat().filter(c => /^\dL/.test(c)).map(c => +c[0]));
			if (JSON.stringify(lv) !== JSON.stringify(ours) || JSON.stringify(tm) !== JSON.stringify(s.tm) || newest !== s.gen) bad.push(id);
		}
		A(!bad.length, 'SOURCE matches Showdown learnsets.ts for all 58 forms (newest-gen level-up + any-gen machine/tutor)', bad.join(','));
	} else console.log('skip - Showdown reference absent (CI): SOURCE-vs-learnsets.ts cross-check');
}
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/item_icons_index.json'), 'utf8'));
for (const r of ['alola', 'galar', 'hisui']) {
	const f = index[r + 'charm'];
	const file = f && path.join(ROOT, 'overworld/item_icons', f);
	const png = file && fs.existsSync(file) ? fs.readFileSync(file) : null;
	A(png && png.readUInt32BE(16) === 24 && png.readUInt32BE(20) === 24, `${r.toUpperCase()} CHARM has a real 24x24 bag icon (${f})`);
}

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
	// seed only a FRESH profile: the reload below must keep what the game saved
	await page.evaluateOnNewDocument((st, party, story) => {
		if (localStorage.getItem('magepunk_party_v1')) return;
		localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_story', JSON.stringify(story));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
	}, STATE, PARTY, STORY);
	const boot = async () => {
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		return waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.party?.length >= 2)), 40000);
	};
	const ready = await boot();
	A(ready, 'boot with a party');
	if (!ready) throw new Error('boot failed');

	// ---------- 1. movepools ----------
	const ls = await page.evaluate(async () => {
		const ow = window.__ow, d = ow.battle.data;
		let RF = null;
		try { RF = await import('/overworld/regional_forms_data.js'); } catch { return { missing: true }; }
		const map = m => d.moves[m] ? m : (RF.MOVE_SUBS[m] && d.moves[RF.MOVE_SUBS[m]] ? RF.MOVE_SUBS[m] : null);
		const badLevel = [], badTm = [], badLearn = [];
		for (const [id, src] of Object.entries(RF.SOURCE)) {
			const want = [], seen = new Set();
			for (const [lv, m] of src.level) { const mm = map(m); if (mm && !seen.has(lv + ':' + mm)) { seen.add(lv + ':' + mm); want.push([lv, mm]); } }
			if (JSON.stringify(d.species[id]?.learnset) !== JSON.stringify(want)) badLevel.push(id);
			const tm = [...new Set(src.tm.map(map).filter(Boolean))];
			const mon = { speciesId: id };
			if (!tm.every(m => ow.canLearn(mon, m))) badTm.push(id);
			// nothing outside the form's own pool: the base's leftovers are gone
			const pool = new Set([...want.map(x => x[1]), ...tm]);
			if ((d.extra[id]?.learn || []).some(m => !pool.has(m))) badLearn.push(id);
		}
		const v = { speciesId: 'vulpix_alola' };
		return {
			badLevel, badTm, badLearn,
			vulpix1: d.species.vulpix_alola.learnset.filter(([l]) => l <= 1).map(x => x[1]),
			vulpixEmber: d.species.vulpix_alola.learnset.some(x => x[1] === 'ember'),
			icebeam: ow.canLearn(v, 'icebeam'), flamethrower: ow.canLearn(v, 'flamethrower'),
			baseVulpix: d.species.vulpix.learnset.some(x => x[1] === 'ember'),
			slowking: d.species.slowking_galar.learnset.filter(x => x[1] === 'extrasensory' || x[1] === 'eeriespell').map(x => x[1]),
			growlithe: d.species.growlithe_hisui.learnset.some(x => d.moves[x[1]].type === 'Rock'),
			zen: JSON.stringify(d.species.darmanitan_galar_zen.learnset) === JSON.stringify(d.species.darmanitan_galar.learnset),
		};
	});
	A(!ls.missing && !ls.badLevel?.length, 'every form\'s level-up learnset is its Showdown one (modulo unimplemented moves)', JSON.stringify(ls.badLevel || ls));
	A(!ls.missing && !ls.badTm?.length, 'every form can be taught every one of its Showdown machine/tutor moves', JSON.stringify(ls.badTm));
	A(!ls.missing && !ls.badLearn?.length, 'no form keeps a base-species move outside its own pool', JSON.stringify(ls.badLearn));
	A(ls.vulpix1?.includes('powdersnow') && !ls.vulpixEmber, 'Alolan Vulpix starts with POWDER SNOW and never learns EMBER', JSON.stringify(ls.vulpix1));
	A(ls.icebeam === true && ls.flamethrower === false, 'Alolan Vulpix can be taught ICE BEAM, not FLAMETHROWER', JSON.stringify([ls.icebeam, ls.flamethrower]));
	A(ls.baseVulpix === true, 'Kanto Vulpix keeps its own learnset (EMBER)');
	A(ls.slowking?.includes('extrasensory') && !ls.slowking.includes('eeriespell'), 'Galarian Slowking\'s EERIE SPELL runs as EXTRASENSORY', JSON.stringify(ls.slowking));
	A(ls.growlithe === true, 'Hisuian Growlithe learns Rock moves');
	A(ls.zen === true, 'Galarian Darmanitan Zen shares Galarian Darmanitan\'s learnset (Showdown has none of its own)');

	// battles use the new moves: a wild Alolan Vulpix knows ice moves
	const fight = await page.evaluate(async () => {
		const ow = window.__ow;
		ow.battle.start(ow.party, 'vulpix_alola', 30, () => {});
		for (let i = 0; i < 100 && !ow.battle.active; i++) await new Promise(r => setTimeout(r, 100));
		const foe = ow.battle.active?.foe;
		const out = { moves: foe?.moves.map(m => m.id), types: foe?.moves.map(m => ow.battle.data.moves[m.id]?.type) };
		if (ow.battle.active) ow.battle.active = null;
		ow.battle._starting = false;
		return out;
	});
	A(fight.moves?.length && !fight.moves.includes('ember') && fight.types.includes('Ice'),
		'a wild Lv30 Alolan Vulpix battles with its own (Ice) moves', JSON.stringify(fight));

	// ---------- 2. evolutions ----------
	const evo = await page.evaluate(async () => {
		const ow = window.__ow, d = ow.battle.data, ev = ow.evolution;
		let MK = null, RF = null;
		try { MK = await import('/overworld/ow_menukeys.js'); RF = await import('/overworld/regional_forms_data.js'); } catch { return { missing: true }; }
		if (!MK.itemEvoFor) return { missing: true };
		const mk = (id, lv, held, extra) => Object.assign({ speciesId: id, level: lv, heldItem: held || null, friend: 70, curHP: 100, maxHP: 100, moves: [{ id: 'tackle' }] }, extra || {});
		// the level-up check's choice (the queue), without running the animation
		const levelTarget = m => { ev.queue = []; ev.cur = null; const nx = ev.next; ev.next = () => {}; ev.check([m], d); ev.next = nx; const t = ev.queue[0]?.target || null; ev.queue = []; return t; };
		const r = {};
		const CASES = [
			['pikachu', 'item', 'thunderstone', 'raichu', 'raichu_alola', 'alolacharm'],
			['exeggcute', 'item', 'leafstone', 'exeggutor', 'exeggutor_alola', 'alolacharm'],
			['petilil', 'item', 'sunstone', 'lilligant', 'lilligant_hisui', 'hisuicharm'],
			['cubone', 'level', 28, 'marowak', 'marowak_alola', 'alolacharm'],
			['koffing', 'level', 35, 'weezing', 'weezing_galar', 'galarcharm'],
			['quilava', 'level', 36, 'typhlosion', 'typhlosion_hisui', 'hisuicharm'],
			['dewott', 'level', 36, 'samurott', 'samurott_hisui', 'hisuicharm'],
			['dartrix', 'level', 36, 'decidueye', 'decidueye_hisui', 'hisuicharm'],
			['rufflet', 'level', 54, 'braviary', 'braviary_hisui', 'hisuicharm'],
			['goomy', 'level', 40, 'sliggoo', 'sliggoo_hisui', 'hisuicharm'],
			['bergmite', 'level', 37, 'avalugg', 'avalugg_hisui', 'hisuicharm'],
			['mimejr', 'move', 'mimic', 'mrmime', 'mrmime_galar', 'galarcharm'],
		];
		ow.Clock.setHour(22); // night: Cubone's Alolan branch is night-only
		const rows = [];
		for (const [id, kind, p, plain, regional, charm] of CASES) {
			const other = charm === 'hisuicharm' ? 'alolacharm' : 'hisuicharm';
			const pick = held => {
				if (kind === 'item') return MK.itemEvoFor(mk(id, 50, held), p)?.target || null;
				if (kind === 'level') return levelTarget(mk(id, p, held));
				return levelTarget(mk(id, 50, held, { moves: [{ id: p }] }));
			};
			rows.push({ id, none: pick(null), charm: pick(charm), other: pick(other), plain, regional });
		}
		r.rows = rows;
		// every Showdown branch INTO a regional form is in the data, charm-tagged iff it leaves a non-regional species
		const reg = s => /_(alola|galar|hisui|paldea)(_|$)/.test(s);
		r.missingEdges = RF.SHOWDOWN_EVOS.filter(e => !(d.extra[e.from]?.evos || []).some(x => x.target === e.to
			&& (!!x.region === (!reg(e.from) && reg(e.to))))).map(e => e.from + '>' + e.to);
		// Cubone + ALOLA CHARM in the DAY: Alola's branch is night-only, so it waits
		ow.Clock.setHour(12);
		r.cuboneDay = levelTarget(mk('cubone', 28, 'alolacharm'));
		ow.Clock.clearOverride();
		// below the level: nothing
		r.quilava35 = levelTarget(mk('quilava', 35, 'hisuicharm'));
		// regional lines evolve within their region, charm or not
		r.vulpix = [MK.itemEvoFor(mk('vulpix_alola', 20), 'icestone')?.target, MK.itemEvoFor(mk('vulpix_alola', 20, 'galarcharm'), 'icestone')?.target];
		r.wooper = levelTarget(mk('wooper_paldea', 20));
		r.zigzag = levelTarget(mk('zigzagoon_galar', 20));
		// the three regional lines that had no evolution at all
		r.farfetchd = [levelTarget(mk('farfetchd_galar', 30, null, { battleCrits: 2 })), levelTarget(mk('farfetchd_galar', 30, null, { battleCrits: 3 }))];
		r.yamask = [levelTarget(mk('yamask_galar', 30, null, { curHP: 52 })), levelTarget(mk('yamask_galar', 30, null, { curHP: 51 })), levelTarget(mk('yamask_galar', 30, null, { curHP: 0 }))];
		r.qwilfish = [levelTarget(mk('qwilfish_hisui', 30)), levelTarget(mk('qwilfish_hisui', 30, null, { moves: [{ id: 'barbbarrage' }] }))];
		r.qwilLearns = d.species.qwilfish_hisui.learnset.some(x => x[1] === 'barbbarrage');
		r.mimeLearns = d.species.mimejr.learnset.some(x => x[1] === 'mimic');
		return r;
	});
	A(!evo.missing, 'itemEvoFor / REGIONAL data reachable');
	for (const row of evo.rows || []) {
		A(row.none === row.plain && row.charm === row.regional && row.other === row.plain,
			`${row.id}: no charm -> ${row.plain}, matching charm -> ${row.regional}, another region's charm -> ${row.plain}`, JSON.stringify(row));
	}
	A(evo.missingEdges && !evo.missingEdges.length, 'every Showdown evolution into/out of a regional form exists, charm-tagged only on base -> regional branches', JSON.stringify(evo.missingEdges));
	A(evo.cuboneDay === null, 'Cubone holding the ALOLA CHARM waits for night (canon: Alolan Marowak evolves at night)', String(evo.cuboneDay));
	A(evo.quilava35 === null, 'Quilava below Lv36 does not evolve, charm or not');
	A(evo.vulpix?.[0] === 'ninetales_alola' && evo.vulpix[1] === 'ninetales_alola', 'Alolan Vulpix + Ice Stone -> Alolan Ninetales, with or without a charm', JSON.stringify(evo.vulpix));
	A(evo.wooper === 'clodsire', 'Paldean Wooper -> Clodsire at Lv20', String(evo.wooper));
	A(evo.zigzag === 'linoone_galar', 'Galarian Zigzagoon -> Galarian Linoone', String(evo.zigzag));
	A(JSON.stringify(evo.farfetchd) === JSON.stringify([null, 'sirfetchd']), 'Galarian Farfetch\'d -> Sirfetch\'d after 3 critical hits in a battle (not 2)', JSON.stringify(evo.farfetchd));
	A(JSON.stringify(evo.yamask) === JSON.stringify([null, 'runerigus', null]), 'Galarian Yamask -> Runerigus with 49+ HP lost, never when fainted', JSON.stringify(evo.yamask));
	A(JSON.stringify(evo.qwilfish) === JSON.stringify([null, 'overqwil']) && evo.qwilLearns, 'Hisuian Qwilfish -> Overqwil once it knows BARB BARRAGE (which it learns)', JSON.stringify(evo.qwilfish));
	A(evo.mimeLearns === true, 'Mime Jr. learns MIMIC, so its move evolution is reachable');

	// the whole sequence: Quilava holding the HISUI CHARM; the charm stays held, the ability follows the species
	const seq = await page.evaluate(async () => {
		const ow = window.__ow, d = ow.battle.data, ev = ow.evolution;
		const { buildMon } = await import('/overworld/battle.js');
		const m = buildMon('quilava', 36, d);
		m.heldItem = 'hisuicharm';
		m.ability = d.abilities.quilava[0];
		ev.queue = []; ev.cur = null;
		ev.check([m], d);
		for (let i = 0; i < 50 && !ev.cur; i++) await new Promise(r => setTimeout(r, 100));
		for (let i = 0; i < 200 && ev.cur; i++) { ev.update(0.1); await new Promise(r => setTimeout(r, 5)); }
		return { id: m.speciesId, held: m.heldItem, ability: m.ability, legal: d.abilities.typhlosion_hisui, types: m.types };
	});
	A(seq.id === 'typhlosion_hisui' && seq.held === 'hisuicharm', 'Quilava + HISUI CHARM at Lv36 evolves into Hisuian Typhlosion and still holds the charm', JSON.stringify(seq));
	A(seq.legal?.includes(seq.ability) && seq.types?.includes('Ghost'), 'the evolved mon has a Hisuian Typhlosion ability and Fire/Ghost typing', JSON.stringify(seq));

	// battle.js counts critical hits on the attacker for Sirfetch'd
	const crit = await page.evaluate(async () => {
		const ow = window.__ow, d = ow.battle.data;
		const { buildMon } = await import('/overworld/battle.js');
		const f = buildMon('farfetchd_galar', 40, d);
		f.battleCrits = 7; // stale count from an earlier battle: a new battle resets it
		ow.battle.start([f, ...ow.party], 'magikarp', 5, () => {});
		for (let i = 0; i < 100 && !ow.battle.active; i++) await new Promise(r => setTimeout(r, 100));
		const a = ow.battle.active;
		if (!a) return { noBattle: true };
		const reset = f.battleCrits || 0;
		a.me.laserFocus = true; // a certain crit
		const mv = a.me.moves.find(m => d.moves[m.id]?.power > 0) || a.me.moves[0];
		ow.battle.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, mv, false);
		const after = f.battleCrits || 0;
		ow.battle.active = null; ow.battle._starting = false;
		return { reset, after, move: mv.id };
	});
	A(crit.reset === 0 && crit.after >= 1, 'a critical hit is counted on the attacker, from zero each battle', JSON.stringify(crit));

	// ---------- 3. charms on JohKanto's postgame routes ----------
	const SPOTS = [['JohKantoRoute14', 'MAP_JOHKANTO_ROUTE_14', 'alolacharm'], ['JohKantoRoute13', 'MAP_JOHKANTO_ROUTE_13', 'galarcharm'], ['JohKantoRoute10North', 'MAP_JOHKANTO_ROUTE_10_NORTH', 'hisuicharm']];
	const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));
	const regionOf = id => Object.entries(regions).find(([, v]) => Array.isArray(v) && v.some(m => m.id === id))?.[0] || null;
	for (const [stem, mapId, item] of SPOTS) {
		A(/JOHKANTO/.test(String(regionOf(mapId) || '')), `${mapId} is a JohKanto (Grand-Champion-only) map`, String(regionOf(mapId)));
		const got = await page.evaluate(async (stem, mapId, item) => {
			const ow = window.__ow, w = ow.world;
			await ow.moveToMap(stem);
			for (let i = 0; i < 60 && w.current?.map?.id !== mapId; i++) await new Promise(r => setTimeout(r, 100));
			const ball = ow.items.balls.find(b => b.id === item);
			if (!ball) return { noBall: true, map: w.current?.map?.id };
			// reachable from the map's edges, and the solid ball cuts no path
			const W = w.current.layout.width, H = w.current.layout.height;
			const flood = skip => {
				const blk = (x, y) => !w.isPassable(x, y) || ow.npcs.occupied?.(x, y) || (x === skip.tx && y === skip.ty) || ow.items.balls.some(b => !b.hidden && b !== ball && b.tx === x && b.ty === y);
				const seen = new Set(), q = [];
				for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && !blk(x, y)) { seen.add(x + ',' + y); q.push([x, y]); }
				while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(k) || blk(nx, ny)) continue; seen.add(k); q.push([nx, ny]); } }
				return seen;
			};
			const open = flood({ tx: -1, ty: -1 }), shut = flood(ball);
			const reachable = open.has(ball.tx + ',' + ball.ty);
			const cut = [...open].filter(k => k !== ball.tx + ',' + ball.ty && !shut.has(k)).length;
			const before = ow.Bag.getBag()[item] || 0;
			const msg = ow.items.interactAt(ball.tx, ball.ty);
			return { reachable, cut, msg, before, after: ow.Bag.getBag()[item] || 0, solidBefore: true, name: ow.Bag.nameOf(item) };
		}, stem, mapId, item);
		A(!got.noBall, `${stem}: the ${item.toUpperCase()} ball is placed`, JSON.stringify(got));
		A(got.reachable && got.cut === 0, `${stem}: the ball sits on a reachable tile and blocks no path`, JSON.stringify(got));
		A(got.after === got.before + 1 && /CHARM!$/.test(got.msg || ''), `${stem}: picking it up gives the charm`, JSON.stringify(got));
	}
	// hold the ALOLA CHARM on the lead, as the bag's give flow does, and save
	const held = await page.evaluate(async () => {
		const ow = window.__ow, Bag = ow.Bag;
		const { saveParty } = await import('/overworld/party.js');
		Bag.consume('alolacharm');
		ow.party[0].heldItem = 'alolacharm';
		saveParty(ow.party);
		return { bag: Bag.getBag().alolacharm || 0, kind: Bag.ITEMS.alolacharm?.kind, price: Bag.ITEMS.alolacharm?.price,
			region: Bag.ITEMS.galarcharm?.held?.evoRegion, sold: Bag.SHOP_STOCK.includes('alolacharm') };
	});
	A(held.kind === 'held' && held.price === 0 && !held.sold && held.region === 'galar', 'the charms are held items, not for sale, carrying held.evoRegion', JSON.stringify(held));

	// ---------- save round-trip: a reload keeps the bag, the held charm and the pickups ----------
	const okReload = await boot();
	A(okReload, 'reboot after saving');
	const after = await page.evaluate(async () => {
		const ow = window.__ow;
		const { OW_KEYS } = await import('/overworld/ow_saves.js');
		await ow.moveToMap('JohKantoRoute14');
		for (let i = 0; i < 60 && ow.world.current?.map?.id !== 'MAP_JOHKANTO_ROUTE_14'; i++) await new Promise(r => setTimeout(r, 100));
		return { lead: ow.party[0].heldItem, galar: ow.Bag.getBag().galarcharm || 0, hisui: ow.Bag.getBag().hisuicharm || 0,
			ballBack: ow.items.balls.some(b => b.id === 'alolacharm'),
			synced: ['magepunk_bag_v1', 'magepunk_party_v1', 'magepunk_collected_v1'].every(k => OW_KEYS.includes(k)) };
	});
	A(after.lead === 'alolacharm' && after.galar === 1 && after.hisui === 1, 'after a reload the lead still holds the ALOLA CHARM and the bag still has the other two', JSON.stringify(after));
	A(after.ballBack === false, 'a picked-up charm ball does not come back');
	A(after.synced === true, 'bag, party and collected record are all in the cloud-synced save keys');

	A(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	A(false, 'test threw: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
