// inertsystems_test.mjs — mechanics that shipped as data nothing read.
//
// The recurring failure in this codebase is a payload with no consumer: a field
// in bag.js or a move in the table that the engine never looks at. Everything
// below was in that state.
//
//   REPEL          3 items, zero readers anywhere in overworld/
//   doubles        turn order ignored Trick Room / Tailwind / Choice Scarf /
//                  Quick Claw / Unburden, the foe AI picked uniformly at random
//                  (the comment above it claimed "its strongest move"), and
//                  spread moves hit every target at FULL power
//   crits          no high-crit or always-crit move existed; every move in the
//                  game was a flat 1/16, so 532 species learning one got nothing
//   RAPID SPIN     absent from battle.js entirely, while the AI rates hazards at
//                  95 on turns 1-2 — the canonical counter-play was inert
//   HIDDEN POWER   Normal-type 60 BP for all 845 species that can learn it
//   conditionals   Venoshock/Payback/Assurance/Revenge/Avalanche had flat power;
//                  Last Resort fired at 140 with none of its restriction
//   ally support   27 status moves hard-wired to "But it failed!" behind a
//                  comment claiming no allies and no held items — both false now
//   held items     WHITE HERB / MENTAL HERB / MACHO BRACE had unread payloads
//   abilities      142 of 318 were read nowhere (31% of the dex)
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/inertsystems_test.mjs
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
const PORT = 8903;

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
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data)), 30000);
		A(ready, 'the overworld boots');
		if (!ready) throw new Error('boot failed');

		// shared helpers
		await page.evaluate(() => {
			const ow = window.__ow;
			window.__single = async (opts = {}) => {
				const b = ow.battle;
				const p = ow.party.map(m => ({ ...m, stats: { ...m.stats }, ivs: { ...m.ivs }, curHP: m.maxHP, heldItem: null, ability: null }));
				b.start(p, 'pikachu', 30, () => {});
				const t0 = Date.now();
				while (!b.active && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
				Object.assign(b.active.me, opts.me || {});
				Object.assign(b.active.foe, opts.foe || {});
				return b.active;
			};
			window.__double = async () => {
				const b = ow.battle;
				const p = ow.party.map(m => ({ ...m, stats: { ...m.stats }, ivs: { ...m.ivs }, curHP: m.maxHP, heldItem: null, ability: null }));
				const foes = [{ ...p[0], stats: { ...p[0].stats }, name: 'F1' }, { ...p[1], stats: { ...p[1].stats }, name: 'F2' }];
				b.startTrainer(p, foes, { displayName: 'TWINS A & B', defeatText: '', money: 10 }, () => {});
				const t0 = Date.now();
				while (!b.active && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
				return b.active;
			};
			window.__pump = (n = 300) => {
				const b = ow.battle;
				for (let i = 0; i < n && b.active && b.active.phase !== 'done'; i++) {
					const x = b.active;
					x.foeShownHP = x.foe.curHP; x.meShownHP = x.me.curHP; x.msgT = 99;
					b.update(0.05);
				}
			};
			window.__end = () => { ow.battle.active = null; };
		});

		// ---------- REPEL ----------
		const repel = await page.evaluate(() => {
			const I = window.__ow.Bag.ITEMS;
			return { kind: I.repel?.kind, steps: I.repel?.steps, max: I.maxrepel?.steps };
		});
		A(repel.kind === 'repel' && repel.steps > 0,
			'REPEL carries a payload and a kind the bag actions', JSON.stringify(repel));

		const repelWorks = await page.evaluate(() => {
			const ow = window.__ow, enc = ow.encounters;
			// a table whose every slot is far below the lead's level
			const id = '__repeltest__';
			enc.data[id] = { land: { rate: 100, slots: [{ id: 'rattata', min: 2, max: 2, w: 100 }] } };
			const world = { isSurfable: () => false, isTallGrass: () => true, hasTallGrass: () => true };
			let without = 0, with_ = 0;
			for (let i = 0; i < 40; i++) {
				if (enc.roll(id, world, 0, 0, false, 0)) without++;
				if (enc.roll(id, world, 0, 0, false, 50)) with_++;
			}
			delete enc.data[id];
			return { without, with_ };
		});
		A(repelWorks.without > 30, 'weak wild POKeMON appear normally', JSON.stringify(repelWorks));
		A(repelWorks.with_ === 0, 'and a REPEL turns every one of them away', JSON.stringify(repelWorks));

		// ---------- doubles turn order ----------
		const order = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await window.__double();
			a.me.stats.spe = 200; a.foe.stats.spe = 100;
			const fast = b.speedOf(a.me) > b.speedOf(a.foe);
			a.fieldFx.trickRoom = 5;
			const flipped = b.speedOf(a.me) < b.speedOf(a.foe);
			a.fieldFx.trickRoom = 0;
			a.me.heldItem = 'choicescarf';
			const scarfed = b.speedOf(a.me);
			a.me.heldItem = null;
			const bare = b.speedOf(a.me);
			window.__end();
			return { fast, flipped, scarfed, bare };
		});
		A(order.fast, 'the faster POKeMON is faster in a double battle');
		A(order.flipped, 'TRICK ROOM inverts it — the doubles sorter used raw speed and ignored it');
		A(order.scarfed > order.bare, 'and a CHOICE SCARF is worth its 4800 gold there', `${order.bare} -> ${order.scarfed}`);

		// ---------- doubles AI ----------
		const ai = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await window.__double();
			a.isTrainer = true; a.info.boss = true;
			// one useless move and one strong one: a scoring AI must never pick splash
			const foe = a.foe;
			foe.moves = [
				{ id: 'splash', name: 'Splash', pp: 40, maxPp: 40 },
				{ id: 'earthquake', name: 'Earthquake', pp: 10, maxPp: 10 },
			];
			const picks = [];
			for (let i = 0; i < 12; i++) picks.push(b.chooseFoeMove(foe, a.me).id);
			window.__end();
			return picks;
		});
		A(ai.every(p => p === 'earthquake'),
			'a boss-tier foe in doubles picks its real move — it used to roll uniformly and could spam SPLASH',
			ai.join(','));

		// ---------- crits ----------
		const crit = await page.evaluate(() => ({
			high: window.__ow.battle.constructor ? true : true,   // presence checked below via behaviour
		}));
		void crit;
		// Pin the RNG at 0.1 — between the normal 1/16 (0.0625) and the high-crit
		// 1/8 (0.125). Sampling could not separate those two rates at any sane
		// sample size; this asserts the TIERS directly and deterministically.
		const critRates = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const shot = async (id) => {
				const a = await window.__single();
				a.foe.maxHP = 999999; a.foe.curHP = 999999;
				b.lastWasCrit = null;
				const real = Math.random;
				Math.random = () => 0.1;
				try {
					b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id, name: id, pp: 99, maxPp: 99 }, false);
					window.__pump(40);
				} finally { Math.random = real; }
				const out = b.lastWasCrit;
				window.__end();
				return out;
			};
			return { tackle: await shot('tackle'), slash: await shot('slash'), frost: await shot('frostbreath') };
		});
		A(critRates.tackle === false, 'a 0.1 roll does NOT crit an ordinary move (1/16)', JSON.stringify(critRates));
		A(critRates.slash === true,
			'but DOES crit SLASH — no high-crit tier existed at all, and 532 species learn one',
			JSON.stringify(critRates));
		A(critRates.frost === true, 'and FROST BREATH always crits', JSON.stringify(critRates));

		// ---------- HIDDEN POWER ----------
		const hp = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await window.__single();
			const typeFor = ivs => { a.me.ivs = ivs; return b.hiddenPowerTypeOf(a.me); };
			const all15 = typeFor({ hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 });
			const all0 = typeFor({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
			const mixed = typeFor({ hp: 1, atk: 0, def: 1, spa: 0, spd: 1, spe: 0 });
			window.__end();
			return { all15, all0, mixed };
		});
		A(hp.all15 && hp.all15 !== 'Normal', 'HIDDEN POWER has a real type — it was Normal for all 845 species', JSON.stringify(hp));
		A(hp.all0 !== hp.all15, 'and the type follows the IVs', JSON.stringify(hp));

		// ---------- conditional power ----------
		const cond = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await window.__single();
			const pw = (id, setup) => {
				setup?.();
				return b.powerOf ? b.powerOf(id, a.me, a.foe, a.meBoosts, a.foeBoosts, { id, pp: 5 }) : null;
			};
			const clean = pw('venoshock', () => { a.foe.status = null; });
			const poisoned = pw('venoshock', () => { a.foe.status = 'psn'; });
			const paybackEarly = pw('payback', () => { a.foe.movedThisTurn = false; });
			const paybackLate = pw('payback', () => { a.foe.movedThisTurn = true; });
			a.me.usedMoves = [];
			const lastAlone = pw('lastresort', () => { a.me.moves = [{ id: 'lastresort' }, { id: 'tackle' }]; a.me.usedMoves = []; });
			const lastReady = pw('lastresort', () => { a.me.usedMoves = ['tackle']; });
			window.__end();
			return { clean, poisoned, paybackEarly, paybackLate, lastAlone, lastReady };
		});
		A(cond.poisoned > cond.clean, 'VENOSHOCK doubles on a poisoned target', JSON.stringify(cond));
		A(cond.paybackLate > cond.paybackEarly, 'PAYBACK doubles when the target already moved', JSON.stringify(cond));
		A(cond.lastAlone === 0 && cond.lastReady > 0,
			'LAST RESORT fails until every other move has been used — it used to just fire at 140',
			JSON.stringify(cond));

		// ---------- RAPID SPIN ----------
		const spin = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await window.__single();
			a.meHazards = { spikes: 3, stealthrock: 1 };
			a.me.seeded = true;
			b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id: 'rapidspin', name: 'Rapid Spin', pp: 40, maxPp: 40 }, false);
			window.__pump();
			const out = { hazards: Object.values(a.meHazards).filter(v => v > 0).length, seeded: !!a.me.seeded };
			window.__end();
			return out;
		});
		A(spin.hazards === 0, 'RAPID SPIN clears the hazards on your own side — it did nothing before', JSON.stringify(spin));
		A(spin.seeded === false, 'and sheds LEECH SEED', JSON.stringify(spin));

		// ---------- ally support ----------
		const ally = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await window.__double();
			b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id: 'helpinghand', name: 'Helping Hand', pp: 20, maxPp: 20 }, false);
			window.__pump(60);
			const helped = !!a.meAlly?.helpingHand;
			b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id: 'followme', name: 'Follow Me', pp: 20, maxPp: 20 }, false);
			window.__pump(60);
			const magnet = !!a.me.centerOfAttention;
			const before = a.meAlly && b.boostsOf(a.meAlly).atk || 0;
			b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id: 'decorate', name: 'Decorate', pp: 15, maxPp: 15 }, false);
			window.__pump(60);
			const after = a.meAlly && b.boostsOf(a.meAlly).atk || 0;
			window.__end();
			return { helped, magnet, before, after };
		});
		A(ally.helped, 'HELPING HAND marks its ally — it was hard-wired to "But it failed!"', JSON.stringify(ally));
		A(ally.magnet, 'FOLLOW ME makes the user the center of attention', JSON.stringify(ally));
		A(ally.after > ally.before, 'DECORATE actually boosts the ally', JSON.stringify(ally));

		// and they still fail in a SINGLE battle, where there is no ally
		const alone = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await window.__single();
			b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id: 'helpinghand', name: 'Helping Hand', pp: 20, maxPp: 20 }, false);
			window.__pump(60);
			const out = !a.me.helpingHand;
			window.__end();
			return out;
		});
		A(alone, 'and correctly still fail in a single battle, where there is no ally');

		// ---------- held items ----------
		const items = await page.evaluate(() => {
			const I = window.__ow.Bag.ITEMS;
			return { white: I.whiteherb?.held?.whiteHerb, mental: I.mentalherb?.held?.mentalHerb, macho: I.machobrace?.held?.evBoost };
		});
		A(items.white && items.mental && items.macho === 2,
			'WHITE HERB / MENTAL HERB / MACHO BRACE all carry a payload the engine reads', JSON.stringify(items));

		const herbs = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await window.__single();
			a.me.heldItem = 'whiteherb';
			a.meBoosts.atk = -2; a.meBoosts.def = -1;
			a.foe.heldItem = 'mentalherb'; a.foe.attracted = true;
			b.endOfTurn(); window.__pump(120);
			const out = { atk: a.meBoosts.atk, def: a.meBoosts.def, held: a.me.heldItem, attracted: !!a.foe.attracted };
			window.__end();
			return out;
		});
		A(herbs.atk === 0 && herbs.def === 0, 'a WHITE HERB undoes lowered stats', JSON.stringify(herbs));
		A(herbs.held === null, 'and is consumed doing it', JSON.stringify(herbs));
		A(herbs.attracted === false, 'a MENTAL HERB snaps the holder out of infatuation', JSON.stringify(herbs));

		// ---------- abilities ----------
		const abil = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const a = await window.__single();
			// QUICK FEET
			a.me.ability = 'quickfeet'; a.me.status = null;
			const healthy = b.speedOf(a.me);
			a.me.status = 'par';
			const statused = b.speedOf(a.me);
			// BIG PECKS
			a.foe.ability = 'bigpecks';
			const defBlocked = b.canLowerStat(a.foe, 'def') === false;
			const atkAllowed = b.canLowerStat(a.foe, 'atk') === true;
			// EARLY BIRD
			a.me.ability = 'earlybird'; a.me.status = 'slp'; a.me.sleepTurns = 4;
			b.beforeMove(a.me, a.meBoosts, false, { id: 'tackle', name: 'Tackle', pp: 9, maxPp: 9 });
			const slept = a.me.sleepTurns;
			window.__end();
			return { healthy, statused, defBlocked, atkAllowed, slept };
		});
		A(abil.statused > abil.healthy,
			'QUICK FEET speeds its holder up when statused, ignoring the paralysis cut — without that it was a net LOSS',
			JSON.stringify(abil));
		A(abil.defBlocked && abil.atkAllowed, 'BIG PECKS refuses Defense drops and nothing else', JSON.stringify(abil));
		A(abil.slept <= 2, 'EARLY BIRD burns sleep at double rate', `4 -> ${abil.slept}`);

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
