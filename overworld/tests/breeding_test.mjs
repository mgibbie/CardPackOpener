// breeding_test.mjs — batch B (breeding & genetics): real gender ratios,
// IV inheritance (+Destiny Knot), Everstone natures, egg moves through the
// learn-compat filter, shiny lineage odds, and genderless pairing rules.
//   node overworld/tests/breeding_test.mjs
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
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8875;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const seedMon = {
	speciesId: 'rattata', name: 'RATTATA', level: 5, gender: 'M', friend: 70,
	types: ['Normal'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
	stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20,
	exp: 125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
};

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) {
		try { if (await fn()) return true; } catch {}
		await new Promise(r => setTimeout(r, 150));
	}
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
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((st, mon) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_party_v1', JSON.stringify([mon]));
			} catch {}
		}, STATE, seedMon);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data?.genders)), 30000);
		A(ready, 'boot: battle data incl. genders.json loaded');
		if (!ready) throw new Error('boot failed');

		const out = await page.evaluate(async () => {
			const B = await import('/overworld/battle.js');
			const D = await import('/overworld/daycare.js');
			const ow = window.__ow, data = ow.battle.data;
			const out = {};
			const R = Math.random;

			// ---- gender ratios ----
			out.genderless = B.rollGender('magnemite', data) === null;
			out.allMale = B.rollGender('tauros', data) === 'M';
			out.allFemale = B.rollGender('nidoranf', data) === 'F';
			Math.random = () => 0.5;
			out.starterMale = B.rollGender('charmander', data) === 'M'; // 0.5 < 0.875
			Math.random = () => 0.95;
			out.starterFemaleTail = B.rollGender('charmander', data) === 'F';
			Math.random = R;

			// ---- pairing rules ----
			const mk = (sp, gender, over = {}) => {
				const m = B.buildMon(sp, 20, data);
				m.gender = gender;
				return Object.assign(m, over);
			};
			const ditto = mk('ditto', null);
			out.dittoPlusGenderless = D.compatible(ditto, mk('magnemite', null));
			out.genderlessPairFails = !D.compatible(mk('magnemite', null), mk('voltorb', null));

			// ---- inheritance snapshot ----
			const IV = v => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });
			const mom = mk('pikachu', 'F', { ivs: IV(31), nature: 'timid', heldItem: 'everstone' });
			const dad = mk('pikachu', 'M', { ivs: IV(30), shiny: true });
			dad.moves = [{ id: 'thunderbolt', name: 'Thunderbolt', pp: 15, maxPp: 15 }];
			const inh = D.eggInheritance(mom, dad);
			const inherited = Object.keys(inh.ivs);
			out.threeIvs = inherited.length === 3;
			out.ivsFromParents = inherited.every(k => inh.ivs[k] === 31 || inh.ivs[k] === 30);
			out.everstoneNature = inh.nature === 'timid';
			out.fatherMoves = inh.fatherMoves.includes('thunderbolt');
			out.shinyLineage = inh.shinyBoost === 4;
			dad.heldItem = 'destinyknot';
			out.knotFive = Object.keys(D.eggInheritance(mom, dad).ivs).length === 5;
			out.plainBoost = D.eggInheritance(mk('pikachu', 'F'), mk('pikachu', 'M')).shinyBoost === 2;

			// ---- fold into the hatchling ----
			const baby = B.buildMon('pichu', 5, data);
			baby.shiny = false;
			baby.moves = baby.moves.slice(0, 1);
			Math.random = () => 0.9; // no bonus shiny
			D.applyInheritance(baby, { ivs: { atk: 31 }, nature: 'timid', fatherMoves: ['thunderbolt'], shinyBoost: 4 }, data, ow.canLearn);
			Math.random = R;
			out.babyIv = baby.ivs.atk === 31;
			out.babyNature = baby.nature === 'timid';
			out.babyEggMove = baby.moves.some(m => m.id === 'thunderbolt');
			out.babyStatsRecomputed = baby.maxHP === baby.stats.hp && baby.curHP === baby.maxHP;
			const baby2 = B.buildMon('pichu', 5, data);
			baby2.shiny = false;
			Math.random = () => 0.0001; // boosted odds hit
			D.applyInheritance(baby2, { ivs: {}, fatherMoves: [], shinyBoost: 4 }, data, ow.canLearn);
			Math.random = R;
			out.babyShinyBoost = baby2.shiny === true;
			// a move the species can NOT learn never rides along
			const baby3 = B.buildMon('pichu', 5, data);
			baby3.moves = baby3.moves.slice(0, 1);
			D.applyInheritance(baby3, { ivs: {}, fatherMoves: ['leafblade'], shinyBoost: 2 }, data, ow.canLearn);
			out.eggMoveFiltered = !baby3.moves.some(m => m.id === 'leafblade');

			return out;
		});

		A(out.genderless, 'magnemite is genderless');
		A(out.allMale, 'tauros is always male');
		A(out.allFemale, 'nidoran-f is always female');
		A(out.starterMale, 'charmander is male at 87.5%');
		A(out.starterFemaleTail, 'the 12.5% female tail exists');
		A(out.dittoPlusGenderless, 'Ditto pairs with a genderless mon');
		A(out.genderlessPairFails, 'two genderless mons cannot pair');
		A(out.threeIvs, '3 IVs inherit by default');
		A(out.ivsFromParents, 'inherited IVs come from the parents');
		A(out.everstoneNature, 'an Everstone passes the nature');
		A(out.fatherMoves, "the father's moves ride the snapshot");
		A(out.shinyLineage, 'a shiny parent doubles the egg bonus (4x)');
		A(out.knotFive, 'a Destiny Knot inherits 5 IVs');
		A(out.plainBoost, 'plain eggs still get the 2x bonus');
		A(out.babyIv, 'the hatchling carries the inherited IV');
		A(out.babyNature, 'the hatchling carries the Everstone nature');
		A(out.babyEggMove, 'a learnable egg move fills an empty slot');
		A(out.babyStatsRecomputed, 'stats recompute after inheritance');
		A(out.babyShinyBoost, 'the boosted shiny roll can hit');
		A(out.eggMoveFiltered, 'unlearnable moves never ride along');
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
