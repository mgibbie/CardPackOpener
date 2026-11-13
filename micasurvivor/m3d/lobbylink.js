// lobbylink.js — MicaSurvivor 3D, co-op from the online lobby, first part (Plans/MICASURVIVOR_3D_PLAN.md §5.71): the line
// between the players of a lobby, on the 3D page.
// The 3D game's co-op (coop.js, expcoop.js, divecoop.js) speaks through a channel: postMessage(text) and onmessage({ data }).
// In the test room that channel is a BroadcastChannel: two windows of ONE browser. This is the same channel over the 2D
// game's own online line, unchanged (js/net/net.js G.Net, js/mica/online.js G.MicaNet): a star, the host in the middle,
// a direct browser-to-browser link (WebRTC) negotiated through the site's backend, and the backend's relay (slow: about
// a message a second) when two browsers cannot reach each other. So two players on different machines, in a lobby the
// site already has, can be in one 3D run.
//
// The page opens it with the lobby's id (?lobby=<id>): the host's address also has ?host=, a guest's ?join= and the
// host's name (?lh=). Both keep asking the lobby who is in it (which also tells the server they are still there); the
// host links to each member.
//
// A FRESH START (§5.75). The players come from the 2D game's lobby, where their browsers had already negotiated a link:
// those old messages are still on the server, and a new page that read them answered an offer that no longer exists
// (the host then dropped to the relay for the whole run: net.js tries the direct link once). So before the line opens,
// each page clears its own old messages, and waits until none of the others' old ones are left for it (they clear
// theirs when their page is up), LL.STALE_MS at most.

export const LL = { POLL_MS: 3000, STALE_MS: 15000 };
export class LobbyLink {
	/** o: { Net: G.Net, call(action, body) -> Promise<{ ok, status, body }> (G.MicaAccount.call), id (the lobby's), host (the
	 *  host's name), isHost, later(fn, ms), now() -> ms } */
	constructor(o) {
		Object.assign(this, { Net: o.Net, call: o.call, id: o.id, host: o.host, isHost: !!o.isHost, later: o.later || ((fn, ms) => setTimeout(fn, ms)), now: o.now || (() => Date.now()), onmessage: null, members: [], closed: false, gone: false, open: false, waited: 0, got: 0, sent: 0 });
		this.Net.on((from, msg) => { if (this.closed || !msg || typeof msg.m3 !== 'string') return; this.got++; if (this.onmessage) this.onmessage({ data: msg.m3, from }); });
		this.poll();
		this.ready = this.begin();
	}
	/** Clear what the 2D lobby's negotiation left, then open the line. */
	async begin() {
		const t0 = this.now(), wait = (ms) => new Promise((r) => this.later(r, ms));
		try { await this.call('msurv-signal-put', { id: this.id, to: {} }); } catch (e) { /* nothing of ours to clear */ }
		let stale = null;   // { name: the newest old message's number }: what was there when this page arrived
		while (!this.closed && this.now() - t0 < LL.STALE_MS) {
			let msgs = {};
			try { const r = await this.call('msurv-signal-poll', { id: this.id, since: {} }); msgs = (r && r.body && r.body.msgs) || {}; } catch (e) { break; }
			if (!stale) { stale = {}; for (const n of Object.keys(msgs)) stale[n] = Math.max(...msgs[n].map((e) => e[0])); }
			if (!Object.keys(stale).some((n) => (msgs[n] || []).some((e) => e[0] <= stale[n]))) break;   // (the others' new pages have cleared theirs)
			await wait(700);
		}
		this.waited = this.now() - t0;
		if (this.closed) return;
		this.Net.open(this.id, this.isHost, this.host);
		this.open = true;
		if (this.members.length) this.Net.syncMembers(this.members);
	}
	/** Who is in the lobby (every LL.POLL_MS): the host links to each; a lobby that is gone ends the line. */
	async poll() {
		if (this.closed) return;
		try {
			const r = await this.call('msurv-lobby-poll', { id: this.id }), b = (r && r.body) || {};
			if (b.closed) this.gone = true;
			else if (b.lobby && Array.isArray(b.lobby.members)) { this.members = b.lobby.members.map((m) => m.name); if (this.open) this.Net.syncMembers(this.members); }
		} catch (e) { /* asked again */ }
		if (!this.closed) this.later(() => this.poll(), LL.POLL_MS);
	}
	/** The page's message: the host's to every guest, a guest's to the host. */
	postMessage(text) { if (!this.open) return; this.sent++; const m = { m3: text }; if (this.isHost) this.Net.broadcast(m); else this.Net.toHost(m); }
	/** Is anyone linked (directly, or by the relay)? */
	get linked() { return this.open && this.Net.peers().some((u) => { const m = this.Net.mode(u); return m === 'direct' || m === 'relay'; }); }
	/** Is a link the slow one (the relay)? Then the page sends less often. */
	get slow() { return this.open && this.Net.peers().some((u) => this.Net.mode(u) === 'relay'); }
	/** How each player is linked: { name: 'connecting' | 'direct' | 'relay' | 'failed' | 'closed' }. */
	get modes() { return this.open ? Object.fromEntries(this.Net.peers().map((u) => [u, this.Net.mode(u)])) : {}; }
	close() { this.closed = true; try { this.Net.close(); } catch (e) { /* already closed */ } }
}
