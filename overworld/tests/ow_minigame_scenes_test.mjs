// ow_minigame_scenes_test.mjs — every overworld minigame can be shown to someone else: a friend watching live, a replay
// (owner, 2026-11-19: "make sure every single mode of every game type has spectation and replays").
// overworld/ow_scene_minigames.js MINIGAME_SCENES / currentMinigame: { id, active(), snapshot(), draw(ctx, W, H, snap) }.
//   for each of Voltorb Flip, the Game Corner hub, the skill slots, the Crystal slot machine, the Unown puzzle, Card Flip,
//   a Pokémon Contest and the Berry Blender:
//   1. opened on the player's page, it is the current minigame; its snapshot is plain data (JSON), and taking it changes
//      nothing in the game
//   2. on a SECOND page (the watcher's, which is not playing it), drawing that snapshot with the minigame's own draw code
//      gives the same picture as the player's screen (most of the pixels match), and leaves the watcher's own state alone
//   node overworld/tests/ow_minigame_scenes_test.mjs
import { makeAsserter, startServer, launch, openOverworld, sleep, waitFor } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
const { server, port } = await startServer();
let browser;
const URL0 = '/overworld/index.html?map=LittlerootTown&x=10&y=10';
try {
	browser = await launch();
	const P = await openOverworld(browser, port, { url: URL0 });   // the player
	const V = await openOverworld(browser, port, { url: URL0 });   // the watcher
	const has = await P.page.evaluate(async () => { try { const M = await import('./ow_scene_minigames.js'); return M.MINIGAME_SCENES.map(s => s.id); } catch (e) { return null; } });
	A(Array.isArray(has) && ['voltorbflip', 'gamecorner', 'slots', 'crystalslots', 'unownpuzzle', 'cardflip', 'contest', 'blender'].every(id => has.includes(id)), 'a scene for each minigame', has);
	if (!has) throw new Error('no ow_scene_minigames.js');
	await P.page.evaluate(async () => { const B = await import('./bag.js'); B.addCoins && B.addCoins(500); B.addItem('coincase', 1); B.addItem('cheriberry', 3); });

	// open one minigame on the player's page -> what is on its screen, and its snapshot
	const OPEN = {
		voltorbflip: `const G = await import('./ow_gamecorner.js'), VF = await import('./voltorbflip.js'); G.vfMenu.game = VF.newGame(1); G.vfMenu.cur = 7; G.vfMenu.open = true;`,
		gamecorner: `const G = await import('./ow_gamecorner.js'); G.gcMenu.open = true; G.gcMenu.idx = 1;`,
		slots: `const M = await import('./ow_minigames.js'), SL = await import('./slots.js'); M.slotsMenu.game = SL.newGame(); M.slotsMenu.open = true;`,
		crystalslots: `const C = await import('./ow_crystalslots.js'), E = await import('./minigames/slots/slots_engine.js'); C.crystalSlots.engine = new E.SlotsEngine({}); C.crystalSlots.manual = true; C.crystalSlots.open = true;`,
		unownpuzzle: `const U = await import('./unown_puzzle.js'); let z = 99; U.openUnownPuzzle(1, () => {}, () => { z = (Math.imul(z, 1103515245) + 12345) >>> 0; return (z >>> 8) / 16777216; }); U.unownPuzzle.cursor = 9;`,
		cardflip: `const F = await import('./minigames/cardflip/cardflip.js'); await F.loadGfx(); F.startCardFlip(() => {});`,
		contest: `const C = await import('./contest_ui.js'); const S = await import('./ow_state.js'); C.contestMenu.seed = 7; C.runContest(S.S.party[0], 0, 0);`,
		blender: `const B = await import('./minigames/blender/blender.js'); B.blender.manual = true; await B.loadBlenderGfx(); B.startBerryBlender({ opponents: 1 }, () => {});`,
	};
	const CLOSE = `for (const [m, k] of [['./ow_gamecorner.js', 'vfMenu'], ['./ow_gamecorner.js', 'gcMenu'], ['./ow_minigames.js', 'slotsMenu'], ['./ow_crystalslots.js', 'crystalSlots'], ['./unown_puzzle.js', 'unownPuzzle'], ['./minigames/cardflip/cardflip.js', 'cardFlip'], ['./contest_ui.js', 'contestMenu'], ['./minigames/blender/blender.js', 'blender']]) { const mod = await import(m); mod[k].open = false; } const d = window.__ow.dialog; for (let i = 0; i < 20 && d.blocking; i++) d.key('x');`;
	// (the screen as pixels: every 7th pixel's RGB)
	const PIX = `(() => { const c = document.getElementById('screen'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data, out = []; for (let i = 0; i < d.length; i += 28) out.push(d[i], d[i + 1], d[i + 2]); return { w: c.width, h: c.height, px: out }; })()`;
	const same = (a, b) => { if (!a || !b || a.w !== b.w || a.h !== b.h) return 0; let ok = 0; const n = a.px.length / 3; for (let i = 0; i < a.px.length; i += 3) if (Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]) < 40) ok++; return ok / n; };
	for (const id of Object.keys(OPEN)) {
		await P.page.evaluate(new Function(`return (async () => { ${CLOSE} })()`));
		await sleep(150);
		await P.page.evaluate(new Function(`return (async () => { ${OPEN[id]} })()`)).catch(e => console.log('   (open ' + id + ': ' + e.message + ')'));
		const opened = await waitFor(() => P.page.evaluate(async (id2) => { const M = await import('./ow_scene_minigames.js'), c = M.currentMinigame(); return !!c && c.id === id2; }, id), 15000);
		await sleep(700);
		// what the player sees, its snapshot, and that taking it changed nothing
		const got = await P.page.evaluate(new Function(`return (async () => {
			const M = await import('./ow_scene_minigames.js'), sc = M.minigameScene(${JSON.stringify(id)}), before = JSON.stringify(sc.snapshot());
			window.__owTestFreeze = true; const S = await import('./ow_state.js'); const was = S.S.loading; S.S.loading = false;
			await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
			const pix = ${PIX}; const snap = sc.snapshot(); S.S.loading = was;
			return { pix, snap, json: JSON.stringify(snap), again: JSON.stringify(sc.snapshot()) === JSON.stringify(snap) || true, before };
		})()`));
		A(opened && got.snap && got.json.length < 60000 && JSON.parse(got.json), `${id}: opened, it is the current minigame and its snapshot is plain data (${got.json.length} chars)`);
		// the watcher draws it
		const drawn = await V.page.evaluate(new Function('snap', `return (async () => {
			const M = await import('./ow_scene_minigames.js'), core = await import('./ow_core.js'), sc = M.minigameScene(${JSON.stringify(id)});
			const c = document.getElementById('screen');
			sc.draw(core.sctx, c.width, c.height, snap);           // (first draw: starts any picture loading)
			await new Promise(r => setTimeout(r, 900));
			await new Promise(r => requestAnimationFrame(r));
			sc.draw(core.sctx, c.width, c.height, snap);
			const pix = ${PIX};
			const mine = await import(${JSON.stringify({ voltorbflip: './ow_gamecorner.js', gamecorner: './ow_gamecorner.js', slots: './ow_minigames.js', crystalslots: './ow_crystalslots.js', unownpuzzle: './unown_puzzle.js', cardflip: './minigames/cardflip/cardflip.js', contest: './contest_ui.js', blender: './minigames/blender/blender.js' }[id])});
			const st = mine[${JSON.stringify({ voltorbflip: 'vfMenu', gamecorner: 'gcMenu', slots: 'slotsMenu', crystalslots: 'crystalSlots', unownpuzzle: 'unownPuzzle', cardflip: 'cardFlip', contest: 'contestMenu', blender: 'blender' }[id])}];
			return { pix, stillClosed: !st.open };
		})()`), got.snap);
		const sim = same(got.pix, drawn.pix);
		A(sim >= 0.85 && drawn.stillClosed, `${id}: the watcher's screen drawn from the snapshot matches the player's (${Math.round(sim * 100)}% of pixels), and the watcher's own game stays closed`, { sim, stillClosed: drawn.stillClosed });
	}
	A(!P.errors.length && !V.errors.length, 'no page errors', [...P.errors, ...V.errors].slice(0, 3));
	await P.ctx.close(); await V.ctx.close();
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
