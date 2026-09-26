// ow_pvp.js — live PvP battles, async (mailbox) matches, card-trade offers, and multiplayer presence & world-visiting.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as MP from '../battlecards/mpmode.js';
import * as Badges from './badges.js';
import * as Bag from './bag.js';
import * as BUI from './battleui.js';
import { META, getImage } from './engine.js';
import { battle, dialog, player, pvp, sctx, world } from './ow_core.js';
import { anyMenuOpen, menuChrome } from './ow_menus.js';
import { S } from './ow_state.js';
import { saveParty } from './party.js';
import { safeLoad } from './safestore.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { frontier } from './ow_frontier.js';
import { getBox, setBox } from './ow_menukeys.js';
import { mailMenu, openDeckSelect } from './ow_screens.js';
import { POS_KEY } from './ow_input.js';
import { TRADE_CATS, deckSelect, emptyOffer, trade } from './ow_menustate.js';
import { moveToMap } from './ow_transitions.js';
import {
	MP_ON,
} from './main.js';

// ---------- live PvP battles ----------
// build a self-contained party snapshot the PvP engine can resolve without
// any of our client-only data (move power/type/category baked in)
export function pvpParty() {
	if (!S.party || !battle.data) return [];
	return S.party.filter(m => m.curHP > 0).slice(0, 6).map(m => ({
		speciesId: m.speciesId, name: m.name, level: m.level, types: m.types, sprite: m.sprite,
		weightkg: battle.data.species[m.speciesId]?.weightkg || 50, // Low Kick family
		stats: { ...m.stats }, maxHP: m.maxHP, curHP: m.curHP, status: m.status || null,
		moves: m.moves.map(mv => {
			const info = battle.data.moves[mv.id] || {};
			return { id: mv.id, name: mv.name, pp: mv.pp, maxPp: mv.maxPp,
				type: info.type || 'Normal', power: info.power || 0,
				category: info.category || 'Status', acc: info.acc ?? 100, priority: info.priority || 0 };
		}),
	}));
}
// my card deck + class for a live card duel (from the account's saved decks)
async function cardParty() {
	let st;
	try { st = await MP.freshState(); } catch (e) { st = MP.cachedState(); }
	if (!st || !st.decks) return null;
	const saved = localStorage.getItem('magepunk_class_v1') || '';
	const list = Array.isArray(st.decks) ? st.decks : [];
	const valid = list.filter(d => d && Array.isArray(d.cards) && d.cards.length >= 40);
	if (!valid.length) return null;
	const pick = valid.find(d => d.classId === saved) || valid[0];
	return { deck: pick.cards, classId: pick.classId };
}
const goCardDuel = id => { location.href = '/battlecards/?cardpvp=' + encodeURIComponent(id) + '&mp=1'; };

// on boot, offer to rejoin a battle left in progress (e.g. after a refresh).
// Declining forfeits so the opponent isn't left waiting out the abandon timer.
export async function checkRejoin() {
	if (!MP_ON) return;
	let data;
	try { data = await MP.call('my-current-match'); } catch (e) { return; }
	if (!data || !data.match) return;
	const { id, type } = data.match;
	const what = type === 'card' ? 'card duel' : 'POKeMON battle';
	dialog.open(`You left a ${what} in progress.  Z=Rejoin  X=Forfeit`, (declined) => {
		if (declined === 'x') { MP.call('leave-match', { id, type }).catch(() => {}); return; }
		if (type === 'card') goCardDuel(id);
		else enterMatch(id, false);
	});
}

// THE PREMIUM COUNTER: the league Centers' clerk sells the high-end goods once
// the JOHTO crown opens the postgame — the money sink JohKanto's outsized
// payouts never had. STATIC stock by design: the dailies system was
// deliberately skipped (standing user call), so no restock timers here.
const PREMIUM_STOCK = ['rarecandy', 'maxpotion', 'maxrevive', 'abilitycapsule',
	'adamantmint', 'modestmint', 'jollymint', 'timidmint', 'carefulmint'];
const PREMIUM_MAPS = new Set(['MAP_INDIGO_PLATEAU_POKECENTER_1F', 'MAP_SILVER_CAVE_POKECENTER_1F']);
export function shopStockNow() {
	return PREMIUM_MAPS.has(world.current?.map?.id) && Badges.isChampion('JOHTO')
		? [...Bag.SHOP_STOCK, ...PREMIUM_STOCK] : Bag.SHOP_STOCK;
}

// ---- mail battles (correspondence Pokémon) ----
export async function refreshMail() {
	if (!MP_ON) return null;
	try {
		const d = await MP.call('async-list');
		const rows = (d.matches || []).filter(m => m.game === 'pokemon');
		S.mailWaiting = rows.filter(m => m.yourTurn || m.yourInvite).length;
		mailMenu.rows = rows;
		return rows;
	} catch (e) { return null; }
}
export async function openMailbox() {
	mailMenu.open = true; mailMenu.idx = 0; mailMenu.loading = true;
	await refreshMail();
	mailMenu.loading = false;
}
export async function sendMailChallenge(f) {
	const snap = pvpParty();
	if (!snap.length) { dialog.open('Your POKeMON need to be healthy to battle!'); return; }
	const r = await MP.call('async-create', { to: f.username, game: 'pokemon', party: snap })
		.catch(e => ({ error: e.message || 'could not send' }));
	if (r.error) { dialog.open(r.error); return; }
	await refreshMail();
	dialog.open(`Mail battle sent to ${f.username}!\n\nThey can answer whenever — check MAIL for their reply.`);
}
export async function mailAccept(row) {
	const snap = pvpParty();
	if (!snap.length) { dialog.open('Your POKeMON need to be healthy to battle!'); return; }
	const r = await MP.call('async-accept', { id: row.id, party: snap })
		.catch(e => ({ error: e.message || 'could not accept' }));
	if (r.error) { dialog.open(r.error); return; }
	await refreshMail();
	enterAsyncMatch(row.id);
}
// open a correspondence match in the normal PvP view (async mode)
export async function enterAsyncMatch(id) {
	const d = await MP.call('async-get', { id }).catch(() => null);
	if (!d || d.error || !d.match?.pk) { dialog.open('That mail battle is not ready yet.'); return; }
	mailMenu.open = false;
	await pvp.start(id, d.match.pk, d.you, false, () => { refreshMail(); }, { async: true });
}
export function mailKey(k) {
	const rows = mailMenu.rows;
	const n = rows.length + 1; // + CLOSE
	if (k === 'ArrowUp') mailMenu.idx = (mailMenu.idx + n - 1) % n;
	if (k === 'ArrowDown') mailMenu.idx = (mailMenu.idx + 1) % n;
	if (k === 'x' || k === 'Escape') { mailMenu.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		if (mailMenu.idx >= rows.length) { mailMenu.open = false; return; }
		const row = rows[mailMenu.idx];
		if (!row) return;
		if (row.yourInvite) { mailAccept(row); return; }
		if (row.status === 'invited') { dialog.open(`Waiting for ${row.players.find(p => p !== S.mpAccount?.username)} to accept.`); return; }
		enterAsyncMatch(row.id);
	}
}
export function drawMailMenu(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'MAIL BATTLES', mailMenu.loading ? 'Checking the mailbox…'
		: S.mailWaiting ? `${S.mailWaiting} waiting on you.` : 'Battle a turn at a time — no need to both be online.');
	const me = S.mpAccount?.username;
	const rows = mailMenu.rows.map((m, i) => {
		const opp = m.players.find(p => p !== me) || '?';
		const sub = m.status === 'over'
			? (m.winner == null ? 'cancelled' : m.winner === me ? 'you won!' : `${opp} won`)
			: m.yourInvite ? 'they challenged you — tap to accept'
			: m.status === 'invited' ? 'waiting for them to accept'
			: m.yourTurn ? `YOUR MOVE — turn ${m.turnNumber}`
			: `waiting on ${opp} — turn ${m.turnNumber}`;
		return { id: 'mail:' + i, label: `vs ${opp}`, sub };
	});
	rows.push({ id: 'mail:' + mailMenu.rows.length, label: 'CLOSE', sub: '' });
	if (!mailMenu.rows.length && !mailMenu.loading) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.fillText('No mail battles — challenge a friend with MAIL BATTLE.', 24 * u, 300 * u);
	}
	rows.forEach((r, i) => {
		const b = { id: r.id, x: 24 * u, y: (78 + i * 52) * u, w: W - 48 * u, h: 46 * u,
			label: r.label, sub: r.sub, kbSel: mailMenu.idx === i };
		S.menuUi.push(b);
		BUI.button(sctx, b, S.menuHover === r.id || mailMenu.idx === i, u);
	});
}

export let pendingChallengeTo = null; // username we challenged, polling for accept
export async function sendChallenge(f) {
	const snap = pvpParty();
	if (!snap.length) { dialog.open('Your POKeMON need to be healthy to battle!'); return; }
	await MP.call('challenge', { to: f.username, battleType: 'pokemon', party: snap });
	pendingChallengeTo = f.username;
	dialog.open(`Challenge sent to ${f.username}!\n\nWaiting for them to accept…`);
}
export async function sendCardChallenge(f) {
	// deck-selection phase: pick which deck to bring, then send the challenge
	openDeckSelect('Pick a deck to battle with', async (picked) => {
		await MP.call('challenge', { to: f.username, battleType: 'card',
			party: { deck: picked.deck, classId: picked.classId, commander: picked.commander || null, companion: picked.companion || null } });
		pendingChallengeTo = f.username;
		dialog.open(`Card battle challenge sent to ${f.username}!\n\nWaiting for them to accept…`);
	});
}
// ---- trade: request → the other player accepts → both offer/lock/confirm ----
export async function startTrade(f) {
	try { await MP.call('challenge', { to: f.username, battleType: 'trade' }); }
	catch (e) { dialog.open('Could not send a trade request.'); return; }
	dialog.open(`Trade request sent to ${f.username}!\n\nWaiting for them to accept…`);
	const t0 = Date.now();
	const wait = setInterval(async () => {
		if (Date.now() - t0 > 60000 || trade.open) { clearInterval(wait); return; }
		try {
			const r = await MP.call('trade-mine');
			if (r && r.tradeId) { clearInterval(wait); openTradeWindow(r.tradeId, 'a', f.username); }
		} catch (e) {}
	}, 1200);
}
function openTradeWindow(id, role, them) {
	Object.assign(trade, {
		open: true, id, role, them: them || 'PLAYER', mine: emptyOffer(), theirs: emptyOffer(),
		myAccept: false, theirAccept: false, done: false, applied: false, cat: 0, idx: 0,
		status: 'Add items with Z. Press ACCEPT when ready.',
	});
	rebuildTradeRows();
	if (trade.poll) clearInterval(trade.poll);
	trade.poll = setInterval(tradePoll, 800);
}
function closeTrade() {
	if (trade.poll) clearInterval(trade.poll);
	trade.poll = null; trade.open = false; trade.id = null;
}
async function cancelTrade() {
	const id = trade.id;
	closeTrade();
	if (id) { try { await MP.call('trade-cancel', { id }); } catch (e) {} }
}
async function toggleAccept() {
	trade.myAccept = !trade.myAccept;
	try { const r = await MP.call('trade-lock', { id: trade.id, accepted: trade.myAccept }); if (r.trade) ingestTrade(r.trade); }
	catch (e) {}
}
// build the browsable inventory rows for the current category, plus offer/accept/cancel rows
function rebuildTradeRows() {
	const cat = TRADE_CATS[trade.cat], rows = [];
	if (cat === 'CARDS') {
		const coll = (MP.cachedState() || {}).collection || {};
		for (const [id, n] of Object.entries(coll)) {
			const off = trade.mine.cards[id] || 0;
			if (n > 0 || off) rows.push({ kind: 'card', id, label: prettyId(id), owned: n, off });
		}
		rows.sort((a, b) => a.label.localeCompare(b.label));
	} else if (cat === 'PACKS') {
		const st = MP.cachedState() || {};
		rows.push({ kind: 'pack', id: 'pack', label: 'Card Pack', owned: st.packs || 0, off: trade.mine.packs });
	} else if (cat === 'POKeMON') {
		S.party.forEach((m, i) => rows.push({ kind: 'mon', src: 'party:' + i, label: `${m.name} Lv.${m.level}`, mon: m,
			off: trade.mine.pokemon.some(o => o._src === 'party:' + i) ? 1 : 0 }));
		getBox().forEach((m, i) => rows.push({ kind: 'mon', src: 'box:' + i, label: `${m.name} Lv.${m.level} (box)`, mon: m,
			off: trade.mine.pokemon.some(o => o._src === 'box:' + i) ? 1 : 0 }));
	} else if (cat === 'ITEMS') {
		const bag = Bag.getBag();
		for (const [id, n] of Object.entries(bag)) {
			const off = (trade.mine.items.find(it => it.id === id) || {}).count || 0;
			if (n > 0 || off) rows.push({ kind: 'item', id, label: Bag.nameOf(id), owned: n, off });
		}
	}
	rows.push({ kind: 'accept', label: trade.myAccept ? '✓ ACCEPTED (Z to unaccept)' : 'ACCEPT OFFER' });
	rows.push({ kind: 'cancel', label: 'CANCEL TRADE' });
	trade.rows = rows;
	if (trade.idx >= rows.length) trade.idx = Math.max(0, rows.length - 1);
}
function offerAdd(r) {
	if (r.kind === 'card') { if ((trade.mine.cards[r.id] || 0) < r.owned) trade.mine.cards[r.id] = (trade.mine.cards[r.id] || 0) + 1; }
	else if (r.kind === 'pack') { if (trade.mine.packs < r.owned) trade.mine.packs++; }
	else if (r.kind === 'mon') {
		if (r.off) trade.mine.pokemon = trade.mine.pokemon.filter(o => o._src !== r.src);
		else { const snap = JSON.parse(JSON.stringify(r.mon)); snap._src = r.src; trade.mine.pokemon.push(snap); }
	} else if (r.kind === 'item') {
		const it = trade.mine.items.find(i => i.id === r.id);
		if ((it?.count || 0) < r.owned) { if (it) it.count++; else trade.mine.items.push({ id: r.id, count: 1 }); }
	} else return;
	afterOfferChange();
}
function offerRemove(r) {
	if (r.kind === 'card' && trade.mine.cards[r.id]) { if (--trade.mine.cards[r.id] <= 0) delete trade.mine.cards[r.id]; }
	else if (r.kind === 'pack' && trade.mine.packs > 0) trade.mine.packs--;
	else if (r.kind === 'mon' && r.off) trade.mine.pokemon = trade.mine.pokemon.filter(o => o._src !== r.src);
	else if (r.kind === 'item') { const it = trade.mine.items.find(i => i.id === r.id); if (it && --it.count <= 0) trade.mine.items = trade.mine.items.filter(i => i.id !== r.id); }
	else return;
	afterOfferChange();
}
function afterOfferChange() {
	trade.myAccept = false; trade.theirAccept = false; // any change unlocks both
	rebuildTradeRows();
	MP.call('trade-update', { id: trade.id, offer: trade.mine }).then(r => r.trade && ingestTrade(r.trade)).catch(() => {});
}
async function tradePoll() {
	if (!trade.open || !trade.id) return;
	try {
		const r = await MP.call('trade-poll', { id: trade.id });
		if (r.gone) { trade.status = 'Trade ended.'; setTimeout(closeTrade, 900); return; }
		if (r.trade) ingestTrade(r.trade);
	} catch (e) {}
}
function ingestTrade(t) {
	if (!t) return;
	trade.theirs = trade.role === 'a' ? t.offerB : t.offerA;
	trade.myAccept = trade.role === 'a' ? t.acceptA : t.acceptB;
	trade.theirAccept = trade.role === 'a' ? t.acceptB : t.acceptA;
	if (t.cancelled) { trade.status = 'The other player cancelled.'; setTimeout(closeTrade, 1200); return; }
	if (t.done && !trade.applied) { trade.applied = true; trade.done = true; applyTradeSwap(t); trade.status = 'Trade complete!'; if (trade.poll) { clearInterval(trade.poll); trade.poll = null; } }
	else if (!t.done) trade.status = trade.theirAccept ? 'They accepted — you accept to seal it.' : (trade.myAccept ? 'Waiting for them to accept…' : 'Add items, then ACCEPT.');
	rebuildTradeRows();
}
// apply my half of a completed swap: cards/packs were moved server-side (just
// refresh), Pokemon and bag items are local so I remove what I gave + add what I got
function applyTradeSwap(t) {
	const gave = trade.role === 'a' ? t.offerA : t.offerB;
	const got = trade.role === 'a' ? t.offerB : t.offerA;
	const partyRm = new Set(), boxRm = new Set();
	for (const m of (gave.pokemon || [])) {
		const [z, i] = String(m._src || '').split(':');
		if (z === 'party') partyRm.add(+i); else if (z === 'box') boxRm.add(+i);
	}
	for (let i = S.party.length - 1; i >= 0; i--) if (partyRm.has(i)) S.party.splice(i, 1);
	if (boxRm.size) setBox(getBox().filter((_, i) => !boxRm.has(i)));
	if (got.pokemon && got.pokemon.length) {
		const nb = getBox();
		for (const m of got.pokemon) { const c = { ...m }; delete c._src; nb.push(c); }
		setBox(nb);
	}
	for (const it of (gave.items || [])) for (let n = 0; n < (it.count | 0); n++) Bag.consume(it.id);
	for (const it of (got.items || [])) Bag.addItem(it.id, it.count | 0);
	saveParty(S.party);
	MP.freshState().catch(() => {}); // pull the updated card collection / packs
}
export function tradeKey(k) {
	if (trade.done) { if (k === 'z' || k === 'x' || k === 'Enter' || k === 'Escape') closeTrade(); return; }
	const rows = trade.rows; if (!rows.length) return;
	if (k === 'ArrowUp') trade.idx = (trade.idx + rows.length - 1) % rows.length;
	else if (k === 'ArrowDown') trade.idx = (trade.idx + 1) % rows.length;
	else if (k === 'ArrowLeft') { trade.cat = (trade.cat + TRADE_CATS.length - 1) % TRADE_CATS.length; trade.idx = 0; rebuildTradeRows(); }
	else if (k === 'ArrowRight') { trade.cat = (trade.cat + 1) % TRADE_CATS.length; trade.idx = 0; rebuildTradeRows(); }
	else if (k === 'z' || k === 'Enter') {
		const r = rows[trade.idx]; if (!r) return;
		if (r.kind === 'accept') toggleAccept();
		else if (r.kind === 'cancel') cancelTrade();
		else offerAdd(r);
	} else if (k === 'x' || k === 'Escape') {
		const r = rows[trade.idx];
		if (r && (r.kind === 'card' || r.kind === 'pack' || r.kind === 'mon' || r.kind === 'item')) offerRemove(r);
		else cancelTrade();
	}
}
export const prettyId = id => String(id).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export async function pollChallenges() {
	if (!MP_ON || pvp.blocking) return;
	// did a friend accept our challenge?
	if (pendingChallengeTo) {
		try {
			const mm = await MP.call('my-match');
			if (mm.matchId) {
				pendingChallengeTo = null;
				if (mm.type === 'card') { goCardDuel(mm.matchId); return; }
				enterMatch(mm.matchId, false); return;
			}
		} catch (e) {}
	}
	if (anyMenuOpen() || battle.blocking) return;
	// fetch the freshest incoming challenge every tick
	let ch = null;
	try { const data = await MP.call('challenges'); ch = (data.challenges || [])[0] || null; pollHealth.fails = 0; }
	catch (e) { pollHealth.fails++; return; }
	if (incomingChallenge) {
		// a challenge dialog is already up — refresh it if the pending challenge
		// changed type or sender (e.g. they switched a POKeMON challenge to a
		// card one), so we can never accept the wrong kind of battle
		if (ch && (ch.from !== incomingChallenge.from || ch.type !== incomingChallenge.type)
			&& !deckSelect.open && !trade.open) { incomingChallenge = ch; showIncoming(ch); }
		return;
	}
	if (ch && !dialog.blocking && !deckSelect.open && !trade.open) { incomingChallenge = ch; showIncoming(ch); }
}
let incomingChallenge = null;
function showIncoming(ch) {
	const label = ch.type === 'trade' ? `${ch.from} wants to TRADE!`
		: ch.type === 'card' ? `${ch.from} challenges you to a CARD battle!`
		: `${ch.from} challenges you to a POKeMON battle!`;
	dialog.open(`${label}  Z=Accept  X=Decline`, async (declined) => {
		const c = incomingChallenge; incomingChallenge = null;
		if (!c) return;
		if (declined === 'x') { await MP.call('decline-challenge', { from: c.from }); return; }
		await acceptChallengeFrom(c.from);
	});
}
// Accept whatever <from> is actually offering RIGHT NOW. We re-read the stored
// challenge type instead of trusting the (possibly stale) dialog, so a challenge
// that changed type between display and accept still launches the correct battle.
async function acceptChallengeFrom(from) {
	let type;
	try {
		const data = await MP.call('challenges');
		const cur = (data.challenges || []).find(c => c.from === from);
		if (!cur) { dialog.open('That challenge is no longer available.'); return; }
		type = cur.type;
	} catch (e) { dialog.open('Could not reach the server.'); return; }
	if (type === 'trade') {
		try { const r = await MP.call('trade-open', { from }); if (r && r.tradeId) openTradeWindow(r.tradeId, 'b', from); else dialog.open((r && r.error) || 'Trade could not start.'); }
		catch (e) { dialog.open('Trade could not start.'); }
		return;
	}
	if (type === 'card') {
		// deck-selection phase before accepting the duel
		openDeckSelect('Pick a deck to battle with', async (picked) => {
			const data = await MP.call('accept-challenge', { from, battleType: 'card',
				party: { deck: picked.deck, classId: picked.classId, commander: picked.commander || null, companion: picked.companion || null } });
			if (data.error) { dialog.open(data.error); return; }
			goCardDuel(data.matchId);
		});
		return;
	}
	// pokemon
	const snap = pvpParty();
	if (!snap.length) { dialog.open('Your POKeMON need to be healthy to battle!'); return; }
	const data = await MP.call('accept-challenge', { from, party: snap });
	if (data.error) { dialog.open(data.error); return; }
	if (data.cardmatch) { goCardDuel(data.matchId); return; } // backend says it's a card duel
	enterMatch(data.matchId, false, data.match, sideOfMe(data.match));
}
function sideOfMe(match) {
	return match.sides.findIndex(sd => sd.name === (S.mpAccount?.username));
}
export async function enterMatch(matchId, spectator, matchObj, side) {
	let match = matchObj;
	if (!match) {
		const data = await MP.call('match', { id: matchId });
		if (data.error) { dialog.open(data.error); return; }
		match = data.match; side = data.side;
	}
	if (side == null) side = sideOfMe(match);
	// live PvP is non-persistent (link-battle style): the battle runs on a party
	// snapshot, so damage/fainting never carries back to your overworld team.
	await pvp.start(matchId, match, side, spectator, () => { heartbeat(); });
	// tell friends I'm battling (so they can spectate)
	if (MP_ON) MP.call('heartbeat', { map: world.current.name, x: player.tx, y: player.ty, facing: player.facing, status: 'battling:' + matchId, region: world.current.map.name || '' });
}

// ---------- multiplayer presence & visiting ----------
let friendSprite = null; // green_normal.png, loaded lazily for friend ghosts
getImage('data/sprites/green_normal.png').then(img => { friendSprite = img; }).catch(() => {});
// every friend currently standing on my map, rendered as a live ghost
export const ghosts = new Map(); // username -> { tx, ty, facing, px, py }

// broadcast my position; fast when co-located so neighbours see me move
// TIER 2 — presence used to be written twice a second whether or not anything
// had changed, which made it the single largest source of D1 row writes: ~2,000
// an hour roaming, ~8,000 co-located. Most of a session is standing still, in a
// menu, or reading a dialog. Skip the write when the payload is identical.
//
// The floor matters: `friends` decides online-ness from lastSeen against
// ONLINE_MS (90s server-side), so going quiet indefinitely would make an idle
// player look offline. Re-send at least every 40s regardless.
let _lastBeat = '', _lastBeatAt = 0;
const BEAT_FLOOR_MS = 40_000;
export async function heartbeat(force) {
	if (!MP_ON || S.loading) return;
	try {
		const payload = {
			map: world.current.name, x: player.tx, y: player.ty,
			facing: player.facing,
			status: pvp.blocking ? 'battling:' + (pvp.active?.matchId || '')
				: frontier.active ? 'factory:' + (frontier.cfg?.name || 'BATTLE FRONTIER')
					: S.visiting ? 'visiting:' + S.visiting.username : 'roaming',
			region: frontier.active ? (frontier.cfg?.name || '') : (world.current.map.name || ''),
		};
		// TIER 4 — presence is only worth writing when someone can SEE it. Alone on
		// a map, x/y/facing are read by nobody, so they are left out of the change
		// check entirely: walking solo writes nothing. map/status/region stay in it
		// because the friends list shows those even when nobody shares your map.
		//
		// This has no meet-up latency, which is why it beats a blanket slow cadence:
		// arriving somewhere CHANGES map, so it still beats immediately, and the
		// moment a ghost appears `watched` flips, the signature widens to include
		// position, and the next beat sends the exact tile.
		const watched = coLocated();
		const sig = JSON.stringify(watched ? payload
			: { map: payload.map, status: payload.status, region: payload.region });
		const now = performance.now();
		if (!force && sig === _lastBeat && now - _lastBeatAt < BEAT_FLOOR_MS) return;
		await MP.call('heartbeat', payload);
		_lastBeat = sig; _lastBeatAt = now;
	} catch (e) {}
}

// load a friend's current map at their position and follow them live
export async function visitWorld(f) {
	const data = await MP.call('presence', { username: f.username });
	const p = data.presence;
	if (!p || !p.map) { dialog.open(`${f.username} isn't roaming right now.`); return; }
	const file = world.fileFor(p.map) || p.map;
	S.visiting = { username: f.username };
	await moveToMap(file, p.x, p.y);
	heartbeat();
	dialog.open(`You warped into ${f.username}'s world!\n\nPress START and pick EXIT to return home.`);
}
export async function leaveVisit() {
	S.visiting = null;
	ghosts.clear();
	const home = safeLoad(POS_KEY, null);
	await moveToMap(home?.map ? (world.fileFor(home.map) || home.map) : 'PalletTown', home?.x, home?.y);
}

// one poll of every friend's presence: update ghosts for those on my map,
// follow a visited friend across maps, drop friends who left
// Consecutive failed polls, so the loops in main.js can back off. When the
// Cloudflare function quota runs out every call fails; hammering it helps nobody.
export const pollHealth = { fails: 0 };

export async function pollPresence() {
	if (!MP_ON || pvp.blocking) return;
	try {
		const data = await MP.call('friends');
		if (data.friends) S.friends = data.friends;
		const here = new Set();
		for (const f of S.friends) {
			if (S.visiting && f.username === S.visiting.username) {
				if (!f.online) { dialog.open(`${S.visiting.username} went offline. Returning home…`); await leaveVisit(); return; }
				const theirFile = world.fileFor(f.map) || f.map;
				if (f.map && theirFile !== world.current.name && !S.loading) { await moveToMap(theirFile, f.x, f.y); }
			}
			if (f.online && f.map === world.current.name) {
				here.add(f.username);
				let g = ghosts.get(f.username);
				if (!g) g = { px: f.x * META, py: f.y * META, path: [], facing: f.facing || 'down', missed: 0 };
				g.missed = 0;
				g.facingReported = f.facing || 'down';
				// waypoint queue: append each newly-reported tile; the draw loop walks
				// the ghost along the queue at a constant speed instead of snapping
				const last = g.path.length ? g.path[g.path.length - 1] : { x: Math.round(g.px / META), y: Math.round(g.py / META) };
				if (f.x !== last.x || f.y !== last.y) {
					g.path.push({ x: f.x, y: f.y });
					if (g.path.length > 6) g.path.splice(0, g.path.length - 6); // too far behind: skip ahead
				}
				ghosts.set(f.username, g);
			}
		}
		// grace period: one missed poll can be a warp/heartbeat gap — deleting
		// instantly made ghosts flicker ("glimpsed him every few frames")
		for (const [u, g] of ghosts) {
			if (!here.has(u) && ++g.missed >= 3) ghosts.delete(u);
		}
		pollHealth.fails = 0;
	} catch (e) { pollHealth.fails++; }
}

// true when someone is (or could be) sharing my screen — drives fast polling
export function coLocated() {
	return ghosts.size > 0 || !!S.visiting
		|| S.friends.some(f => f.online && (f.map === world.current.name || (f.status || '').startsWith('visiting:')));
}

// draw every friend ghost on my map, walking it along its waypoint queue at a
// constant speed (like a real player) instead of ease-snapping to the last tile
let ghostClock = 0;
export function drawFriendGhosts(ctx, camX, camY) {
	if (!friendSprite || !ghosts.size) return;
	const now = performance.now();
	const dt = ghostClock ? Math.min((now - ghostClock) / 1000, 0.1) : 0.016;
	ghostClock = now;
	for (const [name, g] of ghosts) {
		// catch-up speed scales with backlog: walk pace when current, run pace when
		// 2+ tiles behind, so a sprinting friend stays smooth instead of teleporting
		const speed = 120 * (g.path.length >= 2 ? 1.9 : 1.15);
		let budget = speed * dt;
		let moving = false;
		while (budget > 0 && g.path.length) {
			const wp = g.path[0];
			const dx = wp.x * META - g.px, dy = wp.y * META - g.py;
			const dist = Math.hypot(dx, dy);
			if (dist <= budget) { g.px = wp.x * META; g.py = wp.y * META; g.path.shift(); budget -= dist; }
			else {
				g.px += (dx / dist) * budget; g.py += (dy / dist) * budget; budget = 0;
			}
			// face the way we're travelling; fall back to the reported facing at rest
			g.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
			moving = true;
		}
		if (!moving) g.facing = g.facingReported || g.facing || 'down';
		const bob = moving && Math.floor(now / 150) % 2 ? -1 : 0; // subtle step bob
		const mirror = g.facing === 'right';
		const frameX = { down: 0, up: 1, left: 2, right: 2 }[g.facing] * 16;
		ctx.save();
		const x = Math.round(g.px - camX), y = Math.round(g.py - 16 - camY + bob);
		if (mirror) { ctx.translate(x + 16, y); ctx.scale(-1, 1); }
		else ctx.translate(x, y);
		ctx.globalAlpha = 0.92;
		ctx.drawImage(friendSprite, frameX, 0, 16, 32, 0, 0, 16, 32);
		ctx.restore();
		ctx.fillStyle = '#fff';
		ctx.font = '6px monospace';
		ctx.textAlign = 'center';
		ctx.fillText(name.slice(0, 8), Math.round(g.px - camX) + 8, Math.round(g.py - 18 - camY));
		ctx.textAlign = 'left';
	}
}

