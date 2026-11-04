// battle_stale_resume_test.mjs — an escaped wild battle came back after a reload
// (playtest 2026-10-15, bug:1792111302896-instinctloretest0918).
//
// Ran from a wild CONIFUR ("Got away safely!"), saved, reloaded: the SAME battle
// resumed — same HP, same stat stages. magepunk_battle_v1 still held it. The
// battle's own tab clears that key the frame the battle ends; what wrote it back
// was a second tab. tab_lock pauses an older tab but only blocked the synced save
// keys, so a paused tab still in that battle kept writing its snapshot (every
// 1.5s, and on pagehide when it was closed or reloaded).
//
//   1. two tabs: A is mid-battle, B opens (A pauses) and resumes it, B runs away;
//      closing A must not write the finished battle back, and B reloads to the
//      overworld
//   2. one tab: a reload between "Got away safely!" and the battle closing lands
//      the escape — it does not put you back in the fight
//   3. a catch decided before the reload lands the catch (the mon is yours)
//   4. defence in depth at boot: a snapshot of a battle that already ENDED (its id
//      is the last ended id) is refused; so is one whose foe is already down
//   5. a genuine mid-battle reload still resumes it exactly (owner rule)
//
// Covers: overworld/ow_battleresume.js, overworld/battle.js, overworld/main.js, overworld/tab_lock.js
//   node overworld/tests/battle_stale_resume_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9278;
const KEY = 'magepunk_battle_v1';
const STATE = { username: 'staleresume', friendCode: 'STAL01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
// RUN AWAY: every escape roll succeeds, so the run is deterministic
const PARTY = [{
	speciesId: 'pidgeot', name: 'PIDGEOT', level: 40, gender: 'M', friend: 70, types: ['Normal', 'Flying'], ability: 'runaway',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 140, atk: 90, def: 90, spa: 90, spd: 90, spe: 120 }, maxHP: 140, curHP: 140,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's18.png', num: 18,
}];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

const URL_ = `http://localhost:${PORT}/overworld/index.html?map=Route113`;
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const errors = [];
	const open = async () => {
		const p = await browser.newPage();
		p.on('pageerror', e => errors.push(String(e.message)));
		await p.evaluateOnNewDocument((st, party) => {
			if (location.protocol !== 'http:') return;   // about:blank has no storage
			if (localStorage.getItem('magepunk_mp_token_v1')) return;
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		return p;
	};
	const boot = async p => {
		await p.goto(URL_, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await p.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world.current)).catch(() => false)); i++) await sleep(100);
		await sleep(1500);   // let a resumed battle (if any) come up
	};
	const startWild = p => p.evaluate(async () => {
		const O = window.__ow, b = O.battle;
		O.startWildBattle({ id: 'zigzagoon', level: 15 });
		for (let i = 0; i < 300 && !(b.active && b.active.phase === 'menu'); i++) await new Promise(r => setTimeout(r, 60));
		b.active.foeBoosts.atk = -2; b.active.foeBoosts.acc = 2;   // the tester's tell: the old stat stages
		await new Promise(r => setTimeout(r, 2000));   // the snapshot tick
		return JSON.parse(localStorage.getItem('magepunk_battle_v1') || 'null');
	});
	const battleState = p => p.evaluate(() => { const b = window.__ow.battle, a = b.active; return { blocking: b.blocking, foe: a?.foe?.speciesId || null, atk: a?.foeBoosts?.atk ?? null, phase: a?.phase || null }; });
	// RUN from the menu with real keys, and answer the messages until it closes
	const runAway = p => p.evaluate(async () => {
		const O = window.__ow, b = O.battle;
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		for (let i = 0; i < 100 && !(b.active && b.active.phase === 'menu'); i++) { press('z'); await new Promise(r => setTimeout(r, 80)); }
		press('ArrowDown'); await new Promise(r => setTimeout(r, 80)); press('ArrowRight'); await new Promise(r => setTimeout(r, 80)); press('z');
		for (let i = 0; i < 150 && b.active; i++) {
			if (b.active.phase === 'msg') press('z');
			// a slow machine can drop the menu keys: a key swallowed mid-transition
			// leaves the menu up, so pick RUN again
			else if (i % 20 === 19 && b.active.phase === 'menu') b.startQueue(() => b.tryRun());
			await new Promise(r => setTimeout(r, 80));
		}
		await new Promise(r => setTimeout(r, 300));
		return { over: !b.blocking, key: localStorage.getItem('magepunk_battle_v1'), ended: localStorage.getItem('magepunk_battle_ended_v1') };
	});

	// ===== 1. two tabs =====
	const pa = await open();
	await boot(pa);
	const savedA = await startWild(pa);
	A(savedA && savedA.snap && savedA.snap.foe.speciesId === 'zigzagoon', '1. tab A: the battle snapshots itself', JSON.stringify(savedA && savedA.end));
	const pb = await open();
	await boot(pb);
	const resumedB = await battleState(pb);
	A(resumedB.blocking && resumedB.foe === 'zigzagoon' && resumedB.atk === -2, '1. tab B opens and resumes that battle (same foe, same stat stages)', JSON.stringify(resumedB));
	const ranB = await runAway(pb);
	A(ranB.over && ranB.key === null, '1. tab B runs: "Got away safely!" and the save is cleared', JSON.stringify(ranB));
	await sleep(2500);   // tab A, paused, is still in the fight
	await pa.goto('about:blank');   // tab A goes away (pagehide)
	await sleep(400);
	const leftover = await pb.evaluate(() => localStorage.getItem('magepunk_battle_v1'));
	A(leftover === null, '1. closing the paused tab does not write the finished battle back', String(leftover).slice(0, 120));
	await pa.close();
	await boot(pb);
	const after1 = await battleState(pb);
	A(!after1.blocking, '1. reloading after the escape lands in the overworld, not the old battle', JSON.stringify(after1));

	// ===== 2. one tab: reload after the escape is decided, before it closes =====
	await startWild(pb);
	const mid = await pb.evaluate(async () => {
		const O = window.__ow, b = O.battle;
		b.startQueue(() => b.tryRun());                 // RUN AWAY: it succeeds
		for (let i = 0; i < 50 && !(b.active && b.active.decided); i++) await new Promise(r => setTimeout(r, 20));
		O.persistBattle();                              // the pagehide flush
		return { decided: b.active?.decided || null, saved: JSON.parse(localStorage.getItem('magepunk_battle_v1') || 'null') };
	});
	A(mid.decided === 'escaped' && mid.saved && mid.saved.decided === 'escaped' && !mid.saved.snap, '2. once the escape is decided the save says so (no refightable snapshot)', JSON.stringify({ d: mid.decided, saved: mid.saved && { decided: mid.saved.decided, snap: !!mid.saved.snap } }));
	await boot(pb);
	const after2 = await battleState(pb);
	A(!after2.blocking, '2. a reload in that moment lands the escape, not the fight', JSON.stringify(after2));

	// ===== 3. a decided catch lands the catch =====
	await startWild(pb);
	await pb.evaluate(() => { const b = window.__ow.battle; b.active.caughtMon = b.active.foe; window.__ow.persistBattle(); });
	await boot(pb);
	const after3 = await pb.evaluate(async () => {
		// the catch's own "Give a nickname?" prompt: decline it
		for (let i = 0; i < 10 && window.__ow.dialog.blocking; i++) { dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true })); await new Promise(r => setTimeout(r, 80)); }
		return { blocking: window.__ow.battle.blocking, have: [...window.__ow.party, ...JSON.parse(localStorage.getItem('magepunk_box_v1') || '[]')].filter(m => m.speciesId === 'zigzagoon').length };
	});
	A(!after3.blocking && after3.have === 1, '3. a catch decided before the reload is kept, and the battle does not return', JSON.stringify(after3));

	// ===== 4. defence in depth at boot =====
	const saved4 = await startWild(pb);
	await runAway(pb);
	const ended4 = await pb.evaluate(s => { localStorage.setItem('magepunk_battle_v1', JSON.stringify(s)); return localStorage.getItem('magepunk_battle_ended_v1'); }, saved4);   // a stale writer
	await boot(pb);
	A(!(await battleState(pb)).blocking, '4. a copy of a battle that already ended is refused at boot', JSON.stringify([saved4 && saved4.id, ended4]));
	const saved4b = await startWild(pb);
	await runAway(pb);
	saved4b.id = 'other'; saved4b.snap.foe.curHP = 0;
	await pb.evaluate(s => localStorage.setItem('magepunk_battle_v1', JSON.stringify(s)), saved4b);
	await boot(pb);
	A(!(await battleState(pb)).blocking, '4. ...and so is one whose foe is already down');

	// ===== 5. a real mid-battle reload still resumes, exactly =====
	await startWild(pb);
	await boot(pb);
	const after5 = await battleState(pb);
	A(after5.blocking && after5.foe === 'zigzagoon' && after5.atk === -2, '5. a genuine mid-battle reload resumes the same battle (stat stages and all)', JSON.stringify(after5));
	const ran5 = await runAway(pb);
	A(ran5.over && ran5.key === null, '5. ...and running from the resumed battle clears it', JSON.stringify(ran5));

	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
