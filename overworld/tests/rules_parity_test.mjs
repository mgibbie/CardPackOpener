// rules_parity_test.mjs — moving the Pokémon rules out of battle.js into overworld/rules/ (Poketactica stage 1, owner
// 2026-11-20) changes NOTHING in the overworld's battles. A few hundred seeded single moves (a random move, both
// species, levels, abilities and held items; Math.random replaced by a seeded generator) are played through the real
// Battle; every outcome (both sides' HP, status, stat stages) must equal the golden file recorded from battle.js
// BEFORE the move (rules_parity_golden.json). Later stage-1 steps keep it green.
//
//   node overworld/tests/rules_parity_test.mjs            compare with the golden file
//   node overworld/tests/rules_parity_test.mjs --record   (re)write it — only from a battle.js known to be right
// Needs headless Chrome/Edge + local overworld/data.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { makeRng } from '../rules/rng.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const GOLDEN = path.join(HERE, 'rules_parity_golden.json');
const RECORD = process.argv.includes('--record');
const CASES = 400;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8918;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, sprite, num) => ({
	speciesId, name, level: 50, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHP: 200, curHP: 200,
	exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite, num,
});
const PARTY = [mon('rattata', 'LEAD', 's608.png', 19), mon('pidgey', 'BENCH', 's16.png', 16)];

// the cases: picked from the game's own data by a seeded generator, so they are the same every run
function makeCases(data) {
	const rng = makeRng('rules-parity-v2');
	const pick = (l) => l[rng.int(l.length)];
	const moves = Object.keys(data.moves).filter((id) => !['struggle', 'transform', 'metronome', 'assist', 'sleeptalk', 'mirrormove', 'copycat', 'mefirst', 'naturepower'].includes(id)).sort();
	const species = Object.keys(data.species).filter((id) => data.species[id]?.baseStats).sort();
	const abilities = [...new Set(Object.values(data.abilities).flat().filter((a) => typeof a === 'string'))].sort();
	const items = ['leftovers', 'lifeorb', 'choiceband', 'choicespecs', 'expertbelt', 'shellbell', 'rockyhelmet', 'assaultvest', 'charcoal', 'mysticwater', 'magnet', 'miracleseed', 'scopelens', 'quickclaw', 'kingsrock', null, null, null];
	const out = [];
	for (let i = 0; i < CASES; i++) {
		out.push({ seed: 'case' + i, move: pick(moves), me: pick(species), foe: pick(species), meLv: 5 + rng.int(96), foeLv: 5 + rng.int(96),
			meAb: rng.chance(0.7) ? pick(abilities) : null, foeAb: rng.chance(0.7) ? pick(abilities) : null, meItem: pick(items), foeItem: pick(items),
			// the field and both sides' state, so the whole modifier / accuracy / crit stack is exercised
			wx: pick([null, null, 'rain', 'sun', 'sand', 'hail']), tr: pick([null, null, 'electric', 'grassy', 'psychic', 'misty']),
			ub: { atk: rng.int(5) - 2, spa: rng.int(5) - 2, acc: rng.int(5) - 2 }, tb: { def: rng.int(5) - 2, spd: rng.int(5) - 2, eva: rng.int(5) - 2 },
			uHp: pick([1, 1, 0.5, 0.3]), tFull: rng.chance(0.5), uSt: pick([null, null, null, 'brn', 'psn', 'par']), tSt: pick([null, null, 'psn', 'slp']),
			gravity: rng.chance(0.15), charged: rng.chance(0.15), hh: rng.chance(0.15), screen: pick([null, null, null, 'reflect', 'light']) });
	}
	return out;
}

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
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
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data?.abilities)), 30000);
		A(ready, 'the overworld boots');
		if (!ready) throw new Error('boot failed');
		const data = await page.evaluate(() => { const d = window.__ow.battle.data; return { moves: Object.fromEntries(Object.keys(d.moves).map((k) => [k, 1])), species: Object.fromEntries(Object.entries(d.species).map(([k, v]) => [k, { baseStats: !!v.baseStats }])), abilities: d.abilities }; });
		const cases = makeCases(data);

		const results = await page.evaluate(async (cases) => {
			const ow = window.__ow, b = ow.battle, D = b.data;
			// the same mulberry32 as overworld/rules/rng.js, inlined so the OLD battle.js (no rules/) can run it too
			const rngOf = (seed) => { let h = 0x811c9dc5; for (const c of seed) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193); } let a = h >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
			const pump = (n) => { for (let i = 0; i < n && b.active && b.active.phase !== 'done'; i++) { const x = b.active; x.foeShownHP = x.foe.curHP; x.meShownHP = x.me.curHP; x.msgT = 99; b.update(0.05); } };
			const out = [];
			const real = Math.random;
			for (const c of cases) {
				Math.random = rngOf(c.seed + ':setup');
				const p = ow.party.map(m => ({ ...m, stats: { ...m.stats }, ivs: { ...m.ivs }, curHP: m.maxHP, heldItem: null, ability: null }));
				b.start(p, 'pikachu', 30, () => {});
				let t0 = Date.now();
				while (!b.active && Date.now() - t0 < 15000) await new Promise(res => setTimeout(res, 20));
				const a = b.active;
				for (let i = 0; i < 300 && a.queue && a.queue.length; i++) pump(1);
				const set = (m, id, lv, ab, item) => {
					const sp = D.species[id];
					m.speciesId = id; m.name = sp.name; m.types = [...sp.types]; m.level = lv;
					const bs = sp.baseStats, st = (k, hp) => Math.floor((2 * (bs[k] || 50) + 15) * lv / 100) + (hp ? lv + 10 : 5);   // IVs 15, no EVs / nature
					m.stats = { hp: st('hp', 1), atk: st('atk'), def: st('def'), spa: st('spa'), spd: st('spd'), spe: st('spe') };
					m.maxHP = m.curHP = m.stats.hp; m.ability = ab; m.heldItem = item; m.status = null;
				};
				set(a.me, c.me, c.meLv, c.meAb, c.meItem);
				set(a.foe, c.foe, c.foeLv, c.foeAb, c.foeItem);
				a.me.curHP = a.me.maxHP = 9999; a.foe.curHP = a.foe.maxHP = 9999;   // no faint ends the case early
				if (c.wx) { a.weather = { kind: c.wx, turns: 5 }; }
				if (c.tr) { a.terrain = { kind: c.tr, turns: 5 }; }
				if (c.gravity) a.fieldFx.gravity = 3;
				Object.assign(a.meBoosts, c.ub || {}); Object.assign(a.foeBoosts, c.tb || {});
				a.me.curHP = Math.floor(9999 * (c.uHp || 1)); if (!c.tFull) a.foe.curHP = 9000;
				a.me.status = c.uSt || null; a.foe.status = c.tSt || null; if (c.tSt === 'slp') a.foe.sleepTurns = 3;
				if (c.charged) a.me.chargedUp = true; if (c.hh) a.me.helpingHand = true;
				if (c.screen) a.foeScreens[c.screen] = 3;
				Math.random = rngOf(c.seed);
				let err = null;
				try {
					b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id: c.move, name: c.move, pp: 9, maxPp: 9 }, false);
					pump(400);
				} catch (e) { err = String(e.message || e).slice(0, 120); }
				out.push({ hp: [a.me.curHP, a.foe.curHP], st: [a.me.status || null, a.foe.status || null], mb: { ...a.meBoosts }, fb: { ...a.foeBoosts }, err });
				b.active = null;
			}
			Math.random = real;
			return out;
		}, cases);

		const golden = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : null;
		const varied = results.filter((r, i) => r.hp[1] !== (cases[i].tFull ? 9999 : 9000)).length;
		A(varied > CASES / 3, `the cases really hit (${varied}/${CASES} moves changed the foe's HP)`);
		if (RECORD) {
			fs.writeFileSync(GOLDEN, JSON.stringify({ cases: CASES, results }) + '\n');
			console.log('recorded ' + results.length + ' cases to ' + path.relative(ROOT, GOLDEN));
		} else {
			A(!!golden && golden.results.length === results.length, 'the golden file is there, for the same cases');
			const diff = golden ? results.map((r, i) => JSON.stringify(r) === JSON.stringify(golden.results[i]) ? null : `#${i} ${cases[i].move} ${JSON.stringify(golden.results[i])} -> ${JSON.stringify(r)}`).filter(Boolean) : ['no golden'];
			A(!diff.length, `every case plays exactly as battle.js did before the rules moved out (${results.length - diff.length}/${results.length})`, diff.slice(0, 4).join(' | '));
		}
		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
