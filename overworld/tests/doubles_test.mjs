// doubles_test.mjs — tester report: "double battles end when only one of the
// pokemon gets knocked out".
//
// A double battle must run until a WHOLE SIDE is down. The end-of-battle
// decision belongs to checkFaintsD, which asks livingFoes()/livingMine(); but
// grantExp — called the moment any single foe faints — carried its own
// singles-shaped "the foe is gone, so you win" tail, and in a wild double that
// tail fired while the second wild POKeMON was still standing.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/doubles_test.mjs
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
const PORT = 8889;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, sprite, num) => ({
	speciesId, name, level: 20, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60,
	exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite, num,
});
// two healthy party members: a double needs both slots filled
const PARTY = [mon('rattata', 'RATTATA', 's608.png', 19), mon('pidgey', 'PIDGEY', 's16.png', 16)];

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
		await page.evaluateOnNewDocument((st, party) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
				localStorage.setItem('magepunk_region', 'KANTO');
			} catch {}
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() =>
			!!(window.__ow?.battle?.data && window.__ow.party?.length >= 2)), 30000);
		A(ready, 'boot with a two-POKeMON party');
		if (!ready) throw new Error('boot failed');

		// helper installed once: start a double, KO one side's slot, drain the
		// message queue (the queue is where finish() actually fires), report.
		await page.evaluate(() => {
			window.__dbl = async (opts) => {
				const b = window.__ow.battle;
				// battle.start(party, id, level, onEnd, second) directly: going via
				// startWildBattle would need a map with a wild encounter table to
				// supply the partner, which makes the setup depend on route data
				b.start(window.__ow.party, 'pikachu', 10, () => {}, { id: 'pidgey', level: 10 });
				const t0 = Date.now();
				while (!b.active?.double && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
				const a = b.active;
				if (!a?.double) return { error: 'not a double: ' + JSON.stringify({ has: !!a, double: a?.double }) };
				const before = {
					double: a.double, foes: [a.foe?.name, a.foeAlly?.name],
					mine: [a.me?.name, a.meAlly?.name],
				};
				// knock out exactly ONE of the two, as the tester described
				const slot = opts.slot;
				a[slot].curHP = 0;
				b.checkFaintsD();
				// drain: settle the HP bars each tick so the queue keeps advancing
				for (let i = 0; i < 400 && b.active && b.active.phase !== 'done'; i++) {
					const x = b.active;
					x.foeShownHP = x.foe?.curHP ?? 0;
					x.meShownHP = x.me?.curHP ?? 0;
					x.foeAllyShownHP = x.foeAlly?.curHP ?? 0;
					x.meAllyShownHP = x.meAlly?.curHP ?? 0;
					x.msgT = 99;
					b.update(0.05);
					if (x.queue.length === 0 && x.phase !== 'msg') break;
				}
				const a2 = b.active;
				return {
					before,
					phase: a2?.phase ?? null,
					result: a2?.result ?? null,
					over: a2?.phase === 'done',
					livingFoes: b.livingFoes().map(m => m.name),
					livingMine: b.livingMine().map(m => m.name),
				};
			};
		});

		// ---- the reported bug: one wild foe drops, the battle should continue ----
		const foeDown = await page.evaluate(() => window.__dbl({ slot: 'foeAlly' }));
		A(!foeDown.error, 'a wild DOUBLE battle started', foeDown.error);
		A(foeDown.before?.double === true, 'both sides have two POKeMON', JSON.stringify(foeDown.before));
		A(foeDown.livingFoes.length === 1, 'one wild POKeMON is still standing', JSON.stringify(foeDown.livingFoes));
		A(foeDown.over === false,
			'the battle does NOT end when only one foe faints', `phase=${foeDown.phase} result=${foeDown.result}`);
		A(foeDown.result !== 'victory', 'and it is certainly not a victory yet', String(foeDown.result));

		// ---- the mirror: losing one of yours must not end it either ----
		await page.evaluate(() => { const b = window.__ow.battle; if (b.active) b.active.phase = 'done'; b.active = null; });
		await page.evaluate(() => { for (const m of window.__ow.party) { m.curHP = m.maxHP; delete m.faintCounted; } });
		const mineDown = await page.evaluate(() => window.__dbl({ slot: 'meAlly' }));
		A(!mineDown.error, 'a second wild double started', mineDown.error);
		A(mineDown.livingMine.length >= 1, 'you still have a POKeMON up', JSON.stringify(mineDown.livingMine));
		A(mineDown.over === false,
			'the battle does NOT end when only one of yours faints', `phase=${mineDown.phase} result=${mineDown.result}`);
		A(mineDown.result !== 'defeat', 'and it is not a blackout', String(mineDown.result));

		// ---- it must still END when a whole side goes down ----
		// The fix moves the end-of-battle call; prove it still happens.
		const reset = () => page.evaluate(() => {
			const b = window.__ow.battle;
			if (b.active) b.active.phase = 'done';
			b.active = null;
			for (const m of window.__ow.party) { m.curHP = m.maxHP; delete m.faintCounted; }
		});
		await page.evaluate(() => {
			window.__dblBoth = async (side) => {
				const b = window.__ow.battle;
				b.start(window.__ow.party, 'pikachu', 10, () => {}, { id: 'pidgey', level: 10 });
				const t0 = Date.now();
				while (!b.active?.double && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
				const a = b.active;
				if (side === 'foe') { a.foe.curHP = 0; a.foeAlly.curHP = 0; }
				else { a.me.curHP = 0; a.meAlly.curHP = 0; for (const m of a.party) m.curHP = 0; }
				b.checkFaintsD();
				for (let i = 0; i < 500 && b.active && b.active.phase !== 'done'; i++) {
					const x = b.active;
					x.foeShownHP = x.foe?.curHP ?? 0; x.meShownHP = x.me?.curHP ?? 0;
					x.foeAllyShownHP = x.foeAlly?.curHP ?? 0; x.meAllyShownHP = x.meAlly?.curHP ?? 0;
					x.msgT = 99;
					b.update(0.05);
				}
				return { phase: b.active?.phase ?? null, result: b.active?.result ?? null };
			};
		});
		await reset();
		const bothFoes = await page.evaluate(() => window.__dblBoth('foe'));
		A(bothFoes.result === 'victory', 'BOTH wild foes down still wins the battle', JSON.stringify(bothFoes));
		await reset();
		const bothMine = await page.evaluate(() => window.__dblBoth('mine'));
		A(bothMine.result === 'defeat', 'your whole side down still ends in a blackout', JSON.stringify(bothMine));

		// ---- singles are untouched ----
		await reset();
		const single = await page.evaluate(async () => {
			const b = window.__ow.battle;
			b.start(window.__ow.party, 'pikachu', 10, () => {});
			const t0 = Date.now();
			while (!b.active && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
			const a = b.active;
			const wasDouble = a.double;
			a.foe.curHP = 0;
			b.checkFaints();
			for (let i = 0; i < 500 && b.active && b.active.phase !== 'done'; i++) {
				const x = b.active;
				x.foeShownHP = x.foe.curHP; x.meShownHP = x.me.curHP; x.msgT = 99;
				b.update(0.05);
			}
			return { wasDouble, result: b.active?.result ?? null };
		});
		A(single.wasDouble !== true, 'a normal wild battle is not a double');
		A(single.result === 'victory', 'and a single KO still wins it', JSON.stringify(single));

		// ---- a TRAINER double refills from the bench instead of ending ----
		await reset();
		const trainerDbl = await page.evaluate(async () => {
			const b = window.__ow.battle, D = b.data;
			const { buildMon } = await import('/overworld/battle.js');
			// three foes so the bench can refill an emptied slot
			const foeParty = ['rattata', 'pidgey', 'zubat'].map(id => buildMon(id, 10, D));
			if (foeParty.some(m => !m)) return { skip: 'buildMon returned nothing' };
			b.startTrainer(window.__ow.party, foeParty,
				{ displayName: 'TWINS AVA & GIA', money: 100, defeatText: 'ok' }, () => {});
			const t0 = Date.now();
			while (!b.active?.double && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
			const a = b.active;
			if (!a?.double) return { error: 'trainer double did not form' };
			const before = [a.foe.name, a.foeAlly.name];
			a.foeAlly.curHP = 0;
			b.checkFaintsD();
			for (let i = 0; i < 500 && b.active && b.active.phase !== 'done'; i++) {
				const x = b.active;
				x.foeShownHP = x.foe?.curHP ?? 0; x.meShownHP = x.me?.curHP ?? 0;
				x.foeAllyShownHP = x.foeAlly?.curHP ?? 0; x.meAllyShownHP = x.meAlly?.curHP ?? 0;
				x.msgT = 99;
				b.update(0.05);
				if (x.queue.length === 0 && x.phase !== 'msg') break;
			}
			const a2 = b.active;
			return {
				before,
				over: a2?.phase === 'done', result: a2?.result ?? null,
				slots: [a2?.foe?.name ?? null, a2?.foeAlly?.name ?? null],
				living: b.livingFoes().map(m => m.name),
			};
		});
		if (trainerDbl.skip) {
			A(true, 'trainer-double check skipped: ' + trainerDbl.skip);
		} else {
			A(!trainerDbl.error, 'a TRAINER double battle started', trainerDbl.error);
			A(trainerDbl.over === false, 'it does not end when one foe faints', JSON.stringify(trainerDbl));
			A(trainerDbl.living.length === 2, 'the emptied slot refilled from the bench — exactly two foes stand',
				JSON.stringify(trainerDbl.slots));
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
