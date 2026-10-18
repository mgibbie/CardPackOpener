/* ============ tower.js — Torre de pisos (MicaSurvivor M5 lote 8) ============
 * Del port de Android de JayElDragon (MIT, github.com/JayElDragon/poke-survivor): main.gd 117-139
 * (dificultad de la Torre y Torre adaptativa), 203-261 (estado, las 15 cartas de riesgo y las 4
 * legendarias), 451-466 (empezar: piso inicial y reliquias), 577, 808-815 / 842-843 (al acabar),
 * 1035 / 1041 / 1243 / 1267 (sin Movimiento Z ni Dynamax), 1064-1067 / 8711-8720 (el HUD), 1143-1158
 * (_rk / _rk_add), 1348-1381 (los pactos en daño, velocidad, recarga, experiencia, defensa y
 * regeneración), 1834-1848 (daño recibido y el escudo), 3154-3164 (los enemigos de la Torre), 3189-3192
 * (_dt: el tiempo de dificultad), 3286-3611 (jefe de cada piso, premios, _update_tower, _tower_adapt,
 * _tower_clear, descanso, pactos, _tower_win), 4174-4183 (el último aliento de Arceus), 4493-4498 /
 * 5371 (Sed de victoria, Pacto de sangre, Ayuno), 4706 (un bioma por piso), 5260 (experiencia ×0,65),
 * 5755 (Doble equipaje), save_data.gd 206-213 (tower_relics), menu.gd 1601-1625 (la tarjeta del modo y
 * "Piso inicial") y progress.gd 136-142 / 248 / 317 / 331 (logros, la misión de Cristal Z de Roca y las
 * misiones; en js/data/achievements.js, js/systems/zmoves.js y js/data/missions.js). Los números son del port.
 *
 *   30 pisos. En cada uno: oleadas durante 50 s y luego su jefe fijo (siempre el mismo); al caer, el
 *   piso está superado. Cada 5 pisos el jefe es un legendario; el 25 es Eternatus y el 30 Arceus (con
 *   la vida de dos jefes, +25 %, y un último aliento al 25 % de su vida). Del piso 11 en adelante el
 *   jefe llega con escolta y hay mareas (también durante el jefe desde el 21).
 *   Entre pisos: un descanso (Descanso: curas el 40 % de tu vida, 25 % desde el piso 22 · Entrenamiento:
 *   una mejora extra · Escudo: un escudo del 35 % de tu vida para el siguiente piso) y luego las cartas
 *   de riesgo: 3 pactos al azar (hasta 6 por partida; duran toda la partida) o "Sin riesgos". Con un 1 %
 *   por pantalla, una carta legendaria dorada (sin coste) sustituye a una.
 *   Premio la primera vez que superas un piso: 120 + 40·piso monedas, 1 + piso/5 tickets y, cada 5
 *   pisos, piso/5 tickets ×10 (y una reliquia). Repetido: 40 + 10·piso monedas. Al superar el 10 y el
 *   20, un vínculo de ataque.
 *   Reliquias: una por cada piso múltiplo de 5 superado alguna vez (hasta 6): +6 de vida y +2 % de
 *   ataque cada una, dentro de la Torre. Puntos de control: puedes empezar en el piso 6, 11, 16, 21 o
 *   26 si superaste alguna vez el anterior ("Piso inicial", en la tarjeta del modo); empiezas con una
 *   mejora gratis por piso saltado.
 *   Guardado: save.tower = { claimed: { piso: fecha }, best, log } (la fusión: unión de pisos, el mejor
 *   piso, el registro de la versión más reciente), save.modes.towerStart (el mayor de los dos, si sigue
 *   siendo un punto de control válido) y stats.towerBest / towerRuns / arceus (el mayor).
 */
G.Tower = (() => {
  const FLOORS = 30;
  const BOSS_AT = 50;                 // s de piso hasta el jefe (main.gd 204)
  const K = { hp: 1.15, dmg: 1.12, spawn: 1.12, bossHp: 1.2, xp: 0.65 };   // main.gd 121-124 / 139
  // Torre adaptativa (main.gd 126-133): vida y daño de los enemigos nuevos según tus mejoras
  const ADAPT = { hp: 0.010, hpP: 0.004, dmg: 0.004, dmgP: 0.002, maxHp: 1.0, maxDmg: 0.4, maxBoss: 1.5, every: 2 };
  const MAX_RISKS = 6, LEGEND_CHANCE = 0.01, OFFER = 3;
  const REST = { heal: 0.40, healLate: 0.25, lateAfter: 21, shield: 0.35 };
  const RELIC = { hp: 6, atk: 0.02, every: 5 };
  const RELICS_MAX = FLOORS / RELIC.every;
  const ETERNATUS = 890, ETERNATUS_AT = 25, FINAL_DEX = 493;
  const BOND_FLOORS = [10, 20];
  const SURGE = { first: 40, afterClear: 30, from: 10, base: 46, step: 1.5, min: 16, n: 8, chaosFrom: 20 };
  const LAST = { at: 0.25, spd: 1.1, n: 14 };
  const LOG_MAX = 80;
  const REAP = 0.003;                 // Sed de victoria: +0,30 % de daño por derrota

  // Las cartas de riesgo (main.gd 223-239): fx multiplica (o suma: def, regen, killheal) lo suyo.
  const RISKS = [
    { id: 'frenzy', name: 'Frenesí', icon: 'r_frenzy', desc: 'Atacas un 25% más rápido, pero recibes un 20% más de daño.', fx: { cd: 0.8, taken: 1.2 } },
    { id: 'glass', name: 'Cañón de cristal', icon: 'r_glass', desc: '+20% de daño, pero tu vida máxima baja un 15%.', fx: { atk: 1.2, maxhp: 0.85 } },
    { id: 'swift', name: 'Pies ligeros', icon: 'r_swift', desc: 'Te mueves un 20% más rápido, pero los enemigos también son un 10% más rápidos.', fx: { spd: 1.2, espd: 1.1 } },
    { id: 'blood', name: 'Pacto de sangre', icon: 'r_blood', desc: 'Recuperas 2 PS por cada Pokémon derrotado, pero los jefes pegan un 20% más fuerte.', fx: { killheal: 2.0, bossdmg: 1.2 } },
    { id: 'scholar', name: 'Saber prohibido', icon: 'r_scholar', desc: '+50% de experiencia, pero los enemigos tienen un 20% más de vida.', fx: { xp: 1.5, ehp: 1.2 } },
    { id: 'stone', name: 'Piel de piedra', icon: 'r_stone', desc: 'Recibes un 25% menos de daño, pero te mueves un 15% más lento.', fx: { taken: 0.75, spd: 0.85 } },
    { id: 'contract', name: 'Contrato del jefe', icon: 'contract', desc: '+50% de monedas por piso, pero los jefes tienen un 25% más de vida.', fx: { coins: 1.5, bossHp: 1.25 } },
    { id: 'fast', name: 'Ayuno', icon: 'r_fast', desc: '+15% de daño, pero las bayas y la cura del descanso curan un 45% menos.', fx: { atk: 1.15, healmul: 0.55 } },
    { id: 'swarm', name: 'Llamada de la horda', icon: 'r_swarm', desc: '+12% de daño y +20% de experiencia, pero aparecen un 30% más de enemigos.', fx: { atk: 1.12, xp: 1.2, spawn: 1.3 } },
    { id: 'quick', name: 'Manos veloces', icon: 'r_quick', desc: 'Tu enfriamiento baja un 30%, pero tu daño baja un 10%.', fx: { cd: 0.7, atk: 0.9 } },
    { id: 'heavy', name: 'Golpes cargados', icon: 'r_heavy', desc: '+22% de daño, pero tu enfriamiento sube un 20%.', fx: { atk: 1.22, cd: 1.2 } },
    { id: 'overclock', name: 'Sobrecarga', icon: 'r_overclock', desc: 'Tu enfriamiento baja un 25%, pero tu vida máxima baja un 10%.', fx: { cd: 0.75, maxhp: 0.9 } },
    { id: 'metronome', name: 'Ritmo frenético', icon: 'r_metronome', desc: 'Tu enfriamiento baja un 20%, pero aparecen un 15% más de enemigos.', fx: { cd: 0.8, spawn: 1.15 } },
    { id: 'slowburn', name: 'Brasa lenta', icon: 'r_slowburn', desc: 'Tu enfriamiento sube un 15%, pero recibes un 25% menos de daño y regeneras 1 PS por segundo.', fx: { cd: 1.15, taken: 0.75, regen: 1.0 } },
    { id: 'berserk', name: 'Furia ciega', icon: 'r_berserk', desc: 'Atacas un 15% más rápido y +10% de daño, pero recibes un 10% más de daño.', fx: { cd: 0.85, atk: 1.1, taken: 1.1 } }
  ];
  // Las legendarias (main.gd 242-247): doradas, sin coste, no cuentan para el tope de 6.
  const LEGENDS = [
    { id: 'l_time', name: 'Maestría del tiempo', icon: 'r_l_time', desc: 'Tu enfriamiento baja un 70%. Sin ningún coste.', fx: { cd: 0.3 } },
    { id: 'l_bag', name: 'Doble equipaje', icon: 'r_l_bag', desc: 'Puedes llevar 2 objetos a la vez (por ejemplo Restos y Cascabel Concha) y recibes uno ahora mismo. Sin ningún coste.', fx: { carry: 1.0 } },
    { id: 'l_reap', name: 'Sed de victoria', icon: 'r_l_reap', desc: 'Cada Pokémon que derrotes aumenta tu daño permanentemente un 0,30%. Sin ningún coste.', fx: { reap: 1.0 } },
    { id: 'l_armor', name: 'Coraza legendaria', icon: 'r_l_armor', desc: 'Tu defensa sube un 60%. Sin ningún coste.', fx: { def: 0.6 } }
  ];
  const ALL = RISKS.concat(LEGENDS);
  const BY = Object.fromEntries(ALL.map(r => [r.id, r]));
  // Los del descanso (main.gd 3485-3496)
  const REST_CARDS = [
    { id: 'heal', title: 'Descanso', icon: 'r_rest', tag: 'Cura', color: '#5fe08a' },
    { id: 'up', title: 'Entrenamiento', icon: 'r_train', tag: 'Mejora', color: '#ffd23f', desc: 'Obtienes una mejora extra ahora mismo.' },
    { id: 'shield', title: 'Escudo', icon: 'r_shield', tag: 'Defensa', color: '#7fe0ff', desc: 'Un escudo del 35% de tu vida absorbe el daño del siguiente piso.' }
  ];
  const SKIP = { id: 'skip', title: 'Sin riesgos', icon: 'r_skip', tag: 'Seguir', color: '#8fa3c4', desc: 'Sigues sin tomar ningún pacto. Dura toda la partida.' };

  const save = () => G.DB && G.DB.save;
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

  // ======================= el guardado =======================
  /** save.tower, con su forma: { claimed: { "piso": fecha }, best, log: [] }. */
  function rec(s = save()) {
    if (!s) return { claimed: {}, best: 0, log: [] };
    const t = isObj(s.tower) ? s.tower : (s.tower = {});
    if (!isObj(t.claimed)) t.claimed = {};
    t.best = Math.max(0, Math.floor(+t.best || 0));
    if (!Array.isArray(t.log)) t.log = [];
    return t;
  }
  /** Reliquias (save_data.gd tower_relics): una por piso múltiplo de 5 superado alguna vez. */
  const relics = (s = save()) => Object.keys(rec(s).claimed).filter(k => +k % RELIC.every === 0 && +k >= 1 && +k <= FLOORS).length;
  /** Pisos en los que puedes empezar (menu.gd 1606-1609): el 1 y el siguiente a cada múltiplo de 5 superado. */
  function checkpoints(s = save()) {
    const out = [1], cl = rec(s).claimed;
    for (let k = RELIC.every; k < FLOORS; k += RELIC.every) if (cl[k]) out.push(k + 1);
    return out;
  }
  /** El piso inicial elegido (save.modes.towerStart), si sigue siendo válido (main.gd 452-455). */
  function startFloor(s = save()) {
    const p = s && isObj(s.modes) ? s.modes : {};
    const st = Math.floor(+p.towerStart || 1);
    return checkpoints(s).includes(st) ? st : 1;
  }
  /** "Piso inicial: N": el siguiente punto de control (menu.gd 1619-1623). */
  function cycleStart() {
    const s = save(), list = checkpoints(s), cur = startFloor(s);
    const p = G.Modes.prefs(s);
    p.towerStart = list[(list.indexOf(cur) + 1) % list.length];
    G.DB.commit();
    return p.towerStart;
  }
  /** Premio por superar el piso f la primera vez (main.gd _tower_reward). */
  function reward(f) {
    const r = { coins: 120 + 40 * f, t1: 1 + Math.floor(f / 5) };
    if (f % 5 === 0) r.t10 = f / 5;
    return r;
  }
  const repeatCoins = f => 40 + 10 * f;

  /** La fusión de partidas (db.js merge): unión de pisos, el mejor piso, el registro del más reciente. */
  function merge(r, older) {
    const a = isObj(r.tower) ? r.tower : null, b = isObj(older.tower) ? older.tower : null;
    if (!a && !b) return;
    const out = { claimed: {}, best: 0, log: [] };
    for (const t of [a, b]) {
      if (!t) continue;
      for (const k in isObj(t.claimed) ? t.claimed : {}) {
        const v = +t.claimed[k] || 1;
        out.claimed[k] = out.claimed[k] ? Math.min(out.claimed[k], v) : v;
      }
      out.best = Math.max(out.best, +t.best || 0);
    }
    out.log = a && Array.isArray(a.log) ? a.log.slice(-LOG_MAX) : b && Array.isArray(b.log) ? b.log.slice(-LOG_MAX) : [];
    r.tower = out;
    // el punto de control elegido: el más alto de los dos (sanitize lo baja si no es válido)
    const sa = isObj(r.modes) ? +r.modes.towerStart || 0 : 0, sb = isObj(older.modes) ? +older.modes.towerStart || 0 : 0;
    if (Math.max(sa, sb) > 1 && isObj(r.modes)) r.modes.towerStart = Math.max(sa, sb);
  }
  /** Quita lo imposible (partida tocada a mano). */
  function sanitize(s) {
    if (s.tower != null) {
      if (!isObj(s.tower)) s.tower = {};
      const t = rec(s), cl = {};
      for (const k of Object.keys(t.claimed)) {
        const f = +k;
        if (Number.isInteger(f) && f >= 1 && f <= FLOORS) cl[f] = Math.max(1, Math.floor(+t.claimed[k] || 1));
      }
      t.claimed = cl;
      t.best = Math.min(FLOORS, t.best);
      t.log = t.log.filter(isObj).slice(-LOG_MAX);
    }
    if (isObj(s.modes) && s.modes.towerStart != null) {
      const st = Math.floor(+s.modes.towerStart || 1);
      s.modes.towerStart = checkpoints(s).includes(st) ? st : 1;
    }
  }

  // ======================= el jefe de cada piso (main.gd _tower_def) =======================
  /** Siempre el mismo por piso (semilla 7919·piso + 31); cada 5 pisos un legendario; 25 Eternatus, 30 Arceus. */
  function def(f, level = 1) {
    const r = G.Modes.rng(7919 * f + 31);
    const leg = f % 5 === 0;
    const lo = Math.min(640, 380 + f * 11);
    let pool = G.DEX.filter(p => G.SPRITE_META[p.dex] && !!p.leg === leg && (leg || (p.bst >= lo && p.bst <= lo + 110)));
    if (!pool.length) pool = G.DEX.filter(p => !p.leg && G.SPRITE_META[p.dex] && p.bst >= 480);
    let p = pool[Math.floor(r() * pool.length)];
    if (f === ETERNATUS_AT && G.DEX_BY[ETERNATUS]) p = G.DEX_BY[ETERNATUS];
    if (f === FLOORS && G.DEX_BY[FINAL_DEX]) p = G.DEX_BY[FINAL_DEX];
    const E = G.Enemies;
    const behavior = E.behaviorOf(p) === 'ranged' ? 'ranged' : E.baseSpd(p) > 90 ? 'charger' : 'chase';
    let hp = 900 * Math.pow(1.2, Math.min(f, 15) - 1) * Math.pow(1.07, Math.max(0, f - 15));
    const dm = Math.min(120, 26 + 4.5 * f);
    hp *= 1.8 + 3.2 * G.U.clamp((f - 5) / 25, 0, 1);
    if (f === FLOORS) hp = (hp + def(ETERNATUS_AT).hp / 1.35) * 1.25;   // la vida de dos jefes, +25 %
    return {
      at: 0, dex: p.dex, name: p.name, floor: f, leg, final: f === FLOORS,
      hp: Math.round(hp * 1.35), spd: Math.round(G.U.clamp(40 + E.baseSpd(p) * 0.5, 40, 100)), dmg: Math.round(dm * 1.2),
      xp: G.Player.xpFor(level) * 1.25, behavior, shotDmg: Math.round(dm * 0.55), shotCd: 1.1, range: 260
    };
  }

  // ======================= la partida =======================
  let on = false, floor = 1, t = 0, boss = null, phase = 0, risks = [], shield = 0, surge = SURGE.first;
  let clears = 0, adaptHp = 1, adaptDmg = 1, adaptT = 0, init = false, bossT0 = -1, fightDmg = 0, log = [];
  let reap = 0, acc = 0, won = false, forceLegend = '', relicN = 0, start = 1, lastPick = null;

  function reset() {
    on = false; floor = 1; t = 0; boss = null; phase = 0; risks = []; shield = 0; surge = SURGE.first;
    clears = 0; adaptHp = 1; adaptDmg = 1; adaptT = 0; init = false; bossT0 = -1; fightDmg = 0; log = [];
    reap = 0; acc = 0; won = false; forceLegend = ''; relicN = 0; start = 1; lastPick = null;
  }

  /**
   * Al empezar (game.js startRun, antes de Frágil): el piso inicial, las reliquias (+6 de vida y +2 % de
   * ataque cada una, main.gd 462-465) y la experiencia ×0,65 (main.gd 5260).
   */
  function begin(pl) {
    reset();
    on = !!pl && !!G.Game && G.Game.mode === 'tower';
    if (!on) return false;
    const s = save();
    start = floor = startFloor(s);
    relicN = relics(s);
    pl.maxHp += RELIC.hp * relicN; pl.hp = pl.maxHp;
    pl.atkMul *= 1 + RELIC.atk * relicN;
    pl.xpMul *= K.xp;
    return true;
  }

  /** Producto del efecto `key` de los pactos tomados (main.gd _rk). */
  function rk(key) { let v = 1; for (const id of risks) { const f = BY[id] && BY[id].fx; if (f && f[key] != null) v *= f[key]; } return v; }
  /** Suma del efecto `key` (main.gd _rk_add). */
  function rkAdd(key) { let v = 0; for (const id of risks) { const f = BY[id] && BY[id].fx; if (f && f[key] != null) v += f[key]; } return v; }
  /** Pactos que cuentan para el tope de 6 (las legendarias no). */
  const riskCount = () => risks.filter(id => !id.startsWith('l_')).length;

  /** Tiempo de dificultad (main.gd _dt): sube piso a piso. */
  const dt = () => 20 + (floor - 1) * 42 + Math.max(0, floor - 10) * 14 + t;
  /** Tope de enemigos (main.gd _tw_cap): +2 por piso desde el 21, hasta +20. */
  const cap = () => G.Spawner.CAP + G.U.clamp((floor - 20) * 2, 0, 20);

  /** Torre adaptativa (main.gd _tower_adapt): mejoras de la partida y permanentes del Pokémon. */
  function adapt(pl) {
    let ru = 0;
    for (const k in pl.statsTaken || {}) ru += pl.statsTaken[k] || 0;
    for (const m of pl.moves || []) ru += m.lvl || 0;
    const s = save(), up = s && s.pupg && s.pupg[pl.dex] || {};
    let pu = 0;
    for (const k in up) pu += +up[k] || 0;
    adaptHp = Math.min(1 + ADAPT.maxHp, 1 + ADAPT.hp * ru + ADAPT.hpP * pu);
    adaptDmg = Math.min(1 + ADAPT.maxDmg, 1 + ADAPT.dmg * ru + ADAPT.dmgP * pu);
    return { ru, pu };
  }

  /** Cada enemigo nuevo de la Torre (main.gd 3154-3164; EnemyMgr.add, después de los modificadores). */
  function enemyAdded(e) {
    if (!on || !e || e.remote || e.towerDone) return;
    e.towerDone = true;
    let ek = rk('ehp') * K.hp * adaptHp;
    let es = rk('espd') * (1 + 0.02 * Math.max(0, floor - 10));
    e.dmg *= K.dmg * adaptDmg;
    if (e.boss) {
      ek = rk('bossHp') * K.bossHp * Math.min(adaptHp, ADAPT.maxBoss);
      e.dmg *= rk('bossdmg');
      es = 1 + (es - 1) * 0.5;
    }
    e.maxHp = Math.round(e.maxHp * ek); e.hp = e.maxHp;
    e.spd *= es;
  }

  /** Cada fotograma (spawner.js, en vez de las oleadas normales): main.gd _update_tower. */
  function update(dtS, anchor) {
    if (!on) return;
    const pl = G.Game.player;
    if (!init) {
      init = true;
      // Desde un punto de control: una mejora gratis por piso saltado (main.gd 3338-3344)
      const n = floor - 1;
      if (n > 0) G.Game.grantLevels(n);
      G.Spawner.say('Piso ' + floor, 2);
    }
    adaptT -= dtS;
    if (adaptT <= 0) { adaptT = ADAPT.every; if (pl) adapt(pl); }
    if (phase > 0) return;
    const f = floor;
    if (boss) {
      // (cuando EnemyMgr ya lo ha contado: derrotados, jefes, misiones, Sed de victoria)
      if (!G.EnemyMgr.all().includes(boss)) { boss = null; clear(); return; }
      // Arceus: último aliento al 25 % (main.gd 4174-4183)
      if (boss.def.final && !boss.dead && !boss.lastBreath && boss.hp < boss.maxHp * LAST.at) lastBreath(boss);
    } else {
      t += dtS;
      if (t >= BOSS_AT) {
        const d = def(f, pl ? pl.level : 1);
        G.Sprites.preload([d.dex], 8000);
        boss = G.Spawner.spawnBoss(anchor(), 15 * f, d);
        bossT0 = G.Game.st.time; fightDmg = 0;
        G.Spawner.say('Piso ' + f + ': ' + d.name, 3);
        // escolta: del piso 11 en adelante (main.gd 3369-3375)
        if (f > 10) {
          const n = Math.min(G.Spawner.CAP, 3 + Math.floor((f - 10) / 2)), a0 = Math.random() * Math.PI * 2;
          for (let i = 0; i < n; i++) if (G.EnemyMgr.count < cap()) G.Spawner.spawnOne(anchor(), dt(), a0 + i * 0.5);
        }
      }
    }
    const T = dt(), fight = !!boss, c = cap();
    if (G.EnemyMgr.count < c) {
      acc += rate() * (fight ? (f <= 20 ? 0.25 : 0.5) : 1) * dtS;
      while (acc >= 1) { acc -= 1; if (G.EnemyMgr.count < c) G.Spawner.spawnOne(anchor(), T); }
    }
    // mareas: del piso 11 en adelante, cada vez más seguidas y grandes (main.gd 3387-3397)
    if (f > SURGE.from && (!fight || f > SURGE.chaosFrom)) {
      surge -= dtS;
      if (surge <= 0) {
        surge = Math.max(SURGE.min, SURGE.base - SURGE.step * (f - 10));
        const a0 = Math.random() * Math.PI * 2, n = Math.min(c - G.EnemyMgr.count, SURGE.n + (f - 10)), who = anchor();
        for (let i = 0; i < n; i++) G.Spawner.spawnOne(who, T, a0 + G.U.rand(-0.6, 0.6));
        G.Audio.sfx('surge');
        G.Spawner.say('¡Marea de Pokémon!', 2.2);
      }
    }
  }

  /** Enemigos por segundo (main.gd 3381): la curva normal × caos (+6 % por piso desde el 11) × 1,12 × pactos × Horda × Incienso. */
  function rate() {
    const chaos = 1 + 0.06 * Math.max(0, floor - 10);
    return G.Spawner.rate(dt()) * G.Modes.spawnK() * chaos * K.spawn * rk('spawn') * (G.Spawner.incense() ? G.Items.INCENSE.rate : 1);
  }

  function lastBreath(e) {
    e.lastBreath = true;
    e.spd *= LAST.spd;
    G.Spawner.say('¡' + e.name + ' lo da todo!', 2.6);
    G.FX.ring(e.x, e.y, e.r, e.r * 6, '#ffffff', 0.8, 6);
    G.Camera.kick(1);
    const a0 = Math.random() * Math.PI * 2, pl = G.Game.player;
    for (let i = 0; i < Math.max(0, Math.min(LAST.n, cap() - G.EnemyMgr.count)); i++) G.Spawner.spawnOne(pl, dt(), a0 + G.U.rand(-0.9, 0.9));
  }

  /** El jefe ha caído: piso superado (main.gd _tower_clear). */
  function clear() {
    const f = floor, pl = G.Game.player, s = save(), now = G.Game.st.time;
    const tw = rec(s);
    if (bossT0 >= 0) {
      const ent = { f, s: Math.round(now - bossT0), p: Math.round(100 * fightDmg / Math.max(1, pl.maxHp)), lv: pl.level, ahp: Math.round(adaptHp * 100) / 100 };
      log.push(ent);
      tw.log.push(ent);
      while (tw.log.length > LOG_MAX) tw.log.shift();
      bossT0 = -1;
    }
    clears++;
    const first = !tw.claimed[f];
    const r = reward(f);
    r.coins = Math.round(r.coins * rk('coins'));
    if (first) { tw.claimed[f] = Date.now(); G.Progress.grant(r); }
    else G.Progress.grant({ coins: Math.round(repeatCoins(f) * rk('coins')) });
    tw.best = Math.max(tw.best, f);
    const S = s.stats;
    S.towerBest = Math.max(S.towerBest || 0, f);
    if (f >= FLOORS) S.arceus = (S.arceus || 0) + 1;   // vencer al jefe final
    G.Progress.checkAch();
    G.DB.commit('run');
    G.Audio.sfx('bossDown');
    let txt = '¡Piso ' + f + ' superado!';
    if (first) txt += ' +' + r.coins + ' monedas' + (f % RELIC.every === 0 ? ' · ¡Reliquia de la Torre!' : '');
    G.Spawner.say(txt, 3.6);
    // limpia el piso (main.gd 3456-3460)
    G.EnemyMgr.clearAlive();
    G.FX.ring(pl.x, pl.y, 8, 200, '#ffd23f', 0.7, 6);
    if (f >= FLOORS) { win(); return; }
    // vínculos de ataque al superar el 10 y el 20 (main.gd 3465-3470)
    if (BOND_FLOORS.includes(f)) {
      pl.bonds++;
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, '¡Vínculo!', '#ff8ad8', true);
      G.FX.ring(pl.x, pl.y, 8, 90, '#ff8ad8', 0.7, 5);
      G.Spawner.say('¡Piso ' + f + ' superado! Obtienes un vínculo de ataque', 3.6);
    }
    floor++;
    t = 0; shield = 0; surge = SURGE.afterClear;
    restOpen();
  }

  // ---------------- el descanso y las cartas de riesgo ----------------
  const restHeal = () => (floor <= REST.lateAfter ? REST.heal : REST.healLate) * rk('healmul');

  function restCards() {
    return REST_CARDS.map(c => Object.assign({}, c, c.id === 'heal' ? { desc: 'Recuperas el ' + Math.round(restHeal() * 100) + '% de tu vida.' } : {}));
  }
  function restOpen() {
    phase = 1;
    G.Game.choiceStart();
    G.TowerUI.show('rest', 'Elige cómo descansar', 'Piso ' + (floor - 1) + ' superado', restCards(), restPick);
  }
  function restPick(id) {
    const pl = G.Game.player;
    G.Audio.sfx('confirm');
    lastPick = id;
    if (id === 'heal') {
      const before = pl.hp;
      pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * restHeal());
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 4, '+PS', '#5fe08a');
      lastPick = { id, healed: pl.hp - before };
    } else if (id === 'up') G.Game.grantLevels(1, false);
    else if (id === 'shield') shield = pl.maxHp * REST.shield;
    riskOpen();
  }
  /** Las cartas de riesgo (main.gd _tower_risk_open). */
  function riskCards() {
    const pool = G.U.pickN(RISKS.filter(r => !risks.includes(r.id)), RISKS.length);
    const picks = [];
    if (riskCount() < MAX_RISKS) for (const r of pool.slice(0, OFFER)) picks.push({ id: r.id, title: r.name, desc: r.desc, icon: r.icon, tag: 'Riesgo', color: '#ff5b8a' });
    const lpool = LEGENDS.filter(l => !risks.includes(l.id));
    if (lpool.length && (forceLegend || Math.random() < LEGEND_CHANCE)) {
      const lg = lpool.find(l => l.id === forceLegend) || G.U.pick(lpool);
      const card = { id: lg.id, title: lg.name, desc: lg.desc, icon: lg.icon, tag: 'Legendaria', color: '#ffd23f', legend: true };
      if (!picks.length) picks.push(card); else picks[Math.floor(Math.random() * picks.length)] = card;
    }
    forceLegend = '';
    if (!picks.length) return [];
    picks.push(Object.assign({}, SKIP));
    return picks;
  }
  function riskOpen() {
    phase = 2;
    const picks = riskCards();
    if (!picks.length) { restDone(); return; }
    G.TowerUI.show('risk', 'Un pacto: gran poder, a cambio de un coste', 'Cartas de riesgo', picks, riskPick);
  }
  function riskPick(id) {
    G.Audio.sfx('confirm');
    if (id !== 'skip' && BY[id] && !risks.includes(id)) {
      apply(G.Game.player, id);
      G.Spawner.say('Pacto sellado: ' + BY[id].name, 2.4);
      if (id === 'l_bag') { restDone(); G.Game.offerItem(G.Items.roll()); return; }
    }
    restDone();
  }
  function restDone() {
    phase = 0;
    G.TowerUI.hide();
    G.Game.choiceEnd();
    G.Spawner.say('Piso ' + floor, 2);
  }

  /**
   * Sella un pacto: lo de tu Pokémon se aplica ya (daño, velocidad, recarga, experiencia, defensa,
   * regeneración, vida máxima en proporción, el 2.º hueco); lo de los enemigos, la cura y las monedas
   * se leen con rk() cuando hace falta.
   */
  function apply(pl, id) {
    const fx = BY[id].fx;
    risks.push(id);
    if (fx.atk) pl.atkMul *= fx.atk;
    if (fx.spd) pl.spdMul *= fx.spd;
    if (fx.cd) pl.cdMul *= fx.cd;
    if (fx.xp) pl.xpMul *= fx.xp;
    if (fx.def) pl.dmgReduce += fx.def;
    if (fx.regen) pl.regenFlat += fx.regen;
    if (fx.carry) pl.bagPact = true;
    if (fx.maxhp) {
      // la vida máxima baja guardando la proporción (main.gd 3558-3566)
      const frac = pl.hp / Math.max(1, pl.maxHp);
      pl.maxHp = Math.round(pl.maxHp * fx.maxhp);
      pl.hp = Math.min(pl.maxHp, frac * pl.maxHp);
    }
  }

  // ---------------- en el combate ----------------
  /** Daño que recibes × los pactos (Frenesí, Piel de piedra...; main.gd 1834). */
  const takenK = () => (on ? rk('taken') : 1);
  /**
   * El escudo del descanso absorbe el golpe (main.gd 1837-1848); lo que pasa del escudo cuenta para el
   * registro de la pelea con el jefe. Devuelve el daño que llega a tu vida.
   */
  function absorb(d) {
    if (!on) return d;
    if (shield > 0) { const a = Math.min(shield, d); shield -= a; d -= a; }
    if (d > 0 && boss) fightDmg += d;
    return d;
  }
  /** Bayas que curan (main.gd 5371: Ayuno). */
  const healK = () => (on ? rk('healmul') : 1);
  /** Un Pokémon derrotado (main.gd 4493-4498): Sed de victoria y Pacto de sangre. */
  function onKill(e, pl) {
    if (!on || !pl || e.remote) return;
    if (risks.includes('l_reap')) { reap++; pl.atkMul *= (1 + REAP * reap) / (1 + REAP * (reap - 1)); }
    const kh = rkAdd('killheal');
    if (kh > 0 && !pl.dead) pl.hp = Math.min(pl.maxHp, pl.hp + kh);
  }

  function win() {
    won = true;
    G.Game.endRun(false);
  }

  /** La línea del HUD bajo el reloj (main.gd 8711-8720), ya traducida por trozos. */
  function hudLine() {
    if (!on) return '';
    const T = G.I18n.t, parts = [T('Piso ' + floor + ' / ' + FLOORS)];
    parts.push(boss ? T('¡Jefe!') : T('Jefe en ' + Math.ceil(Math.max(0, BOSS_AT - t)) + 's'));
    if (risks.length) parts.push(T('Pactos: ' + risks.length));
    if (risks.includes('l_reap')) parts.push(T('Sed de victoria +' + (REAP * 100 * reap).toFixed(1) + '%'));
    if (shield > 0) parts.push(T('Escudo') + ' ' + Math.ceil(shield));
    return parts.join('  ·  ');
  }

  /** Al acabar (main.gd 808-815 / 842-843): stats y líneas del resumen. */
  function finish(S) {
    S.towerRuns = (S.towerRuns || 0) + 1;
    const lines = [];
    if (won) lines.push('Pisos superados: ' + clears);   // (el título del resumen es «¡TORRE COMPLETA!»: game.js endRun)
    lines.push('Torre: piso ' + floor);
    if (log.length) lines.push('Jefes (piso: tiempo, vida perdida) ' + log.slice(-3).map(e => e.f + ': ' + e.s + ' s, -' + e.p + '%').join(' | '));
    return lines;
  }

  return {
    FLOORS, BOSS_AT, K, ADAPT, MAX_RISKS, LEGEND_CHANCE, OFFER, REST, RELIC, RELICS_MAX, ETERNATUS, ETERNATUS_AT, FINAL_DEX,
    BOND_FLOORS, SURGE, LAST, LOG_MAX, REAP, RISKS, LEGENDS, BY, REST_CARDS, SKIP,
    rec, relics, checkpoints, startFloor, cycleStart, reward, repeatCoins, merge, sanitize, def,
    reset, begin, rk, rkAdd, riskCount, dt, cap, rate, adapt, enemyAdded, update, clear, restOpen, restPick, riskCards, riskOpen, riskPick, restDone, apply,
    takenK, absorb, healK, onKill, hudLine, finish, restHeal,
    get on() { return on; }, get floor() { return floor; }, get t() { return t; }, get boss() { return boss; }, get phase() { return phase; },
    get risks() { return risks.slice(); }, get shield() { return shield; }, get clears() { return clears; }, get won() { return won; },
    get adaptHp() { return adaptHp; }, get adaptDmg() { return adaptDmg; }, get reap() { return reap; }, get log() { return log.slice(); },
    get relicN() { return relicN; }, get start() { return start; }, get surge() { return surge; }, get lastPick() { return lastPick; },
    /** Para pruebas: salta el reloj del piso / obliga a una carta legendaria en la próxima pantalla de pactos. */
    debugT(v) { t = v; }, debugLegend(id) { forceLegend = id; }, debugFloor(f) { floor = f; }
  };
})();
