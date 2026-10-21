// /api/mp — the account backend (the /login screen + game clients call it).
//
// One POST endpoint, JSON body { action, ...payload }, Bearer token auth.
// The server is authoritative for everything a player could cheat:
// pack contents are rolled here, rewards are granted here, deck saves are
// validated against the owned collection here.
//
// Runtime: Cloudflare Pages Function — functions/api/mp.mjs wraps this and
// serves it at /api/mp. Storage: Cloudflare D1 (the MP_DB binding), one JSON
// row per user in the mp_store table. Secret: set MP_SECRET in the Cloudflare
// environment. The fallback below keeps dev working but is public knowledge —
// tokens are forgeable until MP_SECRET is set.
import { scrypt as scryptCb, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { STARTER_DECKS } from '../battlecards/dungeon.js';
import { STARTING_COLLECTION } from '../battlecards/starter-collection.js';
import { STARTER_DECKS_LIST } from '../battlecards/starter-decks.js';
import { createMatch, submitAction, replaceFainted, sideOf } from '../battlecards/pvpbattle.js';
import POOL from './pool-rarity.json';
import LOADOUTS from './loadout-cards.json'; // { id: { kind:'commander'|'companion', cls } }
import CORR_BANS from './correspondence-bans.json'; // countering is banned in play-by-mail (gen-correspondence-bans.mjs)

const SECRET = process.env.MP_SECRET || 'magepunk-dev-secret-set-MP_SECRET';
const TOKEN_DAYS = 30;
const PACK_SIZE = 5;
const DECK_SIZE = 40;               // PvP constructed decks are 40 cards (dungeon decks are separate)
const MAX_COPIES = 2;               // DECK limit: how many copies may go in a deck
const MAX_LEGENDARY_COPIES = 1;
// OWNERSHIP limit — deliberately different from the deck limit. Extra copies
// used to pile up untouched, so a pack full of dupes felt like nothing happened;
// they now sit in the collection until you choose to dust them down to a playset.
// The 999 ceiling only exists so one id can't grow without bound: copies past it
// are dusted on the spot rather than dropped, so a pack is never wasted.
const MAX_OWNED_COPIES = 999;
const DUST_VALUE = { common: 5, uncommon: 10, rare: 20, epic: 100, legendary: 400 };
const CRAFT_COST = { common: 40, uncommon: 80, rare: 100, epic: 400, legendary: 1600 };
const playsetCap = rarity => (rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES);
// The one place NEW copies enter a collection (packs, weekly card). Distinct
// from grantCards() below, which only tops a collection up to a starter deck's
// requirement. Returns dust auto-refunded for anything over the ownership
// ceiling (0 in practice — 999 of one card is a lot).
function addCopies(user, ids) {
	const col = user.collection || (user.collection = {});
	let refunded = 0;
	for (const id of ids) {
		const have = col[id] || 0;
		if (have >= MAX_OWNED_COPIES) {
			refunded += DUST_VALUE[POOL[id]?.[0]] || 0;   // at the ceiling: pay out instead of dropping it
			continue;
		}
		col[id] = have + 1;
	}
	if (refunded) user.dust = (user.dust || 0) + refunded;
	return refunded;
}
const MAX_DECK_SLOTS = 40;          // each player can save up to 40 PvP decks
const REWARD_COOLDOWN_MS = 60_000;  // one run reward a minute tops
const PACK_TIMER_MS = 12 * 60 * 60 * 1000; // a free pack drops every 12 hours
const PACK_INBOX_CAP = 120;         // the special pack inbox holds up to 120 packs

// ---------- input-hardening limits ----------
const MAX_BODY_BYTES = 2_000_000;   // reject an absurd request body outright (413) — a big FFA snapshot is well under this
const INTENT_MAX_BYTES = 4096;      // a relayed guest intent is a tiny action descriptor, not a payload
const REPLAY_MAX_BYTES = 1_500_000; // a shared replay tape (gzipped + base64url) — slim (v2) tapes run ~100-600KB; this leaves headroom for marathon FFA games while staying under MAX_BODY_BYTES
const SPEC_WINDOW_MS = 12_000;      // a spectator seen (polled) within this long is counted as actively watching
const SPEC_CAP = 10;                // max concurrent spectators per GAME (aggregated across a duel's participants)
// MICATRO (/micatro/, the poker roguelike) broadcasts its run like the card runs, but
// the client only publishes when the view CHANGED (+ a ~10s keep-alive), so the row
// counts as live for longer than a card snapshot, and an unchanged keep-alive only
// rewrites the row when it is getting old (write budget, writebudget_test.mjs).
const MICATRO_SNAPSHOT_MAX = 200_000; // one serialized run view — far under MAX_BODY_BYTES
const MICATRO_STALE_MS = 45_000;    // no publish in this long → the run is not watchable
const MICATRO_REFRESH_MS = 20_000;  // an unchanged keep-alive rewrites the state row only past this age
const MICATRO_PRESENCE_MS = 30_000; // ...and the presence row only past this age (ONLINE_MS is 90s)
const SPEC_BEAT_MS = 4_000;         // a micatro spectator's heartbeat row is rewritten at most this often (< SPEC_WINDOW_MS)
// MICATRO custom decks (the deck editor): one row `micatrodecks:<user>` = {rev, decks: [{id, def, updated}]}.
const MICATRO_PROGRESS_BYTES = 4000;      // the Nuzlocke / Monotype record + achievements (a few hundred bytes in practice)
const MICATRO_DECKS_MAX = 30;           // decks per player
const MICATRO_DECK_BYTES = 66_000;      // one serialized deck definition (the client caps a definition at 64 KB)
const MICATRO_DECKS_BYTES = 400_000;    // the whole row
// MICATRO per-joker win (stake) stickers (micatro/js/ui/stickers.js): one durable row per player,
// `micatro_stickers:<user>` = {v:2, wins: {jokerKey: {win, poke, nuz, mono, both}}, rev, updatedAt}, each category the
// highest stake level 1..9 won at (win = any win; poke = a win with Pokermon on; nuz = Nuzlocke; mono = Monotype; both = the two together;
// 9 = Elite, Pokermon's / Nacho's Elite stake: stickers.js MAX_LEVEL).
// The older flat form {jokerKey: level} means {win: level}. A put MERGES (max per key and category), so a stale
// device can never lower or drop a sticker.
// REVOKING a sticker granted by mistake (an admin edit of the row in D1; no client action adds one): the row's
// optional `revoked` = {jokerKey: true | [cats] | {cats: true | [cats], at: ms}} (true = every category). Each put
// keeps it verbatim and strips those keys / categories from the incoming wins (and from the stored ones) before
// merging, and get / put return it, so a device still holding the sticker drops it (stickers.js) instead of pushing
// it back. RE-EARN rule: with `at` (epoch ms), a category the put proves was earned AFTER `at` (its `earned`
// {key: {cat: ms}} time, which recordWin stamps) is accepted again, and the row's `earned` keeps that time so the
// revocation never strips it later; without `at`, the key is blocked until the admin removes the revocation.
// OLD CLIENTS and level 9: a client before the Elite sticker drops a record level it doesn't know (stickers.js levelOf 1..8), so a
// stored 9 would vanish from its view and its own 8 would look "ahead" of the account forever (a push every 1.5 s until the rate
// limit). A current client sends `maxLevel: 9`; to any other, get / put ANSWER with each 9 shown as 8 (Gold) — the row keeps the 9,
// and the old client's 8 never lowers it (max-merge).
const MICATRO_STICKERS_MAX = 5000;        // joker keys per player (vanilla + every mod is well under 2000)
const MICATRO_STICKERS_BYTES = 700_000;   // one serialized `wins` map (5000 64-char keys x 4 categories is ~525 KB)
const MICATRO_STICKER_KEY_RE = /^[A-Za-z0-9_]{1,64}$/;
const MICATRO_STICKER_CATS = ['win', 'poke', 'nuz', 'mono', 'both'];
// MICATRO all-stakes allowance (owner decision 2026-10-20): these accounts have every stake open on every deck, whatever
// their win stickers say (micatro/js/ui/stakeunlocks.js; everyone else unlocks per deck, Balatro's rule). Extra accounts
// can be added with the MICATRO_ALL_STAKES env var (comma-separated). Server-side only: get / put ANSWER `allStakes: true`
// for them; nothing a client sends sets it, and the row never stores it.
const MICATRO_ALL_STAKES = ['kgib', 'jfost711'];
const micatroAllStakes = (username) => {
	const extra = (typeof process !== 'undefined' && process.env && process.env.MICATRO_ALL_STAKES) || '';
	const list = [...MICATRO_ALL_STAKES, ...String(extra).split(',')].map(s => s.trim().toLowerCase()).filter(Boolean);
	return !!username && list.includes(String(username).toLowerCase());
};
// MICATRO completed challenges (micatro/js/ui/challengesync.js): one durable row per player,
// `micatro_challenges:<user>` = {v:1, done: {challengeId: first completion time}, rev, updatedAt}. A put MERGES
// (union; the EARLIEST time per id), so a stale or second device can never un-complete a challenge.
const MICATRO_CHALLENGES_MAX = 1000;      // ids per player (Balatro's 20 + every mod's is well under 200)
const MICATRO_CHALLENGE_ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
// MICATRO in-progress run (micatro/js/ui/runsync.js): ONE active run per player, so it follows them between
// devices. `micatro_run:<user>` = {v:1, rev, run: {id, recipe, updatedAt, device, progress: {ante, round, actions}} | null,
// ended: [{id, actions, outcome, at}] (the last few runs that FINISHED, so a late put can't resurrect them), updatedAt}.
// The run's id is seed + ':' + started (the recipe's own fields). A long won run (~860 actions) is ~25 KB; an
// Endless marathon at the replay cap (20000 actions) ~600 KB.
const MICATRO_RUN_BYTES = 700_000;        // one serialized recipe
const MICATRO_RUN_ENDED = 10;             // finished-run tombstones kept
const MICATRO_RUN_OUTCOMES = ['won', 'lost', 'abandoned', 'replaced'];
const MICATRO_STICKER_LEVEL_MAX = 9;      // 9 = Elite
const stickerLevel = (v) => (Number.isInteger(v) && v >= 1 && v <= MICATRO_STICKER_LEVEL_MAX ? v : 0);
// the `wins` an answer carries: a copy with every level above `max` shown as `max` (an old client's Gold for Elite)
function stickersFor(wins, max) {
	if (max >= MICATRO_STICKER_LEVEL_MAX) return wins;
	const out = {};
	for (const k of Object.keys(wins)) { out[k] = {}; for (const c of Object.keys(wins[k])) out[k][c] = Math.min(wins[k][c], max); }
	return out;
}
// the highest level the asking client knows (a body's `maxLevel`; none = an old client: 8)
const stickerClientMax = (b) => (b && Number.isInteger(b.maxLevel) && b.maxLevel >= MICATRO_STICKER_LEVEL_MAX ? MICATRO_STICKER_LEVEL_MAX : 8);
// one joker's record, either form -> {cat: level}; null when it is not a valid, non-empty record
// (`loose`: skip a bad category instead of refusing the record — for rows already stored)
function stickerRecord(v, loose = false) {
	if (typeof v === 'number') return stickerLevel(v) ? { win: v } : null;
	if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
	const out = {};
	for (const k of Object.keys(v)) {
		if (!MICATRO_STICKER_CATS.includes(k) || !stickerLevel(v[k])) { if (loose) continue; return null; }
		out[k] = v[k];
	}
	return Object.keys(out).length ? out : null;
}
// the row's admin `revoked` field -> {key: {cats: [cat...], at: ms | null}} (null: blocked until removed); junk ignored
function stickerRevocations(rv) {
	const out = Object.create(null);
	if (!rv || typeof rv !== 'object' || Array.isArray(rv)) return out;
	for (const k of Object.keys(rv)) {
		if (!MICATRO_STICKER_KEY_RE.test(k) || k === '__proto__') continue;
		let v = rv[k], at = null;
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			if (Number.isFinite(v.at) && v.at > 0) at = Math.floor(v.at);
			v = 'cats' in v ? v.cats : true;
		}
		const cats = v === true ? MICATRO_STICKER_CATS.slice() : Array.isArray(v) ? MICATRO_STICKER_CATS.filter((c) => v.includes(c)) : [];
		if (cats.length) out[k] = { cats, at };
	}
	return out;
}
// earned times {key: {cat: ms}}, kept only for revoked keys / categories (capped at `cap`, the server's now)
function stickerEarned(m, revs, cap = Infinity) {
	const out = Object.create(null);
	if (!m || typeof m !== 'object' || Array.isArray(m)) return out;
	for (const k of Object.keys(revs)) {
		const r = Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null;
		if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
		for (const c of revs[k].cats) {
			const t = r[c];
			if (Number.isFinite(t) && t > 0) (out[k] || (out[k] = {}))[c] = Math.min(Math.floor(t), cap);
		}
	}
	return out;
}
// was (key, cat) earned after its revocation? (never, when the revocation has no `at`)
const stickerReEarned = (revs, earned, k, c) => revs[k].at != null && ((earned[k] && earned[k][c]) || 0) > revs[k].at;
// drop the revoked keys / categories (not re-earned) from a {key: {cat: level}} map; returns how many were dropped
function stripRevokedStickers(wins, revs, earned) {
	let n = 0;
	for (const k of Object.keys(revs)) {
		const cur = wins[k];
		if (!cur) continue;
		for (const c of revs[k].cats) if (cur[c] && !stickerReEarned(revs, earned, k, c)) { delete cur[c]; n++; }
		if (!Object.keys(cur).length) delete wins[k];
	}
	return n;
}
// MICASURVIVOR (/micasurvivor/, the PokéSurvivor port) cloud save: one row per player,
// `micasurvivor:<user>` = {rev, save, updated_at}. The client keeps a localStorage copy
// (cache/offline) and writes with compare-and-set on `rev`: a stale put gets 409 + the
// stored save, the client MERGES (micasurvivor/js/core/db.js merge(): collections union,
// stats max, coins/tickets by per-device ledger) and retries, so a second device never
// silently overwrites the first.
const MICASURVIVOR_SAVE_MAX = 400_000;  // one serialized save (a full collection with upgrades is ~100-200 KB)
// MICASURVIVOR online co-op (M5 batch 12b; the msurv-* actions). Friends-only lobbies of up to 4,
// WebRTC signalling and a polling relay fallback, all through this table:
//   msurvlobby:<id>          {id, host, open, rev, ts, members:[{name,dex,shiny,ready,seen}], invited:{name:at}, start}
//                            every change is a compare-and-set on `rev` (setIfRev), so joins never clobber
//   msurvinv:<to>:<host>     {id, host, at}: an invite (one row per pair, so two hosts never clobber)
//   msurvsig:<id>:<from>     {ts, to:{name:[[seq, signal]...]}}: one sender's signalling window
//   msurvrelay:<id>:<from>   {ts, to:{name:[[seq, msg]...]}, ack:{name:seq}}: one sender's relay window
// A row is only ever written by its own sender (no read-modify-write races between players); a
// receiver reads the rows of the other members of ITS lobby and keeps the part addressed to it.
const MSURV_MAX = 4;                       // players per lobby (upstream's MAX_PLAYERS)
const MSURV_LOBBY_IDLE_MS = +process.env.MSURV_LOBBY_IDLE_MS || 60_000;   // a waiting lobby whose host stopped polling is closed
const MSURV_RUN_IDLE_MS = 10 * 60_000;     // ...a started one (the host keeps it alive every ~2 min in a run)
const MSURV_MEMBER_IDLE_MS = +process.env.MSURV_MEMBER_IDLE_MS || 45_000; // a waiting guest who stopped polling is dropped
const MSURV_SEEN_BEAT_MS = 15_000;         // a member's `seen` is rewritten at most this often
const MSURV_INVITE_TTL_MS = 3 * 60_000;    // upstream's INVITE_TTL
const MSURV_PRESENCE_MS = 60_000;          // presence from MicaSurvivor is rewritten at most this often (ONLINE_MS is 90s)
const MSURV_SIGNAL_MAX = 24_000;           // one sender's signalling row (SDP offers are ~1-3 KB, a candidate ~250 B)
const MSURV_SIGNAL_WINDOW = 48;            // signals kept per recipient
const MSURV_RELAY_MSG_MAX = 16_000;        // one relayed game message
const MSURV_RELAY_MAX = 64_000;            // one sender's relay row (its unacknowledged window to everyone)
const MSURV_RELAY_WINDOW = 30;             // unacknowledged messages kept per recipient (~10 s at 3 Hz)
const MSURV_RELAY_MIN_MS = +process.env.MSURV_RELAY_MIN_MS || 1000;       // HARD floor between one sender's relay writes (<= 1 write/s: owner, 2026-10-18)
// The relay's daily allowance per HOST (owner, 2026-10-18: "slow relay + time cap"): a UTC minute counts once if any
// relay write happened in one of that host's lobbies during it; past the cap, relay pushes / pulls in the host's
// lobbies are refused (403 {budget:true}) until the next UTC day. Direct (WebRTC) play never touches it.
//   msurvrelaybudget:<host>:<YYYYMMDD>   {rev, used, last}   (compare-and-set on rev; swept after 2 days)
const MSURV_RELAY_DAILY_MIN = 30;
const MSURV_RELAY_STALE_MS = 30_000;       // a relay row this old is ignored (its sender is gone)
// MICASURVIVOR live spectating (M5 batch 12c): friends watch a run read-only, by polling, and it costs ~0 D1
// writes while nobody watches. Rows (every one written only by its owner, at an exact key):
//   msurvlive:<user>          {run, ts, label, mode, dex, group, over}: the "in a run" beacon. Written when a run
//                             starts / ends / changes mode or group, else only every MSURV_LIVE_BEAT_MS (an
//                             unwatched run: ~0.2 writes a minute). Live while younger than MSURV_LIVE_TTL_MS.
//   msurvstate:<user>         {run, seq, ts, snap, label, mode, over, watchers, watcherNames}: the latest snapshot,
//                             written ONLY while someone watches (<= 1 a second, 1 per 5 s past the daily minutes)
//   msurvspec:<user>:<viewer> a watcher's heartbeat (ms), rewritten at most every SPEC_BEAT_MS; the publisher's
//                             watcher check (publish-micasurvivor with no snapshot, every ~10 s) only READS these
//   msurvspecbudget:<user>:<YYYYMMDD>  {rev, used, last}: watched minutes per publisher per UTC day (a minute
//                             counts once; compare-and-set like the relay budget)
const MSURV_LIVE_BEAT_MS = 5 * 60_000;
const MSURV_LIVE_TTL_MS = 6 * 60_000;
const MSURV_STATE_STALE_MS = 20_000;       // no snapshot in this long -> waiting (the beacon still says live)
const MSURV_STATE_MIN_MS = +process.env.MSURV_STATE_MIN_MS || 900;   // HARD floor between one publisher's snapshot writes
const MSURV_STATE_SLOW_MS = 5000;          // ...past MSURV_SPEC_DAILY_MIN watched minutes today
const MSURV_SPEC_DAILY_MIN = 60;
const MSURV_SNAPSHOT_MAX = 24_000;         // one serialized snapshot (a busy late-game screen is ~4-6 KB)
// MICASURVIVOR run replays (M5 batch 12c): a finished run as delta-encoded snapshots, packed like the Micatro
// replays ('G1.' gzip / 'R1.' raw, base64url). PUBLIC to read by link (micasurvivor-replay-get, above the auth gate).
//   msurvreplay:<8 hex>       {code, meta, by, when}   (30-day GC, like mreplay:)
//   msurvreplays:<user>       {ids:[{id, when}]}: the player's own stored replays, newest first; past
//                             MSURV_REPLAY_PER_USER the oldest is deleted (only if it is the player's own row)
// (No '_' in these prefixes: the store's prefix scans and sweeps use LIKE, where '_' is a wildcard.)
const MSURV_REPLAY_MAX = 1_200_000;        // the packed code (measured: a busy 30-min run, ~65 foes on screen, packs to 679 KB)
const MSURV_REPLAY_UNPACKED = 8_000_000;   // gunzip stops here
const MSURV_REPLAY_FRAMES = 30_000;        // frames in one replay (4 h at 2 a second)
const MSURV_REPLAY_PER_USER = 10;
const msurvNow = () => (typeof globalThis.__msurvClock === 'function' ? globalThis.__msurvClock() : Date.now());
// the "in a run" beacon of `who` -> the row if live (fresh and not over), else null
async function msurvLiveOf(store, who, now) {
	const b = await store.get('msurvlive:' + who);
	return b && !b.over && now - (+b.ts || 0) < MSURV_LIVE_TTL_MS ? b : null;
}
// who is watching `who`'s MicaSurvivor run right now (a startsWith filter: '_' in a name is a LIKE wildcard)
async function msurvWatchers(store, who, now) {
	const prefix = 'msurvspec:' + who + ':';
	const out = [];
	for (const r of await store.list(prefix)) {
		if (!r.key.startsWith(prefix)) continue;
		if (now - (+r.value || 0) < SPEC_WINDOW_MS) out.push({ name: r.key.slice(prefix.length), t: +r.value || 0 });
		else out.push({ name: r.key.slice(prefix.length), t: +r.value || 0, stale: true });
	}
	return out;
}
// a replay's display meta — ALLOW-LISTED (shown in a public viewer)
function cleanMsurvReplayMeta(m) {
	m = m && typeof m === 'object' && !Array.isArray(m) ? m : {};
	const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, n).trim();
	const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v)) || 0));
	return {
		dex: int(m.dex, 0, 2000), shiny: !!m.shiny, mon: str(m.mon, 32), mode: /^[a-z]{1,12}$/.test(String(m.mode)) || /^exp-[a-z]{1,12}$/.test(String(m.mode)) ? m.mode : 'normal',
		time: int(m.time, 0, 4 * 3600), level: int(m.level, 0, 9999), kills: int(m.kills, 0, 1e8), bosses: int(m.bosses, 0, 1e5),
		dead: !!m.dead, coop: (Array.isArray(m.coop) ? m.coop : []).map(x => str(x, 40)).filter(x => /^[a-z0-9_.-]{1,40}$/.test(x)).slice(0, 4),
		frames: int(m.frames, 0, MSURV_REPLAY_FRAMES),
		// DLC D0b: an Expedition run's content version + map / difficulty (absent for a base run)
		...(Number.isInteger(m.dv) && m.dv >= 1 && m.dv <= 9999 ? { dv: m.dv, map: /^[a-z]{1,16}$/.test(String(m.map)) ? m.map : '', diff: /^[a-z]{1,16}$/.test(String(m.diff)) ? m.diff : '' } : {}),
	};
}
// MICASURVIVOR leaderboard (run-score mode 'micasurvivor'): best survival time, solo.
const MICASURVIVOR_MAX_TIME = 4 * 3600; // seconds; a longer "run" is refused, not clamped onto the board
// MICASURVIVOR EXPEDITION (DLC D0b; micasurvivor/js/systems/expedition.js): new modes with their OWN save and boards.
//   micasurvivorexp:<user>   {rev, save, updated_at}: Expedition progress (League, unlocks, Lab...), never the base row.
//                            save = {v, counters:{name:n}, sets:{name:[id]}}; a put is compare-and-set on rev AND is
//                            merged into the stored save (max per counter, union per set), so nothing goes backwards.
//   runboard:micasurvivor_expedition:<map>:<diff>   one board per map + difficulty (owner decision #8), ranked by
//                            score, then time. An Expedition score (it carries expMode / dv / map / diff) is refused
//                            on the base 'micasurvivor' board, and an Expedition board score without them is refused,
//                            like micatro / micatro_modded. The key is built here from allow-listed fields.
const MSURV_EXP_SAVE_MAX = 200_000;
const MSURV_EXP_MAPS = ['viridian', 'mtmoon', 'cerulean'];
const MSURV_EXP_DIFFS = ['normal', 'hard', 'nightmare'];
const MSURV_EXP_MODE_RE = /^exp-[a-z]{1,12}$/;
const MSURV_EXP_NAME_RE = /^[a-z][a-z0-9_.:-]{0,63}$/;
const MSURV_EXP_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const msurvExpDvOk = dv => Number.isInteger(dv) && dv >= 1 && dv <= 9999;
// an Expedition save -> {save} in its canonical form, or {error} (strict: the client's own clean() drops what this refuses)
function cleanMsurvExpSave(s) {
	const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
	if (!isObj(s) || !Number.isInteger(s.v) || s.v < 1 || s.v > 1000) return { error: 'not an Expedition save' };
	for (const k of Object.keys(s)) if (!['v', 'counters', 'sets'].includes(k)) return { error: 'unknown field: ' + k.slice(0, 32) };
	const out = { v: s.v, counters: {}, sets: {} };
	if (s.counters != null) {
		if (!isObj(s.counters)) return { error: 'bad counters' };
		const ks = Object.keys(s.counters);
		if (ks.length > 2000) return { error: 'too many counters', max: 2000 };
		for (const k of ks) {
			const n = s.counters[k];
			if (!MSURV_EXP_NAME_RE.test(k) || !Number.isSafeInteger(n) || n < 0 || n > 1e15) return { error: 'bad counter: ' + k.slice(0, 64) };
			out.counters[k] = n;
		}
	}
	if (s.sets != null) {
		if (!isObj(s.sets)) return { error: 'bad sets' };
		const ks = Object.keys(s.sets);
		if (ks.length > 200) return { error: 'too many sets', max: 200 };
		for (const k of ks) {
			const l = s.sets[k];
			if (!MSURV_EXP_NAME_RE.test(k) || !Array.isArray(l) || l.length > 5000) return { error: 'bad set: ' + k.slice(0, 64) };
			const ids = [];
			for (const x of l) {
				const id = typeof x === 'number' && Number.isSafeInteger(x) ? String(x) : x;
				if (typeof id !== 'string' || !MSURV_EXP_ID_RE.test(id)) return { error: 'bad set entry in ' + k.slice(0, 64) };
				if (!ids.includes(id)) ids.push(id);
			}
			out.sets[k] = ids;
		}
	}
	return { save: out };
}
// a + b, never backwards: the max of each counter, the union of each set (a's order first)
function mergeMsurvExpSave(a, b) {
	const out = { v: Math.max(a.v || 1, b.v || 1), counters: { ...a.counters }, sets: {} };
	for (const [k, n] of Object.entries(b.counters)) out.counters[k] = Math.max(out.counters[k] || 0, n);
	for (const k of new Set([...Object.keys(a.sets), ...Object.keys(b.sets)])) {
		const l = (a.sets[k] || []).slice(), seen = new Set(l);
		for (const id of b.sets[k] || []) if (!seen.has(id)) { seen.add(id); l.push(id); }
		out.sets[k] = l.slice(0, 5000);
	}
	return out;
}
// MICATRO run replays: a FINISHED run's recipe {v, seed, back, stake, mods, modOptions, customDeck?,
// actions} packed like a Battlecards tape ('G1.' gzip / 'R1.' raw, base64url). One row per run,
// `mreplay:<8 hex>` = {code, meta, by, when}; the viewer re-simulates it with the engine. A replay is
// always a whole run — the client never uploads a single round.
const MICATRO_REPLAY_MAX = 300_000;      // the packed code (a long Endless run packs to a few tens of KB)
const MICATRO_REPLAY_UNPACKED = 4_000_000; // gunzip stops here (a zip bomb never inflates further)
const MICATRO_REPLAY_ACTIONS = 20_000;   // actions in one run
const REPLAY_ID_RE = /^[a-f0-9]{8,20}$/;
// a packed code -> its text (null on junk or past `max` bytes unpacked)
async function unpackCapped(code, max) {
	let bytes;
	try {
		const b64 = code.slice(3).replace(/-/g, '+').replace(/_/g, '/');
		const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
		bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	} catch { return null; }
	if (code.startsWith('R1.')) return bytes.length > max ? null : new TextDecoder().decode(bytes);
	try {
		const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
		const chunks = [];
		let n = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			n += value.length;
			if (n > max) { reader.cancel().catch(() => {}); return null; }
			chunks.push(value);
		}
		const out = new Uint8Array(n);
		let o = 0;
		for (const c of chunks) { out.set(c, o); o += c.length; }
		return new TextDecoder('utf-8', { fatal: true }).decode(out);
	} catch { return null; }
}
// MICATRO mod version pins (micatro/js/mods/pins.js): {modId: pin}, a pin being the mod's version plus
// '+r<contentRev>' ('3.2.1+r1', '1.0 (old-API)'). Size-capped; a malformed entry is dropped (meta) or the
// whole recipe refused (micatro-replay-put's recipe check).
const MICATRO_PIN_MODS = 32;
const MICATRO_MOD_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MICATRO_PIN_RE = /^[A-Za-z0-9 ._+()-]{1,40}$/;
// -> a clean {id: pin} (null when `loose` is false and anything is malformed)
function cleanModVersions(v, loose = true) {
	if (v == null) return {};
	if (typeof v !== 'object' || Array.isArray(v)) return loose ? {} : null;
	const out = {};
	const keys = Object.keys(v);
	if (keys.length > MICATRO_PIN_MODS && !loose) return null;
	for (const k of keys) {
		const p = v[k];
		if (!MICATRO_MOD_ID_RE.test(k) || k === '__proto__' || typeof p !== 'string' || !MICATRO_PIN_RE.test(p)) { if (loose) continue; return null; }
		if (Object.keys(out).length >= MICATRO_PIN_MODS) break;
		out[k] = p;
	}
	return out;
}
// a micatro replay's display meta — ALLOW-LISTED (it is shown in a public viewer)
function cleanReplayMeta(m) {
	m = m && typeof m === 'object' && !Array.isArray(m) ? m : {};
	const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, n).trim();
	const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v)) || 0));
	let score = 0;
	if (typeof m.score === 'number' && Number.isFinite(m.score)) score = Math.max(0, m.score);
	else if (typeof m.score === 'string' && m.score.length <= 48 && /^(\d+(\.\d+)?(e\+?\d+(\.\d+)?(e\+?\d{1,3})?)?|naneinf)$/i.test(m.score.trim())) score = m.score.trim();
	return {
		score, handName: str(m.handName, 32),
		ante: int(m.ante, 0, 100000), round: int(m.round, 0, 1000000),
		won: !!m.won, endless: !!m.endless,
		back: str(m.back, 40), stake: typeof m.stake === 'string' ? str(m.stake, 40) : int(m.stake, 0, 99),
		mods: [...new Set((Array.isArray(m.mods) ? m.mods : []).filter(x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x)))].slice(0, 32),
		customDeck: str(m.customDeck, 32), seed: str(m.seed, 16),
		actions: int(m.actions, 0, MICATRO_REPLAY_ACTIONS), finalSeq: int(m.finalSeq, 0, 1e9),
		checksum: str(m.checksum, 64), engineVersion: int(m.engineVersion, 0, 1e6),
		// the mod versions + engine rules rev it was recorded on; pinAssumed: a pre-pin recipe read as the legacy table
		modVersions: cleanModVersions(m.modVersions), engineRev: int(m.engineRev, 0, 1e6),
		...(typeof m.pinAssumed === 'string' && /^[A-Za-z0-9:._-]{1,24}$/.test(m.pinAssumed) ? { pinAssumed: m.pinAssumed } : {}),
		...(m.won && cleanRunBadges(m.badges) && (cleanRunBadges(m.badges).nuz || cleanRunBadges(m.badges).mono) ? { badges: cleanRunBadges(m.badges) } : {}),
	};
}
// MICATRO Pokermon run badges + the per-account record (Nuzlocke / Monotype; micatro/js/ui/progress.js).
// Client-reported (like scores): only the SHAPE is validated. The 12 Pokermon types, lowercase.
const MICATRO_TYPES = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless', 'dark', 'metal', 'fairy', 'dragon', 'earth'];
const MICATRO_ACH_MAX = 64;
/** A run row's badges {nuz?: true, mono?: '<type>'} -> the clean object, or null for a bad shape. */
function cleanRunBadges(b) {
	if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
	for (const k of Object.keys(b)) if (k !== 'nuz' && k !== 'mono') return null;
	const out = {};
	if (b.nuz != null) { if (typeof b.nuz !== 'boolean') return null; if (b.nuz) out.nuz = true; }
	if (b.mono != null && b.mono !== false) { if (typeof b.mono !== 'string' || !MICATRO_TYPES.includes(b.mono)) return null; out.mono = b.mono; }
	return out;
}
// The per-type maps {type: n}: mono (Monotype wins), monoStake (the best stake won as that Monotype), bothMono
// (Nuzlocke + Monotype wins of that type), bothStake (the best stake of those). The *Stake maps hold a level <= 99.
// (monoStake / bothMono / bothStake came later: an older client never sends them, and the merge keeps them.)
const MICATRO_TYPE_MAPS = ['mono', 'monoStake', 'bothMono', 'bothStake'];
const emptyMicatroProgress = () => ({ v: 1, nuz: 0, nuzStake: 0, both: 0, mono: {}, ach: {}, monoStake: {}, bothMono: {}, bothStake: {} });
/** An incoming record -> clean {v, nuz, nuzStake, both, mono, ach: {id: ts}, monoStake, bothMono, bothStake}, or null for a bad shape. */
function cleanMicatroProgress(p) {
	if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
	const count = (v, hi = 1e7) => (v == null ? 0 : Number.isInteger(v) && v >= 0 && v <= hi ? v : NaN);
	const out = emptyMicatroProgress();
	for (const k of ['nuz', 'nuzStake', 'both']) { out[k] = count(p[k], k === 'nuzStake' ? 99 : 1e7); if (Number.isNaN(out[k])) return null; }
	for (const m of MICATRO_TYPE_MAPS) {
		if (p[m] == null) continue;
		if (typeof p[m] !== 'object' || Array.isArray(p[m])) return null;
		for (const [t, n] of Object.entries(p[m])) { const c = count(n, m.endsWith('Stake') ? 99 : 1e7); if (!MICATRO_TYPES.includes(t) || Number.isNaN(c)) return null; if (c) out[m][t] = c; }
	}
	if (p.ach != null) {
		if (typeof p.ach !== 'object' || Array.isArray(p.ach)) return null;
		const ids = Object.keys(p.ach);
		if (ids.length > MICATRO_ACH_MAX) return null;
		for (const id of ids) { const ts = p.ach[id]; if (!/^[a-z0-9_]{1,32}$/.test(id) || !Number.isInteger(ts) || ts <= 0 || ts > 1e13) return null; out.ach[id] = ts; }
	}
	return out;
}
/** a + b, never backwards: counts take the max, types / achievements the union (an achievement keeps its earliest time). */
function mergeMicatroProgress(a, b) {
	const out = emptyMicatroProgress();
	for (const k of ['nuz', 'nuzStake', 'both']) out[k] = Math.max(+a[k] || 0, +b[k] || 0);
	for (const m of MICATRO_TYPE_MAPS) for (const t of MICATRO_TYPES) { const n = Math.max(+(a[m] || {})[t] || 0, +(b[m] || {})[t] || 0); if (n) out[m][t] = n; }
	const ids = [...new Set([...Object.keys(a.ach || {}), ...Object.keys(b.ach || {})])].sort().slice(0, MICATRO_ACH_MAX);
	for (const id of ids) { const x = (a.ach || {})[id], y = (b.ach || {})[id]; out.ach[id] = x && y ? Math.min(x, y) : x || y; }
	return out;
}
/**
 * READ-TIME backfill of the per-type fields for a record from before they existed (nothing stored is rewritten):
 * the player's own saved run replays (`mreplay:<id>`, one per run, meta {won, stake, badges: {nuz?, mono?}} — the same
 * client-reported badges the record itself came from) give, per Monotype type, the best stake won and how many of those
 * wins were also a Nuzlocke. `runs`: [{stake, badges}]. Returns the derived {monoStake, bothMono, bothStake} (a record
 * shape the max-merge folds in), or null when there is nothing to add.
 */
function micatroProgressFromRuns(runs) {
	const out = { monoStake: {}, bothMono: {}, bothStake: {} };
	let any = false;
	for (const r of runs || []) {
		const b = cleanRunBadges(r && r.badges);
		if (!b || !b.mono) continue;
		const lv = Math.min(99, Math.max(1, Math.floor(Number(r.stake)) || 1));
		out.monoStake[b.mono] = Math.max(out.monoStake[b.mono] || 0, lv);
		if (b.nuz) { out.bothMono[b.mono] = (out.bothMono[b.mono] || 0) + 1; out.bothStake[b.mono] = Math.max(out.bothStake[b.mono] || 0, lv); }
		any = true;
	}
	return any ? out : null;
}
/** Does this (merged) record lack per-type data it should have (a Monotype type without a stake, or fewer typed
 *  Nuzlocke + Monotype wins than the total)? Only then does micatro-progress-get look at the replays. */
function micatroProgressNeedsBackfill(p) {
	const placed = Object.values(p.bothMono || {}).reduce((a, n) => a + (+n || 0), 0);
	return (p.both || 0) > placed || Object.keys(p.mono || {}).some((t) => !(p.monoStake || {})[t]);
}
// MICATRO big-number scores (any run past 1e308, sent as text "1.234e450"). The game's scale
// tops out at 9.99e999: an exponent >= 1000 is "naneinf" (-> {naneinf:true}, stored like Infinity).
// -> {text, man, exp} | {naneinf} | null for anything a plain number can hold.
const BIG_SCORE_RE = /^(\d(?:\.\d{1,20})?)e\+?(\d{1,20}(?:\.\d+)?(?:e\+?\d{1,3})?)$/i;
function parseBigScore(s) {
	const m = s.length <= 48 && BIG_SCORE_RE.exec(s);
	if (!m || Number.isFinite(Number(s))) return null;
	const man = Number(m[1]), exp = Number(m[2]);
	if (!(man >= 1 && man < 10) || !(exp >= 308)) return null;
	if (exp >= 1000) return { naneinf: true };
	return { text: s.toLowerCase().replace('e+', 'e'), man, exp };
}
// A board row's sort key: [exponent, mantissa] (big rows store theirs; plain scores derive it).
// A clamped Infinity (score === MAX_VALUE, no big text) is naneinf: past 9.99e999, above every big row.
const scoreKey = (e) => {
	if (e.big && Number.isFinite(e.exp) && Number.isFinite(e.man)) return [e.exp, e.man];
	const s = Number(e.score) || 0;
	if (s <= 0) return [-Infinity, 0];
	if (s >= Number.MAX_VALUE) return [Infinity, 1];
	const x = Math.floor(Math.log10(s));
	return [x, s / Math.pow(10, x)];
};
// > 0 when a outranks b. Two plain rows compare exactly as before (score difference).
function micatroScoreCmp(a, b) {
	if (!a.big && !b.big) return (a.score || 0) - (b.score || 0);
	const [ea, ma] = scoreKey(a), [eb, mb] = scoreKey(b);
	return ea !== eb ? (ea > eb ? 1 : -1) : ma === mb ? 0 : (ma > mb ? 1 : -1);
}
// Approximate per-identity fixed-window rate limits [maxHits, windowMs]. These are
// abuse BRAKES, not precise quotas: the counter read-modify-write isn't atomic (a
// burst can slightly under-count), which is fine. Legit play stays far under them
// — writes/relays are ~1-2/s, matchmaking joins are rare. Authenticated actions
// bucket by username; the two unauthenticated beacons bucket by client IP.
const RATE_LIMITS = {
	'card-act': [120, 10_000], 'card-publish': [120, 10_000], 'publish-cardstate': [120, 10_000],
	'matchmake-join': [30, 60_000], 'chat-post': [40, 10_000], 'challenge': [20, 60_000],
	'replay-put': [20, 60_000], // uploading a shared replay tape — a rare, deliberate action
	'arena-score': [20, 60_000], // submitting a finished Arena run — rare (a run takes minutes)
	'run-score': [20, 60_000], 'duel-result': [10, 60_000], // run boards + Elo reports — one per finished run/duel
	'craft': [60, 60_000], 'dust-extras': [10, 60_000], // crafting sprees are fine; bulk dusting is rare
	// spectator / duel-guest polls: legit clients poll ~1/s (cardstate) and ~3/s
	// (card-poll, fast during a turn); these ceilings are generous headroom that only
	// trips a runaway/hammering client (the delta already made each poll cheap).
	'cardstate': [40, 10_000], 'card-poll': [80, 10_000],
	// Micatro: the runner publishes at most ~1/1.2s, spectators poll ~1/s
	'publish-micatro': [120, 10_000], 'micatro-state': [40, 10_000],
	'micatro-decks-put': [20, 60_000], // saving custom decks (the deck editor) — deliberate edits, never hot
	// win stickers: a load per page boot + a debounced push per won run (and its retries) — never hot
	'micatro-stickers-get': [30, 60_000], 'micatro-stickers-put': [30, 60_000],
	// the Nuzlocke / Monotype record + achievements: read at boot / sign-in, written after a win (merged, never backwards)
	'micatro-progress-get': [30, 60_000], 'micatro-progress-put': [20, 60_000],
	'micatro-replay-put': [20, 60_000], // a finished run's replay — one (or two: win, then Endless) per run
	// completed challenges: a load per boot + a push per completed challenge (merged, never backwards)
	'micatro-challenges-get': [30, 60_000], 'micatro-challenges-put': [20, 60_000],
	// the in-progress run: a load per boot / menu; the client pushes at round checkpoints (~1 per 20 s at most) and on hide
	'micatro-run-get': [30, 60_000], 'micatro-run-put': [30, 60_000], 'micatro-run-clear': [20, 60_000],
	// MicaSurvivor cloud save: the client debounces (purchases ~3s, run end, else ~30s) — a brake on floods
	'micasurvivor-save-put': [30, 60_000], 'micasurvivor-save-get': [30, 60_000],
	'micasurvivor-exp-save-put': [30, 60_000], 'micasurvivor-exp-save-get': [30, 60_000], // MicaSurvivor Expedition (DLC D0b)
	// MicaSurvivor online co-op (M5 batch 12b): the lobby polls ~1/2s, signalling ~1/s while a pair
	// connects, the relay fallback ~1/s per player (each push is ALSO hard-floored at
	// MSURV_RELAY_MIN_MS per sender by its own row's timestamp, so isolates can't multiply it)
	'msurv-lobby-create': [10, 60_000], 'msurv-lobby-join': [20, 60_000], 'msurv-lobby-leave': [20, 60_000],
	'msurv-lobby-update': [60, 60_000], 'msurv-lobby-poll': [30, 10_000],
	'msurv-invite': [20, 60_000], 'msurv-invites': [20, 60_000], 'msurv-invite-decline': [20, 60_000],
	'msurv-signal-put': [40, 10_000], 'msurv-signal-poll': [30, 10_000],
	'msurv-relay-push': [15, 10_000], 'msurv-relay-pull': [15, 10_000],
	// MicaSurvivor spectating + replays (M5 batch 12c): a watched run publishes ~1/s (an unwatched one checks for
	// watchers every ~10 s), a watcher polls ~1/s; a replay upload is one per finished run (and its retries)
	'publish-micasurvivor': [30, 10_000], 'micasurvivor-state': [30, 10_000],
	'micasurvivor-replay-put': [20, 60_000], 'micasurvivor-replay-list': [20, 60_000],
	// async (correspondence) matches: whole turns, not per-action traffic
	'async-create': [10, 60_000], 'async-move': [30, 60_000], 'async-act': [60, 60_000],
	'set-email': [10, 60_000], // changing the recovery email is a rare, deliberate action
	// the large-blob writes (ow-save is a 1MB snapshot, run-save ~700KB): legit
	// clients debounce to well under one per second — these brake write floods
	'ow-save': [60, 60_000], 'run-save': [60, 60_000], 'base-save': [20, 60_000],
	'replay-playlist-put': [10, 60_000], // one per finished run — deliberate, never hot
	'save-deck': [30, 60_000], 'open-pack': [60, 60_000],
};
const HIT_LIMIT = [240, 60_000];    // per-IP analytics beacon
const ERR_LIMIT = [120, 60_000];    // per-IP error beacon
const LOGIN_LIMIT = [30, 60_000];   // per-IP login attempts — humans retry a handful; this stops scrypt-grinding brute force
const REG_LIMIT = [20, 3600_000];   // per-IP account creation — a LAN party fits; a squatting flood does not
const RGET_LIMIT = [120, 60_000];   // per-IP public replay fetch
const TGET_LIMIT = [60, 60_000];    // per-IP public tuning fetch (2 per game boot)
const AFETCH_LIMIT = [40, 60_000];  // per-IP public override-image fetch (1 per overridden card per boot)
const ART_OVERRIDE_MAX = 500_000;   // one re-encoded 768px jpeg as a data URL
const ART_OVERRIDE_SLOTS = 20;      // bounded: fold into the repo before saving more
const BUG_TEXT_MAX = 60_000;        // a bug report: up to ~60KB of markdown (testers write long ones)
const BUG_OPEN_MAX = 60;            // per reporter, open (un-reviewed) reports
const REPAIR_MAX_BYTES = 600_000;   // one queued save repair (a full save export)

// ---------- lazy GC of ephemeral keys ----------
// D1 has no TTL, so these per-match / per-session rows would grow forever. A lazy
// sweep — at most once per GC_INTERVAL_MS, gated by a `gc:last` marker — deletes
// rows whose LAST WRITE (the maintained `updated_at` column) is older than the
// prefix's TTL. Only EPHEMERAL prefixes are listed; durable data (the user record,
// `code:`, `stat:`, `err:`, `aideckpool`, `mm:queue`, `gc:last`) is never swept.
// Every TTL is far longer than a match can live (matches auto-abandon after ~18s
// of no polling; MATCH_MS is 30m), so a live/recent game is never cut. Note
// `cardmatch:` only gets written at creation / on `over` / on rematch, so its
// updated_at can lag a live match by up to its length — hence the generous 12h.
const GC_INTERVAL_MS = 30 * 60_000;
const HR = 3600; // seconds
const GC_TABLE = [
	['cardmatchstate:', 1 * HR], ['alive:', 1 * HR], ['cardintent:', 1 * HR], ['mm:matched:', 1 * HR], ['rl:', 1 * HR],
	['cardstate:', 6 * HR], ['micatrostate:', 6 * HR], ['trade:', 6 * HR], ['tradeptr:', 6 * HR], ['curmatch:', 6 * HR], ['ready:', 6 * HR], ['challenge:', 6 * HR],
	['cardmatch:', 12 * HR], ['chat:', 12 * HR], ['presence:', 24 * HR],
	['replay:', 30 * 24 * HR], // shared replay tapes expire a month after upload (the owner keeps a local copy)
	['rplaylist:', 30 * 24 * HR], // a run's "super replay" playlist — same life as the tapes it points at
	['mreplay:', 30 * 24 * HR], // a Micatro run replay (a whole run's recipe) — a month, like the tapes
	['amatch:', 30 * 24 * HR], // an async match untouched for a month is abandoned
	['amlist:', 60 * 24 * HR], // per-user async index; self-heals against missing matches on read
	['spec:', 1 * HR], // spectator heartbeats (spec:<runner>:<viewer>) — short-lived
	// MicaSurvivor online co-op (M5 batch 12b). Every row also has a much shorter LOGICAL life
	// (MSURV_* below: a lobby whose host stopped polling is closed, an invite lasts 3 min, a relay
	// row is ignored after 30 s); these sweeps only reclaim the rows of lobbies nobody closed.
	['msurvsig:', 1 * HR], ['msurvrelay:', 1 * HR], ['msurvinv:', 1 * HR], ['msurvlobby:', 12 * HR],
	['msurvrelaybudget:', 48 * HR], // the relay's daily minutes per host (msurvrelaybudget:<host>:<YYYYMMDD>)
	// MicaSurvivor spectating + replays (M5 batch 12c): the beacon, the snapshot and the heartbeats have far shorter
	// LOGICAL lives (MSURV_LIVE_TTL_MS, MSURV_STATE_STALE_MS, SPEC_WINDOW_MS); these sweeps only reclaim the rows
	['msurvstate:', 1 * HR], ['msurvspec:', 1 * HR], ['msurvlive:', 6 * HR], ['msurvspecbudget:', 48 * HR],
	['msurvreplay:', 30 * 24 * HR], // a MicaSurvivor run replay — a month, like the Micatro ones
	['msurvreplays:', 60 * 24 * HR], // the per-player replay index (self-heals against swept replays on read)
];

// ---------- authoritative single-player state (durable, server-owned) ----------
// Run progress + overworld (starter/region/position) live under dedicated durable keys (run:<user>,
// ow:<user>) — NOT in GC_TABLE, so never swept — so a logged-in player gets the same, current state on
// any device/browser instead of whatever a possibly-stale localStorage cache holds. Kept off the user
// row so the account blob stays small; each carries `updated_at` for last-write-wins reconciliation.
// every run mode's localStorage key (battlecards/game.js *_KEY); a key missing here
// makes run-save 400 "bad run key", so that mode's run never reaches the server
// (2026-10-04: Sword Coast / Final Fantasy / Multiverse — Remy's FF wins never
// saved). run_keys_test keeps this in step with game.js.
const RUN_KEYS = new Set(['magepunk_dungeon_v1', 'magepunk_heist_v1', 'magepunk_tombs_v1', 'magepunk_duels_v1', 'magepunk_arena_v1', 'magepunk_lorequest_v1', 'magepunk_middleearth_v1', 'magepunk_swordcoast_v1', 'magepunk_finalfantasy_v1', 'magepunk_multiverse_v1']);
const RUN_MAX_BYTES = 700_000; // a run may carry a mid-fight snapshot (both hands/board/deck order)
// The overworld blob now carries the WHOLE canonical save (story flags, badges,
// bag, dex, collected items — not just party/boxes), so the ceiling moved up.
const OW_MAX_BYTES = 1_000_000;
const OW_HISTORY_KEEP = 7; // automatic daily backups retained per user (plus the UNDO slot)

// A ready-made 40-card mage deck so a fresh account can duel without building.
// Deletable like any slot — an account with zero decks can't start a card battle.
const MAGE_STARTER = ['arcane_missiles', 'arcane_missiles', 'mirror_image', 'mirror_image', 'arcane_explosion', 'arcane_explosion', 'frostbolt', 'frostbolt', 'arcane_intellect', 'arcane_intellect', 'fireball', 'fireball', 'flamestrike', 'flamestrike', 'babbling_book', 'babbling_book', 'glacier_racer', 'glacier_racer', 'lab_partner', 'lab_partner', 'mana_wyrm', 'mana_wyrm', 'time_twisted_seer', 'time_twisted_seer', 'wand_thief', 'wand_thief', 'winterspring_whelp', 'winterspring_whelp', 'aqua_archivist', 'aqua_archivist', 'arcanologist', 'arcanologist', 'chill_o_matic', 'chill_o_matic', 'game_master', 'game_master', 'imprisoned_phoenix', 'imprisoned_phoenix', 'magic_dart_frog', 'magic_dart_frog'];
const WARRIOR_STARTER = ['iron_hide', 'iron_hide', 'razorfen_rockstar', 'razorfen_rockstar', 'warbot', 'warbot', 'harbor_scamp', 'harbor_scamp', 'public_defender', 'public_defender', 'quality_assurance', 'quality_assurance', 'redband_wasp', 'redband_wasp', 'fierce_monkey', 'fierce_monkey', 'orgrimmar_aspirant', 'orgrimmar_aspirant', 'rabid_worgen', 'rabid_worgen', 'shield_block', 'shield_block', 'dr_booms_scheme', 'dr_booms_scheme', 'kor_kron_elite', 'kor_kron_elite', 'warsong_outrider', 'warsong_outrider', 'death_revenant', 'death_revenant', 'shieldmaiden', 'shieldmaiden', 'stonemaul_anchorman', 'stonemaul_anchorman', 'ornery_direhorn', 'ornery_direhorn', 'silverfury_stalwart', 'silverfury_stalwart', 'bloodboil_brute', 'bloodboil_brute'];
const HUNTER_STARTER = ['mystery_winner', 'mystery_winner', 'reinforcement_rallier', 'reinforcement_rallier', 'secret_plan', 'secret_plan', 'crackling_razormaw', 'crackling_razormaw', 'dancing_cobra', 'dancing_cobra', 'rapid_fire', 'rapid_fire', 'steamwheedle_sniper', 'steamwheedle_sniper', 'bearshark', 'bearshark', 'carrion_grub', 'carrion_grub', 'cave_hydra', 'cave_hydra', 'conch_s_call', 'conch_s_call', 'marked_shot', 'marked_shot', 'necromechanic', 'necromechanic', 'umbraclaw', 'umbraclaw', 'corpse_widow', 'corpse_widow', 'tundra_rhino', 'tundra_rhino', 'vilebrood_skitterer', 'vilebrood_skitterer', 'pterrorwing_ravager', 'pterrorwing_ravager', 'savannah_highmane', 'savannah_highmane', 'toyrannosaurus', 'toyrannosaurus'];
const newDeckId = () => 'd_' + randomBytes(4).toString('hex');
const mageStarterSlot = () => ({ id: newDeckId(), name: 'Mage Starter', classId: 'mage', cards: [...MAGE_STARTER] });
// the ready-made 40-card PvP starters a fresh account is handed, one per style
const STARTER_SLOT_DEFS = [
	{ name: 'Mage Starter', classId: 'mage', cards: MAGE_STARTER },
	{ name: 'Warrior Starter', classId: 'warrior', cards: WARRIOR_STARTER },
	{ name: 'Hunter Starter', classId: 'hunter', cards: HUNTER_STARTER },
];
// a fresh account is pre-handed all 18 per-class starter-deck templates as saved
// slots (STARTER_DECKS_LIST); every card is in STARTING_COLLECTION, so all are legal.
const starterSlots = () => STARTER_DECKS_LIST.map(d => ({ id: newDeckId(), name: d.name, classId: d.classId, cards: [...d.cards] }));
const grantCards = (collection, ids) => {
	const counts = {};
	for (const id of ids) counts[id] = (counts[id] || 0) + 1;
	for (const [id, n] of Object.entries(counts)) collection[id] = Math.max(collection[id] || 0, n);
};

// Lazy pack accrual: a free pack drops into the special inbox every
// PACK_TIMER_MS, up to PACK_INBOX_CAP. While the inbox is full the timer is
// paused (its base is frozen until you collect). Returns true if it changed.
function accruePacks(user, now) {
	if (user.packInbox == null) user.packInbox = 0;
	if (user.packTimerBase == null) { user.packTimerBase = now; return true; }
	if (user.packInbox >= PACK_INBOX_CAP) return false; // full → paused
	const elapsed = now - user.packTimerBase;
	if (elapsed < PACK_TIMER_MS) return false;
	const add = Math.min(Math.floor(elapsed / PACK_TIMER_MS), PACK_INBOX_CAP - user.packInbox);
	user.packInbox += add;
	user.packTimerBase += add * PACK_TIMER_MS; // keep the partial remainder toward the next one
	return true;
}
// ms until the next inbox pack (null when the inbox is full / paused)
function packEtaMs(user, now) {
	if ((user.packInbox || 0) >= PACK_INBOX_CAP) return null;
	const base = user.packTimerBase || now;
	return Math.max(0, PACK_TIMER_MS - ((now - base) % PACK_TIMER_MS));
}

// ---------- daily quests ----------
// Four fresh quests each UTC day, deterministically seeded per account so a
// refresh never rerolls them. Progress comes from the game reporting the cards
// you play (class / type / cost / keywords) and match wins; claiming a finished
// quest drops its reward packs into the 12h pack inbox.
const DAY_MS = 86_400_000;
const QUEST_COUNT = 4;
const Q_KEYWORDS = { taunt: 'Taunt', rush: 'Rush', lifesteal: 'Lifesteal', deathrattle: 'Deathrattle', battlecry: 'Battlecry', divine_shield: 'Divine Shield', windfury: 'Windfury', poisonous: 'Poisonous', reborn: 'Reborn', stealth: 'Stealth', charge: 'Charge' };
const Q_CLASSES = { mage: 'Mage', warrior: 'Warrior', hunter: 'Hunter', priest: 'Priest', rogue: 'Rogue', druid: 'Druid', paladin: 'Paladin', shaman: 'Shaman', warlock: 'Warlock', death_knight: 'Death Knight', demon_hunter: 'Demon Hunter' };
const hashStr = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry32 = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];
const Q_GEN = {
	any: (r) => { const n = pickR(r, [15, 20, 25]); return { kind: 'play-any', target: n, reward: 1, label: `Play ${n} cards` }; },
	type: (r) => { const t = r() < 0.5 ? 'creature' : 'spell'; const n = pickR(r, [8, 10, 12]); return { kind: 'play-type', pType: t, target: n, reward: 1, label: `Play ${n} ${t === 'creature' ? 'creatures' : 'spells'}` }; },
	keyword: (r) => { const k = pickR(r, Object.keys(Q_KEYWORDS)); const n = pickR(r, [4, 5, 6]); return { kind: 'play-keyword', kw: k, target: n, reward: 2, label: `Play ${n} ${Q_KEYWORDS[k]} cards` }; },
	klass: (r) => { const c = pickR(r, Object.keys(Q_CLASSES)); const n = pickR(r, [6, 8]); return { kind: 'play-class', cls: c, target: n, reward: 1, label: `Play ${n} ${Q_CLASSES[c]} cards` }; },
	cost: (r) => { const op = pickR(r, ['ge', 'le', 'eq']); const x = op === 'ge' ? pickR(r, [5, 6, 7]) : op === 'le' ? pickR(r, [2, 3]) : pickR(r, [2, 3, 4, 5]); const n = pickR(r, [6, 8]); const lbl = op === 'ge' ? `cost ${x} or more` : op === 'le' ? `cost ${x} or less` : `cost exactly ${x}`; return { kind: 'play-cost', op, x, target: n, reward: 1, label: `Play ${n} cards that ${lbl}` }; },
	win: (r) => { const n = pickR(r, [1, 1, 2]); return { kind: 'win', target: n, reward: 2, label: `Win ${n} ${n === 1 ? 'match' : 'matches'}` }; },
};
function genDailyQuests(username, day) {
	const r = mulberry32(hashStr(username + ':' + day));
	const general = r() < 0.5 ? 'any' : 'type';         // slot 0 is always completable by any deck
	const rest = ['type', 'keyword', 'klass', 'cost', 'win'].filter(n => n !== general);
	for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
	return [general, ...rest.slice(0, QUEST_COUNT - 1)].map((name, i) => ({ id: `q_${day}_${i}`, ...Q_GEN[name](r), progress: 0, claimed: false }));
}
function ensureDailyQuests(user, username, now) {
	const day = Math.floor(now / DAY_MS);
	if (!user.quests || user.quests.day !== day) { user.quests = { day, list: genDailyQuests(username, day) }; return true; }
	return false;
}
// ---------- daily streak ----------
// A once-per-day reward whose size grows with your consecutive-day streak. Miss
// a day and it resets. Reward packs drop into the 12h pack inbox like quests.
function streakReward(streak) {
	const weekly = Math.min(4, Math.floor((streak - 1) / 7)); // +1 pack for each full week kept
	const milestone = streak > 0 && streak % 7 === 0 ? 3 : 0;  // every 7th day, a bonus
	return 1 + weekly + milestone;
}
function streakInfo(user, now) {
	const day = Math.floor(now / DAY_MS);
	const st = user.streak || { count: 0, lastClaimDay: -1 };
	const claimedToday = st.lastClaimDay === day;
	const continues = st.lastClaimDay === day - 1;            // claiming today keeps the streak alive
	const count = claimedToday || continues ? (st.count || 0) : 0; // 0 = lapsed / never
	const nextCount = claimedToday ? st.count : (continues ? (st.count || 0) + 1 : 1);
	return { count, claimedToday, nextReward: streakReward(nextCount), nextClaimMs: (day + 1) * DAY_MS - now };
}

// ---------- matchmaking ----------
// A live queue pairs two waiting players into a host-authoritative card duel.
// If nobody else is waiting after MM_AI_TIMEOUT_MS you're handed an AI opponent
// instead — it plays a deck from the AI pool, which is seeded with the starter
// decks and grows with real players' decks as they queue (so the bots start on
// the starters but are gradually replaced by real decklists).
const MM_AI_TIMEOUT_MS = 12_000; // wait this long for a human before the AI steps in
const MM_STALE_MS = 8_000;       // a queue entry that hasn't polled in this long is dropped
const AI_POOL_CAP = 200;         // keep the most recent N harvested decks
const deckSig = (d) => (d.classId || '') + ':' + [...(d.deck || [])].sort().join(',');
const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const botName = (ai) => `${Q_CLASSES[ai.classId] || titleCase(ai.classId) || 'Rival'} Challenger`;
const starterAiPool = () => STARTER_SLOT_DEFS.map(s => ({ deck: [...s.cards], classId: s.classId, commander: null, companion: null, starter: true }));
async function harvestDeck(store, party) {
	if (!party || !Array.isArray(party.deck) || party.deck.length !== DECK_SIZE || !party.classId) return;
	const pool = (await store.get('aideckpool')) || [];
	const sig = deckSig(party);
	if (pool.some(d => deckSig(d) === sig)) return; // already have this exact deck
	pool.push({ deck: party.deck.map(String), classId: party.classId, commander: party.commander || null, companion: party.companion || null, ts: Date.now() });
	await store.setJSON('aideckpool', pool.slice(-AI_POOL_CAP));
}
async function pickAiDeck(store, myParty) {
	const combined = [...starterAiPool(), ...((await store.get('aideckpool')) || [])];
	const mySig = myParty ? deckSig(myParty) : null;
	const pool = combined.filter(d => deckSig(d) !== mySig); // never mirror the player's own deck
	const from = pool.length ? pool : combined;
	return from[Math.floor(Math.random() * from.length)];
}

function applyQuestEvent(user, ev) {
	if (!user.quests) return false;
	let changed = false;
	for (const q of user.quests.list) {
		if (q.claimed || q.progress >= q.target) continue;
		let hit = false;
		if (ev.kind === 'play') {
			if (q.kind === 'play-any') hit = true;
			else if (q.kind === 'play-type') hit = q.pType === 'creature' ? ev.cardType === 'creature' : (ev.cardType === 'sorcery' || ev.cardType === 'instant');
			else if (q.kind === 'play-keyword') hit = Array.isArray(ev.keywords) && ev.keywords.includes(q.kw);
			else if (q.kind === 'play-class') hit = ev.cardClass === q.cls || String(ev.cardClass || '').split('__').includes(q.cls);
			else if (q.kind === 'play-cost') { const c = ev.cost | 0; hit = q.op === 'ge' ? c >= q.x : q.op === 'le' ? c <= q.x : c === q.x; }
		} else if (ev.kind === 'win' && q.kind === 'win') hit = true;
		if (hit) { q.progress = Math.min(q.target, q.progress + 1); changed = true; }
	}
	return changed;
}

const scrypt = (pw, salt) => new Promise((res, rej) =>
	scryptCb(pw, salt, 32, (e, k) => e ? rej(e) : res(k)));

// ---------- storage (Cloudflare D1) ----------
// CONCURRENCY NOTE. get→setJSON is read-modify-write and NOT atomic, so a key
// written by multiple DIFFERENT users at the same instant can lose an update.
// Audited hot paths:
//  • card-intent queue — FIXED: each intent is its own row (list/deleteKeys below),
//    so concurrent FFA relays never clobber → no lost move (the sharpest case).
//  • rematch join — client self-heals (re-offers if its join was dropped); the
//    lobby is low-frequency (end of game) so this is sufficient.
//  • matchmaking queue (mm:queue) — self-heals: pollers re-write every ~2.5s and an
//    idle/dropped waiter re-joins on its next poll; the deterministic minter avoids
//    double-mint. A lost update only delays a match briefly.
//  • per-user record (collection/packs) — a single user rarely fires two
//    collection-mutating requests at once (sequential UI); a full fix would need
//    compare-and-swap on the user row. Low stakes.
//  • analytics stat:<day> — approximate counters; a lost increment is immaterial.
function userStore(db) {
	if (!db) throw new Error('MP_DB binding is missing');
	return {
		get: async (k) => {
			const row = await db.prepare('SELECT value FROM mp_store WHERE key = ?').bind(k).first();
			return row ? JSON.parse(row.value) : null;
		},
		setJSON: async (k, v) => {
			if (v === null) {
				await db.prepare('DELETE FROM mp_store WHERE key = ?').bind(k).run();
				return;
			}
			await db.prepare(
				'INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, unixepoch()) ' +
				'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
			).bind(k, JSON.stringify(v)).run();
		},
		// The overworld save's revision guard, made ATOMIC: write `v` only if the
		// stored blob's revision is not higher than `rev`, in ONE statement. A read
		// (get) then a write (setJSON) let two in-flight saves interleave — during a
		// network stall the client gives up on requests the server is still running,
		// and an OLDER save could pass its check before a newer one landed and then
		// write over it (2026-10-08: Instinct's local 37004 acked while the server
		// held 36998). Returns true when the row was written.
		// Compare-and-set on a row's top-level `rev` in ONE statement: writes `v` only when
		// the stored row's rev equals `expect` (expect 0 = the row must not exist yet, or
		// carry no rev). Returns true when the row was written. (MicaSurvivor saves.)
		setIfRev: async (k, v, expect) => {
			const r = await db.prepare(
				'INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, unixepoch()) ' +
				'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at ' +
				"WHERE COALESCE(CAST(json_extract(mp_store.value, '$.rev') AS INTEGER), 0) = ?"
			).bind(k, JSON.stringify(v), expect).run();
			const changes = r && r.meta ? r.meta.changes : r && r.changes;
			return Number(changes) > 0;
		},
		setOwIfNotNewer: async (k, v, rev) => {
			const r = await db.prepare(
				'INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, unixepoch()) ' +
				'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at ' +
				"WHERE COALESCE(CAST(json_extract(mp_store.value, '$.ow.magepunk_ow_rev') AS INTEGER), 0) <= ?"
			).bind(k, JSON.stringify(v), rev).run();
			const changes = r && r.meta ? r.meta.changes : r && r.changes;
			return Number(changes) > 0;
		},
		// One run mode's entry in the per-user run doc, written ATOMICALLY (json_set in
		// one statement, never read-then-write). The doc holds every mode, and the
		// client fires saves and its end-of-run clear without waiting on each other:
		// with a read and a separate write, a save that read the doc before the clear
		// then wrote the finished run back over it, and the next boot resumed (or
		// rebuilt) a fight from a run that had already ended (Muse's Final Fantasy
		// runs, 2026-10: 36 fights played past a third loss). Refused, as one guard:
		// a run its client has ENDED (the `ended` marker run-clear leaves), and an
		// older revision of the stored run. Returns true when the entry was written.
		setRunEntry: async (k, mode, entry, runId, rev) => {
			const p = '$.' + mode;
			const r = await db.prepare(
				'INSERT INTO mp_store (key, value, updated_at) VALUES (?, json_object(?, json(?)), unixepoch()) ' +
				'ON CONFLICT(key) DO UPDATE SET value = json_set(mp_store.value, ?, json(?)), updated_at = unixepoch() ' +
				'WHERE ? IS NULL OR (COALESCE(json_extract(mp_store.value, ?), \'\') <> ? ' +
				'AND NOT (COALESCE(json_extract(mp_store.value, ?), \'\') = ? AND COALESCE(json_extract(mp_store.value, ?), 0) > ?))'
			).bind(k, mode, entry, p, entry, runId, p + '.ended', runId, p + '.run.runId', runId, p + '.run.rev', rev).run();
			const changes = r && r.meta ? r.meta.changes : r && r.changes;
			return Number(changes) > 0;
		},
		// End one run: its entry becomes an `ended` marker naming the run, in one
		// statement — unless the stored entry is a DIFFERENT run (a newer one started
		// elsewhere), which an old run's clear must not touch.
		endRunEntry: async (k, mode, runId) => {
			const p = '$.' + mode;
			const marker = JSON.stringify({ ended: runId, updated_at: Date.now() });
			await db.prepare(
				'INSERT INTO mp_store (key, value, updated_at) VALUES (?, json_object(?, json(?)), unixepoch()) ' +
				'ON CONFLICT(key) DO UPDATE SET value = json_set(mp_store.value, ?, json(?)), updated_at = unixepoch() ' +
				'WHERE COALESCE(json_extract(mp_store.value, ?), ?) = ?'
			).bind(k, mode, marker, p, marker, p + '.run.runId', runId, runId).run();
		},
		delete: async (k) => {
			await db.prepare('DELETE FROM mp_store WHERE key = ?').bind(k).run();
		},
		// A player's won Micatro run replays that carry badges: [{stake, badges}] (the per-type record backfill,
		// micatro-progress-get). A key-range scan of mreplay: rows (30-day GC), only the two small fields read out.
		micatroReplayBadges: async (username) => {
			const res = await db.prepare(
				"SELECT json_extract(value, '$.meta.stake') AS stake, json_extract(value, '$.meta.badges') AS badges FROM mp_store " +
				"WHERE key >= 'mreplay:' AND key < 'mreplay;' AND json_extract(value, '$.by') = ? AND json_extract(value, '$.meta.won') " +
				"AND json_extract(value, '$.meta.badges') IS NOT NULL"
			).bind(username).all();
			return (res.results || []).map(r => { let badges = null; try { badges = typeof r.badges === 'string' ? JSON.parse(r.badges) : r.badges; } catch { badges = null; } return { stake: r.stake, badges }; });
		},
		// prefix scan, ordered by key — for per-item queues (each row a separate key)
		// that must survive concurrent writers. Callers use controlled prefixes with
		// no LIKE metacharacters (no _ or %), so no escaping is needed.
		list: async (prefix) => {
			const res = await db.prepare('SELECT key, value FROM mp_store WHERE key LIKE ? ORDER BY key').bind(prefix + '%').all();
			return (res.results || []).map(r => ({ key: r.key, value: JSON.parse(r.value) }));
		},
		deleteKeys: async (keys) => {
			if (!keys || !keys.length) return;
			const ph = keys.map(() => '?').join(',');
			await db.prepare(`DELETE FROM mp_store WHERE key IN (${ph})`).bind(...keys).run();
		},
		// GC: drop rows under a prefix whose last write is older than ttlSec (uses the
		// maintained updated_at column, so it's one indexed DELETE — no read/parse).
		// Controlled prefixes only (no LIKE metacharacters), same as list().
		sweepOld: async (prefix, ttlSec) => {
			const cutoff = Math.floor(Date.now() / 1000) - ttlSec;
			await db.prepare('DELETE FROM mp_store WHERE key LIKE ? AND updated_at < ?').bind(prefix + '%', cutoff).run();
		},
	};
}

// ---------- abuse brakes ----------
// One coarse fixed-window counter per bucket — a SINGLE key, overwritten each hit
// (the current window is stored in the value), so the rl:* keyspace stays bounded
// by identities × actions rather than growing a row per window. Returns true when
// the hit is within the limit. Approximate under concurrency, by design.
// TIER 1 — the brake used to cost as much as the thing it was braking: every
// guarded call did a D1 setJSON, which DOUBLED every write action and put a row
// write behind read-only polls (cardstate, card-poll, tuning-get, replay fetches).
// With three players that was roughly half the daily write budget.
//
// These are explicitly approximate ("abuse BRAKES, not precise quotas" — the
// counter was already non-atomic and could under-count a burst), so an in-isolate
// counter keeps the same guarantee at zero rows. It resets when an isolate
// recycles and is per-colo rather than global, which is the trade: a determined
// attacker spread across colos gets a larger multiple of the ceiling than before.
// For that reason the SECURITY-sensitive buckets below stay durable.
const memBuckets = new Map();   // bucket -> { win, n }
function rateLimitMem(bucket, limit, windowMs) {
	const win = Math.floor(Date.now() / windowMs);
	const cur = memBuckets.get(bucket);
	const n = (cur && cur.win === win) ? cur.n + 1 : 1;
	memBuckets.set(bucket, { win, n });
	// bound the map so a long-lived isolate can't grow it without limit
	if (memBuckets.size > 5000) { for (const k of memBuckets.keys()) { memBuckets.delete(k); if (memBuckets.size <= 2500) break; } }
	return n <= limit;
}
// Brute-force protection must survive an isolate recycle and be global, so these
// keep paying a row per attempt. All of them are RARE by nature (a human logging
// in, creating an account, changing a recovery email), so they cost nothing at play time.
const DURABLE_BUCKETS = /^(login|reg|set-email):/;
async function rateLimit(store, bucket, limit, windowMs) {
	if (!DURABLE_BUCKETS.test(bucket)) return rateLimitMem(bucket, limit, windowMs);
	const key = 'rl:' + bucket;
	const win = Math.floor(Date.now() / windowMs);
	const cur = await store.get(key);
	const n = (cur && cur.win === win) ? cur.n + 1 : 1;
	await store.setJSON(key, { win, n });
	return n <= limit;
}
// Cloudflare sets cf-connecting-ip; fall back through x-forwarded-for to a shared
// bucket. Only used to bucket the two unauthenticated beacons — never stored.
const clientIp = (req) => ((req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'anon').split(',')[0].trim() || 'anon').slice(0, 45);

// Names of the friends actively watching `runner`'s broadcast. A spectator
// heartbeats spec:<runner>:<viewer> on each cardstate poll; those seen within
// SPEC_WINDOW_MS are live. Scanned on publish (bounded by the spectator count).
async function listWatchers(store, runner, now) {
	const prefix = 'spec:' + runner + ':';
	const rows = await store.list(prefix);
	const names = [];
	for (const r of rows) if (now - (+r.value || 0) < SPEC_WINDOW_MS) names.push(r.key.slice(prefix.length));
	return names; // full list (the SPEC_CAP enforcement below keeps it small; display sites slice)
}
// aggregate watchers across a match's participants (a spectator may watch any of
// them), excluding the participants themselves (a player isn't a watcher).
async function aggregateWatchers(store, humans, now) {
	const set = new Set();
	for (const h of humans) for (const w of await listWatchers(store, h, now)) if (!humans.includes(w)) set.add(w);
	return [...set];
}
// the active spectator names for `who`'s CURRENT game — duel → aggregate across
// the match's participants; solo/run → just who's own watchers. Drives the cap.
async function gameWatchers(store, cs, who, now) {
	if (cs && typeof cs.room === 'string' && cs.room.startsWith('m:')) {
		const cm = await store.get('cardmatch:' + cs.room.slice(2));
		if (cm) {
			const seats = cm.seats || [{ seat: 0, name: cm.host }, ...(cm.guest ? [{ seat: 1, name: cm.guest }] : [])];
			const humans = cm.humans || seats.filter(s => s.name).map(s => s.name);
			return aggregateWatchers(store, humans, now);
		}
	}
	return listWatchers(store, who, now);
}

// Lazy garbage collection. Runs at most once per GC_INTERVAL_MS across all requests
// (a `gc:last` marker gates it), sweeping each ephemeral prefix past its TTL. The
// gc:last read-modify-write isn't atomic, but a concurrent double-sweep just deletes
// the same dead rows twice — idempotent. Returns whether it swept.
async function maybeGC(store, now) {
	const last = await store.get('gc:last');
	if (last && now - last < GC_INTERVAL_MS) return false;
	await store.setJSON('gc:last', now); // claim the slot first
	for (const [prefix, ttl] of GC_TABLE) await store.sweepOld(prefix, ttl);
	return true;
}

// ---------- auth ----------
const sign = (payload) => createHmac('sha256', SECRET).update(payload).digest('hex');

function makeToken(username) {
	const exp = Date.now() + TOKEN_DAYS * 864e5;
	const payload = `${username}.${exp}`;
	return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
	const m = /^(.+)\.(\d+)\.([0-9a-f]{64})$/.exec(token || '');
	if (!m) return null;
	const payload = `${m[1]}.${m[2]}`;
	const want = Buffer.from(sign(payload));
	const got = Buffer.from(m[3]);
	if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
	if (Date.now() > +m[2]) return null;
	return m[1];
}

// the ONE owner/admin check for every owner-only action (tuning, art, todos,
// gifts, grant-all, the stats/errors dashboards). MP_ADMINS (comma-separated
// usernames) in wrangler.jsonc / the Cloudflare Pages env overrides the default
// — the hardcoded-'mgibbie' copies this replaces silently ignored it.
function isAdmin(username) {
	return (process.env.MP_ADMINS || 'mgibbie').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(username);
}

// ---------- game data ----------
// A fresh account owns a full playset of the starter-deck pool: 2 copies of every
// card any class's starter deck uses (1 for Legendaries, the most a deck may run).
// Everything beyond that is opened from packs.
const STARTER_PACKS = 40;
function startingCollection() {
	// the curated starter set (generated: per-class starter decks + dungeon/heist/
	// tombs run starter decks) — NOT the whole common/uncommon pool
	const col = { ...STARTING_COLLECTION };
	// plus every card the ready-made 40-card PvP starter SLOTS use, so the decks we
	// pre-save into a new account are always legal to play
	for (const def of STARTER_SLOT_DEFS) grantCards(col, def.cards);
	return col;
}

// One-time top-up, run on any authenticated request. The test phase used to hand
// every account the entire pool; when it ends, accounts fall back to what they
// actually own — which for older accounts was a single copy of each starter card.
// Bring everyone to the current baseline, keep their saved decks legal by granting
// the cards those decks use, and pay out the same welcome packs a new account gets.
async function grantStarterBaseline(store, username, user) {
	let changed = false;
	user.collection = user.collection || {};
	if (!user.starterBaselineV2) {
		for (const [id, n] of Object.entries(startingCollection())) {
			user.collection[id] = Math.max(user.collection[id] || 0, n);
		}
		for (const slot of user.decks || []) grantCards(user.collection, slot.cards || []);
		user.packs = (user.packs || 0) + STARTER_PACKS;
		user.starterBaselineV2 = true;
		changed = true;
	}
	// V3: the extra per-class 40-card starter decks. Grant their cards, and hand
	// existing accounts the new deck slots (once, and never a duplicate).
	if (!user.startersV3) {
		for (const def of STARTER_SLOT_DEFS) grantCards(user.collection, def.cards);
		if (!Array.isArray(user.decks)) user.decks = [];
		const have = new Set(user.decks.map(d => (d.name || '') + '|' + (d.classId || '')));
		for (const def of STARTER_SLOT_DEFS) {
			const key = def.name + '|' + def.classId;
			if (!have.has(key) && user.decks.length < MAX_DECK_SLOTS) {
				user.decks.push({ id: newDeckId(), name: def.name, classId: def.classId, cards: [...def.cards] });
			}
		}
		user.startersV3 = true;
		changed = true;
	}
	// V4: the curated starter set (per-class starter-deck templates + run-mode decks,
	// via STARTING_COLLECTION). Grant its cards so an existing account can load a
	// starter template and Save/play it.
	if (!user.startersV4) {
		for (const [id, n] of Object.entries(STARTING_COLLECTION)) {
			user.collection[id] = Math.max(user.collection[id] || 0, n);
		}
		user.startersV4 = true;
		changed = true;
	}
	// V5: pre-save all 18 per-class starter-deck templates as slots (V4 already
	// granted their cards). Dedup by name|classId so an existing account's legacy
	// starter decks aren't duplicated; stop at the slot cap.
	if (!user.startersV5) {
		if (!Array.isArray(user.decks)) user.decks = [];
		const have = new Set(user.decks.map(d => (d.name || '') + '|' + (d.classId || '')));
		for (const d of STARTER_DECKS_LIST) {
			const key = d.name + '|' + d.classId;
			if (!have.has(key) && user.decks.length < MAX_DECK_SLOTS) {
				user.decks.push({ id: newDeckId(), name: d.name, classId: d.classId, cards: [...d.cards] });
				have.add(key);
			}
		}
		user.startersV5 = true;
		changed = true;
	}
	if (changed) await store.setJSON(username, user);
}

// Migrate the old per-class deck object to a list of up to 40 PvP deck slots
// (one-time). Legacy 10-card starter decks aren't valid 40-card PvP decks and
// are dropped; if that leaves you with none, you get a Mage Starter so you can
// duel right away. Runs once per account (guarded by decksMigrated) — after
// that, deleting your last deck leaves you with none, by design.
async function normalizeDecks(store, username, user) {
	if (user.decksMigrated && Array.isArray(user.decks)) return;
	let slots = [];
	if (Array.isArray(user.decks)) {
		slots = user.decks.filter(d => d && Array.isArray(d.cards));
	} else if (user.decks && typeof user.decks === 'object') {
		for (const [classId, cards] of Object.entries(user.decks)) {
			if (Array.isArray(cards) && cards.length === DECK_SIZE) {
				slots.push({ id: newDeckId(), name: classId, classId, cards: cards.map(String) });
			}
		}
	}
	if (!slots.length) {
		const slot = mageStarterSlot();
		slots.push(slot);
		grantCards(user.collection, slot.cards);
	}
	user.decks = slots.slice(0, MAX_DECK_SLOTS);
	user.decksMigrated = true;
	await store.setJSON(username, user);
}

const WEIGHTS = [['common', 60], ['uncommon', 25], ['rare', 10], ['epic', 4], ['legendary', 1]];
const RARE_PLUS = [['rare', 75], ['epic', 20], ['legendary', 5]];

function rollPack() {
	const byRarity = {};
	for (const [id, [rarity]] of Object.entries(POOL)) (byRarity[rarity] = byRarity[rarity] || []).push(id);
	const pull = (table) => {
		const total = table.reduce((s, [, w]) => s + w, 0);
		let r = Math.random() * total, rarity = table[0][0];
		for (const [name, w] of table) { r -= w; if (r <= 0) { rarity = name; break; } }
		const order = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
		while (!byRarity[rarity]?.length) rarity = order[Math.min(order.indexOf(rarity) + 1, order.length - 1)];
		const pool = byRarity[rarity];
		return pool[Math.floor(Math.random() * pool.length)];
	};
	const out = [];
	for (let i = 0; i < PACK_SIZE - 1; i++) out.push(pull(WEIGHTS));
	out.push(pull(RARE_PLUS));
	return out;
}

// legacy class-id spellings some imports used — canonicalize before comparing,
// or cards the builder happily shows get rejected at save (the 278-card
// demonhunter/deathknight lockout, fixed 2026-08-27; data is normalized too,
// this guards against future import drift)
const CLASS_ID_ALIASES = { demonhunter: 'demon_hunter', deathknight: 'death_knight' };
const canonClassId = c => String(c || '').split('__').map(p => CLASS_ID_ALIASES[p] || p).join('__');

function deckError(classId, deck, collection) {
	if (!STARTER_DECKS[classId]) return 'unknown class';
	if (!Array.isArray(deck) || deck.length !== DECK_SIZE) return `deck must be exactly ${DECK_SIZE} cards`;
	const counts = {};
	for (const id of deck) {
		const info = POOL[id];
		if (!info) return `not a collectible card: ${id}`;
		const rarity = info[0], cardClass = canonClassId(info[1]);
		if (cardClass !== 'neutral' && cardClass !== classId
			&& !cardClass.split('__').includes(classId)) return `${id} is not a ${classId} card`;
		counts[id] = (counts[id] || 0) + 1;
		const cap = rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES;
		if (counts[id] > cap) return `too many copies of ${id}`;
		if (counts[id] > (collection[id] || 0)) return `you don't own ${counts[id]}x ${id}`;
	}
	return null;
}

// optional commander + companion ride alongside the 40 (their own zones); each
// must be the right kind and legal for the deck's class (or neutral)
const loadoutClassOk = (cls, classId) => cls === 'neutral' || cls === classId || cls.split('__').includes(classId);
function loadoutError(classId, commander, companion) {
	if (commander) { const L = LOADOUTS[commander]; if (!L || L.kind !== 'commander') return `invalid commander: ${commander}`; if (!loadoutClassOk(L.cls, classId)) return `${commander} is not a ${classId} commander`; }
	if (companion) { const L = LOADOUTS[companion]; if (!L || L.kind !== 'companion') return `invalid companion: ${companion}`; if (!loadoutClassOk(L.cls, classId)) return `${companion} is not a ${classId} companion`; }
	return null;
}

// Opt-in debug override: every account effectively owns a full playset (2 of each
// card, 1 per Legendary), computed from the pool rather than stored. Off by default
// — accounts use their real, stored collections, so cards have to be earned from
// packs. Turn it back on with MP_TEST_PHASE=1 (this override never writes to a
// user's blob, so flipping it either way is non-destructive).
const TEST_PHASE = (process.env.MP_TEST_PHASE ?? '0') !== '0';
const FULL_COLLECTION = (() => {
	const col = {};
	for (const [id, [rarity]] of Object.entries(POOL)) {
		col[id] = rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES;
	}
	return col;
})();
const effectiveCollection = (u) => TEST_PHASE ? FULL_COLLECTION : u.collection;

const publicState = (u, username) => ({
	username,
	collection: effectiveCollection(u),
	decks: u.decks,
	packs: u.packs,
	packInbox: u.packInbox || 0,
	packCap: PACK_INBOX_CAP,
	packTimerMs: PACK_TIMER_MS,
	nextPackMs: packEtaMs(u, Date.now()),
	stats: u.stats,
	dust: u.dust || 0,
	arenaBest: u.arenaBest || null,
	friendCode: u.friendCode || null,
	friends: u.friends || [],
	email: u.email || null, // optional recovery email — SELF state only (never in pubprofile)
	featuredClaimed: !!(u.featuredClaims && u.featuredClaims[Math.floor(Date.now() / (7 * 86400000))]), // Card of the Week already collected this week?
});

// ---------- friends ----------
const ONLINE_MS = 90_000; // a heartbeat within 90s counts as online
const randCode = () => Array.from({ length: 6 },
	() => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join(''); // no I/O

// every account gets a unique 6-letter friend code + a friends list; backfill
// older accounts that predate the feature
async function ensureFriendFields(store, username, user) {
	if (user.friendCode && Array.isArray(user.friends)) return false;
	if (!Array.isArray(user.friends)) user.friends = [];
	if (!user.friendCode) {
		let code;
		for (let i = 0; i < 12; i++) {
			code = randCode();
			if (!(await store.get('code:' + code))) break;
		}
		user.friendCode = code;
		await store.setJSON('code:' + code, username);
	}
	await store.setJSON(username, user);
	return true;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
	status, headers: { 'content-type': 'application/json' },
});

// ---------- handler ----------
export default async function handler(req, env) {
	if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
	// reject an oversized body before reading it (a huge snapshot/intent/junk blob)
	if (+(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) return json({ error: 'payload too large' }, 413);
	let body;
	try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
	if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'bad request' }, 400);
	const store = userStore(env.MP_DB);
	const action = body.action;

	if (action === 'register') {
		// per-IP brake BEFORE any work (each register runs a full scrypt)
		if (!(await rateLimit(store, 'reg:' + clientIp(req), REG_LIMIT[0], REG_LIMIT[1]))) return json({ error: 'too many new accounts from here — try again later' }, 429);
		const username = String(body.username || '').trim().toLowerCase();
		const password = String(body.password || '');
		if (!/^[a-z0-9_]{3,20}$/.test(username)) return json({ error: 'username: 3–20 letters, numbers, _' }, 400);
		if (password.length < 6) return json({ error: 'password: 6+ characters' }, 400);
		if (await store.get(username)) return json({ error: 'that name is taken' }, 409);
		const salt = randomBytes(16).toString('hex');
		const hash = (await scrypt(password, salt)).toString('hex');
		let code;
		for (let i = 0; i < 12; i++) {
			code = randCode();
			if (!(await store.get('code:' + code))) break;
		}
		const collection = startingCollection();
		const decks = starterSlots(); // all 18 per-class starter-deck templates, pre-saved
		const user = {
			salt, hash, created: Date.now(),
			collection,
			decks,                  // 18 ready starter decks (one per class); up to 40 slots
			decksMigrated: true,
			packs: STARTER_PACKS, // a stack of welcome packs to build a collection from
			packInbox: 0,
			packTimerBase: Date.now(), // the 12-hour free-pack timer starts now
			starterBaselineV2: true,
			startersV3: true,
			startersV4: true,
			startersV5: true,
			stats: { runs: 0, wins: 0, packsOpened: 0, lastReward: 0 },
			friendCode: code,
			friends: [],
		};
		await store.setJSON('code:' + code, username);
		await store.setJSON(username, user);
		return json({ token: makeToken(username), state: publicState(user, username) });
	}

	if (action === 'login') {
		// per-IP brake BEFORE the lookup + scrypt: unlimited attempts were both a
		// password brute-force lane and a CPU amplifier (one scrypt per attempt)
		if (!(await rateLimit(store, 'login:' + clientIp(req), LOGIN_LIMIT[0], LOGIN_LIMIT[1]))) return json({ error: 'too many attempts — wait a minute' }, 429);
		const username = String(body.username || '').trim().toLowerCase();
		const user = await store.get(username);
		if (!user) return json({ error: 'no such account' }, 401);
		const hash = (await scrypt(String(body.password || ''), user.salt)).toString('hex');
		const a = Buffer.from(hash), b = Buffer.from(user.hash);
		if (a.length !== b.length || !timingSafeEqual(a, b)) return json({ error: 'wrong password' }, 401);
		return json({ token: makeToken(username), state: publicState(user, username) });
	}

	// ---------- lightweight, cookieless analytics (no accounts / cookies / IPs) ----------
	// A page beacon bumps a daily rollup of which pages/modes get opened, so we can
	// see what people actually use. Unauthenticated by design (anonymous visitors
	// count too); a per-day key cap stops junk from growing the doc without bound.
	if (action === 'hit') {
		if (!(await rateLimit(store, 'hit:' + clientIp(req), HIT_LIMIT[0], HIT_LIMIT[1]))) return json({ ok: true }); // silently drop a flood — it's fire-and-forget analytics
		const ev = String(body.ev || '').toLowerCase().replace(/[^a-z0-9:_-]/g, '').slice(0, 40);
		if (ev) {
			const key = 'stat:' + new Date().toISOString().slice(0, 10); // UTC day
			const doc = (await store.get(key)) || {};
			if ((ev in doc) || Object.keys(doc).length < 400) { doc[ev] = (doc[ev] || 0) + 1; doc._total = (doc._total || 0) + 1; }
			await store.setJSON(key, doc);
		}
		return json({ ok: true });
	}
	// ---------- client error beacon (uncaught crashes → a daily rollup) ----------
	// So a crash for a real player surfaces (view at /errors.html) instead of dying
	// silently in their console. Unauthenticated + no PII (message/location/browser
	// only); deduped by a hash of msg+where so an error LOOP can't flood, and the
	// per-day key cap bounds the doc.
	if (action === 'err') {
		if (!(await rateLimit(store, 'err:' + clientIp(req), ERR_LIMIT[0], ERR_LIMIT[1]))) return json({ ok: true }); // drop a flood; the client already dedups + caps
		const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
		const msg = clip(body.msg, 300), where = clip(body.where, 200);
		const page = clip(body.page, 80).replace(/[^a-z0-9:/_.-]/gi, ''), ua = clip(body.ua, 120);
		if (msg) {
			const key = 'err:' + new Date().toISOString().slice(0, 10);
			const doc = (await store.get(key)) || {};
			let h = 5381; const sig = msg + '|' + where + '|' + page; for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) | 0; // djb2 dedup
			const id = (h >>> 0).toString(36);
			if (doc[id]) { doc[id].count++; doc[id].last = Date.now(); }
			else if (Object.keys(doc).length < 300) { doc[id] = { count: 1, msg, where, page, ua, first: Date.now(), last: Date.now() }; }
			await store.setJSON(key, doc);
		}
		return json({ ok: true });
	}
	// unauthenticated, COUNTS-ONLY view of today's error rollup. The health
	// canary reads this every 15 minutes as its D1-read probe and to alert on a
	// crash spike; counts disclose nothing sensitive. The full error CONTENT
	// (messages, pages, user agents) stays owner-only behind 'errors'.
	if (action === 'err-summary') {
		if (!(await rateLimit(store, 'esum:' + clientIp(req), RGET_LIMIT[0], RGET_LIMIT[1]))) return json({ error: 'slow down' }, 429);
		const day = new Date().toISOString().slice(0, 10);
		const doc = (await store.get('err:' + day)) || {};
		let total = 0, distinct = 0;
		for (const v of Object.values(doc)) { total += (v && v.count) || 0; distinct++; }
		return json({ date: day, total, distinct });
	}

	// ---------- shared game replays ----------
	// A shared replay is a packed tape (client codec: gzipped snapshots). Uploading
	// one (replay-put) requires a token; VIEWING one (replay-get) is public so a
	// share link opens for logged-out visitors too. Tapes GC after 30 days. Bounded
	// by REPLAY_MAX_BYTES + a plausible-code regex so we never store arbitrary junk.
	if (action === 'replay-get') {
		if (!(await rateLimit(store, 'rget:' + clientIp(req), RGET_LIMIT[0], RGET_LIMIT[1]))) return json({ error: 'slow down' }, 429);
		const id = String(body.id || '');
		if (!/^[a-f0-9]{8,20}$/.test(id)) return json({ error: 'bad id' }, 400);
		const rec = await store.get('replay:' + id);
		if (!rec || !rec.code) return json({ error: 'not found' }, 404);
		return json({ code: rec.code });
	}
	// public read of a run playlist (the /?rrun= link) — same shape of guard as replay-get
	if (action === 'replay-playlist-get') {
		if (!(await rateLimit(store, 'rget:' + clientIp(req), RGET_LIMIT[0], RGET_LIMIT[1]))) return json({ error: 'slow down' }, 429);
		const id = String(body.id || '');
		if (!/^[a-f0-9]{8,20}$/.test(id)) return json({ error: 'bad id' }, 400);
		const rec = await store.get('rplaylist:' + id);
		if (!rec || !Array.isArray(rec.ids) || !rec.ids.length) return json({ error: 'not found' }, 404);
		return json({ ids: rec.ids, meta: rec.meta || {} });
	}

	// public read of a MICATRO run replay (/micatro/?replay=<id>, /mr/<id>) — the same guard as replay-get
	if (action === 'micatro-replay-get') {
		if (!(await rateLimit(store, 'rget:' + clientIp(req), RGET_LIMIT[0], RGET_LIMIT[1]))) return json({ error: 'slow down' }, 429);
		const id = String(body.id || '');
		if (!REPLAY_ID_RE.test(id)) return json({ error: 'bad id' }, 400);
		const rec = await store.get('mreplay:' + id);
		if (!rec || !rec.code) return json({ error: 'not found' }, 404);
		return json({ code: rec.code, meta: rec.meta || {}, by: rec.by || '', when: rec.when || 0 });
	}

	// public read of a MICASURVIVOR run replay (/micasurvivor/?replay=<id>, /msr/<id>) — the same guard as replay-get
	if (action === 'micasurvivor-replay-get') {
		if (!(await rateLimit(store, 'rget:' + clientIp(req), RGET_LIMIT[0], RGET_LIMIT[1]))) return json({ error: 'slow down' }, 429);
		const id = String(body.id || '');
		if (!REPLAY_ID_RE.test(id)) return json({ error: 'bad id' }, 400);
		const rec = await store.get('msurvreplay:' + id);
		if (!rec || !rec.code) return json({ error: 'not found' }, 404);
		return json({ code: rec.code, meta: rec.meta || {}, by: rec.by || '', when: rec.when || 0 });
	}

	// live art/sprite tuning overrides — PUBLIC read: every game client fetches
	// these at boot and merges them over the committed tuning files, so an
	// owner save from the live site (see tuning-save below) takes effect for
	// everyone without a deploy. A dev session later folds them into the repo
	// files (tools/pull-live-tuning.mjs) and clears these keys.
	if (action === 'tuning-get') {
		if (!(await rateLimit(store, 'tget:' + clientIp(req), TGET_LIMIT[0], TGET_LIMIT[1]))) return json({ error: 'slow down' }, 429);
		const [art, sprite, artIds] = await Promise.all([
			store.get('owner_tuning_art'), store.get('owner_tuning_sprite'), store.get('owner_art_ids'),
		]);
		return json({ art: art || null, sprite: sprite || null, artIds: artIds || [] });
	}

	// a live replacement IMAGE (saved from arttune on the live site; ids listed by
	// tuning-get above). PUBLIC read so every client can render it; only ids in
	// the owner-maintained list are fetchable, so this can't probe arbitrary keys.
	if (action === 'art-fetch') {
		if (!(await rateLimit(store, 'afetch:' + clientIp(req), AFETCH_LIMIT[0], AFETCH_LIMIT[1]))) return json({ error: 'slow down' }, 429);
		const id = String(body.id || '');
		const ids = (await store.get('owner_art_ids')) || [];
		if (!ids.includes(id)) return json({ error: 'no such override' }, 404);
		const dataUrl = await store.get('owner_art:' + id);
		if (!dataUrl) return json({ error: 'no such override' }, 404);
		return json({ dataUrl });
	}

	// everything below requires a valid token
	const username = verifyToken((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
	if (!username) return json({ error: 'not logged in' }, 401);
	const user = await store.get(username);
	if (!user) return json({ error: 'account gone' }, 401);
	// abuse brake on the write/relay-heavy actions (bucketed per account), applied
	// before the per-request maintenance writes below so a flood is cheap to reject
	const rl = RATE_LIMITS[action];
	if (rl && !(await rateLimit(store, action + ':' + username, rl[0], rl[1]))) return json({ error: 'slow down' }, 429);
	// opportunistic GC on a fraction of authenticated traffic (the interval marker
	// keeps the actual sweep to ~once per GC_INTERVAL_MS regardless of how often it's called)
	if (Math.random() < 0.1) await maybeGC(store, Date.now());
	await ensureFriendFields(store, username, user); // backfill code/friends
	await normalizeDecks(store, username, user); // migrate to 40 PvP deck slots + seed a Mage Starter
	await grantStarterBaseline(store, username, user); // starter-deck playset + welcome packs (once)
	if (accruePacks(user, Date.now())) await store.setJSON(username, user); // drip the 12h free packs into the inbox

	if (action === 'state') return json({ state: publicState(user, username) });

	// ---------- optional recovery email ----------
	// Entirely opt-in — accounts never require one. If a player forgets their
	// password, an email on file lets the owner verify it's really them before
	// resetting the account. Stored on the user doc; surfaced ONLY in the
	// account's own authenticated state (publicState) — pubprofile never has it.
	// An empty email removes it.
	if (action === 'set-email') {
		const email = String(body.email || '').trim().toLowerCase();
		if (!email) {
			delete user.email; delete user.emailSetAt;
			await store.setJSON(username, user);
			return json({ ok: true, email: null, state: publicState(user, username) });
		}
		if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'that does not look like an email address' }, 400);
		user.email = email;
		user.emailSetAt = Date.now();
		await store.setJSON(username, user);
		return json({ ok: true, email, state: publicState(user, username) });
	}

	// ---------- owner dashboards (stats.html / errors.html) ----------
	// Reads of the daily rollups the two anonymous beacons above feed. Owner-only:
	// crash text, page paths, and user agents are nobody else's business.
	if (action === 'stats' || action === 'errors') {
		if (!isAdmin(username)) return json({ error: 'owner only' }, 403);
		const kind = action === 'stats' ? 'stat:' : 'err:';
		const n = Math.max(1, Math.min(31, parseInt(body.days, 10) || 7));
		const now = Date.now(), days = [];
		for (let i = 0; i < n; i++) {
			const day = new Date(now - i * 86400000).toISOString().slice(0, 10);
			const doc = await store.get(kind + day);
			if (doc) days.push(action === 'stats' ? { date: day, counts: doc } : { date: day, errors: doc });
		}
		return json({ days });
	}

	// ---------- owner to-do inbox (Design Wiki "New Version" notes) ----------
	// Every card page on the wiki shows the owner a note box; submissions land
	// here as a single JSON list (key 'owner_todo', newest last) that a dev
	// session later reads and clears ("check the internal to do list" — also
	// readable directly via `wrangler d1 execute magepunk-users`). Owner-only:
	// the username comes from the verified token above, not the client.
	// owner save from the live tuners: stores the full tuning map as a server
	// override (public via tuning-get above). kind: 'art' | 'sprite'.
	if (action === 'tuning-save') {
		if (!isAdmin(username)) return json({ error: 'owner only' }, 403);
		const kind = body.kind === 'sprite' ? 'sprite' : body.kind === 'art' ? 'art' : null;
		if (!kind) return json({ error: 'bad kind' }, 400);
		const content = body.content;
		if (!content || typeof content !== 'object' || Array.isArray(content)) return json({ error: 'bad content' }, 400);
		if (JSON.stringify(content).length > 400000) return json({ error: 'too large' }, 400);
		await store.setJSON('owner_tuning_' + kind, Object.keys(content).length ? content : null);
		return json({ ok: true, count: Object.keys(content).length });
	}

	// owner save of a live replacement IMAGE (arttune's upload on the live site,
	// where /dev/save-art doesn't exist). Served publicly via art-fetch above;
	// a dev session folds these into battlecards/art/ (pull-live-tuning) and
	// clears the keys. Bounded: a handful of pending images, each one 768px jpeg.
	if (action === 'art-save') {
		if (!isAdmin(username)) return json({ error: 'owner only' }, 403);
		const id = String(body.id || '');
		if (!/^[a-z0-9_]+$/.test(id)) return json({ error: 'bad card id' }, 400);
		const dataUrl = String(body.dataUrl || '');
		if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return json({ error: 'expected a base64 jpeg data URL' }, 400);
		if (dataUrl.length > ART_OVERRIDE_MAX) return json({ error: 'image too large' }, 400);
		const ids = (await store.get('owner_art_ids')) || [];
		if (!ids.includes(id) && ids.length >= ART_OVERRIDE_SLOTS) return json({ error: 'too many pending images — fold them into the repo first' }, 400);
		await store.setJSON('owner_art:' + id, dataUrl);
		if (!ids.includes(id)) { ids.push(id); await store.setJSON('owner_art_ids', ids); }
		return json({ ok: true, count: ids.length });
	}

	if (action === 'todo-add' || action === 'todo-list' || action === 'todo-done') {
		if (!isAdmin(username)) return json({ error: 'owner only' }, 403);
		const list = (await store.get('owner_todo')) || [];
		if (action === 'todo-add') {
			const text = String(body.text || '').trim().slice(0, 2000);
			if (!text) return json({ error: 'empty note' }, 400);
			list.push({
				ts: Date.now(),
				cardId: String(body.cardId || '').slice(0, 80),
				cardName: String(body.cardName || '').slice(0, 120),
				text,
			});
			while (list.length > 500) list.shift(); // bounded; oldest notes yield
			await store.setJSON('owner_todo', list);
			return json({ ok: true, count: list.length });
		}
		if (action === 'todo-list') return json({ todos: list });
		// todo-done: {ts} removes one note, {tsList:[...]} removes an exact batch.
		// There is deliberately NO clear-everything: a wipe would swallow notes
		// filed while a batch was being applied (this raced once, 2026-08-27) —
		// every removal names the exact timestamps it read.
		const drop = new Set((Array.isArray(body.tsList) ? body.tsList : [body.ts]).map(Number));
		const next = list.filter(e => !drop.has(e.ts));
		await store.setJSON('owner_todo', next.length ? next : null);
		return json({ ok: true, count: next.length });
	}

	// ---------- Bug Report Review list (playtesters -> owner) ----------
	// The to-do inbox's twin for BUGS (2026-10-01). The playtesters (MP_BUG_REPORTERS,
	// default Instinct + Muse, and remytest — the account Remy's bot signs in with)
	// and the owner file reports from /bugs/, the in-game
	// OPTIONS > REPORT A BUG, or straight at this API (Remy's bot). Each report is
	// its OWN row ('bug:<ts>-<user>') — reports run to 10KB+ of markdown, and a
	// per-row store makes "done" race-free (exact keys, never a wipe). The owner
	// reviews at /bugreview/; "do the bug report review list" = a dev session
	// reads them, fixes, and marks them done. The reporter comes from the verified
	// token, never the client.
	if (action === 'bug-add' || action === 'bug-mine' || action === 'bug-list' || action === 'bug-done') {
		const reporters = (process.env.MP_BUG_REPORTERS || 'instinctloretest0918,remygl,remytest').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
		const canFile = isAdmin(username) || reporters.includes(username);
		const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
		if (action === 'bug-add') {
			if (!canFile) return json({ error: `signed in as ${username} — bug reports are open to the playtester accounts only` }, 403);
			const text = clip(body.text, BUG_TEXT_MAX).trim();
			if (!text) return json({ error: 'empty report' }, 400);
			const mine = (await store.list('bug:')).filter(r => r.value && r.value.user === username).length;
			if (mine >= BUG_OPEN_MAX) return json({ error: `you have ${mine} open reports — wait for some to be reviewed` }, 429);
			// context: whatever the client attached (map, position, revision, page...),
			// kept as a small flat object of short strings/numbers
			const ctx = {};
			if (body.context && typeof body.context === 'object' && !Array.isArray(body.context)) {
				for (const [k, v] of Object.entries(body.context).slice(0, 24)) {
					if (/token|password|secret|auth|cookie/i.test(k)) continue;   // never store credentials
					if (typeof v === 'number' || typeof v === 'boolean') ctx[clip(k, 40)] = v;
					else if (typeof v === 'string') ctx[clip(k, 40)] = clip(v, 300);
				}
			}
			const ts = Date.now();
			const rec = {
				ts, user: username,
				title: clip(body.title, 140).trim() || clip(text.split('\n').find(l => l.trim()) || '', 140).replace(/^#+\s*/, ''),
				area: ['overworld', 'battlecards', 'site'].includes(body.area) ? body.area : 'overworld',
				severity: ['blocker', 'bug', 'cosmetic', 'idea'].includes(body.severity) ? body.severity : 'bug',
				text, context: ctx,
			};
			await store.setJSON(`bug:${ts}-${username}`, rec);
			return json({ ok: true, id: `${ts}-${username}` });
		}
		if (action === 'bug-mine') {
			if (!canFile) return json({ error: `signed in as ${username} — bug reports are open to the playtester accounts only` }, 403);
			const rows = (await store.list('bug:')).filter(r => r.value && r.value.user === username);
			return json({ bugs: rows.map(r => ({ id: r.key.slice(4), ts: r.value.ts, title: r.value.title, area: r.value.area, severity: r.value.severity })) });
		}
		if (!isAdmin(username)) return json({ error: 'owner only' }, 403);
		if (action === 'bug-list') {
			const rows = await store.list('bug:');
			return json({ bugs: rows.map(r => ({ id: r.key.slice(4), ...r.value })) });
		}
		// bug-done: the exact ids reviewed — there is deliberately no clear-all
		const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map(String).filter(id => /^\d{10,16}-[a-z0-9_]+$/i.test(id));
		if (!ids.length) return json({ error: 'no ids' }, 400);
		await store.deleteKeys(ids.map(id => 'bug:' + id));
		return json({ ok: true, removed: ids.length });
	}

	// ---------- gifts ----------
	// A player's bag lives in THEIR localStorage (magepunk_bag_v1) and is not in
	// OW_KEYS, so nothing here can write items into an account directly. A gift
	// is therefore a message the recipient's own client claims and applies: the
	// server only ever holds the promise of the items, never the inventory.
	// Owner-only to send; anyone may list/claim their own.
	// ---------- save repairs (owner -> one player's game, applied by THEIR client) ----------
	// A repair (a story restore, a junk-item cleanup) is a full save file built from
	// the player's server copy. It used to reach them as a file sent by hand; now it
	// is queued here and their game offers it on load ("Michael sent a save repair —
	// apply?"), applying it through the normal importSave pipeline (validation,
	// backup, the stale-baseRev refusal, the server's undo slot, read-back). One
	// pending repair per player; the outcome is recorded for the owner.
	if (action === 'repair-send') {
		if (!isAdmin(username)) return json({ error: 'owner only' }, 403);
		const to = String(body.to || '').trim().toLowerCase();
		if (!to || !(await store.get(to))) return json({ error: 'no player with that username' }, 404);
		const doc = body.doc;
		if (!doc || typeof doc !== 'object' || doc.magic !== 'magepunk-ow-save' || !doc.keys || typeof doc.keys !== 'object') return json({ error: 'doc must be a magepunk-ow-save export' }, 400);
		if (JSON.stringify(doc).length > REPAIR_MAX_BYTES) return json({ error: 'repair too large' }, 413);
		const rec = { id: 'r' + Date.now().toString(36), ts: Date.now(), from: username, title: String(body.title || 'Save repair').slice(0, 100),
			note: String(body.note || '').slice(0, 400), baseRev: Number.isInteger(doc.baseRev) ? doc.baseRev : null, doc, status: 'pending' };
		await store.setJSON('repair:' + to, rec);
		return json({ ok: true, id: rec.id });
	}
	if (action === 'repair-get') {
		const r = await store.get('repair:' + username);
		return json({ repair: r && r.status === 'pending' ? { id: r.id, title: r.title, note: r.note, baseRev: r.baseRev, doc: r.doc } : null });
	}
	if (action === 'repair-done') {
		const r = await store.get('repair:' + username);
		if (!r || r.id !== String(body.id || '')) return json({ error: 'no such repair' }, 404);
		r.status = body.ok ? 'applied' : 'failed';
		r.result = { ok: !!body.ok, stage: String(body.stage || '').slice(0, 40), error: body.error ? String(body.error).slice(0, 300) : null,
			appliedRev: Number.isInteger(body.appliedRev) ? body.appliedRev : null, at: Date.now() };
		delete r.doc;   // the outcome is what the owner needs; drop the 60KB payload
		await store.setJSON('repair:' + username, r);
		return json({ ok: true, status: r.status });
	}
	if (action === 'repair-status') {
		if (!isAdmin(username)) return json({ error: 'owner only' }, 403);
		const rows = await store.list('repair:');
		return json({ repairs: rows.map(x => ({ user: x.key.slice(7), id: x.value.id, title: x.value.title, status: x.value.status, ts: x.value.ts, baseRev: x.value.baseRev, result: x.value.result || null })) });
	}

	if (action === 'gift-send') {
		if (!isAdmin(username)) return json({ error: 'owner only' }, 403);
		const to = String(body.to || '').trim().toLowerCase();
		if (!to) return json({ error: 'no recipient' }, 400);
		if (!(await store.get(to))) return json({ error: 'no player with that username' }, 404);
		const items = body.items;
		if (!items || typeof items !== 'object' || Array.isArray(items)) return json({ error: 'bad items' }, 400);
		const entries = Object.entries(items);
		if (!entries.length || entries.length > 20) return json({ error: 'send between 1 and 20 item kinds' }, 400);
		const clean = {};
		for (const [id, n] of entries) {
			// the server has no item table; validate the SHAPE and let the
			// recipient's client ignore any id its bag doesn't know
			if (!/^[a-z0-9_]{2,40}$/.test(id)) return json({ error: 'bad item id: ' + id }, 400);
			const c = Number(n);
			const cap = id === 'money' ? 999999 : 999;   // `money` is an amount, not a count
			if (!Number.isInteger(c) || c < 1 || c > cap) return json({ error: id === 'money' ? 'money is 1-999999' : 'item counts are 1-999' }, 400);
			clean[id] = c;
		}
		const list = (await store.get('gifts:' + to)) || [];
		if (list.filter(g => !g.claimed).length >= 20) return json({ error: 'that player has too many unclaimed gifts' }, 400);
		const gift = {
			id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
			ts: Date.now(), from: username,
			title: String(body.title || 'A gift!').slice(0, 80),
			body: String(body.body || '').slice(0, 400),
			items: clean, claimed: false,
		};
		list.push(gift);
		await store.setJSON('gifts:' + to, list);
		return json({ ok: true, gift, pending: list.filter(g => !g.claimed).length });
	}
	if (action === 'gift-list') {
		const list = (await store.get('gifts:' + username)) || [];
		return json({ gifts: list.filter(g => !g.claimed) });
	}
	if (action === 'gift-claim') {
		// Claim marks it spent and hands the items back in ONE step, so a repeated
		// call can never pay out twice — the client applies what this returns.
		const id = String(body.id || '');
		const list = (await store.get('gifts:' + username)) || [];
		const g = list.find(x => x.id === id);
		if (!g) return json({ error: 'no such gift' }, 404);
		if (g.claimed) return json({ error: 'already claimed' }, 409);
		g.claimed = true;
		g.claimedAt = Date.now();
		await store.setJSON('gifts:' + username, list);
		return json({ ok: true, gift: { id: g.id, title: g.title, body: g.body, items: g.items, from: g.from } });
	}

	// ---------- secret bases ----------
	// One base per player: the claimed spot key + the decoration list. Friends
	// resolve each other's claims through base-dir (spot -> owner) and read a
	// base's contents with base-get; only the owner can write their own.
	if (action === 'base-save') {
		const spot = String(body.spot || '').slice(0, 60);
		if (!spot) return json({ error: 'no spot' }, 400);
		const deco = Array.isArray(body.deco)
			? body.deco.slice(0, 24).map(d => ({ id: String(d?.id || '').slice(0, 16), x: d?.x | 0, y: d?.y | 0 }))
			: [];
		await store.setJSON('base:' + username, { spot, deco, updated_at: Date.now() });
		return json({ ok: true });
	}
	if (action === 'base-get') {
		const who = String(body.user || username).trim().toLowerCase().slice(0, 40);
		return json({ base: (await store.get('base:' + who)) || null, user: who });
	}
	if (action === 'base-dir') {
		const names = [username, ...(user.friends || [])].slice(0, 30);
		const dir = {};
		for (const n of names) {
			const b = await store.get('base:' + n);
			if (b?.spot) dir[b.spot] = n;
		}
		return json({ dir });
	}

	// ---------- async POKeMON trades (mailbox, escrowed) ----------
	// The offered mon leaves the sender's save BEFORE the offer is stored (the
	// client escrows it), so the server-held copy is the only one. Accepting
	// attaches the counterpart mon: the accepter takes the offer home in the
	// same response, and the sender's side arrives as a DELIVERY they claim
	// exactly-once, gift-style. Declines return the mon the same way.
	if (action === 'trade-offer') {
		const to = String(body.to || '').trim().toLowerCase();
		if (!to || to === username) return json({ error: 'bad recipient' }, 400);
		if (!(await store.get(to))) return json({ error: 'no player with that username' }, 404);
		const mon = body.mon;
		if (!mon || typeof mon !== 'object' || Array.isArray(mon)) return json({ error: 'bad mon' }, 400);
		if (JSON.stringify(mon).length > 20_000) return json({ error: 'mon too large' }, 413);
		const list = (await store.get('trades:' + to)) || [];
		if (list.filter(t => !t.done).length >= 10) return json({ error: 'their trade inbox is full' }, 400);
		const t = { id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ts: Date.now(), from: username, mon, done: false };
		list.push(t);
		await store.setJSON('trades:' + to, list.slice(-40));
		return json({ ok: true, id: t.id });
	}
	if (action === 'trade-list') {
		const list = (await store.get('trades:' + username)) || [];
		return json({ trades: list.filter(t => !t.done).map(t => ({ id: t.id, from: t.from, mon: t.mon, ts: t.ts })) });
	}
	if (action === 'trade-accept') {
		const id = String(body.id || '');
		const back = body.mon;
		if (!back || typeof back !== 'object' || Array.isArray(back)) return json({ error: 'bad mon' }, 400);
		if (JSON.stringify(back).length > 20_000) return json({ error: 'mon too large' }, 413);
		const list = (await store.get('trades:' + username)) || [];
		const t = list.find(x => x.id === id);
		if (!t) return json({ error: 'no such trade' }, 404);
		if (t.done) return json({ error: 'already handled' }, 409);
		t.done = true; t.acceptedAt = Date.now();
		await store.setJSON('trades:' + username, list);
		const dl = (await store.get('tradeback:' + t.from)) || [];
		dl.push({ id: 'd' + t.id, from: username, mon: back, returned: false, claimed: false, ts: Date.now() });
		await store.setJSON('tradeback:' + t.from, dl.slice(-40));
		return json({ ok: true, mon: t.mon, from: t.from });
	}
	if (action === 'trade-decline') {
		const id = String(body.id || '');
		const list = (await store.get('trades:' + username)) || [];
		const t = list.find(x => x.id === id);
		if (!t) return json({ error: 'no such trade' }, 404);
		if (t.done) return json({ error: 'already handled' }, 409);
		t.done = true; t.declinedAt = Date.now();
		await store.setJSON('trades:' + username, list);
		const dl = (await store.get('tradeback:' + t.from)) || [];
		dl.push({ id: 'r' + t.id, from: username, mon: t.mon, returned: true, claimed: false, ts: Date.now() });
		await store.setJSON('tradeback:' + t.from, dl.slice(-40));
		return json({ ok: true });
	}
	if (action === 'trade-deliveries') {
		const dl = (await store.get('tradeback:' + username)) || [];
		return json({ deliveries: dl.filter(d => !d.claimed).map(d => ({ id: d.id, from: d.from, mon: d.mon, returned: d.returned })) });
	}
	// claim marks it spent and hands the mon back in ONE step (gift semantics)
	if (action === 'trade-claim') {
		const id = String(body.id || '');
		const dl = (await store.get('tradeback:' + username)) || [];
		const d = dl.find(x => x.id === id);
		if (!d) return json({ error: 'no such delivery' }, 404);
		if (d.claimed) return json({ error: 'already claimed' }, 409);
		d.claimed = true; d.claimedAt = Date.now();
		await store.setJSON('tradeback:' + username, dl);
		return json({ ok: true, delivery: { id: d.id, from: d.from, mon: d.mon, returned: d.returned } });
	}

	// a SAFE public profile of ANY player (clicked from the watcher list / chat).
	// Public-safe subset only — never the collection contents, decks, packs, or
	// friends list (those stay in the owner's publicState).
	if (action === 'pubprofile') {
		const who = String(body.username || '').trim().toLowerCase();
		const u = who && await store.get(who);
		if (!u) return json({ error: 'no such player' }, 404);
		const p = await store.get('presence:' + who);
		const online = !!(p && Date.now() - p.lastSeen < ONLINE_MS);
		const coll = effectiveCollection(u) || {};
		return json({
			profile: {
				username: who,
				online,
				status: online ? (p.status || 'online') : 'offline',
				region: online ? (p.region || '') : '',
				created: u.created || null,
				wins: (u.stats && u.stats.wins) || 0,
				runs: (u.stats && u.stats.runs) || 0,
				packsOpened: (u.stats && u.stats.packsOpened) || 0,
				uniqueCards: Object.values(coll).filter(nn => nn > 0).length,
				deckCount: Array.isArray(u.decks) ? u.decks.length : 0,
				arenaBest: u.arenaBest || null,
				isFriend: user.friends.includes(who),
				isYou: who === username,
			},
		});
	}

	// ---------- Arena leaderboard ----------
	// A player's BEST Arena run (most wins, fewest losses) is kept on their record
	// and mirrored into a single capped global board doc.
	const arenaBetter = (a, prev) => !prev || a.wins > prev.wins || (a.wins === prev.wins && a.losses < prev.losses);
	if (action === 'arena-score') {
		const wins = Math.max(0, Math.min(12, parseInt(body.wins, 10) || 0));
		const losses = Math.max(0, Math.min(3, parseInt(body.losses, 10) || 0));
		const hero = String(body.hero || '').replace(/[\u0000-\u001f]/g, '').slice(0, 32).trim();
		const run = { wins, losses, hero };
		const better = arenaBetter(run, user.arenaBest);
		if (better) { user.arenaBest = { wins, losses, hero, when: Date.now() }; await store.setJSON(username, user); }
		const best = user.arenaBest || null;
		// rebuild this player's line in the global board, re-sort, cap to 100
		const board = ((await store.get('arena:board')) || []).filter(e => e.name !== username);
		if (best) board.push({ name: username, wins: best.wins, losses: best.losses, hero: best.hero, when: best.when });
		board.sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.when - b.when);
		const capped = board.slice(0, 100);
		if (better) await store.setJSON('arena:board', capped);
		const rank = capped.findIndex(e => e.name === username) + 1;
		return json({ ok: true, better, best, rank: rank || null });
	}
	if (action === 'arena-leaderboard') {
		const board = (await store.get('arena:board')) || [];
		const rank = board.findIndex(e => e.name === username) + 1;
		return json({ top: board.slice(0, 50), you: user.arenaBest ? { ...user.arenaBest, rank: rank || null } : null });
	}

	// ---------- dust & crafting ----------
	// Extra copies beyond the deck cap (2, legendaries 1) were pure waste and a
	// missing single was pure pack luck — the collection endgame dead-ended.
	// Disenchanting extras pays dust; crafting spends it on the exact card.
	if (action === 'dust-extras' || action === 'craft') {
		if (TEST_PHASE) return json({ error: 'crafting is disabled during the test phase' }, 400);
		user.dust = user.dust || 0;
		if (action === 'dust-extras') {
			let gained = 0, dusted = 0;
			const col = user.collection || {};
			for (const [id, n] of Object.entries(col)) {
				const info = POOL[id];
				if (!info || n <= 0) continue;
				const cap = info[0] === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES;
				const extra = n - cap;
				const v = DUST_VALUE[info[0]];
				if (extra <= 0 || !v) continue;
				col[id] = cap;
				gained += extra * v;
				dusted += extra;
			}
			user.dust += gained;
			if (gained) await store.setJSON(username, user);
			return json({ ok: true, dusted, gained, dust: user.dust, state: publicState(user, username) });
		}
		const id = String(body.id || '');
		const info = POOL[id];
		const cost = info && CRAFT_COST[info[0]];
		if (!cost) return json({ error: 'not a craftable card' }, 400);
		const cap = info[0] === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES;
		const col = user.collection || (user.collection = {});
		if ((col[id] || 0) >= cap) return json({ error: 'you already have a full playset' }, 400);
		if (user.dust < cost) return json({ error: `not enough dust (${cost} needed, you have ${user.dust})` }, 400);
		user.dust -= cost;
		col[id] = (col[id] || 0) + 1;
		await store.setJSON(username, user);
		return json({ ok: true, dust: user.dust, count: col[id], state: publicState(user, username) });
	}

	// ---------- run-mode leaderboards (the Duels-family 12-win climbs) ----------
	// Same shape as Arena: a player's best run per mode on their record + one
	// capped global board per mode. A strong Lorequest/Middle-earth/... run was
	// previously invisible — cleared once and forgotten.
	if (action === 'run-score' || action === 'run-leaderboard') {
		let mode = String(body.mode || '');
		if (!['duels', 'lorequest', 'middleearth', 'swordcoast', 'finalfantasy', 'multiverse', 'micatro', 'micatro_modded', 'micasurvivor', 'micasurvivor_expedition'].includes(mode)) {
			return json({ error: 'no board for that mode' }, 400);
		}
		// MICATRO mods: a run with mods ranks on its own board ('micatro_modded'), each
		// entry tagged with its sorted mod list; vanilla runs stay on 'micatro'. A
		// 'micatro' score that carries mods is filed as modded (an old/odd client).
		let modList = null, customDeck = '';
		if ((mode === 'micatro' || mode === 'micatro_modded') && action === 'run-score') {
			modList = [...new Set((Array.isArray(body.mods) ? body.mods : [])
				.filter(m => typeof m === 'string').map(m => m.trim().toLowerCase())
				.filter(m => /^[a-z0-9_-]{1,32}$/.test(m)))].sort().slice(0, 16);
			// a CUSTOM-DECK run (the deck editor) is modded too: the vanilla board stays pure, and the
			// Modded board's row says "Custom deck: <name>"
			customDeck = String(body.customDeck ?? '').replace(/[ -]/g, ' ').slice(0, 32).trim();
			if (mode === 'micatro_modded' && !modList.length && !customDeck) return json({ error: 'a modded score needs its mods' }, 400);
			if (modList.length || customDeck) mode = 'micatro_modded';
		}
		// MICASURVIVOR EXPEDITION (DLC D0b): its own boards, one per map + difficulty; an Expedition score never lands
		// on the base board, and the Expedition board takes only Expedition scores (the micatro_modded pattern)
		const expFields = ['expMode', 'dv', 'map', 'diff'].filter(f => body[f] != null);
		if (mode === 'micasurvivor' && action === 'run-score' && expFields.length) {
			return json({ error: 'an Expedition score goes to the micasurvivor_expedition board', fields: expFields }, 400);
		}
		let expSub = '';
		if (mode === 'micasurvivor_expedition') {
			if (!MSURV_EXP_MAPS.includes(body.map) || !MSURV_EXP_DIFFS.includes(body.diff)) return json({ error: 'an Expedition board needs its map and difficulty', maps: MSURV_EXP_MAPS, diffs: MSURV_EXP_DIFFS }, 400);
			if (action === 'run-score' && (!MSURV_EXP_MODE_RE.test(String(body.expMode)) || !msurvExpDvOk(body.dv))) return json({ error: 'an Expedition score needs its mode and content version' }, 400);
			expSub = ':' + body.map + ':' + body.diff;
		}
		const key = 'runboard:' + mode + expSub;
		user.runBest = user.runBest || {};
		if (mode === 'micasurvivor_expedition' && action === 'run-score') {
			const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : NaN);
			const time = int(body.time), score = int(body.score);
			if (!(time >= 0 && time <= MICASURVIVOR_MAX_TIME)) return json({ error: 'bad time', max: MICASURVIVOR_MAX_TIME }, 400);
			if (!(score >= 0 && score <= 1e12)) return json({ error: 'bad score' }, 400);
			const dex = int(body.dex);
			const run = {
				score, time,
				kills: Math.max(0, Math.min(10_000_000, int(body.kills) || 0)),
				level: Math.max(1, Math.min(9999, int(body.level) || 1)),
				dex: dex >= 1 && dex <= 2000 ? dex : 0,
				shiny: body.shiny === true,
				expMode: body.expMode, dv: body.dv,
			};
			const cmp = (a, b) => (a.score - b.score) || (a.time - b.time);
			const bestKey = mode + expSub;
			const prev = user.runBest[bestKey];
			const better = !prev || typeof prev.score !== 'number' || cmp(run, prev) > 0;
			if (better) { user.runBest[bestKey] = { ...run, when: Date.now() }; await store.setJSON(username, user); }
			const best = user.runBest[bestKey] || null;
			const board = ((await store.get(key)) || []).filter(e => e.name !== username);
			if (best) board.push({ name: username, ...best });
			board.sort((a, b) => cmp(b, a) || a.when - b.when);
			const capped = board.slice(0, 100);
			if (better) await store.setJSON(key, capped);
			const rank = capped.findIndex(e => e.name === username) + 1;
			return json({ ok: true, better, best, rank: rank || null, board: key.slice('runboard:'.length) });
		}
		// MICATRO ranks by the run's best single-hand SCORE (higher is better), not a
		// W/L record. Scores can outgrow 2^53 or reach Infinity (Balatro's "naneinf"):
		// JSON can't carry Infinity, so the client may send it as a string — a positive
		// non-finite score is clamped to Number.MAX_VALUE; NaN is refused.
		// A run's BIG-NUMBER score (past 1e308, e.g. "1.234e450") is kept exactly: the
		// row stores it as text (`big`) plus a sortable key (`exp`, `man`), with `score` clamped
		// to MAX_VALUE for old readers; micatroScoreCmp ranks big and plain rows together.
		if ((mode === 'micatro' || mode === 'micatro_modded') && action === 'run-score') {
			const raw = typeof body.score === 'string' ? body.score.trim() : body.score;
			let big = typeof raw === 'string' ? parseBigScore(raw) : null;
			const naneinf = !!(big && big.naneinf); // >= 1e1000: the same as Infinity
			if (naneinf) big = null;
			let score = naneinf ? Infinity : big ? Number.MAX_VALUE : typeof raw === 'number' ? raw : (typeof raw === 'string' && raw !== '' ? Number(raw) : NaN);
			if (Number.isNaN(score)) return json({ error: 'bad score' }, 400);
			if (score === Infinity) score = Number.MAX_VALUE;
			score = Math.max(0, score); // -Infinity / negatives → 0
			const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, n).trim();
			const run = {
				score,
				...(big ? { big: big.text, exp: big.exp, man: big.man } : {}),
				ante: Math.max(0, Math.min(1000, parseInt(body.ante, 10) || 0)),
				seed: clean(body.seed, 16), back: clean(body.back, 32),
				stake: Math.max(0, Math.min(99, parseInt(body.stake, 10) || 0)),
				won: !!body.won,
			};
			if (mode === 'micatro_modded') run.mods = modList;
			if (customDeck) run.customDeck = customDeck;
			// Pokermon run badges ({nuz:true, mono:'fire'}): CLIENT-REPORTED like the score itself — the server can't
			// re-check a run, so only the shape is validated. Only a won run carries them; a bad shape is refused.
			if (body.badges != null) {
				const bd = cleanRunBadges(body.badges);
				if (!bd) return json({ error: 'bad badges' }, 400);
				if (run.won && (bd.nuz || bd.mono)) run.badges = bd;
			}
			// the run's replay (micatro-replay-put): only a well-formed id of a replay THIS player uploaded
			const rid = String(body.replay ?? '');
			if (REPLAY_ID_RE.test(rid)) { const rr = await store.get('mreplay:' + rid); if (rr && rr.by === username) run.replay = rid; }
			const prev = user.runBest[mode];
			const better = !prev || typeof prev.score !== 'number' || micatroScoreCmp(run, prev) > 0;
			if (better) { user.runBest[mode] = { ...run, when: Date.now() }; await store.setJSON(username, user); }
			const best = user.runBest[mode] || null;
			const board = ((await store.get(key)) || []).filter(e => e.name !== username);
			if (best) board.push({ name: username, ...best });
			board.sort((a, b) => micatroScoreCmp(b, a) || (b.ante || 0) - (a.ante || 0) || a.when - b.when);
			const capped = board.slice(0, 100);
			if (better) await store.setJSON(key, capped);
			const rank = capped.findIndex(e => e.name === username) + 1;
			return json({ ok: true, better, best, rank: rank || null });
		}
		// MICASURVIVOR ranks a solo run by SURVIVAL TIME (seconds, higher is better), then
		// kills, then the earliest. A time past MICASURVIVOR_MAX_TIME (or not a number) is
		// refused rather than clamped, so a bogus run can't sit at the top of the board.
		if (mode === 'micasurvivor' && action === 'run-score') {
			const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : NaN);
			const time = int(body.time);
			if (!(time >= 0 && time <= MICASURVIVOR_MAX_TIME)) return json({ error: 'bad time', max: MICASURVIVOR_MAX_TIME }, 400);
			const dex = int(body.dex);
			const run = {
				time,
				kills: Math.max(0, Math.min(10_000_000, int(body.kills) || 0)),
				level: Math.max(1, Math.min(9999, int(body.level) || 1)),
				dex: dex >= 1 && dex <= 2000 ? dex : 0,
				shiny: body.shiny === true,
			};
			const cmp = (a, b) => (a.time - b.time) || ((a.kills || 0) - (b.kills || 0));
			const prev = user.runBest[mode];
			const better = !prev || typeof prev.time !== 'number' || cmp(run, prev) > 0;
			if (better) { user.runBest[mode] = { ...run, when: Date.now() }; await store.setJSON(username, user); }
			const best = user.runBest[mode] || null;
			const board = ((await store.get(key)) || []).filter(e => e.name !== username);
			if (best) board.push({ name: username, ...best });
			board.sort((a, b) => cmp(b, a) || a.when - b.when);
			const capped = board.slice(0, 100);
			if (better) await store.setJSON(key, capped);
			const rank = capped.findIndex(e => e.name === username) + 1;
			return json({ ok: true, better, best, rank: rank || null });
		}
		if (action === 'run-score') {
			const wins = Math.max(0, Math.min(12, parseInt(body.wins, 10) || 0));
			const losses = Math.max(0, Math.min(3, parseInt(body.losses, 10) || 0));
			const hero = String(body.hero || '').replace(/[\u0000-\u001f]/g, '').slice(0, 32).trim();
			const run = { wins, losses, hero };
			const better = arenaBetter(run, user.runBest[mode]);
			if (better) { user.runBest[mode] = { wins, losses, hero, when: Date.now() }; await store.setJSON(username, user); }
			const best = user.runBest[mode] || null;
			const board = ((await store.get(key)) || []).filter(e => e.name !== username);
			if (best) board.push({ name: username, wins: best.wins, losses: best.losses, hero: best.hero, when: best.when });
			board.sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.when - b.when);
			const capped = board.slice(0, 100);
			if (better) await store.setJSON(key, capped);
			const rank = capped.findIndex(e => e.name === username) + 1;
			return json({ ok: true, better, best, rank: rank || null });
		}
		const board = (await store.get(key)) || [];
		const rank = board.findIndex(e => e.name === username) + 1;
		const youKey = mode + expSub;   // (an Expedition board: the best per map + difficulty)
		return json({ top: board.slice(0, 50), you: user.runBest[youKey] ? { ...user.runBest[youKey], rank: rank || null } : null });
	}

	// ---------- PvP rating (Elo) ----------
	// The WINNER of a 1v1 live duel reports the result; both accounts' ratings
	// adjust (K=32, floor 100) and the top-100 board updates. Client-authoritative
	// like everything else in the test realm — this is a standing to climb, not
	// an anti-cheat system.
	if (action === 'duel-result') {
		const oppName = String(body.opponent || '').trim().toLowerCase();
		if (!oppName || oppName === username) return json({ error: 'bad opponent' }, 400);
		const opp = await store.get(oppName);
		if (!opp) return json({ error: 'no such opponent' }, 404);
		const rw = user.pvpRating || 1000, rl = opp.pvpRating || 1000;
		const expect = 1 / (1 + Math.pow(10, (rl - rw) / 400));
		const delta = Math.round(32 * (1 - expect));
		user.pvpRating = rw + delta;
		opp.pvpRating = Math.max(100, rl - delta);
		await store.setJSON(username, user);
		await store.setJSON(oppName, opp);
		const board = ((await store.get('pvp:board')) || []).filter(e => e.name !== username && e.name !== oppName);
		const winsOf = u => u.stats?.modes?.pvp?.wins || 0;
		board.push({ name: username, rating: user.pvpRating, wins: winsOf(user), when: Date.now() });
		board.push({ name: oppName, rating: opp.pvpRating, wins: winsOf(opp), when: Date.now() });
		board.sort((a, b) => b.rating - a.rating || a.when - b.when);
		const capped = board.slice(0, 100);
		await store.setJSON('pvp:board', capped);
		return json({ ok: true, rating: user.pvpRating, delta: +delta, rank: (capped.findIndex(e => e.name === username) + 1) || null });
	}
	if (action === 'pvp-leaderboard') {
		const board = (await store.get('pvp:board')) || [];
		const rank = board.findIndex(e => e.name === username) + 1;
		return json({ top: board.slice(0, 50), you: user.pvpRating ? { rating: user.pvpRating, rank: rank || null } : null });
	}

	// upload a packed replay tape → a short id for the shareable ?rshare= link
	if (action === 'replay-put') {
		const code = String(body.code || '');
		if (code.length > REPLAY_MAX_BYTES || !/^[GR]1\.[A-Za-z0-9_-]+$/.test(code)) return json({ error: 'bad replay' }, 400);
		let id;
		for (let i = 0; i < 8; i++) { id = randomBytes(4).toString('hex'); if (!(await store.get('replay:' + id))) break; } // 8 hex chars — short enough for a /r/<id> link; collisions retried, tapes GC in 30 days
		await store.setJSON('replay:' + id, { code, by: username, when: Date.now() });
		return json({ id });
	}

	// upload a finished MICATRO run's replay → its id (the leaderboard row + share link point at it).
	// {code, meta, id?}: with `id` naming one of YOUR replays the row is overwritten in place — a win's
	// replay grows to cover the Endless run that followed, and the board's link stays valid.
	// Validates the packed recipe (unpacked under a cap): {v:number, seed, actions:[{type}] <= 20000, modVersions?, engineRev?}.
	if (action === 'micatro-replay-put') {
		const code = String(body.code || '');
		if (code.length > MICATRO_REPLAY_MAX) return json({ error: 'replay too large', max: MICATRO_REPLAY_MAX }, 413);
		if (!/^[GR]1\.[A-Za-z0-9_-]+$/.test(code)) return json({ error: 'bad replay' }, 400);
		const text = await unpackCapped(code, MICATRO_REPLAY_UNPACKED);
		let recipe = null;
		try { recipe = text ? JSON.parse(text) : null; } catch { recipe = null; }
		if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe) || typeof recipe.v !== 'number' || typeof recipe.seed !== 'string' || !recipe.seed
			|| !Array.isArray(recipe.actions) || !recipe.actions.every(a => a && typeof a === 'object' && !Array.isArray(a) && typeof a.type === 'string')
			// version pins (optional: older recipes have none) must be well-formed
			|| (recipe.modVersions !== undefined && !cleanModVersions(recipe.modVersions, false))
			|| (recipe.engineRev !== undefined && !(Number.isInteger(recipe.engineRev) && recipe.engineRev >= 0 && recipe.engineRev <= 1e6))) return json({ error: 'not a run recipe' }, 400);
		if (recipe.actions.length > MICATRO_REPLAY_ACTIONS) return json({ error: 'too many actions', max: MICATRO_REPLAY_ACTIONS }, 413);
		const meta = cleanReplayMeta(body.meta);
		let id = null;
		const want = String(body.id || '');
		if (REPLAY_ID_RE.test(want)) {
			const prev = await store.get('mreplay:' + want);
			if (prev && prev.by === username) id = want; // only your own replay is extended in place
		}
		if (!id) for (let i = 0; i < 8; i++) { id = randomBytes(4).toString('hex'); if (!(await store.get('mreplay:' + id))) break; }
		await store.setJSON('mreplay:' + id, { code, meta, by: username, when: Date.now() });
		return json({ ok: true, id });
	}

	// a run's "super replay": an ORDERED playlist of tape ids already uploaded by
	// replay-put, so a whole cleared run watches as one chained sitting. Stores only
	// the ids + a little display meta — the tapes themselves are untouched, and both
	// expire on the same 30-day sweep.
	if (action === 'replay-playlist-put') {
		const raw = Array.isArray(body.ids) ? body.ids : [];
		const ids = raw.map(String).filter(x => /^[a-f0-9]{8,20}$/.test(x)).slice(0, 40); // a 12-win run is ~14 fights
		if (!ids.length) return json({ error: 'bad playlist' }, 400);
		const m = (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) ? body.meta : {};
		const meta = { // allow-list: this is rendered in a public viewer
			mode: String(m.mode || '').slice(0, 24),
			hero: String(m.hero || '').slice(0, 48),
			wins: Number(m.wins) || 0,
			losses: Number(m.losses) || 0,
			labels: Array.isArray(m.labels) ? m.labels.slice(0, 40).map(x => String(x).slice(0, 48)) : [],
		};
		let id;
		for (let i = 0; i < 8; i++) { id = randomBytes(4).toString('hex'); if (!(await store.get('rplaylist:' + id))) break; }
		await store.setJSON('rplaylist:' + id, { ids, meta, by: username, when: Date.now() });
		return json({ id });
	}

	// ---------- friends & presence ----------
	if (action === 'add-friend') {
		// add by username (accounts are keyed by lowercased name) or friend code
		let other;
		const uname = String(body.username || '').trim().toLowerCase();
		if (uname) {
			if (uname === username) return json({ error: "that's your own account" }, 400);
			if (!(await store.get(uname))) return json({ error: 'no player with that username' }, 404);
			other = uname;
		} else {
			const code = String(body.code || '').toUpperCase().trim();
			if (!/^[A-Z]{6}$/.test(code)) return json({ error: 'friend codes are 6 capital letters' }, 400);
			if (code === user.friendCode) return json({ error: "that's your own code" }, 400);
			other = await store.get('code:' + code);
			if (!other || other === username) return json({ error: 'no player has that code' }, 404);
		}
		if (!user.friends.includes(other)) user.friends.push(other);
		const ou = await store.get(other);
		if (ou) {
			if (!Array.isArray(ou.friends)) ou.friends = [];
			if (!ou.friends.includes(username)) { ou.friends.push(username); await store.setJSON(other, ou); }
		}
		await store.setJSON(username, user);
		return json({ added: other, state: publicState(user, username) });
	}

	if (action === 'remove-friend') {
		const who = String(body.username || '');
		user.friends = user.friends.filter(f => f !== who);
		const ou = await store.get(who);
		if (ou?.friends) { ou.friends = ou.friends.filter(f => f !== username); await store.setJSON(who, ou); }
		await store.setJSON(username, user);
		return json({ state: publicState(user, username) });
	}

	// lightweight presence ping while roaming; written to its own blob so the
	// account blob isn't rewritten every second
	if (action === 'heartbeat') {
		await store.setJSON('presence:' + username, {
			name: username,
			map: String(body.map || '').slice(0, 64), x: +body.x || 0, y: +body.y || 0,
			facing: String(body.facing || 'down').slice(0, 16),
			status: String(body.status || 'roaming').slice(0, 32),
			region: String(body.region || '').slice(0, 48),
			lastSeen: Date.now(),
		});
		return json({ ok: true });
	}

	// friends list with live presence (online + where they are). All blob reads go
	// in parallel — sequential strong-consistency reads made this the slowest call
	// in the presence loop and stretched ghost-update latency
	if (action === 'friends') {
		const mnow = msurvNow();
		const list = await Promise.all(user.friends.map(async (f) => {
			const [fu, p0, ml] = await Promise.all([store.get(f), store.get('presence:' + f), msurvLiveOf(store, f, mnow)]);
			// MicaSurvivor (M5 batch 12c): a friend in a MicaSurvivor run (its beacon) is online and watchable, even
			// when an unwatched solo run has written no presence for a while
			const p = ml ? { x: 0, y: 0, facing: 'down', ...(p0 || {}), lastSeen: Date.now(), status: 'micasurvivor:run', region: ml.label || 'MicaSurvivor', map: (p0 && p0.map) || '' } : p0;
			const online = p && Date.now() - p.lastSeen < ONLINE_MS;
			return {
				username: f, friendCode: fu?.friendCode || '',
				online: !!online,
				map: online ? p.map : null, x: online ? p.x : 0, y: online ? p.y : 0,
				facing: online ? p.facing : 'down',
				status: online ? p.status : 'offline',
				region: online ? p.region : '',
			};
		}));
		return json({ friends: list, friendCode: user.friendCode });
	}

	// a single friend's live presence (for visiting / spectating)
	if (action === 'presence') {
		const who = String(body.username || '');
		if (!user.friends.includes(who)) return json({ error: 'not your friend' }, 403);
		const p = await store.get('presence:' + who);
		const online = p && Date.now() - p.lastSeen < ONLINE_MS;
		return json({ presence: online ? p : null });
	}

	// ---------- card-game spectation (state broadcast) ----------
	const CARDSTATE_MS = 20_000; // a snapshot older than 20s is treated as done
	// a participant who hasn't polled/published in this long is treated as gone;
	// their opponent wins by abandonment. Polling itself is the liveness signal.
	// (overridable so tests don't have to wait the full window)
	const ABANDON_MS = +process.env.MP_ABANDON_MS || 18_000;

	// the player in a dungeon run / card battle publishes a board snapshot here
	// every ~1.2s; it doubles as a presence ping so friends see them "in a run"
	if (action === 'publish-cardstate') {
		const csMode = String(body.mode || 'battle').slice(0, 24), csLabel = String(body.label || '').slice(0, 48);
		const now = Date.now();
		const watcherNames = (await listWatchers(store, username, now)).slice(0, SPEC_CAP); // who is watching right now
		const watchers = watcherNames.length;
		await store.setJSON('cardstate:' + username, {
			snapshot: body.snapshot || null,
			mode: csMode,
			label: csLabel,
			room: 'u:' + username, // spectators join the runner's chat room
			seq: +body.seq || 0,
			ts: now,
			over: !!body.over, winner: body.winner ?? null, // so spectators see GAME OVER instantly, not via staleness
			watchers, watcherNames,
		});
		await store.setJSON('presence:' + username, {
			name: username, map: '', x: 0, y: 0, facing: 'down',
			status: 'card:' + csMode,
			region: csLabel,
			lastSeen: Date.now(),
		});
		return json({ ok: true, watchers, watcherNames });
	}

	// a friend reads the latest snapshot to render read-only
	if (action === 'cardstate') {
		const who = String(body.username || '');
		if (!user.friends.includes(who)) return json({ error: 'not your friend' }, 403);
		const cs = await store.get('cardstate:' + who);
		if (!cs || Date.now() - cs.ts > CARDSTATE_MS) return json({ snapshot: null });
		// cap the game at SPEC_CAP concurrent spectators — a NEW viewer is turned away
		// when it's full; someone already watching (fresh heartbeat) always gets back in
		const now = Date.now();
		const watching = await gameWatchers(store, cs, who, now);
		if (!watching.includes(username) && watching.length >= SPEC_CAP) return json({ snapshot: null, full: true, max: SPEC_CAP }, 403);
		await store.setJSON('spec:' + who + ':' + username, now); // heartbeat: I'm watching `who`
		// live watcher count is free here (already scanned for the cap), fresher than the stored one
		const watchers = watching.length, watcherNames = watching.slice(0, SPEC_CAP);
		// DELTA: if the spectator already has this seq, skip re-sending the (up-to-2MB)
		// snapshot — just ack + the fresh watcher list. Spectators poll every 1s but the
		// board changes far less often, so this eliminates most of the bandwidth.
		if (body.seq != null && +body.seq === (cs.seq | 0)) {
			// carry over/winner even on an unchanged poll so game-over isn't missed
			return json({ unchanged: true, seq: cs.seq, room: cs.room, mode: cs.mode, label: cs.label, over: !!cs.over, winner: cs.winner ?? null, watchers, watcherNames });
		}
		return json({ ...cs, watchers, watcherNames });
	}

	// a BATTLE FRONTIER run publishes a board snapshot here every ~1.2s so friends can
	// spectate it (mirrors publish-cardstate). Unlike the card runs — which live on their
	// own page — a Frontier run is inside the overworld, whose heartbeat owns presence, so
	// this does NOT write presence (the heartbeat sets `factory:<label>` itself).
	if (action === 'publish-factory') {
		const now = Date.now();
		const watcherNames = (await listWatchers(store, username, now)).slice(0, SPEC_CAP);
		const watchers = watcherNames.length;
		await store.setJSON('factorystate:' + username, {
			snapshot: body.snapshot || null,
			label: String(body.label || '').slice(0, 48),
			room: 'u:' + username, // spectators join the runner's chat room
			seq: +body.seq || 0,
			ts: now,
			over: !!body.over,
			watchers, watcherNames,
		});
		return json({ ok: true, watchers, watcherNames });
	}

	// a friend reads the latest Frontier snapshot to render read-only
	if (action === 'factory-state') {
		const who = String(body.username || '');
		if (!user.friends.includes(who)) return json({ error: 'not your friend' }, 403);
		const fs = await store.get('factorystate:' + who);
		if (!fs || Date.now() - fs.ts > CARDSTATE_MS) return json({ snapshot: null });
		const now = Date.now();
		const watching = await gameWatchers(store, fs, who, now); // cap concurrent spectators
		if (!watching.includes(username) && watching.length >= SPEC_CAP) return json({ snapshot: null, full: true, max: SPEC_CAP }, 403);
		await store.setJSON('spec:' + who + ':' + username, now); // heartbeat: I'm watching `who`
		const watchers = watching.length, watcherNames = watching.slice(0, SPEC_CAP);
		if (body.seq != null && +body.seq === (fs.seq | 0)) {
			return json({ unchanged: true, seq: fs.seq, room: fs.room, label: fs.label, over: !!fs.over, watchers, watcherNames });
		}
		return json({ ...fs, watchers, watcherNames });
	}

	// a MICATRO run (/micatro/) publishes its view here so friends can watch. Unlike
	// cardstate (republished at a flat cadence), the client bumps `seq` ONLY when the
	// view changed and otherwise sends a snapshot-less keep-alive every ~10s; an
	// unchanged keep-alive skips the state-row write until the row nears staleness,
	// and the presence row is only rewritten when its status changed or it is aging.
	if (action === 'publish-micatro') {
		const now = Date.now();
		const seq = Number.isFinite(+body.seq) ? Math.max(0, Math.floor(+body.seq)) : 0;
		const label = String(body.label || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 48).trim();
		const over = !!body.over, won = !!body.won;
		const replay = over && REPLAY_ID_RE.test(String(body.replay ?? '')) ? String(body.replay) : null;
		const hasSnap = body.snapshot != null;
		if (hasSnap && JSON.stringify(body.snapshot).length > MICATRO_SNAPSHOT_MAX) return json({ error: 'snapshot too large', max: MICATRO_SNAPSHOT_MAX }, 413);
		const watcherNames = (await listWatchers(store, username, now)).slice(0, SPEC_CAP);
		const watchers = watcherNames.length;
		const prev = await store.get('micatrostate:' + username);
		const sameSeq = !!prev && prev.seq === seq;
		const unchanged = sameSeq && !hasSnap && !!prev.over === over && !!prev.won === won && prev.label === label && (prev.replay || null) === replay
			&& (prev.watcherNames || []).join(',') === watcherNames.join(',') && now - prev.ts < MICATRO_REFRESH_MS;
		if (!unchanged) {
			await store.setJSON('micatrostate:' + username, {
				snapshot: hasSnap ? body.snapshot : (sameSeq ? prev.snapshot : null),
				label,
				room: 'u:' + username, // spectators read the runner's chat room
				seq, ts: now, over, won,
				watchers, watcherNames,
				...(replay ? { replay } : {}),
			});
		}
		// presence: "playing Micatro" while live; a finished run goes back to plain online
		const status = over ? '' : ('micatro:' + label).slice(0, 64);
		const pres = await store.get('presence:' + username);
		if (!pres || pres.status !== status || pres.region !== label || now - (pres.lastSeen || 0) >= MICATRO_PRESENCE_MS) {
			await store.setJSON('presence:' + username, {
				name: username, map: '', x: 0, y: 0, facing: 'down',
				status, region: label,
				lastSeen: now,
			});
		}
		return json({ ok: true, seq, watchers, watcherNames, wrote: !unchanged });
	}

	// MICATRO custom decks (the deck editor): the player's saved decks, one row per player.
	// put {decks, rev}: replaces the list when `rev` matches the row's (else 409 + the current row, so a
	// second device merges instead of clobbering); writes exactly `micatrodecks:<username>`.
	if (action === 'micatro-decks-get') {
		const row = (await store.get('micatrodecks:' + username)) || { rev: 0, decks: [] };
		return json({ rev: row.rev || 0, decks: Array.isArray(row.decks) ? row.decks : [] });
	}
	if (action === 'micatro-decks-put') {
		if (!Array.isArray(body.decks)) return json({ error: 'decks must be a list' }, 400);
		if (body.decks.length > MICATRO_DECKS_MAX) return json({ error: `at most ${MICATRO_DECKS_MAX} decks`, max: MICATRO_DECKS_MAX }, 400);
		const decks = [], ids = new Set();
		for (const d of body.decks) {
			const id = String(d && d.id || '').slice(0, 40);
			const def = d && d.def;
			if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || ids.has(id) || !def || typeof def !== 'object' || Array.isArray(def)) return json({ error: 'bad deck entry' }, 400);
			const text = JSON.stringify(def);
			if (text.length > MICATRO_DECK_BYTES) return json({ error: 'deck too large', max: MICATRO_DECK_BYTES }, 413);
			ids.add(id);
			decks.push({ id, def: JSON.parse(text), updated: Math.max(0, Math.floor(+d.updated || 0)) || Date.now() });
		}
		if (JSON.stringify(decks).length > MICATRO_DECKS_BYTES) return json({ error: 'too much deck data', max: MICATRO_DECKS_BYTES }, 413);
		const key = 'micatrodecks:' + username;
		const prev = (await store.get(key)) || { rev: 0, decks: [] };
		if ((+body.rev || 0) !== (prev.rev || 0)) return json({ error: 'stale', rev: prev.rev || 0, decks: prev.decks || [] }, 409);
		const rev = (prev.rev || 0) + 1;
		await store.setJSON(key, { rev, decks, updated_at: Date.now() });
		return json({ ok: true, rev, count: decks.length });
	}

	// MICATRO win stickers (micatro/js/ui/stickers.js): exact key `micatro_stickers:<username>`, durable.
	// get -> {v:2, wins: {key: {cat: level}}, rev}. put {wins} (either form per key: {cat: level} or a flat
	// level = {win}) MERGES server-side: each key and category keeps max(stored, incoming), so a stale or racing
	// device never lowers or drops a sticker; written with compare-and-set on `rev` (re-merged on a lost race)
	// and only when something rose. -> {ok, wins (the merged map), rev, changed}. Both also return `revoked` (the
	// admin's revocations, normalized: {key: {cats, at}}) and `earned` (re-earn times for revoked keys); a put may
	// carry `earned` {key: {cat: ms}} for revoked keys (see MICATRO_STICKERS_MAX above).
	const storedStickers = (row) => {
		const out = Object.create(null);
		const had = row && row.wins && typeof row.wins === 'object' && !Array.isArray(row.wins) ? row.wins : {};
		for (const k of Object.keys(had)) {
			if (!MICATRO_STICKER_KEY_RE.test(k) || k === '__proto__') continue;
			const r = stickerRecord(had[k], true); // read leniently: a bad category is dropped, not the joker
			if (r) out[k] = r;
		}
		return out;
	};
	const allStakes = micatroAllStakes(username) ? { allStakes: true } : {};   // (MICATRO_ALL_STAKES: never from the body)
	if (action === 'micatro-stickers-get') {
		const row = await store.get('micatro_stickers:' + username);
		const revoked = stickerRevocations(row && row.revoked), earned = stickerEarned(row && row.earned, revoked);
		const wins = storedStickers(row);
		stripRevokedStickers(wins, revoked, earned);
		return json({ v: 2, wins: stickersFor(wins, stickerClientMax(body)), rev: (row && row.rev) || 0, revoked, earned, ...allStakes });
	}
	if (action === 'micatro-stickers-put') {
		const inc = body.wins;
		if (!inc || typeof inc !== 'object' || Array.isArray(inc)) return json({ error: 'wins must be an object' }, 400);
		if (JSON.stringify(inc).length > MICATRO_STICKERS_BYTES) return json({ error: 'too much sticker data', max: MICATRO_STICKERS_BYTES }, 413);
		const keys = Object.keys(inc);
		if (keys.length > MICATRO_STICKERS_MAX) return json({ error: `at most ${MICATRO_STICKERS_MAX} jokers`, max: MICATRO_STICKERS_MAX }, 413);
		const incoming = Object.create(null);
		for (const k of keys) {
			const r = MICATRO_STICKER_KEY_RE.test(k) && k !== '__proto__' ? stickerRecord(inc[k]) : null;
			if (!r) return json({ error: 'bad sticker entry' }, 400);
			incoming[k] = r;
		}
		const key = 'micatro_stickers:' + username;
		for (let attempt = 0; attempt < 5; attempt++) {
			const prev = await store.get(key);
			const rev = (prev && prev.rev) || 0;
			const merged = storedStickers(prev);
			const now = Date.now();
			const revoked = stickerRevocations(prev && prev.revoked), earned = stickerEarned(prev && prev.earned, revoked);
			const incEarned = stickerEarned(body.earned, revoked, now);
			// an older flat row is rewritten in the new form; a stored sticker the admin revoked is dropped
			const dropped = stripRevokedStickers(merged, revoked, earned);
			let changed = (!!prev && prev.v !== 2) || dropped > 0;
			for (const k of keys) {
				let cur = merged[k];
				for (const c of Object.keys(incoming[k])) {
					if (revoked[k] && revoked[k].cats.includes(c)) {
						// revoked: only a win earned after the revocation counts (its time is kept so it sticks)
						if (!stickerReEarned(revoked, incEarned, k, c)) continue;
						const t = incEarned[k][c];
						if (!(earned[k] && earned[k][c] >= t)) { (earned[k] || (earned[k] = {}))[c] = t; changed = true; }
					}
					if (!cur) cur = merged[k] = {};
					if (!(cur[c] >= incoming[k][c])) { cur[c] = incoming[k][c]; changed = true; }
				}
			}
			if (!changed) return json({ ok: true, wins: stickersFor(merged, stickerClientMax(body)), rev, changed: false, revoked, earned, ...allStakes });
			if (Object.keys(merged).length > MICATRO_STICKERS_MAX) return json({ error: `at most ${MICATRO_STICKERS_MAX} jokers`, max: MICATRO_STICKERS_MAX }, 413);
			const next = { v: 2, wins: merged, rev: rev + 1, updatedAt: now };
			if (prev && prev.revoked !== undefined) next.revoked = prev.revoked; // the admin's field, kept verbatim
			if (Object.keys(earned).length) next.earned = earned;
			if (await store.setIfRev(key, next, rev)) return json({ ok: true, wins: stickersFor(merged, stickerClientMax(body)), rev: rev + 1, changed: true, revoked, earned, ...allStakes });
		}
		return json({ error: 'busy, retry' }, 503); // five lost races in a row: the client retries
	}

	// MICATRO Nuzlocke / Monotype record + achievements (micatro/js/ui/progress.js): one row per player,
	// exactly `micatro_progress:<username>` = {rev, progress, updated_at}. put {progress} MERGES into the row so
	// nothing goes backwards (counts: max; types / achievements: union, earliest time kept) and returns the
	// merged record. Client-reported, like run scores. The write is a compare-and-set on rev (retried), so
	// two devices pushing at once can't lose each other's wins.
	// A record from before the per-type fields (monoStake / bothMono / bothStake) is backfilled at READ time from the
	// player's replays (micatroProgressFromRuns): returned merged, never written here (the client keeps it like any
	// other device's record, and its normal put max-merges it in).
	if (action === 'micatro-progress-get') {
		const row = await store.get('micatro_progress:' + username);
		let progress = mergeMicatroProgress(emptyMicatroProgress(), (row && row.progress) || {});
		if (micatroProgressNeedsBackfill(progress)) {
			try {
				const derived = micatroProgressFromRuns(await store.micatroReplayBadges(username));
				if (derived) progress = mergeMicatroProgress(progress, derived);
			} catch { /* the backfill is best-effort: the stored record still reads */ }
		}
		return json({ progress });
	}
	if (action === 'micatro-progress-put') {
		let text;
		try { text = JSON.stringify(body.progress); } catch { text = ''; }
		if (!text || text.length > MICATRO_PROGRESS_BYTES) return json({ error: 'progress too large', max: MICATRO_PROGRESS_BYTES }, 413);
		const inc = cleanMicatroProgress(body.progress);
		if (!inc) return json({ error: 'not a progress record' }, 400);
		const key = 'micatro_progress:' + username;
		for (let i = 0; i < 4; i++) {
			const row = await store.get(key);
			const prev = mergeMicatroProgress(emptyMicatroProgress(), (row && row.progress) || {});
			const merged = mergeMicatroProgress(prev, inc);
			if (JSON.stringify(merged) === JSON.stringify(prev) && row) return json({ ok: true, progress: merged, wrote: false });
			const rev = ((row && row.rev) || 0);
			if (await store.setIfRev(key, { rev: rev + 1, progress: merged, updated_at: Date.now() }, rev)) return json({ ok: true, progress: merged, wrote: true });
		}
		return json({ error: 'busy, retry' }, 409);
	}

	// MICATRO completed challenges (micatro/js/ui/challengesync.js): exact key `micatro_challenges:<username>`, durable.
	// get -> {done: {id: ts}, rev}. put {done} MERGES: the union of ids, each keeping its EARLIEST completion time, so
	// nothing is ever un-completed; written with compare-and-set on `rev` (re-merged on a lost race) and only when
	// something changed. Ids are checked by shape (the registry lives in the client: mods register their own).
	const storedChallenges = (row) => {
		const out = Object.create(null);
		const had = row && row.done && typeof row.done === 'object' && !Array.isArray(row.done) ? row.done : {};
		for (const k of Object.keys(had)) if (MICATRO_CHALLENGE_ID_RE.test(k) && k !== '__proto__' && Number.isInteger(had[k]) && had[k] > 0) out[k] = had[k];
		return out;
	};
	if (action === 'micatro-challenges-get') {
		const row = await store.get('micatro_challenges:' + username);
		return json({ done: storedChallenges(row), rev: (row && row.rev) || 0 });
	}
	if (action === 'micatro-challenges-put') {
		const inc = body.done;
		if (!inc || typeof inc !== 'object' || Array.isArray(inc)) return json({ error: 'done must be an object' }, 400);
		const ids = Object.keys(inc);
		if (ids.length > MICATRO_CHALLENGES_MAX) return json({ error: `at most ${MICATRO_CHALLENGES_MAX} challenges`, max: MICATRO_CHALLENGES_MAX }, 413);
		const now = Date.now();
		for (const id of ids) {
			const ts = inc[id];
			if (!MICATRO_CHALLENGE_ID_RE.test(id) || id === '__proto__' || !Number.isInteger(ts) || ts <= 0 || ts > now + 86_400_000) return json({ error: 'bad challenge entry' }, 400);
		}
		const key = 'micatro_challenges:' + username;
		for (let attempt = 0; attempt < 5; attempt++) {
			const prev = await store.get(key);
			const rev = (prev && prev.rev) || 0;
			const merged = storedChallenges(prev);
			let changed = false;
			for (const id of ids) if (!merged[id] || inc[id] < merged[id]) { merged[id] = inc[id]; changed = true; }
			if (!changed) return json({ ok: true, done: merged, rev, changed: false });
			if (Object.keys(merged).length > MICATRO_CHALLENGES_MAX) return json({ error: `at most ${MICATRO_CHALLENGES_MAX} challenges`, max: MICATRO_CHALLENGES_MAX }, 413);
			if (await store.setIfRev(key, { v: 1, done: merged, rev: rev + 1, updatedAt: now }, rev)) return json({ ok: true, done: merged, rev: rev + 1, changed: true });
		}
		return json({ error: 'busy, retry' }, 503);
	}

	// MICATRO in-progress run (micatro/js/ui/runsync.js): exact key `micatro_run:<username>`, durable, ONE active run.
	//   get -> {rev, run: {id, recipe, updatedAt, device, progress} | null, ended: [{id, actions, outcome, at}]}
	//   put {recipe, rev, device?, progress?, replace?, endless?} — compare-and-set on `rev` (the row's rev the client
	//       last saw; 0 = none). Refused (409, with the stored run's summary so the client can decide):
	//         'stale'  — the row changed since that rev (the client re-reads and retries if it is still ahead)
	//         'other'  — the account holds a DIFFERENT run (another seed/started) and `replace` doesn't name it:
	//                    a device never silently overwrites another's run (the player chooses)
	//         'behind' — the same run, but the stored copy has MORE actions (a further-along device wins)
	//         'ended'  — this run already finished (won / lost / abandoned) — a late put can't resurrect it; only a
	//                    WON run going on into Endless (`endless`, past the win's action count) reopens, and a run
	//                    another device REPLACED comes back only on the player's explicit choice (`restore`)
	//       Equal progress on the same run writes nothing (D1 writes are budgeted).
	//   clear {id, outcome} — the run finished: clears ONLY that run (a different stored run is left alone, 409
	//       'other'), and leaves a tombstone for it in `ended`.
	// The action count is the recipe's own (never the client's word); ante / round are display-only.
	const runSummary = (r) => (r ? { id: r.id, updatedAt: r.updatedAt || 0, device: r.device || null, progress: r.progress || null } : null);
	const runEnded = (row) => (row && Array.isArray(row.ended) ? row.ended.filter((e) => e && typeof e.id === 'string').slice(-MICATRO_RUN_ENDED) : []);
	if (action === 'micatro-run-get') {
		const row = await store.get('micatro_run:' + username);
		return json({ rev: (row && row.rev) || 0, run: (row && row.run) || null, ended: runEnded(row) });
	}
	if (action === 'micatro-run-put') {
		let text;
		try { text = JSON.stringify(body.recipe); } catch { text = ''; }
		if (!text) return json({ error: 'not a run recipe' }, 400);
		if (text.length > MICATRO_RUN_BYTES) return json({ error: 'run too large', max: MICATRO_RUN_BYTES }, 413);
		const recipe = body.recipe;
		if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe) || typeof recipe.v !== 'number' || typeof recipe.seed !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(recipe.seed)
			|| (recipe.started !== undefined && !(Number.isInteger(recipe.started) && recipe.started >= 0 && recipe.started <= 1e13))
			|| !Array.isArray(recipe.actions) || !recipe.actions.every(a => a && typeof a === 'object' && !Array.isArray(a) && typeof a.type === 'string')
			|| (recipe.modVersions !== undefined && !cleanModVersions(recipe.modVersions, false))
			|| (recipe.engineRev !== undefined && !(Number.isInteger(recipe.engineRev) && recipe.engineRev >= 0 && recipe.engineRev <= 1e6))) return json({ error: 'not a run recipe' }, 400);
		if (recipe.actions.length > MICATRO_REPLAY_ACTIONS) return json({ error: 'too many actions', max: MICATRO_REPLAY_ACTIONS }, 413);
		const id = recipe.seed + ':' + (recipe.started || 0);
		const actions = recipe.actions.length;
		const int = (v, hi) => Math.max(0, Math.min(hi, Math.floor(Number(v)) || 0));
		const p = body.progress && typeof body.progress === 'object' ? body.progress : {};
		const progress = { ante: int(p.ante, 100000), round: int(p.round, 1000000), actions };
		const d = body.device && typeof body.device === 'object' ? body.device : {};
		const device = { id: /^[a-z0-9]{6,24}$/.test(String(d.id || '')) ? String(d.id) : '', label: String(d.label || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 24) };
		const key = 'micatro_run:' + username;
		const row = await store.get(key);
		const rev = (row && row.rev) || 0;
		const cur = (row && row.run) || null;
		let ended = runEnded(row);
		const tomb = ended.find((e) => e.id === id);
		// (a run another device REPLACED may come back only on the player's explicit choice: `restore`)
		const reopen = tomb && ((body.endless === true && tomb.outcome === 'won' && actions > (tomb.actions || 0)) || (body.restore === true && tomb.outcome === 'replaced'));
		if (tomb && !reopen) return json({ error: 'ended', rev, run: runSummary(cur), ended: tomb }, 409);
		if ((+body.rev || 0) !== rev) return json({ error: 'stale', rev, run: runSummary(cur) }, 409);
		if (cur && cur.id !== id && body.replace !== cur.id) return json({ error: 'other', rev, run: runSummary(cur) }, 409);
		if (cur && cur.id === id) {
			const had = (cur.progress && cur.progress.actions) || 0;
			if (actions < had) return json({ error: 'behind', rev, run: runSummary(cur) }, 409);
			if (actions === had) return json({ ok: true, rev, wrote: false, run: runSummary(cur) });
		}
		if (tomb) ended = ended.filter((e) => e.id !== id); // a won run going on into Endless
		// (a replaced run is remembered as ended too: its other device's late puts can't take the slot back)
		if (cur && cur.id !== id) ended = [...ended.filter((e) => e.id !== cur.id), { id: cur.id, actions: (cur.progress && cur.progress.actions) || 0, outcome: 'replaced', at: Date.now() }].slice(-MICATRO_RUN_ENDED);
		const run = { id, recipe, updatedAt: Date.now(), device, progress };
		if (!(await store.setIfRev(key, { v: 1, rev: rev + 1, run, ended, updatedAt: run.updatedAt }, rev))) {
			const now2 = await store.get(key);
			return json({ error: 'stale', rev: (now2 && now2.rev) || 0, run: runSummary(now2 && now2.run) }, 409);
		}
		return json({ ok: true, rev: rev + 1, wrote: true, run: runSummary(run) });
	}
	if (action === 'micatro-run-clear') {
		const id = String(body.id || '');
		if (!/^[A-Za-z0-9_-]{1,32}:\d{1,13}$/.test(id)) return json({ error: 'bad run id' }, 400);
		const outcome = MICATRO_RUN_OUTCOMES.includes(body.outcome) ? body.outcome : 'abandoned';
		const int = (v) => Math.max(0, Math.min(MICATRO_REPLAY_ACTIONS, Math.floor(Number(v)) || 0));
		const key = 'micatro_run:' + username;
		for (let attempt = 0; attempt < 5; attempt++) {
			const row = await store.get(key);
			const rev = (row && row.rev) || 0;
			const cur = (row && row.run) || null;
			if (cur && cur.id !== id) return json({ error: 'other', rev, run: runSummary(cur) }, 409);
			// (a device that fell BEHIND another in this run never clears the further-along copy)
			if (cur && int(body.actions) < ((cur.progress && cur.progress.actions) || 0)) return json({ error: 'behind', rev, run: runSummary(cur) }, 409);
			const ended = runEnded(row);
			const had = ended.find((e) => e.id === id);
			const at = Math.max(int(body.actions), (cur && cur.progress && cur.progress.actions) || 0);
			if (!cur && had && had.actions >= at && had.outcome === outcome) return json({ ok: true, rev, wrote: false });
			const next = [...ended.filter((e) => e.id !== id), { id, actions: at, outcome, at: Date.now() }].slice(-MICATRO_RUN_ENDED);
			if (await store.setIfRev(key, { v: 1, rev: rev + 1, run: null, ended: next, updatedAt: Date.now() }, rev)) return json({ ok: true, rev: rev + 1, wrote: true });
		}
		return json({ error: 'busy, retry' }, 503);
	}

	// MICASURVIVOR cloud save (micasurvivor/js/core/db.js, Magepunk mode). Exact key
	// `micasurvivor:<username>` only. get → {rev, save|null}. put {save, rev} writes iff the
	// stored rev equals `rev` (atomic setIfRev; 0 = no row yet) → {ok, rev}; otherwise 409
	// {error:'stale', rev, save} so the client merges with the stored save and retries.
	if (action === 'micasurvivor-save-get') {
		const row = await store.get('micasurvivor:' + username);
		return json({ rev: (row && row.rev) || 0, save: (row && row.save) || null });
	}
	if (action === 'micasurvivor-save-put') {
		const save = body.save;
		if (!save || typeof save !== 'object' || Array.isArray(save) || typeof save.v !== 'number'
			|| !save.owned || typeof save.owned !== 'object' || Array.isArray(save.owned)) return json({ error: 'not a save' }, 400);
		const text = JSON.stringify(save);
		if (text.length > MICASURVIVOR_SAVE_MAX) return json({ error: 'save too large', max: MICASURVIVOR_SAVE_MAX }, 413);
		const expect = Number.isInteger(body.rev) && body.rev >= 0 ? body.rev : -1;
		if (expect < 0) return json({ error: 'bad rev' }, 400);
		const key = 'micasurvivor:' + username;
		const rev = expect + 1;
		if (await store.setIfRev(key, { rev, save: JSON.parse(text), updated_at: Date.now() }, expect)) return json({ ok: true, rev });
		const cur = await store.get(key);
		return json({ error: 'stale', rev: (cur && cur.rev) || 0, save: (cur && cur.save) || null }, 409);
	}

	// MICASURVIVOR EXPEDITION save (DLC D0b; micasurvivor/js/expedition/save.js). Exact key `micasurvivorexp:<username>`
	// only (the base micasurvivor:<username> row is never read or written here). get -> {rev, save|null}. put {save, rev}:
	// a stale rev gets 409 {error:'stale', rev, save} (the client merges and retries); on the current rev the save is
	// MERGED into the stored one (max per counter, union per set) and written iff the rev still matches (setIfRev), so a
	// put can add progress but never take any away. -> {ok, rev, save} (the merged save).
	if (action === 'micasurvivor-exp-save-get') {
		const row = await store.get('micasurvivorexp:' + username);
		return json({ rev: (row && row.rev) || 0, save: (row && row.save) || null });
	}
	if (action === 'micasurvivor-exp-save-put') {
		const c = cleanMsurvExpSave(body.save);
		if (c.error) return json({ error: c.error, ...(c.max ? { max: c.max } : {}) }, 400);
		if (JSON.stringify(c.save).length > MSURV_EXP_SAVE_MAX) return json({ error: 'save too large', max: MSURV_EXP_SAVE_MAX }, 413);
		const expect = Number.isInteger(body.rev) && body.rev >= 0 ? body.rev : -1;
		if (expect < 0) return json({ error: 'bad rev' }, 400);
		const key = 'micasurvivorexp:' + username;
		const cur = await store.get(key);
		const curRev = (cur && cur.rev) || 0;
		if (curRev !== expect) return json({ error: 'stale', rev: curRev, save: (cur && cur.save) || null }, 409);
		const stored = cur && cur.save ? cleanMsurvExpSave(cur.save).save : null;
		const merged = stored ? mergeMsurvExpSave(stored, c.save) : c.save;
		if (JSON.stringify(merged).length > MSURV_EXP_SAVE_MAX) return json({ error: 'save too large', max: MSURV_EXP_SAVE_MAX }, 413);
		if (await store.setIfRev(key, { rev: expect + 1, save: merged, updated_at: Date.now() }, expect)) return json({ ok: true, rev: expect + 1, save: merged });
		const now = await store.get(key);
		return json({ error: 'stale', rev: (now && now.rev) || 0, save: (now && now.save) || null }, 409);
	}

	// MICASURVIVOR online co-op (M5 batch 12b): friends-only lobbies, WebRTC signalling and the
	// relay fallback (see the MSURV_* constants for the rows and their lives). Every row written
	// here is an EXACT key derived from the token's user and a lobby it belongs to.
	if (action.startsWith('msurv-')) {
		// (globalThis.__msurvClock: an injectable clock for the tests, which run this handler in-process; never set live)
		const now = typeof globalThis.__msurvClock === 'function' ? globalThis.__msurvClock() : Date.now();
		const myFriends = Array.isArray(user.friends) ? user.friends : [];
		const LKEY = id => 'msurvlobby:' + id;
		const SKEY = (id, who) => 'msurvsig:' + id + ':' + who;
		const RKEY = (id, who) => 'msurvrelay:' + id + ':' + who;
		const IKEY = (to, from) => 'msurvinv:' + to + ':' + from;
		const id = String(body.id || '');
		const okId = /^[0-9a-f]{12}$/.test(id);
		const NAME_RE = /^[a-z0-9_.-]{1,40}$/;
		const dexOf = v => { const d = Math.floor(+v); return d >= 1 && d <= 1025 ? d : 25; };
		const member = (lb, who) => lb.members.find(m => m.name === who) || null;
		const hostSeen = lb => (member(lb, lb.host) || {}).seen || 0;
		const live = lb => !!lb && now - hostSeen(lb) < (lb.start ? MSURV_RUN_IDLE_MS : MSURV_LOBBY_IDLE_MS);
		const view = lb => ({
			id: lb.id, host: lb.host, open: !!lb.open, v: lb.rev || 0,
			members: lb.members.map(m => ({ name: m.name, dex: m.dex, shiny: !!m.shiny, ready: m.name === lb.host || !!m.ready })),
			start: lb.start || null,
			...(lb.dv != null ? { mode: lb.mode, dv: lb.dv } : {}),   // (DLC D0b: an Expedition lobby only)
			...(lb.host === username ? { invited: Object.keys(lb.invited || {}).filter(n => now - lb.invited[n] < MSURV_INVITE_TTL_MS) } : {}),
		});
		// compare-and-set on the lobby's rev: fn(lb) edits lb in place and returns nothing, an
		// {error, status} to refuse, or false for "nothing to write". Retries a lost race.
		const mutate = async (fn) => {
			for (let i = 0; i < 6; i++) {
				const lb = await store.get(LKEY(id));
				if (!live(lb)) return { error: 'lobby closed', status: 404, closed: true };
				const r = fn(lb);
				if (r && r.error) return r;
				if (r === false) return { lb };
				// a waiting guest who stopped polling (tab closed without a goodbye) is dropped
				if (!lb.start) lb.members = lb.members.filter(m => m.name === lb.host || now - (m.seen || 0) < MSURV_MEMBER_IDLE_MS);
				const prev = lb.rev || 0;
				lb.rev = prev + 1; lb.ts = now;
				if (await store.setIfRev(LKEY(id), lb, prev)) return { lb };
			}
			return { error: 'busy, try again', status: 503 };
		};
		const fail = r => json({ error: r.error, ...(r.closed ? { closed: true } : {}) }, r.status || 400);
		// the caller's lobby, for the signalling / relay actions: must be live and the caller in it
		const myLobby = async () => {
			if (!okId) return { error: 'bad lobby id', status: 400 };
			const lb = await store.get(LKEY(id));
			if (!live(lb)) return { error: 'lobby closed', status: 404, closed: true };
			if (!member(lb, username)) return { error: 'not in this lobby', status: 403, closed: true };
			return { lb };
		};
		// {name: [[seq, payload]...]} addressed to OTHER members only, within the caps
		const cleanWindow = (lb, to, maxEach, maxMsg) => {
			if (!to || typeof to !== 'object' || Array.isArray(to)) return { error: 'bad window', status: 400 };
			const out = {};
			for (const [who, list] of Object.entries(to)) {
				if (who === username || !member(lb, who)) return { error: 'not a member: ' + String(who).slice(0, 40), status: 403 };
				if (!Array.isArray(list) || list.length > maxEach) return { error: 'too many messages', max: maxEach, status: 400 };
				const ok = [];
				for (const e of list) {
					if (!Array.isArray(e) || e.length !== 2 || !Number.isSafeInteger(e[0]) || e[0] < 0) return { error: 'bad message', status: 400 };
					if (maxMsg && JSON.stringify(e[1]).length > maxMsg) return { error: 'message too large', max: maxMsg, status: 413 };
					ok.push(e);
				}
				if (ok.length) out[who] = ok;
			}
			return { out };
		};
		const sinceOf = (who) => { const s = body.since && Number(body.since[who]); return Number.isFinite(s) ? s : -1; };
		// the relay's daily minutes for a host (UTC day; a minute counts once)
		const BKEY = host => 'msurvrelaybudget:' + host + ':' + new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
		const minute = Math.floor(now / 60_000);
		const budgetOf = async host => (await store.get(BKEY(host))) || { rev: 0, used: 0, last: -1 };
		const relayLeft = b => Math.max(0, MSURV_RELAY_DAILY_MIN - (b.used || 0));
		const budgetOut = b => (b.used || 0) >= MSURV_RELAY_DAILY_MIN && b.last !== minute;
		// count this minute (once, whoever writes first: compare-and-set, re-read on a lost race)
		const spendMinute = async host => {
			for (let i = 0; i < 5; i++) {
				const b = await budgetOf(host);
				if (b.last === minute) return true;
				if (budgetOut(b)) return false;
				if (await store.setIfRev(BKEY(host), { rev: (b.rev || 0) + 1, used: (b.used || 0) + 1, last: minute, updated_at: now }, b.rev || 0)) return true;
			}
			return true;   // (contended: someone else just counted this minute)
		};
		const BUDGET_ERR = { error: 'relay time used up for today', budget: true, max: MSURV_RELAY_DAILY_MIN };

		// ---- lobbies ----
		if (action === 'msurv-lobby-create') {
			// DLC D0b: an Expedition lobby carries its mode ('exp-…') and content version (dv), both or neither
			const exp = body.mode != null || body.dv != null;
			if (exp && (!MSURV_EXP_MODE_RE.test(String(body.mode)) || !msurvExpDvOk(body.dv))) return json({ error: 'bad Expedition mode or version' }, 400);
			for (let i = 0; i < 4; i++) {
				const nid = randomBytes(6).toString('hex');
				const lb = { id: nid, host: username, open: true, rev: 1, at: now, ts: now, invited: {}, start: null,
					members: [{ name: username, dex: dexOf(body.dex), shiny: !!body.shiny, ready: true, seen: now }] };
				if (exp) { lb.mode = body.mode; lb.dv = body.dv; }   // (DLC D0b: an Expedition lobby; a base one has neither)
				if (await store.setIfRev(LKEY(nid), lb, 0)) return json({ lobby: view(lb) });
			}
			return json({ error: 'busy, try again' }, 503);
		}
		if (action === 'msurv-lobby-join') {
			if (!okId) return json({ error: 'bad lobby id' }, 400);
			const lb0 = await store.get(LKEY(id));
			if (!live(lb0)) return json({ error: 'lobby closed', closed: true }, 404);
			// friends only: the host must be YOUR friend and you THEIRS (the server's lists, not the client's)
			const hostUser = lb0.host === username ? user : await store.get(lb0.host);
			if (lb0.host !== username && (!myFriends.includes(lb0.host) || !Array.isArray(hostUser?.friends) || !hostUser.friends.includes(username)))
				return json({ error: 'only the host\'s friends can join' }, 403);
			// DLC D0b: an Expedition lobby takes only players on the same content version (a stale cache reloads)
			if (lb0.dv != null && body.dv !== lb0.dv) return json({ error: 'your game is out of date: reload', mode: lb0.mode, dv: lb0.dv }, 409);
			const r = await mutate(lb => {
				const me = member(lb, username);
				if (me) { me.dex = dexOf(body.dex); me.shiny = !!body.shiny; me.seen = now; return; }
				if (!lb.open || lb.start) return { error: 'already started', status: 409 };
				if (lb.members.filter(m => m.name === lb.host || now - (m.seen || 0) < MSURV_MEMBER_IDLE_MS).length >= MSURV_MAX) return { error: 'lobby full', max: MSURV_MAX, status: 409 };
				lb.members.push({ name: username, dex: dexOf(body.dex), shiny: !!body.shiny, ready: false, seen: now });
			});
			if (r.error) return fail(r);
			await store.delete(IKEY(username, r.lb.host));   // the invite is used up
			return json({ lobby: view(r.lb) });
		}
		if (action === 'msurv-lobby-leave') {
			if (!okId) return json({ error: 'bad lobby id' }, 400);
			const lb = await store.get(LKEY(id));
			if (!lb || !member(lb, username)) return json({ ok: true });
			if (lb.host === username) {
				// the host leaving closes the lobby: its row, every member's signalling / relay row
				// and the invites still out (all exact keys)
				await store.delete(LKEY(id));
				await store.deleteKeys([...lb.members.flatMap(m => [SKEY(id, m.name), RKEY(id, m.name)]),
					...Object.keys(lb.invited || {}).filter(n => NAME_RE.test(n)).map(n => IKEY(n, username))]);
				return json({ ok: true, closed: true });
			}
			if (live(lb)) await mutate(l => { const n = l.members.length; l.members = l.members.filter(m => m.name !== username); return l.members.length === n ? false : undefined; });
			await store.deleteKeys([SKEY(id, username), RKEY(id, username)]);
			return json({ ok: true });
		}
		if (action === 'msurv-lobby-poll') {
			if (!okId) return json({ error: 'bad lobby id' }, 400);
			let lb = await store.get(LKEY(id));
			if (!live(lb)) return json({ closed: true });
			const me = member(lb, username);
			if (!me) return json({ closed: true, removed: true });
			if (now - (me.seen || 0) >= MSURV_SEEN_BEAT_MS) {
				const r = await mutate(l => { const m = member(l, username); if (!m) return { error: 'removed', status: 200, closed: true }; m.seen = now; });
				if (r.error) return json({ closed: true, removed: true });
				lb = r.lb;
			}
			const left = relayLeft(await budgetOf(lb.host));   // (the lobby's warning: "Relay: N min left today")
			if (body.v != null && Number(body.v) === (lb.rev || 0)) return json({ unchanged: true, v: lb.rev || 0, relayLeft: left });
			return json({ lobby: view(lb), relayLeft: left });
		}
		if (action === 'msurv-lobby-update') {
			if (!okId) return json({ error: 'bad lobby id' }, 400);
			const r = await mutate(lb => {
				const me = member(lb, username);
				if (!me) return { error: 'not in this lobby', status: 403, closed: true };
				const isHost = lb.host === username;
				if ((body.open != null || body.start != null) && !isHost) return { error: 'only the host can do that', status: 403 };
				if (body.dex != null) me.dex = dexOf(body.dex);
				if (body.shiny != null) me.shiny = !!body.shiny;
				if (body.ready != null && !isHost) me.ready = !!body.ready;
				me.seen = now;
				if (body.open === true) { lb.open = true; lb.start = null; for (const m of lb.members) if (m.name !== lb.host) m.ready = false; }
				else if (body.open === false) lb.open = false;
				if (body.start != null) {
					if (lb.start) return { error: 'already started', status: 409 };
					const live2 = lb.members.filter(m => m.name === lb.host || now - (m.seen || 0) < MSURV_MEMBER_IDLE_MS);
					if (live2.length < 2) return { error: 'you need at least one friend in the lobby', status: 409 };
					if (live2.some(m => m.name !== lb.host && !m.ready)) return { error: 'not everyone is ready', status: 409 };
					const seed = Math.floor(+body.start.seed);
					lb.members = live2;
					lb.open = false;
					lb.start = { seed: seed >= 0 && seed < 1e9 ? seed : Math.floor(Math.random() * 1e6), at: now, host: lb.host,
						members: live2.map(m => ({ uid: m.name, name: m.name, dex: m.dex, shiny: !!m.shiny })) };
					if (lb.dv != null) { lb.start.mode = lb.mode; lb.start.dv = lb.dv; }   // (DLC D0b: an Expedition lobby's start)
				}
			});
			if (r.error) return fail(r);
			return json({ lobby: view(r.lb) });
		}

		// ---- invites (a row per pair + a bell message in the friend's DM inbox) ----
		if (action === 'msurv-invite') {
			if (!okId) return json({ error: 'bad lobby id' }, 400);
			const to = String(body.to || '').trim().toLowerCase();
			if (!NAME_RE.test(to) || to === username || !myFriends.includes(to)) return json({ error: 'you can only invite your friends' }, 403);
			let fresh = false;
			const prevInv = await store.get(IKEY(to, username));
			const recent = !!prevInv && prevInv.id === id && now - (+prevInv.at || 0) < MSURV_INVITE_TTL_MS / 3;
			const r = await mutate(lb => {
				if (lb.host !== username) return { error: 'only the host can invite', status: 403 };
				if (!lb.open || lb.start) return { error: 'already started', status: 409 };
				if (member(lb, to)) return { error: 'already in the lobby', status: 409 };
				if (lb.members.length >= MSURV_MAX) return { error: 'lobby full', max: MSURV_MAX, status: 409 };
				lb.invited = lb.invited || {};
				for (const n of Object.keys(lb.invited)) if (now - lb.invited[n] >= MSURV_INVITE_TTL_MS) delete lb.invited[n];
				if (recent) return false;   // just sent (and still there): no second write, no second bell message
				fresh = true;
				lb.invited[to] = now;
			});
			if (r.error) return fail(r);
			if (fresh) {
				await store.setJSON(IKEY(to, username), { id, host: username, at: now });
				const room = 'chat:dm:' + to;
				const list = (await store.get(room)) || [];
				list.push({ from: username, text: ('🎮 ' + username + ' invites you to MicaSurvivor co-op! Open /micasurvivor/ within 3 min to join.').slice(0, 140), emote: null, ts: now, kind: 'msurv-invite' });
				await store.setJSON(room, list.slice(-40));
			}
			return json({ ok: true, sent: fresh, lobby: view(r.lb) });
		}
		if (action === 'msurv-invites') {
			const prefix = 'msurvinv:' + username + ':';
			const rows = (await store.list(prefix)).filter(x => x.key.startsWith(prefix) && NAME_RE.test(x.key.slice(prefix.length)));
			const out = [], dead = [];
			for (const x of rows) {
				const from = x.key.slice(prefix.length), v = x.value || {};
				const lb = myFriends.includes(from) && now - (+v.at || 0) < MSURV_INVITE_TTL_MS && /^[0-9a-f]{12}$/.test(String(v.id)) ? await store.get(LKEY(v.id)) : null;
				if (lb && live(lb) && lb.host === from && lb.open && !lb.start && !member(lb, username) && lb.members.length < MSURV_MAX)
					out.push({ from, id: v.id, at: v.at, members: lb.members.length });
				else dead.push(x.key);
			}
			if (dead.length) await store.deleteKeys(dead);
			// presence ("in MicaSurvivor"), only for players someone can see, and at most once a minute
			const STATUSES = ['micasurvivor', 'micasurvivor:lobby', 'micasurvivor:run'];
			if (!body.quiet && myFriends.length) {
				const status = STATUSES.includes(body.status) ? body.status : 'micasurvivor';
				const pres = await store.get('presence:' + username);
				if (!pres || pres.status !== status || now - (pres.lastSeen || 0) >= MSURV_PRESENCE_MS)
					await store.setJSON('presence:' + username, { name: username, map: '', x: 0, y: 0, facing: 'down', status, region: 'MicaSurvivor', lastSeen: now });
			}
			return json({ invites: out, now });
		}
		if (action === 'msurv-invite-decline') {
			const from = String(body.from || '').trim().toLowerCase();
			if (!NAME_RE.test(from)) return json({ error: 'bad name' }, 400);
			await store.delete(IKEY(username, from));
			return json({ ok: true });
		}

		// ---- WebRTC signalling (offer / answer / ICE), one window row per sender ----
		if (action === 'msurv-signal-put') {
			const g = await myLobby();
			if (g.error) return fail(g);
			const w = cleanWindow(g.lb, body.to, MSURV_SIGNAL_WINDOW, 0);
			if (w.error) return json({ error: w.error, ...(w.max ? { max: w.max } : {}) }, w.status);
			const row = { ts: now, to: w.out };
			if (JSON.stringify(row).length > MSURV_SIGNAL_MAX) return json({ error: 'signal too large', max: MSURV_SIGNAL_MAX }, 413);
			await store.setJSON(SKEY(id, username), row);
			return json({ ok: true });
		}
		if (action === 'msurv-signal-poll') {
			const g = await myLobby();
			if (g.error) return fail(g);
			const msgs = {};
			for (const m of g.lb.members) {
				if (m.name === username) continue;
				const row = await store.get(SKEY(id, m.name));
				const list = row && row.to && Array.isArray(row.to[username]) ? row.to[username].filter(e => e[0] > sinceOf(m.name)) : [];
				if (list.length) msgs[m.name] = list;
			}
			return json({ msgs, members: g.lb.members.map(m => m.name) });
		}

		// ---- relay fallback (no direct connection): one window row per sender, acked by seq ----
		if (action === 'msurv-relay-push' || action === 'msurv-relay-pull') {
			const g = await myLobby();
			if (g.error) return fail(g);
			// the host's daily relay minutes: used up -> refused (pushes AND pulls), until the next UTC day
			if (budgetOut(await budgetOf(g.lb.host))) return json(BUDGET_ERR, 403);
			const pre = 'msurvrelay:' + id + ':';
			const rows = new Map((await store.list(pre)).filter(x => x.key.startsWith(pre)).map(x => [x.key.slice(pre.length), x.value]));
			if (action === 'msurv-relay-push') {
				const mine = rows.get(username);
				if (mine && now - (mine.ts || 0) < MSURV_RELAY_MIN_MS) return json({ error: 'slow down', wait: MSURV_RELAY_MIN_MS - (now - mine.ts) }, 429);
				const w = cleanWindow(g.lb, body.to || {}, MSURV_RELAY_WINDOW, MSURV_RELAY_MSG_MAX);
				if (w.error) return json({ error: w.error, ...(w.max ? { max: w.max } : {}) }, w.status);
				const ack = {};
				for (const [who, s] of Object.entries(body.ack || {})) if (who !== username && member(g.lb, who) && Number.isSafeInteger(s)) ack[who] = s;
				const row = { ts: now, to: w.out, ack };
				if (JSON.stringify(row).length > MSURV_RELAY_MAX) return json({ error: 'relay window too large', max: MSURV_RELAY_MAX }, 413);
				if (!(await spendMinute(g.lb.host))) return json(BUDGET_ERR, 403);
				await store.setJSON(RKEY(id, username), row);
			}
			const msgs = {}, acks = {}, age = {};
			for (const m of g.lb.members) {
				if (m.name === username) continue;
				const row = rows.get(m.name);
				if (!row || now - (row.ts || 0) >= MSURV_RELAY_STALE_MS) continue;
				age[m.name] = now - (row.ts || 0);
				const list = row.to && Array.isArray(row.to[username]) ? row.to[username].filter(e => e[0] > sinceOf(m.name)) : [];
				if (list.length) msgs[m.name] = list;
				if (row.ack && Number.isSafeInteger(row.ack[username])) acks[m.name] = row.ack[username];
			}
			return json({ msgs, acks, age, members: g.lb.members.map(m => m.name), started: !!g.lb.start, relayLeft: relayLeft(await budgetOf(g.lb.host)) });
		}
		return json({ error: 'unknown action' }, 400);
	}

	// a friend reads a MICATRO run's latest view (read-only spectating)
	if (action === 'micatro-state') {
		const who = String(body.username || '').trim().toLowerCase();
		if (!who || !user.friends.includes(who)) return json({ error: 'not your friend' }, 403);
		const ms = await store.get('micatrostate:' + who);
		const now = Date.now();
		if (!ms || now - ms.ts > MICATRO_STALE_MS) return json({ snapshot: null, live: false });
		// the same cap as card spectating; a viewer with a fresh heartbeat always gets back in
		const prefix = 'spec:' + who + ':';
		let mine = 0;
		const watching = [];
		for (const r of await store.list(prefix)) {
			const name = r.key.slice(prefix.length), t = +r.value || 0;
			if (name === username) mine = t;
			if (now - t < SPEC_WINDOW_MS) watching.push(name);
		}
		if (!watching.includes(username) && watching.length >= SPEC_CAP) return json({ snapshot: null, full: true, max: SPEC_CAP }, 403);
		// heartbeat: I'm watching `who` (throttled — a 1s poll needn't be a 1s row write)
		if (now - mine >= SPEC_BEAT_MS) await store.setJSON('spec:' + who + ':' + username, now);
		if (!watching.includes(username)) watching.push(username);
		const watchers = watching.length, watcherNames = watching.slice(0, SPEC_CAP);
		if (body.seq != null && Number(body.seq) === ms.seq) {
			return json({ unchanged: true, seq: ms.seq, room: ms.room, label: ms.label, over: !!ms.over, won: !!ms.won, watchers, watcherNames, ...(ms.replay ? { replay: ms.replay } : {}) });
		}
		return json({ ...ms, watchers, watcherNames });
	}

	// ---------- MICASURVIVOR live spectating + replays (M5 batch 12c; the rows are listed at MSURV_LIVE_BEAT_MS) ----------
	// publish-micasurvivor {run, label, mode, dex, group?, over?, snapshot?}: the player's client calls it every ~10 s
	// WITHOUT a snapshot (a watcher check that only reads, and refreshes the beacon when it is due), and every ~1 s WITH
	// one while someone watches. The snapshot row is written only when a friend's heartbeat is fresh, so an unwatched
	// run writes nothing but its beacon (start, end, every MSURV_LIVE_BEAT_MS).
	if (action === 'publish-micasurvivor') {
		const now = msurvNow();
		const NAME_RE = /^[a-z0-9_.-]{1,40}$/;
		const run = String(body.run || '');
		if (!/^[0-9a-f]{8,16}$/.test(run)) return json({ error: 'bad run id' }, 400);
		const label = String(body.label || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 48).trim();
		const mode = /^[a-z]{1,12}$/.test(String(body.mode)) || MSURV_EXP_MODE_RE.test(String(body.mode)) ? String(body.mode) : 'normal';   // (DLC D0b: 'exp-…' too)
		const dex = Math.max(0, Math.min(2000, Math.floor(+body.dex) || 0));
		const group = Array.isArray(body.group) ? [...new Set(body.group.map(x => String(x).toLowerCase()).filter(x => NAME_RE.test(x)))].slice(0, MSURV_MAX) : [];
		const over = !!body.over;
		const hasSnap = body.snapshot != null;
		if (hasSnap && (typeof body.snapshot !== 'object' || Array.isArray(body.snapshot))) return json({ error: 'bad snapshot' }, 400);
		if (hasSnap && JSON.stringify(body.snapshot).length > MSURV_SNAPSHOT_MAX) return json({ error: 'snapshot too large', max: MSURV_SNAPSHOT_MAX }, 413);
		const friends = Array.isArray(user.friends) ? user.friends : [];
		const wrote = { live: false, state: false };
		// no friends: nobody can watch, so nothing is written (or even scanned)
		if (!friends.length) return json({ ok: true, watchers: 0, watcherNames: [], wrote, every: 0 });
		const prev = await store.get('msurvlive:' + username);
		const same = !!prev && prev.run === run;
		const gk = group.join(',');
		const due = same
			? (over ? !prev.over : !prev.over && (prev.mode !== mode || (prev.group || []).join(',') !== gk || now - (+prev.ts || 0) >= MSURV_LIVE_BEAT_MS))
			: !over;
		if (due) {
			await store.setJSON('msurvlive:' + username, { run, ts: now, since: same ? prev.since || now : now, label, mode, dex, group, over });
			wrote.live = true;
		}
		const ws = (await msurvWatchers(store, username, now)).filter(w => !w.stale && friends.includes(w.name));
		const watcherNames = ws.map(w => w.name).slice(0, SPEC_CAP);
		let slow = false, every = MSURV_STATE_MIN_MS;
		if (hasSnap && watcherNames.length) {
			// the watched minutes today (a UTC minute counts once): past the allowance, one snapshot per 5 s
			const BK = 'msurvspecbudget:' + username + ':' + new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
			const minute = Math.floor(now / 60_000);
			const b = (await store.get(BK)) || { rev: 0, used: 0, last: -1 };
			if (b.last !== minute) {
				if ((b.used || 0) >= MSURV_SPEC_DAILY_MIN) slow = true;
				else await store.setIfRev(BK, { rev: (b.rev || 0) + 1, used: (b.used || 0) + 1, last: minute }, b.rev || 0);
			}
			if (slow) every = MSURV_STATE_SLOW_MS;
			const st = await store.get('msurvstate:' + username);
			if (!over && st && st.run === run && now - (+st.ts || 0) < every) {
				return json({ ok: true, watchers: watcherNames.length, watcherNames, wrote, slow, every, wait: every - (now - st.ts) });
			}
			const seq = Number.isFinite(+body.seq) ? Math.max(0, Math.floor(+body.seq)) : 0;
			await store.setJSON('msurvstate:' + username, { run, seq, ts: now, snap: body.snapshot, label, mode, group, over, watchers: watcherNames.length, watcherNames });
			wrote.state = true;
		}
		return json({ ok: true, watchers: watcherNames.length, watcherNames, wrote, slow, every });
	}

	// a friend reads a MicaSurvivor run's latest snapshot (read-only spectating; both must have each other as friends).
	// Heartbeats msurvspec:<who>:<me> (at most every SPEC_BEAT_MS) only while the run is live.
	if (action === 'micasurvivor-state') {
		const now = msurvNow();
		const who = String(body.username || '').trim().toLowerCase();
		if (!who || who === username || !(user.friends || []).includes(who)) return json({ error: 'not your friend' }, 403);
		const them = await store.get(who);
		if (!them || !Array.isArray(them.friends) || !them.friends.includes(username)) return json({ error: 'not your friend' }, 403);
		const [b, st] = await Promise.all([store.get('msurvlive:' + who), store.get('msurvstate:' + who)]);
		const sameRun = !!b && !!st && st.run === b.run;
		const head = { label: (b && b.label) || '', mode: (b && b.mode) || 'normal', dex: (b && b.dex) || 0, group: (b && b.group) || [], run: (b && b.run) || null };
		const same = body.seq != null && sameRun && Number(body.seq) === st.seq;
		// the run is over: its last snapshot (with the summary) if a watcher saw it end, else just "it ended"
		if (b && b.over) {
			if (sameRun && st.over) return json({ ...head, live: false, over: true, seq: st.seq, ...(same ? { unchanged: true } : { snapshot: st.snap }) });
			return json({ ...head, live: false, over: true, snapshot: null });
		}
		if (!b || now - (+b.ts || 0) >= MSURV_LIVE_TTL_MS) return json({ live: false, snapshot: null });
		const ws = await msurvWatchers(store, who, now);
		const active = ws.filter(w => !w.stale).map(w => w.name);
		if (!active.includes(username) && active.length >= SPEC_CAP) return json({ ...head, live: true, snapshot: null, full: true, max: SPEC_CAP }, 403);
		const mine = ws.find(w => w.name === username);
		if (!mine || now - mine.t >= SPEC_BEAT_MS) await store.setJSON('msurvspec:' + who + ':' + username, now);
		if (!active.includes(username)) active.push(username);
		const watchers = active.length, watcherNames = active.slice(0, SPEC_CAP);
		if (!sameRun || now - (+st.ts || 0) >= MSURV_STATE_STALE_MS) return json({ ...head, live: true, waiting: true, snapshot: null, watchers, watcherNames });
		if (same) return json({ ...head, live: true, unchanged: true, seq: st.seq, over: !!st.over, watchers, watcherNames });
		return json({ ...head, live: true, seq: st.seq, over: !!st.over, snapshot: st.snap, age: now - st.ts, watchers, watcherNames });
	}

	// upload a finished MicaSurvivor run's replay -> its id (the share link /micasurvivor/?replay=<id> or /msr/<id>).
	// {code, meta, rid?}: `rid` is the client's own id for that replay, so a retried upload returns the first id instead
	// of storing it twice. Validates the packed stream (unpacked under a cap): {v:1, h:{...}, f:[frames], ev?:[events]}.
	if (action === 'micasurvivor-replay-put') {
		const now = msurvNow();
		const code = String(body.code || '');
		if (code.length > MSURV_REPLAY_MAX) return json({ error: 'replay too large', max: MSURV_REPLAY_MAX }, 413);
		if (!/^[GR]1\.[A-Za-z0-9_-]+$/.test(code)) return json({ error: 'bad replay' }, 400);
		const rid = /^[0-9a-f]{8,16}$/.test(String(body.rid || '')) ? String(body.rid) : '';
		const IKEY = 'msurvreplays:' + username;
		const idx = (await store.get(IKEY)) || { ids: [] };
		const list = Array.isArray(idx.ids) ? idx.ids.filter(e => e && REPLAY_ID_RE.test(String(e.id))) : [];
		if (rid) { const dup = list.find(e => e.rid === rid); if (dup && (await store.get('msurvreplay:' + dup.id))) return json({ ok: true, id: dup.id, again: true }); }
		const text = await unpackCapped(code, MSURV_REPLAY_UNPACKED);
		let r = null;
		try { r = text ? JSON.parse(text) : null; } catch { r = null; }
		if (!r || typeof r !== 'object' || Array.isArray(r) || r.v !== 1 || !r.h || typeof r.h !== 'object' || Array.isArray(r.h)
			|| !Array.isArray(r.f) || !r.f.length || !r.f.every(x => Array.isArray(x)) || (r.ev != null && !Array.isArray(r.ev))) return json({ error: 'not a run replay' }, 400);
		if (r.f.length > MSURV_REPLAY_FRAMES) return json({ error: 'too many frames', max: MSURV_REPLAY_FRAMES }, 413);
		const meta = { ...cleanMsurvReplayMeta(body.meta), frames: r.f.length };
		let id = null;
		for (let i = 0; i < 8; i++) { id = randomBytes(4).toString('hex'); if (!(await store.get('msurvreplay:' + id))) break; }
		await store.setJSON('msurvreplay:' + id, { code, meta, by: username, when: now });
		const next = [{ id, when: now, ...(rid ? { rid } : {}) }, ...list.filter(e => e.id !== id)];
		const evicted = [];
		for (const e of next.slice(MSURV_REPLAY_PER_USER)) {
			const old = await store.get('msurvreplay:' + e.id);
			if (old && old.by === username) { await store.delete('msurvreplay:' + e.id); evicted.push(e.id); }   // only your own row
		}
		await store.setJSON(IKEY, { ids: next.slice(0, MSURV_REPLAY_PER_USER) });
		return json({ ok: true, id, evicted, max: MSURV_REPLAY_PER_USER });
	}
	// your stored replays (newest first), with their display meta
	if (action === 'micasurvivor-replay-list') {
		const idx = (await store.get('msurvreplays:' + username)) || { ids: [] };
		const out = [];
		for (const e of (Array.isArray(idx.ids) ? idx.ids : []).slice(0, MSURV_REPLAY_PER_USER)) {
			if (!e || !REPLAY_ID_RE.test(String(e.id))) continue;
			const rec = await store.get('msurvreplay:' + e.id);
			if (rec && rec.by === username) out.push({ id: e.id, when: rec.when || e.when || 0, meta: rec.meta || {} });
		}
		return json({ replays: out, max: MSURV_REPLAY_PER_USER });
	}

	// "Live now" hub: which friends are in a watchable game right now, with the mode
	// + live watcher count. Read-only — reading cardstate:<f> here does NOT write a
	// heartbeat, so browsing the hub never counts you as watching anyone.
	if (action === 'live-friends') {
		const now = Date.now();
		const live = [];
		const mnow = msurvNow();
		for (const f of user.friends) {
			// a MicaSurvivor run (M5 batch 12c): its beacon says so, whatever the presence row says (an unwatched
			// solo run writes no presence); the watcher count comes from its snapshot row, when there is one
			const ml = await msurvLiveOf(store, f, mnow);
			if (ml) {
				const ms = await store.get('msurvstate:' + f);
				const w = ms && ms.run === ml.run && mnow - (+ms.ts || 0) < MSURV_STATE_STALE_MS ? ms.watchers || 0 : 0;
				live.push({ username: f, kind: 'micasurvivor', mode: 'micasurvivor', label: ml.label || 'MicaSurvivor', group: ml.group || [], dex: ml.dex || 0, watchers: w, full: w >= SPEC_CAP });
				continue;
			}
			const p = await store.get('presence:' + f);
			if (!p || now - p.lastSeen >= ONLINE_MS) continue;
			const st = p.status || '';
			if (st.startsWith('card:')) {
				const cs = await store.get('cardstate:' + f);
				if (!cs || now - cs.ts >= CARDSTATE_MS) continue; // publishing stopped → not watchable
				live.push({ username: f, kind: 'card', mode: st.slice(5), label: p.region || '', watchers: cs.watchers || 0, full: (cs.watchers || 0) >= SPEC_CAP });
			} else if (st.startsWith('battling:')) {
				live.push({ username: f, kind: 'pokemon', matchId: st.slice('battling:'.length), mode: 'pokemon', label: 'Pokémon battle' });
			} else if (st.startsWith('factory:')) {
				const fs = await store.get('factorystate:' + f);
				if (!fs || now - fs.ts >= CARDSTATE_MS) continue; // publishing stopped → not watchable
				live.push({ username: f, kind: 'factory', mode: 'factory', label: p.region || st.slice('factory:'.length), watchers: fs.watchers || 0, full: (fs.watchers || 0) >= SPEC_CAP });
			} else if (st.startsWith('micatro:')) {
				const ms = await store.get('micatrostate:' + f);
				if (!ms || ms.over || now - ms.ts >= MICATRO_STALE_MS) continue; // finished / stopped publishing
				live.push({ username: f, kind: 'micatro', mode: 'micatro', label: ms.label || p.region || st.slice('micatro:'.length), watchers: ms.watchers || 0, full: (ms.watchers || 0) >= SPEC_CAP });
			}
		}
		return json({ live });
	}

	// ---------- in-battle chat + emotes ----------
	// Rooms: 'm:<matchId>' (card or pokemon match, participants + friend-spectators)
	// or 'u:<username>' (a solo run being spectated: the runner + their friends).
	const EMOTES = new Set(['greetings', 'well_played', 'thanks', 'wow', 'oops', 'threaten', 'laugh', 'clap', 'fire', 'heart', 'cry', 'gg', 'wow2', 'oops2']);
	const CHAT_CAP = 40;
	// a 'spec:<X>' room is the SPECTATOR-ONLY chat for whoever is watching X's game.
	// A spectator = a friend of X who is NOT X and NOT a co-participant in X's live
	// game (so a friend who happens to be X's duel opponent can't read it either).
	const isSpectatorOf = async (X) => {
		if (!X || X === username || !user.friends.includes(X)) return false;
		// Exclude a CO-PARTICIPANT: if the caller is in a live card match that X also
		// plays in, they're a player of X's game, not a spectator. Keyed off the
		// CALLER's own curmatch (set for every human at match start) — robust even when
		// X is the duel guest, who never publishes an `m:` cardstate row to derive from.
		const cur = await store.get('curmatch:' + username);
		if (cur && cur.type === 'card' && cur.id) {
			const cm = await store.get('cardmatch:' + cur.id);
			if (cm && !cm.over) {
				const seats = cm.seats || [{ seat: 0, name: cm.host }, ...(cm.guest ? [{ seat: 1, name: cm.guest }] : [])];
				const humans = cm.humans || seats.filter(s => s.name).map(s => s.name);
				if (humans.includes(X)) return false; // caller and X are in the same live match
			}
		}
		return true;
	};
	// can this user READ the room?
	const dmAllowed = who => who === username || (Array.isArray(user.friends) && user.friends.includes(who)) || isAdmin(username);
	const canChat = async (room) => {
		if (typeof room !== 'string') return false;
		if (room.startsWith('dm:')) return dmAllowed(room.slice(3));
		if (room.startsWith('spec:')) return await isSpectatorOf(room.slice(5)); // spectator-only chat
		if (room.startsWith('u:')) {
			const who = room.slice(2);
			return who === username || user.friends.includes(who);
		}
		if (room.startsWith('m:')) {
			const id = room.slice(2);
			const cm = await store.get('cardmatch:' + id);
			if (cm) return cm.host === username || cm.guest === username
				|| user.friends.includes(cm.host) || user.friends.includes(cm.guest);
			const m = await store.get('match:' + id);
			if (m) return sideOf(m, username) >= 0 || m.sides.some(sd => user.friends.includes(sd.name));
		}
		return false;
	};

	// stricter than canChat: only room PARTICIPANTS may post — friend-SPECTATORS are
	// read-only (they can watch the chat but not talk or emote).
	const canPost = async (room) => {
		if (typeof room !== 'string') return false;
		if (room.startsWith('spec:')) return await isSpectatorOf(room.slice(5)); // spectators post to their own room
		if (room.startsWith('u:')) return room.slice(2) === username; // only the runner posts in their own room
		// dm:<name> is <name>'s DIRECT-MESSAGE inbox (site/topbar.js). DMs used to be
		// posted into the friend's u: room — the runner's live-chat room, which friends
		// may only read — so every DM was refused ("spectators are read-only"). Their
		// own room now: you, a FRIEND (friendship is mutual), or the owner (messages to
		// the playtesters) may post; see canChat/chat-get for who reads what.
		if (room.startsWith('dm:')) return dmAllowed(room.slice(3));
		if (room.startsWith('m:')) {
			const id = room.slice(2);
			const cm = await store.get('cardmatch:' + id);
			if (cm) {
				const seats = cm.seats || [{ seat: 0, name: cm.host }, ...(cm.guest ? [{ seat: 1, name: cm.guest }] : [])];
				const humans = cm.humans || seats.filter(s => s.name).map(s => s.name);
				return humans.includes(username);
			}
			const m = await store.get('match:' + id);
			if (m) return sideOf(m, username) >= 0;
		}
		return false;
	};

	if (action === 'chat-post') {
		const room = String(body.room || '');
		if (!(await canPost(room))) return json({ error: 'spectators are read-only' }, 403);
		const emote = body.emote && EMOTES.has(String(body.emote)) ? String(body.emote) : null;
		const text = emote ? '' : String(body.text || '').slice(0, 140).replace(/[\u0000-\u001f]/g, ' ').trim();
		if (!emote && !text) return json({ error: 'empty message' }, 400);
		const list = (await store.get('chat:' + room)) || [];
		list.push({ from: username, text, emote, ts: Date.now() });
		await store.setJSON('chat:' + room, list.slice(-CHAT_CAP));
		return json({ ok: true });
	}

	if (action === 'chat-get') {
		const room = String(body.room || '');
		if (!(await canChat(room))) return json({ error: 'not in this room' }, 403);
		let list = (await store.get('chat:' + room)) || [];
		// someone else's DM inbox: only the messages YOU sent there (your side of the
		// thread) — never what other people sent them
		if (room.startsWith('dm:') && room.slice(3) !== username) list = list.filter(m => m.from === username);
		const since = +body.since || 0;
		return json({ messages: since ? list.filter(m => m.ts > since) : list.slice(-12), now: Date.now() });
	}

	// ---------- async (correspondence) card matches ----------
	// Play-by-mail 1v1: the match lives server-side and each player takes WHOLE
	// turns whenever they like — no need to be online together. The state of
	// record is the same deterministic engine snapshot live duels publish;
	// client-authoritative like the rest of the test realm. Seat 0 = challenger,
	// seat 1 = accepter (who deals the opening state, having both decks).
	if (action.startsWith('async-')) {
		const AM_MAX_BYTES = 700_000, AM_MAX_PER_USER = 20;
		const amListOf = async name => ((await store.get('amlist:' + name)) || []).filter(x => typeof x === 'string');
		// Pokémon async matches host a REAL server-resolved battle (pvpbattle.js)
		// in `m.pk` instead of a client-published card snapshot: both sides may
		// act at any time and the turn resolves when the second action lands.
		const amWaitingOn = (m, me) => {
			if (m.game !== 'pokemon' || !m.pk || m.pk.over) return m.turn === me;
			const s = m.players.indexOf(me);
			if (s < 0) return false;
			return m.pk.needsSwitch?.[s] ? true : !m.pk.actions?.[s];
		};
		const amSummary = (m, me) => ({
			id: m.id, players: m.players, game: m.game || 'cards',
			status: m.status, turn: m.turn, turnNumber: m.game === 'pokemon' ? (m.pk?.turn || 0) : (m.turnNumber || 0),
			winner: m.winner ?? null, updatedAt: m.updatedAt,
			lines: m.game === 'pokemon' ? (m.pk?.events || []) : (m.lines || []),
			yourTurn: m.status === 'active' && amWaitingOn(m, me),
			yourInvite: m.status === 'invited' && m.players[1] === me,
		});

		// correspondence format: countering is banned — reject a cards deck that
		// carries any banned id (server/correspondence-bans.json, generated)
		const CORR_BAN_SET = new Set(CORR_BANS);
		const corrBanned = party => {
			const deck = party && Array.isArray(party.deck) ? party.deck : [];
			const bad = [...new Set(deck.filter(cid => CORR_BAN_SET.has(cid)))];
			return bad.length ? `deck is not correspondence-legal — countering cards are banned in play-by-mail (${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''})` : null;
		};

		if (action === 'async-create') {
			const to = String(body.to || '').trim().toLowerCase();
			if (!user.friends.includes(to)) return json({ error: 'not your friend' }, 403);
			if (!(await store.get(to))) return json({ error: 'no such player' }, 404);
			const mine = await amListOf(username);
			if (mine.length >= AM_MAX_PER_USER) return json({ error: 'too many async matches — finish or resign some first' }, 400);
			const id = randCode() + randCode();
			const game = body.game === 'pokemon' ? 'pokemon' : 'cards';
			if (game === 'cards') {
				const bad = corrBanned(body.party);
				if (bad) return json({ error: bad }, 400);
			}
			// a pokemon challenge carries the challenger's PARTY (mons), a card
			// challenge their deck; both ride the same `party` field from the lobby
			const m = {
				id, players: [username, to], game, decks: [body.party || null, null],
				status: 'invited', snap: null, pk: null, turn: null, turnNumber: 0, winner: null,
				lines: [], createdAt: Date.now(), updatedAt: Date.now(),
			};
			if (game === 'pokemon' && !Array.isArray(body.party)) return json({ error: 'send a party' }, 400);
			await store.setJSON('amatch:' + id, m);
			await store.setJSON('amlist:' + username, [...mine, id]);
			await store.setJSON('amlist:' + to, [...(await amListOf(to)), id]);
			return json({ ok: true, match: amSummary(m, username) });
		}

		if (action === 'async-list') {
			const ids = await amListOf(username);
			const out = [], live = [];
			for (const mid of ids.slice(-40)) {
				const m = await store.get('amatch:' + mid);
				if (!m) continue;
				live.push(mid);
				out.push(amSummary(m, username));
			}
			if (live.length !== ids.length) await store.setJSON('amlist:' + username, live);
			out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
			return json({ matches: out, yourTurn: out.filter(m => m.yourTurn || m.yourInvite).length });
		}

		const id = String(body.id || '');
		const m = await store.get('amatch:' + id);
		if (!m || !m.players.includes(username)) return json({ error: 'not your match' }, 404);

		if (action === 'async-get') return json({ match: m, you: m.players.indexOf(username) });

		if (action === 'async-accept') {
			if (m.players[1] !== username) return json({ error: 'not your invite' }, 403);
			if (m.status !== 'invited') return json({ error: 'already started' }, 400);
			if (m.game === 'pokemon' && !Array.isArray(body.party)) return json({ error: 'send a party' }, 400);
			if (m.game === 'cards') {
				const bad = corrBanned(body.party);
				if (bad) return json({ error: bad }, 400);
			}
			m.decks[1] = body.party || null;
			m.status = 'active';
			// pokemon: the server builds the authoritative battle right here — no
			// client ever deals or publishes state for it
			if (m.game === 'pokemon') m.pk = createMatch(id, m.players[0], m.decks[0] || [], m.players[1], m.decks[1] || []);
			m.updatedAt = Date.now();
			await store.setJSON('amatch:' + id, m);
			return json({ ok: true, match: m, you: 1 });
		}

		// pokemon: submit this side's action for the current turn. Both players
		// may act whenever; the turn resolves the moment the second one lands.
		if (action === 'async-act') {
			if (m.game !== 'pokemon') return json({ error: 'not a pokemon match' }, 400);
			if (m.status !== 'active' || !m.pk) return json({ error: 'match is not active' }, 400);
			const s = m.players.indexOf(username);
			const act = body.act || {};
			if (m.pk.over) return json({ ok: true, match: m, you: s });
			if (act.kind === 'replace') replaceFainted(m.pk, s, +act.partyIdx);
			else if (act.kind === 'forfeit') {
				m.pk.over = true; m.pk.winner = 1 - s;
				m.pk.events = [`${username} forfeited. ${m.players[1 - s]} wins!`];
				m.pk.seq++;
			} else {
				if (m.pk.needsSwitch?.[s]) return json({ error: 'choose a replacement first' }, 400);
				if (m.pk.actions?.[s]) return json({ error: 'you already moved this turn' }, 400);
				submitAction(m.pk, s, act);
			}
			if (m.pk.over) {
				m.status = 'over';
				m.turn = null;
				m.winner = m.pk.winner == null ? null : m.players[m.pk.winner];
			}
			m.updatedAt = Date.now();
			await store.setJSON('amatch:' + id, m);
			return json({ ok: true, match: m, you: s });
		}

		if (action === 'async-move') {
			if (m.game === 'pokemon') return json({ error: 'pokemon matches use async-act' }, 400);
			if (m.status !== 'active') return json({ error: 'match is not active' }, 400);
			// the opening deal (no snap yet) comes from the accepter's build;
			// after that, only the player to move may publish
			if (m.snap && m.turn !== username) return json({ error: 'not your turn' }, 403);
			if (!m.snap && m.players[1] !== username) return json({ error: 'the accepter deals the opening state' }, 403);
			const snap = body.snap;
			if (!snap || JSON.stringify(snap).length > AM_MAX_BYTES) return json({ error: 'bad snapshot' }, 400);
			const turnTo = String(body.turnTo || '');
			if (!body.over && !m.players.includes(turnTo)) return json({ error: 'bad turnTo' }, 400);
			m.snap = snap;
			m.turnNumber = (m.turnNumber || 0) + 1;
			m.lines = Array.isArray(body.lines) ? body.lines.slice(0, 24).map(l => String(l).slice(0, 220)) : [];
			m.updatedAt = Date.now();
			if (body.over) {
				m.status = 'over';
				m.turn = null;
				m.winner = m.players.includes(String(body.winner)) ? String(body.winner) : null;
			} else m.turn = turnTo;
			await store.setJSON('amatch:' + id, m);
			return json({ ok: true, match: amSummary(m, username) });
		}

		if (action === 'async-resign') {
			if (m.status === 'over') return json({ ok: true, match: amSummary(m, username) });
			// cancelling an un-accepted invite has no loser; resigning a live match does
			m.winner = m.status === 'active' ? m.players.find(q => q !== username) : null;
			if (m.pk && !m.pk.over) {
				m.pk.over = true;
				m.pk.winner = 1 - m.players.indexOf(username);
				m.pk.events = [`${username} forfeited. ${m.winner} wins!`];
				m.pk.seq++;
			}
			m.status = 'over';
			m.turn = null;
			m.updatedAt = Date.now();
			await store.setJSON('amatch:' + id, m);
			return json({ ok: true, match: amSummary(m, username) });
		}

		return json({ error: 'unknown async action' }, 400);
	}

	// ---------- live battles (server-authoritative PvP) ----------
	const CHALLENGE_MS = 60_000, MATCH_MS = 30 * 60_000;

	// send a challenge to a friend (carries your party/deck snapshot)
	if (action === 'challenge') {
		const to = String(body.to || '');
		if (!user.friends.includes(to)) return json({ error: 'not your friend' }, 403);
		const list = ((await store.get('challenge:' + to)) || []).filter(c => Date.now() - c.ts < CHALLENGE_MS && c.from !== username);
		list.push({ from: username, type: String(body.battleType || 'pokemon'), party: body.party || null, ts: Date.now() });
		await store.setJSON('challenge:' + to, list);
		return json({ ok: true });
	}

	// my incoming challenges (fresh only)
	if (action === 'challenges') {
		const list = ((await store.get('challenge:' + username)) || []).filter(c => Date.now() - c.ts < CHALLENGE_MS);
		return json({ challenges: list.map(c => ({ from: c.from, type: c.type })) });
	}

	if (action === 'decline-challenge') {
		const from = String(body.from || '');
		const list = ((await store.get('challenge:' + username)) || []).filter(c => c.from !== from);
		await store.setJSON('challenge:' + username, list);
		return json({ ok: true });
	}

	// accept: build the match, tell the challenger where to find it
	if (action === 'accept-challenge') {
		const from = String(body.from || '');
		const list = (await store.get('challenge:' + username)) || [];
		const ch = list.find(c => c.from === from && Date.now() - c.ts < CHALLENGE_MS);
		if (!ch) return json({ error: 'that challenge expired' }, 404);
		await store.setJSON('challenge:' + username, list.filter(c => c.from !== from));
		const matchId = randCode() + randCode();
		if (ch.type === 'card') {
			// host-authoritative card duel: the challenger (host) runs the real
			// engine as player 0, the accepter (guest) is player 1 and relays
			// intents. This blob is just the config both sides boot from.
			const cm = {
				id: matchId, type: 'card',
				host: from, guest: username,
				hostDeck: (ch.party?.deck) || null, hostClass: (ch.party?.classId) || null,
				hostCommander: (ch.party?.commander) || null, hostCompanion: (ch.party?.companion) || null,
				guestDeck: (body.party?.deck) || null, guestClass: (body.party?.classId) || null,
				guestCommander: (body.party?.commander) || null, guestCompanion: (body.party?.companion) || null,
				over: false, winner: null, createdAt: Date.now(), lastActive: Date.now(),
			};
			await store.setJSON('cardmatch:' + matchId, cm);
			await store.setJSON('ready:' + from, { matchId, type: 'card', ts: Date.now() });
			// remember each player's active match so a refresh can rejoin it
			await store.setJSON('curmatch:' + from, { id: matchId, type: 'card', ts: Date.now() });
			await store.setJSON('curmatch:' + username, { id: matchId, type: 'card', ts: Date.now() });
			return json({ matchId, cardmatch: cm });
		}
		let match;
		if (ch.type === 'pokemon') {
			match = createMatch(matchId, from, ch.party || [], username, body.party || []);
		} else {
			return json({ error: 'only pokemon and card battles are live' }, 400);
		}
		match.lastActive = Date.now();
		await store.setJSON('match:' + matchId, match);
		await store.setJSON('ready:' + from, { matchId, ts: Date.now() });
		await store.setJSON('curmatch:' + from, { id: matchId, type: 'pokemon', ts: Date.now() });
		await store.setJSON('curmatch:' + username, { id: matchId, type: 'pokemon', ts: Date.now() });
		return json({ matchId, match });
	}

	// ---------- player-to-player trade (RuneScape-style offer / lock / confirm) ----------
	// Trade requests reuse the challenge inbox (type 'trade'). A live trade lives in
	// trade:<id> = { a, b, offerA, offerB, acceptA, acceptB, done, cancelled }. Cards and
	// packs are server-authoritative (validated + swapped here); Pokemon and bag items are
	// client-side localStorage, so the final offers are echoed in the blob and each client
	// applies its own half of that swap when it sees done:true.
	// NAMING: the session actions are trade-open (accept the request -> session) and
	// trade-update (post your offer). They were trade-accept/trade-offer, which COLLIDED
	// with the Pokemon mailbox-trade actions dispatched earlier in this file — first
	// match wins, so these handlers were unreachable and the live window always 400'd.
	const emptyOffer = () => ({ cards: {}, packs: 0, pokemon: [], items: [] });
	const tradeSide = (t, u) => t.a === u ? 'A' : t.b === u ? 'B' : null;
	const sanitizeOffer = (o) => ({
		cards: (o && o.cards && typeof o.cards === 'object') ? o.cards : {},
		packs: Math.max(0, (o && o.packs) | 0),
		pokemon: Array.isArray(o && o.pokemon) ? o.pokemon.slice(0, 6) : [],
		items: Array.isArray(o && o.items) ? o.items.slice(0, 20) : [],
	});
	const ownsOffer = (u, o) => {
		if (!u) return false;
		if ((o.packs | 0) > (u.packs || 0)) return false;
		for (const [id, n] of Object.entries(o.cards || {})) if ((u.collection?.[id] || 0) < (n | 0)) return false;
		return true; // Pokemon/items are client-authoritative (test realm)
	};
	const moveCards = (fromU, toU, cards) => {
		for (const [id, n] of Object.entries(cards || {})) {
			fromU.collection[id] = Math.max(0, (fromU.collection[id] || 0) - (n | 0));
			if (!fromU.collection[id]) delete fromU.collection[id];
			toU.collection[id] = Math.min(MAX_OWNED_COPIES, (toU.collection[id] || 0) + (n | 0));
		}
	};

	if (action === 'trade-open') {
		const from = String(body.from || '');
		const list = (await store.get('challenge:' + username)) || [];
		const ch = list.find(c => c.from === from && c.type === 'trade' && Date.now() - c.ts < CHALLENGE_MS);
		if (!ch) return json({ error: 'that trade request expired' }, 404);
		await store.setJSON('challenge:' + username, list.filter(c => !(c.from === from && c.type === 'trade')));
		const tradeId = randCode() + randCode();
		const trade = { id: tradeId, a: from, b: username, offerA: emptyOffer(), offerB: emptyOffer(),
			acceptA: false, acceptB: false, done: false, cancelled: false, createdAt: Date.now(), lastActive: Date.now() };
		await store.setJSON('trade:' + tradeId, trade);
		await store.setJSON('tradeptr:' + from, { id: tradeId, ts: Date.now() });
		await store.setJSON('tradeptr:' + username, { id: tradeId, ts: Date.now() });
		return json({ tradeId, trade });
	}

	// the requester polls this to discover the trade the accepter just opened
	if (action === 'trade-mine') {
		const ptr = await store.get('tradeptr:' + username);
		if (!ptr) return json({ tradeId: null });
		const t = await store.get('trade:' + ptr.id);
		if (!t || t.done || t.cancelled) { await store.delete('tradeptr:' + username); return json({ tradeId: null }); }
		return json({ tradeId: ptr.id });
	}

	if (action === 'trade-poll') {
		const t = await store.get('trade:' + String(body.id || ''));
		if (!t) return json({ gone: true });
		if (!tradeSide(t, username)) return json({ error: 'not your trade' }, 403);
		t.lastActive = Date.now(); await store.setJSON('trade:' + t.id, t);
		return json({ trade: t });
	}

	if (action === 'trade-update') {
		const t = await store.get('trade:' + String(body.id || ''));
		if (!t || t.done || t.cancelled) return json({ error: 'trade closed', closed: true }, 409);
		const side = tradeSide(t, username);
		if (!side) return json({ error: 'not your trade' }, 403);
		t['offer' + side] = sanitizeOffer(body.offer);
		t.acceptA = false; t.acceptB = false; // any change unlocks both, RuneScape-style
		t.lastActive = Date.now();
		await store.setJSON('trade:' + t.id, t);
		return json({ trade: t });
	}

	if (action === 'trade-lock') {
		const t = await store.get('trade:' + String(body.id || ''));
		if (!t || t.done || t.cancelled) return json({ error: 'trade closed', closed: true }, 409);
		const side = tradeSide(t, username);
		if (!side) return json({ error: 'not your trade' }, 403);
		t['accept' + side] = body.accepted !== false;
		if (t.acceptA && t.acceptB) {
			const ua = await store.get(t.a), ub = await store.get(t.b);
			if (!ownsOffer(ua, t.offerA) || !ownsOffer(ub, t.offerB)) {
				t.acceptA = false; t.acceptB = false; t.lastActive = Date.now();
				await store.setJSON('trade:' + t.id, t);
				return json({ trade: t, error: 'an offer is no longer valid' });
			}
			moveCards(ua, ub, t.offerA.cards); moveCards(ub, ua, t.offerB.cards);
			ua.packs = (ua.packs || 0) - (t.offerA.packs | 0) + (t.offerB.packs | 0);
			ub.packs = (ub.packs || 0) - (t.offerB.packs | 0) + (t.offerA.packs | 0);
			await store.setJSON(t.a, ua); await store.setJSON(t.b, ub);
			t.done = true;
			await store.delete('tradeptr:' + t.a); await store.delete('tradeptr:' + t.b);
		}
		t.lastActive = Date.now();
		await store.setJSON('trade:' + t.id, t);
		return json({ trade: t });
	}

	if (action === 'trade-cancel') {
		const t = await store.get('trade:' + String(body.id || ''));
		if (t && tradeSide(t, username) && !t.done) {
			t.cancelled = true; t.lastActive = Date.now();
			await store.setJSON('trade:' + t.id, t);
			await store.delete('tradeptr:' + t.a); await store.delete('tradeptr:' + t.b);
		}
		return json({ ok: true });
	}

	// on boot, a client asks whether it has a battle to rejoin. Lazily clears a
	// pointer to a match that's finished or gone.
	if (action === 'my-current-match') {
		const cur = await store.get('curmatch:' + username);
		if (!cur) return json({ match: null });
		const blob = cur.type === 'card'
			? await store.get('cardmatch:' + cur.id)
			: await store.get('match:' + cur.id);
		if (!blob || blob.over) { await store.setJSON('curmatch:' + username, null); return json({ match: null }); }
		return json({ match: { id: cur.id, type: cur.type } });
	}

	// leave/forfeit the current match (declining a rejoin): hand the opponent the win
	if (action === 'leave-match') {
		const id = String(body.id || ''), type = String(body.type || '');
		if (type === 'card') {
			const cm = await store.get('cardmatch:' + id);
			if (cm && !cm.over && (cm.host === username || cm.guest === username)) {
				cm.over = true; cm.winner = cm.host === username ? 1 : 0; cm.abandoned = true;
				await store.setJSON('cardmatch:' + id, cm);
			}
		} else {
			const m = await store.get('match:' + id);
			const side = m ? sideOf(m, username) : -1;
			if (m && !m.over && side >= 0) {
				m.over = true; m.winner = 1 - side;
				m.events = [`${username} left. ${m.sides[1 - side].name} wins!`]; m.seq++;
				await store.setJSON('match:' + id, m);
			}
		}
		await store.setJSON('curmatch:' + username, null);
		return json({ ok: true });
	}

	// challenger polls for the match created when their challenge is accepted
	if (action === 'my-match') {
		const ready = await store.get('ready:' + username);
		if (ready && Date.now() - ready.ts < CHALLENGE_MS) {
			await store.setJSON('ready:' + username, null);
			return json({ matchId: ready.matchId, type: ready.type || 'pokemon' });
		}
		return json({ matchId: null });
	}

	// ---------- live card duel relay (host-authoritative) ----------
	// config both sides boot from; participants + their friends (spectators) read
	if (action === 'card-match') {
		const cm = await store.get('cardmatch:' + String(body.id || ''));
		if (!cm) return json({ error: 'no such match' }, 404);
		// seats[] is the N-player shape; older/rematch matches only have host/guest
		const seats = cm.seats || [{ seat: 0, name: cm.host }, ...(cm.guest ? [{ seat: 1, name: cm.guest }] : [])];
		const humans = cm.humans || seats.filter(s => s.name).map(s => s.name);
		const mySeat = seats.find(s => s.name === username);
		const isPlayer = !!mySeat;
		if (!isPlayer && !humans.some(h => user.friends.includes(h)))
			return json({ error: 'not allowed to watch' }, 403);
		return json({ cardmatch: cm, role: cm.host === username ? 'host' : isPlayer ? 'guest' : 'spectator', seat: mySeat ? mySeat.seat : null });
	}

	// host publishes the authoritative board; also mirrored to cardstate:<host>
	// so the existing spectation channel can watch a live duel too
	if (action === 'card-publish') {
		const id = String(body.id || '');
		const cm = await store.get('cardmatch:' + id);
		if (!cm) return json({ error: 'no such match' }, 404);
		if (cm.host !== username) return json({ error: 'only the host publishes' }, 403);
		await store.setJSON('alive:' + id + ':host', Date.now()); // publishing proves the host is here
		if (body.over) { cm.over = true; cm.winner = body.winner ?? null; await store.setJSON('cardmatch:' + id, cm); }
		const now = Date.now();
		// aggregate watchers across EVERY participant (spectators may watch the host OR
		// a guest), so both players see everyone watching the game — not just their own
		const seats = cm.seats || [{ seat: 0, name: cm.host }, ...(cm.guest ? [{ seat: 1, name: cm.guest }] : [])];
		const humans = cm.humans || seats.filter(s => s.name).map(s => s.name);
		const watcherNames = (await aggregateWatchers(store, humans, now)).slice(0, SPEC_CAP);
		const watchers = watcherNames.length;
		const payload = { snapshot: body.snapshot || null, mode: 'pvp', label: String(body.label || 'Card Duel').slice(0, 48), room: 'm:' + id, seq: +body.seq || 0, ts: now, stats: body.stats || null, over: !!cm.over, winner: cm.winner ?? null, watchers, watcherNames };
		await store.setJSON('cardmatchstate:' + id, payload);
		await store.setJSON('cardstate:' + username, payload); // spectators
		await store.setJSON('presence:' + username, {
			name: username, map: '', x: 0, y: 0, facing: 'down',
			status: 'card:pvp', region: String(body.label || 'Card Duel'), lastSeen: now,
		});
		return json({ ok: true, watchers, watcherNames });
	}

	// guest/spectator reads the current board
	if (action === 'card-poll') {
		const id = String(body.id || '');
		const cm = await store.get('cardmatch:' + id);
		if (!cm) return json({ error: 'no such match' }, 404);
		const now = Date.now();
		const seats = cm.seats || [{ seat: 0, name: cm.host }, ...(cm.guest ? [{ seat: 1, name: cm.guest }] : [])];
		const mySeat = seats.find(s => s.name === username);
		// authz (same gate as card-match): only a PARTICIPANT or a friend of one may read
		// the board — the match id is not a capability, so a stranger who learns it must not.
		const pollHumans = cm.humans || seats.filter(s => s.name).map(s => s.name);
		if (!mySeat && !pollHumans.some(h => user.friends.includes(h))) return json({ error: 'not allowed to watch' }, 403);
		// a non-host human polling proves its seat is here; only the host runs the
		// engine, so if the host stopped publishing the match is over (1v1: the lone
		// remaining human wins by abandonment; FFA: no winner — nobody can continue)
		if (mySeat && mySeat.seat !== 0 && !cm.over) {
			await store.setJSON('alive:' + id + ':seat' + mySeat.seat, now);
			const hostAlive = await store.get('alive:' + id + ':host');
			if (hostAlive && now - hostAlive > ABANDON_MS) {
				cm.over = true; cm.abandoned = true;
				cm.winner = (cm.size && cm.size > 2) ? null : mySeat.seat;
				await store.setJSON('cardmatch:' + id, cm);
			}
		}
		const cs = await store.get('cardmatchstate:' + id);
		const tail = { over: cm.over, winner: cm.winner, abandoned: !!cm.abandoned, seat: mySeat ? mySeat.seat : null };
		if (!cs || now - cs.ts > CARDSTATE_MS) return json({ snapshot: null, ...tail });
		// DELTA: if the caller already has this seq, skip re-sending the snapshot — but
		// ALWAYS include the tail (over/winner/abandoned) so abandonment is still detected
		if (body.seq != null && +body.seq === (cs.seq | 0)) {
			return json({ unchanged: true, seq: cs.seq, watchers: cs.watchers, watcherNames: cs.watcherNames, ...tail });
		}
		return json({ ...cs, ...tail });
	}

	// rematch lobby on a finished match (1v1 OR N-player FFA): humans opt in with
	// op:'offer'; a deterministic minter (the lowest-original-seat joiner = the new
	// host) mints a fresh cardmatch reusing each rejoined human's seat/deck and
	// backfilling AI for anyone who didn't return, once >=2 have joined AND either
	// everyone present has joined or a short grace has passed. 1v1 is the special
	// case where "everyone present" = both, so it still mints the instant both join.
	if (action === 'duel-rematch') {
		const REMATCH_MS = 120_000;   // a join is valid for this long
		const GRACE_MS = 12_000;      // wait this long for stragglers before AI-backfilling
		const id = String(body.id || ''), op = String(body.op || 'poll');
		const cm = await store.get('cardmatch:' + id);
		if (!cm) return json({ error: 'no such match' }, 404);
		const seats = cm.seats || [{ seat: 0, name: cm.host }, ...(cm.guest ? [{ seat: 1, name: cm.guest }] : [])];
		const humans = cm.humans || seats.filter(s => s.name).map(s => s.name);
		if (!humans.includes(username)) return json({ error: 'not your duel' }, 403);
		const size = cm.size || seats.length || 2;
		const origSeat = n => { const s = seats.find(x => x.name === n); return s ? s.seat : 99; };
		// expire a stale lobby
		if (cm.rematchTs && Date.now() - cm.rematchTs > REMATCH_MS && !cm.rematchMatchId) { cm.rematchJoined = []; }
		let joined = Array.isArray(cm.rematchJoined) ? cm.rematchJoined.filter(n => humans.includes(n)) : [];

		if (op === 'offer' && !cm.rematchMatchId && !joined.includes(username)) {
			if (!joined.length) cm.rematchTs = Date.now();
			joined.push(username);
			cm.rematchJoined = joined;
			await store.setJSON('cardmatch:' + id, cm);
		}

		// mint conditions — evaluated on both offer and poll so the grace timer fires
		const bySeat = [...joined].sort((a, b) => origSeat(a) - origSeat(b)); // new-host first
		const everyonePresent = joined.length >= humans.length;
		const graceUp = cm.rematchTs && Date.now() - cm.rematchTs > GRACE_MS;
		const ready = joined.length >= 2 && (everyonePresent || graceUp);
		const iAmMinter = bySeat[0] === username; // only the new host mints (race-free)

		if (cm.rematchMatchId) return json({ matchId: cm.rematchMatchId, rematchMatchId: cm.rematchMatchId, joined, humans });
		if (ready && iAmMinter) {
			const origByName = {}; for (const s of seats) if (s.name) origByName[s.name] = s;
			const newId = randCode() + randCode();
			const ns = [];
			for (let sidx = 0; sidx < size; sidx++) {
				const hn = bySeat[sidx];
				if (hn) { const o = origByName[hn] || {}; ns.push({ seat: sidx, name: hn, ai: false, deck: o.deck || cm.hostDeck || null, classId: o.classId ?? cm.hostClass ?? null, commander: o.commander || null, companion: o.companion || null }); }
				else { const ai = await pickAiDeck(store, null); ns.push({ seat: sidx, name: null, ai: true, aiName: botName(ai), deck: ai.deck, classId: ai.classId, commander: ai.commander || null, companion: ai.companion || null }); }
			}
			const humanNames = ns.filter(s => !s.ai).map(s => s.name);
			const ncm = {
				id: newId, type: 'card', size, seats: ns, host: ns[0].name, humans: humanNames, guest: humanNames[1] || null,
				hostDeck: ns[0].deck, hostClass: ns[0].classId, hostCommander: ns[0].commander, hostCompanion: ns[0].companion,
				guestDeck: ns[1] ? ns[1].deck : null, guestClass: ns[1] ? ns[1].classId : null, guestCommander: ns[1] ? ns[1].commander : null, guestCompanion: ns[1] ? ns[1].companion : null,
				over: false, winner: null, createdAt: Date.now(), lastActive: Date.now(), rematchOf: id,
			};
			await store.setJSON('cardmatch:' + newId, ncm);
			for (const hn of humanNames) await store.setJSON('curmatch:' + hn, { id: newId, type: 'card', ts: Date.now() });
			cm.rematchMatchId = newId; await store.setJSON('cardmatch:' + id, cm);
			return json({ matchId: newId, rematchMatchId: newId, joined, humans });
		}
		return json({ offered: joined.includes(username), joined, humans, rematchMatchId: null });
	}

	// a guest queues an action intent; the host drains and applies them. The seat
	// is stamped from the sender's identity (a client can't spoof another seat).
	if (action === 'card-act') {
		const id = String(body.id || '');
		const cm = await store.get('cardmatch:' + id);
		if (!cm) return json({ error: 'no such match' }, 404);
		const seats = cm.seats || [{ seat: 0, name: cm.host }, ...(cm.guest ? [{ seat: 1, name: cm.guest }] : [])];
		const mine = seats.find(s => s.name === username);
		if (!mine || mine.seat === 0) return json({ error: 'only a guest relays intents' }, 403);
		// the intent is a small action descriptor — an object, not an array or blob;
		// reject junk and bound the row so a guest can't stuff arbitrary data into KV
		const intent = body.intent;
		if (!intent || typeof intent !== 'object' || Array.isArray(intent) || JSON.stringify(intent).length > INTENT_MAX_BYTES) return json({ error: 'bad intent' }, 400);
		// each intent is its OWN row — a shared list would DROP a move when two guests
		// relay at the same instant (both read the list, both append, last write wins).
		// The key sorts by (seat, client seq) so the host drains each guest's moves in
		// the order it made them, regardless of network reordering.
		const seq = String(Math.max(0, Math.min(999999, parseInt(body.seq, 10) || 0))).padStart(6, '0');
		await store.setJSON(`cardintent:${id}:${mine.seat}_${seq}`, { intent, seat: mine.seat });
		return json({ ok: true });
	}

	// host drains the guests' queued intents (returns seat-tagged + clears them).
	// Aliveness: 1v1 keeps the old "host wins if the guest vanished" (oppGone); an
	// FFA reports any silent human seat as stale so the host auto-pilots it (AI).
	if (action === 'card-drain') {
		const id = String(body.id || '');
		const cm = await store.get('cardmatch:' + id);
		if (!cm) return json({ error: 'no such match' }, 404);
		if (cm.host !== username) return json({ error: 'only the host drains' }, 403);
		const now = Date.now();
		await store.setJSON('alive:' + id + ':host', now); // draining also proves the host is here
		const seats = cm.seats || [{ seat: 0, name: cm.host }, ...(cm.guest ? [{ seat: 1, name: cm.guest }] : [])];
		const twoP = !(cm.size && cm.size > 2);
		let oppGone = false; const staleSeats = [];
		if (!cm.over) {
			for (const s of seats) {
				if (s.seat === 0 || !s.name) continue;
				const a = await store.get('alive:' + id + ':seat' + s.seat);
				if (a && now - a > ABANDON_MS) { if (twoP) { cm.over = true; cm.winner = 0; cm.abandoned = true; oppGone = true; } else staleSeats.push(s.seat); }
			}
			if (oppGone) await store.setJSON('cardmatch:' + id, cm);
		}
		const rows = await store.list(`cardintent:${id}:`); // ordered by key = (seat, seq)
		if (rows.length) await store.deleteKeys(rows.map(r => r.key)); // delete exactly what we drained — a row added meanwhile survives for the next drain
		return json({ intents: rows.map(r => ({ ...(r.value.intent || {}), seat: r.value.seat ?? 1 })), oppGone, staleSeats, over: !!cm.over });
	}

	// poll a match (participants play; friends may spectate)
	if (action === 'match') {
		const id = String(body.id || '');
		const m = await store.get('match:' + id);
		if (!m) return json({ error: 'no such match' }, 404);
		const side = sideOf(m, username);
		if (side < 0) {
			// spectators must be a friend of a participant
			const ok = m.sides.some(sd => user.friends.includes(sd.name));
			if (!ok) return json({ error: 'not allowed to watch' }, 403);
			return json({ match: m, side });
		}
		// participant liveness: polling proves you're here; if the opponent went
		// silent, you win by abandonment
		if (!m.over) {
			const now = Date.now();
			await store.setJSON('alive:' + id + ':' + side, now);
			const opp = await store.get('alive:' + id + ':' + (1 - side));
			if (opp && now - opp > ABANDON_MS) {
				m.over = true; m.winner = side;
				m.events = [`${m.sides[1 - side].name} left the battle. ${m.sides[side].name} wins!`];
				m.seq++; m.lastActive = now;
				await store.setJSON('match:' + id, m);
			}
		}
		return json({ match: m, side });
	}

	// submit an action; the server resolves the turn when both are in
	if (action === 'match-action') {
		const id = String(body.id || '');
		const m = await store.get('match:' + id);
		if (!m) return json({ error: 'no such match' }, 404);
		const side = sideOf(m, username);
		if (side < 0) return json({ error: 'you are not in this match' }, 403);
		if (m.over) return json({ match: m, side });
		const act = body.act || {};
		if (act.kind === 'replace') replaceFainted(m, side, +act.partyIdx);
		else if (act.kind === 'forfeit') { m.over = true; m.winner = 1 - side; m.events = [`${username} forfeited. ${m.sides[1 - side].name} wins!`]; m.seq++; }
		else submitAction(m, side, act);
		m.lastActive = Date.now();
		await store.setJSON('match:' + id, m);
		return json({ match: m, side });
	}

	// grant the caller a full playset of every collectible card (2 of each, 1 of
	// each Legendary). Restricted to the realm owner (isAdmin — MP_ADMINS env).
	if (action === 'grant-all') {
		if (!isAdmin(username)) return json({ error: 'not allowed' }, 403);
		for (const [id, [rarity]] of Object.entries(POOL)) {
			const cap = rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES;
			user.collection[id] = Math.max(user.collection[id] || 0, cap);
		}
		await store.setJSON(username, user);
		return json({ granted: Object.keys(POOL).length, state: publicState(user, username) });
	}

	// ---------- daily quests ----------
	if (action === 'quests') {
		const now = Date.now();
		if (ensureDailyQuests(user, username, now)) await store.setJSON(username, user);
		const resetsInMs = (Math.floor(now / DAY_MS) + 1) * DAY_MS - now;
		return json({ quests: user.quests.list, resetsInMs, streak: streakInfo(user, now) });
	}
	// claim the once-per-day streak reward
	if (action === 'streak-claim') {
		const now = Date.now(), day = Math.floor(now / DAY_MS);
		const st = user.streak || { count: 0, lastClaimDay: -1 };
		if (st.lastClaimDay === day) return json({ error: 'already claimed today', streak: streakInfo(user, now) });
		st.count = st.lastClaimDay === day - 1 ? (st.count || 0) + 1 : 1; // continue, else restart
		st.lastClaimDay = day;
		user.streak = st;
		accruePacks(user, now);
		const reward = streakReward(st.count);
		const add = Math.min(reward, PACK_INBOX_CAP - (user.packInbox || 0));
		user.packInbox = (user.packInbox || 0) + add;
		await store.setJSON(username, user);
		return json({ streak: streakInfo(user, now), reward: add, packInbox: user.packInbox });
	}
	// the game reports the cards you play + match wins here
	if (action === 'quest-event') {
		const now = Date.now();
		let changed = ensureDailyQuests(user, username, now);
		const events = Array.isArray(body.events) ? body.events.slice(0, 80) : [];
		for (const ev of events) if (ev && typeof ev === 'object' && applyQuestEvent(user, ev)) changed = true;
		if (changed) await store.setJSON(username, user);
		return json({ quests: user.quests.list });
	}
	// claim a finished quest — its reward packs drop into the 12h pack inbox
	if (action === 'claim-quest') {
		const now = Date.now();
		ensureDailyQuests(user, username, now);
		const q = user.quests.list.find(x => x.id === String(body.id || ''));
		if (!q) return json({ error: 'no such quest' }, 404);
		if (q.claimed) return json({ error: 'already claimed' }, 400);
		if (q.progress < q.target) return json({ error: 'not finished yet' }, 400);
		q.claimed = true;
		accruePacks(user, now);
		const add = Math.min(q.reward || 1, PACK_INBOX_CAP - (user.packInbox || 0));
		user.packInbox = (user.packInbox || 0) + add;
		await store.setJSON(username, user);
		return json({ quests: user.quests.list, reward: add, packInbox: user.packInbox });
	}

	// ---------- matchmaking ----------
	if (action === 'matchmake-join') {
		const party = body.party || {};
		const err = deckError(party.classId, party.deck, effectiveCollection(user)) || loadoutError(party.classId, party.commander, party.companion);
		if (err) return json({ error: err }, 400);
		const size = Math.max(2, Math.min(8, parseInt(body.size, 10) || 2)); // table size 2-8 (FFA); empty seats fill with AI
		const now = Date.now();
		const q = ((await store.get('mm:queue')) || []).filter(e => e.name !== username && now - (e.poll || e.ts) < MM_STALE_MS);
		q.push({ name: username, party: { deck: party.deck.map(String), classId: party.classId, commander: party.commander || null, companion: party.companion || null }, size, ts: now, poll: now });
		await store.setJSON('mm:queue', q);
		await store.setJSON('mm:matched:' + username, null); // clear any stale pairing
		await harvestDeck(store, party);                     // grow the AI deck pool
		return json({ ok: true });
	}
	if (action === 'matchmake-leave') {
		await store.setJSON('mm:queue', ((await store.get('mm:queue')) || []).filter(e => e.name !== username));
		return json({ ok: true });
	}
	if (action === 'matchmake-poll') {
		const now = Date.now();
		const sizeOf = e => Math.max(2, Math.min(8, e.size || 2));
		// already seated on a previous poll (the minter set this for us)?
		const matched = await store.get('mm:matched:' + username);
		if (matched && now - matched.ts < 60_000) { await store.setJSON('mm:matched:' + username, null); return json({ status: 'matched', matchId: matched.matchId, role: matched.role, seat: matched.seat ?? 1, type: 'card' }); }
		let q = ((await store.get('mm:queue')) || []).filter(e => now - (e.poll || e.ts) < MM_STALE_MS);
		const me = q.find(e => e.name === username);
		if (!me) return json({ status: 'idle' }); // not queued (dropped / never joined)
		me.poll = now;
		const size = sizeOf(me);
		// everyone waiting for the SAME table size, oldest first; the oldest is the
		// sole "minter" (deterministic → no double-mint race). It seats itself at 0
		// (host) and fills the rest with the other waiters, backfilling AI on timeout.
		const cohort = q.filter(e => sizeOf(e) === size).sort((a, b) => (a.ts - b.ts) || (a.name < b.name ? -1 : 1));
		const iAmMinter = cohort[0] && cohort[0].name === username;
		const waited = now - me.ts;
		const full = cohort.length >= size;                 // a full human table is ready
		const backfill = waited > MM_AI_TIMEOUT_MS;          // waited long enough → AI fills empties
		if (iAmMinter && (full || backfill)) {
			const humans = cohort.slice(0, size); // host = humans[0] = me
			const matchId = randCode() + randCode();
			const seats = [];
			for (let s = 0; s < size; s++) {
				const h = humans[s];
				if (h) seats.push({ seat: s, name: h.name, ai: false, deck: h.party.deck, classId: h.party.classId, commander: h.party.commander || null, companion: h.party.companion || null });
				else { const ai = await pickAiDeck(store, me.party); seats.push({ seat: s, name: null, ai: true, aiName: botName(ai), deck: ai.deck, classId: ai.classId, commander: ai.commander || null, companion: ai.companion || null }); }
			}
			const humanNames = seats.filter(x => !x.ai).map(x => x.name);
			const cm = {
				id: matchId, type: 'card', size, seats, host: seats[0].name, humans: humanNames,
				// size-2 compat aliases so the rematch handshake keeps working unchanged
				// (humans fill seats 0..h-1 contiguously, so humanNames[1] is the seat-1 human)
				guest: humanNames[1] || null,
				hostDeck: seats[0].deck, hostClass: seats[0].classId, hostCommander: seats[0].commander, hostCompanion: seats[0].companion,
				guestDeck: seats[1] ? seats[1].deck : null, guestClass: seats[1] ? seats[1].classId : null, guestCommander: seats[1] ? seats[1].commander : null, guestCompanion: seats[1] ? seats[1].companion : null,
				over: false, winner: null, createdAt: now, lastActive: now,
			};
			await store.setJSON('cardmatch:' + matchId, cm);
			for (const x of seats) {
				if (x.ai) continue;
				await store.setJSON('curmatch:' + x.name, { id: matchId, type: 'card', ts: now });
				if (x.name !== username) await store.setJSON('mm:matched:' + x.name, { matchId, role: 'guest', seat: x.seat, ts: now });
			}
			const seated = new Set(humanNames);
			await store.setJSON('mm:queue', q.filter(e => !seated.has(e.name)));
			return json({ status: 'matched', matchId, role: 'host', seat: 0, type: 'card' });
		}
		await store.setJSON('mm:queue', q);
		return json({ status: 'searching', waited, queueSize: cohort.length, size });
	}
	if (action === 'ai-match') {
		const m = await store.get('aimatch:' + String(body.id || ''));
		if (!m || m.human !== username) return json({ error: 'no such match' }, 404);
		return json({ match: m });
	}

	// lightweight timer read (no full collection) for the inbox to poll
	if (action === 'pack-timer') {
		const now = Date.now();
		if (accruePacks(user, now)) await store.setJSON(username, user);
		const week = Math.floor(now / (7 * 86400000));
		return json({ packInbox: user.packInbox || 0, packCap: PACK_INBOX_CAP, packTimerMs: PACK_TIMER_MS, nextPackMs: packEtaMs(user, now), packs: user.packs || 0,
			featuredClaimed: !!(user.featuredClaims && user.featuredClaims[week]) }); // Card of the Week — collected this week? (drives the bell nudge)
	}

	// collect the free packs that have piled up in the 12-hour special inbox
	if (action === 'claim-packs') {
		const now = Date.now();
		accruePacks(user, now);
		const n = user.packInbox || 0;
		if (n <= 0) return json({ error: 'no packs waiting yet', state: publicState(user, username) });
		const full = n >= PACK_INBOX_CAP;
		user.packs = (user.packs || 0) + n;
		user.packInbox = 0;
		if (full) user.packTimerBase = now; // it was paused at the cap — resume from now
		await store.setJSON(username, user);
		return json({ claimed: n, state: publicState(user, username) });
	}

	if (action === 'open-pack') {
		if (user.packs <= 0) return json({ error: 'no unopened packs — finish a dungeon run to earn one' }, 409);
		user.packs -= 1;
		user.stats.packsOpened += 1;
		const cards = rollPack();
		const refunded = addCopies(user, cards);   // duplicates are KEPT, not discarded
		await store.setJSON(username, user);
		return json({ cards, refunded, state: publicState(user, username) });
	}

	// Card of the Week: one free copy per UTC-week. The card is derived SERVER-side
	// from the deployed featured.json (so a tampered client can't swap it for a
	// chosen card), and the per-week key makes the Collect button a genuine
	// once-per-week claim rather than client-trust.
	if (action === 'claim-featured') {
		const week = Math.floor(Date.now() / (7 * 86400000));
		const claims = user.featuredClaims || {};
		if (claims[week]) return json({ error: 'already collected this week', already: true, cardId: claims[week], state: publicState(user, username) });
		let pool = null;
		try {
			const origin = new URL(req.url).origin;
			const r = await fetch(origin + '/battlecards/featured.json', { cf: { cacheTtl: 300 } });
			if (r.ok) pool = (await r.json()).cards;
		} catch {}
		if (!Array.isArray(pool) || !pool.length) return json({ error: "couldn't load this week's card — try again shortly" }, 503);
		const card = pool[week % pool.length];
		if (!card || !card.id) return json({ error: 'no featured card available' }, 503);
		addCopies(user, [card.id]);
		claims[week] = card.id;
		for (const k of Object.keys(claims)) if (+k < week - 26) delete claims[k]; // prune old weeks
		user.featuredClaims = claims;
		await store.setJSON(username, user);
		return json({ ok: true, cardId: card.id, name: card.name, state: publicState(user, username) });
	}

	if (action === 'run-reward') {
		// a WON run (or live duel) pays one pack; a loss/concede records stats but
		// pays nothing — the old win-or-lose payout made start->concede the best
		// pack income in the game (~1 pack/minute vs the 12h drip)
		if (Date.now() - (user.stats.lastReward || 0) < REWARD_COOLDOWN_MS) {
			return json({ error: 'too soon — the last run just paid out', state: publicState(user, username) }, 429);
		}
		const won = body.result === 'win';
		if (won) user.packs += 1;
		// per-mode counters (for achievements); 'pvp' = live duels, which don't
		// count toward the run totals the profile's run achievements read
		const mode = String(body.mode || '').replace(/[^a-z]/g, '').slice(0, 12);
		if (mode !== 'pvp') {
			user.stats.runs += 1;
			if (won) user.stats.wins += 1;
		}
		if (['dungeon', 'heist', 'tombs', 'duels', 'arena', 'lorequest', 'middleearth', 'swordcoast', 'finalfantasy', 'multiverse', 'pvp'].includes(mode)) {
			user.stats.modes = user.stats.modes || {};
			const ms = user.stats.modes[mode] = user.stats.modes[mode] || { runs: 0, wins: 0 };
			ms.runs += 1;
			if (won) ms.wins += 1;
			// per-character run record — drives the character-unlock feats
			// ("win 2 runs in a row as X"). streak = consecutive WINS with that
			// character; best = the high-water mark the unlock checks read.
			const ch = [...String(body.character || '')].filter(c => c.charCodeAt(0) >= 32).join('').slice(0, 40).trim();
			if (ch && mode !== 'pvp') {
				user.stats.chars = user.stats.chars || {};
				const key = mode + '|' + ch;
				const cs = user.stats.chars[key] = user.stats.chars[key] || { runs: 0, wins: 0, streak: 0, best: 0 };
				cs.runs += 1;
				if (won) { cs.wins += 1; cs.streak += 1; cs.best = Math.max(cs.best, cs.streak); }
				else cs.streak = 0;
			}
		}
		user.stats.lastReward = Date.now();
		await store.setJSON(username, user);
		return json({ won, state: publicState(user, username) });
	}

	if (action === 'save-deck') {
		const classId = String(body.classId || '');
		const cards = body.deck || body.cards;
		const name = (String(body.name || '').trim() || classId || 'Deck').slice(0, 40);
		const commander = body.commander ? String(body.commander) : null;
		const companion = body.companion ? String(body.companion) : null;
		const err = deckError(classId, cards, effectiveCollection(user)) || loadoutError(classId, commander, companion);
		if (err) return json({ error: err }, 400);
		if (!Array.isArray(user.decks)) user.decks = [];
		const id = String(body.id || '');
		const slot = id && user.decks.find(d => d.id === id);
		if (slot) {
			slot.name = name; slot.classId = classId; slot.cards = cards.map(String); slot.commander = commander; slot.companion = companion;
		} else {
			if (user.decks.length >= MAX_DECK_SLOTS) return json({ error: `all ${MAX_DECK_SLOTS} deck slots are full — delete one first` }, 400);
			user.decks.push({ id: newDeckId(), name, classId, cards: cards.map(String), commander, companion });
		}
		await store.setJSON(username, user);
		return json({ state: publicState(user, username) });
	}

	if (action === 'delete-deck') {
		const id = String(body.id || '');
		if (Array.isArray(user.decks)) user.decks = user.decks.filter(d => d.id !== id);
		await store.setJSON(username, user);
		return json({ state: publicState(user, username) });
	}

	// the Pokemon overworld pushes a small progression summary here so the profile
	// achievements page (which reads the account state) can surface gym/champion/
	// Frontier/legendary milestones. Validated + clamped; stored on user.stats.overworld.
	if (action === 'overworld-sync') {
		const ow = body.ow && typeof body.ow === 'object' ? body.ow : {};
		const numMap = (o, max) => { const r = {}; if (o && typeof o === 'object') for (const k of Object.keys(o).slice(0, 8)) r[String(k).slice(0, 16)] = Math.max(0, Math.min(max, o[k] | 0)); return r; };
		const boolMap = (o) => { const r = {}; if (o && typeof o === 'object') for (const k of Object.keys(o).slice(0, 8)) r[String(k).slice(0, 16)] = !!o[k]; return r; };
		const strMap = (o) => { const r = {}; if (o && typeof o === 'object') for (const k of Object.keys(o).slice(0, 8)) r[String(k).slice(0, 16)] = String(o[k]).slice(0, 8); return r; };
		const strArr = (a, n, len) => Array.isArray(a) ? a.slice(0, n).map(s => String(s).slice(0, len)) : [];
		if (!user.stats || typeof user.stats !== 'object') user.stats = {};
		user.stats.overworld = {
			badges: numMap(ow.badges, 8),
			champ: boolMap(ow.champ),
			symbols: strMap(ow.symbols),
			legends: strArr(ow.legends, 40, 20),
			villains: strArr(ow.villains, 20, 32),
			beatRed: !!ow.beatRed,
			awakening: !!ow.awakening,
			grandChampion: !!ow.grandChampion,
			dexCaught: Math.max(0, Math.min(3000, ow.dexCaught | 0)),
			bp: Math.max(0, Math.min(999999, ow.bp | 0)),
			bestStreak: Math.max(0, Math.min(9999, ow.bestStreak | 0)),
		};
		await store.setJSON(username, user);
		return json({ ok: true });
	}

	// ---- authoritative run state: the server owns the run so it's consistent across devices ----
	if (action === 'run-save') {
		const key = String(body.key || '');
		if (!RUN_KEYS.has(key)) return json({ error: 'bad run key' }, 400);
		const run = body.run;
		if (!run || typeof run !== 'object' || Array.isArray(run)) return json({ error: 'bad run' }, 400);
		if (JSON.stringify(run).length > RUN_MAX_BYTES) return json({ error: 'run too large' }, 413);
		const entry = JSON.stringify({ run, updated_at: Date.now() });
		const runId = run.runId ? String(run.runId) : null;   // legacy runs (no id) write unguarded, as before
		const written = await store.setRunEntry('run:' + username, key, entry, runId, Number(run.rev) || 0);
		if (written) return json({ ok: true });
		// Refused: say WHY, so the client can act instead of playing on unsaved. `ended`:
		// this run is over (its slot holds the run-clear marker) — a local copy is a zombie
		// whose removal the browser lost. Otherwise the server holds a newer revision
		// (`rev`), i.e. another tab or device moved the run on. (Read only on refusal.)
		const cur = ((await store.get('run:' + username)) || {})[key] || null;
		return json({ ok: false, stale: true, ended: !!(cur && cur.ended && runId && String(cur.ended) === runId), rev: cur && cur.run ? (Number(cur.run.rev) || 0) : null });
	}
	if (action === 'run-load') {
		return json({ runs: (await store.get('run:' + username)) || {} });
	}
	if (action === 'run-clear') {
		const key = String(body.key || '');
		const runId = body.runId ? String(body.runId) : '';
		if (key && runId) {
			if (!RUN_KEYS.has(key)) return json({ error: 'bad run key' }, 400);
			await store.endRunEntry('run:' + username, key, runId);
			return json({ ok: true });
		}
		const doc = (await store.get('run:' + username)) || {};
		if (key) delete doc[key]; else for (const k of Object.keys(doc)) delete doc[k];
		await store.setJSON('run:' + username, doc);
		return json({ ok: true });
	}
	// ---- authoritative overworld state: the whole overworld save, keyed strings ----
	if (action === 'ow-save') {
		const ow = body.ow;
		if (!ow || typeof ow !== 'object' || Array.isArray(ow)) return json({ error: 'bad ow' }, 400);
		if (JSON.stringify(ow).length > OW_MAX_BYTES) return json({ error: 'ow too large' }, 413);
		// REVISION GUARD: a client that has been offline, or is simply older, must
		// not be able to write its stale game over a newer one. The revision lives
		// inside the blob (magepunk_ow_rev) so it travels with the save; absent
		// reads as 0, which is what every pre-revision save looks like, so this is
		// a no-op for them. `force` is the explicit user-initiated replace — a file
		// import or a backup restore, which are meant to outrank what is stored.
		{
			const revOf = b => Math.max(0, parseInt(b && b['magepunk_ow_rev'], 10) || 0);
			// does this blob hold an actual game? Absence-detection only — never used
			// to rank two real saves. See owGameWeight in overworld/main.js.
			const weigh = b => {
				let w = 0;
				const arr = k => { try { const v = JSON.parse((b && b[k]) || 'null'); return Array.isArray(v) ? v.length : 0; } catch (e) { return 0; } };
				if (arr('magepunk_party_v1') > 0) w++;
				if (arr('magepunk_box_v1') > 0) w++;
				if (b && b['magepunk_region']) w++;
				try { const x = JSON.parse((b && b['magepunk_badges_v1']) || 'null'); if (x && Object.keys(x).length) w++; } catch (e) {}
				return w;
			};
			const cur = await store.get('ow:' + username);
			const storedRev = cur && cur.ow ? revOf(cur.ow) : 0;
			const incomingRev = revOf(ow);
			if (!body.force && cur && cur.ow && incomingRev < storedRev) {
				return json({ error: 'stale revision', conflict: true, rev: storedRev }, 409);
			}
			// BACKSTOP: a write carrying no game may never replace one that does,
			// whatever revision it claims. A buggy or half-initialised client blanking
			// a real save is the one failure this store must not be able to commit.
			// `force` still allows the deliberate wipe (owreset) and restore paths.
			if (!body.force && cur && cur.ow && weigh(cur.ow) > 0 && weigh(ow) === 0) {
				return json({ error: 'refusing to overwrite a populated save with an empty one', conflict: true, rev: storedRev }, 409);
			}
		}
		// The daily safety net: the FIRST save of each UTC day stashes the blob the
		// day started with (the PREVIOUS stored value, not the incoming one), so
		// "yesterday's game" is always recoverable. Only date-shaped keys are
		// pruned — the UNDO slot written by ow-restore is never aged out. A backup
		// failure must never block the save itself.
		try {
			// This block used to run its reads on EVERY save. The backup itself is
			// once-a-day, so gate the whole thing on the stored record already being
			// from an earlier UTC day — the common case (a save later the same day)
			// now costs one read instead of three plus a list.
			const prev = await store.get('ow:' + username);
			const today = new Date().toISOString().slice(0, 10);
			const prevDay = prev && prev.updated_at ? new Date(prev.updated_at).toISOString().slice(0, 10) : null;
			if (prev && prev.ow && Object.keys(prev.ow).length && prevDay !== today) {
				const day = prevDay || today;
				const hk = 'owh:' + username + ':' + day;
				if (!(await store.get(hk))) {
					await store.setJSON(hk, { ow: prev.ow, updated_at: prev.updated_at || Date.now() });
					const dailies = (await store.list('owh:' + username + ':')).filter(r => /\d{4}-\d{2}-\d{2}$/.test(r.key));
					if (dailies.length > OW_HISTORY_KEEP) {
						await store.deleteKeys(dailies.slice(0, dailies.length - OW_HISTORY_KEEP).map(r => r.key));
					}
				}
			}
		} catch (e) {}
		// A FORCED write (a file import, a reset) replaces whatever is stored
		// regardless of revision, so the stored game goes into the UNDO slot first,
		// the same net ow-restore uses: OPTIONS > SERVER BACKUPS > UNDO brings it
		// back. If that stash cannot be written, the replace does not happen.
		if (body.force) {
			try {
				const cur = await store.get('ow:' + username);
				if (cur && cur.ow && Object.keys(cur.ow).length) await store.setJSON('owh:' + username + ':undo', cur);
			} catch (e) {
				return json({ error: 'could not back up the stored save before replacing it; nothing changed' }, 503);
			}
		}
		// the write re-checks the revision atomically (the guard above read it
		// earlier, and another in-flight save may have landed since); a forced
		// write is the deliberate replace and skips it. `rev` echoes what is now
		// stored, so the client acks exactly the revision the server holds.
		const incomingRev = Math.max(0, parseInt(ow['magepunk_ow_rev'], 10) || 0);
		if (body.force) await store.setJSON('ow:' + username, { ow, updated_at: Date.now() });
		else if (!(await store.setOwIfNotNewer('ow:' + username, { ow, updated_at: Date.now() }, incomingRev))) {
			const now = await store.get('ow:' + username);
			const storedRev = Math.max(0, parseInt(now && now.ow && now.ow['magepunk_ow_rev'], 10) || 0);
			return json({ error: 'stale revision', conflict: true, rev: storedRev }, 409);
		}
		return json({ ok: true, rev: incomingRev });
	}
	if (action === 'ow-load') {
		return json({ ow: (await store.get('ow:' + username)) || null });
	}
	// the automatic backups, newest first (the UNDO slot leads when present)
	if (action === 'ow-history') {
		const prefix = 'owh:' + username + ':';
		const rows = await store.list(prefix);
		const backups = rows.map(r => ({
			slot: r.key.slice(prefix.length),
			updated_at: r.value?.updated_at || 0,
			bytes: JSON.stringify(r.value?.ow || {}).length,
		})).reverse(); // keys ascend by date with 'undo' last → reversed, undo then newest→oldest
		return json({ backups });
	}
	// restore one backup into the live slot. The game being replaced goes into
	// the UNDO slot first, so a restore is always itself reversible.
	if (action === 'ow-restore') {
		const slot = String(body.slot || '');
		if (!/^(\d{4}-\d{2}-\d{2}|undo)$/.test(slot)) return json({ error: 'bad slot' }, 400);
		const snap = await store.get('owh:' + username + ':' + slot);
		if (!snap || !snap.ow) return json({ error: 'no such backup' }, 404);
		const cur = await store.get('ow:' + username);
		if (cur && cur.ow) await store.setJSON('owh:' + username + ':undo', cur);
		await store.setJSON('ow:' + username, { ow: snap.ow, updated_at: Date.now() });
		return json({ ok: true, ow: snap.ow });
	}

	return json({ error: 'unknown action' }, 400);
}
