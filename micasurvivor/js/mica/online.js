/* ============ mica/online.js — co-op signalling + relay over /api/mp (MicaSurvivor M5 batch 12b, not upstream) ============
 * Upstream negotiated WebRTC and relayed through Firebase's Realtime Database. Here both go through
 * the site's own backend (server/mp.mjs, the msurv-* actions), by polling, since it has no sockets:
 *
 *   signalling  msurv-signal-put {id, to:{name:[[seq, signal]...]}}  your whole window of signals
 *               msurv-signal-poll {id, since:{name:seq}}             what the others sent YOU, newer than since
 *               Polled every SIG_POLL_MS while a pair is still connecting; it stops once every data channel
 *               is open (or fell back to the relay). Signals are batched SIG_FLUSH_MS before one put.
 *   relay       msurv-relay-push {id, to, ack, since} / msurv-relay-pull {id, since}
 *               the fallback when two browsers can't connect directly (no TURN: symmetric NAT, some mobile
 *               data). Each player's row holds its UNACKNOWLEDGED messages to each relay peer (at most
 *               RELAY_WINDOW of them, RELAY_BUDGET bytes); the receivers ack by seq in their own pushes, and
 *               a push returns what is waiting for you, so one request a tick does both. At most one push
 *               every RELAY_MS (the server's floor is 250 ms per sender); with nothing to send, a pull, and a
 *               keep-alive push every RELAY_BEAT_MS so the others know you're still there. A relay peer whose
 *               row is older than RELAY_LOST_MS is gone (its tab closed): net.js drops it.
 *
 * Test hooks (window.__msurvNet, set before the page loads): {noRtc: true} skips WebRTC (relay only),
 * {ice: [...]} replaces the public STUN list, {lostMs, directMs} shorten the timeouts.
 *
 *   G.MicaNet.open(lobbyId, me, {signal(from, sig), relay(from, msg), lost(uid), closed()}) · close()
 *   signal(to, sig) · resetSignals(to) · wantSignals(bool) · relayPeer(uid, on) · relay(to, msg) · stats · snapshot()
 */
G.MicaNet = (() => {
  const hook = () => window.__msurvNet || {};
  const SIG_POLL_MS = 1000, SIG_FLUSH_MS = 200, SIG_WINDOW = 40;
  const RELAY_MS = 340, RELAY_BEAT_MS = 5000, RELAY_WINDOW = 30, RELAY_BUDGET = 48000;
  const lostMs = () => +hook().lostMs || 20000;

  let id = null, me = null, h = null, gen = 0;
  const call = (action, payload, opts) => G.MicaAccount.call(action, Object.assign({ id }, payload), opts);
  const stats = { sigPut: 0, sigPoll: 0, relayPush: 0, relayPull: 0, relayIn: 0, relayOut: 0 };

  // ---------------- signalling ----------------
  const sigOut = new Map();          // to -> [[seq, signal]...]
  let sigSince = {}, sigSeq = Date.now(), sigFlushT = 0, sigPollT = 0, sigWant = false, sigBusy = false;

  function signal(to, sig) {
    if (!id) return;
    const list = sigOut.get(to) || [];
    list.push([++sigSeq, sig]);
    while (list.length > SIG_WINDOW) list.shift();
    sigOut.set(to, list);
    if (!sigFlushT) sigFlushT = setTimeout(flushSignals, SIG_FLUSH_MS);
  }
  /** A new negotiation with `to` (the host reconnecting): its old signals are not sent again. */
  function resetSignals(to) { sigOut.delete(to); }

  async function flushSignals() {
    sigFlushT = 0;
    if (!id || !sigOut.size) return;
    const my = gen;
    stats.sigPut++;
    const r = await call('msurv-signal-put', { to: Object.fromEntries(sigOut) });
    if (my !== gen) return;
    if (r.body && r.body.closed) { gone(); return; }
    if (!r.ok && !sigFlushT) sigFlushT = setTimeout(flushSignals, r.status === 429 ? 1500 : 1000);   // retried, never lost
  }

  function wantSignals(on) {
    sigWant = !!on && !!id;
    if (sigWant && !sigPollT && !sigBusy) sigPollT = setTimeout(pollSignals, 50);
  }

  async function pollSignals() {
    sigPollT = 0;
    if (!id || !sigWant) return;
    const my = gen;
    sigBusy = true;
    stats.sigPoll++;
    const r = await call('msurv-signal-poll', { since: sigSince });
    sigBusy = false;
    if (my !== gen) return;
    if (r.body && r.body.closed) { gone(); return; }
    if (r.ok) {
      for (const [from, list] of Object.entries(r.body.msgs || {})) {
        for (const [seq, sig] of list.sort((a, b) => a[0] - b[0])) {
          if (seq <= (sigSince[from] || -1)) continue;
          sigSince[from] = seq;
          try { h.signal(from, sig); } catch (e) { console.warn('[MicaNet] signal:', e); }
        }
      }
    }
    if (sigWant && id && !sigPollT) sigPollT = setTimeout(pollSignals, r.status === 429 ? 2500 : SIG_POLL_MS);
  }

  // ---------------- relay ----------------
  const relayPeers = new Map();      // uid -> { since: when it became a relay peer }
  const rOut = new Map();            // to -> [[seq, msg]...] not yet acknowledged
  let rSince = {}, rSeq = Date.now(), rPushedSeq = 0, rAckSent = '', rLastPush = 0, rTimer = 0, rBusy = false;
  const heard = new Map();           // uid -> last time its row was fresh

  function relayPeer(u, on) {
    if (on) {
      if (!relayPeers.has(u)) { relayPeers.set(u, { since: Date.now() }); heard.delete(u); }
      if (!rTimer && !rBusy) rTimer = setTimeout(relayTick, 30);
    } else {
      relayPeers.delete(u); rOut.delete(u); heard.delete(u);
    }
  }

  /** Queues a message for a relay peer. Returns false if `to` is not one. */
  function relay(to, msg) {
    if (!id || !relayPeers.has(to)) return false;
    const list = rOut.get(to) || [];
    list.push([++rSeq, msg]);
    // The window stays bounded: past RELAY_WINDOW messages (or RELAY_BUDGET bytes) the oldest go.
    // Game frames carry the full state every time (upstream's 2026-10 fix), so a dropped one heals.
    while (list.length > RELAY_WINDOW) list.shift();
    let bytes = list.reduce((s, e) => s + JSON.stringify(e).length, 0);
    while (list.length > 1 && bytes > RELAY_BUDGET) bytes -= JSON.stringify(list.shift()).length;
    rOut.set(to, list);
    stats.relayOut++;
    return true;
  }

  async function relayTick() {
    rTimer = 0;
    if (!id || !relayPeers.size) return;
    const my = gen, now = Date.now();
    const newest = Math.max(0, ...[...rOut.values()].map(l => l.length ? l[l.length - 1][0] : 0));
    const ackKey = JSON.stringify(rSince);
    const push = newest > rPushedSeq || ackKey !== rAckSent || now - rLastPush >= RELAY_BEAT_MS;
    const to = {};
    for (const [u, list] of rOut) if (relayPeers.has(u) && list.length) to[u] = list;
    rBusy = true;
    let r;
    if (push) {
      stats.relayPush++;
      r = await call('msurv-relay-push', { to, ack: rSince, since: rSince });
      if (r.ok) { rPushedSeq = newest; rAckSent = ackKey; rLastPush = now; }
    } else {
      stats.relayPull++;
      r = await call('msurv-relay-pull', { since: rSince });
    }
    rBusy = false;
    if (my !== gen) return;
    if (r.body && r.body.closed) { gone(); return; }
    if (r.ok) {
      const b = r.body;
      for (const [from, list] of Object.entries(b.msgs || {})) {
        for (const [seq, msg] of list.sort((a, c) => a[0] - c[0])) {
          if (seq <= (rSince[from] || -1)) continue;
          rSince[from] = seq;
          stats.relayIn++;
          try { h.relay(from, msg); } catch (e) { console.warn('[MicaNet] relay:', e); }
        }
      }
      // what the others have received: no need to send it again
      for (const [from, seq] of Object.entries(b.acks || {})) {
        const list = rOut.get(from);
        if (list) { while (list.length && list[0][0] <= seq) list.shift(); }
      }
      const t = Date.now();
      for (const [u, age] of Object.entries(b.age || {})) heard.set(u, t - age);
      for (const [u, p] of relayPeers) {
        const last = Math.max(heard.get(u) || 0, p.since);
        if (t - last > lostMs()) { relayPeers.delete(u); rOut.delete(u); heard.delete(u); try { h.lost(u); } catch (e) { console.warn(e); } }
      }
    }
    if (id && relayPeers.size && !rTimer) rTimer = setTimeout(relayTick, r.status === 429 ? Math.max(RELAY_MS, +(r.body && r.body.wait) || 300) : RELAY_MS);
  }

  // ---------------- open / close ----------------

  function gone() { const cb = h && h.closed; close(); if (cb) try { cb(); } catch (e) { console.warn(e); } }

  function open(lobbyId, myName, handlers) {
    if (id === lobbyId) { h = handlers; return; }
    close();
    id = lobbyId; me = myName; h = handlers;
  }

  function close() {
    gen++;
    clearTimeout(sigFlushT); clearTimeout(sigPollT); clearTimeout(rTimer);
    sigFlushT = sigPollT = rTimer = 0; sigBusy = rBusy = false; sigWant = false;
    sigOut.clear(); sigSince = {};
    relayPeers.clear(); rOut.clear(); rSince = {}; heard.clear(); rPushedSeq = 0; rAckSent = ''; rLastPush = 0;
    id = null; me = null; h = null;
  }

  return {
    open, close, signal, resetSignals, wantSignals, relayPeer, relay, stats,
    get id() { return id; },
    /** For 12c (spectating / replays) and tests: the transport's state as plain data. */
    snapshot() {
      return { id, me, relayPeers: [...relayPeers.keys()], polling: sigWant, out: Object.fromEntries([...rOut].map(([u, l]) => [u, l.length])), stats: Object.assign({}, stats) };
    }
  };
})();
