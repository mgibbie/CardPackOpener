// stars.mjs — a signed-in player's star wallet, kept on their account (site/stars.js has the wallet's rules).
//
// One row per account, `stars:<user>` = { rev, e, s, at }. It is never swept: it is a save.
//   stars-sync { wallet } -> { wallet, stars }   the account's copy joined with the device's, written if that changed it
// Joining takes the larger count for each device (the counters only grow), so the write is the same whichever device
// gets there first: a sync can be repeated or raced without losing or doubling a star.
import { cleanWallet, mergeWallets, sameWallet, balance } from '../site/stars.js';

export async function handleStars({ action, body, store, username, json, now }) {
	if (!username) return json({ error: 'not logged in' }, 401);
	if (action !== 'stars-sync') return json({ error: 'unknown action' }, 400);
	for (let i = 0; i < 6; i++) {
		const cur = await store.get('stars:' + username), rev = (cur && Number.isInteger(cur.rev) && cur.rev > 0) ? cur.rev : 0;
		const held = cleanWallet(cur), next = mergeWallets(held, body.wallet);
		if (cur && sameWallet(held, next)) return json({ wallet: held, stars: balance(held) });
		// (th: stars held for a trade (server/trade.mjs), kept as they are: only a trade moves them)
		if (await store.setIfRev('stars:' + username, { rev: rev + 1, e: next.e, s: next.s, at: now, ...(cur && cur.th ? { th: cur.th } : {}) }, rev)) return json({ wallet: next, stars: balance(next) });
	}
	return json({ error: 'busy: try again' }, 409);
}
