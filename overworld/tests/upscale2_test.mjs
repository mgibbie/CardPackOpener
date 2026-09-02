// upscale2_test.mjs — Upscale Batch 2: boss brains and battle pace.
//
//   * The AI ranked moves by RAW BASE POWER — no Atk/Def, no stat stages, no HP
//     awareness. It now ranks by ESTIMATED DAMAGE (the real formula minus the
//     roll) and treats a guaranteed KO as beyond price, preferring priority
//     among lethal options.
//   * Battle messages dwelled a hard-coded 1.1 s whatever the TEXT SPEED
//     setting said. The dwell now follows it; `instant` all but removes it.
//   * Leveling recalculated stats silently; there is a stat-gain window now.
//   * Stat stages and status pop on the sprite (float), not just a text line.
//   * The boss HYPER POTION healed a flat 120 — a sliver at Lv255. Now half
//     the mon's health, floored at the old 120.
//
// Deliberately NOT done: boss switching in doubles. The doubles resolver is an
// act queue; a switch act touches the delicate checkFaintsD machinery for a
// fight type that already benefits from the shared smarter chooseFoeMove.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/upscale2_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- static ----------
{
	const battle = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	A(/charsPerSec/.test(battle), 'battle.js imports the TEXT SPEED setting at last');
	A(!/a\.msgT > 1\.1 \|\|/.test(battle), 'the hard-coded 1.1 s dwell is gone');
	A(/estimateDamage\(user, target, m\)/.test(battle), 'chooseFoeMove scores by estimated damage');
	A(/Math\.max\(120, Math\.floor\(a\.foe\.maxHP \/ 2\)\)/.test(battle), 'the boss potion heals by fraction, floored at the old 120');
	// the stat-gain window is queued from inside the grew-to callback so it reads
	// the freshly recalculated statline
	A(/HP \+\$\{gain\('hp'\)\}/.test(battle), 'leveling queues the stat-gain window (+HP +ATK …)');
}

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8941;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 20, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60,
		exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.removeItem('magepunk_story');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		await page.evaluate(() => {
			window.__startWild = () => new Promise(res => {
				const ow = window.__ow;
				ow.battle.start(ow.party, 'sentret', 5, r => res(r));
			});
			window.__waitIdle = async () => {
				const b = window.__ow.battle;
				for (let i = 0; i < 300; i++) {
					const a = b.active;
					if (a && a.phase === 'choose') return true;
					await new Promise(r => setTimeout(r, 60));
				}
				return false;
			};
		});

		// ---------- the AI: stats now matter ----------
		// A physically feeble special attacker whose 120-power PHYSICAL move ranks
		// above its 60-power SPECIAL move on base power — and below it on damage.
		const brains = await page.evaluate(async () => {
			const ow = window.__ow;
			const done = window.__startWild();
			await window.__waitIdle();
			const b = ow.battle, a = b.active;
			a.isTrainer = true; a.info = { boss: true, displayName: 'TEST' };
			Object.assign(a.foe, {
				types: ['Psychic'],
				stats: { ...a.foe.stats, atk: 10, spa: 120, spe: 40 },
				moves: [
					{ id: 'megakick', name: 'Mega Kick', pp: 8, maxPp: 8 },      // 120 power, off 10 Atk
					{ id: 'psybeam', name: 'Psybeam', pp: 20, maxPp: 20 },       // 65 power, STAB, off 120 SpA
				],
			});
			a.me.curHP = a.me.maxHP;
			const picked = b.chooseFoeMove().id;
			// KO awareness: give it a weak PRIORITY move and a big slow move, with
			// the player at 1 HP — the finisher that strikes first must win
			a.foe.moves = [
				{ id: 'psybeam', name: 'Psybeam', pp: 20, maxPp: 20 },
				{ id: 'quickattack', name: 'Quick Attack', pp: 30, maxPp: 30 },
			];
			a.foe.stats.atk = 80;
			a.me.curHP = 1;
			const finisher = b.chooseFoeMove().id;
			const est = b.estimateDamage(a.foe, a.me, { id: 'psybeam' });
			// undo the synthetic trainer flags before ending: finish() walks trainer
			// state (a.foes) this wild battle never had
			a.isTrainer = false; a.info = null;
			b.finish('ran'); await done;
			return { picked, finisher, est };
		});
		A(brains.picked === 'psybeam',
			'a feeble-armed special attacker now picks its REAL best move, not the biggest number', JSON.stringify(brains));
		A(brains.finisher === 'quickattack',
			'with the player at 1 HP it snipes with PRIORITY instead of the slow big move', JSON.stringify(brains));
		A(brains.est > 0, 'estimateDamage is exposed and computes', JSON.stringify(brains));

		// ---------- text speed ----------
		const pace = await page.evaluate(async () => {
			const ow = window.__ow;
			const S = await import('./settings.js');
			const done = window.__startWild();
			await window.__waitIdle();
			const b = ow.battle;
			// time three queued messages at slow vs instant
			const time = async () => {
				const t0 = performance.now();
				b.startQueue(() => { b.pushMsg('one'); b.pushMsg('two'); b.pushMsg('three'); });
				for (let i = 0; i < 400 && b.active.queue.length; i++) await new Promise(r => setTimeout(r, 25));
				return performance.now() - t0;
			};
			S.set('textSpeed', 'slow');
			const slow = await time();
			S.set('textSpeed', 'instant');
			const instant = await time();
			S.set('textSpeed', 'mid');
			b.finish('ran'); await done;
			return { slow: Math.round(slow), instant: Math.round(instant) };
		});
		A(pace.instant < pace.slow / 2,
			`TEXT SPEED finally reaches battle: instant (${pace.instant}ms) vs slow (${pace.slow}ms) for the same three lines`,
			JSON.stringify(pace));

		// ---------- floating stat feedback ----------
		// Drive a real Growl through the queue and sample the floaters while it
		// plays — they decay in ~1.1 s, so poll rather than look once at the end.
		const feel = await page.evaluate(async () => {
			const ow = window.__ow;
			const done = window.__startWild();
			await window.__waitIdle();
			const b = ow.battle, a = b.active;
			const seen = new Set();
			b.startQueue(() => { b.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, { id: 'growl', name: 'Growl', pp: 40, maxPp: 40 }, true); });
			for (let i = 0; i < 200; i++) {
				for (const f of (a.floaters || [])) seen.add(f.text);
				if (!b.active?.queue?.length) break;
				await new Promise(r => setTimeout(r, 30));
			}
			const out = { floats: [...seen], atkStage: a.meBoosts.atk };
			b.finish('ran'); await done;
			return out;
		});
		A(feel.atkStage === -1, "the foe's Growl lands (control)", JSON.stringify(feel));
		A(feel.floats.some(t => /ATK↓/.test(t)), 'the stat drop POPS on the sprite, not just in text', JSON.stringify(feel));


		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
