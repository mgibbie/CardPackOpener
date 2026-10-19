/* ============ net.js — conexión entre los jugadores de una sala ============
 * Topología en estrella: el ANFITRIÓN habla con cada invitado; los invitados
 * sólo hablan con el anfitrión (él reenvía lo que haga falta).
 *
 * Dos caminos, a la vez:
 *   directo  WebRTC (canal de datos entre navegadores, sin pasar por ningún
 *            servidor). La negociación (señalización) va por la base de datos.
 *            Sólo con STUN gratuito de Google: si la red no deja conectar
 *            directo (algunos routers y datos móviles), esa pareja no puede
 *            jugar junta. El TURN de Cloudflare se QUITÓ el 15-10-2026 (de pago).
 *   relé     (APAGADO) los mensajes irían por la Realtime Database:
 *            rooms/{sala}/q/{destinatario}/{id}, a 1 $ el GB.
 *
 * MicaSurvivor (M5 batch 12b): no Firebase. The signalling AND the relay go through the site's
 * backend (/api/mp, by polling: js/mica/online.js, G.MicaNet), the relay is ON again as the
 * fallback when two browsers can't connect directly, and the ICE servers are public STUN only
 * (no TURN). A pair that only has the relay plays at upstream's slow rate (3 messages a second).
 *
 * Se envía por el canal directo si está abierto; si no, por el relé. El que
 * recibe escucha los dos, así que no hace falta ponerse de acuerdo.
 *
 * API:  open(roomId, isHost, hostUid) · close() · send(to, msg) · toHost(msg)
 *       broadcast(msg) · on(fn(from, msg)) · onPeer(fn(uid, state))
 *       peers() · mode(uid) -> 'connecting' | 'direct' | 'relay' | 'closed'
 */
G.Net = (() => {
  // MicaSurvivor (M5 batch 12b): public STUN only (Google + Cloudflare), used only once you are in a
  // co-op lobby. window.__msurvNet (tests): {ice} replaces it, {noRtc} skips WebRTC, {directMs}.
  const hook = () => window.__msurvNet || {};
  const ICE_PUBLIC = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  const iceServers = () => (Array.isArray(hook().ice) ? hook().ice : ICE_PUBLIC);
  const directTimeout = () => +hook().directMs || 9000;   // ms para conseguir canal directo antes de usar el relé
  const DISCONNECT_MS = 4000;
  // Relé por la Realtime Database APAGADO (12-10-2026): a 1 $ el GB era lo que más
  // costaba del cooperativo. Sin conexión directa, esa pareja no puede jugar
  // junta ('failed') y el anfitrión lo reintenta cada RETRY_MS. Por la base de datos
  // sólo pasa la señalización (unos pocos mensajes pequeños para conectarse).
  // MicaSurvivor (M5 batch 12b): the relay is back, over /api/mp (G.MicaNet), capped by the server.
  const ALLOW_RELAY = true, RETRY_MS = 15000;

  let uid = null, roomId = null, isHost = false, hostUid = null;
  const peers = new Map();         // uid -> { pc, dc, mode, timer }
  const handlers = new Set(), peerHandlers = new Set();
  let stats = { sent: 0, recv: 0, relaySent: 0 };

  function emitPeer(u) {
    const p = peers.get(u);
    peerHandlers.forEach(fn => { try { fn(u, p ? p.mode : 'closed'); } catch (e) { console.warn(e); } });
    pollSignals();
  }

  /** MicaSurvivor (M5 batch 12b): signalling is polled only while some pair is still connecting. */
  function pollSignals() {
    G.MicaNet.wantSignals(!!roomId && [...peers.values()].some(p => p.mode === 'connecting'));
  }

  // ---------------- apertura ----------------

  function open(id, host, hostId) {
    if (roomId === id) return;
    close();
    // MicaSurvivor (M5 batch 12b): your Magepunk username is your uid; messages come from G.MicaNet.
    uid = G.Social.uid;
    roomId = id; isHost = host; hostUid = hostId;
    G.MicaNet.open(id, uid, {
      signal: (from, sig) => onSignal(from, sig),
      relay: (from, msg) => { const p = peers.get(from); if (p && p.mode !== 'closed') deliver(from, msg); },
      // a relay peer that stopped writing (its tab closed): gone, as a closed data channel
      lost: u => { const p = peers.get(u); if (p && p.mode === 'relay') drop(u); },
      closed: () => { for (const u of [...peers.keys()]) drop(u); }
    });
    // Invitado: hueco para el anfitrión desde ya (se sustituye al llegar su
    // oferta). Así, si no llega nunca, se sigue por el relé y se sabe cuándo se va.
    if (!isHost) {
      const p = { pc: null, dc: null, mode: 'connecting', timer: 0 };
      const toRelay = () => { if (p.mode === 'connecting') { p.mode = ALLOW_RELAY ? 'relay' : 'failed'; if (p.mode === 'relay') G.MicaNet.relayPeer(hostId, true); emitPeer(hostId); } };
      p.timer = setTimeout(toRelay, hook().noRtc ? 0 : directTimeout() + 3000);
      peers.set(hostId, p);
    }
    pollSignals();
  }

  function close() {
    for (const u of [...peers.keys()]) drop(u);
    G.MicaNet.close();
    roomId = null; isHost = false; hostUid = null;
  }

  /** El anfitrión llama a esto cuando cambian los miembros de la sala. */
  function syncMembers(uids) {
    if (!roomId) return;
    if (isHost) {
      for (const u of uids) if (u !== uid && !peers.has(u)) connect(u);
      for (const u of [...peers.keys()]) if (!uids.includes(u)) drop(u);
    } else if (!uids.includes(hostUid)) {
      drop(hostUid);
    }
  }

  // ---------------- WebRTC ----------------

  function newPeer(u) {
    const p = { pc: null, dc: null, mode: 'connecting', timer: 0 };
    peers.set(u, p);
    // Sin WebRTC (navegador antiguo o bloqueado): directamente por el relé.
    let pc;
    try {
      if (hook().noRtc) throw new Error('WebRTC off (test hook)');
      pc = p.pc = new RTCPeerConnection({ iceServers: iceServers() });
    }
    catch (e) { p.mode = 'relay'; G.MicaNet.relayPeer(u, true); emitPeer(u); return p; }
    pc.onicecandidate = e => { if (e.candidate) signal(u, { c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && p.mode !== 'closed') useRelay(u);
      // MicaSurvivor (M5 batch 12b): 'disconnected' for DISCONNECT_MS (the other tab crashed or lost its
      // network: 'failed' only comes ~30 s later) -> the relay, where a peer that never writes is dropped
      // (G.MicaNet lostMs); back to 'connected' -> back to the data channel.
      clearTimeout(p.discT);
      if (pc.connectionState === 'disconnected' && p.mode === 'direct') {
        p.discT = setTimeout(() => { if (peers.get(u) === p && pc.connectionState !== 'connected' && p.mode === 'direct') useRelay(u); }, DISCONNECT_MS);
      } else if (pc.connectionState === 'connected' && p.mode === 'relay' && p.dc && p.dc.readyState === 'open') {
        p.mode = 'direct'; G.MicaNet.relayPeer(u, false); emitPeer(u);
      }
    };
    // Si en unos segundos no hay canal directo, se sigue por el relé.
    p.timer = setTimeout(() => { if (p.mode === 'connecting') useRelay(u); }, directTimeout());
    emitPeer(u);
    return p;
  }

  function wireChannel(u, p, dc) {
    p.dc = dc;
    // (MicaSurvivor: a pair on the relay that later gets its channel moves over to it)
    dc.onopen = () => { clearTimeout(p.timer); p.mode = 'direct'; G.MicaNet.relayPeer(u, false); emitPeer(u); };
    dc.onclose = () => { if (p.mode === 'direct') { p.mode = 'connecting'; useRelay(u); } };
    dc.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      deliver(u, m);
    };
  }

  function useRelay(u) {
    const p = peers.get(u);
    if (!p || p.mode === 'closed' || p.mode === 'failed') return;
    if (p.mode === 'direct' && p.dc && p.dc.readyState === 'open' && p.pc && p.pc.connectionState === 'connected') return;
    if (ALLOW_RELAY) { clearTimeout(p.timer); p.mode = 'relay'; G.MicaNet.relayPeer(u, true); emitPeer(u); return; }
    // Sin relé: no se puede jugar con esa persona por ahora. El anfitrión reintenta.
    clearTimeout(p.timer);
    p.mode = 'failed';
    try { if (p.pc) p.pc.close(); } catch (e) { /* nada */ }
    emitPeer(u);
    if (isHost) p.timer = setTimeout(() => { if (peers.get(u) === p && p.mode === 'failed' && roomId) { drop(u, true); connect(u); } }, RETRY_MS);
  }

  /** Anfitrión: abre conexión con un invitado. */
  async function connect(u) {
    if (!roomId || peers.has(u)) return;
    G.MicaNet.resetSignals(u);       // (MicaSurvivor: a fresh negotiation window)
    const p = newPeer(u);
    if (!p.pc) return;
    wireChannel(u, p, p.pc.createDataChannel('g', { ordered: true }));
    try {
      const offer = await p.pc.createOffer();
      await p.pc.setLocalDescription(offer);
      signal(u, { sdp: p.pc.localDescription.toJSON() });
    } catch (e) { useRelay(u); }
  }

  const pendingIce = new Map();     // candidatos que llegan antes que la oferta

  async function onSignal(from, sig) {
    let p = peers.get(from);
    try {
      if (sig.sdp && sig.sdp.type === 'offer') {
        if (isHost) return;
        if (p) drop(from, true);
        G.MicaNet.resetSignals(from);
        p = newPeer(from);
        if (!p.pc) return;
        p.pc.ondatachannel = e => wireChannel(from, p, e.channel);
        await p.pc.setRemoteDescription(sig.sdp);
        const ans = await p.pc.createAnswer();
        await p.pc.setLocalDescription(ans);
        signal(from, { sdp: p.pc.localDescription.toJSON() });
        for (const c of pendingIce.get(from) || []) await p.pc.addIceCandidate(c).catch(() => {});
        pendingIce.delete(from);
      } else if (sig.sdp && sig.sdp.type === 'answer') {
        if (p && p.pc) await p.pc.setRemoteDescription(sig.sdp);
      } else if (sig.c) {
        if (p && p.pc && p.pc.remoteDescription) await p.pc.addIceCandidate(sig.c).catch(() => {});
        else { if (!pendingIce.has(from)) pendingIce.set(from, []); pendingIce.get(from).push(sig.c); }
      }
    } catch (e) {
      console.warn('[Net] señalización:', e.message);
      useRelay(from);
    }
  }

  function signal(to, sig) { relayPush(to, { f: uid, sig }); }

  function drop(u, silent) {
    const p = peers.get(u);
    if (!p) return;
    clearTimeout(p.timer); clearTimeout(p.discT);
    p.mode = 'closed';
    G.MicaNet.relayPeer(u, false);
    try { if (p.dc) p.dc.close(); } catch (e) { /* nada */ }
    try { if (p.pc) p.pc.close(); } catch (e) { /* nada */ }
    peers.delete(u);
    if (!silent) emitPeer(u);
  }

  // ---------------- envío / recepción ----------------

  // MicaSurvivor (M5 batch 12b): signals and relayed messages go through G.MicaNet (/api/mp).
  function relayPush(to, env) {
    if (!roomId) return;
    if (env.sig) G.MicaNet.signal(to, env.sig);
    else G.MicaNet.relay(to, env.d);
  }

  function send(to, msg) {
    if (!roomId) return;
    const p = peers.get(to);
    stats.sent++;
    if (p && p.mode === 'direct' && p.dc && p.dc.readyState === 'open') {   // (MicaSurvivor 12b: a pair moved to the relay stops using a dead channel)
      try { p.dc.send(JSON.stringify(msg)); return; } catch (e) { /* cae al relé */ }
    }
    // Sin relé, los datos de la partida no van por la base de datos (se pierden: esa
    // pareja no está conectada). Sólo pasa el aviso de empezar.
    // MicaSurvivor (M5 batch 12b): only a pair that IS on the relay uses it (a pair still connecting
    // sends nothing, so no D1 write is spent on it); the start also reaches guests through the lobby.
    if (!ALLOW_RELAY || !p || p.mode !== 'relay') return;
    stats.relaySent++;
    relayPush(to, { f: uid, d: msg });
  }

  function toHost(msg) { if (!isHost && hostUid) send(hostUid, msg); }
  function broadcast(msg, except) { for (const u of peers.keys()) if (u !== except) send(u, msg); }

  function deliver(from, msg) {
    stats.recv++;
    handlers.forEach(fn => { try { fn(from, msg); } catch (e) { console.error('[Net] mensaje:', e); } });
  }

  return {
    open, close, syncMembers, send, toHost, broadcast,
    on(fn) { handlers.add(fn); }, off(fn) { handlers.delete(fn); },
    onPeer(fn) { peerHandlers.add(fn); },
    mode(u) { const p = peers.get(u); return p ? p.mode : 'closed'; },
    /** ¿Va por el relé (o no hay conexión)? Entonces se manda menos a menudo. */
    slow(u) { const p = peers.get(u); return !p || p.mode !== 'direct'; },
    peers() { return [...peers.keys()]; },
    /** MicaSurvivor (M5 batch 12b): plain data for tests and for 12c (spectating / replays). */
    snapshot() { return { roomId, uid, isHost, hostUid, peers: Object.fromEntries([...peers].map(([u, p]) => [u, p.mode])), stats: Object.assign({}, stats), transport: G.MicaNet.snapshot() }; },
    get open_() { return !!roomId; },
    get isHost() { return isHost; },
    get uid() { return uid; },
    get hostUid() { return hostUid; },
    stats
  };
})();
