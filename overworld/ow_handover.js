// ow_handover.js — the overworld handing its things to a trade when the game itself is not on screen (the site's
// Inventory page, inventory/inventory.js). The rule stands: the server never writes a save; the GAME takes what was
// offered out of it and says so. This is the game's own code doing that, on the device that holds the save, with the
// same journal the game uses (ow_tradelog.js): the game picks up from it the next time it starts, as it would after
// a trade made inside it.
//
// The save is on this device, cached in memory by a running game and copied to the account. So before anything is
// taken out, two things must hold (`whyNot`), or the hand-over is refused:
//   1. no overworld game is running in another tab. A running game holds the party in memory and writes its copy back
//      (tab_lock.js): what was handed over here would reappear. A running game answers on the tab lock's channel.
//   2. this device's save is not BEHIND the account's (another device has played since). The game would take the
//      account's copy the next time it starts here, undoing the hand-over; the player opens the game here first.
// Then, like the game's own push (ow_saves.js pushOw): the revision is stepped and the save is sent to the account,
// so every other device takes this copy, journal and all.
//
// Only what is asked of the game is done here: take out (handOver), and bring in what has arrived or come back
// (settle). Nothing else in the save is read or changed.
import * as MP from '../battlecards/mpmode.js';
import { OW_RESET_KEYS } from '../site/owreset.js';
import * as Bag from './bag.js';
import * as TL from './ow_tradelog.js';
import { safeLoad, safeSave, safeSaveStr } from './safestore.js';

const PARTY_KEY = 'magepunk_party_v1', BOX_KEY = 'magepunk_box_v1', BAG_KEY = 'magepunk_bag_v1', REV_KEY = 'magepunk_ow_rev';
// what the game sends to the account (ow_saves.js OW_KEYS: the save without the battle in progress and the device-only notes)
const NOT_SENT = ['magepunk_battle_v1', 'magepunk_battle_ended_v1', 'magepunk_ow_conflict', 'magepunk_ow_conflict_archive', 'magepunk_ow_story_conflict'];
export const SENT_KEYS = OW_RESET_KEYS.filter(k => !NOT_SENT.includes(k));
const arr = k => { const v = safeLoad(k, []); return Array.isArray(v) ? v : []; };
const call = async (a, b) => { try { return await MP.call(a, b || {}); } catch (e) { return null; } };
const localRev = () => Math.max(0, parseInt(localStorage.getItem(REV_KEY), 10) || 0);
const journal = () => TL.readJournal(JSON.stringify(safeLoad(TL.JOURNAL_KEY, {})));

/** What the save on this device holds that can be put up: { party, box, bag, money, coins }. */
export function holdings() { return { party: arr(PARTY_KEY), box: arr(BOX_KEY), bag: Bag.getBag() || {}, ...Bag.getPurse() }; }
/** Is there a game here at all? (A device that has never played has nothing to hand over.) */
export const hasGame = () => arr(PARTY_KEY).length > 0;

/** Is an overworld game running in another tab? It answers "here" to "who" (tab_lock.js). */
export function gameRunning(waitMs = 450) {
	return new Promise(resolve => {
		if (typeof BroadcastChannel === 'undefined') return resolve(false);
		let ch = null, done = false; const end = v => { if (done) return; done = true; try { ch.close(); } catch (e) { /* gone */ } resolve(v); };
		try { ch = new BroadcastChannel('magepunk-ow'); } catch (e) { return resolve(false); }
		const id = 'inv' + Math.random().toString(36).slice(2);
		ch.onmessage = e => { const m = e && e.data; if (m && m.id !== id && (m.type === 'here' || m.type === 'hello')) end(true); };
		try { ch.postMessage({ type: 'who', id }); } catch (e) { return end(false); }
		setTimeout(() => end(false), waitMs);
	});
}
/** Why the overworld's things cannot be handed over from this page right now, or null. */
export async function whyNot() {
	if (!hasGame()) return 'There is no overworld game on this device.';
	if (await gameRunning()) return 'The overworld game is open in another tab. Close it (or trade from inside it) to put up its things here.';
	const r = await call('ow-load');
	if (!r || r.error) return 'The account could not be reached to check your save. Try again in a moment.';
	const remote = r.ow && r.ow.ow, remoteRev = remote ? Math.max(0, parseInt(remote[REV_KEY], 10) || 0) : 0;
	if (remoteRev > localRev()) return 'Your overworld game has been played somewhere else since it was last open here. Open the overworld on this device first, then come back.';
	return null;
}

function write(after) {
	if (after.party) safeSave(PARTY_KEY, after.party);
	if (after.box) safeSave(BOX_KEY, after.box);
	if (after.bag) safeSave(BAG_KEY, after.bag);
	Bag.setPurse(after);
}
/** Step the revision and send the save to the account, as the game does after a change. -> did the account take it? */
async function publish() {
	safeSaveStr(REV_KEY, String(localRev() + 1));
	const ow = {}; for (const k of SENT_KEYS) { try { const v = localStorage.getItem(k); if (v != null) ow[k] = v; } catch (e) { /* unreadable: not sent */ } }
	const r = await call('ow-save', { ow });
	return !!(r && r.ok && !r.error);
}

/** Take `offer` (my side of trade `id`) out of the save and tell the trade. -> { ok } or { ok: false, why }.
 *  The note first, the removal second, the note again third: a page that dies in between can tell which it was. */
export async function handOver(id, offer, side) {
	const why = await whyNot(); if (why) return { ok: false, why };
	const h = holdings(), purse = { money: h.money, coins: h.coins }, after = TL.takeOut(offer, h.party, h.box, h.bag, purse);
	if (!after) return { ok: false, why: TL.whyNotTake(offer, h.party, h.box, h.bag, purse) + '.' };
	safeSave(TL.JOURNAL_KEY, TL.noteTaking(journal(), id, offer, h.bag, side, purse));
	write(after);
	safeSave(TL.JOURNAL_KEY, TL.noteOut(journal(), id));
	await publish();   // (not taken: the save here is ahead by its revision, and the game sends it when it next starts)
	const r = await call('trade-deposit', { id });
	return { ok: true, trade: r && r.trade ? r.trade : null };
}

/** Bring the save and the server into step, as the game does when it starts (ow_pvp.js settleTrades): take in what is
 *  in my delivery box, and settle every trade I handed things to. -> { got: [...], restored: n } or null (not now). */
export async function settle() {
	if (await whyNot()) return null;   // (a running game does this itself; a save behind the account's waits for the game to catch up)
	const out = { got: [], restored: 0 }; let changed = false;
	const d = await call('trade-box');
	if (d && Array.isArray(d.deliveries) && d.deliveries.length) {
		const h = holdings(), r = TL.applyDeliveries(d.deliveries, TL.readApplied(JSON.stringify(safeLoad(TL.APPLIED_KEY, []))), h.box, h.bag, h);
		if (r.fresh.length) { write({ box: r.box, bag: r.bag, money: r.money, coins: r.coins }); safeSave(TL.APPLIED_KEY, r.applied); changed = true; out.got = r.fresh; }
		await call('trade-box-ack', { ids: r.ack });   // (not heard: asked again next time; the note stops a second copy)
	}
	for (const [id, entry] of Object.entries(journal())) {
		const p = await call('trade-poll', { id }); if (!p) continue;   // (offline: ask again later)
		const t = p.trade || null, mine = entry.side === 'B' ? 'B' : 'A', h = holdings();
		const what = TL.resolve(entry, p.gone ? null : t, mine, TL.wasTaken(entry, h.party, h.box, h.bag, h));
		if (what === 'restore') { const r = TL.putIn(entry.offer, h.box, h.bag, h); write({ box: r.box, bag: r.bag, money: r.money, coins: r.coins }); safeSave(TL.JOURNAL_KEY, TL.drop(journal(), id)); out.restored++; changed = true; }
		else if (what === 'deposit') { safeSave(TL.JOURNAL_KEY, TL.noteOut(journal(), id)); await call('trade-deposit', { id }); }
		else if (what === 'drop') { safeSave(TL.JOURNAL_KEY, TL.drop(journal(), id)); changed = true; }
	}
	if (changed) await publish();
	return out;
}
