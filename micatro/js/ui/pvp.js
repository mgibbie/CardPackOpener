// Micatro Multiplayer (PvP) — the client: the Multiplayer screen, the lobby, and the match loop that keeps this player's
// engine in step with the server's referee (server/micatro_pvp.mjs). The rules themselves are engine/pvp.js.
//
//   Multiplayer (main menu, signed in) -> Create lobby (the New Run screen picks the deck / stake / seed / mods, which
//   become the lobby's: the host's set is what BOTH play, the guest's own saved settings are never touched)
//   | Join by code | a friend's lobby (also from the site's friends list: /micatro/?join=CODE)
//   Lobby: the code + its link, the host's options (lives, PvP from ante, a life on a failed blind, comeback money), the
//   players, READY (guest) / START (host), Leave.
//   The match: both start the same seed. Each move the player makes is reported as it lands (a failed / beaten / skipped
//   blind, every Nemesis hand), the opponent's summary is polled (1 s in a Nemesis round, 2.5 s elsewhere) and the
//   referee's decisions are applied as RECORDED engine actions (pvp_start_blind / pvp_outcome / pvp_end), so the run's
//   recipe resumes and replays exactly. A reload rejoins (mtpvp-mine + the local PvP save); a player quiet for 120 s
//   forfeits (server); the end screen shows both players' jokers + decks; Rematch / Leave.
import { locText, NEMESIS } from './pvphud.js';
import { esc } from './markup.js';

export const PVP_PROTOCOL = 1;
const META_KEY = 'micatro_pvp_meta_v1';   // {id, n}: the match this device's PvP save belongs to
const LOBBY_MS = 2000, FAST_MS = 1000, SLOW_MS = 2500;
const AWAY_MS = 8000, GRACE_S = 120;
const DEFAULT_OPTS = { lives: 4, pvpStart: 2, deathOnLoss: true, comeback: true };

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const btn = (label, cls, fn) => { const b = h('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
const readMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) { return null; } };
const writeMeta = (m) => { try { if (m) localStorage.setItem(META_KEY, JSON.stringify(m)); else localStorage.removeItem(META_KEY); } catch (e) { /* ignore */ } };

/**
 * ctx = {net, UI, Engine, ensureMods, withRequirements(ids), currentPins(ids), engineRev, bannedKeys(), board, stage,
 *        me(), toast(msg), showMenu(), newRunScreen(o), startMatchRun(args) -> Promise, resumeMatchRun(recipe) -> bool,
 *        act(a) -> {ok}, idle() -> bool, view() -> the live view | null, redraw(), endPublishing(won)}
 */
export function createPvp(ctx) {
  const call = (a, b) => ctx.net.pvpCall(a, b);
  let lobby = null;       // the server's lobby view
  let timer = null, busy = false, stopped = true;
  let skew = 0;           // server clock - ours
  let opp = null;         // {name, age, seq, sum, end}
  let oseq = null;
  let mySeq = 0, mySum = '';
  let matchN = 0;         // the match this client's run plays (lobby.m.n)
  let inMatch = false;
  let meReady = false, readyAnte = 0;
  let handN = 0, handSent = '', nemesisAnte = 0;
  let outcomeApplied = 0, endApplied = false, endShown = false, endData = null;
  let countdownTimer = null, countdown = 0;
  let lobbyEl = null;
  const me = () => ctx.me();

  // ---------------------------------------------------------------- the Multiplayer screen
  function open() {
    if (!ctx.net.isLoggedIn()) { ctx.net.requireLogin(); return; }
    const el = h('div', 'pvp-menu');
    el.appendChild(h('p', 'pvp-intro', 'Play a friend on the same seed. From ante 2 every Boss Blind is <b>Your Nemesis</b>: both play all their hands, the lower score loses a life. Last one with lives wins.'));
    const row = h('div', 'pvp-row');
    row.appendChild(btn('Create lobby', 'blue big b-pvp-create', () => createFlow()));
    el.appendChild(row);
    const jr = h('div', 'pvp-join');
    jr.innerHTML = '<input class="pvp-code" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false">';
    const inp = jr.querySelector('input');
    inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
    inp.addEventListener('pointerdown', (e) => e.stopPropagation());
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinFlow(inp.value); e.stopPropagation(); });
    jr.appendChild(btn('Join', 'orange b-pvp-join', () => joinFlow(inp.value)));
    el.appendChild(jr);
    const fr = h('div', 'pvp-friends', '<div class="muted">Friends in a Micatro lobby…</div>');
    el.appendChild(fr);
    ctx.UI.modal(el, { title: 'Multiplayer', cls: 'pvp-modal' });
    ctx.net.pvpCall('friends', {}).then((d) => {
      const list = ((d && d.friends) || []).filter((f) => f.online && /^micatropvp:lobby:[A-Z0-9]{5}$/.test(f.status || ''));
      fr.innerHTML = list.length ? '' : '<div class="muted">No friend is waiting in a lobby right now.</div>';
      for (const f of list) {
        const code = f.status.slice('micatropvp:lobby:'.length);
        const r = h('div', 'pvp-friend', `<span>${esc(f.username)}</span>`);
        r.appendChild(btn('Join', 'green b-pvp-friend-join', () => joinFlow(code)));
        fr.appendChild(r);
      }
    });
  }

  // the host: the New Run screen picks the deck / stake / seed / mods (+ their options and content switches)
  function createFlow() {
    ctx.newRunScreen({ pvpHost: true, onNew: async (o) => {
      const banned = ctx.bannedKeys();
      if (banned.includes(String(o.stake)) || (o.sleeve && banned.includes(o.sleeve)) || banned.includes(o.back)) { ctx.toast('That deck / stake / sleeve is banned in Multiplayer'); return open(); }
      const ids = ctx.withRequirements(o.mods || []);
      if (ids.length) { const r = await ctx.ensureMods(ids); if (!r.ok || r.missing.length) { ctx.toast('A mod failed to load'); return; } }
      const mods = { ids, options: o.modOptions || {}, pins: { engineRev: ctx.engineRev, modVersions: ctx.currentPins(ids) } };
      const opts = { ...DEFAULT_OPTS, back: o.back || 'b_red', stake: o.stake || 1, seed: o.seed || '', sleeve: o.sleeve || '' };
      const d = await call('mtpvp-create', { pv: PVP_PROTOCOL, opts, mods });
      if (!d || d.error) { ctx.toast((d && d.error) || 'Offline — try again'); if (d && d.id) rejoinById(d.id, d.code); return; }
      enterLobby(d.lobby);
    } });
  }
  // the guest: peek (the host's mods), load them, compare versions, join
  async function joinFlow(code) {
    code = String(code || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{5}$/.test(code)) { ctx.toast('A lobby code is 5 letters'); return; }
    if (!ctx.net.isLoggedIn()) { ctx.net.requireLogin(); return; }
    const pk = await call('mtpvp-peek', { code });
    if (!pk || pk.error) { ctx.toast((pk && pk.error) || 'Offline — try again'); return; }
    const L = pk.lobby;
    if (pk.full && L.host !== me() && L.guest !== me()) { ctx.toast('That lobby is full'); return; }
    const ids = (L.mods && L.mods.ids) || [];
    if (ids.length) { ctx.toast('Loading the host\'s mods…'); const r = await ctx.ensureMods(ids); if (r.missing.length) { ctx.toast('This lobby uses a mod this site doesn\'t have: ' + r.missing.join(', ')); return; } }
    const pins = { engineRev: ctx.engineRev, modVersions: ctx.currentPins(ids) };
    const d = await call('mtpvp-join', { code, pv: PVP_PROTOCOL, pins });
    if (!d || d.error) {
      if (d && /reload/.test(d.error)) versionPrompt(d);
      else ctx.toast((d && d.error) || 'Offline — try again');
      if (d && d.id) rejoinById(d.id, d.code);
      return;
    }
    enterLobby(d.lobby);
  }
  function versionPrompt(d) {
    const el = h('div', 'pvp-version');
    el.appendChild(h('p', null, esc(d.error) + '.'));
    el.appendChild(h('p', 'muted', 'Both players need the same version of Micatro and of every mod in the lobby. Reload the page (and ask your opponent to) to get the latest.'));
    el.appendChild(btn('Reload', 'blue big b-pvp-reload', () => location.reload()));
    ctx.UI.modal(el, { title: 'Different versions' });
  }
  async function rejoinById(id, code) {
    if (!code) return;
    const d = await call('mtpvp-join', { code, pv: PVP_PROTOCOL, pins: { engineRev: ctx.engineRev, modVersions: {} } });
    if (d && d.lobby) enterLobby(d.lobby);
  }

  // ---------------------------------------------------------------- the lobby
  function enterLobby(L) {
    lobby = L; stopped = false;
    if (L.m && !L.m.over) { startOrResumeMatch(); return; }
    if (L.m && L.m.over) { matchN = L.m.n; inMatch = false; }
    drawLobby();
    schedule(0);
  }
  function drawLobby() {
    if (!lobby || inMatch) return;
    const L = lobby, isHost = L.host === me();
    const el = h('div', 'pvp-lobby');
    const link = location.origin + '/micatro/?join=' + L.code;
    const top = h('div', 'pvp-code-row', `<div class="pvp-code-l">Lobby code</div><div class="pvp-code-v">${esc(L.code)}</div>`);
    top.appendChild(btn('Copy link', 'green b-pvp-copy', async () => { const okc = await ctx.UI.copyText(link); ctx.toast(okc ? 'Link copied' : link); }));
    el.appendChild(top);
    const pl = h('div', 'pvp-players');
    const age = (n) => (L.ages && L.ages[n] != null && L.ages[n] > AWAY_MS ? ' <span class="muted">(away)</span>' : '');
    pl.innerHTML = `<div class="pvp-p"><b>${esc(L.host)}</b> <span class="muted">host</span>${age(L.host)}</div>` +
      (L.guest ? `<div class="pvp-p"><b>${esc(L.guest)}</b> ${L.gready ? '<span class="pvp-ok">ready</span>' : '<span class="muted">not ready</span>'}${age(L.guest)}</div>` : '<div class="pvp-p muted">Waiting for a player… share the code or the link; friends see a Join button.</div>');
    el.appendChild(pl);
    // the options: the host edits them (a change un-readies the guest); the guest sees them
    const o = L.opts;
    const opt = h('div', 'pvp-opts');
    const num = (label, key, lo, hi) => {
      const r = h('div', 'pvp-opt', `<span>${label}</span>`);
      if (isHost) r.appendChild(btn('‹', 'arrow red b-pvp-dec-' + key, () => setOpt(key, Math.max(lo, o[key] - 1))));
      r.appendChild(h('b', 'pvp-opt-v pvp-' + key, String(o[key])));
      if (isHost) r.appendChild(btn('›', 'arrow red b-pvp-inc-' + key, () => setOpt(key, Math.min(hi, o[key] + 1))));
      opt.appendChild(r);
    };
    const tog = (label, key) => {
      const r = h('div', 'pvp-opt', `<span>${label}</span>`);
      if (isHost) r.appendChild(btn(o[key] ? 'On' : 'Off', (o[key] ? 'green' : 'grey') + ' b-pvp-tog-' + key, () => setOpt(key, !o[key])));
      else r.appendChild(h('b', null, o[key] ? 'On' : 'Off'));
      opt.appendChild(r);
    };
    num('Lives', 'lives', 1, 9);
    num('Nemesis from ante', 'pvpStart', 1, 8);
    tog('Lose a life on a failed blind', 'deathOnLoss');
    tog('Comeback money ($4)', 'comeback');
    el.appendChild(opt);
    const mods = (L.mods && L.mods.ids) || [];
    el.appendChild(h('div', 'pvp-setup', `Deck <b>${esc(o.back)}</b> · Stake <b>${esc(o.stake)}</b>${o.seed ? ' · Seed <b>' + esc(o.seed) + '</b>' : ''}${o.sleeve ? ' · Sleeve <b>' + esc(o.sleeve) + '</b>' : ''}<br>Mods: ${mods.length ? mods.map(esc).join(', ') : 'none (vanilla)'} <span class="muted">— everyone plays the host's set</span>`));
    el.appendChild(h('div', 'pvp-bans muted', `Banned in Multiplayer: ${ctx.bannedKeys().length} cards (Mr. Bones, Chicot, Luchador, Matador, boss rerolls, ante changers and the mods' equivalents).`));
    const bar = h('div', 'pvp-bar');
    if (isHost) {
      const st = btn('Start', 'blue big b-pvp-start', () => update({ start: true }));
      st.disabled = !(L.guest && L.gready);
      bar.appendChild(st);
    } else if (L.guest === me()) {
      bar.appendChild(btn(L.gready ? 'Not ready' : 'Ready', (L.gready ? 'grey' : 'green') + ' big b-pvp-ready-lobby', () => update({ ready: !L.gready })));
    }
    bar.appendChild(btn('Leave', 'red b-pvp-leave', () => leave()));
    el.appendChild(bar);
    if (lobbyEl && lobbyEl.isConnected) { lobbyEl.replaceWith(el); lobbyEl = el; return; }
    ctx.UI.closeAll();
    const wrap = ctx.UI.modal(el, { title: 'Multiplayer lobby', cls: 'pvp-modal', noClose: true });
    lobbyEl = el; void wrap;
  }
  async function setOpt(key, val) { await update({ opts: { ...lobby.opts, [key]: val } }); }
  async function update(body) {
    const d = await call('mtpvp-update', { id: lobby.id, ...body });
    if (!d || d.error) { ctx.toast((d && d.error) || 'Offline — try again'); return; }
    applyLobby(d.lobby);
  }
  async function leave({ silent = false } = {}) {
    const id = lobby && lobby.id;
    stop();
    lobby = null; inMatch = false; opp = null; writeMeta(null);
    if (id) await call('mtpvp-leave', { id });
    if (!silent) ctx.showMenu();
  }

  // ---------------------------------------------------------------- the poll
  function stop() { stopped = true; clearTimeout(timer); timer = null; clearInterval(countdownTimer); countdownTimer = null; }
  function schedule(ms) { clearTimeout(timer); if (!stopped) timer = setTimeout(tick, ms); }
  const cadence = () => {
    const v = ctx.view();
    if (!inMatch) return LOBBY_MS;
    if (v && (v.pvp && v.pvp.nemesis || meReady || (lobby && lobby.m && lobby.m.round && lobby.m.round.startAt && !lobby.m.round.res))) return FAST_MS;
    return SLOW_MS;
  };
  async function tick() {
    if (stopped || !lobby) return;
    if (busy) { schedule(200); return; }
    busy = true;
    try { await syncOnce(); } catch (e) { console.warn('micatro pvp: sync failed', e); }
    busy = false;
    schedule(cadence());
  }
  async function syncOnce() {
    const body = { id: lobby.id, v: lobby.v, oseq };
    if (inMatch) {
      const sum = summary();
      if (sum) { const j = JSON.stringify(sum); if (j !== mySum) { mySum = j; mySeq++; } body.sum = sum; body.seq = mySeq; }
      const v = ctx.view();
      if (v && v.over) { body.end = endPayload(v); body.wantEnd = true; }
      if (lobby.m && lobby.m.over) body.wantEnd = true;
    }
    const d = await call('mtpvp-sync', body);
    if (!d) { setBanner('Connection lost — retrying…'); return; }
    if (d.closed) { ctx.toast(d.removed ? 'You are no longer in that lobby' : 'The lobby closed'); stop(); lobby = null; writeMeta(null); if (!inMatch) ctx.showMenu(); return; }
    if (d.error) return;
    if (Number.isFinite(d.now)) skew = d.now - Date.now();
    if (d.opp) {
      opp = { ...(opp || {}), name: d.opp.name, age: d.opp.age };
      if (d.opp.sum) { opp.sum = d.opp.sum; oseq = d.opp.seq; }
      if (d.opp.end) opp.end = d.opp.end;
    } else opp = null;
    if (d.lobby) applyLobby(d.lobby);
    else if (inMatch) await referee();
  }
  function applyLobby(L) {
    lobby = L;
    if (L.m && (!inMatch && !L.m.over || L.m.n > matchN)) { startOrResumeMatch(); return; }
    if (!inMatch) { drawLobby(); return; }
    referee();
  }

  // ---------------------------------------------------------------- the match
  async function startOrResumeMatch() {
    const L = lobby, m = L.m;
    stopTimersOnly();
    inMatch = true;
    const meta = readMeta();
    let resumed = false;
    if (meta && meta.id === L.id && meta.n === m.n) resumed = await ctx.resumeMatchRun();
    if (!resumed) {
      resetRound();
      matchN = m.n;
      writeMeta({ id: L.id, n: m.n });
      await ctx.startMatchRun({
        seed: m.seed, back: L.opts.back, stake: L.opts.stake, sleeve: L.opts.sleeve || null,
        mods: (L.mods && L.mods.ids) || [], modOptions: (L.mods && L.mods.options) || {},
        pvp: { lives: L.opts.lives, pvpStart: L.opts.pvpStart, deathOnLoss: L.opts.deathOnLoss, comeback: L.opts.comeback },
        lobbyId: L.id,
      });
    } else { matchN = m.n; resetRound(); }
    lobbyEl = null;
    stopped = false;
    decorate();
    schedule(0);
  }
  function stopTimersOnly() { clearTimeout(timer); clearInterval(countdownTimer); countdownTimer = null; }
  function resetRound() { meReady = false; readyAnte = 0; handN = 0; handSent = ''; nemesisAnte = 0; outcomeApplied = 0; endApplied = false; endShown = false; endData = null; countdown = 0; mySeq = 0; mySum = ''; oseq = null; }

  /** What the opponent's HUD shows of this player (small; changes only on meaningful moves). */
  function summary() {
    const v = ctx.view();
    if (!v || !v.pvp) return null;
    const loc = v.over ? 'over' : v.pvp.nemesis ? (v.state === 'PVP_WAIT' ? 'wait' : 'nemesis') : meReady ? 'ready'
      : v.state === 'SHOP' ? 'shop' : v.state === 'ROUND_EVAL' ? 'cashout' : /PACK/.test(v.state) ? 'pack' : v.state === 'BLIND_SELECT' ? 'select' : 'playing';
    return {
      ante: v.ante, round: v.round, loc, blind: v.blind && v.blind.key && v.state !== 'BLIND_SELECT' && v.state !== 'SHOP' ? v.blind.key : null,
      dollars: v.dollars, lives: v.pvp.lives,
      jokers: ((v.areas && v.areas.jokers) || []).slice(0, 30).map((c) => [c.center, c.edition || null]),
    };
  }
  function endPayload(v) {
    if (endData) return endData;
    const jokers = ((v.areas && v.areas.jokers) || []).slice(0, 40).map((c) => [c.center, c.edition || null]);
    const deck = (v.deck_list || []).slice(0, 300).map((d) => d.slice(0, 4));
    endData = { jokers, deck, back: v.back, stake: v.stake };
    return endData;
  }
  const serverNow = () => Date.now() + skew;

  /** Apply the referee's state to this player's run: reports out, results in (as recorded engine actions). */
  async function referee() {
    const L = lobby, m = L && L.m;
    if (!m) return;
    const v = ctx.view();
    if (!v || !v.pvp) { decorate(); return; }
    // (1) the match is over: end the run (recorded), then the end screen
    if (m.over) {
      if (!v.over && !endApplied && ctx.idle()) {
        const result = m.over.draw ? 'draw' : m.over.winner === me() ? 'win' : 'lose';
        const r = ctx.act({ type: 'pvp_end', result });
        if (r && r.ok) endApplied = true;
      }
      decorate();
      if ((v.over || endApplied) && !endShown) { endShown = true; ctx.endPublishing(m.over.winner === me()); setTimeout(() => endScreen(), 400); }
      return;
    }
    // (2) the blind log: every failed / beaten / skipped normal blind goes to the referee (life loss, pending death)
    const res = (m.res && m.res[me()]) || {};
    for (const b of v.pvp.blinds || []) {
      const key = b.ante + ':' + b.slot;
      if (res[key]) continue;
      const d = await call('mtpvp-blind', { id: L.id, ante: b.ante, slot: b.slot, result: b.r });
      if (d && d.lobby) { lobby = d.lobby; return referee(); }
      break;
    }
    const rd = m.round;
    // (3) the Nemesis: start together after the countdown
    const atNemesis = v.state === 'BLIND_SELECT' && v.blind_on_deck === 'Boss' && v.choices && v.choices.Boss && v.choices.Boss.key === NEMESIS && v.choices.Boss.state === 'Select';
    if (atNemesis && rd && rd.ante === v.ante && rd.startAt && !rd.res) {
      const left = rd.startAt - serverNow();
      if (left <= 0) {
        if (ctx.idle()) {
          const r = ctx.act({ type: 'pvp_start_blind' });
          if (r && r.ok) { nemesisAnte = v.ante; meReady = false; countdown = 0; handN = 0; handSent = ''; clearInterval(countdownTimer); countdownTimer = null; }
        }
      } else if (!countdownTimer) {
        countdownTimer = setInterval(() => { countdown = Math.max(0, Math.ceil((rd.startAt - serverNow()) / 1000)); decorate(); if (countdown <= 0) { clearInterval(countdownTimer); countdownTimer = null; schedule(0); } }, 200);
      }
    }
    if (atNemesis && rd && rd.ante === v.ante && !rd.startAt) meReady = !!(rd.ready && rd.ready[me()]);
    // (4) in the Nemesis: report every hand (cumulative score + hands left)
    const v2 = ctx.view();
    if (v2 && v2.pvp && v2.pvp.nemesis) {
      if (!nemesisAnte) nemesisAnte = v2.ante;
      const hands = v2.state === 'PVP_WAIT' ? 0 : v2.hands_left;
      const sc = String(v2.chips == null ? 0 : v2.chips);
      const sig = sc + '|' + hands;
      const mine = rd && rd.scores && rd.scores[me()];
      if (rd && rd.ante === nemesisAnte && rd.startAt && !rd.res && (sig !== handSent || !mine || mine.n == null)) {
        handN = Math.max(handN + 1, mine && mine.n != null ? mine.n + 1 : 0);
        const d = await call('mtpvp-hand', { id: L.id, ante: nemesisAnte, score: sc, hands, n: handN });
        if (d && d.lobby) { handSent = sig; lobby = d.lobby; }
      }
      // (5) the round's result -> the recorded outcome (lives from the referee)
      const r2 = lobby.m.round;
      if (r2 && r2.ante === nemesisAnte && r2.res && outcomeApplied !== nemesisAnte && ctx.idle()) {
        const result = r2.res.loser === '' ? 'tie' : r2.res.loser === me() ? 'lose' : 'win';
        const r = ctx.act({ type: 'pvp_outcome', result, lives: Math.max(0, lobby.m.lives[me()] | 0) });
        if (r && r.ok) { outcomeApplied = nemesisAnte; nemesisAnte = 0; ctx.toast(result === 'win' ? 'You won the round!' : result === 'lose' ? 'You lost the round: -1 life' : 'A tie: no lives lost'); }
      }
    }
    decorate();
  }
  async function pressReady() {
    const v = ctx.view();
    if (!lobby || !lobby.m || !v) return;
    const want = !meReady;
    const d = await call('mtpvp-ready', { id: lobby.id, ante: v.ante, ready: want });
    if (!d || d.error) { ctx.toast((d && d.error) || 'Offline — try again'); return; }
    meReady = want; readyAnte = v.ante;
    lobby = d.lobby;
    if (Number.isFinite(d.now)) skew = d.now - Date.now();
    await referee();
    schedule(0);
  }

  /** The view's pvp_opp (the HUD's opponent + banners): the player's live view, then published to spectators. */
  function oppInfo() {
    const L = lobby, m = L && L.m;
    if (!L || !m) return null;
    const name = m.players.find((p) => p !== me()) || '';
    const s = (opp && opp.sum) || {};
    const rd = m.round;
    const sc = rd && rd.scores && rd.scores[name];
    const v = ctx.view();
    const o = {
      me: me(), name, lives: m.lives[name], max: L.opts.lives, myLives: m.lives[me()],
      loc: s.loc || '', ante: s.ante || 0, ready: !!(rd && rd.ready && rd.ready[name]), meReady, countdown,
      score: v && v.pvp && v.pvp.nemesis && sc ? sc.s : null, hands: v && v.pvp && v.pvp.nemesis && sc ? sc.h : null,
    };
    // banners: the opponent away (the forfeit clock), a pending death
    const banners = [];
    if (opp && opp.age != null && opp.age > AWAY_MS && !m.over) banners.push(`${esc(name)} disconnected — waiting for them to come back (${Math.max(0, GRACE_S - Math.floor(opp.age / 1000))} s)`);
    if (m.pending && !m.over) {
      const [pa, ps] = m.pending.key.split(':');
      banners.push(m.pending.dead === me() ? `<b>OUT OF LIVES</b> — your result is pending: ${esc(name)} must beat the same blind (ante ${pa} ${ps}). Leaving is not a forfeit.`
        : `${esc(name)} lost their last life on ante ${pa} ${ps} — beat that blind to win the match!`);
    }
    o.banner = banners.join('<br>');
    return o;
  }
  function decorate() { ctx.redraw(); }
  function setBanner(text) { void text; }

  // ---------------------------------------------------------------- the end
  function endScreen() {
    const L = lobby, m = L && L.m;
    if (!m) return;
    const won = m.over.winner === me(), draw = m.over.draw;
    const oppName = m.players.find((p) => p !== me()) || '';
    const el = h('div', 'pvp-end');
    el.appendChild(h('div', 'pvp-end-title ' + (draw ? 'draw' : won ? 'won' : 'lost'), draw ? 'Draw' : won ? 'You win!' : 'You lose'));
    const why = { lives: 'out of lives', forfeit: won ? oppName + ' forfeited' : 'forfeit', pending: 'the pending blind decided it' }[m.over.why] || '';
    el.appendChild(h('div', 'pvp-end-why muted', esc(why)));
    el.appendChild(h('div', 'pvp-end-lives', `${esc(me())} ♥${m.lives[me()]} · ${esc(oppName)} ♥${m.lives[oppName]}`));
    if (m.hist && m.hist.length) {
      el.appendChild(h('div', 'pvp-end-hist', m.hist.map((x) => `Ante ${x.ante}: ${esc(x.s[me()] || '0')} vs ${esc(x.s[oppName] || '0')} ${x.loser === '' ? '(tie)' : x.loser === me() ? '(lost)' : '(won)'}`).join('<br>')));
    }
    const tabs = h('div', 'pvp-end-tabs');
    const box = h('div', 'pvp-end-cards');
    const show = (who) => {
      const end = who === 'me' ? endPayload(ctx.view() || {}) : opp && opp.end;
      box.innerHTML = '';
      if (!end) { box.innerHTML = '<div class="muted">Waiting for their cards…</div>'; return; }
      box.appendChild(h('div', 'pvp-end-sub', 'Jokers'));
      const jr = h('div', 'pvp-end-jokers');
      for (const [key, ed] of end.jokers || []) jr.appendChild(ctx.UI.cardCanvas({ center: key, edition: ed || undefined }, 'pvp-end-joker'));
      if (!(end.jokers || []).length) jr.innerHTML = '<span class="muted">none</span>';
      box.appendChild(jr);
      box.appendChild(h('div', 'pvp-end-sub', `Deck (${(end.deck || []).length} cards)`));
    };
    tabs.appendChild(btn(esc(oppName) + "'s cards", 'orange b-pvp-end-opp', () => show('opp')));
    tabs.appendChild(btn('Your cards', 'blue b-pvp-end-me', () => show('me')));
    el.appendChild(tabs); el.appendChild(box);
    show('opp');
    const bar = h('div', 'pvp-bar');
    const rm = btn('Rematch', 'green big b-pvp-rematch', async () => {
      const d = await call('mtpvp-rematch', { id: L.id });
      if (!d || d.error) { ctx.toast((d && d.error) || 'Offline'); return; }
      rm.disabled = true; rm.textContent = 'Waiting for ' + oppName + '…';
      applyLobby(d.lobby);
    });
    bar.appendChild(rm);
    bar.appendChild(btn('Leave', 'red b-pvp-end-leave', () => leave()));
    el.appendChild(bar);
    ctx.UI.closeAll();
    ctx.UI.modal(el, { title: 'Match over', cls: 'pvp-modal go-modal', noClose: true });
    // the opponent's cards arrive with their final sync
    const wait = setInterval(() => { if (!el.isConnected) { clearInterval(wait); return; } if (opp && opp.end && box.textContent.includes('Waiting')) show('opp'); }, 1000);
  }

  // ---------------------------------------------------------------- boot / rejoin
  /** At boot (signed in): the lobby this player is in, if any (a reload rejoins it). */
  async function resume({ code } = {}) {
    const d = await call('mtpvp-mine', {});
    const L = d && d.lobby;
    if (L && (!code || L.code === code)) {
      if (L.m && !L.m.over) { lobby = L; stopped = false; await startOrResumeMatch(); return true; }
      if (!L.m) { enterLobby(L); return true; }
    }
    if (code) { await joinFlow(code); return true; }
    return false;
  }
  /** The options menu in a match: forfeit (a confirm). */
  function forfeitConfirm() {
    const el = h('div', 'pvp-forfeit');
    el.appendChild(h('p', null, 'Leave the match? Leaving counts as a forfeit: your opponent wins.'));
    el.appendChild(btn('Forfeit', 'red big b-pvp-forfeit', async () => {
      if (lobby) await call('mtpvp-forfeit', { id: lobby.id });
      ctx.UI.closeAll();
      schedule(0);
    }));
    el.appendChild(btn('Keep playing', 'blue b-pvp-keep', () => ctx.UI.closeModal()));
    ctx.UI.modal(el, { title: 'Forfeit?' });
  }

  return {
    open, joinFlow, resume, leave, forfeitConfirm, pressReady,
    get active() { return inMatch && !!lobby; },
    get lobbyId() { return lobby && lobby.id; },
    oppInfo,
    /** after every local action: report what changed now (a blind, a hand), not at the next poll */
    afterAct() { if (inMatch && lobby && !busy) schedule(30); },
    // test hooks
    get state() { return { lobby, opp, inMatch, matchN, meReady, nemesisAnte, outcomeApplied, endApplied }; },
    locText,
  };
}
