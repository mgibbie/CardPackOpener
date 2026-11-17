// pocket_trade.mjs — Pocket Enhanced: the free packs that arrive with time (the pack inbox, as Battlecards has).
// (Card trading is the site's one trading system, server/trade.mjs; the Pocket side of it is pocketenhanced/js/trade.js.)
//
// pkinbox:<user> = { rev, base, inbox, last }. pkinbox-get -> { inbox, cap, timerMs, nextMs };
// pkinbox-claim { id } -> { claimed }: the inbox is emptied in one write that remembers the claim's id and size, so a
// claim asked twice (a lost answer) is answered the same way and paid once. The page adds the packs to the collection.
import * as PT from '../pocketenhanced/js/packtimer.js';


export async function handlePktrade(ctx) {
	const { action, body, store, username, json, now } = ctx;
	if (!username) return json({ error: 'not logged in' }, 401);

	// ---------- the pack inbox ----------
	if (action === 'pkinbox-get' || action === 'pkinbox-claim') {
		const key = 'pkinbox:' + username;
		for (let tries = 0; tries < 4; tries++) {
			const cur = await store.get(key), rev = (cur && Number.isInteger(cur.rev) && cur.rev > 0) ? cur.rev : 0;
			const st = PT.accrue(cur, now), last = cur && cur.last && typeof cur.last.id === 'string' ? cur.last : null;
			const out = s => ({ inbox: s.inbox, cap: PT.PACK_INBOX_CAP, timerMs: PT.PACK_TIMER_MS, nextMs: PT.etaMs(s, now) });
			if (action === 'pkinbox-get') {
				const moved = !cur || st.inbox !== (cur.inbox || 0) || st.base !== cur.base;
				if (moved && !(await store.setIfRev(key, { rev: rev + 1, base: st.base, inbox: st.inbox, last, at: now }, rev))) continue;
				return json(out(st));
			}
			const id = /^[a-z0-9]{6,24}$/.test(String(body.id || '')) ? String(body.id) : null;
			if (!id) return json({ error: 'a claim needs an id' }, 400);
			if (last && last.id === id) return json({ claimed: last.n, again: true, ...out(st) });   // (asked before: the same answer, paid once)
			const c = PT.claim(st, now);
			if (!c.claimed) return json({ claimed: 0, ...out(st) });
			if (await store.setIfRev(key, { rev: rev + 1, base: c.st.base, inbox: 0, last: { id, n: c.claimed }, at: now }, rev)) return json({ claimed: c.claimed, ...out(c.st) });
		}
		return json({ error: 'busy: try again' }, 409);
	}

	return json({ error: 'unknown action' }, 400);
}
