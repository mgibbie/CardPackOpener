// stragglers_test.mjs — Batch F of the second upscale plan: the leftovers.
//
//   * audit, re-verified in this test: ZERO unreferenced power-0 damaging
//     moves remain (the 2026-08-26 "23 dead moves" plan shipped), and the
//     doubles ally-switch fix is in place
//   * HEAL BLOCK now gates the heal AND drain paths (was a noop)
//   * ELECTRIFY / ION DELUGE ride the useMove type-rewrite chain (were noops):
//     proven by turning Tackle into an ELECTRIC move that a Ground type ignores
//   * followers: 855 species had no walk sheet and simply VANISHED — forms now
//     fall back to their base species' sheet, and everything else walks along
//     as its battle-sprite mini
//
//   node overworld/tests/stragglers_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- the audits, kept honest in source ----------
{
	const bt = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	const mv = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/moves_battle.json'), 'utf8'));
	const dead = Object.entries(mv).filter(([id, m]) =>
		(m.power || 0) <= 0 && (m.category || '').toLowerCase() !== 'status' && !new RegExp(`\\b${id}\\b`).test(bt));
	A(dead.length === 0, 'zero unreferenced power-0 damaging moves (the dead-moves plan holds)', JSON.stringify(dead.slice(0, 5)));
	A((bt.match(/m !== a\.meAlly/g) || []).length >= 4, 'the doubles ally-switch fix is in place');
	A(/healblock: \{ healBlock: true \}/.test(bt) && /electrify: \{ electrifyTarget: true \}/.test(bt) && /iondeluge: \{ ionDeluge: true \}/.test(bt),
		'HEAL BLOCK / ELECTRIFY / ION DELUGE are no longer noops');
	A(/delete mon\.healBlockTurns/.test(bt) && /delete mon\.electrified/.test(bt), 'the new volatiles clear on switch/battle-end');
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/followMini/.test(mn) && /data\/pokemon_follow\/\$\{base\}/.test(mn), 'followers fall back: base-form sheet, then battle-sprite mini');
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
	const PORT = 8987;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120,
		exp: 64000, moves: [
			{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 },
			{ id: 'recover', name: 'Recover', pp: 10, maxPp: 10 },
			{ id: 'gigadrain', name: 'Giga Drain', pp: 10, maxPp: 10 },
			{ id: 'watergun', name: 'Water Gun', pp: 25, maxPp: 25 },
		], sprite: 's608.png', num: 19,
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
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		const out = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const wait = ms => new Promise(r => setTimeout(r, ms));
			const settle = async () => { for (let i = 0; i < 120; i++) { const a = b.active; if (!a || (a.queue.length === 0 && a.phase !== 'msg')) break; b.key('z'); await wait(60); } };
			ow.startWildBattle({ id: 'diglett', level: 10 }); // GROUND: immune to Electric
			for (let i = 0; i < 200; i++) { const a = b.active; if (a && a.phase === 'menu') break; await wait(60); }
			const a = b.active;
			a.foe.maxHP = 4000; a.foe.curHP = 4000; a.foeShownHP = 4000;
			const o = {};
			const cast = async (user, target, id, isFoe) => {
				const mv = { id, name: id, pp: 10, maxPp: 10 };
				b.startQueue(() => b.useMove(user, isFoe ? a.foeBoosts : a.meBoosts, target, isFoe ? a.meBoosts : a.foeBoosts, mv, isFoe));
				await settle();
			};
			// --- HEAL BLOCK gates heals and drains ---
			await cast(a.foe, a.me, 'healblock', true);
			o.blocked = a.me.healBlockTurns;
			a.me.curHP = 40;
			await cast(a.me, a.foe, 'recover', false);
			o.afterRecover = a.me.curHP;
			await cast(a.me, a.foe, 'gigadrain', false);
			o.afterDrain = a.me.curHP;
			// --- ELECTRIFY turns the next move Electric (Ground ignores it) ---
			a.me.healBlockTurns = 0;
			const hpBefore = a.foe.curHP;
			await cast(a.me, a.foe, 'tackle', false);
			o.normalTackleHit = a.foe.curHP < hpBefore;
			await cast(a.foe, a.me, 'electrify', true);
			o.electrified = a.me.electrified === true;
			const hp2 = a.foe.curHP;
			await cast(a.me, a.foe, 'tackle', false);
			o.electricTackleBlocked = a.foe.curHP === hp2;
			// --- ION DELUGE electrifies every Normal move this turn ---
			a.me.electrified = false;
			await cast(a.me, a.foe, 'iondeluge', false);
			o.deluge = a.fieldFx.ionDeluge;
			const hp3 = a.foe.curHP;
			await cast(a.me, a.foe, 'tackle', false);
			o.delugeTackleBlocked = a.foe.curHP === hp3;
			await cast(a.me, a.foe, 'watergun', false);
			o.waterStillHits = a.foe.curHP < hp3; // non-Normal moves are untouched
			b.startQueue(() => b.tryRun());
			for (let i = 0; i < 150 && b.active; i++) await wait(60);
			o.cleared = ow.party[0].healBlockTurns === undefined && ow.party[0].electrified === undefined;
			return o;
		});
		A(out.blocked === 5, 'HEAL BLOCK lands for 5 turns', String(out.blocked));
		A(out.afterRecover === 40, 'RECOVER is refused under Heal Block', String(out.afterRecover));
		A(out.afterDrain === 40, 'GIGA DRAIN deals damage but drains nothing under Heal Block', String(out.afterDrain));
		A(out.normalTackleHit, 'a normal Tackle hits the Ground type');
		A(out.electrified && out.electricTackleBlocked, 'ELECTRIFY turns Tackle Electric — the Ground type shrugs it off', JSON.stringify(out));
		A(out.deluge === 1 && out.delugeTackleBlocked, 'ION DELUGE electrifies Normal moves for the turn');
		A(out.waterStillHits, 'non-Normal moves pass through the deluge untouched');
		A(out.cleared, 'the new volatiles clear when the battle ends');

		// --- follower fallbacks ---
		const follow = await page.evaluate(async () => {
			const ow = window.__ow;
			const wait = ms => new Promise(r => setTimeout(r, ms));
			const o = {};
			// a FORM with no sheet borrows its base species' walk sheet
			ow.followSheet('arcanine_hisui');
			for (let i = 0; i < 40 && !(ow.followCache.get('arcanine_hisui') instanceof Image); i++) {
				if (ow.followCache.get('arcanine_hisui') === 'none') break;
				await wait(150);
			}
			o.formFallback = ow.followCache.get('arcanine_hisui') instanceof Image;
			// a fakemon with no sheet anywhere resolves to 'none' and draws its mini
			ow.followSheet('annihilape');
			for (let i = 0; i < 40 && ow.followCache.get('annihilape') !== 'none' && !(ow.followCache.get('annihilape') instanceof Image); i++) await wait(150);
			o.exhausted = ow.followCache.get('annihilape') === 'none';
			ow.followMini('annihilape');
			for (let i = 0; i < 40 && !ow.followMini('annihilape'); i++) await wait(150);
			o.mini = !!ow.followMini('annihilape');
			// the draw path survives both shapes
			try {
				ow.party[0].speciesId = 'annihilape';
				ow.refreshFollower();
				ow.drawFollower(document.createElement('canvas').getContext('2d'), 0, 0);
				o.drew = true;
			} catch (e) { o.drew = 'threw: ' + e.message; }
			return o;
		});
		A(follow.formFallback === true, 'a Hisuian form walks with its base species\' sheet', JSON.stringify(follow));
		A(follow.exhausted === true && follow.mini === true, 'a sheet-less species resolves to its battle-sprite mini');
		A(follow.drew === true, 'the follower draw path handles the fallback', String(follow.drew));

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
