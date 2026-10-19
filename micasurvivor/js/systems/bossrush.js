/* ============ bossrush.js — Rush de Jefes (MicaSurvivor M5 lote 8) ============
 * Del port de Android de JayElDragon (MIT, github.com/JayElDragon/poke-survivor): main.gd 339-343
 * (estado), 441-445 (empezar: un bioma al azar), 577 (sin enemigos al empezar), 795-798 / 847-849
 * (al acabar: récord y stats rushRuns / rushBest), 1007 / 5863 (ni la Sentencia de Arceus ni grietas),
 * 2914 (nombre), 2931-2955 (_rush_def: el jefe número i), 3249-3251 (sólo jefes: ni oleadas ni mareas
 * ni eventos), 3598-3611 (_update_rush: 5 s antes del primero, 8 s entre jefes), 4705 (el bioma cambia
 * cada 150 s), 5288-5320 (lo que suelta un jefe), menu.gd 1571-1572 (la tarjeta del modo) y
 * progress.gd 113-117 / 247 / 313 / 328 (logros, la misión de Cristal Z de Bicho y las misiones; en
 * js/data/achievements.js, js/systems/zmoves.js y js/data/missions.js). Los números son del port.
 *
 *   Sólo jefes, uno tras otro: el primero a los 5 s ("¡Rush de Jefes! Prepárate…" en los últimos 4),
 *   cada siguiente 8 s después de que caiga el anterior. Cada tercero (3.º, 6.º, 9.º...) es un
 *   legendario (cualquiera con sprites); los demás, uno no legendario de PE base entre lo y lo + 110,
 *   lo = min(640, 490 + 14·i) (si no hay ninguno: cualquiera no legendario de 480 o más).
 *   Vida 1400 · 1,27^i · 1,35; daño min(150, 34 + 5·i) · 1,2; disparo 0,55 del daño (cada 1,1 s,
 *   alcance 260); velocidad 40 + vel. base / 2 (entre 40 y 100); a distancia si su forma de pelear lo
 *   es, embiste si es rápido (vel. base > 90), si no persigue. Se crea como si la partida fuera por el
 *   segundo 60·i (vida y daño × (1 + 60·i / 600)). Experiencia: la de tu nivel × 1,25.
 *   Entre jefes, lo que suelta el anterior: experiencia, monedas, un objeto y (como en el port) una
 *   baya que cura el 30 % y un imán.
 *   Termina al caer. Récord: los jefes derrotados (stats.rushBest, el mayor); stats.rushRuns.
 *   Sin desbloqueo (como en el port). Con los modificadores elegidos (+25 % de monedas cada uno).
 */
G.BossRush = (() => {
  const FIRST = 5;           // s hasta el primer jefe (main.gd 343 rush_rest)
  const REST = 8;            // s entre jefes (main.gd 3611)
  const WARN = 4;            // "Prepárate…" en los últimos 4 s antes del primero
  const BIOME_EVERY = 150;   // s por bioma (main.gd 4705)
  const LEG_EVERY = 3;       // cada tercero, un legendario (i % 3 == 2)
  const HP = { base: 1400, grow: 1.27, k: 1.35 };
  const DMG = { base: 34, step: 5, max: 150, k: 1.2, shot: 0.55 };
  const BST = { lo: 490, step: 14, max: 640, span: 110, fallback: 480 };
  const T_PER = 60;          // la escala del jefe i es la del segundo 60·i
  const XP_K = 1.25;
  const SHOT = { cd: 1.1, range: 260 };

  let on = false, i = 0, rest = FIRST, biomeOff = 0;

  /** Al empezar (game.js startRun): bioma al azar (main.gd 441-445), nunca las Ruinas del Juicio (G.Tiles.CYCLE). */
  function begin() {
    on = !!G.Game && G.Game.mode === 'rush';
    i = 0; rest = FIRST;
    biomeOff = on ? Math.floor(Math.random() * G.Tiles.CYCLE.length) : 0;   // (una posición en G.Tiles.CYCLE)
    return on;
  }

  /** El jefe número n (0 = el primero; main.gd _rush_def). */
  function def(n, level = 1) {
    const leg = n % LEG_EVERY === LEG_EVERY - 1;
    const lo = Math.min(BST.max, BST.lo + n * BST.step);
    const ok = p => !!G.SPRITE_META[p.dex] && !!p.leg === leg;
    let pool = G.DEX.filter(p => ok(p) && (leg || (p.bst >= lo && p.bst <= lo + BST.span)));
    if (!pool.length) pool = G.DEX.filter(p => !p.leg && G.SPRITE_META[p.dex] && p.bst >= BST.fallback);
    const p = G.U.pick(pool);
    const E = G.Enemies;
    const behavior = E.behaviorOf(p) === 'ranged' ? 'ranged' : E.baseSpd(p) > 90 ? 'charger' : 'chase';
    const hp = HP.base * Math.pow(HP.grow, n);
    const dm = Math.min(DMG.max, DMG.base + DMG.step * n);
    return {
      at: 0, dex: p.dex, name: p.name, leg, rush: n + 1,
      hp: Math.round(hp * HP.k), spd: Math.round(G.U.clamp(40 + E.baseSpd(p) * 0.5, 40, 100)), dmg: Math.round(dm * DMG.k),
      xp: G.Player.xpFor(level) * XP_K, behavior, shotDmg: Math.round(dm * DMG.shot), shotCd: SHOT.cd, range: SHOT.range
    };
  }

  /** Cada fotograma (spawner.js, en vez de las oleadas): main.gd _update_rush. */
  function update(dt, anchor) {
    if (!on || G.EnemyMgr.bossAlive()) return null;
    rest -= dt;
    if (rest > 0) {
      if (i === 0 && rest < WARN && !G.Spawner.banner()) G.Spawner.say('¡Rush de Jefes! Prepárate…', 2.4);
      return null;
    }
    const pl = anchor || (G.Game && G.Game.player);
    const d = def(i, pl ? pl.level : 1);
    G.Sprites.preload([d.dex], 8000);
    const e = G.Spawner.spawnBoss(pl, T_PER * i, d);
    G.Spawner.say('Jefe ' + (i + 1) + ': ' + d.name, 3);
    i++;
    rest = REST;
    return e;
  }

  /** Lo que suelta un jefe además de lo de siempre (main.gd _drop: baya y un imán). force: el de la Torre. */
  function bossDrops(e, force = false) {
    if ((!on && !force) || !e || e.judge || e.den) return;
    G.Pickups.drop('heal', e.x + 24, e.y, 0);
    G.Pickups.drop('magnet', e.x - 24, e.y, 0);
  }

  /** El bioma (main.gd 4705: cada 150 s, desde el del principio). */
  const biomeAt = t => G.Tiles.cycleBiome(Math.floor(t / BIOME_EVERY) + biomeOff);

  /** Al acabar (main.gd 795-798 / 847-849): stats y líneas del resumen. */
  function finish(S, bosses) {
    const best = S.rushBest || 0;
    S.rushRuns = (S.rushRuns || 0) + 1;
    S.rushBest = Math.max(best, bosses);
    const lines = ['Rush de Jefes: ' + bosses + ' jefes'];
    if (bosses > best) lines.push('¡Récord!');
    return lines;
  }

  const best = (s = G.DB && G.DB.save) => ((s && s.stats) || {}).rushBest || 0;

  return {
    FIRST, REST, WARN, BIOME_EVERY, LEG_EVERY, HP, DMG, BST, T_PER, XP_K, SHOT,
    begin, def, update, bossDrops, biomeAt, finish, best,
    get on() { return on; }, get i() { return i; }, get rest() { return rest; }, get biomeOff() { return biomeOff; },
    /** Para pruebas: cuántos segundos faltan para el siguiente. */
    debugRest(v) { rest = v; }
  };
})();
