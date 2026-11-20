// battle_custom_abilities_test.mjs — Radical Ransei's 18 custom abilities WORK in the overworld's Pokémon battles.
// All but Energizate were read nowhere in battle.js (names on 37 species, no effect), and Energizate skipped the 1.3x
// its text promises (owner, 2026-11-20). Each is checked as the design wiki words it; Haste / Strongmind / Sunbeam as
// the owner designed them that day (Haste: +1 priority on the first move after it comes in; Strongmind: no confusion,
// Attract, Taunt or Encore, Sp. Def can't drop; Sunbeam: its Fire and Grass moves never miss).
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/battle_custom_abilities_test.mjs
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
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8917;

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
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
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
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data)), 30000);
		A(ready, 'the overworld boots');
		if (!ready) throw new Error('boot failed');

		const r = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const single = async () => {
				const p = ow.party.map(m => ({ ...m, stats: { ...m.stats }, ivs: { ...m.ivs }, curHP: m.maxHP, heldItem: null, ability: null }));
				b.start(p, 'pikachu', 30, () => {});
				const t0 = Date.now();
				while (!b.active && Date.now() - t0 < 15000) await new Promise(res => setTimeout(res, 100));
				const a = b.active;
				// let the opening (send-outs and their entrance abilities) finish first, so a test's own switch-in is the only one
				for (let i = 0; i < 300 && a.queue && a.queue.length; i++) { a.foeShownHP = a.foe.curHP; a.meShownHP = a.me.curHP; a.msgT = 99; b.update(0.05); }
				a.foe.types = ['Normal']; a.foe.ability = null; a.foe.heldItem = null;
				a.foe.stats = { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
				return a;
			};
			const pump = (n = 300) => {
				for (let i = 0; i < n && b.active && b.active.phase !== 'done'; i++) {
					const x = b.active;
					x.foeShownHP = x.foe.curHP; x.meShownHP = x.me.curHP; x.msgT = 99;
					b.update(0.05);
				}
			};
			const end = () => { b.active = null; };
			const M = (id) => ({ id, name: id, pp: 99, maxPp: 99 });
			// one hit from ME on the foe with a fixed roll; set up the field first with `prep(a)`
			const hit = async (ab, id, prep = () => {}, roll = 0.5) => {
				const a = await single();
				a.me.ability = ab; a.foe.curHP = a.foe.maxHP = 999999;
				prep(a);
				const real = Math.random; Math.random = () => roll;
				try {
					b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, M(id), false);
					for (let i = 0; i < 400 && a.foe.curHP === a.foe.maxHP && b.active; i++) pump(1);
					pump(200);
				} finally { Math.random = real; }
				const out = { dmg: a.foe.maxHP - a.foe.curHP, a };
				end();
				return out;
			};
			const out = {};
			const ratio = async (ab, id, prep) => (await hit(ab, id, prep)).dmg / Math.max(1, (await hit(null, id, prep)).dmg);
			// power abilities
			out.acceleration = await ratio('acceleration', 'quickattack');
			out.accelNonPrio = await ratio('acceleration', 'tackle');
			out.elementalist = await ratio('elementalist', 'flamethrower');
			out.elementalistNormal = await ratio('elementalist', 'hypervoice');
			out.soundboost = await ratio('soundboost', 'hypervoice');
			out.analyze = await ratio('analyze', 'tackle', (a) => { a.foe.movedThisTurn = true; });
			out.analyzeFirst = await ratio('analyze', 'tackle', (a) => { a.foe.movedThisTurn = false; });
			// ENERGIZATE: Normal -> Electric (no STAB on the Normal user) at 1.3x. Against a Normal target an
			// Electric Tackle is neutral, so vs plain Tackle (STAB 1.5 for the Normal-type user): 1.3 / 1.5
			out.energizate = await ratio('energizate', 'tackle');
			// SHARP CORAL
			{ const a = await single(); a.me.ability = 'sharpcoral';
				out.coral = { atk: b.statOf(a.me, a.meBoosts, 'atk'), spa: b.statOf(a.me, a.meBoosts, 'spa'), def: b.statOf(a.me, a.meBoosts, 'def'), spd: b.statOf(a.me, a.meBoosts, 'spd'), spe: b.statOf(a.me, a.meBoosts, 'spe') }; end(); }
			// DISENCHANT: Fairy moves do nothing
			out.disenchant = (await hit(null, 'moonblast', (a) => { a.foe.ability = 'disenchant'; })).dmg;
			out.disenchantOther = (await hit(null, 'tackle', (a) => { a.foe.ability = 'disenchant'; })).dmg;
			// INFLATED CHEST / STRONGMIND stat guards
			{ const a = await single(); a.foe.ability = 'inflatedchest'; out.chest = [b.canLowerStat(a.foe, 'def'), b.canLowerStat(a.foe, 'atk')];
				a.foe.ability = 'strongmind'; out.mindStat = [b.canLowerStat(a.foe, 'spd'), b.canLowerStat(a.foe, 'def')]; end(); }
			// INFURIATE: +1 Attack when hit by a physical move, not a special one
			out.infuriatePhys = (await hit(null, 'tackle', (a) => { a.foe.ability = 'infuriate'; })).a.foeBoosts.atk || 0;
			out.infuriateSpec = (await hit(null, 'swift', (a) => { a.foe.ability = 'infuriate'; })).a.foeBoosts.atk || 0;
			// DEEP FREEZE: contact may freeze the attacker (roll 0.1 < 30%)
			out.deepfreeze = (await hit(null, 'tackle', (a) => { a.foe.ability = 'deepfreeze'; }, 0.1)).a.me.status || null;
			// BLOODLUST heals 1/6 of the damage dealt
			{ const h = await hit('bloodlust', 'tackle', (a) => { a.me.curHP = 50; });
				out.bloodlust = { hp: h.a.me.curHP, dmg: h.dmg }; }
			// SUNBEAM: Fire / Grass never miss (roll 0.99 misses an 85%-accurate Fire Blast without it)
			out.sunbeamFire = (await hit('sunbeam', 'fireblast', () => {}, 0.99)).dmg;
			out.plainFire = (await hit(null, 'fireblast', () => {}, 0.99)).dmg;
			// PETRIFY / STORMBRINGER on entry
			{ const a = await single(); a.me.ability = 'petrify'; a.foeBoosts.spe = 0; b.switchInAbility(a.me, 'me'); pump(60); out.petrify = a.foeBoosts.spe || 0; end(); }
			{ const a = await single(); a.weather = null; a.me.ability = 'stormbringer'; b.switchInAbility(a.me, 'me'); pump(60); out.storm = a.weather?.kind || null; end(); }
			// QUICK CHARGE (+4) / HASTE (+1) on the first move after it comes in, then gone
			for (const [ab, k] of [['quickcharge', 'qc'], ['haste', 'haste']]) {
				const a = await single(); a.me.ability = ab;
				b.switchInAbility(a.me, 'me'); pump(30);
				const first = b.movePriority(a.me, M('tackle'));
				const real = Math.random; Math.random = () => 0.5;
				try { b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, M('tackle'), false); pump(200); } finally { Math.random = real; }
				out[k] = [first, b.movePriority(a.me, M('tackle'))];
				end();
			}
			// STRONGMIND: no confusion, no Taunt
			{ const a = await single(); a.me.ability = 'strongmind'; b.applyConfusion(a.me); pump(30); out.mindConfuse = a.me.confuseTurns || 0; end(); }
			{ const a = await single(); a.me.ability = 'strongmind'; a.me.lastMoveUsed = 'tackle';
				const real = Math.random; Math.random = () => 0.5;
				try { b.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, M('taunt'), true); pump(200); } finally { Math.random = real; }
				out.mindTaunt = a.me.tauntTurns || 0; end(); }
			// REBUILD: 1/8 HP at the end of a turn it took no direct damage, nothing after one it did
			for (const [hurt, k] of [[false, 'rebuild'], [true, 'rebuildHurt']]) {
				const a = await single(); a.me.ability = 'rebuild'; a.me.curHP = 100; a.me.tookDamageThisTurn = hurt;
				b.endOfTurn(); pump(200); out[k] = a.me.curHP; end();
			}
			return out;
		});

		A(r.acceleration > 1.4 && r.acceleration < 1.6 && Math.abs(r.accelNonPrio - 1) < 0.02, 'ACCELERATION: priority moves hit 1.5x, others unchanged', JSON.stringify([r.acceleration, r.accelNonPrio]));
		A(r.elementalist > 1.4 && r.elementalist < 1.6 && Math.abs(r.elementalistNormal - 1) < 0.02, 'ELEMENTALIST: Fire (also Water, Electric) gets the STAB 1.5x; other types unchanged', JSON.stringify([r.elementalist, r.elementalistNormal]));
		A(r.soundboost > 1.25 && r.soundboost < 1.35, 'SOUND BOOST: sound moves hit 1.3x', r.soundboost);
		A(r.analyze > 1.25 && r.analyze < 1.35 && Math.abs(r.analyzeFirst - 1) < 0.02, 'ANALYZE: 1.3x when moving last, nothing when first', JSON.stringify([r.analyze, r.analyzeFirst]));
		A(r.energizate > 0.83 && r.energizate < 0.9, 'ENERGIZATE: Normal moves go Electric at 1.3x (the 1.3x was missing: 1.3/1.5 STAB lost ≈ 0.87)', r.energizate);
		A(r.coral.atk === 200 && r.coral.spa === 200 && r.coral.def === 50 && r.coral.spd === 50 && r.coral.spe === 100, 'SHARP CORAL: Attack and Sp. Atk doubled, Defense and Sp. Def halved', JSON.stringify(r.coral));
		A(r.disenchant === 0 && r.disenchantOther > 0, 'DISENCHANT: immune to Fairy moves (not to others)', JSON.stringify([r.disenchant, r.disenchantOther]));
		A(r.chest[0] === false && r.chest[1] === true, 'INFLATED CHEST: Defense can\'t be lowered (Attack can)', JSON.stringify(r.chest));
		A(r.mindStat[0] === false && r.mindStat[1] === true, 'STRONGMIND: Sp. Def can\'t be lowered (Defense can)', JSON.stringify(r.mindStat));
		A(r.infuriatePhys === 1 && r.infuriateSpec === 0, 'INFURIATE: +1 Attack when hit by a physical move, not a special one', JSON.stringify([r.infuriatePhys, r.infuriateSpec]));
		A(r.deepfreeze === 'frz', 'DEEP FREEZE: touching it can freeze the attacker', r.deepfreeze);
		A(r.bloodlust.hp > 50, 'BLOODLUST: heals from the damage it deals', JSON.stringify(r.bloodlust));
		A(r.sunbeamFire > 0 && r.plainFire === 0, 'SUNBEAM: its Fire moves never miss (the same roll misses without it)', JSON.stringify([r.sunbeamFire, r.plainFire]));
		A(r.petrify === -1, 'PETRIFY: the foe\'s Speed drops a stage when it comes in', r.petrify);
		A(r.storm === 'rain', 'STORMBRINGER: it brings rain when it comes in', r.storm);
		A(r.qc[0] === 4 && r.qc[1] === 0, 'QUICK CHARGE: +4 priority on the first move after coming in, then gone', JSON.stringify(r.qc));
		A(r.haste[0] === 1 && r.haste[1] === 0, 'HASTE: +1 priority on the first move after coming in, then gone', JSON.stringify(r.haste));
		A(r.mindConfuse === 0 && r.mindTaunt === 0, 'STRONGMIND: can\'t be confused or taunted', JSON.stringify([r.mindConfuse, r.mindTaunt]));
		A(r.rebuild === 125 && r.rebuildHurt === 100, 'REBUILD: heals 1/8 after a turn without direct damage, nothing after one with', JSON.stringify([r.rebuild, r.rebuildHurt]));
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
