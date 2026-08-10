// /api/mp — the /magepunktest account backend (Netlify Function + Blobs).
//
// One POST endpoint, JSON body { action, ...payload }, Bearer token auth.
// The server is authoritative for everything a player could cheat:
// pack contents are rolled here, rewards are granted here, deck saves are
// validated against the owned collection here.
//
// Storage: Netlify Blobs store "mp-users", one JSON blob per user.
// Secret: set MP_SECRET in the Netlify environment (Site settings →
// Environment variables). The fallback below keeps dev working but is
// public knowledge — tokens are forgeable until MP_SECRET is set.
import { scrypt as scryptCb, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { STARTER_DECKS } from '../../battlecards/dungeon.js';
import { createMatch, submitAction, replaceFainted, sideOf } from '../../battlecards/pvpbattle.js';
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

// A ready-made 40-card mage deck so a fresh account can duel without building.
// Deletable like any slot — an account with zero decks can't start a card battle.
const MAGE_STARTER = ['arcane_missiles', 'arcane_missiles', 'mirror_image', 'mirror_image', 'arcane_explosion', 'arcane_explosion', 'frostbolt', 'frostbolt', 'arcane_intellect', 'arcane_intellect', 'fireball', 'fireball', 'flamestrike', 'flamestrike', 'babbling_book', 'babbling_book', 'glacier_racer', 'glacier_racer', 'lab_partner', 'lab_partner', 'mana_wyrm', 'mana_wyrm', 'time_twisted_seer', 'time_twisted_seer', 'wand_thief', 'wand_thief', 'winterspring_whelp', 'winterspring_whelp', 'aqua_archivist', 'aqua_archivist', 'arcanologist', 'arcanologist', 'chill_o_matic', 'chill_o_matic', 'game_master', 'game_master', 'imprisoned_phoenix', 'imprisoned_phoenix', 'magic_dart_frog', 'magic_dart_frog'];
const newDeckId = () => 'd_' + randomBytes(4).toString('hex');
const mageStarterSlot = () => ({ id: newDeckId(), name: 'Mage Starter', classId: 'mage', cards: [...MAGE_STARTER] });
const grantCards = (collection, ids) => {
	const counts = {};
	for (const id of ids) counts[id] = (counts[id] || 0) + 1;
	for (const [id, n] of Object.entries(counts)) collection[id] = Math.max(collection[id] || 0, n);
};

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
	return col;
}

// One-time top-up, run on any authenticated request. The test phase used to hand
// every account the entire pool; when it ends, accounts fall back to what they
// actually own — which for older accounts was a single copy of each starter card.
// Bring everyone to the current baseline, keep their saved decks legal by granting
// the cards those decks use, and pay out the same welcome packs a new account gets.
async function grantStarterBaseline(store, username, user) {
	if (user.starterBaselineV2) return;
	user.collection = user.collection || {};
	for (const [id, n] of Object.entries(startingCollection())) {
		user.collection[id] = Math.max(user.collection[id] || 0, n);
	}
	for (const slot of user.decks || []) grantCards(user.collection, slot.cards || []);
	user.packs = (user.packs || 0) + STARTER_PACKS;
	user.starterBaselineV2 = true;
	await store.setJSON(username, user);
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
		const starter = mageStarterSlot();
		grantCards(collection, starter.cards);
		const user = {
			salt, hash, created: Date.now(),
			collection,
			decks: [starter],       // a ready 40-card mage deck; up to 40 slots
			decksMigrated: true,
			packs: STARTER_PACKS, // a stack of welcome packs to build a collection from
			starterBaselineV2: true,
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

	if (action === 'state') return json({ state: publicState(user, username) });

	// ---------- friends & presence ----------
	if (action === 'add-friend') {
		const code = String(body.code || '').toUpperCase().trim();
		if (!/^[A-Z]{6}$/.test(code)) return json({ error: 'friend codes are 6 capital letters' }, 400);
		if (code === user.friendCode) return json({ error: "that's your own code" }, 400);
		const other = await store.get('code:' + code);
		if (!other || other === username) return json({ error: 'no player has that code' }, 404);
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
		const isPlayer = cm.host === username || cm.guest === username;
		if (!isPlayer && !(user.friends.includes(cm.host) || user.friends.includes(cm.guest)))
			return json({ error: 'not allowed to watch' }, 403);
		return json({ cardmatch: cm, role: cm.host === username ? 'host' : cm.guest === username ? 'guest' : 'spectator' });
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
		const payload = { snapshot: body.snapshot || null, mode: 'pvp', label: String(body.label || 'Card Duel'), room: 'm:' + id, seq: +body.seq || 0, ts: Date.now() };
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
		// the guest polling proves they're here; if the host stopped publishing,
		// the guest wins by abandonment
		if (cm.guest === username && !cm.over) {
			await store.setJSON('alive:' + id + ':guest', now);
			const hostAlive = await store.get('alive:' + id + ':host');
			if (hostAlive && now - hostAlive > ABANDON_MS) {
				cm.over = true; cm.winner = 1; cm.abandoned = true; // guest = player 1
				await store.setJSON('cardmatch:' + id, cm);
			}
		}
		const cs = await store.get('cardmatchstate:' + id);
		if (!cs || now - cs.ts > CARDSTATE_MS) return json({ snapshot: null, over: cm.over, winner: cm.winner, abandoned: !!cm.abandoned });
		return json({ ...cs, over: cm.over, winner: cm.winner, abandoned: !!cm.abandoned });
	}

	// guest queues an action intent; the host drains and applies them
	if (action === 'card-act') {
		const id = String(body.id || '');
		const cm = await store.get('cardmatch:' + id);
		if (!cm) return json({ error: 'no such match' }, 404);
		if (cm.guest !== username) return json({ error: 'only the guest relays intents' }, 403);
		const list = (await store.get('cardintent:' + id)) || [];
		list.push({ intent: body.intent || {}, ts: Date.now() });
		await store.setJSON('cardintent:' + id, list);
		return json({ ok: true });
	}

	// host drains the guest's queued intents (returns + clears them)
	if (action === 'card-drain') {
		const id = String(body.id || '');
		const cm = await store.get('cardmatch:' + id);
		if (!cm) return json({ error: 'no such match' }, 404);
		if (cm.host !== username) return json({ error: 'only the host drains' }, 403);
		const now = Date.now();
		await store.setJSON('alive:' + id + ':host', now); // draining also proves the host is here
		let oppGone = false;
		// if the guest stopped polling, the host wins by abandonment
		if (!cm.over) {
			const guestAlive = await store.get('alive:' + id + ':guest');
			if (guestAlive && now - guestAlive > ABANDON_MS) {
				cm.over = true; cm.winner = 0; cm.abandoned = true; // host = player 0
				await store.setJSON('cardmatch:' + id, cm);
				oppGone = true;
			}
		}
		const list = (await store.get('cardintent:' + id)) || [];
		if (list.length) await store.setJSON('cardintent:' + id, []);
		return json({ intents: list.map(x => x.intent), oppGone, over: !!cm.over });
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
