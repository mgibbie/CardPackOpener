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
// Not here: starting it from the menu's lobby, and what a co-op run keeps (the next parts).

export const LL = { POLL_MS: 3000 };
export class LobbyLink {
	/** o: { Net: G.Net, call(action, body) -> Promise<{ ok, status, body }> (G.MicaAccount.call), id (the lobby's), host (the
	 *  host's name), isHost, later(fn, ms) } */
	constructor(o) {
		Object.assign(this, { Net: o.Net, call: o.call, id: o.id, host: o.host, isHost: !!o.isHost, later: o.later || ((fn, ms) => setTimeout(fn, ms)), onmessage: null, members: [], closed: false, gone: false, got: 0, sent: 0 });
		this.Net.open(o.id, this.isHost, o.host);
		this.Net.on((from, msg) => { if (this.closed || !msg || typeof msg.m3 !== 'string') return; this.got++; if (this.onmessage) this.onmessage({ data: msg.m3, from }); });
		this.poll();
	}
	/** Who is in the lobby (every LL.POLL_MS): the host links to each; a lobby that is gone ends the line. */
	async poll() {
		if (this.closed) return;
		try {
			const r = await this.call('msurv-lobby-poll', { id: this.id }), b = (r && r.body) || {};
			if (b.closed) this.gone = true;
			else if (b.lobby && Array.isArray(b.lobby.members)) { this.members = b.lobby.members.map((m) => m.name); this.Net.syncMembers(this.members); }
		} catch (e) { /* asked again */ }
		if (!this.closed) this.later(() => this.poll(), LL.POLL_MS);
	}
	/** The page's message: the host's to every guest, a guest's to the host. */
	postMessage(text) { this.sent++; const m = { m3: text }; if (this.isHost) this.Net.broadcast(m); else this.Net.toHost(m); }
	/** Is anyone linked (directly, or by the relay)? */
	get linked() { return this.Net.peers().some((u) => { const m = this.Net.mode(u); return m === 'direct' || m === 'relay'; }); }
	/** Is a link the slow one (the relay)? Then the page sends a second's frames at once. */
	get slow() { return this.Net.peers().some((u) => this.Net.mode(u) === 'relay'); }
	/** How each player is linked: { name: 'connecting' | 'direct' | 'relay' | 'failed' | 'closed' }. */
	get modes() { return Object.fromEntries(this.Net.peers().map((u) => [u, this.Net.mode(u)])); }
	close() { this.closed = true; try { this.Net.close(); } catch (e) { /* already closed */ } }
}
