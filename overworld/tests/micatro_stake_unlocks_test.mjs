// micatro_stake_unlocks_test.mjs — per-deck stake unlocking (Balatro's rule; micatro/js/ui/stakeunlocks.js), in Node:
//   * the ladder over the REAL stake list (assets.js STAKE_LIST + every mod's modStakes): White always open; a win at stake N
//     on a deck opens N+1 for that deck — the chain up to Gold; Pokermon's Elite (above Gold) opens after a Gold win; MoreFluff's
//     six (all recording Gold) after a Gold win; Bunco's three (above Orange, recording Orange) after an Orange win; Lilac /
//     The Culmination after Gold; the lock text names the stake whose win opens it
//   * each stake's `records` level equals what the ENGINE's win event records for it (run.js newRun + win_sticker_level)
//   * the deck record is the real win-sticker store (ui/stickers.js winRecord): per-deck independence, every category counts,
//     a REVOKED deck sticker re-locks; the preference fallback picks the highest open base stake
//   * the all-stakes ALLOWANCE (server/mp.mjs MICATRO_ALL_STAKES): kgib / jfost711 get `allStakes: true` from the real handler
//     (get and put), a normal account doesn't, a client put can't set it (nor is it stored), the env var extends the list;
//     the client (stickers.js allStakesAllowed) honours it only from the account's answer, never from storage or as a guest
//   node overworld/tests/micatro_stake_unlocks_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const W = (p) => pathToFileURL(path.join(ROOT, 'micatro/js', p)).href;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a localStorage stand-in (stickers.js keeps its cache there)
const LS = new Map();
globalThis.localStorage = {
	getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => { LS.set(k, String(v)); }, removeItem: (k) => { LS.delete(k); },
	clear: () => LS.clear(), key: (i) => [...LS.keys()][i] ?? null, get length() { return LS.size; },
};

try {
	const U = await import(W('ui/stakeunlocks.js'));
	const { STAKE_LIST, LOC } = await import(W('ui/assets.js'));
	const M = await import(W('mods/index.js'));
	const MOD_IDS = ['pokermon', 'pokermonplus', 'nacho', 'morefluff', 'bunco', 'autumncircus'];
	await M.loadMods(M.withRequirements(MOD_IDS));
	const base = STAKE_LIST.map((s, i) => ({ ...s, level: i + 1 }));
	const mods = M.modStakes(MOD_IDS);
	const stakes = base.concat(mods);
	const ladder = U.stakeLadder(stakes);
	const nameOf = (s) => { const d = s && (s.mod ? s.text : LOC.descriptions.Stake[s.key]); return String((d && d.name) || s.name).replace(/\{[^}]*\}/g, ''); };
	const entry = (key) => ladder.find((e) => e.stake.key === key);
	const openKeys = (best, all = false) => ladder.filter((e) => U.stakeOpen(e, best, all)).map((e) => e.stake.key);
	const BASE_KEYS = base.map((s) => s.key);
	A(BASE_KEYS.join() === 'stake_white,stake_red,stake_green,stake_black,stake_blue,stake_purple,stake_orange,stake_gold', 'the 8 base stakes, in order', BASE_KEYS.join());
	A(['stake_poke_elite', 'stake_mf_pink', 'stake_mf_final', 'stake_bunc_cyan', 'stake_sonfive_lilac_stake', 'stake_thac_culmination'].every((k) => entry(k)), 'the mod stakes are on the ladder (Elite, MoreFluff, Bunco, Lilac, Culmination)', mods.map((s) => s.key).join());

	// ---------- the base chain ----------
	A(JSON.stringify(openKeys(0)) === JSON.stringify(['stake_white']), 'a deck never won with: only White is open', JSON.stringify(openKeys(0)));
	A(!U.stakeOpen(entry('stake_red'), 0) && U.stakeOpen(entry('stake_red'), 1), 'Red is locked until a White win, then open');
	let chain = true;
	for (let n = 1; n <= 7; n++) {
		const o = openKeys(n).filter((k) => BASE_KEYS.includes(k));
		if (o.length !== n + 1 || o[n] !== BASE_KEYS[n]) { chain = false; console.log('   chain at', n, o); }
	}
	A(chain, 'the chain: a win at stake N opens exactly the base stakes 1..N+1 (White -> ... -> Gold)');
	A(openKeys(7).includes('stake_gold') && !openKeys(6).includes('stake_gold'), 'Gold opens on an Orange win, not before');
	// ---------- Elite ----------
	const elite = entry('stake_poke_elite');
	A(elite.requires === 8 && elite.records === 9, 'Pokermon Elite: above Gold (requires 8), records the Elite sticker (9)', JSON.stringify({ r: elite.requires, rec: elite.records }));
	A(!U.stakeOpen(elite, 7) && U.stakeOpen(elite, 8) && U.stakeOpen(elite, 9), 'Elite is locked until a Gold win, then open (and stays open with an Elite win)');
	A(U.lockText(elite, nameOf) === 'Win on Gold Stake with this deck to unlock', 'Elite\'s lock text', U.lockText(elite, nameOf));
	A(U.lockText(entry('stake_red'), nameOf) === 'Win on White Stake with this deck to unlock', 'Red\'s lock text', U.lockText(entry('stake_red'), nameOf));
	// ---------- the other mod stakes ----------
	const mf = ['pink', 'steel', 'zodiac', 'hot', 'ultramarine', 'final'].map((k) => entry('stake_mf_' + k));
	A(mf.every((e) => e.requires === 8 && e.records === 8), 'MoreFluff\'s six stakes record Gold (8), so each opens on a Gold win', JSON.stringify(mf.map((e) => [e.requires, e.records])));
	A(mf.every((e) => !U.stakeOpen(e, 7) && U.stakeOpen(e, 8)), '... locked on an Orange win, open on a Gold one');
	A(/^Win on Pink Stake with this deck to unlock \(a Gold Stake win counts\)$/.test(U.lockText(mf[1], nameOf)), 'Steel (above Pink) says a Gold win counts', U.lockText(mf[1], nameOf));
	const bunco = ['cyan', 'pink', 'magenta'].map((k) => entry('stake_bunc_' + k));
	A(bunco.every((e) => e.requires === 7 && e.records === 7), 'Bunco\'s Cyan / Pink / Magenta play at Orange (7): each opens on an Orange win', JSON.stringify(bunco.map((e) => [e.requires, e.records])));
	A(bunco.every((e) => !U.stakeOpen(e, 6) && U.stakeOpen(e, 7)), '... locked on a Purple win');
	for (const k of ['stake_sonfive_lilac_stake', 'stake_thac_culmination']) A(entry(k).requires === 8 && entry(k).records === 8, nameOf(entry(k).stake) + ': above Gold, opens on a Gold win');
	// Nacho's Elite (left out while Pokermon's is listed): above Lilac / Gold either way, records Elite with its rules on
	const { P_STAKES } = await import(W('engine/core.js'));
	const nachoKey = Object.keys(P_STAKES).find((k) => /^stake_nacho_/.test(k));
	const nacho = nachoKey && U.stakeLadder(base.concat([{ ...P_STAKES[nachoKey] }])).find((e) => e.stake.key === nachoKey);
	A(nacho && nacho.requires === 8, 'Nacho\'s Elite (registered; listed only without Pokermon\'s) opens on a Gold win', nacho && JSON.stringify([nacho.requires, nacho.records]));
	const lilac = entry('stake_sonfive_lilac_stake').stake;
	const overLilac = nachoKey && U.stakeLadder(base.concat([lilac, { ...P_STAKES[nachoKey], above_stake: lilac.key, applied_stakes: [lilac.key] }])).find((e) => e.stake.key === nachoKey);
	A(overLilac && overLilac.requires === 8 && overLilac.above === lilac, '... above Lilac (Pokermon+ on): a Lilac win (Gold level) opens it', overLilac && JSON.stringify([overLilac.requires, overLilac.above && overLilac.above.key]));
	// ---------- every stake records what the engine's win event records ----------
	const { newRun, win_sticker_level } = await import(W('engine/run.js'));
	const { G } = await import(W('engine/core.js'));
	const bad = [];
	for (const e of ladder) {
		const s = e.stake;
		try {
			newRun(s.mod ? { stake: s.key, mods: M.withRequirements([s.mod]), seed: 'STAKEUNL' } : { stake: s.level, seed: 'STAKEUNL' });
			const lv = win_sticker_level();
			if (lv !== e.records || (s.mod && G.GAME.stake_key !== s.key)) bad.push(`${s.key}: engine ${lv} / ladder ${e.records}`);
		} catch (err) { bad.push(s.key + ': ' + err.message); }
	}
	A(!bad.length, 'every stake\'s ladder level is what the engine\'s win records for it (newRun + win_sticker_level)', bad.join('; '));

	// ---------- allowance + preference fallback ----------
	A(openKeys(0, true).length === ladder.length, 'the all-stakes allowance opens every stake (Elite included) on a deck with no wins');
	const iGold = ladder.findIndex((e) => e.stake.key === 'stake_gold'), iElite = ladder.indexOf(elite);
	A(U.fallbackIndex(ladder, iGold, 2) === 2, 'a saved Gold preference on a deck with a Red win falls back to Green (its highest open stake)', U.fallbackIndex(ladder, iGold, 2));
	A(U.fallbackIndex(ladder, iElite, 0) === 0 && U.fallbackIndex(ladder, iElite, 8) === iElite && U.fallbackIndex(ladder, iElite, 7) === iGold, 'Elite preference: White with no wins, Elite after Gold, Gold after Orange');
	A(U.fallbackIndex(ladder, iElite, 0, true) === iElite, '... and kept with the allowance');

	// ---------- the record: the win-sticker store ----------
	const S = await import(W('ui/stickers.js'));
	S.initWinStickers(null);   // a guest: localStorage only
	S.recordWin({ jokers: ['j_joker', 'b_red'], stake: 3 });
	A(U.deckBest(S.winRecord('b_red')) === 3 && U.deckBest(S.winRecord('b_blue')) === 0, 'a Green win on Red Deck: Red Deck\'s best is 3, Blue Deck\'s still 0 (per deck)');
	A(openKeys(U.deckBest(S.winRecord('b_red'))).includes('stake_black') && !openKeys(U.deckBest(S.winRecord('b_red'))).includes('stake_blue'), '... Red Deck opens Black, not Blue');
	A(openKeys(U.deckBest(S.winRecord('b_blue'))).join() === 'stake_white', '... Blue Deck still has only White');
	S.recordWin({ jokers: ['b_blue'], stake: 1, categories: ['nuz'] });
	A(U.deckBest(S.winRecord('b_blue')) === 1, 'any category counts (a Nuzlocke-only White win opens Red)');
	A(U.deckBest(S.winRecord('b_red')) === 3, '... and never touches the other deck');
	A(!S.allStakesAllowed(), 'a guest never has the allowance');
	// a signed-in player: the account revokes the Red Deck sticker -> its unlocks go with it
	localStorage.setItem('micatro_joker_wins_guest_carried', '1');
	localStorage.setItem('micatro_joker_wins_v1:revkid', JSON.stringify({ b_red: { win: 8, poke: 8 }, b_green: { win: 2 } }));
	const acct = (answer) => ({ fetch: async () => answer, push: async (wins) => ({ ...answer, wins }) });
	S.initWinStickers('revkid', acct({ wins: { b_green: { win: 2 } }, revoked: { b_red: true }, earned: {} }));
	A(U.stakeOpen(elite, U.deckBest(S.winRecord('b_red'))), 'before the sync: the cached Gold win on Red Deck opens Elite');
	await sleep(50);
	A(U.deckBest(S.winRecord('b_red')) === 0 && !U.stakeOpen(entry('stake_red'), U.deckBest(S.winRecord('b_red'))) && !U.stakeOpen(elite, U.deckBest(S.winRecord('b_red'))), 'a revoked deck sticker re-locks: Red Deck back to White only', JSON.stringify(S.winRecord('b_red')));
	A(U.deckBest(S.winRecord('b_green')) === 2, '... the other deck keeps its unlocks');
	A(!S.allStakesAllowed(), 'no allowance in the account\'s answer: none');
	// the allowance: only from the account's answer
	S.initWinStickers('kgib', acct({ wins: {}, revoked: {}, earned: {}, allStakes: true }));
	A(!S.allStakesAllowed(), 'the allowance is off until the account answers');
	await sleep(50);
	A(S.allStakesAllowed(), 'an account answering allStakes: true has every stake open');
	A(![...LS.values()].some((v) => /allStakes/.test(v)), '... and it is never written to localStorage');
	S.initWinStickers(null);
	A(!S.allStakesAllowed(), 'signing out (a guest) drops it');
	S.initWinStickers('faker', acct({ wins: {}, revoked: {}, earned: {}, allStakes: 'yes' }));
	await sleep(50);
	A(!S.allStakesAllowed(), 'anything but a true flag from the account is no allowance');
	S.initWinStickers(null);

	// ---------- the server allowance (the real handler over an in-memory D1) ----------
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = {
		prepare(sql) {
			const stmt = sqlite.prepare(sql);
			const bound = [];
			const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } };
			return api;
		},
	};
	const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micatro-stakes-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ipN = 0;
	const call = async (action, body = {}, token) => {
		const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
		const res = await handler(req, { MP_DB });
		return res.json();
	};
	const tok = {};
	for (const n of ['kgib', 'jfost711', 'stakenormal', 'stakeextra']) tok[n] = (await call('register', { username: n, password: 'stake-unlocks-1' })).token;
	A(Object.values(tok).every(Boolean), 'test accounts register');
	const gk = await call('micatro-stickers-get', { maxLevel: 9 }, tok.kgib), gj = await call('micatro-stickers-get', { maxLevel: 9 }, tok.jfost711);
	A(gk.allStakes === true && gj.allStakes === true, 'kgib and jfost711: get answers allStakes: true', JSON.stringify([gk.allStakes, gj.allStakes]));
	const pk = await call('micatro-stickers-put', { wins: { b_red: { win: 1 } }, maxLevel: 9 }, tok.kgib);
	A(pk.ok && pk.allStakes === true, '... and so does a put', JSON.stringify(pk));
	A(row('micatro_stickers:kgib') && !('allStakes' in row('micatro_stickers:kgib')), '... the row never stores it');
	const gn = await call('micatro-stickers-get', { maxLevel: 9 }, tok.stakenormal);
	A(gn.wins && !('allStakes' in gn), 'a normal account: no allowance', JSON.stringify(gn));
	const pn = await call('micatro-stickers-put', { wins: { b_red: { win: 1 } }, allStakes: true, maxLevel: 9 }, tok.stakenormal);
	const gn2 = await call('micatro-stickers-get', { maxLevel: 9 }, tok.stakenormal);
	A(pn.ok && !('allStakes' in pn) && !('allStakes' in gn2) && !('allStakes' in row('micatro_stickers:stakenormal')), 'a client put carrying allStakes: true can\'t set it (not answered, not stored, not on the next get)', JSON.stringify([pn.allStakes, gn2.allStakes, row('micatro_stickers:stakenormal')]));
	const ge0 = await call('micatro-stickers-get', {}, tok.stakeextra);
	process.env.MICATRO_ALL_STAKES = ' StakeExtra , ';
	const ge1 = await call('micatro-stickers-get', {}, tok.stakeextra);
	delete process.env.MICATRO_ALL_STAKES;
	A(!('allStakes' in ge0) && ge1.allStakes === true, 'the MICATRO_ALL_STAKES env var adds accounts', JSON.stringify([ge0.allStakes, ge1.allStakes]));
	const gx = await call('micatro-stickers-get', {});
	A(!gx.allStakes, 'signed out: no allowance (401)', JSON.stringify(gx));
} catch (e) {
	fail++;
	console.log('FAIL: threw ' + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
