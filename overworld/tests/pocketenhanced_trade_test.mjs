// Pocket Enhanced: its side of the site's one trading system (pocketenhanced/js/trade.js; the system itself is
// server/trade.mjs, tested in trade_system_test.mjs), and the timed pack inbox (server/pocket_trade.mjs).
//   1. the rules: what a collection can give; a held bundle is in exactly one place; it comes back or is swapped, once
//   2. a collection keeps what is held through storage and through the device's sync
//   3. the pack inbox: one pack every 12 hours up to 120, paused when full, a claim paid once
//   node overworld/tests/pocketenhanced_trade_test.mjs
import * as C from '../../pocketenhanced/js/collection.js';
import * as T from '../../pocketenhanced/js/trade.js';
import * as PT from '../../pocketenhanced/js/packtimer.js';
import { PRINTS } from '../../pocketenhanced/js/data/packs.js';
import { handlePktrade } from '../../server/pocket_trade.mjs';

let pass = 0, fail = 0;
const A = (ok, msg, extra) => { if (ok) { pass++; console.log('ok  - ' + msg); } else { fail++; console.log('FAIL: ' + msg, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };

const rows = new Map(); let NOW = 1_800_000_000_000;
const store = {
	get: async k => (rows.has(k) ? JSON.parse(rows.get(k)) : null),
	setIfRev: async (k, v, expect) => { const cur = rows.has(k) ? JSON.parse(rows.get(k)) : null; if (((cur && cur.rev) || 0) !== expect) return false; rows.set(k, JSON.stringify(v)); return true; },
};
const call = (u, action, body) => handlePktrade({ action, body: body || {}, store, username: u, json: (o, status) => ({ ...o, status: status || 200 }), now: NOW });
const of = r => PRINTS.filter(p => p[2] === r).map(p => p[0]);
const D1 = of('1D'), S2 = of('2S');
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

// ===== 1. the rules =====
{
	const c = { ...C.newCollection(), prints: { [D1[0]]: 3, [S2[0]]: 1 }, packs: 4 }, tid = 'T00001T00002', all0 = T.everything(c);
	A(T.whyNotGive(c, { prints: { [D1[0]]: 3, [S2[0]]: 1 }, packs: 4 }) === null && /do not have/.test(T.whyNotGive(c, { prints: { [D1[0]]: 4 } })) && /do not have/.test(T.whyNotGive(c, { prints: { [D1[1]]: 1 } })) && /no such/.test(T.whyNotGive(c, { prints: { nope: 1 } })) && /packs/.test(T.whyNotGive(c, { packs: 5 })), 'a collection can give any cards and packs it has (of any rarity), and is told why not otherwise');
	const h = T.holdBundle(c, tid, { prints: { [D1[0]]: 2, [S2[0]]: 1 }, packs: 3 }, 5);
	A(h.prints[D1[0]] === 1 && !h.prints[S2[0]] && h.packs === 1 && h.escrow[tid].prints[D1[0]] === 2 && h.escrow[tid].packs === 3 && same(T.everything(h), all0), 'holding a bundle takes it out of the cards and packs owned and keeps it under the trade: nothing is made or lost');
	A(T.holdBundle(h, tid, { packs: 1 }, 6) === null && T.holdBundle(c, 'x', { packs: 1 }, 6) === null && T.holdBundle(c, tid, { prints: { [D1[0]]: 9 } }, 6) === null && !!T.holdBundle(c, tid, {}, 6).escrow[tid], 'one hold for one trade; a bundle the collection does not have holds nothing; an empty bundle is held too (its owner still receives through it)');
	const back = T.releaseBundle(h, tid), got = T.receiveBundle(h, tid, { prints: { [D1[5]]: 2 }, packs: 1 });
	A(same(back.prints, c.prints) && back.packs === 4 && !back.escrow && got.prints[D1[0]] === 1 && got.prints[D1[5]] === 2 && got.packs === 2 && !got.escrow && T.releaseBundle(c, tid) === null && T.receiveBundle(c, tid, { packs: 1 }) === null && T.releaseBundle(back, tid) === null, 'what is held comes back, or is swapped for the other bundle: once (with nothing held, nothing happens)');
	A(T.receiveBundle({ ...h, prints: { ...h.prints, [D1[5]]: C.MAX_COPIES - 1 } }, tid, { prints: { [D1[5]]: 5 }, packs: 5000 }).prints[D1[5]] === C.MAX_COPIES, 'receiving never passes the most copies a collection keeps');
	// ===== 2. through storage and the sync =====
	const round = C.cleanCollection(JSON.parse(JSON.stringify(h)));
	A(round.escrow[tid].prints[D1[0]] === 2 && round.escrow[tid].packs === 3 && C.sameCollection(round, h) && !C.sameCollection(round, c) && !C.sameCollection(h, T.holdBundle(c, tid, { prints: { [D1[0]]: 1 } }, 5)) && C.cleanCollection({ ...c, escrow: { 'bad id!': { packs: 1 } } }).escrow === undefined, 'a collection keeps what is held through storage, and two collections holding different things are not the same');
	A(C.merge3(c, c, h).escrow[tid].packs === 3 && C.merge3(c, c, h).packs === 1 && C.merge3(h, h, back).escrow === undefined && C.merge3(h, C.addPacks(h, 2), h).escrow[tid].packs === 3 && C.merge3(h, C.addPacks(h, 2), h).packs === 3, "a device takes held cards from the account's copy, and a pack earned on the device meanwhile does not put them back");
}

// ===== 3. the pack inbox =====
{
	const H = 3600_000, t0 = 1_000_000_000_000;
	let s = PT.accrue(null, t0);
	A(s.inbox === 0 && s.base === t0 && PT.etaMs(s, t0) === PT.PACK_TIMER_MS && PT.PACK_TIMER_MS === 12 * H && PT.PACK_INBOX_CAP === 120, 'a new player starts with an empty inbox and 12 hours to wait (Battlecards\' numbers)');
	s = PT.accrue(s, t0 + 11 * H); A(s.inbox === 0 && PT.etaMs(s, t0 + 11 * H) === H, 'nothing before 12 hours; the wait counts down');
	s = PT.accrue(s, t0 + 30 * H); A(s.inbox === 2 && PT.etaMs(s, t0 + 30 * H) === 6 * H, 'after 30 hours, two packs, and the 6 hours left over count toward the third');
	const c1 = PT.claim(s, t0 + 30 * H); A(c1.claimed === 2 && c1.st.inbox === 0 && PT.etaMs(c1.st, t0 + 30 * H) === 6 * H && PT.claim(c1.st, t0 + 30 * H).claimed === 0, 'collecting empties the inbox and does not restart the wait; there is nothing to collect twice');
	const full = PT.accrue(s, t0 + 5000 * H); A(full.inbox === 120 && PT.etaMs(full, t0 + 5000 * H) === null && PT.accrue(full, t0 + 9000 * H).inbox === 120, 'the inbox holds 120; while it is full the timer is paused');
	const c2 = PT.claim(full, t0 + 9000 * H); A(c2.claimed === 120 && PT.etaMs(c2.st, t0 + 9000 * H) === PT.PACK_TIMER_MS, 'collecting a full inbox starts the timer again from then');
	A(PT.etaText(null).startsWith('paused') && PT.etaText(5 * H + 12 * 60000) === '5 h 12 min' && PT.etaText(30_000) === '1 min' && PT.cleanInbox({ base: 'x' }) === null && PT.cleanInbox({ base: 5, inbox: 9999 }).inbox === 120, 'the wait is said in hours and minutes; a stored inbox is read defensively');
	// the server
	NOW = 1_900_000_000_000;
	A((await call(null, 'pkinbox-get')).status === 401, 'the inbox on the account needs an account');
	const g0 = await call('ann', 'pkinbox-get'); A(g0.inbox === 0 && g0.nextMs === PT.PACK_TIMER_MS && g0.cap === 120, 'a first look starts the timer', g0);
	NOW += 25 * H; const g1 = await call('ann', 'pkinbox-get'); A(g1.inbox === 2 && g1.nextMs === 11 * H, 'two packs have arrived 25 hours later', g1);
	A((await call('ann', 'pkinbox-claim', {})).status === 400, 'a claim names itself');
	const k1 = await call('ann', 'pkinbox-claim', { id: 'claim00001' }), k2 = await call('ann', 'pkinbox-claim', { id: 'claim00001' }), k3 = await call('ann', 'pkinbox-claim', { id: 'claim00002' });
	A(k1.claimed === 2 && k2.claimed === 2 && k2.again === true && k3.claimed === 0 && (await call('ann', 'pkinbox-get')).inbox === 0, 'a claim pays what is there; asked again with the same id it gives the same answer (a lost answer is not a lost pack, nor a second one)', { k1, k2, k3 });
	A((await call('bob', 'pkinbox-get')).inbox === 0, "another player's inbox is their own");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
