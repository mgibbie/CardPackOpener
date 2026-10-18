/* ============ modes.js — modos rápidos y modificadores (MicaSurvivor M5 lote 6) ============
 * Del port de Android de JayElDragon (MIT, github.com/JayElDragon/poke-survivor): menu.gd 1496-1675
 * (la pantalla "Elige un modo": textos, modificadores, tipo y Pokémon de la fiesta), save_data.gd
 * 16-22 / 556-572 (MOD_IDS, la semilla, el Pokémon y la regla del Desafío diario), main.gd 262 /
 * 339-357 / 426-449 / 472 / 488 / 782-860 (empezar y acabar cada modo: monedas, récords, stats),
 * 966-983 (fin de la Contrarreloj y "Sin curación"), 1063 / 8701-8705 (el reloj hacia atrás),
 * 1861 (la Fiesta no muere), 2859-2866 / 2986-2998 (Supervivencia por tipo), 3146-3152 / 3261
 * (los modificadores en los enemigos), 5862-5871 / 6266 (las grietas de la Contrarreloj) y
 * progress.gd 108-134 (los logros de modos, en js/data/achievements.js). Los números son del port.
 *
 *   normal  la partida de siempre (con los modificadores elegidos)
 *   daily   Desafío diario: la semilla es la fecha (AAAAMMDD). El mismo Pokémon, la misma regla
 *           (un modificador) y el mismo mundo / elenco / movimientos iniciales para todos ese día.
 *           +25 % de monedas (sin los modificadores elegidos). Guarda la mejor marca del día
 *           (save.daily = { date, best }); se puede repetir.
 *   party   Modo Fiesta: cualquier Pokémon (también los que no tienes), no puedes morir y no se
 *           guarda nada (ni monedas, ni stats, ni misiones, logros, tickets, shinies o ranking).
 *   rifts   Contrarreloj de grietas: 8 minutos; la primera grieta a los 20 s, luego un chequeo cada
 *           8 s (6 s tras una pelea) que siempre abre una (si no hay jefe vivo), ninguna nueva en
 *           los últimos 40 s, sin guaridas Dynamax. +25 % de monedas. Récord de grietas ganadas.
 *   type    Supervivencia por tipo: sólo salen Pokémon del tipo elegido (y sus jefes). +50 % de
 *           monedas. Aguantar 10 minutos marca ese tipo como superado (save.typeDone).
 *   team    Modo Equipo (lote 7, js/systems/team.js): hasta 3 Pokémon tuyos que cambias en plena
 *           partida. Con los modificadores elegidos; el equipo va en save.modes.team.
 *   rush    Rush de Jefes (lote 8, js/systems/bossrush.js): sólo jefes, cada vez más fuertes. Récord de
 *           jefes (stats.rushBest). Con los modificadores elegidos.
 *   tower   Torre de pisos (lote 8, js/systems/tower.js): 30 pisos con su jefe, descansos, pactos de
 *           riesgo, reliquias y puntos de control (save.tower, save.modes.towerStart). Con los modificadores.
 *
 *   Modificadores (todos los modos menos el Diario, que trae el suyo, y la Fiesta): +25 % de
 *   monedas cada uno. fast: enemigos ×1,4 de velocidad (jefes ×1,15) · horde: ×1,8 de aparición
 *   · tank: ×1,6 de vida · hard: ×1,5 de daño · frail: tu vida máxima a la mitad · nohealing: no
 *   recuperas vida (sólo la que da subir la vida máxima).
 *
 *   Lo elegido (modificadores, tipo, Pokémon de la fiesta y, desde el lote 9, adaptive: false si apagas la
 *   dificultad adaptativa de la partida normal, systems/adaptive.js) va en save.modes; los récords en
 *   save.stats (dailyPlays, dailyBestMin, riftsRuns, riftsBest, typeRuns, typeBestMin, mn1..mn6,
 *   mb_<mod>), save.daily y save.typeDone: la fusión de partidas (db.js merge) se queda con el
 *   mayor de cada stat, la mejor marca del día más reciente y la unión de los tipos superados.
 */
G.Modes = (() => {
  // (team: M5 lote 7; rush y tower: lote 8, en el orden del menú del port: menu.gd 1563-1657)
  const LIST = ['normal', 'daily', 'rush', 'party', 'tower', 'rifts', 'type', 'team'];
  const NAME = { normal: 'Partida normal', daily: 'Desafío diario', rush: 'Rush de Jefes', party: 'Modo Fiesta', tower: 'Torre de pisos', rifts: 'Contrarreloj de grietas', type: 'Supervivencia por tipo', team: 'Modo Equipo' };
  const ICON = { normal: 'flag', daily: 'm_daily', rush: 'm_rush', party: 'm_party', tower: 'm_tower', rifts: 'clock', type: 'm_type', team: 'm_team' };
  const MOD_IDS = ['fast', 'horde', 'tank', 'hard', 'frail', 'nohealing'];
  const MOD = {
    fast: { name: 'Veloces', desc: 'Los enemigos corren un 40% más rápido.', icon: 'boot' },
    horde: { name: 'Horda', desc: 'Casi el doble de enemigos.', icon: 'm_horde' },
    tank: { name: 'Resistentes', desc: 'Los enemigos tienen un 60% más de vida.', icon: 'shield' },
    hard: { name: 'Golpes duros', desc: 'Los enemigos hacen un 50% más de daño.', icon: 'fist' },
    frail: { name: 'Frágil', desc: 'Tu vida máxima se reduce a la mitad.', icon: 'heart' },
    nohealing: { name: 'Sin curación', desc: 'No recuperas vida (solo la que te da subir de Vida).', icon: 'berry' }
  };
  const K = { fast: 1.4, fastBoss: 1.15, horde: 1.8, tank: 1.6, hard: 1.5, frail: 0.5 };
  const TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
  const RIFTS = { limit: 480, first: 20, every: 8, after: 6, last: 40 };
  const COINS = { daily: 1.25, perMod: 0.25, type: 0.5, rifts: 0.25 };
  const TYPE_DONE_MIN = 10;
  const PARTY_DEX = 25;

  const save = () => G.DB && G.DB.save;

  // ======================= Desafío diario (save_data.gd 556-572) =======================
  /** La semilla del día: AAAAMMDD con la fecha del aparato. */
  function dailySeed(d = new Date()) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  /** El Pokémon del día: uno no legendario con sprites, el mismo para todos. */
  function dailyDex(sd) {
    const pool = G.DEX.filter(p => !p.leg && G.SPRITE_META[p.dex]).map(p => p.dex);
    return pool.length ? pool[(sd * 7919 + 13) % pool.length] : PARTY_DEX;
  }
  /** La regla del día: uno de los 6 modificadores. */
  function dailyMod(sd) { return MOD_IDS[(sd * 31 + 7) % MOD_IDS.length]; }
  /** Generador con semilla (mulberry32): el mundo y los sorteos iniciales del día. */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** Ejecuta fn con Math.random sembrado (el port hace seed(semilla) antes de montar la partida). */
  function seeded(seed, fn) {
    const real = Math.random;
    Math.random = rng(seed);
    try { return fn(); } finally { Math.random = real; }
  }
  /** La mejor marca de hoy (0 si aún no lo has jugado hoy). */
  function dailyBest(s = save(), sd = dailySeed()) {
    const d = s && s.daily;
    return d && d.date === sd ? d.best || 0 : 0;
  }

  // ======================= lo elegido en el menú (save.modes) =======================
  function prefs(s = save()) {
    if (!s) return { mods: [], type: 'fire', party: PARTY_DEX, team: [] };
    const p = s.modes && typeof s.modes === 'object' && !Array.isArray(s.modes) ? s.modes : (s.modes = {});
    p.mods = Array.isArray(p.mods) ? MOD_IDS.filter(id => p.mods.includes(id)) : [];
    if (!TYPES.includes(p.type)) p.type = 'fire';
    if (!(G.DEX_BY && G.DEX_BY[p.party])) p.party = PARTY_DEX;
    // Dificultad adaptativa (lote 9, systems/adaptive.js): sólo se guarda el "no"
    if (p.adaptive != null && p.adaptive !== false) delete p.adaptive;
    // Modo Equipo (lote 7): los elegidos a mano, tuyos, sin repetir, hasta 3 (save_data.gd team_list;
    // sin elegir nunca, no se guarda nada)
    if (p.team != null) {
      const team = [];
      for (const x of Array.isArray(p.team) ? p.team : []) { const d = Math.floor(+x); if (s.owned && s.owned[d] && !team.includes(d) && team.length < 3) team.push(d); }
      p.team = team;
    }
    return p;
  }
  function toggleMod(id) {
    if (!MOD_IDS.includes(id)) return false;
    const p = prefs();
    p.mods = p.mods.includes(id) ? p.mods.filter(x => x !== id) : MOD_IDS.filter(x => x === id || p.mods.includes(x));
    G.DB.commit();
    return p.mods.includes(id);
  }
  /** "Cambiar tipo": el siguiente de la lista (menu.gd 1636). */
  function cycleType() {
    const p = prefs();
    p.type = TYPES[(TYPES.indexOf(p.type) + 1) % TYPES.length];
    G.DB.commit();
    return p.type;
  }
  function setParty(dex) {
    if (!G.DEX_BY[dex]) return false;
    prefs().party = +dex;
    G.DB.commit();
    return true;
  }

  // ======================= la partida =======================
  let run = { mode: 'normal', mods: [], type: null, dex: null, seed: 0, team: null };
  let riftsWon = 0, timeUp = false, nh = null;

  /** Cómo será una partida de `mode` (sin empezarla). */
  function plan(mode = 'normal', s = save()) {
    const p = prefs(s);
    if (!LIST.includes(mode)) mode = 'normal';
    if (mode === 'daily') {
      const seed = dailySeed();
      return { mode, mods: [dailyMod(seed)], type: null, dex: dailyDex(seed), seed };
    }
    if (mode === 'party') return { mode, mods: [], type: null, dex: p.party, seed: 0 };
    // Modo Equipo (lote 7, main.gd 436-438): empieza el primero del equipo; con los modificadores elegidos.
    if (mode === 'team') {
      const team = G.Team ? G.Team.list(s) : [];
      if (team.length >= 2) return { mode, mods: p.mods.slice(), type: null, dex: team[0], seed: 0, team };
      mode = 'normal';
    }
    return { mode, mods: p.mods.slice(), type: mode === 'type' ? p.type : null, dex: null, seed: 0 };
  }
  /** Al empezar la partida (game.js startRun). En grupo, siempre normal y sin modificadores. */
  function begin(cfg) {
    run = Object.assign({ mode: 'normal', mods: [], type: null, dex: null, seed: 0, team: null }, cfg || {});
    riftsWon = 0; timeUp = false; nh = null;
    if (G.Game) G.Game.mode = run.mode;
    if (G.Progress) G.Progress.off = run.mode === 'party';
    return run;
  }
  const has = id => run.mods.includes(id);
  const is = m => run.mode === m;

  /** Los modificadores en un enemigo (main.gd 3146-3152: todos, también jefes, legendarios y guaridas). */
  function enemyAdded(e) {
    if (!e || e.remote || e.modsDone || !run.mods.length) return;
    e.modsDone = true;
    if (has('fast')) e.spd *= e.boss ? K.fastBoss : K.fast;
    if (has('tank')) { e.maxHp = Math.round(e.maxHp * K.tank); e.hp = e.maxHp; }
    if (has('hard')) e.dmg *= K.hard;
  }
  /** Horda: ×1,8 de aparición (main.gd 3261). */
  const spawnK = () => has('horde') ? K.horde : 1;
  /** Supervivencia por tipo: el tipo de los enemigos, o null. */
  const onlyType = () => run.mode === 'type' ? run.type : null;
  /** Frágil: la vida máxima a la mitad, al empezar (main.gd 488). */
  function startPlayer(pl) {
    if (has('frail')) { pl.maxHp = Math.round(pl.maxHp * K.frail); pl.hp = pl.maxHp; }
    nh = { last: pl.hp, max: pl.maxHp };
  }
  /** Modo Equipo (lote 7, main.gd 1783-1784): al cambiar, "Sin curación" sigue desde la vida del que entra. */
  function resetHeal(pl) { if (nh && pl) nh = { last: pl.hp, max: pl.maxHp }; }
  /** Sin curación (main.gd 976-983): la vida no sube salvo lo que suba la vida máxima. Cada fotograma. */
  function healTick(pl) {
    if (!has('nohealing') || !pl || !nh) return;
    if (pl.maxHp > nh.max) { nh.last += pl.maxHp - nh.max; nh.max = pl.maxHp; }
    if (pl.hp > nh.last) pl.hp = nh.last;
    else nh.last = pl.hp;
  }
  /** Modo Fiesta: no se puede morir (main.gd 1861). */
  const noDeath = () => run.mode === 'party';
  /** ¿Se guarda algo de esta partida? (no en la Fiesta) */
  const saves = () => run.mode !== 'party';

  // ---------- Contrarreloj de grietas ----------
  const rifts = () => run.mode === 'rifts';
  function riftWon() { if (rifts()) riftsWon++; }
  /** ¿Se acaba el tiempo? (sólo fuera de la arena: la pelea en curso se termina) */
  function checkTime(time) {
    if (!rifts() || timeUp || time < RIFTS.limit || (G.Rift && G.Rift.inArena)) return false;
    timeUp = true;
    return true;
  }
  const timeLeft = time => Math.max(0, RIFTS.limit - time);

  // ---------- al acabar (main.gd 782-860) ----------
  /**
   * Récords y stats del modo; devuelve { add, base, lines } para las monedas y el resumen.
   * Monedas: base (1 + 0,25 por modificador, o 1,25 en el Diario) × lo de tus objetos, + 0,5
   * (Supervivencia por tipo) o + 0,25 (Contrarreloj).
   */
  function finish(time, s = save(), pl = null) {
    const out = { base: 1, add: 0, lines: [] };
    if (!s || run.mode === 'party') return out;
    const S = s.stats = s.stats || {};
    const sec = Math.floor(time), min = Math.floor(time / 60);
    if (run.mode === 'daily') {
      const prev = s.daily && s.daily.date === run.seed ? s.daily.best || 0 : 0;
      s.daily = { date: run.seed, best: Math.max(prev, sec) };
      out.lines.push(NAME.daily);
      if (sec > prev) out.lines.push('¡Mejor marca de hoy!');
      S.dailyPlays = (S.dailyPlays || 0) + 1;
      S.dailyBestMin = Math.max(S.dailyBestMin || 0, min);
      out.base = COINS.daily;
    } else out.base = 1 + COINS.perMod * run.mods.length;
    if (run.mode === 'type') {
      out.add += COINS.type;
      out.lines.push('Supervivencia: ' + G.U.TYPE_NAME[run.type]);
      S.typeRuns = (S.typeRuns || 0) + 1;
      if (min >= TYPE_DONE_MIN) { s.typeDone = s.typeDone || {}; if (!s.typeDone[run.type]) s.typeDone[run.type] = Date.now(); }
      S.typeBestMin = Math.max(S.typeBestMin || 0, min);
    } else if (run.mode === 'rifts') {
      out.add += COINS.rifts;
      const best = S.riftsBest || 0;
      out.lines.push('Contrarreloj de grietas: ' + riftsWon);
      if (riftsWon > best) out.lines.push('¡Récord!');
      S.riftsRuns = (S.riftsRuns || 0) + 1;
      S.riftsBest = Math.max(best, riftsWon);
    } else if (run.mode === 'team') {
      // Modo Equipo (lote 7, main.gd 806-807 / 844-846): sólo el nombre en el resumen; stats teamRuns / teamBestMin
      out.lines.push(NAME.team);
      if (G.Team) G.Team.finish(S, min); else { S.teamRuns = (S.teamRuns || 0) + 1; S.teamBestMin = Math.max(S.teamBestMin || 0, min); }
    } else if (run.mode === 'rush') {
      // M5 lote 8 (main.gd 795-798 / 847-849): jefes derrotados, récord; stats rushRuns / rushBest
      out.lines.push(...G.BossRush.finish(S, pl ? pl.bosses : 0));
    } else if (run.mode === 'tower') {
      // M5 lote 8 (main.gd 808-815 / 842-843): el piso, los últimos jefes; stats towerRuns (towerBest al superar cada piso)
      out.lines.push(...G.Tower.finish(S));
    }
    if (run.mode !== 'daily') {
      for (let k = 1; k <= run.mods.length; k++) S['mn' + k] = Math.max(S['mn' + k] || 0, min);
      for (const id of run.mods) S['mb_' + id] = Math.max(S['mb_' + id] || 0, min);
    }
    return out;
  }
  /** Tipos superados en la Supervivencia por tipo (logros typeVar9 / typeAll). */
  const typeDoneCount = (s = save()) => Object.keys((s && s.typeDone) || {}).filter(t => TYPES.includes(t)).length;

  /** El nombre del modo ('' en la partida normal); en la Supervivencia, con el tipo. */
  function title() { return run.mode === 'normal' ? '' : NAME[run.mode] + (run.mode === 'type' ? ' · ' + G.U.TYPE_NAME[run.type] : ''); }
  /** Nombre del modo y sus modificadores, para la pausa ('' en una partida normal sin nada). */
  function label() {
    const parts = run.mode === 'normal' ? [] : [title()];
    for (const id of run.mods) parts.push(MOD[id].name);
    return parts.join(' · ');
  }

  // ======================= la fusión de partidas (db.js) =======================
  /** Desafío diario: la marca del día más reciente; del mismo día, la mejor. */
  function mergeDaily(a, b) {
    const ok = d => d && typeof d === 'object' && Number.isFinite(+d.date);
    if (!ok(a)) return ok(b) ? { date: +b.date, best: +b.best || 0 } : undefined;
    if (!ok(b)) return { date: +a.date, best: +a.best || 0 };
    if (+a.date !== +b.date) return +a.date > +b.date ? { date: +a.date, best: +a.best || 0 } : { date: +b.date, best: +b.best || 0 };
    return { date: +a.date, best: Math.max(+a.best || 0, +b.best || 0) };
  }
  /** Quita lo imposible (partida tocada a mano). */
  function sanitize(s) {
    const n = v => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
    if (s.modes != null) {
      if (typeof s.modes !== 'object' || Array.isArray(s.modes)) s.modes = {};
      prefs(s);
    }
    if (s.daily != null) {
      const d = s.daily;
      if (!d || typeof d !== 'object' || !/^\d{8}$/.test(String(d.date))) delete s.daily;
      else s.daily = { date: +d.date, best: Math.min(n(d.best), 86400) };
    }
    if (s.typeDone != null) {
      if (typeof s.typeDone !== 'object' || Array.isArray(s.typeDone)) s.typeDone = {};
      for (const t of Object.keys(s.typeDone)) if (!TYPES.includes(t)) delete s.typeDone[t]; else s.typeDone[t] = n(s.typeDone[t]) || 1;
    }
  }

  return {
    LIST, NAME, ICON, MOD_IDS, MOD, K, TYPES, RIFTS, COINS, TYPE_DONE_MIN, PARTY_DEX,
    dailySeed, dailyDex, dailyMod, dailyBest, rng, seeded,
    prefs, toggleMod, cycleType, setParty,
    plan, begin, has, is, enemyAdded, spawnK, onlyType, startPlayer, resetHeal, healTick, noDeath, saves,
    rifts, riftWon, checkTime, timeLeft, finish, typeDoneCount, title, label, mergeDaily, sanitize,
    get run() { return run; }, get mode() { return run.mode; }, get mods() { return run.mods.slice(); },
    get riftsWon() { return riftsWon; }, get timeUp() { return timeUp; }
  };
})();
