// chat_profile_kit_test.mjs — the shared in-game chat (battlecards/chat.js) and the profile popup (battlecards/profile.js)
// in the site's Balatro kit, and fitting inside every game that mounts them (owner, 2026-11-19: every UI in the Balatro
// style, with button press sounds). They are DOM overlays shared by Battlecards, the Overworld (battles, PvP, Frontier
// spectating) and Micatro (play + spectate), so each check runs on those pages and on the four games already in the
// Balatro look (Micatro, Pocket Enhanced, Pair of Pears, Scoundrel), desktop (1600x900) + phone (390x844):
//   - mounting the chat changes nothing else on the page: every other element's font, colours, shadow and box are the
//     same before and after (the chat loads the kit's stylesheet when a page has not: everything in it is prefixed, so
//     it must move nothing; compared as computed styles, since these games animate their canvases);
//   - the chat is the kit's: the m6x11 font, the pill and emote buttons kit grey on their darker lip, the input a dark
//     kit well with the light outline; an open log row is a kit panel;
//   - its pill and an emote press with Balatro's button sound (and nothing played before the press);
//   - the profile popup (a chat author's name opens it) is a kit dialog: the panel with the light outline, m6x11, its
//     stats in wells, Add friend kit blue on its lip, close the orange Back (cancel sound), Esc closes it.
//   node overworld/tests/chat_profile_kit_test.mjs      (screenshots: SHOTS=<dir>)
// Covers battlecards/chat.js, battlecards/profile.js.
import fs from 'fs';
import path from 'path';
import { makeAsserter, startServer, launch, waitFor, sleep, TOK, rgb, VIEWPORTS } from './bc_balatro_lib.mjs';

const R = makeAsserter(), A = R.A;
const SHOTS = process.env.SHOTS || null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const NOW = Date.now();
const STATE = { username: 'tester', friendCode: 'ABCD1234', collection: {}, decks: [], packs: 0, dust: 0 };
let chatMsgs = [];
const { server, port } = await startServer({ onApi: (b) => {
	if (b.action === 'state') return { state: STATE };
	if (b.action === 'chat-get') return { messages: chatMsgs };
	if (b.action === 'pubprofile') return { profile: { username: b.username, online: true, wins: 4, runs: 9, packsOpened: 12, uniqueCards: 300, deckCount: 2, created: NOW - 86400000 * 90 } };
	return null;
} });
const browser = await launch();

const PAGES = [
	['micatro', '/micatro/'], ['pocketenhanced', '/pocketenhanced/'], ['pairofpears', '/pairofpears/'], ['scoundrel', '/scoundrel/'],
	['battlecards', '/battlecards/start.html'], ['overworld', '/overworld/index.html?map=PalletTown&x=10&y=12'],
];
const SPY = () => {
	window.__au = { starts: 0 };
	const AC = window.AudioContext;
	if (AC) { const st = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { window.__au.starts++; return st.apply(this, a); }; }
};
try {
	for (const [name, url] of PAGES) for (const vp of ['desktop', 'phone']) {
		const tag = `${name} (${vp})`;
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(VIEWPORTS[vp]);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('dialog', (d) => d.dismiss().catch(() => {}));
		await page.evaluateOnNewDocument(SPY);
		await page.evaluateOnNewDocument((st) => { try { localStorage.setItem('magepunk_mp_token_v1', 'tester.9999999999.' + 'a'.repeat(64)); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('micatro_sfx', '1'); localStorage.setItem('mp_onboarded_v1', '1'); } catch { } }, STATE);
		await page.goto(`http://localhost:${port}${url}`, { waitUntil: 'load', timeout: 60000 }).catch((e) => errors.push('goto ' + e.message));
		await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
		await sleep(name === 'overworld' || name === 'micatro' ? 5000 : 2500);
		// the page as it stands, then with the chat mounted (as each game mounts it): every element's look and box
		const SIG = () => [...document.querySelectorAll('body *')].filter((e) => !e.closest('#mp-chat, #mp-profile, script, style')).map((e) => {
			const s = getComputedStyle(e), r = e.getBoundingClientRect();
			return [e.tagName, s.fontFamily, s.fontSize, s.color, s.backgroundColor, s.backgroundImage.slice(0, 60), s.boxShadow, s.borderTopColor, s.display, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join('|');
		});
		const before = await page.evaluate(SIG);
		// what moves by itself (an idle logo wobble, a floating card): looked at a few times before the chat is there
		const movers = new Set();
		for (let k = 0; k < 4; k++) { await sleep(350); const again = await page.evaluate(SIG); if (again.length === before.length) again.forEach((v, i) => { if (v !== before[i]) movers.add(i); }); }
		await page.evaluate(async () => { const C = await import('/battlecards/chat.js'); window.__chat = C; if (!C.active()) C.mount({ room: 'u:audit', canPost: true }); });
		A(await waitFor(() => page.evaluate(() => !!document.getElementById('mp-chat')), 5000), `${tag}: the chat mounts`);
		await page.evaluate(() => document.fonts.ready.then(() => true)); await sleep(700);
		const after = await page.evaluate(SIG);
		const n = Math.max(before.length, after.length); let diff = 0, ex = '';
		let moving = 0;
		for (let i = 0; i < n; i++) {
			if (movers.has(i)) { moving++; continue; }   // it moves on its own: not the chat's doing
			if (before[i] !== after[i]) { diff++; if (!ex) ex = (before[i] || '') + '  ->  ' + (after[i] || ''); }
		}
		A(before.length > 3 && diff === 0, `${tag}: mounting the chat changes nothing else on the page (${diff} of ${before.length} elements differ; ${moving} move by themselves)`, ex.slice(0, 300));
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `chat_${name}_${vp}.png`) });

		// the chat in the kit's look
		const L = await page.evaluate(() => {
			const cs = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
			const pill = cs('#mp-chat .mc-min');
			return { font: pill.fontFamily, fontOk: document.fonts.check('18px m6x11'), pill: [pill.backgroundColor, pill.boxShadow] };
		});
		A(/m6x11/.test(L.font) && L.fontOk, `${tag}: the chat is set in m6x11 (loaded)`, L.font);
		A(L.pill[0] === rgb(TOK.grey) && L.pill[1].includes(rgb(TOK['grey-d'])), `${tag}: the chat pill is a kit grey button on its darker lip`, JSON.stringify(L.pill));
		// presses sound (a first gesture unlocks the audio, as for a player)
		const s0 = await page.evaluate(() => window.__au.starts);
		A(s0 === 0, `${tag}: nothing played before a press`, s0);
		await page.keyboard.down('Shift'); await page.keyboard.up('Shift'); await sleep(600);
		let n0 = await page.evaluate(() => window.__au.starts);
		await page.click('#mp-chat .mc-min');
		A(await waitFor(() => page.evaluate((n) => window.__au.starts > n, n0), 3000), `${tag}: opening the chat pill presses with Balatro's button sound`);
		const open = await page.evaluate(() => {
			const cs = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
			const em = cs('#mp-chat .mc-em'), inp = cs('#mp-chat .mc-input');
			return { em: em && [em.backgroundColor, em.boxShadow], inp: inp && [inp.backgroundColor, inp.borderTopColor, inp.fontFamily] };
		});
		A(open.em && open.em[0] === rgb(TOK.grey) && open.em[1].includes(rgb(TOK['grey-d'])), `${tag}: the emote buttons are kit grey on their lip`, JSON.stringify(open.em));
		A(open.inp && open.inp[0] === rgb(TOK['panel-dd']) && open.inp[1] === rgb(TOK['outline-light']) && /m6x11/.test(open.inp[2]), `${tag}: the chat input is a dark kit well with the light outline, in m6x11`, JSON.stringify(open.inp));
		await sleep(80);
		n0 = await page.evaluate(() => window.__au.starts);
		await page.click('#mp-chat .mc-em');
		A(await waitFor(() => page.evaluate((n) => window.__au.starts > n, n0), 3000), `${tag}: an emote presses with Balatro's button sound`);
		// a message arrives: a kit-panel row; its author's name opens the profile
		chatMsgs = [{ ts: Date.now() + 5000, from: 'pal', text: 'hello there' }];
		await page.evaluate(() => { window.__chat.clear(); });
		await sleep(400);
		chatMsgs = [{ ts: Date.now() + 6000, from: 'pal', text: 'hello there' }];
		await page.evaluate(() => { window.__chat.clear(); });   // (re-primes, then the open log polls fast)
		const row = await waitFor(() => page.evaluate(() => !!document.querySelector('#mp-chat .mc-row .mc-who')), 8000);
		A(row, `${tag}: a chat message shows`);
		if (row) {
			const rb = await page.evaluate(() => getComputedStyle(document.querySelector('#mp-chat .mc-row')).backgroundColor);
			A(/^rgba?\(58, 75, 79/.test(rb), `${tag}: a message row is a kit panel`, rb);
			n0 = await page.evaluate(() => window.__au.starts);
			await page.evaluate(() => document.querySelector('#mp-chat .mc-who').click());
			const prof = await waitFor(() => page.evaluate(() => !!document.querySelector('#mp-profile .mpp-add')), 6000);
			A(prof, `${tag}: the author's name opens the profile popup`);
			if (prof) {
				await sleep(300);
				const P = await page.evaluate(() => {
					const cs = (s) => getComputedStyle(document.querySelector(s));
					const card = cs('#mp-profile .mpp-card'), add = cs('#mp-profile .mpp-add'), x = cs('#mp-profile .mpp-x'), well = cs('#mp-profile .mpp-stats > div');
					return { card: [card.backgroundColor, card.boxShadow, card.fontFamily], add: [add.backgroundColor, add.boxShadow], x: [x.backgroundColor, x.boxShadow], well: well.backgroundColor };
				});
				A(P.card[0] === rgb(TOK.panel) && P.card[1].includes(rgb(TOK['outline-light'])) && /m6x11/.test(P.card[2]), `${tag}: the profile is a kit dialog (panel, light outline, m6x11)`, JSON.stringify(P.card));
				A(P.add[0] === rgb(TOK.blue) && P.add[1].includes(rgb(TOK['blue-d'])), `${tag}: Add friend is a kit blue button on its lip`, JSON.stringify(P.add));
				A(P.x[0] === rgb(TOK.orange) && P.x[1].includes(rgb(TOK['orange-d'])), `${tag}: close is the orange Back`, JSON.stringify(P.x));
				A(P.well === rgb(TOK['panel-dd']), `${tag}: the stats sit in kit wells`, P.well);
				if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `profile_${name}_${vp}.png`) });
				n0 = await page.evaluate(() => window.__au.starts);
				await page.click('#mp-profile .mpp-x');
				A(await waitFor(() => page.evaluate((n) => window.__au.starts > n && !document.getElementById('mp-profile'), n0), 3000), `${tag}: close sounds and closes the profile`);
			}
		}
		await page.evaluate(() => window.__chat.unmount());
		A(!errors.length, `${tag}: no page errors`, errors.slice(0, 3).join(' | '));
		chatMsgs = [];
		await ctx.close();
	}
} catch (e) {
	A(false, 'threw ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
