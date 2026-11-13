/* ============ mica/social.js — friends, lobbies and invites on Magepunk accounts (MicaSurvivor M5 batch 12b, not upstream) ============
 * Replaces upstream's G.Social (js/net/social.js: Firebase nicknames, friendships, presence, invites and
 * Realtime Database rooms; its body is kept, never started) with the same API on the site's backend:
 *
 *   you            your Magepunk username (G.MicaAccount.name()); it is also your co-op uid. Guests
 *                  (no account) can't play online: friends need an account.
 *   friends        POST /api/mp `friends` (the site's mutual friends, with presence), `add-friend`
 *   presence       `msurv-invites` writes "in MicaSurvivor" (at most once a minute, only if you have friends)
 *   invites        `msurv-invite` (host -> a friend: a row + a bell message in their Magepunk inbox),
 *                  `msurv-invites` (polled every INV_UI_MS in the menus, INV_RUN_MS in a solo run),
 *                  `msurv-invite-decline`
 *   lobby          `msurv-lobby-create` / `-join` / `-leave` / `-poll` / `-update` (Pokémon, ready, open, start).
 *                  Polled every LOBBY_UI_MS on the menus; in a run only the host polls, every LOBBY_RUN_MS,
 *                  to keep it alive (the run itself goes over WebRTC or the relay, js/net/net.js).
 *
 * Events (G.Social.on(fn)): 'friends', 'presence', 'invites', 'room', 'room-closed', 'stop'.
 */
G.Social = (() => {
  const UP = G.Social;                       // upstream's module (Firebase): only its profileData() is reused
  const MAX_PLAYERS = 4;
  // MicaSurvivor U2: the co-op version this build plays (server/mp.mjs MSURV_COOP_V): a lobby carries it, and a client of
  // another version is refused at the join ("out of date"). A U2 lobby also carries the run: bmode + opts (base) or opts
  // {start, weekly} (Dive), and each member's Dive stages (dst) so a start from a saved stage can be checked.
  const COOP_V = 2;
  const ROUTES = ['forest', 'canyon', 'crater', 'reef', 'grotto', 'marsh', 'ruins', 'fungal', 'origin'];
  /** Your Dive stages {route: stage} (once the Expedition code is loaded; else none). */
  function dstOf() {
    const D = G.ExpDive;
    if (!D || !D.stageOf) return null;
    const out = {};
    for (const r of ROUTES) { const n = +D.stageOf(r) || 0; if (n > 0) out[r] = n; }
    return out;
  }
  const INVITE_TTL = 3 * 60 * 1000;
  // (window.__msurvNet {invMs, friendsMs}: tests shorten the slow polls)
  const H = window.__msurvNet || {};
  const NOFRIENDS_MS = 120000;
  const INV_UI_MS = +H.invMs || 15000, INV_RUN_MS = 30000, LOBBY_UI_MS = 2000, LOBBY_RUN_MS = 120000, FRIENDS_MS = +H.friendsMs || 20000;
  const listeners = new Set();
  const acc = () => G.MicaAccount;

  let started = false, me = null, uid = null;
  let friends = new Map();                   // name -> { uid, name, status:'ok', online, play, where }
  const invites = new Map();                 // from -> { from, name, room, at }
  let room = null;                           // { id, host, isHost, open, v, members:[{uid,name,dex,shiny,ready}], start, invited:[] }
  let playing = false, beatT = 0;
  let invAt = 0, lobbyAt = 0, friendsAt = 0, invBusy = false, lobbyBusy = false, friendsBusy = false;
  let lastStart = 0;

  function emit(what) { listeners.forEach(fn => { try { fn(what); } catch (e) { console.warn(e); } }); }
  const call = (a, p, o) => acc().call(a, p, o);
  const inUI = () => !G.Game || G.Game.state === 'ui';

  // ---------------- arranque ----------------

  /** → 'ok' (signed in to Magepunk) | 'off' (a guest: no online play) */
  async function start() {
    const name = acc() && acc().name();
    if (!name) return 'off';
    if (started) return 'ok';
    started = true;
    uid = name; me = { uid: name, name };
    clearInterval(beatT);
    beatT = setInterval(tick, 1000);
    addEventListener('pagehide', onHide);
    refreshPresence(true).then(() => { if (friends.size) pollInvites(); });
    return 'ok';
  }

  function stop() {
    if (!started) return;
    if (room) leaveRoom();
    clearInterval(beatT); beatT = 0;
    removeEventListener('pagehide', onHide);
    friends.clear(); invites.clear();
    started = false; me = null; uid = null; playing = false;
    emit('stop');
  }

  // Closing the tab: say goodbye in the run (upstream's leave(): a host ends it for everyone, a guest
  // is removed) and leave the lobby (a host's closes it), so nobody waits for you.
  function onHide(e) {
    if (e && e.persisted) return;            // (only into the back/forward cache: the page may come back)
    try { if (G.Coop.active) G.Coop.leave(); } catch (err) { console.warn(err); }
    if (room) call('msurv-lobby-leave', { id: room.id }, { keepalive: true });
  }

  /** Once a second: whatever poll is due (all of them skip a hidden tab, except the host keep-alive). */
  function tick() {
    if (!started) return;
    const now = Date.now(), visible = document.visibilityState !== 'hidden';
    // invites only reach players with friends: with none, the friends list is re-read every NOFRIENDS_MS instead
    if (visible && friends.size && now - invAt >= (inUI() ? INV_UI_MS : INV_RUN_MS)) pollInvites();
    if (visible && !friends.size && inUI() && now - friendsAt >= NOFRIENDS_MS) refreshPresence(true);
    if (room) {
      const every = inUI() ? LOBBY_UI_MS : room.isHost ? LOBBY_RUN_MS : 0;
      if (every && (visible || room.isHost) && now - lobbyAt >= every) pollRoom();
    }
    const screen = G.UI && (G.UI.isOpen('scr-friends') || G.UI.isOpen('scr-lobby'));
    if (screen && visible && now - friendsAt >= FRIENDS_MS) refreshPresence(true);
  }

  // ---------------- amigos ----------------

  /** The site's friends list with presence (`friends`). */
  async function refreshPresence(force = false) {
    if (!started || friendsBusy || (!force && Date.now() - friendsAt < FRIENDS_MS)) return;
    friendsBusy = true; friendsAt = Date.now();
    const r = await call('friends');
    friendsBusy = false;
    if (!r.ok || !started) return;
    const next = new Map();
    for (const f of r.body.friends || []) {
      const name = String(f.username || '').toLowerCase();
      if (!name) continue;
      const st = String(f.status || '');
      next.set(name, { uid: name, name, status: 'ok', online: !!f.online, play: !!f.online && st === 'micasurvivor:run',
                       here: !!f.online && st.startsWith('micasurvivor'), seen: 0,
                       where: st === 'micasurvivor:run' && f.region && f.region !== 'MicaSurvivor' ? String(f.region).slice(0, 48) : '' });   // (M5 lote 12c: what their run is, for "Live now")
    }
    friends = next;
    emit('friends'); emit('presence');
  }

  /** Adds a friend by username (the site's `add-friend`: friendships there are mutual). */
  async function request(name) {
    name = String(name || '').trim().toLowerCase();
    if (!started) return { ok: false, error: 'Inicia sesión para jugar con amigos.' };
    if (!/^[a-z0-9_.-]{1,40}$/.test(name)) return { ok: false, error: 'Escribe el nombre de usuario exacto de tu amigo.' };
    if (name === uid) return { ok: false, error: 'Ese eres tú.' };
    if (friends.has(name)) return { ok: false, error: 'Ya sois amigos.' };
    const r = await call('add-friend', { username: name });
    if (!r.ok) return { ok: false, error: r.status === 404 ? 'No hay ningún jugador con ese nombre.' : 'No se pudo añadir.' };
    await refreshPresence(true);
    return { ok: true, msg: 'Ahora eres amigo de ' + name };
  }

  // ---------------- invitaciones ----------------

  async function pollInvites() {
    if (!started || invBusy) return;
    invBusy = true; invAt = Date.now();
    const status = room ? (playing ? 'micasurvivor:run' : 'micasurvivor:lobby') : 'micasurvivor';
    // in a solo run: read-only (no presence write)
    const r = await call('msurv-invites', { status, quiet: !inUI() && !room ? 1 : 0 });
    invBusy = false;
    if (!r.ok || !started) return;
    const seen = new Set();
    let changed = false;
    for (const v of r.body.invites || []) {
      seen.add(v.from);
      if (room && room.id === v.id) continue;
      const cur = invites.get(v.from);
      if (!cur || cur.room !== v.id) { invites.set(v.from, { from: v.from, name: v.from, room: v.id, at: Date.now() - Math.max(0, (r.body.now || 0) - v.at) }); changed = true; }
    }
    for (const k of [...invites.keys()]) if (!seen.has(k)) { invites.delete(k); changed = true; }
    if (changed) emit('invites');
  }

  async function invite(other) {
    const f = friends.get(other);
    if (!f) return { ok: false, error: 'Sólo puedes invitar a tus amigos.' };
    if (room && room.members.length >= MAX_PLAYERS) return { ok: false, error: 'La sala está llena.' };
    if (room && !room.isHost) return { ok: false, error: 'Sólo el anfitrión de la sala puede invitar.' };
    if (!room) { const c = await createRoom(); if (!c) return { ok: false, error: 'No se pudo crear la sala.' }; }
    const r = await call('msurv-invite', { id: room.id, to: other });
    if (!r.ok) return { ok: false, error: errText(r) };
    if (r.body.lobby) applyLobby(r.body.lobby);
    return { ok: true, msg: 'Invitación enviada a ' + f.name };
  }

  async function acceptInvite(from) {
    const inv = invites.get(from);
    if (!inv || Date.now() - inv.at > INVITE_TTL) { invites.delete(from); emit('invites'); return { ok: false, error: 'La invitación ha caducado.' }; }
    invites.delete(from);
    emit('invites');
    return joinRoom(inv.room);
  }

  function declineInvite(from) {
    invites.delete(from);
    call('msurv-invite-decline', { from });
    emit('invites');
  }

  // ---------------- salas ----------------

  function memberInfo(exp) {
    const s = G.DB.save || {};
    // (DLC D11: in an Expedition lobby your card shows the League member you'll play)
    if ((exp || (room && room.mode)) && G.Expedition) { const d = G.Expedition.leaguePick(); const dst = dstOf(); return Object.assign({ dex: d || s.partner || 25, shiny: false }, dst ? { dst } : {}); }
    // (U2: a Party lobby shows the Pokémon of your party pick; the others, your partner)
    if (room && room.bmode === 'party' && G.Modes) return { dex: G.Modes.prefs().party || 25, shiny: false };
    return { dex: s.partner || 25, shiny: !!s.partnerShiny && G.DB.ownsShiny(s.partner) };
  }

  function errText(r) {
    const e = String((r.body && r.body.error) || '');
    if (r.status === 0) return 'Sin conexión. Inténtalo otra vez.';
    if (/closed/.test(e)) return 'Esa sala ya no existe.';
    if (/started/.test(e)) return 'La partida de esa sala ya ha empezado.';
    if (/full/.test(e)) return 'La sala está llena.';
    if (/friends/.test(e)) return 'Sólo los amigos del anfitrión pueden entrar.';
    if (/ready/.test(e)) return 'Todavía no están todos listos.';
    if (/at least one/.test(e)) return 'Necesitas al menos un amigo en la sala.';
    if (/already in/.test(e)) return 'Ya está en tu sala.';
    if (/slow down/.test(e)) return 'Demasiado deprisa: espera un momento.';
    if (/host.*out of date/.test(e)) return 'El juego del anfitrión no está actualizado: tiene que recargar la página.';   // (DLC D16: a base lobby of the old rules)
    if (/not reached/.test(e)) return G.I18n.f('No han llegado al piso de salida de esta ruta: {x}', ((r.body && r.body.who) || []).join(', '));   // (U2: a Dive from a stage)
    if (/out of date/.test(e)) return 'Tu juego no está actualizado: recarga la página.';   // (DLC D0b: an Expedition lobby of another version)
    return 'No se pudo entrar en la sala.';
  }

  /** The server's lobby view -> `room` (members host first). */
  function applyLobby(lb) {
    if (!lb) return;
    const was = room;
    const members = lb.members.map(m => ({ uid: m.name, name: m.name, dex: m.dex, shiny: !!m.shiny, ready: !!m.ready, dst: m.dst || null }))
      .sort((a, b) => (a.uid === lb.host ? -1 : b.uid === lb.host ? 1 : 0));
    room = { id: lb.id, host: lb.host, isHost: lb.host === uid, open: !!lb.open, v: lb.v, members, start: lb.start || null,
             mode: lb.mode || null, dv: lb.dv == null ? null : lb.dv,   // (DLC D0b: an Expedition lobby's mode + content version; base: null)
             rules: lb.rules || 1,                                       // (DLC D16: a base lobby's ruleset; an old host's: 1)
             map: lb.map || null, diff: lb.diff || null,                // (DLC D11: its map and tier)
             cv: lb.cv || null, bmode: lb.bmode || null, opts: lb.opts || null,   // (U2: the co-op version and the run's options)
             invited: lb.invited || (was && was.id === lb.id ? was.invited : []) };
    lobbyAt = Date.now();
    emit('room');
    // A guest learns of the start from the lobby too (the host's 'start' message may come first, over the
    // data channel or the relay; G.Flow.startCoop runs only once, from the menus).
    if (room.start && !room.isHost && room.start.at !== lastStart && inUI()) {
      lastStart = room.start.at;
      if (G.Flow && G.Flow.startCoop) G.Flow.startCoop(Object.assign({ k: 'start' }, room.start));
    }
  }

  /** 3D co-op (Plans/MICASURVIVOR_3D_PLAN.md §5.74): back from a 3D run to the lobby it was started from. The lobby is
   *  still on the server, started: its old start is NOT played again here, and the host opens it again (everyone is
   *  "not ready" for the next run, as after a 2D one). -> whether you are in that lobby again */
  async function resumeRoom(id) {
    if (!uid || !/^[0-9a-f]{12}$/.test(String(id || ''))) return false;
    if (room && room.id !== id) return false;
    const r = await call('msurv-lobby-poll', { id });
    const lb = r.ok && r.body ? r.body.lobby : null;
    if (!lb) return false;
    if (lb.start) lastStart = lb.start.at;
    applyLobby(lb);
    if (room && room.isHost && (room.start || !room.open)) await update({ open: true });
    return !!room;
  }
  /** opts (DLC D0b): {mode: 'exp-…'} for an Expedition lobby (it carries this build's content version, dv); none = base.
   *  (DLC D11: and {map, diff}, the map + tier everyone plays.) */
  async function createRoom(opts) {
    if (room) return room;
    const X = G.Expedition, exp = opts && X && X.isExp(opts.mode);
    // (DLC D16: a base lobby carries this build's ruleset: the server refuses a guest of other rules)
    // (U2: and its co-op version and the run: {bmode, opts} for a base lobby, {opts: {start, weekly}} for a Dive one)
    const cfg = { opts: (opts && opts.opts) || {} };
    if (!exp) cfg.bmode = (opts && opts.bmode) || 'normal';
    const r = await call('msurv-lobby-create', Object.assign(exp ? Object.assign(memberInfo(true), { mode: opts.mode, dv: X.DV }, opts.map ? { map: opts.map, diff: opts.diff || 'normal' } : {}) : Object.assign(memberInfo(), { rules: G.Player.RULES }), { cv: COOP_V, cfg }));
    if (!r.ok || !r.body.lobby) return null;
    applyLobby(r.body.lobby);
    return room;
  }

  async function joinRoom(id) {
    if (room && room.id === id) return { ok: true };
    if (room) await leaveRoom();
    // (DLC D0b: dv = this build's Expedition content version; the server refuses an Expedition lobby of another one)
    // (DLC D16: and rules = this build's ruleset; a base lobby of other rules refuses the join)
    const r = await call('msurv-lobby-join', Object.assign({ id }, memberInfo(), G.Expedition ? { dv: G.Expedition.DV } : {}, { rules: G.Player.RULES, cv: COOP_V }, dstOf() ? { dst: dstOf() } : {}));
    if (!r.ok || !r.body.lobby) return { ok: false, error: errText(r) };
    applyLobby(r.body.lobby);
    if (room && room.mode && G.Expedition) refreshMember();   // (DLC D11: an Expedition lobby: your card shows your League member)
    // (U2: a Dive lobby from a stage: load the Expedition code and save so your stages reach the host)
    if (room && room.mode === 'exp-dive' && G.Expedition && !G.ExpDive) G.Expedition.load().then(() => (G.ExpSave && G.ExpSave.open ? G.ExpSave.open() : null)).then(() => refreshMember(), e => console.warn(e));
    return { ok: true };
  }

  function closedRoom() {
    if (!room) return;
    room = null;
    emit('room-closed');
    emit('room');
  }

  async function leaveRoom() {
    if (!room) return;
    const r = room;
    room = null;
    emit('room');
    await call('msurv-lobby-leave', { id: r.id });
  }

  async function pollRoom() {
    if (!room || lobbyBusy) return;
    lobbyBusy = true; lobbyAt = Date.now();
    const id = room.id;
    const r = await call('msurv-lobby-poll', { id, v: room.v });
    lobbyBusy = false;
    if (!room || room.id !== id) return;
    if (r.ok && r.body.closed) { closedRoom(); return; }
    // (M5 batch 12b: the host's relay minutes left today, for the lobby's warning)
    if (r.ok && r.body.relayLeft != null && r.body.relayLeft !== G.MicaNet.relayLeft) { G.MicaNet.relayLeft = r.body.relayLeft; if (!r.body.lobby) emit('room'); }
    if (r.ok && r.body.lobby) applyLobby(r.body.lobby);
  }

  async function update(patch) {
    if (!room) return { ok: false };
    const id = room.id;
    const r = await call('msurv-lobby-update', Object.assign({ id }, patch));
    // (DLC D12 fix: you left / changed lobby while this was in flight, e.g. D11's refreshMember right after a join and then a
    //  refused start: its answer must not bring the old lobby back)
    if (!room || room.id !== id) return { ok: false };
    if (r.body && r.body.closed) { closedRoom(); return { ok: false, error: errText(r) }; }
    if (!r.ok) return { ok: false, error: errText(r) };
    applyLobby(r.body.lobby);
    return { ok: true };
  }

  /** El anfitrión vuelve a abrir la sala al acabar la partida (y los demás vuelven a "no listo"). */
  function setOpen(open) { if (room && room.isHost) update({ open: !!open }); }
  /** Tu Pokémon en la sala (si cambias de compañero). */
  function refreshMember() { if (room) update(memberInfo()); }
  function setReady(ready) { return update({ ready: !!ready }); }
  /** U2: the host changes the lobby's run ({bmode, opts} / {opts, map} for a Dive); the guests ready up again. */
  function setCfg(cfg) { return update({ cfg }); }
  /** El anfitrión empieza: el servidor comprueba que estáis todos listos y guarda la semilla y los miembros. */
  async function startRoom(seed, d3) {   // (d3: this run is the 3D one: js/ui/play-ui.js coop3d)
    const r = await update({ start: d3 ? { seed, d3: true } : { seed } });
    return r.ok && room && room.start ? { ok: true, cfg: Object.assign({ k: 'start' }, room.start) } : r;
  }
  function setPlaying(p) {
    if (playing === !!p) return;
    playing = !!p;
    invAt = 0;      // the presence follows on the next tick
  }

  return {
    start, stop, request, invite, acceptInvite, declineInvite,
    createRoom, joinRoom, resumeRoom, leaveRoom, setOpen, refreshMember, setReady, setCfg, startRoom, dstOf, COOP_V, setPlaying, refreshPresence,
    pollRoom, pollInvites,
    // upstream's profile functions: no public profiles on Magepunk (yet), only your own preview
    claimNick: async () => ({ ok: false }),
    accept: async () => ({ ok: false }),
    remove: async () => ({ ok: false }),
    publishProfile() {},
    async getProfile(other) { return other === uid ? profileData() : null; },
    profileData,
    on(fn) { listeners.add(fn); }, off(fn) { listeners.delete(fn); },
    get me() { return me; },
    get started() { return started; },
    get friends() { return [...friends.values()]; },
    get invites() { return [...invites.values()]; },
    get room() { return room; },
    get uid() { return uid; },
    now: () => Date.now(),
    VALID: /^[a-z0-9_.-]{1,40}$/, MAX_PLAYERS
  };

  function profileData() { return Object.assign(UP.profileData(), { name: me ? me.name : G.DB.user }); }
})();
