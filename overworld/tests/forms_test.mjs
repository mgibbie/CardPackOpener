// forms_test.mjs — alternate forms: right artwork, and obtainable.
//
// TWO bugs, one root. species_battle.json derives a sprite id from the DEX NUMBER
// (`s{num*32}.png`), and a form shares its base's number — so all 103 alternate
// forms carried the BASE species' picture. Alolan Vulpix drew as a fire Vulpix in
// battle, in the party, in the Pokedex, and on the design wiki. The real art was
// shipped the whole time: `data/pokemon` holds 331 sprites that are not multiples
// of 32 and that NO species referenced, numbered `num*32 + formeOrder index`.
//
// The design wiki compounded it by serving its OWN copy of the sprite folder that
// nothing kept in sync, so even a corrected reference would have 404'd and its
// onerror handler would have silently removed the image.
//
// And obtainability: forms are transformations, not catches. Regional variants
// are real wild POKeMON and get route slots; the rest are what a species BECOMES,
// and the RIFT PRISM cycles them.
//
// Standalone (node only):
//   node overworld/tests/forms_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const bat = JSON.parse(fs.readFileSync(path.join(D, 'species_battle.json'), 'utf8'));
const ALL = Object.keys(bat).filter(k => !k.startsWith('_'));
const baseByNum = new Map();
for (const id of ALL) { const n = bat[id].num; if (n > 0 && !/_/.test(id) && !baseByNum.has(n)) baseByNum.set(n, id); }
const forms = ALL.filter(id => /_/.test(id) && bat[id].num > 0 && baseByNum.has(bat[id].num) && baseByNum.get(bat[id].num) !== id);

// ---------- sprites ----------
A(forms.length > 90, `${forms.length} alternate forms in the dex`, String(forms.length));
const sharing = forms.filter(id => bat[id].sprite === bat[baseByNum.get(bat[id].num)].sprite);
A(sharing.length === 0, 'no form still wears its base species\' sprite',
	`${sharing.length}: ${sharing.slice(0, 5).join(',')}`);

const missingArt = forms.filter(id => !fs.existsSync(path.join(D, 'pokemon', bat[id].sprite || '')));
A(missingArt.length === 0, 'every form sprite file actually exists', missingArt.slice(0, 5).join(','));

// the numbering rule, spot-checked against known values
for (const [id, want] of [['vulpix_alola', 's1185.png'], ['rotom_wash', 's15330.png'], ['zapdos_galar', 's4641.png']]) {
	A(bat[id]?.sprite === want, `${id} points at ${want}`, bat[id]?.sprite);
}
// and the art is genuinely different, not the same bytes under a new name
const size = f => fs.statSync(path.join(D, 'pokemon', f)).size;
A(size(bat.vulpix_alola.sprite) !== size(bat.vulpix.sprite), 'Alolan Vulpix is a different picture from Vulpix');

// ---------- the design wiki serves what it references ----------
const wiki = JSON.parse(fs.readFileSync(path.join(ROOT, 'designwiki/data/pokemon.json'), 'utf8'));
A(wiki.vulpix_alola?.sprite === bat.vulpix_alola.sprite, 'the wiki agrees with the game data', wiki.vulpix_alola?.sprite);
const wikiMissing = Object.values(wiki).map(p => p.sprite).filter(Boolean)
	.filter(f => !fs.existsSync(path.join(ROOT, 'designwiki/sprites', f)));
A(wikiMissing.length === 0, 'and ships every sprite it references — nothing 404s into a blank card',
	`${wikiMissing.length} missing, e.g. ${wikiMissing.slice(0, 4).join(',')}`);
A(/copyFileSync/.test(fs.readFileSync(path.join(ROOT, 'tools/gen_designwiki.mjs'), 'utf8')),
	'the wiki generator copies sprites now, so the folder cannot drift again');

// ---------- regional variants are wild ----------
const { POSTGAME } = await import('../encounters_postgame.js');
const inWild = new Set();
{
	const enc = JSON.parse(fs.readFileSync(path.join(D, 'encounters.json'), 'utf8'));
	for (const t of Object.values(enc)) for (const k of ['land', 'water', 'fishing', 'rock_smash'])
		for (const s of (t[k]?.slots || [])) inWild.add(s.id);
	for (const n of Object.values(POSTGAME)) {
		for (const ph of ['morning', 'day', 'night']) for (const s of (n.land?.[ph] || [])) inWild.add(s.id);
		for (const k of ['water', 'fishing']) for (const s of (n[k] || [])) inWild.add(s.id);
	}
}
const REGIONAL = /_(alola|galar|hisui|paldea)/;
const BATTLE_FORM = /_(zen|blade|school|core|noice|hangry|hero|complete|origin|therian|ultra|dawn_wings|dusk_mane)$/;
const regionals = forms.filter(id => REGIONAL.test(id) && !BATTLE_FORM.test(id));
const unwild = regionals.filter(id => !inWild.has(id));
A(unwild.length === 0, `all ${regionals.length} regional variants are catchable in the wild`, unwild.slice(0, 6).join(','));
// ...but a battle-only transformation must NOT be
A(!inWild.has('darmanitan_galar_zen'), 'Galarian Darmanitan-Zen is not in a grass table — it is a Zen Mode form');
A(!inWild.has('aegislash_blade'), 'nor is Aegislash-Blade');

// ---------- the RIFT PRISM ----------
const bag = fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
const dex = fs.readFileSync(path.join(ROOT, 'overworld/pokedex.js'), 'utf8');
A(/riftprism:\s*\{[^}]*kind: 'form'/.test(bag), 'the RIFT PRISM exists as a form item');
A(/'key'[\s\S]{0,120}'form'/.test(main), 'and lives in the KEY pocket');
A(/kind === 'form'/.test(main), 'the bag knows how to use it');
A(/\[300, 'riftprism'/.test(dex), 'it is a dex milestone reward at 300 caught, so it is reliably obtainable');
A(/function cycleForm/.test(main) && /Dex\.markCaught\(next\)/.test(main),
	'and using it registers the new form in the Pokedex');
// the swap must keep what the PLAYER earned and rebuild only what the species decides
for (const kept of ['mon.ivs', 'mon.level']) {
	A(main.includes('function cycleForm') && !new RegExp(`cycleForm[\\s\\S]{0,1200}?${kept.replace('.', '\\.')}\\s*=\\s*`).test(main),
		`cycleForm does not overwrite ${kept}`);
}
A(/cycleForm[\s\S]{0,1400}?mon\.name === oldName/.test(main), 'and it keeps a nickname');

// ---------- the point ----------
// families are linked by dex number, which is the only link the data has
const fam = ALL.filter(id => bat[id].num === bat.rotom.num);
A(fam.length === 6, 'ROTOM has six entries sharing its dex number', String(fam.length));
A(fam.filter(i => !i.includes('_')).length === 1, 'exactly one of them is the base');

// ---------- FIRING: actually shift a POKeMON in the running game ----------
// Everything above reads files. This drives the real cycleForm, because a form
// swap that leaves the mon's stats or types on the old species is invisible in
// the data and obvious in a battle.
{
	const { spawn: _s } = await import('child_process');   // eslint-disable-line no-unused-vars
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8919;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'vulpix', name: 'VULPIX', level: 40, gender: 'F', friend: 70, types: ['Fire'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 100, atk: 60, def: 60, spa: 70, spd: 70, spe: 80 }, maxHP: 100, curHP: 100,
		exp: 64000, moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }], sprite: 's1184.png', num: 37,
	}];
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
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
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		const shift = await page.evaluate(() => {
			const ow = window.__ow;
			const mon = ow.party[0];
			const before = { types: [...mon.types], lvl: mon.level, ivs: { ...mon.ivs } };
			const fam = ow.formsOf('vulpix');
			ow.cycleForm(mon);
			const after = { id: mon.speciesId, types: [...mon.types], sprite: mon.sprite, lvl: mon.level, ivs: { ...mon.ivs } };
			const caught = ow.Dex.isCaught('vulpix_alola');
			ow.cycleForm(mon);                              // and cycling again must come home
			return { fam, before, after, caught, home: mon.speciesId };
		});
		A(Array.isArray(shift.fam) && shift.fam[0] === 'vulpix' && shift.fam.includes('vulpix_alola'),
			'formsOf finds the family, base first', JSON.stringify(shift.fam));
		A(shift.after.id === 'vulpix_alola', 'the PRISM shifts VULPIX into its Alolan form', shift.after.id);
		A(shift.after.types.join() === 'Ice', "...with the form's typing, not the base's", shift.after.types.join());
		A(shift.after.sprite === 's1185.png', "...and the form's artwork", shift.after.sprite);
		A(shift.after.lvl === shift.before.lvl && JSON.stringify(shift.after.ivs) === JSON.stringify(shift.before.ivs),
			'...keeping the level and IVs the player earned');
		A(shift.caught === true, '...and registering the form in the Pokedex');
		A(shift.home === 'vulpix', 'cycling again returns it to the base, so the shift is undoable', shift.home);
		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 2).join(' | '));
	} catch (e) {
		A(false, 'browser harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
