// ow_saves.js — the overworld save: server-authoritative sync (hydrate/push/revision), achievements sync, gifts, and the OPTIONS save-data actions (export/import/backups).
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as MP from '../battlecards/mpmode.js';
import { OW_RESET_KEYS } from '../site/owreset.js';
import * as Badges from './badges.js';
import * as Bag from './bag.js';
import * as Story from './events.js';
import * as Frontier from './frontier.js';
import { dialog, hud } from './ow_core.js';
import { S } from './ow_state.js';
import * as Dex from './pokedex.js';
import { safeSave, safeSaveStr } from './safestore.js';
import * as Savefile from './savefile.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { LEGENDARY_ENCOUNTERS, awState } from './ow_legendaries.js';
import { optionsMenu } from './ow_menustate.js';
import {
	MP_ON,
} from './main.js';

// ---------- overworld achievements sync ----------
// The Profile achievements page derives its tiles from the account state (server), but
// overworld progress (badges / championships / Frontier symbols / caught legendaries /
// villain arcs / Pokedex) lives only in localStorage. This bridges the two: a compact
// summary is pushed to the account on boot (backfilling existing progress) and after
// each milestone, so those accomplishments unlock achievement tiles. localStorage stays
// the source of truth; the account copy is derived. No-op when logged out.
export function overworldSummary() {
	const REGS = ['KANTO', 'JOHTO', 'HOENN'];
	const badges = { JOHKANTO: Badges.count('JOHKANTO') };
	const champ = {};
	for (const r of REGS) { badges[r] = Badges.count(r); champ[r] = Badges.isChampion(r); }
	// caught legendaries: species the Dex records as CAUGHT — not the legend_caught_*
	// flag, which is also set when a legendary is defeated (main.js: catch vs victory)
	const roster = new Set();
	for (const v of Object.values(LEGENDARY_ENCOUNTERS))
		for (const e of (Array.isArray(v) ? v : [v])) roster.add(e.species);
	const legends = [...roster].filter(s => Dex.isCaught(s));
	const villains = ['villain_kanto_hideout', 'villain_kanto_silph', 'villain_johto_slowpoke',
		'villain_johto_hq', 'villain_hoenn_hideout', 'villain_hoenn_climax'].filter(f => Story.getFlag(f));
	return {
		badges, champ,
		symbols: Frontier.getSymbols(),
		legends,
		villains,
		beatRed: !!Story.getFlag('beat_red'),
		awakening: awState() >= 6, // the Hoenn weather crisis was resolved (RAYQUAZA calmed the trio)
		grandChampion: !!Story.getFlag('grand_champion'), // Champion of all three shared regions
		dexCaught: Dex.counts().caught,
		bp: Frontier.getBP(),
		bestStreak: Frontier.bestStreak(),
	};
}
export function syncOverworldAchievements() {
	if (!MP_ON) return;
	try { MP.call('overworld-sync', { ow: overworldSummary() }).catch(() => {}); } catch (e) {}
}
// ---------- server-authoritative overworld save (Phase 2) ----------
// The raw save strings persist to the server (D1, ow:<user>) so a logged-in player gets the same,
// current game everywhere. The server is authoritative on boot (hydrateOw overwrites the local
// cache); a deduped push keeps it current. This used to cover only nine keys (party/region/
// position/boxes/money...), which meant story flags, badges, the bag, and the dex silently did NOT
// follow you across devices — and the server's automatic daily backups could only protect a
// fraction of the game. Now the whole canonical inventory syncs, except the live mid-battle
// snapshot: it changes every battle action (churn), and a stale copy resuming on another device
// after the fight already ended locally would replay a finished battle.
export const OW_KEYS = OW_RESET_KEYS.filter(k => k !== 'magepunk_battle_v1');
export function owSnapshot() {
	const o = {}; for (const k of OW_KEYS) { try { const v = localStorage.getItem(k); if (v != null) o[k] = v; } catch (e) {} } return o;
}
// ---------- SAVE-SYNC INSTRUMENTATION (temporary) ----------
// Every candidate and decision in the local<->server save path, as a structured
// ring buffer on window.__owSync. `?synclog=1` also mirrors it to the console.
// No tokens, passwords or headers are ever recorded — only shapes and outcomes.
const SYNC_TRACE = new URLSearchParams(location.search).has('synclog');
const SYNC_LOG_KEY = 'magepunk_owsync_log';
let _syncSeq = 0;
// seeded from sessionStorage so the trace survives hydrateOw's location.reload()
// — the decisive decision is logged immediately BEFORE that reload, so an
// in-memory-only buffer loses exactly the record that matters.
export const owSyncLog = (() => {
	try { const v = JSON.parse(sessionStorage.getItem(SYNC_LOG_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
})();
_syncSeq = owSyncLog.length ? (owSyncLog[owSyncLog.length - 1].seq || 0) : 0;
function syncLog(event, detail) {
	const rec = { seq: ++_syncSeq, t: Math.round(performance.now()), wall: new Date().toISOString(), event, ...detail };
	owSyncLog.push(rec);
	while (owSyncLog.length > 200) owSyncLog.shift();
	try { sessionStorage.setItem(SYNC_LOG_KEY, JSON.stringify(owSyncLog)); } catch (e) { /* quota: keep the in-memory copy */ }
	if (SYNC_TRACE) console.log('[owsync]', JSON.stringify(rec));
	return rec;
}
// a human-comparable fingerprint of a snapshot: what the tester actually reads
export function owFingerprint(snap) {
	try {
		const pos = snap['magepunk_pos_v1'] ? JSON.parse(snap['magepunk_pos_v1']) : null;
		const party = snap['magepunk_party_v1'] ? JSON.parse(snap['magepunk_party_v1']) : null;
		const lead = Array.isArray(party) ? party[0] : null;
		return {
			map: pos && pos.map, x: pos && pos.x, y: pos && pos.y,
			lead: lead && lead.name, lvl: lead && lead.level,
			hp: lead ? lead.curHP + '/' + lead.maxHP : null,
			pp: lead && lead.moves && lead.moves[0] ? lead.moves[0].pp + '/' + lead.moves[0].maxPp : null,
			bytes: JSON.stringify(snap).length, keys: Object.keys(snap).length,
		};
	} catch (e) { return { parseError: String(e && e.message) }; }
}
// ---------- revision ----------
// Ordering NEVER comes from position, HP or apparent progress — those are not
// monotonic (you can walk back, take damage, release a mon). It comes from an
// explicit counter that only ever increases, carried INSIDE the snapshot so it
// travels to the server and on to every other device. Absent == 0, which is what
// every pre-existing save reads as, so the migration is a no-op.
const OW_REV_KEY = 'magepunk_ow_rev';
export const owRev = () => Math.max(0, parseInt(localStorage.getItem(OW_REV_KEY), 10) || 0);
function setOwRev(n) { safeSaveStr(OW_REV_KEY, String(Math.max(0, n | 0))); }
// the snapshot minus its own revision: "has any real game state changed?"
// Keys that drift on their own and must NEVER, by themselves, read as a
// divergence. magepunk_playtime ticks every ~5s straight from the game loop
// WITHOUT bumping the revision, so a session that ends abruptly leaves local
// ahead of remote at an IDENTICAL revision — which the equal-revision branch
// below read as "two devices diverged" and answered with a conflict stash, on a
// save whose every meaningful key was byte-identical. Reported twice in one
// morning, with position/party/flags/bag/dex all matching to the byte.
//
// Excluding it from the body also means a playtime-only tick no longer counts as
// a change worth a D1 write, which is the right answer for a cosmetic counter.
const VOLATILE_KEYS = [OW_REV_KEY, 'magepunk_playtime'];
function owBody(snap) { const o = { ...snap }; for (const k of VOLATILE_KEYS) delete o[k]; return JSON.stringify(o); }
// Does this snapshot hold an actual GAME, or is it just an empty browser?
// This is absence-detection, NOT progress-ordering: it only ever distinguishes
// "there is no record here" from "there is a record here", and is never used to
// rank two real saves against each other. A fresh device that has never been
// played has no competing edit to defend — treating its emptiness as a rival
// edit is what let an empty local save win against a real server one.
// Counts only what CANNOT exist before someone has actually played: POKeMON in
// the party or boxes, a chosen region, earned badges. Deliberately excludes
// magepunk_pos_v1 and magepunk_story — boot writes a default position and seeds
// story flags before hydration even finishes, so a browser that has merely
// OPENED the game already carries both. Counting those made a fresh device look
// like a real save, which is precisely how an empty one won.
function owGameWeight(snap) {
	let w = 0;
	const arr = k => { try { const v = JSON.parse(snap[k] || 'null'); return Array.isArray(v) ? v.length : 0; } catch (e) { return 0; } };
	if (arr('magepunk_party_v1') > 0) w++;
	if (arr('magepunk_box_v1') > 0) w++;
	if (snap['magepunk_region']) w++;
	try { const b = JSON.parse(snap['magepunk_badges_v1'] || 'null'); if (b && Object.keys(b).length) w++; } catch (e) {}
	return w;
}
// The losing side of a discard is never thrown away. Whenever hydration is about
// to drop a local snapshot, it lands here first so it can be recovered.
const OW_CONFLICT_KEY = 'magepunk_ow_conflict';
function stashConflict(reason, losing, localRev, remoteRev) {
	const rec = { at: new Date().toISOString(), reason, localRev, remoteRev, fp: owFingerprint(losing), ow: losing };
	const wrote = safeSave(OW_CONFLICT_KEY, rec);
	syncLog('conflict.stash', { reason, localRev, remoteRev, fp: rec.fp, wrote });
}

let _lastAckedBody = '';  // body the SERVER has confirmed — advanced only on ack
let _pendingBody = '';    // body the current in-flight revision represents
let _owInFlight = 0, _owAcked = 0, _owFailed = 0;
export const owDirty = () => owBody(owSnapshot()) !== _lastAckedBody;

export function pushOw(opts) {
	if (!MP_ON) { syncLog('push.skip', { reason: 'MP_ON=false' }); return Promise.resolve(false); }
	const keepalive = !!(opts && opts.keepalive === true);
	const body = owBody(owSnapshot());
	if (body === '{}') { syncLog('push.skip', { reason: 'empty' }); return Promise.resolve(false); }
	if (body === _lastAckedBody) { syncLog('push.skip', { reason: 'already-acked' }); return Promise.resolve(true); }
	// Local state the server has NOT confirmed is, by definition, ahead of it —
	// so stamp a higher revision before the write leaves. Bumping on change (not
	// on ack) is what protects unpushed progress: if the write never lands, the
	// next session still sees localRev > remoteRev and keeps the local game.
	if (body !== _pendingBody) { setOwRev(owRev() + 1); _pendingBody = body; }
	const ow = owSnapshot();  // re-read: the revision just changed
	const rev = owRev();
	const seq = _syncSeq + 1;
	syncLog('push.start', { scope: S.mpAccount && S.mpAccount.username || '(unknown)', key: 'ow:<user>', rev, keepalive, fp: owFingerprint(ow), inFlight: ++_owInFlight });
	const done = (ok, extra) => {
		if (ok) { _owAcked++; _lastAckedBody = body; } else _owFailed++;
		syncLog('push.response', { forSeq: seq, rev, ok, acked: _owAcked, failed: _owFailed, inFlight: --_owInFlight, ...extra });
		return ok;
	};
	try {
		return MP.call('ow-save', { ow }, { keepalive })
			.then(r => {
				if (r && r.ok && !r.error) return done(true);
				// the server holds a HIGHER revision: another device is ahead. Keep our
				// copy safe and let the next hydrate reconcile rather than clobbering.
				if (r && r.conflict) return done(false, { conflict: true, serverRev: r.rev || null, error: String(r.error || 'stale revision') });
				return done(false, { error: r && r.error ? String(r.error) : 'no ok in response' });
			})
			.catch(e => done(false, { error: String(e && e.message || e) }));
	} catch (e) { return Promise.resolve(done(false, { error: String(e && e.message || e) })); }
}
// ---------- gifts ----------
// A gift is a server-side PROMISE of items — this is the client half that turns
// a claimed gift into real inventory. gift-claim marks it spent and returns the
// payload in one step, so a retry can never pay out twice; the bag write
// happens immediately after, with no await in between. (The bag itself now
// syncs via OW_KEYS, but the exactly-once claim is what stops double payouts.)
export async function claimGifts() {
	if (!MP_ON) return;
	let gifts = [];
	try { gifts = (await MP.call('gift-list'))?.gifts || []; } catch (e) { return; }
	for (const g of gifts) {
		let payload = null;
		try { payload = (await MP.call('gift-claim', { id: g.id }))?.gift; } catch (e) { continue; }
		if (!payload) continue;
		const got = [];
		for (const [id, n] of Object.entries(payload.items || {})) {
			if (!Bag.ITEMS[id] && !/^(tm|hm)/.test(id)) continue; // an id this build doesn't know
			Bag.addItem(id, n);
			got.push(`${Bag.nameOf(id)} x${n}`);
		}
		const lines = [payload.title, payload.body, got.length ? '\nYou received:\n' + got.join('\n') : '']
			.filter(Boolean).join('\n');
		dialog.open(lines);
		hud.textContent = payload.title;
	}
}

export async function hydrateOw() {
	if (!MP_ON) { syncLog('hydrate.skip', { reason: 'MP_ON=false' }); return; }
	try {
		syncLog('hydrate.start', { localFp: owFingerprint(owSnapshot()), latch: !!sessionStorage.getItem('mp_ow_hydrated') });
		const r = await MP.call('ow-load');
		const ow = r && r.ow && r.ow.ow; // ow-load returns { ow: { ow:<snapshot>, updated_at } }
		syncLog('hydrate.remote', {
			present: !!(ow && typeof ow === 'object'),
			serverUpdatedAt: r && r.ow && r.ow.updated_at || null,
			serverWall: r && r.ow && r.ow.updated_at ? new Date(r.ow.updated_at).toISOString() : null,
			remoteFp: ow && typeof ow === 'object' ? owFingerprint(ow) : null,
			error: r && r.error ? String(r.error) : null,
		});
		if (ow && typeof ow === 'object') {
			// playtime is a monotonic clock, not state to reconcile: keep whichever
			// side has more so neither device loses time, before any comparison runs
			{
				const lp = parseInt(localStorage.getItem('magepunk_playtime'), 10) || 0;
				const rp = parseInt(ow['magepunk_playtime'], 10) || 0;
				if (rp > lp) safeSaveStr('magepunk_playtime', String(rp));
			}
			const localSnap = owSnapshot();
			const localRev = owRev(), remoteRev = Math.max(0, parseInt(ow[OW_REV_KEY], 10) || 0);
			const sameBody = owBody(ow) === owBody(localSnap);

			// --- RECONCILIATION. Deterministic and idempotent: the decision is a pure
			// function of (localRev, remoteRev, bodies-equal), so re-running it on the
			// reload below reaches 'equal' and stops. Nothing here is ever decided by
			// position, HP or progress. ---
			if (sameBody) {
				syncLog('hydrate.decision', { winner: 'equal', reason: `bodies identical (localRev ${localRev}, remoteRev ${remoteRev})`, rewroteLocal: false, keysOverwritten: [] });
				_lastAckedBody = owBody(localSnap);
				try { sessionStorage.removeItem('mp_ow_hydrated'); } catch (e) {}
				return;
			}
			// ABSENCE BEATS REVISION. Every save written before revisions existed reads
			// as rev 0 on BOTH sides, so at the migration boundary the comparisons below
			// are all ties — and a signed-in fresh device is exactly that tie, with an
			// empty local save. An empty side is not a competing edit, it is the absence
			// of one, so it can never win and is never treated as a conflict.
			const localWeight = owGameWeight(localSnap), remoteWeight = owGameWeight(ow);
			if (localWeight === 0 && remoteWeight > 0) {
				syncLog('hydrate.decision', { winner: 'remote', reason: `local holds no game (weight 0) — adopting the account's save`, rewroteLocal: true, localWeight, remoteWeight });
				let took = false;
				for (const k of OW_KEYS) { try { if (ow[k] != null && localStorage.getItem(k) !== ow[k]) { localStorage.setItem(k, ow[k]); took = true; } } catch (e) {} }
				_lastAckedBody = owBody(owSnapshot());
				if (took && !sessionStorage.getItem('mp_ow_hydrated')) { sessionStorage.setItem('mp_ow_hydrated', '1'); location.reload(); return; }
				try { sessionStorage.removeItem('mp_ow_hydrated'); } catch (e) {}
				return;
			}
			if (remoteWeight === 0 && localWeight > 0) {
				syncLog('hydrate.decision', { winner: 'local', reason: `remote holds no game (weight 0) — keeping this device's save`, rewroteLocal: false, localWeight, remoteWeight });
				try { sessionStorage.removeItem('mp_ow_hydrated'); } catch (e) {}
				pushOw();
				return;
			}
			if (remoteRev < localRev) {
				// THE FIX for the reported rollback. Local carries work the server never
				// acknowledged. Adopting the server here is exactly what destroyed
				// x16/y32. Keep local, and push it up instead.
				syncLog('hydrate.decision', { winner: 'local', reason: `localRev ${localRev} > remoteRev ${remoteRev} — refusing to rewrite local backward`, rewroteLocal: false, keysOverwritten: [] });
				try { sessionStorage.removeItem('mp_ow_hydrated'); } catch (e) {}
				pushOw();
				return;
			}
			if (remoteRev === localRev) {
				// Same ancestor, different content: two devices diverged. Neither is
				// provably newer, so DISCARD NOTHING — keep local (a deterministic
				// tie-break), preserve remote, and step the revision so the tie resolves.
				stashConflict('same-revision divergence (remote copy preserved)', ow, localRev, remoteRev);
				syncLog('hydrate.decision', { winner: 'local', reason: `equal revisions (${localRev}) with differing bodies — kept local, preserved remote`, rewroteLocal: false, keysOverwritten: [], conflict: true });
				hud.textContent = 'This game moved on somewhere else too — kept this device\'s copy.';
				// pushOw() bumps the revision itself, so local lands on remoteRev + 1 and
				// the tie is broken. The extra setOwRev here double-counted it: the
				// reported jump was 2679 -> 2681 with only one write behind it.
				try { sessionStorage.removeItem('mp_ow_hydrated'); } catch (e) {}
				pushOw();
				return;
			}

			// remoteRev > localRev: the server is genuinely ahead. Adopt it — but if
			// this device also had unacknowledged work, that copy is preserved first.
			if (owDirty() && _lastAckedBody !== '') stashConflict('local edits superseded by a newer remote revision', localSnap, localRev, remoteRev);
			let changed = false;
			const overwritten = [];
			for (const k of OW_KEYS) {
				try {
					if (ow[k] != null && localStorage.getItem(k) !== ow[k]) { overwritten.push(k); localStorage.setItem(k, ow[k]); changed = true; }
				} catch (e) {}
			}
			syncLog('hydrate.decision', {
				winner: 'remote', reason: `remoteRev ${remoteRev} > localRev ${localRev}`,
				rewroteLocal: changed, keysOverwritten: overwritten,
				afterFp: owFingerprint(owSnapshot()),
			});
			_lastAckedBody = owBody(owSnapshot()); // don't immediately re-push what we just pulled
			// Story/Bag/Badges/Dex read their strings at IMPORT time, so a hydration
			// that actually changed something must reload once — otherwise a stale
			// in-memory module would quietly save itself back over the fresh data.
			// The sessionStorage latch stops a reload loop when a write can't stick.
			if (changed && !sessionStorage.getItem('mp_ow_hydrated')) {
				sessionStorage.setItem('mp_ow_hydrated', '1');
				location.reload();
				return;
			}
			if (!changed) { try { sessionStorage.removeItem('mp_ow_hydrated'); } catch (e) {} }
		}
	} catch (e) { /* offline / logged out -> keep the localStorage cache */ }
}

// ---------- save data actions (OPTIONS menu) ----------
// Export/import move the whole game as a file; SERVER BACKUPS restores one of
// the automatic daily snapshots D1 keeps. An import or restore must update the
// server copy BEFORE reloading — hydrateOw is authoritative on boot, so a stale
// server blob would quietly re-impose the game that was just replaced.
export function runSaveAction(id) {
	const om = optionsMenu;
	if (om.busy) return;
	if (id === 'export') {
		try {
			const n = Savefile.exportSave();
			om.flash = `Saved ${n} items to a file. Keep it somewhere safe!`;
		} catch (e) { om.flash = 'Export failed: ' + (e?.message || e); }
		return;
	}
	if (id === 'import') { doImportSave(); return; }
	if (id === 'backups') {
		om.mode = 'backups'; om.idx = 0; om.list = null; om.flash = null;
		loadBackups();
		return;
	}
	if (id === 'controls') { om.mode = 'controls'; om.idx = 0; om.capture = null; om.flash = null; return; }
}
async function doImportSave() {
	const om = optionsMenu;
	const picked = await Savefile.pickSaveFile();
	if (!picked) return;
	let parsed;
	try { parsed = Savefile.parseSave(picked.text); } catch (e) { om.flash = e?.message || String(e); return; }
	const when = parsed.exported_at ? parsed.exported_at.slice(0, 10) : 'an unknown date';
	if (!confirm(`Replace your CURRENT game with the save from ${when}?\n(${picked.name})\n\nEverything you have now will be overwritten.`)) return;
	om.busy = true;
	Savefile.applySave(parsed.keys);
	// an import deliberately replaces the game: it must outrank whatever the
	// server holds, so step past the server's revision and force the write
	if (MP_ON) {
		try { const r = await MP.call('ow-load'); setOwRev(Math.max(owRev(), parseInt(r?.ow?.ow?.[OW_REV_KEY], 10) || 0) + 1); } catch (e) { setOwRev(owRev() + 1); }
	}
	if (MP_ON) {
		try { await MP.call('ow-save', { ow: owSnapshot(), force: true }); }
		catch (e) { alert('The save was restored locally, but the SERVER copy could not be updated.\nIf you are online next load, the old game may come back — try importing again then.'); }
	}
	location.reload();
}
export async function loadBackups() {
	const om = optionsMenu;
	if (!MP_ON) { om.list = []; om.flash = 'Backups need a logged-in account.'; return; }
	try { om.list = ((await MP.call('ow-history'))?.backups) || []; }
	catch (e) { om.list = []; om.flash = 'Could not reach the server.'; }
	if (om.list.length === 0 && !om.flash) om.flash = 'No backups yet — they appear after a day of play.';
}
export async function restoreBackup(b) {
	const om = optionsMenu;
	if (!b || om.busy) return;
	const label = b.slot === 'undo' ? 'the UNDO slot (your game before the last restore)' : `the automatic backup from ${b.slot}`;
	if (!confirm(`Restore ${label}?\n\nYour current game is stashed in the UNDO slot first, so this can be reversed.`)) return;
	om.busy = true;
	let r = null;
	try { r = await MP.call('ow-restore', { slot: b.slot }); } catch (e) {}
	if (!r || !r.ow) { om.busy = false; om.flash = 'Restore failed — the backup may be gone.'; loadBackups(); return; }
	// same discipline as a file import: clear, then lay the snapshot down
	const beforeRev = owRev();
	for (const k of OW_KEYS) { try { localStorage.removeItem(k); } catch (e) {} }
	for (const [k, v] of Object.entries(r.ow)) { try { if (typeof v === 'string') localStorage.setItem(k, v); } catch (e) {} }
	// the backup's own revision is older than the game it replaced — step past it
	// so the restore is not immediately undone by the next hydrate
	setOwRev(Math.max(beforeRev, owRev()) + 1);
	try { await MP.call('ow-save', { ow: owSnapshot(), force: true }); } catch (e) {}
	location.reload();
}
