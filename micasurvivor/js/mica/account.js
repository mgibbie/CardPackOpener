/* ============ mica/account.js — Magepunk accounts (MicaSurvivor M3, not upstream) ============
 * MicaSurvivor plays as the logged-in MAGEPUNK user (the site's token + state in
 * localStorage, the same pair /battlecards/mpmode.js and /micatro/js/net.js read).
 * Guests (no token) keep the browser-only save and make NO network request at all.
 *
 *   G.MicaAccount.name()          the Magepunk username, or null (guest)
 *   G.MicaAccount.getSave()       POST /api/mp micasurvivor-save-get  -> {ok, status, body:{rev, save}}
 *   G.MicaAccount.putSave(s, rev) POST /api/mp micasurvivor-save-put  -> {ok, status, body} (409 = stale: body {rev, save})
 *   G.MicaAccount.submitScore(r)  run-score {mode:'micasurvivor', time, kills, level, dex, shiny}
 *   G.MicaAccount.leaderboard()   run-leaderboard {mode:'micasurvivor'} -> {top, you}
 * Nothing here throws: a network failure comes back as {ok:false, status:0}.
 * The save/merge logic lives in js/core/db.js (Magepunk mode); the screens (guest
 * carry-over offer, leaderboard, back-to-the-overworld link) in G.MicaUI below.
 */
G.I18n.add({
  'Entrar con Magepunk': 'Log in with Magepunk',
  'Inicia sesión en Magepunk para guardar tu progreso en tu cuenta y salir en la clasificación.': 'Log in to Magepunk to save your progress to your account and join the leaderboard.',
  'Tu partida se guarda en tu cuenta de Magepunk.': 'Your progress is saved to your Magepunk account.',
  'Tu partida se guarda en este navegador. Inicia sesión en Magepunk para guardar tu progreso en tu cuenta y salir en la clasificación.':
    'Your progress is saved in this browser. Log in to Magepunk to save it to your account and join the leaderboard.',
  'Cuenta de Magepunk': 'Magepunk account',
  'Cuenta': 'Account',
  'Tipo de cuenta': 'Account type',
  'Se cierra sesión y se gestiona la cuenta en Magepunk.': 'Log out and manage your account on Magepunk.',
  'Abrir Magepunk': 'Open Magepunk',
  'Guardado en tu cuenta de Magepunk': 'Saved to your Magepunk account',
  'Tu progreso de invitado': 'Your guest progress',
  'Has jugado como invitado en este navegador. ¿Quieres llevar ese progreso a tu cuenta de Magepunk?': 'You played as a guest in this browser. Bring that progress into your Magepunk account?',
  'Tu cuenta ya tiene progreso. Se juntan las dos partidas: no se pierde nada de ninguna (Pokémon, shinies, mejoras, Movimientos Z, monedas y récords se suman o se quedan con lo mejor). Antes se guarda una copia de seguridad de tu cuenta.':
    'Your account already has progress. The two saves are merged: nothing from either is lost (Pokémon, shinies, upgrades, Z-moves, coins and records are added up or the best is kept). A backup of your account save is made first.',
  'Tu cuenta aún no tiene progreso: pasará a tener el de invitado.': 'Your account has no progress yet: it takes over your guest progress.',
  'Llevar a mi cuenta': 'Bring it into my account', 'Juntar con mi cuenta': 'Merge into my account', 'No, gracias': 'No, thanks',
  'La partida de invitado se queda en este navegador. Sólo se pregunta una vez.': 'The guest save stays in this browser. You are only asked once.',
  'Progreso de invitado añadido a tu cuenta': 'Guest progress added to your account',
  'Volver al mundo': 'Back to the overworld', 'Volver a Magepunk': 'Back to Magepunk',
  'Clasificación': 'Leaderboard', 'Mejor tiempo aguantado': 'Best survival time',
  'Inicia sesión en Magepunk': 'Log in to Magepunk',
  'Clasificación · tiempo aguantado': 'Leaderboard · time survived',
  'Los mejores tiempos en solitario de los jugadores de Magepunk.': 'The best solo survival times of Magepunk players.',
  'Tu mejor puesto: #{x}': 'Your best rank: #{x}', 'Aún no tienes marca.': "You don't have a record yet.",
  'Aún no estás en el top 100.': "You're not in the top 100 yet.",
  'Inicia sesión en Magepunk para salir en la clasificación.': 'Log in to Magepunk to join the leaderboard.',
  'No se pudo cargar la clasificación.': "Couldn't load the leaderboard.",
  '¡Nueva mejor marca en la clasificación! Puesto #{x}': 'New best on the leaderboard! Rank #{x}',
  'derrotados': 'defeated', 'monedas': 'coins'
});

G.MicaAccount = (() => {
  const TOKEN = 'magepunk_mp_token_v1', STATE = 'magepunk_mp_state_v1';
  const API = '/api/mp';
  let expired = false;      // the server said 401: the token is stale (the save stays local until a new login)

  function token() { try { return localStorage.getItem(TOKEN) || ''; } catch (e) { return ''; } }
  /** The logged-in Magepunk username (lower-case, as the server keys it), or null. */
  function name() {
    if (!token()) return null;
    try {
      const st = JSON.parse(localStorage.getItem(STATE) || 'null');
      const n = st && typeof st.username === 'string' ? st.username.trim().toLowerCase() : '';
      return /^[a-z0-9_.-]{1,40}$/.test(n) ? n : null;
    } catch (e) { return null; }
  }

  async function call(action, payload = {}, opts = {}) {
    if (!token()) return { ok: false, status: 401, body: { error: 'not logged in' } };
    let res;
    try {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const t = ctl ? setTimeout(() => ctl.abort(), opts.timeout || 15000) : 0;
      res = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token() },
        body: JSON.stringify(Object.assign({ action }, payload)),
        keepalive: !!opts.keepalive,
        signal: ctl ? ctl.signal : undefined
      });
      clearTimeout(t);
    } catch (e) { return { ok: false, status: 0, body: { error: 'offline' } }; }
    let body = null;
    try { body = await res.json(); } catch (e) { body = { error: 'bad response' }; }
    if (res.status === 401) expired = true;
    return { ok: res.ok && body && !body.error, status: res.status, body: body || {} };
  }

  const getSave = () => call('micasurvivor-save-get');
  function putSave(save, rev, opts = {}) {
    const text = JSON.stringify(save);
    // keepalive (a save on page unload) caps the body at ~64 KB: a bigger save stays in the
    // local copy and is merged in on the next visit.
    return call('micasurvivor-save-put', { save, rev }, { keepalive: !!opts.keepalive && text.length < 60000 });
  }

  /** {time (s), kills, level, dex, shiny} -> {ok, better, best, rank} | {error} */
  async function submitScore(r) {
    if (!name()) return { error: 'not logged in' };
    // (DLC D16: rules = this build's ruleset, G.Player.RULES: the server files it on the new board, runboard:micasurvivor:r2)
    const d = await call('run-score', { mode: 'micasurvivor', time: Math.floor(r.time), kills: Math.floor(r.kills || 0), level: Math.floor(r.level || 1), dex: r.dex | 0, shiny: !!r.shiny, rules: G.Player.RULES });
    return d.ok ? d.body : { error: (d.body && d.body.error) || 'offline' };
  }
  /** (DLC D16) legacy: the board from before the new rules (every move fires), read-only. */
  async function leaderboard(legacy) {
    if (!name()) return { top: [], you: null, error: 'not logged in' };
    const d = await call('run-leaderboard', legacy ? { mode: 'micasurvivor' } : { mode: 'micasurvivor', rules: G.Player.RULES });
    if (!d.ok) return { top: [], you: null, error: (d.body && d.body.error) || 'offline' };
    return { top: d.body.top || [], you: d.body.you || null };
  }

  const loginUrl = () => '/login/?next=' + encodeURIComponent(location.pathname + location.search);
  const direct = /[?&]direct=1\b/.test(location.search);

  return {
    name, call, getSave, putSave, submitScore, leaderboard, loginUrl, direct,
    get expired() { return expired; },
    /** Runs shorter than this (seconds) are not sent to the leaderboard (upstream's MIN_T). */
    MIN_T: 120
  };
})();

/* ---------------- screens: guest carry-over, leaderboard, way back ---------------- */
G.MicaUI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Login screen + menu: a "log in with Magepunk" button for guests, the way back for everyone. */
  function decorate() {
    const acc = G.MicaAccount;
    const lg = $('btn-mp-login');
    if (lg) {
      lg.classList.toggle('hidden', !!acc.name());
      lg.onclick = () => { location.href = acc.loginUrl(); };
    }
    for (const a of document.querySelectorAll('.mica-back')) {
      a.href = acc.direct ? '/overworld/' : '/';
      a.textContent = G.T(acc.direct ? 'Volver al mundo' : 'Volver a Magepunk');
    }
    const rk = $('menu-rank-sub');
    if (rk) rk.textContent = G.T(acc.name() ? 'Mejor tiempo aguantado' : 'Inicia sesión en Magepunk');
  }

  /** The once-only guest -> account offer (G.DB.carryOffer). Calls then() when answered. */
  function offerCarry(then) {
    const offer = G.DB.carryOffer;
    if (!offer) { then(); return; }
    const box = $('scr-carry');
    $('carry-text').textContent = G.T(offer.accountEmpty
      ? 'Tu cuenta aún no tiene progreso: pasará a tener el de invitado.'
      : 'Tu cuenta ya tiene progreso. Se juntan las dos partidas: no se pierde nada de ninguna (Pokémon, shinies, mejoras, Movimientos Z, monedas y récords se suman o se quedan con lo mejor). Antes se guarda una copia de seguridad de tu cuenta.');
    const g = offer.guest, owned = Object.keys(g.owned || {}).length;
    $('carry-guest').innerHTML = `<b translate="no">${owned}</b> Pokémon · <b translate="no">${(g.coins || 0).toLocaleString('en')}</b> ${esc(G.T('monedas'))} · Runs <b translate="no">${(g.stats && g.stats.runs) || 0}</b>`;
    $('carry-yes').textContent = G.T(offer.accountEmpty ? 'Llevar a mi cuenta' : 'Juntar con mi cuenta');
    const done = (choice) => {
      $('carry-yes').onclick = $('carry-no').onclick = null;
      box.classList.add('hidden');
      G.DB.carryGuest(choice);
      if (choice === 'carry') G.UI.toast(G.T('Progreso de invitado añadido a tu cuenta'), 3000);
      then();
    };
    $('carry-yes').onclick = () => done('carry');
    $('carry-no').onclick = () => done('skip');
    G.UI.show('scr-carry');
  }

  const fmt = t => t >= 3600 ? Math.floor(t / 3600) + ':' + G.U.mmss(t % 3600).padStart(5, '0') : G.U.mmss(t);
  let token = 0, legacy = false;
  /** The Leaderboard screen (#scr-rank, reused): our run board, top 50 + your rank. (DLC D16: "Reglas actuales" = the board of
   *  the new rules from 2026-10-26, "Reglas anteriores" (Legacy) = the board before them, read-only: #rk-rules.) */
  async function openRanking(view) {
    const acc = G.MicaAccount;
    if (!acc.name()) { G.UI.toast(G.T('Inicia sesión en Magepunk para salir en la clasificación.'), 3200); return; }
    if (view === 'legacy' || view === 'current') legacy = view === 'legacy';
    G.UI.show('scr-rank', true);
    $('scr-rank').classList.add('mica-board');
    const tabs = $('rk-rules');
    if (tabs) {
      tabs.classList.remove('hidden');
      tabs.innerHTML = '';
      for (const [k, label] of [['current', 'Reglas actuales'], ['legacy', 'Reglas anteriores']]) {
        const b = document.createElement('button');
        b.className = 'gen-tab' + ((k === 'legacy') === legacy ? ' on' : '');
        b.dataset.rules = k;
        b.innerHTML = '<b>' + esc(G.T(label)) + '</b>';
        b.onclick = () => openRanking(k);
        tabs.appendChild(b);
      }
    }
    const list = $('rk-list'), me = $('rk-me');
    list.innerHTML = '<p class="sub">Cargando…</p>'; me.innerHTML = '';
    if (legacy) me.innerHTML = '';
    const my = ++token;
    const d = await acc.leaderboard(legacy);
    if (my !== token) return;
    if (d.error) { list.innerHTML = `<p class="sub">${esc(G.T('No se pudo cargar la clasificación.'))}</p>`; return; }
    list.innerHTML = '';
    if (!d.top.length) list.innerHTML = '<p class="sub">Todavía no hay marcas aquí. ¡Sé el primero!</p>';
    const mine = acc.name();
    d.top.forEach((r, i) => {
      const pos = i + 1;
      const el = document.createElement('div');
      el.className = 'rk-row' + (r.name === mine ? ' mine' : '') + (pos <= 3 ? ' top' + pos : '');
      el.insertAdjacentHTML('beforeend', `<span class="pos">${pos <= 3 ? G.Icons.html('trophy', 20) : ''}${pos}</span>`);
      const mons = document.createElement('span');
      mons.className = 'mons';
      if (r.dex && G.DEX_BY[r.dex]) mons.appendChild(G.UI.spriteCanvas(r.dex, 44, 40, { scale: 1, shiny: !!r.shiny }));
      el.appendChild(mons);
      el.insertAdjacentHTML('beforeend', `<span class="who"><b translate="no">${esc(r.name)}</b><small>${G.I18n.lang === 'en' ? 'Lv.' : 'Nv.'} ${r.level || 1} · ${(r.kills || 0).toLocaleString('en')} ${esc(G.T('derrotados'))}</small></span>`
        + `<span class="time">${fmt(r.time || 0)}</span><span></span>`);
      list.appendChild(el);
    });
    me.innerHTML = (d.you && d.you.rank ? esc(G.T('Tu mejor puesto: #' + d.you.rank)) + ` · ${fmt(d.you.time || 0)}`
      : d.you ? esc(G.T('Aún no estás en el top 100.')) : esc(G.T('Aún no tienes marca.')))
      + (legacy ? ' · ' + esc(G.T('Clasificación anterior a las reglas nuevas (todos los movimientos a la vez): sólo lectura.')) : '');
  }

  /** endRun hook: a clean solo run's mark goes to the board (logged-in players only). */
  function runEnded(mark) {
    const acc = G.MicaAccount;
    if (!acc.name() || !(mark.time >= acc.MIN_T)) return null;
    return acc.submitScore(mark).then(r => {
      if (r && r.better && r.rank) G.UI.toast(G.T('¡Nueva mejor marca en la clasificación! Puesto #' + r.rank), 3400);
      return r;
    }).catch(() => null);
  }

  return { decorate, offerCarry, openRanking, runEnded };
})();
