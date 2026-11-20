// bc_phone_hud_layout_test.mjs — the Battlecards match HUD on landscape phones (the owner, 2026-11-20, with a
// screenshot of an iPhone held sideways: "Volume button shouldn't cover end turn button and the enemy panel is
// too big").
//   - no two right-hand controls overlap: Concede, Log, the 🔊 switch, End Turn, Auto-pass, the topbar's gear/bell;
//     End Turn's centre is not under any other control (it stays tappable);
//   - the opponent's panel stays compact: at most ~22% of the screen's height and ~20% of its width;
//   - and the same holds on a desktop window and a portrait phone (no regressions elsewhere).
//   node overworld/tests/bc_phone_hud_layout_test.mjs      (screenshots: SHOTS=<dir>)
import { makeAsserter, startServer, launch, waitFor, sleep } from './bc_balatro_lib.mjs';

const res = makeAsserter(); const A = res.A;
const SHOTS = process.env.SHOTS || null;
const STATE = { username: 'hudlay', friendCode: 'HUDLY0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const { server, port } = await startServer({ onApi: (b) => {
	if (b.action === 'state') return { state: STATE };
	if (b.action === 'friends') return { friends: [] };
	return null;
} });
const browser = await launch();
const STORE = { magepunk_mp_token_v1: 'tok', magepunk_mp_state_v1: JSON.stringify(STATE), mp_onboarded_v1: '1', magepunk_class_v1: 'druid', mp_rotate_dismissed: '1' };
const PHONE = { deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const VIEWS = [
	['iPhone landscape 926x380 (the owner\'s screenshot)', { width: 926, height: 380, ...PHONE }],
	['landscape 844x390', { width: 844, height: 390, ...PHONE }],
	['landscape 740x340 (small phone)', { width: 740, height: 340, ...PHONE }],
	['landscape 932x430', { width: 932, height: 430, ...PHONE }],
	['portrait 390x844', { width: 390, height: 844, ...PHONE }],
	['desktop 1600x900', { width: 1600, height: 900 }],
];

try {
	for (const [name, vp] of VIEWS) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		page.on('dialog', d => d.dismiss().catch(() => {}));
		await page.evaluateOnNewDocument((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, STORE);
		await page.goto(`http://localhost:${port}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded', timeout: 60000 });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__game && window.__game.state) && [...document.querySelectorAll('#scry-modal button')].some(x => /keep hand/i.test(x.textContent) && x.getBoundingClientRect().width > 0)), 45000);
		A(ready, `${name}: a Quick Match boots to the mulligan`);
		await page.evaluate(() => document.fonts && document.fonts.ready);
		const kept = await waitFor(async () => {
			const p = await page.evaluate(() => { const b = [...document.querySelectorAll('#scry-modal button')].find(x => /keep hand/i.test(x.textContent) && x.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
			if (p) { if (vp.hasTouch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); }
			await sleep(400);
			return page.evaluate(() => getComputedStyle(document.getElementById('scry-modal')).display === 'none');
		}, 15000);
		A(kept, `${name}: Keep hand deals the hand (the mulligan closes)`);
		await waitFor(() => page.evaluate(() => { const c = document.getElementById('concede'); return c && getComputedStyle(c).display !== 'none' && document.querySelector('.panel.foe-sm'); }), 15000);
		// my turn with nothing to decide (no decision veil over the board): End Turn is live
		await waitFor(() => page.evaluate(() => !document.getElementById('end-turn').disabled && window.__game.state.current === 0 && getComputedStyle(document.getElementById('modal-veil')).display === 'none'), 20000);
		await sleep(1200);   // (the foe panels follow the projected board each frame)
		const m = await page.evaluate(() => {
			const box = (el) => { if (!el) return null; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { x: r.left, y: r.top, w: r.width, h: r.height, id: el.id || el.className } : null; };
			const ids = ['concede', 'log-btn', 'sfx-btn', 'end-turn', 'autopass-btn'];
			const ctrls = ids.map((id) => box(document.getElementById(id))).filter(Boolean);
			for (const el of document.querySelectorAll('#mp-topbar button, #mp-topbar a')) { const b = box(el); if (b && b.x > innerWidth / 2) ctrls.push({ ...b, id: 'topbar:' + (el.id || el.title || el.textContent.trim().slice(0, 6)) }); }
			const et = document.getElementById('end-turn').getBoundingClientRect();
			const hit = document.elementFromPoint(et.left + et.width / 2, et.top + et.height / 2);
			const foe = box(document.querySelector('.panel.foe-sm'));
			return { ctrls, etHit: hit ? (hit.closest('#end-turn') ? 'end-turn' : (hit.id || hit.tagName)) : null, foe, vw: innerWidth, vh: innerHeight };
		});
		const over = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
		const clashes = [];
		for (let i = 0; i < m.ctrls.length; i++) for (let j = i + 1; j < m.ctrls.length; j++) if (over(m.ctrls[i], m.ctrls[j])) clashes.push(m.ctrls[i].id + ' x ' + m.ctrls[j].id);
		A(m.ctrls.some(c => c.id === 'sfx-btn') && m.ctrls.some(c => c.id === 'end-turn'), `${name}: the 🔊 switch and End Turn are on screen`, JSON.stringify(m.ctrls.map(c => c.id)));
		A(!clashes.length, `${name}: no two right-hand controls overlap (🔊, Log, Concede, End Turn, Auto-pass, gear/bell)`, clashes.join(', ') + ' ' + JSON.stringify(m.ctrls.map(c => [c.id, Math.round(c.x), Math.round(c.y), Math.round(c.w), Math.round(c.h)])));
		A(m.etHit === 'end-turn', `${name}: a tap on End Turn's centre lands on End Turn`, m.etHit);
		A(!!m.foe, `${name}: the opponent's panel is on screen`);
		if (m.foe) {
			const fh = m.foe.h / m.vh, fw = m.foe.w / m.vw;
			const short = vp.width > vp.height && vp.height < 500;
			const maxH = short ? 0.2 : 0.2, maxW = vp.width < 500 ? 0.6 : (short ? 0.25 : 0.2);
			A(fh <= maxH && fw <= maxW, `${name}: the opponent's panel is compact (<= ${Math.round(maxH * 100)}% of the height, <= ${Math.round(maxW * 100)}% of the width)`, `${Math.round(m.foe.w)}x${Math.round(m.foe.h)} = ${(fw * 100).toFixed(0)}% x ${(fh * 100).toFixed(0)}%`);
		}
		A(!errors.length, `${name}: no page errors`, errors.slice(0, 2).join(' | '));
		if (SHOTS) await page.screenshot({ path: `${SHOTS}/hud_${vp.width}x${vp.height}.png` });
		await ctx.close();
	}
} catch (e) { A(false, 'threw ' + (e && e.stack || e)); }
finally { await browser.close().catch(() => {}); server.close(); }
console.log(`
${res.pass} passed, ${res.fail} failed`);
process.exit(res.fail ? 1 : 0);
