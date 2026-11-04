/* ============ adaptive.js — dificultad adaptativa (MicaSurvivor M5 lote 9) ============
 * Del port de Android de JayElDragon (MIT, github.com/JayElDragon/poke-survivor): main.gd 173-177 (el
 * estado), 1162-1223 (_adapt_on, _power, _adapt_target, _adapt, _adapt_k, _xp_need), 1037 / 8708-8710 (el
 * "Reto: N%" bajo el reloj), 3111 / 3228 / 3262 / 3663 (vida, daño, aparición, eventos), menu.gd 4144 (el
 * ajuste) y save_data.gd 87 (settings.adaptive, sí por defecto). Los números son del port.
 *
 * Sólo en la partida normal (no en el Diario, que es igual para todos, ni en los demás modos), con el
 * ajuste encendido y fuera de la arena de una grieta. Empieza fácil (aún más los primeros 8 runs) y sube
 * con tu poder:
 *   poder  = mejoras de stat de la partida + niveles de tus movimientos (+3 por cada uno evolucionado)
 *            + la mitad de tu nivel
 *   base   = las mejoras permanentes del Pokémon (0..40, suavizado)
 *   k      = 0,62 + 0,38·base + (0,2 + 0,3·base)·poder(0..70, suavizado)   (×0,9..1 los primeros 8 runs)
 *            + el ajuste por sufrimiento, entre 0,55 y 1,5
 * Cada 45 s (sin jefe vivo): si has perdido más del 50 % de tu vida (o te queda menos del 30 %) baja 0,05;
 * si has perdido menos del 8 %, sube 0,03 (el ajuste va de -0,2 a +0,1). k se mueve hacia su objetivo
 * 0,03 por segundo. Multiplica la vida de los enemigos y jefes (×k), su daño (×k^0,7), la aparición (×k),
 * la frecuencia de las hordas (÷k) y la experiencia de cada nivel (×k^0,8). No cambia monedas ni récords.
 *
 * El ajuste va en la partida (save.modes.adaptive; sólo se guarda el "no"): viaja con tu cuenta y, al
 * fusionar dos partidas, gana la elección de la más reciente (como el resto de save.modes).
 *
 * La Torre adaptativa (lote 8, tower.js) usa las mismas cuentas de mejoras: runUps / permUps.
 */
G.Adaptive = (() => {
  const K = {
    base: 0.62, perm: 0.38, push: 0.2, pushPerm: 0.3, permFull: 40, powerFull: 70, lvl: 0.5, evo: 3,
    newRuns: 8, newK: 0.9, min: 0.55, max: 1.5,
    every: 45, hurtHi: 0.5, lowHp: 0.3, hurtLo: 0.08, down: 0.05, up: 0.03, adjMin: -0.2, adjMax: 0.1,
    glide: 0.03, dmgExp: 0.7, xpExp: 0.8
  };
  const save = () => G.DB && G.DB.save;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = x => x * x * (3 - 2 * x);

  // ---------------- el ajuste (menu.gd 4144) ----------------
  /** ¿Está encendida? (sí, salvo que la partida diga que no) */
  function enabled(s = save()) { return !(s && s.modes && typeof s.modes === 'object' && s.modes.adaptive === false); }
  function setEnabled(on) {
    const s = save();
    if (!s) return false;
    const p = G.Modes ? G.Modes.prefs(s) : (s.modes = s.modes || {});
    if (on) delete p.adaptive; else p.adaptive = false;
    if (G.DB.commit) G.DB.commit();
    return enabled(s);
  }
  const toggle = () => setEnabled(!enabled());

  // ---------------- cuánto has mejorado ----------------
  /** Mejoras de la partida: cartas de stat + niveles de movimiento (+3 por evolucionado si evo). */
  function runUps(pl, evo = false) {
    let n = 0;
    if (!pl) return 0;
    for (const k in pl.statsTaken || {}) n += +pl.statsTaken[k] || 0;
    for (const m of pl.moves || []) n += (+m.lvl || 0) + (evo && m.evolved ? K.evo : 0);
    return n;
  }
  /** Mejoras permanentes de un Pokémon (save_data.gd up_total). */
  function permUps(dex, s = save()) {
    const up = (s && s.pupg && s.pupg[dex]) || {};
    let n = 0;
    for (const k in up) n += +up[k] || 0;
    return n;
  }
  /** main.gd _power: lo de la partida + medio punto por nivel. */
  const power = pl => runUps(pl, true) + (pl ? pl.level : 1) * K.lvl;

  // ---------------- la partida ----------------
  let k = 1, taken = 0, next = K.every, adj = 0, prevHp = -1;
  function reset() { k = 1; taken = 0; next = K.every; adj = 0; prevHp = -1; }

  /** main.gd _adapt_on: partida normal, ajuste encendido, fuera de la arena (y no en grupo, ver README). */
  function on() {
    return !!G.Game && G.Game.mode === 'normal' && enabled() && !(G.Rift && G.Rift.inArena) && !(G.Coop && G.Coop.active);
  }

  /** main.gd _adapt_target. */
  function target(pl, s = save()) {
    const pb = smooth(clamp(permUps(pl ? pl.dex : 0, s) / K.permFull, 0, 1));
    const x = smooth(clamp(power(pl) / K.powerFull, 0, 1));
    let t = K.base + K.perm * pb + (K.push + K.pushPerm * pb) * x;
    const runs = (s && s.stats && +s.stats.runs) || 0;
    if (runs < K.newRuns) t *= K.newK + (1 - K.newK) * (runs / K.newRuns);
    return clamp(t + adj, K.min, K.max);
  }

  /** main.gd _adapt: cada fotograma de juego (game.js). */
  function update(dt, pl, time) {
    if (!on() || !pl) { k = 1; return; }
    if (prevHp >= 0 && pl.hp < prevHp) taken += prevHp - pl.hp;
    prevHp = pl.hp;
    if (time >= next) {
      next = time + K.every;
      if (G.EnemyMgr && G.EnemyMgr.bossAlive()) taken = 0;
      else {
        const frac = taken / Math.max(1, pl.maxHp), low = pl.hp < pl.maxHp * K.lowHp;
        taken = 0;
        if (frac > K.hurtHi || low) adj -= K.down;        // sufres demasiado: un respiro
        else if (frac < K.hurtLo) adj += K.up;
        adj = clamp(adj, K.adjMin, K.adjMax);
      }
    }
    const tk = target(pl);
    if (dt <= 0) k = tk;
    else k = k < tk ? Math.min(tk, k + K.glide * dt) : Math.max(tk, k - K.glide * dt);
  }

  /** main.gd _adapt_k: el factor (1 si no aplica). */
  const kNow = () => (on() ? k : 1);
  const hpK = () => kNow();
  const dmgK = () => Math.pow(kNow(), K.dmgExp);
  const rateK = () => kNow();
  const xpK = () => Math.pow(kNow(), K.xpExp);
  /** El "Reto: N%" del HUD (0 = no se enseña). */
  const pct = () => (on() ? Math.round(k * 100) : 0);
  /** Color del HUD (main.gd 8709): verde por debajo de 100, dorado en 100, naranja por encima. */
  const color = p => (p < 100 ? '#8fe39b' : p === 100 ? '#ffd23f' : '#ff9a5a');

  return {
    K, enabled, setEnabled, toggle, runUps, permUps, power, reset, on, target, update,
    k: kNow, hpK, dmgK, rateK, xpK, pct, color,
    get raw() { return k; }, get adj() { return adj; }, get taken() { return taken; }, get next() { return next; },
    /** Para las pruebas: fija el estado. */
    debugSet(o) { if (o.k != null) k = o.k; if (o.adj != null) adj = o.adj; if (o.next != null) next = o.next; if (o.taken != null) taken = o.taken; if (o.prevHp != null) prevHp = o.prevHp; }
  };
})();
