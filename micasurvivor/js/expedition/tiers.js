'use strict';
/* ============ expedition/tiers.js — tiers, score, medals and boards (MicaSurvivor DLC D9, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load(), js/systems/expedition.js); a base page never runs it.
 * Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.11-2.13 and the D9 row. Numbers live in K (balance; README "DLC D9").
 *
 *   tiers      Normal / Hard / Nightmare (K.TIERS, study 2.11): enemy HP, damage, speed, amount, the concurrent cap, an elite
 *              share of the trickle, event sizes, events earlier, telegraph time, boss escorts, XP and the score. Classic
 *              reads of(diff) (js/expedition/classic.js: plan, spawn, trickle, capNow, the rock slide, wake). Pure tables:
 *              a viewer gets the tier from the `x` block's c.d (v3 on), so nothing new is streamed.
 *   unlocks    per map, in sequence: Normal always; winning the map on a tier opens the next (the save's `tier.<map>`
 *              counter, max-merged, read together with D3's `wins.<map>.<diff>`, so an old win counts).
 *   pick       the map + tier this device starts Classic with (localStorage micasurvivorexp_tier; clamped to what is
 *              playable and unlocked). G.Expedition.pick() asks here once the code is loaded.
 *   score      study 2.12's Classic score + a catch term: (2 KOs + 3 s + damage / 200 + 1,500 (zone - 1) + 800 bosses
 *              + 6,000 if won + 400 a catch) x (1 + 0.5 tier). The server recomputes it from the same parts
 *              (server/mp.mjs msurvExpScore) and refuses a mismatch.
 *   medals     time attack (study 2.13): a won run's time -> bronze (finish), silver, gold, champion; Normal's limits
 *              x(1 + 0.08 tier) + 3 min on a map with a shrine. Saved per map + tier (`medal.<map>.<diff>`, max-merged).
 *   boards     per map + tier (owner decision #8): Score (D0b's board), Time attack (won runs), and the weekly Season
 *              (7 days from Monday 2026-10-12 UTC): its prizes are COSMETIC RIBBONS ONLY, earned by play (owner rule: never
 *              ads or paid items). A ribbon is claimed into the Expedition save (`season.prize`, `season.best`) when you look
 *              at last week's board and placed in its top 50.
 *   the panel  "Difficulty and leaderboards" on the mode select (the Classic card's button): map tabs, the tier cards with
 *              your medal and best clear, the medal limits, and the boards (Score / Time attack / Season).
 */
G.I18n.add({
  'Dificultad: {x} · clasificaciones': 'Difficulty: {x} · leaderboards',
  'Expedición · dificultad y clasificaciones': 'Expedition · difficulty and leaderboards',
  'Atrás': 'Back', 'Próximamente': 'Coming soon', 'Elegida': 'Selected', 'Elegir': 'Choose',
  'Gana el mapa en {x} para desbloquearla': 'Win the map on {x} to unlock it',
  'Vida ×{x} · daño ×{x} · velocidad ×{x}': 'HP ×{x} · damage ×{x} · speed ×{x}',
  'Enemigos ×{x} · tope ×{x} · élites {x} %': 'Enemies ×{x} · cap ×{x} · elites {x} %',
  'Eventos ×{x}, {x} s antes · escoltas {x}': 'Events ×{x}, {x} s earlier · escorts {x}',
  'XP ×{x} · puntos ×{x}': 'XP ×{x} · score ×{x}',
  'La experiencia de referencia.': 'The reference experience.',
  'Mejor: {x}': 'Best: {x}', 'Sin victorias aún': 'No win yet',
  'Medallas ({x})': 'Medals ({x})', 'Terminar': 'Finish',
  'Bronce': 'Bronze', 'Plata': 'Silver', 'Oro': 'Gold', 'Campeón': 'Champion', 'Sin medalla': 'No medal',
  'Puntuación': 'Score', 'Contrarreloj': 'Time attack', 'Temporada': 'Season',
  'Inicia sesión en Magepunk para ver las clasificaciones.': 'Log in to Magepunk to see the leaderboards.',
  'Cargando…': 'Loading…', 'No se pudo cargar la clasificación.': "Couldn't load the leaderboard.",
  'Todavía no hay marcas aquí. ¡Sé el primero!': 'No records here yet. Be the first!',
  'Tu mejor puesto: #{x}': 'Your best rank: #{x}', 'Aún no estás en el top 100.': "You're not in the top 100 yet.",
  'Aún no tienes marca.': "You don't have a record yet.",
  'Temporada {x} · termina en {x}': 'Season {x} · ends in {x}',
  'Premios de la temporada (sólo cintas cosméticas, se ganan jugando)': 'Season prizes (cosmetic ribbons only, earned by playing)',
  'Maestro': 'Master', 'Élite': 'Elite',
  'Temporada pasada: #{x} · cinta {x}': 'Last season: #{x} · {x} ribbon',
  'Temporada pasada: #{x}': 'Last season: #{x}', 'Temporada pasada: sin marca': 'Last season: no record',
  'Tus cintas: {x}': 'Your ribbons: {x}', 'Aún no tienes cintas': 'No ribbons yet',
  'Cinta de temporada: {x}': 'Season ribbon: {x}',
  'Nv. {x} · {x} derrotados': 'Lv. {x} · {x} defeated',
  'Zona {x}': 'Zone {x}', '¡Mapa completado!': 'Map complete!', '{x} capturas': '{x} catches',
  'Puntuación: {x}': 'Score: {x}', 'Puntuación: {x} (×{x} {x})': 'Score: {x} (×{x} {x})',
  'Medalla: {x}': 'Medal: {x}', 'Nueva medalla: {x}': 'New medal: {x}', 'Medalla': 'Medal',
  'Siguiente: {x} en menos de {x}': 'Next: {x} under {x}',
  '{x} desbloqueada en {x}': '{x} unlocked on {x}',
  '¡Nueva marca de la Expedición! Puesto #{x}': 'New Expedition record! Rank #{x}',
  'Contrarreloj: puesto #{x}': 'Time attack: rank #{x}',
  'Supervivencia': 'Survival', '{x} jefes de hito': '{x} milestone bosses', 'Mejor supervivencia: {x}': 'Best survival: {x}',   // (DLC D11)
  'Difícil': 'Hard', 'Pesadilla': 'Nightmare', 'Bosque Verde': 'Viridian Forest', 'Monte Moon': 'Mt. Moon', 'Cabo Celeste': 'Cerulean Cape',
  'Gana {x} para abrir este mapa': 'Clear {x} to open this map', 'Gana {x} antes': 'Clear {x} first', 'Nuevo mapa abierto: {x}': 'New map open: {x}',   // (DLC D12)
  'Ver': 'Watch', '{x} d {x} h': '{x} d {x} h', '{x} h {x} min': '{x} h {x} min'
});

G.ExpTier = (() => {
  // ---------------- balance (tune here) ----------------
  const K = {
    // study 2.11, all three columns as written (pay: the run's Pokémonedas, read by D10's payout; nothing pays yet)
    TIERS: {
      normal:    { hp: 1,   dmg: 1,    spd: 1,    amount: 1,   cap: 1,    elite: 0,    event: 1,   early: 0,  tele: 1,    escorts: 0, xp: 1,    pay: 1,    score: 1 },
      hard:      { hp: 1.4, dmg: 1.42, spd: 1.08, amount: 1.3, cap: 1.15, elite: 0.04, event: 1.2, early: 15, tele: 0.92, escorts: 1, xp: 1.15, pay: 1.75, score: 1.5 },
      nightmare: { hp: 1.9, dmg: 1.96, spd: 1.16, amount: 1.6, cap: 1.3,  elite: 0.08, event: 1.4, early: 30, tele: 0.85, escorts: 2, xp: 1.3,  pay: 2.5,  score: 2 }
    },
    // the score (study 2.12, Classic) + CATCH a capture (ours: half a boss); = server/mp.mjs MSURV_EXP_SCORE
    SCORE: { KO: 2, SEC: 3, DMG: 200, ZONE: 1500, BOSS: 800, WIN: 6000, CATCH: 400, TIER: 0.5 },
    // time attack (study 2.13): silver / gold / champion under these seconds on Normal; x(1 + MEDAL_TIER x tier); + SHRINE_S on
    // a map with a shrine (all three launch maps). = server/mp.mjs MSURV_EXP_MEDALS
    MEDALS: [1620, 1200, 870], MEDAL_TIER: 0.08, SHRINE_S: 180,
    // the weekly season (study 2.13: 7 days, from 2026-10-12); = server/mp.mjs MSURV_EXP_SEASON0 / _WEEK
    SEASON0: Date.UTC(2026, 9, 12), WEEK: 7 * 86400000,
    // the Season tab + ribbon chip are HIDDEN (owner decision #8: no weekly seasons for now, 2026-10-22). The server keeps
    // writing the season boards (GC'd), so turning this on later shows real weeks.
    SEASON_TAB: false,
    // the season's ribbons by place (study 2.13's map-board places; no Stardust: cosmetic only)
    PRIZES: [[1, 'master'], [3, 'elite'], [10, 'top10'], [25, 'top25'], [50, 'top50']],
    ESCORT: { hp: 3, dmg: 1.3, xp: 3, scale: 1.25 }   // a boss's escorts are elites of the zone (D3's ELITE numbers)
  };
  const DIFFS = ['normal', 'hard', 'nightmare'];
  const DIFF_NAME = { normal: 'Normal', hard: 'Difícil', nightmare: 'Pesadilla' };
  const MAP_NAME = { viridian: 'Bosque Verde', mtmoon: 'Monte Moon', cerulean: 'Cabo Celeste' };
  const MEDAL = ['', 'bronze', 'silver', 'gold', 'champion'];
  const MEDAL_NAME = { bronze: 'Bronce', silver: 'Plata', gold: 'Oro', champion: 'Campeón' };
  const MEDAL_ICON = { bronze: 'medal1', silver: 'medal2', gold: 'medal3', champion: 'trophy', '': 'medalOff' };
  const PRIZE_NAME = { master: 'Maestro', elite: 'Élite', top10: 'Top 10', top25: 'Top 25', top50: 'Top 50' };
  const PRIZE_LV = { top50: 1, top25: 2, top10: 3, elite: 4, master: 5 };
  const PICK_KEY = 'micasurvivorexp_tier';
  const INV = 1e9;   // (D3's split encoding: INV - deciseconds)
  const T = () => G.I18n;
  const Sv = () => G.ExpSave;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const idx = d => Math.max(0, DIFFS.indexOf(d));
  /** The tier row of a difficulty (an unknown one: Normal). */
  const of = d => K.TIERS[DIFFS.includes(d) ? d : 'normal'];
  /** The maps Classic can play (D3: Viridian Forest; D12 adds the others). */
  const playable = () => (G.ExpClassic ? Object.keys(G.ExpClassic.MAPS) : ['viridian']);
  /** DLC D12: the maps in their unlock order (the study's: each opens when the one before it is cleared). */
  const MAP_ORDER = ['viridian', 'mtmoon', 'cerulean'];
  /** The map you must clear to open `map` (null: the first, always open). */
  const prevMap = map => { const i = MAP_ORDER.indexOf(map); return i > 0 ? MAP_ORDER[i - 1] : null; };
  /** DLC D12: is `map` open? Playable, and the map before it won on any tier (D3's `wins.<map>.<diff>`, max-merged). */
  function mapOpen(map) {
    if (!playable().includes(map)) return false;
    const pv = prevMap(map);
    return !pv || DIFFS.some(d => Sv().get('wins.' + pv + '.' + d) > 0);
  }

  // ---------------- unlocks, medals, records (the Expedition save; max-merged) ----------------
  /** The highest tier index open on `map` (0 Normal, 1 Hard, 2 Nightmare): the counter, or the wins in sequence. */
  function unlocked(map) {
    const S = Sv();
    let n = 0;
    while (n < 2 && S.get('wins.' + map + '.' + DIFFS[n]) > 0) n++;
    return Math.min(2, Math.max(n, S.get('tier.' + map)));
  }
  const isOpen = (map, diff) => mapOpen(map) && idx(diff) <= unlocked(map) && DIFFS.includes(diff);   // (D12: and the map open)
  /** A clear time's medal index: 1 bronze (any win), 2 silver, 3 gold, 4 champion. Pure. */
  function medalOf(time, diff, map) {
    const k = 1 + K.MEDAL_TIER * idx(diff), shrine = K.SHRINE_S;   // (all three launch maps have a shrine)
    let m = 1;
    K.MEDALS.forEach((s, i) => { if (time < s * k + shrine) m = i + 2; });
    return m;
  }
  /** The medals' limits on a tier: [{id, name, under (s) | null}] (bronze: finishing). */
  const limits = (diff, map) => MEDAL.slice(1).map((id, i) => ({ id, name: MEDAL_NAME[id], under: i ? Math.round(K.MEDALS[i - 1] * (1 + K.MEDAL_TIER * idx(diff)) + K.SHRINE_S) : null }));
  const medal = (map, diff) => Sv().get('medal.' + map + '.' + diff);
  const bestClear = (map, diff) => { const v = Sv().get('clear.' + map + '.' + diff); return v ? (INV - v) / 10 : null; };

  // ---------------- the pick (this device) ----------------
  function readPick() { try { const v = JSON.parse(localStorage.getItem(PICK_KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
  /** The map + tier a new Classic run gets: the saved pick, clamped to a playable map and an unlocked tier. */
  function pick() {
    const p = readPick(), maps = playable().filter(mapOpen);   // (D12: only an open map)
    const map = maps.includes(p.map) ? p.map : maps[0] || 'viridian';
    const diff = DIFFS[Math.min(idx(p.diff), unlocked(map))];
    return { map, diff };
  }
  /** Choose a map + tier (refused when locked). -> true / false */
  function setPick(map, diff) {
    if (!isOpen(map, diff)) return false;
    try { localStorage.setItem(PICK_KEY, JSON.stringify({ map, diff })); } catch (e) { /* the pick is a convenience */ }
    return true;
  }

  // ---------------- the score ----------------
  /** The score of a run's parts {kills, time, dmg, zone, bosses, won, catches} on a tier. Pure; = server msurvExpScore. */
  function score(p, diff) {
    const S = K.SCORE;
    return Math.floor((S.KO * p.kills + S.SEC * p.time + p.dmg / S.DMG + S.ZONE * (p.zone - 1) + S.BOSS * p.bosses + (p.won ? S.WIN : 0) + S.CATCH * p.catches) * (1 + S.TIER * idx(diff)));
  }

  // ---------------- the season ----------------
  /** The season of time `now` (1 = the week from 2026-10-12 UTC): {id, starts, ends}. Pure. */
  function seasonOf(now) {
    const id = Math.floor((now - K.SEASON0) / K.WEEK) + 1, starts = K.SEASON0 + (id - 1) * K.WEEK;
    return { id, starts, ends: starts + K.WEEK };
  }
  /** A place's ribbon: 'master' | 'elite' | 'top10' | 'top25' | 'top50' | null. */
  const prizeOf = rank => { if (!(rank >= 1)) return null; for (const [n, id] of K.PRIZES) if (rank <= n) return id; return null; };
  /** Claim a past season's ribbon into the Expedition save (once). -> the ribbon id if new, else null */
  function claim(sid, map, diff, rank) {
    const pz = prizeOf(rank);
    if (!pz) return null;
    const id = 's' + sid + '.' + map + '.' + diff + '.' + pz;
    if (!Sv().add('season.prize', id)) return null;
    Sv().best('season.best', PRIZE_LV[pz]);
    Sv().commit();
    return pz;
  }
  /** Your ribbons by kind: {master: n, ...} */
  function ribbons() {
    const out = {};
    for (const id of Sv().list('season.prize')) { const k = id.split('.').pop(); if (PRIZE_NAME[k]) out[k] = (out[k] || 0) + 1; }
    return out;
  }

  // ---------------- the end of a run (js/expedition/core.js run.end, BEFORE Classic records its wins) ----------------
  /**
   * The medal and the unlock of a Classic run, saved; and its run-over lines. res: G.ExpClassic.result(); sum: the run's
   * summary with its score and parts. -> {lines, medal: {id, name, icon, time, isNew, next} | null, unlocked}
   */
  function record(sum, res) {
    const map = res.map, diff = res.diff, S = Sv(), lines = [];
    const tr = of(diff);
    lines.push(tr.score !== 1 ? T().f('Puntuación: {x} (×{x} {x})', (sum.score || 0).toLocaleString('en'), tr.score, T().t(DIFF_NAME[diff])) : T().f('Puntuación: {x}', (sum.score || 0).toLocaleString('en')));
    let m = null, unl = null;
    if (res.won) {
      const mi = medalOf(sum.time, diff, map), had = medal(map, diff), id = MEDAL[mi];
      S.best('medal.' + map + '.' + diff, mi);
      S.bump('medals.' + id);
      const lim = limits(diff, map), nx = lim[mi];   // (the next medal up, if any)
      m = { id, name: T().t(MEDAL_NAME[id]), icon: MEDAL_ICON[id], time: sum.time, isNew: mi > had,
            next: nx ? T().f('Siguiente: {x} en menos de {x}', T().t(nx.name), G.U.mmss(nx.under)) : null };
      lines.push(T().f(mi > had ? 'Nueva medalla: {x}' : 'Medalla: {x}', m.name));
      const before = unlocked(map), want = Math.min(2, idx(diff) + 1);
      const next = MAP_ORDER[MAP_ORDER.indexOf(map) + 1], nextWas = next ? mapOpen(next) : true;   // (D12: before this win is recorded)
      S.best('tier.' + map, want);
      if (want > before) { unl = DIFFS[want]; lines.push(T().f('{x} desbloqueada en {x}', T().t(DIFF_NAME[unl]), T().t(MAP_NAME[map] || map))); }
      if (!nextWas && playable().includes(next)) lines.push(T().f('Nuevo mapa abierto: {x}', T().t(MAP_NAME[next])));
    }
    return { lines, medal: m, unlocked: unl };
  }

  // ---------------- the boards (server/mp.mjs run-score / run-leaderboard, mode micasurvivor_expedition) ----------------
  /** One board: view 'score' | 'time' | 'season' (season: a season id, default the current). -> the server's body | {error} */
  // (DLC D16: rules = the boards of the new rules (every move fires) from dv 15; legacy: the boards before them, read-only)
  async function read(map, diff, view = 'score', season, legacy = ui.legacy) {
    const A = G.MicaAccount;
    if (!A || !A.name()) return { top: [], you: null, error: 'not logged in' };
    const d = await A.call('run-leaderboard', Object.assign({ mode: G.Expedition.BOARD, map, diff }, view !== 'score' ? { board: view } : {}, season != null ? { season } : {}, legacy ? {} : { rules: G.Player.RULES }));
    if (!d.ok) return { top: [], you: null, error: (d.body && d.body.error) || 'offline' };
    return d.body;
  }
  /** A won run's replay id for its board mark (uploaded once: G.Replay.share; null if it can't be). */
  async function replayId() {
    const R = G.Replay, e = R && R.last;
    if (!e || !e.ready) return null;
    try { await e.ready; const r = await R.share(e.rid); return r && r.ok ? r.id : null; } catch (err) { return null; }
  }

  // ---------------- the panel: "Difficulty and leaderboards" (#scr-modes; opened from the Classic card) ----------------
  const CSS = `
#modes-xtier .xt-head h3 { margin: 0; font-size: 18px; }
#modes-xtier .xt-maps { margin: 6px 0; }
#modes-xtier .xt-tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
#modes-xtier .xt-tier { text-align: left; border: 2px solid rgba(244,248,255,.2); border-radius: 10px; background: rgba(0,0,0,.22); padding: 7px 9px; font-size: 12px; color: #dfe7f3; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
#modes-xtier .xt-tier b.nm { font-size: 16px; color: #f4f8ff; display: flex; align-items: center; gap: 6px; }
#modes-xtier .xt-tier.on { border-color: #ffd23f; box-shadow: 0 0 0 2px rgba(255,210,63,.25) inset; }
#modes-xtier .xt-tier.locked { opacity: .62; }
#modes-xtier .xt-tier .xt-row { color: #aab6c8; line-height: 1.3; }
#modes-xtier .xt-tier .xt-best { margin-top: 3px; display: flex; align-items: center; gap: 5px; color: #f4f8ff; font-weight: 700; }
#modes-xtier .xt-tier .xt-state { margin-top: 3px; font-weight: 800; color: #7fd18b; }
#modes-xtier .xt-tier.locked .xt-state { color: #ff9aa4; }
#modes-xtier .xt-medals { margin: 7px 0 2px; font-size: 13px; color: #c9d4e4; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; }
#modes-xtier .xt-medals > b { color: #ffd23f; }
#modes-xtier .xt-chip { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
#modes-xtier .xt-tabs { margin: 6px 0 4px; }
#modes-xtier .xt-season { font-size: 13px; color: #c9d4e4; margin: 2px 0 4px; }
#modes-xtier .xt-season b { color: #ffd23f; }
#modes-xtier .xt-prizes { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 3px; }
#modes-xtier .xt-prize { border: 1px solid rgba(255,210,63,.45); border-radius: 8px; padding: 0 7px; color: #f4f8ff; }
#modes-xtier .xt-prize i { color: #9fb1c9; font-style: normal; }
#modes-xtier .xt-list { max-height: calc(calc(100 * var(--vh)) - 330px); min-height: 90px; }
#modes-xtier .rk-row .time small { display: block; font-size: 11px; color: var(--muted); font-weight: 600; }
#modes-xtier .rk-row a.xt-watch { color: #7fe0ff; font-size: 12px; }
@media (max-width: 600px) { #modes-xtier .xt-tiers { grid-template-columns: 1fr; } }
@media (max-height: 520px) {
  #scr-modes .modes-box:has(#modes-xtier:not(.hidden)) > .row:first-child { display: none; }
  #modes-xtier .xt-head h3 { font-size: 15px; } #modes-xtier .xt-maps { margin: 3px 0; } #modes-xtier .xt-maps .gen-tab { padding-top: 2px; padding-bottom: 2px; }
  #modes-xtier .xt-tier { padding: 3px 7px; font-size: 11px; flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: 0 8px; }
  #modes-xtier .xt-tier b.nm { font-size: 14px; flex-basis: 100%; } #modes-xtier .xt-tier .xt-row { display: none; }
  #modes-xtier .xt-tier .xt-row:first-of-type { display: block; flex-basis: 100%; }
  #modes-xtier .xt-tier .xt-best, #modes-xtier .xt-tier .xt-state { margin-top: 1px; }
  #modes-xtier .xt-medals { margin: 3px 0 0; font-size: 11.5px; gap: 2px 10px; } #modes-xtier .xt-tabs { margin: 3px 0 2px; }
  #modes-xtier .xt-season { font-size: 12px; margin: 0 0 2px; } #modes-xtier .xt-list { max-height: none; }
}
`;
  let el = null, onClose = null, scrollWas = 0;
  const ui = { map: null, diff: null, view: 'score', token: 0, legacy: false };   // (DLC D16: legacy, the boards before the new rules)
  const VIEWS = ['score', 'time', 'survival', 'season'];   // (DLC D11: + Survival's board)
  function mount() {
    if (el || typeof document === 'undefined') return el;
    const box = document.querySelector('#scr-modes .modes-box');
    if (!box) return null;
    const st = document.createElement('style'); st.id = 'exp-d9-style'; st.textContent = CSS; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'modes-xtier'; el.className = 'hidden';
    box.appendChild(el);
    return el;
  }
  const $m = id => document.getElementById(id);
  const back0 = () => document.querySelector('#scr-modes [data-back]');
  /** Opens the panel on the mode select (the Expedition code is loaded). onBack: called after it closes. */
  function open(onBack, view) {
    if (!mount()) return false;
    onClose = onBack || null;
    const p = pick();
    ui.map = p.map; ui.diff = p.diff; ui.view = (ui.view === 'season' && !K.SEASON_TAB) ? 'score' : (ui.view || 'score');
    if (VIEWS.includes(view)) ui.view = view;   // (DLC D11: Survival's button opens on its board)
    $m('modes-main').classList.add('hidden');
    el.classList.remove('hidden');
    if (back0()) back0().classList.add('hidden');
    const box = document.querySelector('#scr-modes .modes-box');
    if (box) { scrollWas = box.scrollTop; box.scrollTop = 0; }
    render();
    return true;
  }
  function close(quiet) {
    if (!el || el.classList.contains('hidden')) return false;
    el.classList.add('hidden');
    ui.token++;
    $m('modes-main').classList.remove('hidden');
    if (back0()) back0().classList.remove('hidden');
    const box = document.querySelector('#scr-modes .modes-box');
    if (box && quiet !== true) box.scrollTop = scrollWas;
    if (quiet !== true && onClose) onClose();
    return true;
  }
  /** Esc / the pad's back with the panel open: close it (-> true). */
  const back = () => (el && !el.classList.contains('hidden') ? close() : false);
  const isOpenUI = () => !!(el && !el.classList.contains('hidden'));

  const x2 = v => String(+v.toFixed(2));
  function tierCard(map, d) {
    const i = idx(d), open1 = isOpen(map, d), on = ui.diff === d && open1, tr = of(d), md = medal(map, d), bc = bestClear(map, d);
    const rows = i === 0 ? [T().t('La experiencia de referencia.')] : [
      T().f('Vida ×{x} · daño ×{x} · velocidad ×{x}', x2(tr.hp), x2(tr.dmg), x2(tr.spd)),
      T().f('Enemigos ×{x} · tope ×{x} · élites {x} %', x2(tr.amount), x2(tr.cap), Math.round(tr.elite * 100)),
      T().f('Eventos ×{x}, {x} s antes · escoltas {x}', x2(tr.event), tr.early, tr.escorts)];
    rows.push(T().f('XP ×{x} · puntos ×{x}', x2(tr.xp), x2(tr.score)));
    const mid = MEDAL[md] || '';
    const best = bc != null ? `${G.Icons.html(MEDAL_ICON[mid], 16)} ${esc(T().f('Mejor: {x}', G.U.mmss(bc)))}${mid ? ' · ' + esc(T().t(MEDAL_NAME[mid])) : ''}` : `${G.Icons.html('medalOff', 16)} ${esc(T().t('Sin victorias aún'))}`;
    const state = open1 ? T().t(on ? 'Elegida' : 'Elegir') : T().f('Gana el mapa en {x} para desbloquearla', T().t(DIFF_NAME[DIFFS[i - 1]]));
    return `<button type="button" class="xt-tier${on ? ' on' : ''}${open1 ? '' : ' locked'}" data-tier="${d}"${open1 ? ' data-sfx="select"' : ' aria-disabled="true"'}>
      <b class="nm">${open1 ? '' : G.Icons.html('ban', 14)}${esc(T().t(DIFF_NAME[d]))}</b>${rows.map(r => `<span class="xt-row">${esc(r)}</span>`).join('')}
      <span class="xt-best">${best}</span><span class="xt-state">${esc(state)}</span></button>`;
  }
  function render() {
    if (!el) return;
    const maps = MAP_ORDER, play = maps.filter(mapOpen);   // (D12: every map is playable; a locked one says which map opens it)
    const lockTxt = (m, long) => playable().includes(m) ? T().f(long ? 'Gana {x} para abrir este mapa' : 'Gana {x} antes', T().t(MAP_NAME[prevMap(m)])) : T().t('Próximamente');
    const lim = limits(ui.diff, ui.map);
    const rb = ribbons(), rbTxt = Object.keys(rb).length ? Object.entries(rb).sort((a, b) => PRIZE_LV[b[0]] - PRIZE_LV[a[0]]).map(([k, n]) => T().t(PRIZE_NAME[k]) + ' ×' + n).join(', ') : '';
    el.innerHTML = `
      <div class="row between xt-head"><h3>${esc(T().t('Expedición · dificultad y clasificaciones'))}</h3><button id="xt-back" class="btn small" type="button">${esc(T().t('Atrás'))}</button></div>
      <div class="gen-tabs xt-maps">${maps.map(m => `<button type="button" class="gen-tab${m === ui.map ? ' on' : ''}" data-map="${m}"${play.includes(m) ? '' : ' aria-disabled="true"'}><b>${esc(T().t(MAP_NAME[m]))}</b>${play.includes(m) ? '' : ` <small>${G.Icons.html('ban', 12)} ${esc(lockTxt(m))}</small>`}</button>`).join('')}</div>
      <div class="xt-tiers">${DIFFS.map(d => tierCard(ui.map, d)).join('')}</div>
      <div class="xt-medals"><b>${esc(T().f('Medallas ({x})', T().t(DIFF_NAME[ui.diff])))}</b>${lim.map(l => `<span class="xt-chip">${G.Icons.html(MEDAL_ICON[l.id], 16)} ${esc(T().t(l.name))} ${l.under ? '&lt; ' + G.U.mmss(l.under) : esc(T().t('Terminar'))}</span>`).join('')}
        <span class="xt-chip${K.SEASON_TAB ? '' : ' hidden'}" id="xt-ribbons">${G.Icons.html('crown', 14)} ${esc(rbTxt ? T().f('Tus cintas: {x}', rbTxt) : T().t('Aún no tienes cintas'))}</span></div>
      <div class="filters xt-tabs">${[['score', 'Puntuación'], ['time', 'Contrarreloj'], ['survival', 'Supervivencia']].concat(K.SEASON_TAB ? [['season', 'Temporada']] : []).map(([k, l]) => `<button type="button" class="chip${ui.view === k ? ' on' : ''}" data-view="${k}">${esc(T().t(l))}</button>`).join('')}<button type="button" class="chip${ui.legacy ? ' on' : ''}" data-legacy="1" title="${esc(T().t('Clasificación anterior a las reglas nuevas (todos los movimientos a la vez): sólo lectura.'))}">${esc(T().t('Reglas anteriores'))}</button></div>
      <div id="xt-season" class="xt-season${ui.view === 'season' ? '' : ' hidden'}"></div>
      <div id="xt-list" class="rk-list xt-list"></div>
      <div id="xt-me" class="rk-me"></div>`;
    $m('xt-back').onclick = () => close();
    el.querySelectorAll('[data-map]').forEach(b => { b.onclick = () => {
      const m = b.dataset.map;
      if (!play.includes(m)) { G.UI.toast(lockTxt(m, true)); G.Audio.sfx('error'); return; }
      ui.map = m; ui.diff = DIFFS[Math.min(idx(ui.diff), unlocked(m))]; setPick(ui.map, ui.diff); G.Audio.sfx('select'); render();
    }; });
    el.querySelectorAll('[data-tier]').forEach(b => { b.onclick = () => {
      const d = b.dataset.tier;
      if (!setPick(ui.map, d)) { G.UI.toast(T().f('Gana el mapa en {x} para desbloquearla', T().t(DIFF_NAME[DIFFS[Math.max(0, idx(d) - 1)]]))); G.Audio.sfx('error'); return; }
      ui.diff = d; render();
    }; });
    el.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => { ui.view = b.dataset.view; G.Audio.sfx('select'); render(); }; });
    el.querySelectorAll('[data-legacy]').forEach(b => { b.onclick = () => { ui.legacy = !ui.legacy; G.Audio.sfx('select'); render(); }; });   // (DLC D16)
    loadBoard();
  }
  const fmtT = t => t >= 3600 ? Math.floor(t / 3600) + ':' + G.U.mmss(t % 3600).padStart(5, '0') : G.U.mmss(t);
  function left(ms) {
    const h = Math.max(0, Math.floor(ms / 3600000));
    return h >= 24 ? T().f('{x} d {x} h', Math.floor(h / 24), h % 24) : T().f('{x} h {x} min', h, Math.max(0, Math.floor(ms / 60000) % 60));
  }
  function rowEl(r, pos, view, mine) {
    const d = document.createElement('div');
    d.className = 'rk-row' + (mine ? ' mine' : '') + (pos <= 3 ? ' top' + pos : '');
    d.insertAdjacentHTML('beforeend', `<span class="pos">${pos <= 3 ? G.Icons.html('trophy', 20) : ''}${pos}</span>`);
    const mons = document.createElement('span');
    mons.className = 'mons';
    if (r.dex && G.DEX_BY[r.dex]) mons.appendChild(G.UI.spriteCanvas(r.dex, 44, 40, { scale: 1, shiny: !!r.shiny }));
    d.appendChild(mons);
    const where = view === 'survival' ? (r.bosses ? T().f('{x} jefes de hito', r.bosses) : '') : r.won ? T().t('¡Mapa completado!') : r.zone ? T().f('Zona {x}', r.zone) : '';   // (DLC D11)
    const sub = [T().f('Nv. {x} · {x} derrotados', r.level || 1, (r.kills || 0).toLocaleString('en')), where, r.catches ? T().f('{x} capturas', r.catches) : ''].filter(Boolean).join(' · ');
    const md = view === 'time' ? MEDAL[r.medal | 0] || '' : '';
    const val = view === 'time'
      ? `${G.Icons.html(MEDAL_ICON[md], 16)} ${fmtT(r.time || 0)}<small>${(r.score || 0).toLocaleString('en')}</small>`
      : `${(r.score || 0).toLocaleString('en')}<small>${fmtT(r.time || 0)}</small>`;
    d.insertAdjacentHTML('beforeend', `<span class="who"><b translate="no">${esc(r.name)}</b><small>${esc(sub)}</small></span><span class="time">${val}</span>`
      + (r.replay && /^[a-f0-9]{8,20}$/.test(r.replay) ? `<a class="xt-watch" href="/msr/${r.replay}" target="_blank" rel="noopener">${G.Icons.html('eye', 14)} ${esc(T().t('Ver'))}</a>` : '<span></span>'));
    return d;
  }
  async function loadBoard() {
    const my = ++ui.token, list = $m('xt-list'), me = $m('xt-me'), sh = $m('xt-season');
    const view = ui.view, map = ui.map, diff = ui.diff;
    const A = G.MicaAccount;
    if (view === 'season') seasonHead(sh, null, null);
    if (!A || !A.name()) { list.innerHTML = `<p class="sub">${esc(T().t('Inicia sesión en Magepunk para ver las clasificaciones.'))}</p>`; me.innerHTML = ''; return; }
    list.innerHTML = `<p class="sub">${esc(T().t('Cargando…'))}</p>`; me.innerHTML = '';
    const d = await read(map, diff, view);
    if (my !== ui.token || !el) return;
    if (d.error) { list.innerHTML = `<p class="sub">${esc(T().t('No se pudo cargar la clasificación.'))}</p>`; return; }
    list.innerHTML = '';
    if (!d.top.length) list.innerHTML = `<p class="sub">${esc(T().t('Todavía no hay marcas aquí. ¡Sé el primero!'))}</p>`;
    const mine = A.name();
    d.top.forEach((r, i) => list.appendChild(rowEl(r, i + 1, view, r.name === mine)));
    const yv = d.you ? (view === 'time' ? fmtT(d.you.time || 0) : (d.you.score || 0).toLocaleString('en')) : '';
    me.innerHTML = d.you && d.you.rank ? esc(T().f('Tu mejor puesto: #{x}', d.you.rank)) + ' · ' + yv
      : d.you ? esc(T().t('Aún no estás en el top 100.')) : esc(T().t('Aún no tienes marca.'));
    if (view === 'season') {
      // last season: your place and its ribbon (claimed into the Expedition save, once)
      let prev = null;
      if (d.season > 1) { prev = await read(map, diff, 'season', d.season - 1); if (my !== ui.token || !el) return; }
      let got = null;
      if (prev && !prev.error && prev.you && prev.you.rank) { got = claim(prev.season, map, diff, prev.you.rank); if (got) { G.UI.toast(T().f('Cinta de temporada: {x}', T().t(PRIZE_NAME[got])), 3400); G.Audio.sfx('legend'); } }
      seasonHead(sh, d, prev);
      if (got) { const rbx = $m('xt-ribbons'), rb = ribbons(); if (rbx) rbx.innerHTML = G.Icons.html('crown', 14) + ' ' + esc(T().f('Tus cintas: {x}', Object.entries(rb).sort((a, b) => PRIZE_LV[b[0]] - PRIZE_LV[a[0]]).map(([k, n]) => T().t(PRIZE_NAME[k]) + ' ×' + n).join(', '))); }
    }
  }
  function seasonHead(sh, d, prev) {
    if (!sh) return;
    const now = d && d.now ? d.now : Date.now(), s = d && d.season ? { id: d.season, ends: d.ends } : seasonOf(now);
    const place = n => n === 1 ? '#1' : n === 3 ? '#2–3' : '';
    const prizes = K.PRIZES.map(([n, id]) => `<span class="xt-prize">${G.Icons.html(id === 'master' ? 'crown' : id === 'elite' ? 'medal3' : 'medal2', 14)} ${esc(T().t(PRIZE_NAME[id]))} <i>${place(n)}</i></span>`).join('');
    let last = '';
    if (prev && !prev.error) {
      const pz = prev.you && prizeOf(prev.you.rank);
      last = prev.you && prev.you.rank ? (pz ? T().f('Temporada pasada: #{x} · cinta {x}', prev.you.rank, T().t(PRIZE_NAME[pz])) : T().f('Temporada pasada: #{x}', prev.you.rank)) : T().t('Temporada pasada: sin marca');
    }
    sh.innerHTML = `<div><b>${esc(T().f('Temporada {x} · termina en {x}', s.id, left(s.ends - now)))}</b>${last ? ' · <span id="xt-last">' + esc(last) + '</span>' : ''}</div>
      <div class="xt-prizes"><span>${esc(T().t('Premios de la temporada (sólo cintas cosméticas, se ganan jugando)'))}</span>${prizes}</div>`;
  }

  return {
    K, DIFFS, DIFF_NAME, MAP_NAME, MEDAL, MEDAL_NAME, MEDAL_ICON, PRIZE_NAME,
    MAP_ORDER, of, idx, playable, mapOpen, prevMap, unlocked, isOpen, medalOf, limits, medal, bestClear, pick, setPick, score, seasonOf, prizeOf, claim, ribbons,
    record, read, replayId, open, close, back, render,
    get shown() { return isOpenUI(); }, get ui() { return ui; }, get el() { return el; }
  };
})();
