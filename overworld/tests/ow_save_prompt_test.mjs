// ow_save_prompt_test.mjs — OPTIONS > SERVER BACKUPS asks with the game's own YES / NO
// (controls sweep B6), not the browser's confirm(): a controller could never answer
// that. Both answers on all three inputs:
//   keyboard   X and Esc say NO; ↑ then Z says YES
//   controller B says NO; ↑ then A says YES
//   touch      the NO row and CLOSE say NO; the YES row says YES
// NO must change nothing: no restore request, no reload, every localStorage key the
// same. YES runs the restore exactly as before (the server is asked for the slot).
// A confirm() / alert() left anywhere in the overworld's code fails the scan at the end.
//
//   node overworld/tests/ow_save_prompt_test.mjs
import fs from 'fs';
import path from 'path';
import { makeAsserter, startServer, launch, openOverworld, sleep, waitFor, canvasToClient, ROOT } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
let restores = 0;
const { server, port } = await startServer({ onApi: b => (b.action === 'ow-restore' ? (restores++, { ok: true, ow: null }) : null) });
const BTN = { bottom: 0, right: 1, up: 12 };
let browser;
try {
	browser = await launch();
	for (const how of ['keyboard', 'pad', 'touch']) {
		const t = await openOverworld(browser, port, { pad: how === 'pad', touch: how === 'touch', viewport: how === 'touch' ? { width: 390, height: 844 } : undefined });
		const { page } = t;
		const tapBtn = async b => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(90); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(150); };
		const tapId = async id => {
			const b = await page.evaluate(id => window.__ow.menuUi.find(b => b.id === id), id);
			if (!b) return false;
			const p = await canvasToClient(page, b.x + b.w / 2, b.y + b.h / 2);
			await page.touchscreen.tap(Math.round(p.x), Math.round(p.y)); await sleep(200);
			return true;
		};
		const snapshot = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
		// open SERVER BACKUPS' question for one backup (the screen's own restoreBackup)
		const ask = async () => {
			await page.evaluate(async () => {
				const O = window.__ow; O.optionsMenu.open = true; O.optionsMenu.mode = 'backups'; O.optionsMenu.list = [{ slot: '2026-11-01', bytes: 4096 }]; O.optionsMenu.busy = false;
				window.__nav = 0; addEventListener('beforeunload', () => { window.__nav++; });
				(await import('./ow_saves.js')).restoreBackup(O.optionsMenu.list[0]);
			});
			await sleep(250);
			return page.evaluate(async () => { const c = (await import('./choice.js')).choiceMenu; return { open: c.open, options: c.options.join('/'), idx: c.idx, drawn: window.__ow.menuUi.some(b => b.id === 'choice:0') }; });
		};
		const noAnswers = how === 'keyboard' ? [['X', () => page.keyboard.press('KeyX')], ['Esc', () => page.keyboard.press('Escape')]]
			: how === 'pad' ? [['B', () => tapBtn(BTN.bottom)]]
			: [['the NO row', () => tapId('choice:1')], ['CLOSE', () => tapId('close')]];
		for (const [label, answer] of noAnswers) {
			const before = await snapshot(), r0 = restores;
			let dialogs = 0; page.on('dialog', d => { dialogs++; d.dismiss(); });
			const q = await ask();
			A(q.open && q.options === 'YES/NO' && q.idx === 1 && q.drawn, `${how}: the restore asks with the in-game YES / NO (NO selected), drawn over OPTIONS`, JSON.stringify(q));
			await answer(); await sleep(500);
			const after = await snapshot();
			const open = await page.evaluate(async () => (await import('./choice.js')).choiceMenu.open);
			A(!open && restores === r0 && after === before && dialogs === 0, `${how}: ${label} says NO — nothing restored, the save unchanged, no browser pop-up`, JSON.stringify({ open, asked: restores - r0, same: after === before, dialogs }));
			A(await page.evaluate(() => window.__ow.optionsMenu.open && window.__ow.optionsMenu.mode === 'backups'), `${how}: ...and the BACKUPS screen is still there`);
		}
		// YES: the restore goes ahead (the stub server has no snapshot to give, so nothing is laid down — the request is what counts)
		{
			const r0 = restores;
			await ask();
			if (how === 'keyboard') { await page.keyboard.press('KeyW'); await sleep(120); await page.keyboard.press('KeyZ'); }
			else if (how === 'pad') { await tapBtn(BTN.up); await tapBtn(BTN.right); }
			else await tapId('choice:0');
			await waitFor(() => restores > r0, 4000);
			A(restores === r0 + 1, `${how}: YES runs the restore (the server is asked for the backup)`, String(restores - r0));
		}
		A(t.errors.length === 0, `${how}: no page errors`, t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
	// no browser pop-up is left in the overworld's code
	const left = [];
	const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, f.name);
		if (f.isDirectory()) { if (!/^(tests|data|node_modules|pokechess)$/.test(f.name)) walk(p); continue; }
		if (!/\.js$/.test(f.name) || /^(mapedit|followtest|spritetune)\.js$/.test(f.name)) continue;
		fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((l, i) => { if (/(^|[^.\w])(confirm|alert)\s*\(/.test(l.replace(/\/\/.*$/, ''))) left.push(`${path.relative(ROOT, p)}:${i + 1}`); });
	} };
	walk(path.join(ROOT, 'overworld'));
	A(!left.length, 'no confirm() / alert() left in the overworld (the debug tools aside)', left.join(' '));
} catch (e) {
	A(false, 'suite crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
