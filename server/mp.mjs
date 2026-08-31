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
const REPLAY_MAX_BYTES = 800_000;   // a shared replay tape (gzipped + base64url) — generous but bounded, well under MAX_BODY_BYTES
const SPEC_WINDOW_MS = 12_000;      // a spectator seen (polled) within this long is counted as actively watching
const SPEC_CAP = 10;                // max concurrent spectators per GAME (aggregated across a duel's participants)
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
	// async (correspondence) matches: whole turns, not per-action traffic
	'async-create': [10, 60_000], 'async-move': [30, 60_000], 'async-act': [60, 60_000],
};
const HIT_LIMIT = [240, 60_000];    // per-IP analytics beacon
const ERR_LIMIT = [120, 60_000];    // per-IP error beacon
const RGET_LIMIT = [120, 60_000];   // per-IP public replay fetch
const TGET_LIMIT = [60, 60_000];    // per-IP public tuning fetch (2 per game boot)
const AFETCH_LIMIT = [40, 60_000];  // per-IP public override-image fetch (1 per overridden card per boot)
const ART_OVERRIDE_MAX = 500_000;   // one re-encoded 768px jpeg as a data URL
const ART_OVERRIDE_SLOTS = 20;      // bounded: fold into the repo before saving more

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
	['cardstate:', 6 * HR], ['trade:', 6 * HR], ['tradeptr:', 6 * HR], ['curmatch:', 6 * HR], ['ready:', 6 * HR], ['challenge:', 6 * HR],
	['cardmatch:', 12 * HR], ['chat:', 12 * HR], ['presence:', 24 * HR],
	['replay:', 30 * 24 * HR], // shared replay tapes expire a month after upload (the owner keeps a local copy)
	['amatch:', 30 * 24 * HR], // an async match untouched for a month is abandoned
	['amlist:', 60 * 24 * HR], // per-user async index; self-heals against missing matches on read
	['spec:', 1 * HR], // spectator heartbeats (spec:<runner>:<viewer>) — short-lived
];

// ---------- authoritative single-player state (durable, server-owned) ----------
// Run progress + overworld (starter/region/position) live under dedicated durable keys (run:<user>,
// ow:<user>) — NOT in GC_TABLE, so never swept — so a logged-in player gets the same, current state on
// any device/browser instead of whatever a possibly-stale localStorage cache holds. Kept off the user
// row so the account blob stays small; each carries `updated_at` for last-write-wins reconciliation.
const RUN_KEYS = new Set(['magepunk_dungeon_v1', 'magepunk_heist_v1', 'magepunk_tombs_v1', 'magepunk_duels_v1', 'magepunk_arena_v1', 'magepunk_lorequest_v1', 'magepunk_middleearth_v1']);
const RUN_MAX_BYTES = 700_000; // a run may carry a mid-fight snapshot (both hands/board/deck order)
const OW_MAX_BYTES = 400_000;

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
		delete: async (k) => {
			await db.prepare('DELETE FROM mp_store WHERE key = ?').bind(k).run();
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
async function rateLimit(store, bucket, limit, windowMs) {
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
	if (action === 'stats') {
		const n = Math.max(1, Math.min(31, parseInt(body.days, 10) || 7));
		const now = Date.now(), days = [];
		for (let i = 0; i < n; i++) {
			const day = new Date(now - i * 86400000).toISOString().slice(0, 10);
			const doc = await store.get('stat:' + day);
			if (doc) days.push({ date: day, counts: doc });
		}
		return json({ days });
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
	if (action === 'errors') {
		const n = Math.max(1, Math.min(31, parseInt(body.days, 10) || 7));
		const now = Date.now(), days = [];
		for (let i = 0; i < n; i++) {
			const day = new Date(now - i * 86400000).toISOString().slice(0, 10);
			const doc = await store.get('err:' + day);
			if (doc) days.push({ date: day, errors: doc });
		}
		return json({ days });
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

	// ---------- owner to-do inbox (Design Wiki "New Version" notes) ----------
	// Every card page on the wiki shows the owner a note box; submissions land
	// here as a single JSON list (key 'owner_todo', newest last) that a dev
	// session later reads and clears ("check the internal to do list" — also
	// readable directly via `wrangler d1 execute magepunk-users`). Owner-only:
	// the username comes from the verified token above, not the client.
	// owner save from the live tuners: stores the full tuning map as a server
	// override (public via tuning-get above). kind: 'art' | 'sprite'.
	if (action === 'tuning-save') {
		if (username !== 'mgibbie') return json({ error: 'owner only' }, 403);
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
		if (username !== 'mgibbie') return json({ error: 'owner only' }, 403);
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
		if (username !== 'mgibbie') return json({ error: 'owner only' }, 403);
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

	// ---------- gifts ----------
	// A player's bag lives in THEIR localStorage (magepunk_bag_v1) and is not in
	// OW_KEYS, so nothing here can write items into an account directly. A gift
	// is therefore a message the recipient's own client claims and applies: the
	// server only ever holds the promise of the items, never the inventory.
	// Owner-only to send; anyone may list/claim their own.
	if (action === 'gift-send') {
		if (username !== 'mgibbie') return json({ error: 'owner only' }, 403);
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
			if (!Number.isInteger(c) || c < 1 || c > 999) return json({ error: 'item counts are 1-999' }, 400);
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
		const mode = String(body.mode || '');
		if (!['duels', 'lorequest', 'middleearth', 'swordcoast', 'finalfantasy', 'multiverse'].includes(mode)) {
			return json({ error: 'no board for that mode' }, 400);
		}
		const key = 'runboard:' + mode;
		user.runBest = user.runBest || {};
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
		return json({ top: board.slice(0, 50), you: user.runBest[mode] ? { ...user.runBest[mode], rank: rank || null } : null });
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
		for (let i = 0; i < 8; i++) { id = randomBytes(6).toString('hex'); if (!(await store.get('replay:' + id))) break; }
		await store.setJSON('replay:' + id, { code, by: username, when: Date.now() });
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
		const list = await Promise.all(user.friends.map(async (f) => {
			const [fu, p] = await Promise.all([store.get(f), store.get('presence:' + f)]);
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

	// "Live now" hub: which friends are in a watchable game right now, with the mode
	// + live watcher count. Read-only — reading cardstate:<f> here does NOT write a
	// heartbeat, so browsing the hub never counts you as watching anyone.
	if (action === 'live-friends') {
		const now = Date.now();
		const live = [];
		for (const f of user.friends) {
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
	const canChat = async (room) => {
		if (typeof room !== 'string') return false;
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
		const list = (await store.get('chat:' + room)) || [];
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

		if (action === 'async-create') {
			const to = String(body.to || '').trim().toLowerCase();
			if (!user.friends.includes(to)) return json({ error: 'not your friend' }, 403);
			if (!(await store.get(to))) return json({ error: 'no such player' }, 404);
			const mine = await amListOf(username);
			if (mine.length >= AM_MAX_PER_USER) return json({ error: 'too many async matches — finish or resign some first' }, 400);
			const id = randCode() + randCode();
			const game = body.game === 'pokemon' ? 'pokemon' : 'cards';
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

	if (action === 'trade-accept') {
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

	if (action === 'trade-offer') {
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
	// each Legendary). Restricted to the realm owner — override the allowlist with
	// MP_ADMINS (comma-separated usernames) in wrangler.jsonc / the Cloudflare
	// Pages env if it ever changes.
	if (action === 'grant-all') {
		const admins = (process.env.MP_ADMINS || 'mgibbie').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
		if (!admins.includes(username)) return json({ error: 'not allowed' }, 403);
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
		const doc = (await store.get('run:' + username)) || {};
		doc[key] = { run, updated_at: Date.now() };
		await store.setJSON('run:' + username, doc);
		return json({ ok: true });
	}
	if (action === 'run-load') {
		return json({ runs: (await store.get('run:' + username)) || {} });
	}
	if (action === 'run-clear') {
		const key = String(body.key || '');
		const doc = (await store.get('run:' + username)) || {};
		if (key) delete doc[key]; else for (const k of Object.keys(doc)) delete doc[k];
		await store.setJSON('run:' + username, doc);
		return json({ ok: true });
	}
	// ---- authoritative overworld state: starter (party), region, position, boxes ----
	if (action === 'ow-save') {
		const ow = body.ow;
		if (!ow || typeof ow !== 'object' || Array.isArray(ow)) return json({ error: 'bad ow' }, 400);
		if (JSON.stringify(ow).length > OW_MAX_BYTES) return json({ error: 'ow too large' }, 413);
		await store.setJSON('ow:' + username, { ow, updated_at: Date.now() });
		return json({ ok: true });
	}
	if (action === 'ow-load') {
		return json({ ow: (await store.get('ow:' + username)) || null });
	}

	return json({ error: 'unknown action' }, 400);
}
