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
//   Stage 6: the mode (Attrition / Showdown / Survival) is picked on the Multiplayer screen and is a host option with the
//   rest (Showdown's starting ante, Boss Blind effects, hidden scores, the Hurry timer's length + skip time; read-only for
//   the guest). A round is the blind on deck (any slot in Showdown). READY at a Nemesis the opponent hasn't readied for
//   offers Hurry!: the server's timer on them; each expiry the referee counts arrives here as a recorded pvp_timer action.
//   Stage 7: the RULESET (Vanilla / Balanced) with The Order and the PvP timer (host options; both default on in Balanced),
//   passed to both engines and recorded. In a Nemesis round the player ahead may start the PvP timer on the one behind
//   (server time); each hand it takes arrives as a recorded pvp_hand_lost. The timed client adds back the time its
//   animations take, from a 40 s budget refilling 2.5 s a second (the mod's), sent with its syncs as a running total.
//   The lobby also shows the host's mod options (Pokermon's generations, content switches): the match's, for both players.
import { locText, blindText } from './pvphud.js';
import { esc } from './markup.js';
import { MODS } from '../mods/registry.js';

export const PVP_PROTOCOL = 3;   // (server/micatro_pvp.mjs MTPVP_PROTOCOL: 2 = stage 6 — modes, the Hurry timer, hidden scores; 3 = stage 7 — rulesets, The Order, the PvP timer)
const META_KEY = 'micatro_pvp_meta_v1';   // {id, n}: the match this device's PvP save belongs to
const LOBBY_MS = 2000, FAST_MS = 1000, SLOW_MS = 2500;
const AWAY_MS = 8000, GRACE_S = 120;
const DEFAULT_OPTS = { lives: 4, pvpStart: 2, deathOnLoss: true, comeback: true, mode: 'attrition', showdownStart: 3, bossFx: false, hideScore: false, timer: true, timerBase: 150, timerInc: 60, ruleset: 'balanced', order: true, pvpTimer: true };
// the rulesets (the mod's names and descriptions, re-worded)
const RULESETS = {
  vanilla: { name: 'Vanilla', desc: 'The original Balatro experience: no Multiplayer cards, no balance changes.' },
  balanced: { name: 'Balanced', desc: 'Near-vanilla with a few balance changes: Hanging Chad retriggers the first two scoring cards once each, Bloodstone\'s rolls are shared in a Nemesis round, Glass Cards are X1.5 and Justice is banned. The PvP timer is on.' },
};
const ANIM_CAP = 40, ANIM_REFILL = 2.5;   // the PvP timer's animation budget (s) and its refill (s per s)
/** The host's mod options that differ from a mod's defaults, in words ('Pokermon: Gen 4 off'); content switches counted. */
function modOptionsText(mods) {
  const out = [];
  for (const id of (mods && mods.ids) || []) {
    const o = (mods.options || {})[id] || {}, def = (MODS[id] && MODS[id].options) || {};
    const parts = [];
    let off = 0;
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith('content:')) { if (v === false) off++; continue; }
      const d = def[k];
      if (!d || d.cosmetic || v === d.default) continue;
      parts.push(esc(d.label || k) + ' ' + (v === true ? 'on' : v === false ? 'off' : esc(String(v))));
    }
    if (off) parts.push(off + ' card' + (off === 1 ? '' : 's') + ' switched off');
    if (parts.length) out.push('<b>' + esc((MODS[id] && MODS[id].name) || id) + '</b>: ' + parts.join(', '));
  }
  return out;
}
const MODES = {
  attrition: { name: 'Attrition', desc: 'From ante 2 every Boss Blind is <b>Your Nemesis</b>: both play all their hands, the lower score loses a life. Last one with lives wins.' },
  showdown: { name: 'Showdown', desc: 'Time to prepare: from ante 3 the Small, Big AND Boss blinds are all <b>Your Nemesis</b>.' },
  survival: { name: 'Survival', desc: 'No Nemesis, one life each: whoever beats the furthest blind wins.' },
};
const SLOT_N = { Small: 1, Big: 2, Boss: 3 };
/** Two reported scores compared (> 0: a is ahead) — plain numbers exactly, big ones by exponent + mantissa. */
function cmpScore(a, b) {
  const k = (s) => { const n = Number(s); if (Number.isFinite(n)) return [n <= 0 ? -Infinity : Math.floor(Math.log10(n)), n]; const m = /^(\d(?:\.\d+)?)e\+?(\d+)$/i.exec(String(s)); return m ? [Number(m[2]), Number(m[1])] : [Infinity, 1]; };
  const ka = k(a), kb = k(b);
  if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) return Number(a) === Number(b) ? 0 : Number(a) > Number(b) ? 1 : -1;
  return ka[0] !== kb[0] ? (ka[0] > kb[0] ? 1 : -1) : ka[1] === kb[1] ? 0 : ka[1] > kb[1] ? 1 : -1;
}
const blindNum = (ante, slot) => ante * 10 + (SLOT_N[slot] || 3);

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
  let clockTimer = null;   // (redraws the Hurry timer's countdown while one runs)
  // the PvP timer's animation budget (s) and the credit counted this round (ms, a running total the server applies once)
  let animBudget = ANIM_CAP, animTotal = 0, animRound = 0, animLast = 0, animTimer = null;
  let lobbyEl = null;
  const me = () => ctx.me();

  // ---------------------------------------------------------------- the Multiplayer screen
  function open() {
    if (!ctx.net.isLoggedIn()) { ctx.net.requireLogin(); return; }
    const el = h('div', 'pvp-menu');
    el.appendChild(h('p', 'pvp-intro', 'Play a friend on the same seed and deck. Pick the mode for your lobby:'));
    // the mode, chosen on create (Attrition by default; the host can still change it in the lobby)
    let mode = 'attrition';
    const modes = h('div', 'pvp-modes');
    const desc = h('div', 'pvp-mode-desc', MODES[mode].desc);
    const drawModes = () => {
      modes.innerHTML = '';
      for (const [k, M] of Object.entries(MODES)) modes.appendChild(btn(M.name, (k === mode ? 'orange on' : 'grey') + ' b-pvp-mode-' + k, () => { mode = k; desc.innerHTML = MODES[k].desc; drawModes(); }));
    };
    drawModes();
    el.appendChild(modes); el.appendChild(desc);
    const row = h('div', 'pvp-row');
    row.appendChild(btn('Create lobby', 'blue big b-pvp-create', () => createFlow(mode)));
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
  function createFlow(mode = 'attrition') {
    ctx.newRunScreen({ pvpHost: true, onNew: async (o) => {
      const banned = ctx.bannedKeys();
      if (banned.includes(String(o.stake)) || (o.sleeve && banned.includes(o.sleeve)) || banned.includes(o.back)) { ctx.toast('That deck / stake / sleeve is banned in Multiplayer'); return open(); }
      const ids = ctx.withRequirements(o.mods || []);
      if (ids.length) { const r = await ctx.ensureMods(ids); if (!r.ok || r.missing.length) { ctx.toast('A mod failed to load'); return; } }
      const mods = { ids, options: o.modOptions || {}, pins: { engineRev: ctx.engineRev, modVersions: ctx.currentPins(ids) } };
      const opts = { ...DEFAULT_OPTS, mode, back: o.back || 'b_red', stake: o.stake || 1, seed: o.seed || '', sleeve: o.sleeve || '' };
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
    // a cycling choice: ‹ value › (the host), the value alone (the guest)
    const cyc = (label, key, values, show) => {
      const r = h('div', 'pvp-opt', `<span>${label}</span>`);
      const i = Math.max(0, values.indexOf(o[key]));
      if (isHost) r.appendChild(btn('‹', 'arrow red b-pvp-dec-' + key, () => setOpt(key, values[(i + values.length - 1) % values.length])));
      r.appendChild(h('b', 'pvp-opt-v pvp-' + key, esc(show(o[key]))));
      if (isHost) r.appendChild(btn('›', 'arrow red b-pvp-inc-' + key, () => setOpt(key, values[(i + 1) % values.length])));
      opt.appendChild(r);
    };
    const mode = o.mode || 'attrition';
    // the ruleset (stage 7): a change also resets The Order and the PvP timer to the ruleset's defaults
    const rs = o.ruleset || 'vanilla', rk = Object.keys(RULESETS), ri = Math.max(0, rk.indexOf(rs));
    const rrow = h('div', 'pvp-opt', '<span>Ruleset</span>');
    const setRs = (k) => update({ opts: { ...lobby.opts, ruleset: k, order: k !== 'vanilla', pvpTimer: k !== 'vanilla' } });
    if (isHost) rrow.appendChild(btn('‹', 'arrow red b-pvp-dec-ruleset', () => setRs(rk[(ri + rk.length - 1) % rk.length])));
    rrow.appendChild(h('b', 'pvp-opt-v pvp-ruleset', esc((RULESETS[rs] || RULESETS.vanilla).name)));
    if (isHost) rrow.appendChild(btn('›', 'arrow red b-pvp-inc-ruleset', () => setRs(rk[(ri + 1) % rk.length])));
    opt.appendChild(rrow);
    opt.appendChild(h('div', 'pvp-mode-desc muted pvp-ruleset-desc', (RULESETS[rs] || RULESETS.vanilla).desc));
    tog('The Order (same cards for both)', 'order');
    cyc('Mode', 'mode', Object.keys(MODES), (m) => (MODES[m] || MODES.attrition).name);
    opt.appendChild(h('div', 'pvp-mode-desc muted', MODES[mode] ? MODES[mode].desc.replace('ante 2', 'ante ' + o.pvpStart).replace('ante 3', 'ante ' + o.showdownStart) : ''));
    if (mode !== 'survival') num('Lives', 'lives', 1, 9);
    if (mode === 'attrition') num('Nemesis from ante', 'pvpStart', 1, 8);
    if (mode === 'showdown') num('Showdown starting ante', 'showdownStart', 1, 20);
    if (mode !== 'survival') {
      tog('Lose a life on a failed blind', 'deathOnLoss');
      tog('Comeback money ($4)', 'comeback');
      tog('Enable Boss Blind effects', 'bossFx');
      tog('Hide enemy score until you play', 'hideScore');
      tog('PvP timer (in a Nemesis round)', 'pvpTimer');
      tog('Hurry timer', 'timer');
      if (o.timer) {
        cyc('Timer length', 'timerBase', [30, 60, 90, 120, 150, 180, 210, 240], (s) => s + ' s');
        cyc('Time per skip ahead', 'timerInc', [0, 30, 60, 90, 120, 150, 180], (s) => '+' + s + ' s');
      }
    }
    if (!isHost) opt.appendChild(h('div', 'muted pvp-host-only', 'Only the host can change these options.'));
    el.appendChild(opt);
    const mods = (L.mods && L.mods.ids) || [];
    const mo = modOptionsText(L.mods);
    el.appendChild(h('div', 'pvp-setup', `Deck <b>${esc(o.back)}</b> · Stake <b>${esc(o.stake)}</b>${o.seed ? ' · Seed <b>' + esc(o.seed) + '</b>' : ''}${o.sleeve ? ' · Sleeve <b>' + esc(o.sleeve) + '</b>' : ''}<br>Mods: ${mods.length ? mods.map(esc).join(', ') : 'none (vanilla)'} <span class="muted">— everyone plays the host's set</span>`
      + (mo.length ? `<div class="pvp-modopts">Mod options (the host's, for both): ${mo.join(' · ')}</div>` : '')));
    el.appendChild(h('div', 'pvp-bans muted', mode === 'survival' ? `Banned in Survival: ${ctx.bannedKeys(mode, rs).length} cards (ante changers and the mods' PvP-breaking cards${rs !== 'vanilla' ? ', Justice' : ''}).`
      : `Banned in Multiplayer: ${ctx.bannedKeys(mode, rs).length} cards (Mr. Bones, Chicot, Luchador, Matador, boss rerolls, ante changers and the mods' equivalents${rs !== 'vanilla' ? ', Justice' : ''}).`));
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
  function stop() { stopped = true; clearTimeout(timer); timer = null; clearInterval(countdownTimer); countdownTimer = null; clearInterval(clockTimer); clockTimer = null; clearInterval(animTimer); animTimer = null; }
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
    if (inMatch && animTotal > 0) body.anim = Math.round(animTotal);
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
        pvp: { lives: L.opts.lives, pvpStart: L.opts.pvpStart, deathOnLoss: L.opts.deathOnLoss, comeback: L.opts.comeback, mode: L.opts.mode || 'attrition', showdownStart: L.opts.showdownStart || 3, bossFx: !!L.opts.bossFx,
          // (stage 7; a lobby from before it has no ruleset: a Vanilla match)
          ruleset: L.opts.ruleset || 'vanilla', order: !!L.opts.order },
        lobbyId: L.id,
      });
    } else { matchN = m.n; resetRound(); }
    lobbyEl = null;
    stopped = false;
    decorate();
    schedule(0);
  }
  function stopTimersOnly() { clearTimeout(timer); clearInterval(countdownTimer); countdownTimer = null; clearInterval(clockTimer); clockTimer = null; clearInterval(animTimer); animTimer = null; }
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
    // (0) the Hurry timer's lives (the referee's count of expiries on this player), each a recorded action, in order
    const tlDue = Math.max(0, ((m.tl && m.tl[me()]) | 0) - (v.pvp.tlost | 0));
    if (tlDue > 0 && !v.over && ctx.idle()) {
      const r = ctx.act({ type: 'pvp_timer', n: (v.pvp.tlost | 0) + 1 });
      if (r && r.ok) { ctx.toast('Out of time: -1 life'); schedule(60); }
    }
    // (0b) the PvP timer's hands (stage 7): each a recorded action, in order — before the round's outcome
    const hlDue = Math.max(0, ((m.hl && m.hl[me()]) | 0) - (v.pvp.hlost | 0));
    if (hlDue > 0 && !v.over && ctx.idle()) {
      const r = ctx.act({ type: 'pvp_hand_lost', n: (v.pvp.hlost | 0) + 1 });
      if (r && r.ok) { ctx.toast('Out of time: -1 hand'); schedule(60); }
    }
    const pt = m.round && m.round.pt;
    // the countdown on screen while a timer runs (the Hurry timer, the PvP timer)
    if (((m.timer && m.timer.endAt) || (pt && pt.endAt)) && !m.over) { if (!clockTimer) clockTimer = setInterval(() => ctx.redraw({ hud: true }), 250); }
    else if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    // the animation budget while the PvP timer runs on this player: the time animations take is credited back
    const rb = m.round ? m.round.b || 0 : 0;
    if (rb !== animRound) { animRound = rb; animTotal = 0; animBudget = ANIM_CAP; }
    if (pt && pt.endAt && pt.on === me() && !m.over) {
      if (!animTimer) {
        animLast = Date.now();
        animTimer = setInterval(() => {
          const now = Date.now(), dt = Math.min(1, (now - animLast) / 1000);
          animLast = now;
          if (!ctx.idle()) { const use = Math.min(dt, animBudget); animBudget -= use; animTotal += use * 1000; }
          else animBudget = Math.min(ANIM_CAP, animBudget + dt * ANIM_REFILL);
        }, 100);
      }
    } else if (animTimer) { clearInterval(animTimer); animTimer = null; }
    // (1) the match is over: end the run (recorded), then the end screen
    if (m.over) {
      if (!v.over && !endApplied && !tlDue && ctx.idle()) {
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
    const rdB = rd ? rd.b || blindNum(rd.ante, 'Boss') : 0;
    // (3) a PvP round (the Boss; any slot in Showdown): start together after the countdown
    const on = v.blind_on_deck;
    const atNemesis = v.state === 'BLIND_SELECT' && !!on && !!(v.pvp.slots && v.pvp.slots[on]) && !!(v.choices && v.choices[on] && v.choices[on].state === 'Select');
    const vb = atNemesis ? blindNum(v.ante, on) : 0;
    if (atNemesis && rd && rdB === vb && rd.startAt && !rd.res) {
      const left = rd.startAt - serverNow();
      if (left <= 0) {
        if (ctx.idle()) {
          const r = ctx.act({ type: 'pvp_start_blind' });
          if (r && r.ok) { nemesisAnte = vb; meReady = false; countdown = 0; handN = 0; handSent = ''; clearInterval(countdownTimer); countdownTimer = null; }
        }
      } else if (!countdownTimer) {
        countdownTimer = setInterval(() => { countdown = Math.max(0, Math.ceil((rd.startAt - serverNow()) / 1000)); decorate(); if (countdown <= 0) { clearInterval(countdownTimer); countdownTimer = null; schedule(0); } }, 200);
      }
    }
    if (atNemesis && rd && rdB === vb && !rd.startAt) meReady = !!(rd.ready && rd.ready[me()]);
    // (4) in the Nemesis: report every hand (cumulative score + hands left)
    const v2 = ctx.view();
    if (v2 && v2.pvp && v2.pvp.nemesis) {
      if (!nemesisAnte) nemesisAnte = blindNum(v2.ante, v2.pvp.slot || 'Boss');   // (the round's blind number)
      const hands = v2.state === 'PVP_WAIT' ? 0 : v2.hands_left;
      const sc = String(v2.chips == null ? 0 : v2.chips);
      const sig = sc + '|' + hands;
      const mine = rd && rd.scores && rd.scores[me()];
      if (rd && rdB === nemesisAnte && rd.startAt && !rd.res && (sig !== handSent || !mine || mine.n == null)) {
        handN = Math.max(handN + 1, mine && mine.n != null ? mine.n + 1 : 0);
        const slot = ['', 'Small', 'Big', 'Boss'][nemesisAnte % 10] || 'Boss';
        const d = await call('mtpvp-hand', { id: L.id, ante: Math.floor(nemesisAnte / 10), slot, score: sc, hands, n: handN, hp: v2.pvp.hands_played | 0, hl: v2.pvp.hlost | 0 });
        if (d && d.lobby) { handSent = sig; lobby = d.lobby; }
      }
      // (5) the round's result -> the recorded outcome (lives from the referee)
      const r2 = lobby.m.round;
      const hlOwed = Math.max(0, ((lobby.m.hl && lobby.m.hl[me()]) | 0) - (v2.pvp.hlost | 0));
      if (r2 && (r2.b || blindNum(r2.ante, 'Boss')) === nemesisAnte && r2.res && outcomeApplied !== nemesisAnte && !hlOwed && ctx.idle()) {
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
    const d = await call('mtpvp-ready', { id: lobby.id, ante: v.ante, slot: v.blind_on_deck || 'Boss', ready: want });
    if (!d || d.error) { ctx.toast((d && d.error) || 'Offline — try again'); return; }
    meReady = want; readyAnte = v.ante;
    lobby = d.lobby;
    if (Number.isFinite(d.now)) skew = d.now - Date.now();
    await referee();
    schedule(0);
  }
  /** The Hurry button (READY at a PvP round, the opponent not): start / resume the timer on them, or pause it. */
  async function pressHurry() {
    const m = lobby && lobby.m;
    if (!m) return;
    const on = !(m.timer && m.timer.by === me() && m.timer.endAt);
    const d = await call('mtpvp-timer', { id: lobby.id, on });
    if (!d || d.error) { ctx.toast((d && d.error) || 'Offline — try again'); return; }
    lobby = d.lobby;
    if (Number.isFinite(d.now)) skew = d.now - Date.now();
    await referee();
    schedule(0);
  }

  /** The PvP timer (a Nemesis round, the player ahead): start it on the opponent, or stop the one this player started. */
  async function pressPvpTimer() {
    const m = lobby && lobby.m, pt = m && m.round && m.round.pt;
    if (!m) return;
    const on = !(pt && pt.by === me() && pt.endAt);
    const d = await call('mtpvp-ptimer', { id: lobby.id, on });
    if (!d || d.error) { ctx.toast((d && d.error) || 'Offline — try again'); return; }
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
    const mode = m.mode || L.opts.mode || 'attrition';
    const inRound = !!(v && v.pvp && v.pvp.nemesis);
    const t = m.timer;
    const o = {
      me: me(), name, lives: m.lives[name], max: mode === 'survival' ? 1 : L.opts.lives, myLives: m.lives[me()], mode,
      far: (m.far && m.far[name]) || 0, myFar: (m.far && m.far[me()]) || 0,
      loc: s.loc || '', ante: s.ante || 0, ready: !!(rd && rd.ready && rd.ready[name]), meReady, countdown,
      // ("Hide enemy score until you play": the referee sends no score until this player has played a hand — ???)
      score: inRound && sc ? sc.s : null, hidden: !!(inRound && sc && sc.hid), hands: inRound && sc ? sc.h : null,
      timer: t && !m.over ? { onMe: t.on === me(), mine: t.by === me(), paused: !t.endAt, left: Math.max(0, (t.endAt ? t.endAt - serverNow() : t.left || 0) / 1000) } : null,
      canHurry: !!(L.opts.timer && mode !== 'survival' && !m.over && !m.pending && meReady && rd && !rd.startAt && !(rd.ready && rd.ready[name]) && !(t && t.by === me() && t.endAt)),
      ruleset: L.opts.ruleset || 'vanilla', order: !!L.opts.order,
    };
    // the PvP timer (stage 7): in the round, whoever it runs on; the leader's button
    const pt = rd && rd.pt;
    if (inRound && rd && rd.startAt && !rd.res && L.opts.pvpTimer) {
      const mine = rd.scores && rd.scores[me()];
      const ahead = !!(sc && mine && sc.s != null && cmpScore(mine.s, sc.s) > 0);
      o.pvpt = pt ? { onMe: pt.on === me(), mine: pt.by === me(), left: Math.max(0, (pt.endAt - serverNow()) / 1000) } : null;
      o.canPvpTimer = !pt && ahead && !(L.opts.hideScore && !(mine && mine.hp > 0)) && !(Number.isInteger(sc && sc.h) && sc.h < 1);
      o.myClock = Math.max(0, (((rd.clk && rd.clk[me()]) != null ? rd.clk[me()] : 60000)) / 1000);
    }
    // banners: the opponent away (the forfeit clock), a pending death
    const banners = [];
    if (opp && opp.age != null && opp.age > AWAY_MS && !m.over) banners.push(`${esc(name)} disconnected — waiting for them to come back (${Math.max(0, GRACE_S - Math.floor(opp.age / 1000))} s)`);
    if (m.pending && !m.over && mode === 'survival') {
      const [pa, ps] = m.pending.key.split(':');
      const df = blindText(m.pending.far || 0);
      banners.push(m.pending.dead === me() ? `<b>OUT OF LIVES</b> (furthest: ${df}) — waiting for ${esc(name)} to reach this blind (ante ${pa} ${ps}): they win only by beating it. Leaving is not a forfeit.`
        : `${esc(name)} is out (furthest: ${df}) — beat ante ${pa} ${ps} to win the match!`);
    } else if (m.pending && !m.over) {
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
    const why = { lives: 'out of lives', forfeit: won ? oppName + ' forfeited' : 'forfeit', pending: 'the pending blind decided it', timer: 'out of time (the Hurry timer)', furthest: 'the furthest blind decided it' }[m.over.why] || '';
    el.appendChild(h('div', 'pvp-end-why muted', esc(why)));
    el.appendChild(h('div', 'pvp-end-lives', m.mode === 'survival' ? `Furthest blind: ${esc(me())} ${blindText((m.far || {})[me()] || 0)} · ${esc(oppName)} ${blindText((m.far || {})[oppName] || 0)}`
      : `${esc(me())} ♥${m.lives[me()]} · ${esc(oppName)} ♥${m.lives[oppName]}`));
    if (m.hist && m.hist.length) {
      el.appendChild(h('div', 'pvp-end-hist', m.hist.map((x) => `Ante ${x.ante}${x.slot && x.slot !== 'Boss' ? ' ' + x.slot : ''}: ${esc(x.s[me()] || '0')} vs ${esc(x.s[oppName] || '0')} ${x.loser === '' ? '(tie)' : x.loser === me() ? '(lost)' : '(won)'}`).join('<br>')));
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
    open, joinFlow, resume, leave, forfeitConfirm, pressReady, pressHurry, pressPvpTimer,
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
