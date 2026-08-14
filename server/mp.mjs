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
import { createMatch, submitAction, replaceFainted, sideOf } from '../battlecards/pvpbattle.js';
import POOL from './pool-rarity.json';
import LOADOUTS from './loadout-cards.json'; // { id: { kind:'commander'|'companion', cls } }

const SECRET = process.env.MP_SECRET || 'magepunk-dev-secret-set-MP_SECRET';
const TOKEN_DAYS = 30;
const PACK_SIZE = 5;
const DECK_SIZE = 40;               // PvP constructed decks are 40 cards (dungeon decks are separate)
const MAX_COPIES = 2;
const MAX_LEGENDARY_COPIES = 1;
const MAX_DECK_SLOTS = 40;          // each player can save up to 40 PvP decks
const REWARD_COOLDOWN_MS = 60_000;  // one run reward a minute tops
const PACK_TIMER_MS = 12 * 60 * 60 * 1000; // a free pack drops every 12 hours
const PACK_INBOX_CAP = 120;         // the special pack inbox holds up to 120 packs

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
const starterSlots = () => STARTER_SLOT_DEFS.map(d => ({ id: newDeckId(), name: d.name, classId: d.classId, cards: [...d.cards] }));
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
	};
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
	const col = {};
	for (const deck of Object.values(STARTER_DECKS)) {
		for (const id of deck) {
			const rarity = POOL[id]?.[0];
			col[id] = rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES;
		}
	}
	// plus every card the ready-made 40-card PvP starters use, so the decks we
	// hand out are always legal to play
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

function deckError(classId, deck, collection) {
	if (!STARTER_DECKS[classId]) return 'unknown class';
	if (!Array.isArray(deck) || deck.length !== DECK_SIZE) return `deck must be exactly ${DECK_SIZE} cards`;
	const counts = {};
	for (const id of deck) {
		const info = POOL[id];
		if (!info) return `not a collectible card: ${id}`;
		const [rarity, cardClass] = info;
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
	friendCode: u.friendCode || null,
	friends: u.friends || [],
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
	let body;
	try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
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
		const decks = starterSlots(); // ready 40-card Mage / Warrior / Hunter decks
		const user = {
			salt, hash, created: Date.now(),
			collection,
			decks,                  // three ready starter decks; up to 40 slots
			decksMigrated: true,
			packs: STARTER_PACKS, // a stack of welcome packs to build a collection from
			packInbox: 0,
			packTimerBase: Date.now(), // the 12-hour free-pack timer starts now
			starterBaselineV2: true,
			startersV3: true,
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

	// everything below requires a valid token
	const username = verifyToken((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
	if (!username) return json({ error: 'not logged in' }, 401);
	const user = await store.get(username);
	if (!user) return json({ error: 'account gone' }, 401);
	await ensureFriendFields(store, username, user); // backfill code/friends
	await normalizeDecks(store, username, user); // migrate to 40 PvP deck slots + seed a Mage Starter
	await grantStarterBaseline(store, username, user); // starter-deck playset + welcome packs (once)
	if (accruePacks(user, Date.now())) await store.setJSON(username, user); // drip the 12h free packs into the inbox

	if (action === 'state') return json({ state: publicState(user, username) });

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
			map: String(body.map || ''), x: +body.x || 0, y: +body.y || 0,
			facing: String(body.facing || 'down'),
			status: String(body.status || 'roaming'),
			region: String(body.region || ''),
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
		await store.setJSON('cardstate:' + username, {
			snapshot: body.snapshot || null,
			mode: String(body.mode || 'battle'),
			label: String(body.label || ''),
			room: 'u:' + username, // spectators join the runner's chat room
			seq: +body.seq || 0,
			ts: Date.now(),
		});
		await store.setJSON('presence:' + username, {
			name: username, map: '', x: 0, y: 0, facing: 'down',
			status: 'card:' + String(body.mode || 'battle'),
			region: String(body.label || ''),
			lastSeen: Date.now(),
		});
		return json({ ok: true });
	}

	// a friend reads the latest snapshot to render read-only
	if (action === 'cardstate') {
		const who = String(body.username || '');
		if (!user.friends.includes(who)) return json({ error: 'not your friend' }, 403);
		const cs = await store.get('cardstate:' + who);
		if (!cs || Date.now() - cs.ts > CARDSTATE_MS) return json({ snapshot: null });
		return json(cs);
	}

	// ---------- in-battle chat + emotes ----------
	// Rooms: 'm:<matchId>' (card or pokemon match, participants + friend-spectators)
	// or 'u:<username>' (a solo run being spectated: the runner + their friends).
	const EMOTES = new Set(['greetings', 'well_played', 'thanks', 'wow', 'oops', 'threaten', 'laugh', 'gg', 'wow2', 'oops2']);
	const CHAT_CAP = 40;
	// can this user read/post in the room?
	const canChat = async (room) => {
		if (typeof room !== 'string') return false;
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

	if (action === 'chat-post') {
		const room = String(body.room || '');
		if (!(await canChat(room))) return json({ error: 'not in this room' }, 403);
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
			toU.collection[id] = (toU.collection[id] || 0) + (n | 0);
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
		const payload = { snapshot: body.snapshot || null, mode: 'pvp', label: String(body.label || 'Card Duel'), room: 'm:' + id, seq: +body.seq || 0, ts: Date.now(), stats: body.stats || null };
		await store.setJSON('cardmatchstate:' + id, payload);
		await store.setJSON('cardstate:' + username, payload); // spectators
		await store.setJSON('presence:' + username, {
			name: username, map: '', x: 0, y: 0, facing: 'down',
			status: 'card:pvp', region: String(body.label || 'Card Duel'), lastSeen: Date.now(),
		});
		return json({ ok: true });
	}

	// guest/spectator reads the current board
	if (action === 'card-poll') {
		const id = String(body.id || '');
		const cm = await store.get('cardmatch:' + id);
		if (!cm) return json({ error: 'no such match' }, 404);
		const now = Date.now();
		const seats = cm.seats || [{ seat: 0, name: cm.host }, ...(cm.guest ? [{ seat: 1, name: cm.guest }] : [])];
		const mySeat = seats.find(s => s.name === username);
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
		return json({ ...cs, ...tail });
	}

	// rematch handshake on a finished duel: either player offers; when the OTHER
	// player offers (or accepts) the handshake completes and a fresh cardmatch is
	// minted reusing both decks. Both sides learn the new id via op:'poll'.
	if (action === 'duel-rematch') {
		const REMATCH_MS = 120_000;
		const id = String(body.id || ''), op = String(body.op || 'poll');
		const cm = await store.get('cardmatch:' + id);
		if (!cm) return json({ error: 'no such match' }, 404);
		if (cm.host !== username && cm.guest !== username) return json({ error: 'not your duel' }, 403);
		const fresh = cm.rematchBy && Date.now() - (cm.rematchTs || 0) < REMATCH_MS;
		if (op === 'poll') {
			return json({ rematchBy: fresh ? cm.rematchBy : null, rematchMatchId: cm.rematchMatchId || null });
		}
		if (op === 'offer') {
			if (cm.rematchMatchId) return json({ matchId: cm.rematchMatchId }); // already made
			// the opponent already offered → this completes the handshake: mint the rematch
			if (fresh && cm.rematchBy !== username) {
				const newId = randCode() + randCode();
				const ncm = {
					id: newId, type: 'card', host: cm.host, guest: cm.guest,
					hostDeck: cm.hostDeck || null, hostClass: cm.hostClass || null, hostCommander: cm.hostCommander || null, hostCompanion: cm.hostCompanion || null,
					guestDeck: cm.guestDeck || null, guestClass: cm.guestClass || null, guestCommander: cm.guestCommander || null, guestCompanion: cm.guestCompanion || null,
					over: false, winner: null, createdAt: Date.now(), lastActive: Date.now(), rematchOf: id,
				};
				await store.setJSON('cardmatch:' + newId, ncm);
				await store.setJSON('curmatch:' + cm.host, { id: newId, type: 'card', ts: Date.now() });
				await store.setJSON('curmatch:' + cm.guest, { id: newId, type: 'card', ts: Date.now() });
				cm.rematchMatchId = newId; await store.setJSON('cardmatch:' + id, cm);
				return json({ matchId: newId });
			}
			cm.rematchBy = username; cm.rematchTs = Date.now();
			await store.setJSON('cardmatch:' + id, cm);
			return json({ offered: true });
		}
		return json({ error: 'bad op' }, 400);
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
		const list = (await store.get('cardintent:' + id)) || [];
		list.push({ intent: body.intent || {}, seat: mine.seat, ts: Date.now() });
		await store.setJSON('cardintent:' + id, list);
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
		const list = (await store.get('cardintent:' + id)) || [];
		if (list.length) await store.setJSON('cardintent:' + id, []);
		return json({ intents: list.map(x => ({ ...x.intent, seat: x.seat ?? 1 })), oppGone, staleSeats, over: !!cm.over });
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
	// MP_ADMINS (comma-separated usernames) in the Netlify env if it ever changes.
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
		return json({ packInbox: user.packInbox || 0, packCap: PACK_INBOX_CAP, packTimerMs: PACK_TIMER_MS, nextPackMs: packEtaMs(user, now), packs: user.packs || 0 });
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
		for (const id of cards) user.collection[id] = (user.collection[id] || 0) + 1;
		await store.setJSON(username, user);
		return json({ cards, state: publicState(user, username) });
	}

	if (action === 'run-reward') {
		// win or lose, a finished run pays one pack (lightly rate-limited)
		if (Date.now() - (user.stats.lastReward || 0) < REWARD_COOLDOWN_MS) {
			return json({ error: 'too soon — the last run just paid out', state: publicState(user, username) }, 429);
		}
		user.packs += 1;
		user.stats.runs += 1;
		if (body.result === 'win') user.stats.wins += 1;
		user.stats.lastReward = Date.now();
		await store.setJSON(username, user);
		return json({ state: publicState(user, username) });
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

	return json({ error: 'unknown action' }, 400);
}
