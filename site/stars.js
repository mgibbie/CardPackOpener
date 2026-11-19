// stars.js — the star wallet: Pair of Pears earns stars (its Golden pairs), Pocket Enhanced earns and spends them.
// One balance for a player, on every device they sign in on.
//
// The wallet is two sets of counters that only ever grow, one pair per device:
//     { e: { <device>: stars this device has earned, ever }, s: { <device>: stars this device has spent, ever } }
//     balance = everything earned - everything spent
// Two copies are joined by taking, for each device, the larger number. So joining is the same in any order and any
// number of times: a sync that is repeated, arrives late, or meets another device's sync half way can neither lose
// stars nor count them twice. (What it cannot stop: two devices that are both offline each spending the same stars.
// The balance is then shown as 0 until it is earned back.)
//
// A guest's wallet is on the device. A signed-in player's is also kept on the account (server/stars.mjs): `sync()`.
export const WALLET_KEY = 'magepunk_stars_v1', DEVICE_KEY = 'magepunk_stars_dev_v1';
export const STARS_PER_PACK = 100;   // what a pack costs in Pocket Enhanced, and what a reward that used to be a pack pays
const MAX = 1e9, MAX_DEVICES = 40;
const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };

// (a counter's name: 5-24 letters and digits. A device's own id is 8+; the server's counters are named: 'trades0', 'ranked0',
// 'wagers0' (spectator bets), and 'tour0', the tournament prizes, which a 6-letter minimum used to drop on every read, so a
// prize was written to the row and never counted in the balance)
const side = o => { const out = {}; let n = 0; for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {})) if (n < MAX_DEVICES && /^[a-z0-9]{5,24}$/.test(k) && Number.isFinite(v) && v > 0) { out[k] = Math.min(MAX, Math.floor(v)); n++; } return out; };
/** Read whatever was stored: a wallet (an empty one if there is none, or it cannot be read). */
export const cleanWallet = w => ({ e: side(w && w.e), s: side(w && w.s) });
// The server's notes on a wallet row (not stars, so not in e/s): `th` stars held for a trade (server/trade.mjs), `rk` ranked
// seasons paid (server/pocket_rank.mjs), `tp` tournaments paid (server/pocket_pvp.mjs), `bq` stakes on their way into a
// bet's market and `bw` bet markets that have paid this wallet (server/bets.mjs). Every writer of the row keeps them
// all; one that kept only its own dropped the others' (2026-11-18: star sync and trades dropped `rk`).
export const WALLET_NOTES = Object.freeze(['th', 'rk', 'tp', 'bq', 'bw']);
export const walletNotes = row => { const out = {}; for (const k of WALLET_NOTES) if (row && row[k] != null) out[k] = row[k]; return out; };
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
/** Stars to spend (never below none). */
export const balance = w => { const c = cleanWallet(w); return Math.max(0, sum(c.e) - sum(c.s)); };
/** Everything either copy knows: for each device, the larger count. */
export function mergeWallets(a, b) {
	const x = cleanWallet(a), y = cleanWallet(b), out = { e: { ...x.e }, s: { ...x.s } };
	for (const k of ['e', 's']) for (const [d, v] of Object.entries(y[k])) out[k][d] = Math.max(out[k][d] || 0, v);
	return out;
}
export const sameWallet = (a, b) => { const c = w => JSON.stringify(['e', 's'].map(k => Object.entries(cleanWallet(w)[k]).sort())); return c(a) === c(b); };
/** A wallet with `n` more earned (or spent) by `device`. Spending more than there is returns null. */
export function earned(w, device, n) { const c = cleanWallet(w); n = Math.max(0, Math.floor(+n) || 0); if (n) c.e[device] = Math.min(MAX, (c.e[device] || 0) + n); return c; }
export function spent(w, device, n) { const c = cleanWallet(w); n = Math.max(0, Math.floor(+n) || 0); if (n > balance(c)) return null; if (n) c.s[device] = Math.min(MAX, (c.s[device] || 0) + n); return c; }

// ---------- this device ----------
function deviceId() {
	const s = ls(); let id = null; try { id = s && s.getItem(DEVICE_KEY); } catch { id = null; }
	if (!id || !/^[a-z0-9]{6,24}$/.test(id)) { const a = new Uint32Array(2); try { crypto.getRandomValues(a); } catch { a[0] = Date.now() >>> 0; a[1] = (Math.random() * 2 ** 32) >>> 0; } id = ('d' + a[0].toString(36) + a[1].toString(36)).slice(0, 16).padEnd(8, '0'); try { s && s.setItem(DEVICE_KEY, id); } catch { /* a wallet that lasts the page */ } }
	return id;
}
export function wallet() { const s = ls(); try { return cleanWallet(JSON.parse((s && s.getItem(WALLET_KEY)) || 'null')); } catch { return cleanWallet(null); } }
const keep = w => { const s = ls(); try { s && s.setItem(WALLET_KEY, JSON.stringify(w)); return true; } catch { return false; } };
/** Stars this player has to spend. */
export const stars = () => balance(wallet());
/** Add stars earned on this device -> the new balance. */
export function earn(n) { const w = earned(wallet(), deviceId(), n); keep(w); return balance(w); }
/** Spend stars -> true, or false if there are not that many (nothing is spent). */
export function spend(n) { const w = spent(wallet(), deviceId(), n); if (!w) return false; keep(w); return true; }
/** Join a wallet the server sent (a bet's answer: the account's copy just after the stake left it) -> the new balance. */
export function absorb(w) { const m = mergeWallets(wallet(), w); keep(m); return balance(m); }
/** Bring this device and the account into step. `call(action, body)` reaches the server; a guest (no call) does nothing.
 *  -> 'saved' | 'offline' | 'guest'. Never throws. */
export async function sync(call) {
	if (!call) return 'guest';
	let r = null; try { r = await call('stars-sync', { wallet: wallet() }); } catch { r = null; }
	if (!r || r.error || !r.wallet) return 'offline';
	keep(mergeWallets(wallet(), r.wallet));   // (what was earned or spent here while the request was out stays: joining keeps the larger of each)
	return 'saved';
}
