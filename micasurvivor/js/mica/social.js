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
                       here: !!f.online && st.startsWith('micasurvivor'), seen: 0 });
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

  function memberInfo() {
    const s = G.DB.save || {};
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
    return 'No se pudo entrar en la sala.';
  }

  /** The server's lobby view -> `room` (members host first). */
  function applyLobby(lb) {
    if (!lb) return;
    const was = room;
    const members = lb.members.map(m => ({ uid: m.name, name: m.name, dex: m.dex, shiny: !!m.shiny, ready: !!m.ready }))
      .sort((a, b) => (a.uid === lb.host ? -1 : b.uid === lb.host ? 1 : 0));
    room = { id: lb.id, host: lb.host, isHost: lb.host === uid, open: !!lb.open, v: lb.v, members, start: lb.start || null,
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

  async function createRoom() {
    if (room) return room;
    const r = await call('msurv-lobby-create', memberInfo());
    if (!r.ok || !r.body.lobby) return null;
    applyLobby(r.body.lobby);
    return room;
  }

  async function joinRoom(id) {
    if (room && room.id === id) return { ok: true };
    if (room) await leaveRoom();
    const r = await call('msurv-lobby-join', Object.assign({ id }, memberInfo()));
    if (!r.ok || !r.body.lobby) return { ok: false, error: errText(r) };
    applyLobby(r.body.lobby);
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
    if (r.ok && r.body.lobby) applyLobby(r.body.lobby);
  }

  async function update(patch) {
    if (!room) return { ok: false };
    const r = await call('msurv-lobby-update', Object.assign({ id: room.id }, patch));
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
  /** El anfitrión empieza: el servidor comprueba que estáis todos listos y guarda la semilla y los miembros. */
  async function startRoom(seed) {
    const r = await update({ start: { seed } });
    return r.ok && room && room.start ? { ok: true, cfg: Object.assign({ k: 'start' }, room.start) } : r;
  }
  function setPlaying(p) {
    if (playing === !!p) return;
    playing = !!p;
    invAt = 0;      // the presence follows on the next tick
  }

  return {
    start, stop, request, invite, acceptInvite, declineInvite,
    createRoom, joinRoom, leaveRoom, setOpen, refreshMember, setReady, startRoom, setPlaying, refreshPresence,
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
