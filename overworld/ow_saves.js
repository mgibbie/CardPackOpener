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
// LOCAL-ONLY keys never sync. The conflict stash used to ride in the snapshot, so
// every remote copy it preserved already held the PREVIOUS stash, which held the
// one before: each same-revision divergence nested a whole save inside the next,
// and instinctloretest0918's cloud save grew 147K -> 235K -> 383K -> 652K chars of
// stash until the server refused it ('ow too large', 1,000,000 bytes) and every
// push failed. The stash protects THIS device's view of a divergence; the server
// keeps its own daily backups.
const LOCAL_ONLY_KEYS = ['magepunk_ow_conflict', 'magepunk_ow_conflict_archive'];
export const OW_KEYS = OW_RESET_KEYS.filter(k => k !== 'magepunk_battle_v1' && !LOCAL_ONLY_KEYS.includes(k));
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
// Built from OW_KEYS in a fixed order, so a remote copy that still carries a
// local-only key (a pre-fix stash) or lists keys in another order compares equal.
function owBody(snap) {
	const o = {};
	for (const k of OW_KEYS) if (snap[k] != null && !VOLATILE_KEYS.includes(k)) o[k] = snap[k];
	return JSON.stringify(o);
}
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
const OW_CONFLICT_ARCHIVE_KEY = 'magepunk_ow_conflict_archive';
// the losing copy WITHOUT any stash of its own: one save deep, never nested
const flatCopy = snap => { const o = { ...snap }; for (const k of LOCAL_ONLY_KEYS) delete o[k]; return o; };
function stashConflict(reason, losing, localRev, remoteRev) {
	const flat = flatCopy(losing);
	const rec = { at: new Date().toISOString(), reason, localRev, remoteRev, fp: owFingerprint(flat), ow: flat };
	const wrote = safeSave(OW_CONFLICT_KEY, rec);
	syncLog('conflict.stash', { reason, localRev, remoteRev, fp: rec.fp, wrote });
}

// MIGRATION for stashes written before the fix: a record whose `ow` holds another
// stash is archived WHOLE to a local-only key first, and only then flattened to
// its newest level. Nothing is dropped unless the archive write succeeded.
(function flattenNestedConflict() {
	try {
		const raw = localStorage.getItem(OW_CONFLICT_KEY);
		if (!raw) return;
		const rec = JSON.parse(raw);
		if (!rec || !rec.ow || rec.ow[OW_CONFLICT_KEY] == null) return;
		const archived = safeSaveStr(OW_CONFLICT_ARCHIVE_KEY, raw);
		if (!archived || localStorage.getItem(OW_CONFLICT_ARCHIVE_KEY) !== raw) { syncLog('conflict.migrate', { flattened: false, reason: 'archive write failed', chars: raw.length }); return; }
		rec.ow = flatCopy(rec.ow);
		rec.fp = owFingerprint(rec.ow);
		const wrote = safeSave(OW_CONFLICT_KEY, rec);
		syncLog('conflict.migrate', { flattened: !!wrote, beforeChars: raw.length, afterChars: JSON.stringify(rec).length, archivedChars: raw.length });
	} catch (e) { syncLog('conflict.migrate', { flattened: false, reason: String(e && e.message) }); }
})();

// The server refuses a snapshot over 1,000,000 bytes (server/mp.mjs OW_MAX_BYTES).
// Sending one anyway fails every ~30s forever while the game looks fine; check
// first, say which keys are heavy, and tell the player once.
const OW_PUSH_LIMIT = 990_000;
let _oversizeWarned = false;
function oversize(snap) {
	const bytes = JSON.stringify(snap).length;
	if (bytes <= OW_PUSH_LIMIT) return null;
	const heaviest = Object.entries(snap).map(([k, v]) => [k, String(v).length]).sort((a, b) => b[1] - a[1]).slice(0, 5);
	return { bytes, limit: OW_PUSH_LIMIT, heaviest };
}

let _lastAckedBody = '';  // body the SERVER has confirmed — advanced only on ack
let _pendingBody = '';    // body the current in-flight revision represents
let _owInFlight = 0, _owAcked = 0, _owFailed = 0;
export const owDirty = () => owBody(owSnapshot()) !== _lastAckedBody;

export function pushOw(opts) {
	if (!MP_ON) { syncLog('push.skip', { reason: 'MP_ON=false' }); return Promise.resolve(false); }
	if (_importing) { syncLog('push.skip', { reason: 'import in progress' }); return Promise.resolve(false); }
	const keepalive = !!(opts && opts.keepalive === true);
	const body = owBody(owSnapshot());
	if (body === '{}') { syncLog('push.skip', { reason: 'empty' }); return Promise.resolve(false); }
	if (body === _lastAckedBody) { syncLog('push.skip', { reason: 'already-acked' }); return Promise.resolve(true); }
	{
		const big = oversize(owSnapshot());
		if (big) {
			syncLog('push.oversize', big);
			if (!_oversizeWarned) {
				_oversizeWarned = true;
				hud.textContent = 'Cloud save is too large to sync. Your game is safe here: use OPTIONS > EXPORT SAVE for a backup.';
			}
			return Promise.resolve(false);
		}
	}
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
	// the whole file is validated BEFORE the confirm, and before anything changes
	const v = Savefile.validateSave(picked.text);
	if (!v.ok) { om.flash = 'Import refused: ' + v.errors[0] + (v.errors.length > 1 ? ` (+${v.errors.length - 1} more)` : ''); return; }
	const when = v.exported_at ? v.exported_at.slice(0, 10) : 'an unknown date';
	if (!confirm(`Replace your CURRENT game with the save from ${when}?\n(${picked.name})\n\nEverything you have now will be overwritten (a backup is kept on this device).`)) return;
	om.busy = true;
	const r = await importSave(v, { source: 'chooser', reload: false });
	if (!r.ok && r.stage !== 'push' && r.stage !== 'readback') { om.busy = false; om.flash = 'Import failed: ' + r.error; return; }
	if (!r.ok) alert('The save was restored locally, but the SERVER copy could not be confirmed:\n' + r.error + '\nIf you are online next load, the old game may come back; try importing again then.');
	location.reload();
}

// ---------- the import pipeline (chooser AND automation) ----------
// window.__ow.importSave(json) runs the same path as OPTIONS > IMPORT SAVE,
// without the native file chooser:
//   1. validate the WHOLE export (Savefile.validateSave): any problem -> nothing
//      changes and the result lists every problem
//   2. size-check what will be pushed (the server refuses > 1MB)
//   3. read the server's revision (the applied revision must outrank it)
//   4. back up the current game locally, apply, read every key back; any write
//      that does not stick rolls the whole game back (Savefile.applySaveSafely)
//   5. stamp the revision, force-push (the server stashes what it replaces in
//      its UNDO slot first), then read the server copy back and compare
// The result survives the reload that follows (lastImportResult()).
const IMPORT_RESULT_KEY = 'magepunk_ow_import_result';
let _importing = false;   // pushOw stands down while an import owns the save
function finishImport(res, reload) {
	res.at = new Date().toISOString();
	try { sessionStorage.setItem(IMPORT_RESULT_KEY, JSON.stringify(res)); } catch (e) {}
	syncLog('import.result', { ok: res.ok, stage: res.stage, source: res.source, fileRev: res.fileRev ?? null, appliedRev: res.appliedRev ?? null, pushed: res.pushed ?? null, readbackOk: res.readback ? res.readback.ok : null, error: res.error || null });
	// the running modules (story, bag, dex...) cached the OLD game at boot: a
	// reload is what makes the imported game the one being played
	if (res.applied && reload) setTimeout(() => location.reload(), 50);
	else _importing = false;
	return res;
}
// `input`: an export object, its JSON text, or a validateSave() result.
// opts.reload (default true): reload after a successful apply.
export async function importSave(input, opts = {}) {
	const source = opts.source || 'api';
	const reload = opts.reload !== false;
	const base = { ok: false, source, applied: false, pushed: false };
	if (_importing) return { ...base, stage: 'busy', error: 'Another import is still running.' };
	const v = input && input.errors && input.keys ? input : Savefile.validateSave(input);
	if (!v.ok) return { ...base, stage: 'validate', error: v.errors.join(' | '), errors: v.errors };
	// what the push will carry (the synced subset), measured before anything changes
	const pushable = {}; for (const k of OW_KEYS) if (v.keys[k] != null) pushable[k] = v.keys[k];
	const big = MP_ON ? oversize(pushable) : null;
	if (big) return { ...base, stage: 'validate', error: `The save is ${big.bytes} bytes; the server limit is ${big.limit}. Heaviest keys: ${big.heaviest.map(([k, n]) => k + '=' + n).join(', ')}.`, errors: ['too large'] };
	_importing = true;
	const prevRev = owRev();
	let serverRev = null;
	if (MP_ON) {
		try { const r = await MP.call('ow-load'); serverRev = Math.max(0, parseInt(r?.ow?.ow?.[OW_REV_KEY], 10) || 0); }
		catch (e) { serverRev = null; }
	}
	const ap = Savefile.applySaveSafely(v.keys);
	if (!ap.ok) return finishImport({ ...base, stage: 'apply', error: ap.error, rolledBack: ap.rolledBack, fileRev: v.fileRev }, false);
	// the imported game must outrank the stored one; keep the file's own revision
	// when it already does (a rev-16413 export lands at 16413 over an older copy)
	const appliedRev = Math.max(v.fileRev, (serverRev != null ? serverRev : prevRev) + 1);
	setOwRev(appliedRev);
	const res = { ...base, applied: true, stage: 'applied', fileRev: v.fileRev, appliedRev, serverRevBefore: serverRev, previousLocalRev: prevRev,
		backupKey: Savefile.IMPORT_BACKUP_KEY, backupAt: ap.backupAt, fp: owFingerprint(owSnapshot()), exported_at: v.exported_at };
	if (!MP_ON) return finishImport({ ...res, ok: true, stage: 'local-only', note: 'Not signed in: applied on this device only.' }, reload);
	const snap = owSnapshot();
	const body = owBody(snap);
	try {
		const r = await MP.call('ow-save', { ow: snap, force: true });
		if (!r || !r.ok || r.error) return finishImport({ ...res, stage: 'push', error: 'Server refused the save: ' + (r && r.error ? r.error : 'no ok in response') }, reload);
	} catch (e) { return finishImport({ ...res, stage: 'push', error: 'Could not reach the server: ' + (e && e.message || e) }, reload); }
	res.pushed = true;
	_lastAckedBody = body; _pendingBody = body;
	// read it back: the server copy must BE the imported game, at the applied revision
	try {
		const r = await MP.call('ow-load');
		const ow = r && r.ow && r.ow.ow;
		const rb = { rev: ow ? Math.max(0, parseInt(ow[OW_REV_KEY], 10) || 0) : null, bodyMatches: !!ow && owBody(ow) === body, fp: ow ? owFingerprint(ow) : null };
		rb.ok = rb.bodyMatches && rb.rev === appliedRev;
		res.readback = rb;
		if (!rb.ok) return finishImport({ ...res, stage: 'readback', error: `Server copy does not match (rev ${rb.rev} vs ${appliedRev}, body ${rb.bodyMatches ? 'matches' : 'differs'}).` }, reload);
	} catch (e) { return finishImport({ ...res, stage: 'readback', error: 'Pushed, but could not read the server copy back: ' + (e && e.message || e) }, reload); }
	return finishImport({ ...res, ok: true, stage: 'done' }, reload);
}
// ---------- a PERSISTENT file input for automation ----------
// Upload tooling can only drive a real <input type=file> that is in the DOM,
// and some callers cannot run page code at all, so OPTIONS > IMPORT SAVE (whose
// input only exists while the chooser is open) is out of reach. This input sits
// in the document for the whole session, visually hidden (not display:none, so
// every tool can target it), and an upload runs the SAME importSave pipeline:
// full validation first (malformed = no change, no push), backup + apply with
// rollback, revision stamp, force-push, server read-back. There is no confirm()
// here: the input is invisible to players, and a caller that cannot evaluate
// code cannot answer a dialog either.
// The outcome is written to #ow-save-import-status (textContent = the result
// JSON; data-status = idle|busy|ok|error), and restored there from
// lastImportResult() after the reload a successful import triggers.
export const IMPORT_INPUT_ID = 'ow-save-import';
export const IMPORT_STATUS_ID = 'ow-save-import-status';
function showImportStatus(el, status, res) {
	if (!el) return;
	el.dataset.status = status;
	el.textContent = res ? JSON.stringify(res) : '';
}
export function installImportInput() {
	if (document.getElementById(IMPORT_INPUT_ID)) return document.getElementById(IMPORT_INPUT_ID);
	const hide = 'position:absolute;left:-10000px;top:0;width:1px;height:1px;opacity:0;overflow:hidden;';
	const inp = document.createElement('input');
	inp.type = 'file';
	inp.id = IMPORT_INPUT_ID;
	inp.accept = '.json,application/json';
	inp.setAttribute('aria-label', 'Import an overworld save file');
	inp.tabIndex = -1;
	inp.style.cssText = hide;
	const out = document.createElement('output');
	out.id = IMPORT_STATUS_ID;
	out.setAttribute('for', IMPORT_INPUT_ID);
	out.style.cssText = hide;
	document.body.appendChild(inp);
	document.body.appendChild(out);
	// the previous import's outcome survives its reload
	const last = lastImportResult();
	showImportStatus(out, last ? (last.ok ? 'ok' : 'error') : 'idle', last);
	inp.addEventListener('change', async () => {
		const f = inp.files && inp.files[0];
		if (!f) return;
		showImportStatus(out, 'busy', { stage: 'reading', file: f.name });
		let text;
		try { text = await f.text(); }
		catch (e) { showImportStatus(out, 'error', { ok: false, stage: 'read', error: 'Could not read the file: ' + (e && e.message || e) }); inp.value = ''; return; }
		const res = await importSave(text, { source: 'dom-input' });
		res.file = f.name;
		showImportStatus(out, res.ok ? 'ok' : 'error', res);
		inp.value = '';   // the same file can be uploaded again
	});
	return inp;
}
// the result of the last import (survives its reload), or null
export function lastImportResult() {
	try { return JSON.parse(sessionStorage.getItem(IMPORT_RESULT_KEY) || 'null'); } catch (e) { return null; }
}
// put back the game the last import replaced (same validated pipeline)
export async function rollbackImport(opts = {}) {
	const b = Savefile.importBackup();
	if (!b) return { ok: false, stage: 'validate', source: 'rollback', error: 'No import backup on this device.' };
	return importSave({ magic: b.magic, version: b.version, exported_at: b.backed_up_at, keys: b.keys }, { ...opts, source: 'rollback' });
}
// compare this device's save with the server's copy (post-reload verification).
// The running game keeps writing (a reload lays down defaults, playtime ticks),
// so pending changes are pushed first unless opts.flush === false.
export async function verifySave(opts = {}) {
	if (MP_ON && opts.flush !== false && owDirty()) { try { await pushOw(); } catch (e) {} }
	const local = owSnapshot();
	const out = { localRev: owRev(), localFp: owFingerprint(local), signedIn: !!MP_ON };
	if (!MP_ON) return out;
	try {
		const r = await MP.call('ow-load');
		const ow = r && r.ow && r.ow.ow;
		out.remoteRev = ow ? Math.max(0, parseInt(ow[OW_REV_KEY], 10) || 0) : null;
		out.remoteFp = ow ? owFingerprint(ow) : null;
		out.bodiesEqual = !!ow && owBody(ow) === owBody(local);
		out.ok = out.bodiesEqual && out.remoteRev === out.localRev;
	} catch (e) { out.error = String(e && e.message || e); out.ok = false; }
	return out;
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
