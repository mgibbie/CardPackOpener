/* ============ game.js — flujo del juego y bucle principal ============
 *
 *   login ──> test de personalidad ──> menú ──> run ──> resumen ──> menú
 *                (sólo la 1ª vez)          │
 *                                          ├─ Pokémon (colección)
 *                                          ├─ Mejoras
 *                                          └─ Gacha
 *
 * Estados del bucle: 'ui' (menús, con el mundo de fondo), 'playing',
 * 'levelup', 'paused', 'over'.
 *
 * Cooperativo (G.Coop.active): el anfitrión lleva enemigos, objetos y
 * experiencia; cada uno su Pokémon. La pausa no para el juego, las cartas de
 * nivel esperan a que elijan todos y un compañero caído se levanta si otro
 * se queda a su lado. Ver net/coop.js.
 */
G.Game = (() => {
  let cv, ctx, dpr = 1, w = 0, h = 0;
  let state = 'ui';
  let time = 0, last = 0, pendingLevels = 0;
  let pl = null;
  let caught = [];          // shinies conseguidos en esta run
  let biome = -1;
  // MicaSurvivor (M5 lote 4): modo de la partida ('tower', la Torre del lote 8: sin Movimientos Z ni Dynamax).
  let runMode = 'normal';

  const st = { get time() { return time; } };

  // ---------------- arranque ----------------

  function init() {
    cv = document.getElementById('game');
    ctx = cv.getContext('2d');
    resize();
    addEventListener('resize', resize);
    G.Touch.init(cv);
    // En móvil: al cambiar de app o girarlo en vertical, la partida se pausa.
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
    G.RunUI.wirePause(() => { state = 'playing'; G.UI.hideAll(); }, quitRun);
    Backdrop.init();
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function resize() {
    // Resolución interna como mucho ×1,5: en pantallas ×2 dibujar el doble de
    // píxeles era de lo que más costaba, y con el pixel art no se nota.
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    G.Camera.resize(w, h, dpr);
    checkOrientation();
  }

  /** Móvil en vertical: aviso de girarlo (y pausa). */
  function checkOrientation() {
    const portrait = G.Touch.active && innerHeight > innerWidth;
    const el = document.getElementById('rotate');
    if (!el) return;
    if (portrait && !document.getElementById('rotate-ico').innerHTML) document.getElementById('rotate-ico').innerHTML = G.Icons.html('phone', 48);
    el.classList.toggle('hidden', !portrait);
    if (portrait) autoPause();
  }

  /** Pausa sola (sólo en solitario: en grupo los demás siguen). */
  function autoPause() {
    G.Touch.reset();
    if (state === 'playing' && !G.Coop.active) { state = 'paused'; G.RunUI.showPause(); }
  }

  /** Pausa/continúa (tecla Esc o P, o el botón de pausa del móvil). */
  let holdBy = [];                   // grupo: quién está eligiendo fusión (todo parado)

  function togglePause() {
    // En grupo la pausa no para el juego (los demás siguen jugando).
    if (G.Coop.active) {
      if (state !== 'playing') return;
      if (G.UI.isOpen('scr-pause')) G.UI.hide('scr-pause');
      else { G.RunUI.showPause(true); G.Audio.sfx('pause'); }
      return;
    }
    if (state === 'playing') { state = 'paused'; G.RunUI.showPause(); G.Audio.sfx('pause'); }
    else if (state === 'paused') { state = 'playing'; G.UI.hideAll(); }
  }

  // ---------------- run ----------------

  /**
   * @param coop  { seed, host, members } para una partida en grupo
   * @param mode  MicaSurvivor (M5 lote 6): 'normal' | 'daily' | 'party' | 'rifts' | 'type' (js/systems/modes.js;
   *              en grupo, siempre normal y sin modificadores); M5 lote 7: 'team' (js/systems/team.js);
   *              M5 lote 8: 'rush' (js/systems/bossrush.js) y 'tower' (js/systems/tower.js)
   */
  function startRun(coop = null, mode = 'normal') {
    holdBy = []; awayBy = null;
    const save = G.DB.save;
    const cfg = G.Modes.begin(coop ? { mode: 'normal' } : G.Modes.plan(mode));
    // Diario y Fiesta: su propio Pokémon (el del día / el elegido, aunque no lo tengas). Equipo: el primero.
    const mon = G.DEX_BY[cfg.dex || save.partner];
    const perks = G.Upgrades.perks(G.DB.upgradesOf(mon.dex));

    G.UI.hideAll();
    G.UI.chrome(false);
    G.FX.clear();
    G.Projectiles.clear();
    G.Combat.clearFields();
    G.EnemyMgr.clear();
    G.Pickups.clear();
    G.Rift.reset();
    G.Judgment.reset();
    G.Path.clear();
    G.Hazards.clear();
    G.ZMoves.reset();   // MicaSurvivor (M5 lote 4)
    G.Dynamax.reset();  // MicaSurvivor (M5 lote 5)
    // MicaSurvivor (M5 lote 6, main.gd 432): el Desafío diario siembra el azar con la fecha: el mismo
    // mundo, elenco, jefes y movimientos iniciales para todos ese día.
    if (cfg.mode === 'daily') G.Modes.seeded(cfg.seed, () => setupRun(coop, save, mon, perks));
    else setupRun(coop, save, mon, perks);
    // MicaSurvivor (M5 lote 8): Rush de Jefes (un bioma al azar) y la Torre (piso inicial, reliquias y
    // experiencia ×0,65: antes de Frágil, que parte la vida con las reliquias ya sumadas, main.gd 462-488)
    if (G.BossRush.begin()) { biome = G.BossRush.biomeAt(0); G.World.setBiome(biome, true); }
    if (G.Tower.begin(pl)) { biome = G.Tower.floor - 1; G.World.setBiome(biome, true); }
    G.Modes.startPlayer(pl);   // Frágil: vida máxima a la mitad
    G.Team.begin(pl, perks);   // MicaSurvivor (M5 lote 7): el Modo Equipo (los demás del equipo, con sus vidas)

    if (coop) {
      G.Coop.begin(coop, pl, coopApi);
      G.Social.setPlaying(true);
    }
    G.Camera.x = pl.x; G.Camera.y = pl.y; G.Camera.shake = 0;
    // Hojas de sprites locales: el compañero y los primeros enemigos.
    G.Sprites.preload([mon.dex], 8000, pl.shiny);
    G.Audio.music(G.BIOME_MUSIC[0]);
    // Para el ranking: el servidor apunta cuándo empieza la partida (anti-trampas).
    if (!coop || G.Coop.isHost) G.Ranking.runStarted(coop ? 'g' : 's');
    deathT = 0;

    state = 'playing';
  }

  /** Lo que se sortea al montar la partida (en el Diario, con la semilla del día). */
  function setupRun(coop, save, mon, perks) {
    G.Spawner.reset();
    G.Events.reset();
    G.Weather.reset();
    G.World.reset(coop ? coop.seed : Math.floor(Math.random() * 1e6));
    G.World.setBiome(0, true);
    biome = 0;
    time = 0; pendingLevels = 0;
    runReal = performance.now(); tampered = false;

    pl = new G.Player(mon, perks, !!save.partnerShiny && G.DB.ownsShiny(mon.dex));
    pl.bansLeft = perks.bans || 0;   // MicaSurvivor (M5 lote 6): vetos de cartas en la partida (main_e16.gd 197)
    banked = { t1: 0, t10: 0 };
    caught = [];
    // Atajos: movimientos con hueco fijo (save.pbind[dex] = [id del 1, id del 2, ...]),
    // antes de aprender nada: addMove ya los coloca.
    (save.pbind && save.pbind[mon.dex] || []).forEach((id, i) => { if (id) pl.bind[id] = i; });
    pl.addMove(G.startMoveOf(mon.dex));
    // Mejora "Veto": movimientos que no quieres que te salgan.
    pl.banned = new Set((save.pban && save.pban[mon.dex] || []).slice(0, perks.bans));
    // Mejora "Repertorio": un segundo movimiento de ataque al azar.
    if (perks.startMoves >= 2) {
      const pool = G.Moves.poolFor(mon).filter(id => !pl.hasMove(id) && !pl.banned.has(id) && G.Moves.BY_ID[id].kind !== 'buff');
      if (pool.length) pl.addMove(G.U.pick(pool));
      pl.setActive(0);
    }
  }

  function quitRun() {
    if (G.Coop.active) G.Coop.leave();
    endRun(false);
  }

  /** Todos los jugadores de la partida (tú primero). */
  function everyone() { return G.Coop.active ? G.Coop.players() : [pl]; }

  /** Experiencia que hace falta para el siguiente nivel (cofres con candado). */
  function levelXp() {
    if (!pl) return 20;
    const k = (G.Coop.active ? G.Coop.xpFactor() : 1) * (pl.xpMul || 1);
    return Math.ceil((pl.xpNext - pl.xp + 1) / k);
  }

  // Destello de pantalla completa (viaje a la grieta).
  let flashT = 0, flashDur = 1, flashCol = '#fff';
  function flash(col, dur) { flashCol = col; flashDur = dur; flashT = dur; }

  function teamState() {
    return { time, level: pl.level, xp: pl.xp, xpNext: pl.xpNext, kills: pl.kills, bosses: pl.bosses, coins: pl.coins, t1: pl.t1, t10: pl.t10 };
  }
  function summary() { return { t: time, ki: pl.kills, bo: pl.bosses, co: pl.coins, lv: pl.level, t1: pl.t1, t10: pl.t10 }; }

  /** Lo que el cooperativo necesita del juego. */
  /**
   * Los tickets recogidos se guardan en cuanto los coges (como los shinies):
   * antes sólo al acabar, y si la pestaña se cerraba de golpe se perdían.
   * `banked` = los de esta partida que ya están en la partida guardada.
   */
  let banked = { t1: 0, t10: 0 };
  function bankTickets(save_ = true) {
    const sv = G.DB.save;
    if (!sv || !pl || !G.Modes.saves()) return;   // MicaSurvivor (M5 lote 6): la Fiesta no guarda nada
    sv.tickets = sv.tickets || { t1: 0, t10: 0 };
    const d1 = Math.max(0, pl.t1 - banked.t1), d10 = Math.max(0, pl.t10 - banked.t10);
    if (!d1 && !d10) return;
    sv.tickets.t1 += d1; sv.tickets.t10 += d10;
    banked = { t1: pl.t1, t10: pl.t10 };
    if (save_) G.DB.commit('run');
  }

  const coopApi = {
    team: teamState,
    summary,
    // Invitado: el anfitrión manda el reloj y lo del equipo.
    syncTeam(t) {
      if (Math.abs(t.time - time) > 0.4) time = t.time;
      if (t.level > pl.level) G.Audio.sfx('xp');
      pl.level = t.level; pl.xp = t.xp; pl.xpNext = t.xpNext;
      pl.kills = t.kills; pl.bosses = t.bosses; pl.coins = t.coins;
      if (t.t1 > pl.t1 || t.t10 > pl.t10) G.Audio.sfx('shiny');
      pl.t1 = t.t1 || 0; pl.t10 = t.t10 || 0;
      bankTickets();
    },
    levelStart(level) {
      // (Si tenías abierta la elección de objeto, vuelve al terminar: afterLevelUp.)
      if (state === 'choice' && openItem && G.Coop.active) G.Coop.holdEnd();
      state = 'levelup';
      G.UI.hide('scr-pause');
      G.Audio.sfx('levelup');
      G.RunUI.showLevelUp(level, G.LevelUp.offer(pl), card => {
        G.Audio.sfx('confirm');
        card.apply(pl);
        G.Coop.localPicked();
      }, true);
    },
    waiting(names) { G.RunUI.setWaiting(names); },
    resume() {
      G.RunUI.closeLevelUp();
      if (state === 'levelup') { state = holdBy.length ? 'held' : 'playing'; afterLevelUp(); }
    },
    /** ¿Estás eligiendo algo que para la partida (objeto o vínculo)? */
    choosing() { return state === 'choice'; },
    inLevelUp() { return state === 'levelup'; },
    shiny(dex) { G.onShinyCaught({ dex, name: (G.DEX_BY[dex] || {}).name || '' }); },
    over(d) {
      if (d) Object.assign(pl, { kills: d.ki, bosses: d.bo, coins: d.co, level: Math.max(pl.level, d.lv || 1), t1: d.t1 || pl.t1, t10: d.t10 || pl.t10 });
      if (d && d.t) time = d.t;
      if (d && d.why === 'host') G.UI.toast('El anfitrión ha terminado la partida', 3200);
      endRun(!(d && d.why === 'host'));
    },
    lost(msg) { G.UI.toast(msg, 3600); endRun(false); },
    item(id) { offerItem(id); },
    mateLeft() {},
    /** Grupo: quién está eligiendo fusión. Mientras haya alguien, todo parado. */
    hold(names) {
      holdBy = names || [];
      const mine = G.UI.isOpen('scr-bond');
      if (holdBy.length) {
        if (state === 'playing') state = 'held';
        if (pl && pl.bonds > 0) offerBond(true);      // si tú también tienes vínculo, eliges a la vez
        const others = holdBy.filter(n => n !== (G.Social.me && G.Social.me.name) && n !== 'Tú');
        if (!mine && others.length) G.Spawner.say('Pausa: ' + others.join(', ') + ' ' + (others.length > 1 ? 'están eligiendo…' : 'está eligiendo…'), 999, true);
        else if (!others.length) G.Spawner.say(awayBy ? awayText() : '', awayBy ? 999 : 0, true);   // sólo tú: sin aviso viejo
      } else {
        if (state === 'held' && !awayBy) state = 'playing';
        G.Spawner.say(awayBy ? awayText() : '', awayBy ? 999 : 0, true);
      }
    },
    /** Grupo (invitado): el anfitrión se ha ido de la pestaña o no responde: todo parado. */
    away(name) {
      awayBy = name || null;
      if (awayBy) {
        if (state === 'playing') state = 'held';
        G.Spawner.say(awayText(), 999, true);
      } else if (!holdBy.length) {
        if (state === 'held') state = 'playing';
        G.Spawner.say('', 0, true);
      }
    }
  };
  let awayBy = null;
  const awayText = () => 'Pausa: esperando a ' + awayBy + ' (anfitrión)…';

  /** Has llevado a casa a un Pokémon perdido y se une a ti (events.js). */
  G.onRescue = (dex, name) => {
    if (!G.DB.save || !pl) return;
    if (!G.Modes.saves()) { G.Spawner.say('Modo Fiesta: no se guarda progreso', 3); return; }   // MicaSurvivor (M5 lote 6)
    const isNew = !G.DB.owns(dex);
    if (isNew) { G.DB.grant(dex, 'rescue'); G.DB.commit(true); }
    else pl.coins += 150;
    G.Spawner.say(isNew ? '¡' + name + ' se une a tu equipo!' : '¡' + name + ' te da las gracias! (+150 monedas, ya lo tenías)', 4);
    G.Audio.sfx('shinyGet');
  };

  /** Un shiny salvaje cae: te lo quedas (y la versión normal si no la tenías). */
  G.onShinyCaught = e => {
    if (!G.DB.save || !pl) return;
    if (!G.Modes.saves()) { G.Spawner.say('Modo Fiesta: no se guarda progreso', 3); return; }   // MicaSurvivor (M5 lote 6)
    if (G.Coop.isHost) G.Coop.shinyCaught(e);
    const isNew = G.DB.grantShiny(e.dex, 'wild');
    G.DB.save.stats.shinies++;
    G.DB.commit(true);
    caught.push({ dex: e.dex, isNew });
    G.Spawner.say(isNew ? '¡Has conseguido a ' + e.name + ' shiny!' : '¡Otro ' + e.name + ' shiny! (+300 monedas)', 4);
    if (!isNew) pl.coins += 300;
    G.Audio.sfx('shinyGet');
  };

  function endRun(dead = true) {
    if (state === 'over' || !pl) return;
    const coop = !!pl.uid;                    // sólo las partidas en grupo le ponen uid
    const wasHost = !!pl.coopHost;
    const team = coop ? G.Coop.members.slice() : [];
    if (G.Coop.active) G.Coop.end();
    if (coop) G.Social.setPlaying(false);
    state = 'over';
    G.Audio.music(null);
    G.Audio.sfx(dead ? 'gameover' : 'back');
    const save = G.DB.save;
    // MicaSurvivor (M5 lote 6, main.gd 782-786): la Fiesta no guarda nada (ni monedas, ni stats, ni ranking).
    if (!G.Modes.saves()) {
      G.Judgment.reset();
      G.Progress.off = false;
      G.RunUI.showOver({
        dead, time, level: pl.level, kills: pl.kills, bosses: pl.bosses, coins: 0, record: false, t1: 0, t10: 0, judge: null,
        moves: pl.moves, caught: [], modeLines: [G.Modes.NAME.party, 'No se guarda progreso'], breakdown: ''
      }, () => { pl = null; G.Flow.afterRun(); });
      return;
    }
    // MicaSurvivor (M5 lote 6, main.gd 787-855): récords y stats del modo, y su multiplicador de monedas.
    const md = G.Modes.finish(time, save, pl);
    const timeUp = G.Modes.timeUp;
    const mul = md.base * pl.coinMul + md.add;
    const parts = {
      tiempo: Math.floor(time / 5),
      derrotados: Math.floor(pl.kills * 0.25),
      jefes: pl.bosses * 80,
      recogidas: pl.coins
    };
    const coins = Math.round((parts.tiempo + parts.derrotados + parts.jefes + parts.recogidas) * mul);
    const record = time > save.stats.bestTime;

    save.coins += coins;
    bankTickets(false);
    save.stats.runs++;
    save.stats.totalKills += pl.kills;
    save.stats.bestTime = Math.max(save.stats.bestTime, Math.floor(time));
    if (coop) save.stats.bestGroupTime = Math.max(save.stats.bestGroupTime || 0, Math.floor(time));
    save.stats.bestLevel = Math.max(save.stats.bestLevel, pl.level);
    save.stats.coinsEarned += coins;
    const judge = G.Judgment.summary();
    if (judge) G.Progress.event('judgeEnd', judge);
    G.Judgment.reset();
    // (M5 lote 7: con el modo y los modificadores, para las misiones de modos; progress.gd _advance "req")
    // (M5 lote 8: bosses y floor, para las misiones del Rush de Jefes y la Torre: progress.gd "val")
    G.Progress.event('runEnd', { time, level: pl.level, coins: pl.coins, types: pl.mon.types, group: coop, mode: G.Game.mode, nmods: G.Modes.is('daily') ? 0 : G.Modes.mods.length,
      bosses: pl.bosses, floor: G.Tower.clears });
    G.Progress.checkAch();
    // A la nube al acabar la partida (como mucho cada 30 min); si la marca entra
    // en un top (hoy, semana o mes), enseguida (abajo, tras subirla al ranking).
    G.DB.commit('run');
    if (G.Social.me) G.Social.publishProfile();

    // Ranking: en solitario cada uno lo suyo; en grupo lo sube el anfitrión.
    const mark = { t: Math.floor(time), lv: pl.level, kills: pl.kills };
    // Si la partida se ha tocado (ver clean()), no sube al ranking (sin avisar); lo demás, sí.
    // MicaSurvivor (M5 lote 6): los rankings sólo cuentan partidas normales (los otros modos cambian las reglas).
    const ok = clean() && G.Modes.is('normal');
    const sent = ok && !coop ? G.Ranking.submitSolo(Object.assign(mark, { dex: pl.dex, shiny: pl.shiny }))
               : ok && wasHost ? G.Ranking.submitGroup(Object.assign(mark, { members: team })) : null;
    if (sent) sent.then(b => { if (b && b.some(p => p !== 'a')) G.DB.commit(true); }).catch(() => {});
    // MicaSurvivor (M3): the Magepunk leaderboard (best survival time) for logged-in players
    if (ok && !coop) G.MicaUI.runEnded({ time: Math.floor(time), kills: pl.kills, level: pl.level, dex: pl.dex, shiny: !!pl.shiny });

    G.RunUI.showOver({
      title: G.Tower.won ? '¡TORRE COMPLETA!' : null,   // (M5 lote 8, main.gd _tower_win)
      dead: dead && !timeUp, timeUp, rifts: G.Modes.rifts() ? G.Modes.riftsWon : null, modeLines: md.lines,
      time, level: pl.level, kills: pl.kills, bosses: pl.bosses, coins, record, t1: pl.t1, t10: pl.t10, judge,
      moves: pl.moves, caught,
      breakdown: Object.entries(parts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ') +
                 (pl.coinMul > 1 ? ` · ×${pl.coinMul.toFixed(2)} Fortuna` : '') +
                 (md.base !== 1 || md.add ? ` · ×${(md.base * pl.coinMul + md.add).toFixed(2)} con el modo` : '')
    }, () => { pl = null; G.Flow.afterRun(); });
  }

  /*
   * ¿Partida limpia? Sólo cosas que ningún jugador legal puede hacer, con
   * márgenes enormes (el sistema del 10-10 daba falsos positivos):
   *   - el reloj de la partida va más deprisa que el real (trucos de velocidad)
   *   - funciones de tu Pokémon sustituidas (así se hace uno invencible)
   *   - vida, ataque, velocidad o recarga muy por encima de lo posible
   *   - se han usado las funciones de pruebas (saltar el reloj...)
   * Si algo salta, esa partida no sube al ranking (sin avisar) y nada más.
   */
  let runReal = 0, tampered = false;
  function clean() {
    if (tampered) return false;
    if (time > (performance.now() - runReal) / 1000 + 10) return false;
    for (const k of ['hurt', 'update', 'heal', 'gainXp']) if (Object.prototype.hasOwnProperty.call(pl, k)) return false;
    if (!isFinite(pl.hp) || !isFinite(pl.maxHp) || pl.hp > pl.maxHp + 1 || pl.maxHp > 50000) return false;
    if (pl.atkMul > 2000 || pl.spdMul > 25 || pl.cdMul < 0.03 || pl.level > 20 + time / 3) return false;
    return true;
  }

  // ---------------- subida de nivel ----------------

  function maybeLevelUp() {
    if (pendingLevels <= 0 || state !== 'playing') return;
    if (G.Coop.active) {
      // En grupo, las cartas salen a la vez para todos y se espera a que elijan.
      if (G.Coop.players().every(p => p.dead)) return;
      pendingLevels--;
      G.Coop.levelStart(pl.level);
      return;
    }
    // Nunca abras cartas con el Pokémon caído (morir y recoger XP en el mismo frame).
    if (pl.dead) return;
    pendingLevels--;
    state = 'levelup';
    G.Audio.sfx('levelup');
    G.RunUI.showLevelUp(pl.level, G.LevelUp.offer(pl), card => {
      G.Audio.sfx('confirm');
      card.apply(pl);
      state = 'playing';
    });
  }

  // ---------------- vínculos ----------------

  /**
   * Vínculo de un legendario: eliges qué movimientos se fusionan.
   * Si ahora no se puede (no hay dos sueltos), se guarda hasta que aprendas
   * otro movimiento. Se mira en cada fotograma: si otra pantalla la tapa (cartas
   * de nivel en grupo, pausa), vuelve a salir al cerrarla.
   * @param quiet  no avisar si todavía no se puede
   */
  function offerBond(quiet = false) {
    if (!pl || pl.bonds <= 0 || pl.dead || (state !== 'playing' && state !== 'held') || G.Rift.inArena) return;
    if (['scr-bond', 'scr-pause', 'scr-item', 'scr-levelup', 'scr-tower'].some(G.UI.isOpen)) return;
    const opt = pl.bondOptions();
    if (!opt) {
      if (!quiet) G.Spawner.say('Guardas el vínculo: aprende otro movimiento para usarlo', 3, true);
      return;
    }
    // Se para el juego; en grupo, para todos hasta que cada uno elige (G.Coop.holdStart).
    state = 'choice';
    if (G.Coop.active) G.Coop.holdStart();
    G.Audio.sfx('levelup');
    G.RunUI.showBond(opt, picked => {
      const group = pl.fuse(picked, opt.group);
      G.Audio.sfx('legend');
      G.FX.ring(pl.x, pl.y, 8, 130, '#ff8ad8', 0.8, 6);
      G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ffb3e6', 40, 240);
      G.Spawner.say('¡Vínculo! ' + group.length + ' movimientos a la vez', 2.6, true);
      if (state === 'choice') state = holdBy.length ? 'held' : 'playing';
      if (G.Coop.active) G.Coop.holdEnd();
    });
  }

  // ---------------- recogida ----------------

  const PICK_SFX = { xp: 'xp', xpBig: 'xp', coin: 'coin', heal: 'heal', bomb: 'break', magnet: 'confirm', ticket: 'shiny', ticket10: 'legend', item: 'legend' };

  /*
   * Cooperativo: la elección de objeto y las cartas de nivel no pueden taparse.
   * Si llega un objeto con las cartas abiertas, espera a que elijas carta; y si
   * las cartas llegan con la elección de objeto abierta, ésta vuelve a salir al
   * terminar. (Antes una cerraba la otra, nadie podía terminar de elegir y la
   * partida se quedaba parada para todos.)
   */
  let openItem = null;           // { cur, next, take } elección de objeto sin terminar
  const laterItems = [];         // objetos recogidos con las cartas de nivel abiertas
  function afterLevelUp() {
    if (state !== 'playing' && state !== 'held') return;
    if (openItem && !G.UI.isOpen('scr-item')) {
      const o = openItem;
      if (o.mine) { state = 'choice'; if (G.Coop.active) G.Coop.holdStart(); }
      G.RunUI.showItemChoice(o.held, o.next, o.take);
      return;
    }
    if (laterItems.length) offerItem(laterItems.shift());
  }

  /**
   * MicaSurvivor (M5 lote 3, main.gd 5698-5705): el Caramelo Raro se gasta al cogerlo: +1 nivel
   * (con sus cartas) y no ocupa hueco. (El port lo ofrecía como carta; aquí se usa al momento,
   * como dice su descripción.)
   */
  function rareCandy() {
    pl.level++;
    pl.xpNext = G.Player.xpFor(pl.level);
    pendingLevels++;
    G.Progress.event('item', { id: 'rarecandy' });
    G.Audio.sfx('levelup');
    G.FX.ring(pl.x, pl.y, 8, 140, '#4f9cf0', 0.7, 5);
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 8, '¡Caramelo Raro! +1 nivel', '#4f9cf0', true);
  }

  /**
   * Has cogido un objeto: si tienes un hueco libre te lo pones; si no, eliges.
   * MicaSurvivor (M5 lote 3, main.gd 5754-5793): con la Mochila hay 2 huecos; con los dos llenos
   * eliges a cuál sustituye o te quedas con los tuyos.
   */
  function offerItem(id) {
    if (!pl || !G.Items.BY[id]) return;
    if (state === 'levelup' || G.UI.isOpen('scr-levelup')) { laterItems.push(id); return; }
    if (G.Items.BY[id].instant) { rareCandy(); return; }
    let mine = false;            // esta elección es la que ha parado el juego
    // choice: { slot } = te lo pones en ese hueco · null = te quedas como estabas
    const take = choice => {
      openItem = null;
      if (choice && choice.slot) {
        pl.equip(id, choice.slot);
        G.Spawner.say('¡Llevas ' + G.Items.BY[id].name + '!', 2.6, true);
        G.Progress.event('item', { id });
      }
      if (!mine) { afterLevelUp(); return; }
      if (state === 'choice') state = holdBy.length ? 'held' : 'playing';
      if (G.Coop.active) G.Coop.holdEnd();
      afterLevelUp();
    };
    if (pl.hasItem(id)) { G.Spawner.say('Ya llevas ' + G.Items.BY[id].name, 2, true); return; }
    const two = pl.itemSlots() >= 2;
    if (!pl.item) { take({ slot: 1 }); return; }
    if (two && !pl.item2) { take({ slot: 2 }); return; }
    // Se para el juego mientras eliges; en grupo, para todos (como con las
    // fusiones). Antes en grupo seguía y te pegaban mientras elegías.
    if (state === 'playing' || state === 'held') {
      mine = true;
      state = 'choice';
      if (G.Coop.active) G.Coop.holdStart();
    }
    const held = two ? [pl.item, pl.item2] : [pl.item];
    openItem = { held, next: id, take, get mine() { return mine; } };
    G.RunUI.showItemChoice(held, id, take);
  }

  /** @param who  quien lo ha cogido (en cooperativo puede ser un compañero) */
  function onCollect(p, who = pl) {
    const mine = who === pl;
    if (G.Coop.active && !G.Coop.isHost) {
      // Copia de un objeto del anfitrión: el efecto lo decide él.
      if (mine) G.Audio.sfx(PICK_SFX[p.kind]);
      return;
    }
    if (G.Coop.active) G.Coop.collected(p, who);
    if (mine || p.kind === 'bomb') G.Audio.sfx(PICK_SFX[p.kind]);
    if (p.kind === 'xp' || p.kind === 'xpBig') {
      pendingLevels += pl.gainXp(p.value * (G.Coop.active ? G.Coop.xpFactor() : 1));
      return;
    }
    if (p.kind === 'coin') {
      // M5 lote 3: Incienso Puro, +25 % de monedas (main.gd 5379; el resto se redondea al azar).
      const v = pl.hasItem('pureincense') ? Math.floor(p.value * G.Items.INCENSE.coins + Math.random()) : p.value;
      pl.coins += v;
      G.FX.dmgText(who.x, who.y - who.bodyH - 6, '+' + v, '#ffd23f');
      return;
    }
    if (p.kind === 'item') {
      if (mine) offerItem(p.value);
      return;
    }
    if (p.kind === 'ticket' || p.kind === 'ticket10') {
      if (p.kind === 'ticket') pl.t1++; else pl.t10++;
      bankTickets();
      G.FX.dmgText(who.x, who.y - who.bodyH - 8, p.kind === 'ticket' ? '+1 ticket' : '¡Ticket ×10!', p.kind === 'ticket' ? '#ffd23f' : '#d9a6ff', true);
      G.FX.ring(who.x, who.y, 6, 50, p.kind === 'ticket' ? '#ffd23f' : '#c47bff', 0.4, 3);
      return;
    }
    if (p.kind === 'heal') {
      if (mine) pl.heal(pl.maxHp * 0.3 * G.Tower.healK());   // (M5 lote 8: el pacto Ayuno, main.gd 5371)
      G.FX.ring(who.x, who.y, 6, 60, '#5fe08a', 0.4, 3);
      return;
    }
    if (p.kind === 'magnet') {
      G.Pickups.pullAll();
      G.FX.ring(who.x, who.y, 10, 420, '#ff9ed8', 0.6, 4);
      return;
    }
    if (p.kind === 'bomb') {
      if (G.U.dist2(who.x, who.y, pl.x, pl.y) < 500 * 500) G.Camera.kick(0.8);
      const R = G.Camera.outerRadius();
      G.FX.ring(who.x, who.y, 20, R, '#ff7b3d', 0.5, 6);
      for (const e of G.EnemyMgr.all()) {
        if (mine ? !G.Camera.sees(e.x, e.y, 0) : G.U.dist2(e.x, e.y, who.x, who.y) > R * R) continue;
        e.hurt(60 + pl.level * 14, '#ff7b3d', e.x - who.x, e.y - who.y, 160);
      }
    }
  }

  // ---------------- teclado ----------------

  function handleKeys() {
    if (G.SettingsUI.isOpen) { if (G.Input.tap('escape')) G.SettingsUI.close(); return; }
    // La Sentencia de Arceus: Espacio, Intro o Esc saltan la animación (si se puede).
    if (G.Judgment.cinematic && state === 'playing') {
      if (['space', 'enter', 'escape'].some(k => G.Input.tap(k))) G.Judgment.skip();
      return;
    }
    if (state === 'levelup') {
      for (let i = 0; i < 3; i++) {
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.RunUI.pick(i);
      }
      if (G.Input.tap('keyr')) G.RunUI.reroll();
      if (G.Input.tap('keyb')) G.RunUI.toggleBan();   // MicaSurvivor (M5 lote 6): vetar una carta (port: tecla B)
      return;
    }
    if (G.UI.isOpen('scr-bond')) {
      for (let i = 0; i < 4; i++) {
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.RunUI.pickBond(i);
      }
      return;
    }
    // MicaSurvivor (M5 lote 8): el descanso y los pactos de la Torre, con 1-4
    if (G.UI.isOpen('scr-tower')) {
      for (let i = 0; i < 4; i++) {
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) G.TowerUI.pick(i);
      }
      return;
    }
    if (G.UI.isOpen('scr-item')) {
      const cards = document.querySelectorAll('#item-cards .card');   // 2, o 3 con la Mochila llena
      for (let i = 0; i < cards.length; i++) {
        if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) cards[i].click();
      }
      return;
    }
    if (state === 'ui') {
      // Esc en una subpantalla del menú vuelve al menú.
      if (G.Input.tap('escape') && !G.UI.isOpen('scr-profile') && ['scr-dex', 'scr-upgrades', 'scr-gacha', 'scr-friends', 'scr-rank', 'scr-goals', 'scr-modes'].some(G.UI.isOpen)
          && document.getElementById('pull-fx').classList.contains('hidden')) { if (!(G.ModesUI && G.ModesUI.back())) G.MenuUI.open(); }
      return;
    }
    if (G.Input.tap('escape') || G.Input.tap('keyp')) { togglePause(); return; }
    if (state !== 'playing' || !pl) return;
    for (let i = 0; i < 4; i++) {
      if (G.Input.tap('digit' + (i + 1)) || G.Input.tap('numpad' + (i + 1))) pl.setActive(i);
    }
    if (G.Input.tap('keyz')) G.ZMoves.tryStart(pl);   // MicaSurvivor (M5 lote 4): Movimiento Z
    if (G.Input.tap('keyc')) G.Dynamax.tryStart(pl);  // MicaSurvivor (M5 lote 5): Dynamax
    if (G.Input.tap('keyq')) pl.cycle(-1);
    // MicaSurvivor (M5 lote 7, main.gd 642): en el Modo Equipo, Tab cambia de Pokémon (si no, el siguiente movimiento)
    if (G.Input.tap('tab') && G.Team.on) G.Team.request(pl);
    else if (G.Input.tap('keye') || G.Input.tap('tab')) pl.cycle(1);
  }

  // ---------------- bucle ----------------

  let deathT = 0;

  let frameDt = 0, speedK = 1;
  let fpsShown = 60, fpsAcc = 0, fpsN = 0;
  // El siguiente fotograma se pide ANTES de nada: si algo falla a mitad, el
  // juego sigue (antes se quedaba congelado para siempre y había que recargar;
  // así se perdió una partida enorme al abrirse una grieta).
  // Si falla fotograma tras fotograma (el juego ya no avanza ni se ve), la
  // partida se da por terminada a los ~3 s y se guarda: tiempo, derrotados,
  // récords y ranking. Mejor eso que una pantalla negra y perderlo todo.
  let loopErrs = 0, errRun = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    try { frame(ts); errRun = 0; }
    catch (e) {
      if (loopErrs++ < 5) console.error('[Game] fallo en un fotograma:', e);
      G.Input.endFrame();
      if (++errRun === 180 && pl && state !== 'ui' && state !== 'over') {
        try {
          G.UI.hideAll();
          quitRun();
          G.UI.toast('El juego ha fallado: tu partida se ha guardado hasta aquí', 5000);
        } catch (e2) { console.error('[Game] no se pudo cerrar la partida:', e2); }
      }
    }
  }

  function frame(ts) {
    const real = (ts - last) / 1000 || 0;
    const dt = Math.min(1 / 30, real) * speedK;
    last = ts;
    if (state === 'playing') G.Settings.sample(real);
    fpsAcc += real; fpsN++;
    if (fpsAcc >= 0.5) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    frameDt = state === 'playing' ? dt : 0;

    if (G.Pad) G.Pad.poll(ts);   // MicaSurvivor (M2): controller, before the keyboard
    handleKeys();

    if (state === 'playing') update(dt);
    else if (state === 'levelup' || state === 'choice') G.Team.tick(Math.min(1 / 30, real));   // (M5 lote 7: como en el port)
    else if (pl && state !== 'ui') { G.FX.update(dt * 0.25); pl.anim.update(dt * 0.25); }
    // La red se atiende siempre (también con las cartas de nivel abiertas).
    if (G.Coop.active && pl && state !== 'ui' && state !== 'over') G.Coop.tick(dt);

    if (pl && state !== 'ui') render(); else Backdrop.render(ctx, w, h, dpr, dt);
    G.UI.tick(dt);

    G.Input.endFrame();
  }

  function update(dt) {
    const coop = G.Coop.active;
    if (flashT > 0) flashT -= dt;
    // MicaSurvivor (M5 lote 7, main.gd 1055): Modo Equipo, la espera entre cambios y la banca corren
    // siempre que no estés en pausa (también durante el Z, la Sentencia y las cartas: ver frame)
    G.Team.tick(dt);
    // La Sentencia de Arceus: mientras dura la animación, todo lo demás se para.
    if (G.Judgment.cinematic) {
      G.Judgment.cineTick(dt);
      pl.anim.update(dt);
      if (coop) for (const p of G.Coop.puppets()) p.netUpdate(dt);
      G.World.update(dt, G.Camera);
      G.FX.update(dt);
      G.Audio.music(G.Judgment.music);
      return;
    }
    // MicaSurvivor (M5 lote 4, main.gd 960): la cinemática del Movimiento Z para el mundo (y el reloj).
    if (G.ZMoves.cine) {
      G.ZMoves.cineTick(dt, pl);
      pl.anim.update(dt);
      G.Camera.follow(pl.x, pl.y, dt);
      G.World.update(dt, G.Camera);
      G.FX.update(dt);
      return;
    }
    // Tras caer, deja que se vea la animación de Faint antes del resumen.
    // (En la arena de la grieta no: allí caer sólo te echa de vuelta.)
    if (pl.dead && !coop && !G.Rift.inArena) {
      deathT += dt;
      pl.update(dt);
      G.EnemyMgr.update(dt * 0.3, pl);
      G.FX.update(dt);
      G.Camera.follow(pl.x, pl.y, dt);
      if (deathT > 1.3) { deathT = 0; endRun(true); }
      return;
    }
    time += dt;
    // MicaSurvivor (M5 lote 6, main.gd 966): la Contrarreloj de grietas acaba a los 8 minutos (fuera de la arena).
    if (G.Modes.checkTime(time)) { G.Audio.sfx('bossDown'); endRun(false); return; }

    // (M5 lote 8, main.gd 4705-4707: en el Rush cada 150 s desde un bioma al azar; en la Torre, uno por piso)
    const b = G.Tower.on ? G.Tower.floor - 1 : G.BossRush.on ? G.BossRush.biomeAt(time) : Math.floor(time / 240);
    if (b !== biome && !G.Rift.inArena && !G.Judgment.active) {
      biome = b;
      G.World.setBiome(b);
      G.Audio.sfx('biome');
      G.Spawner.say('— ' + G.World.biomeName() + ' —', 3);
      G.FX.ring(pl.x, pl.y, 10, G.Camera.outerRadius(), '#ffffff', 0.7, 6);
    }

    pl.frozen = coop && (G.UI.isOpen('scr-pause') || G.UI.isOpen('scr-item'));
    pl.update(dt);
    if (coop) {
      for (const p of G.Coop.puppets()) { p.netUpdate(dt); G.Combat.ghostOrbit(p, dt, time); }
      if (pl.dead) reviveTick(dt);
    }
    G.Camera.follow(pl.x, pl.y, dt);
    G.World.update(dt, G.Camera);

    const all = everyone();
    if (!coop || G.Coop.isHost) { G.Path.update(dt, all); G.Spawner.update(dt, all, time); }
    else G.Spawner.tickBanner(dt);
    G.EnemyMgr.update(dt, all);
    G.EnemyMgr.rebuildGrid();
    G.Combat.tick(dt, pl, time);
    G.Projectiles.update(dt, pl, G.EnemyMgr.all());
    G.Combat.resolve(dt, pl, time);
    G.Combat.updateFields(dt);
    G.ZMoves.update(dt, pl);        // MicaSurvivor (M5 lote 4): el Movimiento Z y su enfriamiento
    G.ZMoves.updateWorld(dt);
    G.Dynamax.update(dt, pl);       // MicaSurvivor (M5 lote 5): Dynamax (crecer, ondas Max, final) y su enfriamiento
    G.Pickups.update(dt, all, onCollect);
    G.Hazards.update(dt);
    G.Interact.update(dt, pl);
    // MicaSurvivor (M5 lote 8, main.gd 1007 / 3249-3253 / 5863): en el Rush de Jefes y la Torre no hay
    // grietas (ni guaridas), ni Sentencia de Arceus, ni eventos (hordas, hora dorada, duendes)
    if (!G.BossRush.on && !G.Tower.on) {
      G.Rift.update(dt, pl, time);
      G.Judgment.update(dt, pl, time);
      G.Events.update(dt, all, time);
    }
    G.Weather.update(dt, time, pl);
    G.Modes.healTick(pl);           // MicaSurvivor (M5 lote 6): "Sin curación"
    G.FX.update(dt);

    G.Audio.music(G.Judgment.active ? G.Judgment.music : G.Rift.inArena ? 'rift' : G.EnemyMgr.bossAlive() ? 'boss' : G.BIOME_MUSIC[biome % G.BIOME_MUSIC.length]);
    if (!coop || G.Coop.isHost) maybeLevelUp();
    if (pl.bonds > 0) offerBond(true);
    if (G.Coop.isHost) checkAllDown(dt);
  }

  /** Caído en grupo: un compañero a tu lado te va levantando. */
  function reviveTick(dt) {
    const helper = G.Coop.puppets().some(p => !p.dead && G.U.dist2(p.x, p.y, pl.x, pl.y) < 56 * 56);
    pl.reviveT = helper ? (pl.reviveT || 0) + dt : Math.max(0, (pl.reviveT || 0) - dt * 0.5);
    if (pl.reviveT >= G.Player.REVIVE_TIME) pl.revive(0.5);
  }

  /** Anfitrión: si caéis todos, se acaba (tras ver caer al último). */
  function checkAllDown(dt) {
    if (G.Rift.inArena || !G.Coop.players().every(p => p.dead)) { deathT = 0; return; }
    deathT += dt;
    if (deathT > 1.6) {
      deathT = 0;
      G.Coop.over(summary());
      endRun(true);
    }
  }

  // ---------------- dibujo ----------------

  function drawScene(cam, extra) {
    const t = performance.now() / 1000;
    G.World.drawGround(ctx, cam);
    G.World.drawLiquid(ctx, cam, t);
    G.Hazards.draw(ctx);
    G.Combat.drawGroundFields(ctx);
    G.Pickups.draw(ctx);

    // Todo lo que tiene "pies" se ordena por Y: objetos, enemigos, jugador.
    const items = [];
    // Los planos (manantiales, trampas) siempre debajo de todo lo demás.
    for (const p of G.World.visibleProps(cam)) items.push({ y: p.flat ? p.y - 4000 : p.y, prop: p });
    for (const e of G.EnemyMgr.drawables(cam)) items.push({ y: e.y, ent: e });
    for (const e of extra) items.push({ y: e.y, ent: e });
    const rift = G.Rift.drawable();
    if (rift) items.push({ y: rift.y, ent: rift });
    const arceus = pl && state !== 'ui' ? G.Judgment.drawable() : null;
    if (arceus) items.push({ y: arceus.y, ent: arceus });
    if (pl && state !== 'ui') for (const d of G.Events.drawables()) items.push({ y: d.y, ent: d });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.prop) G.World.drawProp(ctx, it.prop, t);
      else it.ent.draw(ctx);
    }
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.scale(G.Camera.scale, G.Camera.scale);
    G.Camera.apply(ctx);
    drawScene(G.Camera, G.Coop.active ? [pl, ...G.Coop.puppets()] : [pl]);
    G.Projectiles.draw(ctx);
    G.Combat.drawAirFields(ctx);
    G.FX.draw(ctx);
    G.ZMoves.drawWorld(ctx);        // MicaSurvivor (M5 lote 4): el fuego fatuo
    G.Dynamax.drawWorld(ctx);       // MicaSurvivor (M5 lote 5): la columna de luz de la guarida
    G.Judgment.drawAir(ctx);
    ctx.restore();

    G.Weather.draw(ctx, w, h, frameDt);
    G.World.drawVignette(ctx, w, h);
    // Niebla: la viñeta se cierra un poco (sin tapar el centro).
    const fog = G.Weather.vignette;
    if (fog > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62);
      g.addColorStop(0, 'rgba(200,205,220,0)');
      g.addColorStop(1, `rgba(200,205,220,${0.45 * fog})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    G.ZMoves.drawDim(ctx, w, h);    // MicaSurvivor (M5 lote 4): la pantalla se oscurece durante el Z
    if (!G.Judgment.cinematic) G.Dynamax.drawOverlay(ctx, w, h);   // MicaSurvivor (M5 lote 5): borde rojo, tiempo y cartel
    if (!G.Judgment.cinematic) G.HUD.draw(ctx, w, h, pl, st);
    G.ZMoves.drawCine(ctx, w, h);
    G.Judgment.drawOverlay(ctx, w, h);
    G.Touch.draw(ctx);
    if (G.Settings.get('fps')) {
      ctx.save();
      ctx.font = '700 11px Pixelify, monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = fpsShown >= 50 ? '#5fe08a' : fpsShown >= 30 ? '#ffd23f' : '#ff5f6d';
      ctx.fillText(fpsShown + ' FPS', w - 10, h - 8);
      ctx.restore();
    }
    if (flashT > 0) {
      ctx.save();
      // "Menos destellos": el fogonazo de pantalla se queda en un tercio.
      ctx.globalAlpha = Math.min(1, flashT / flashDur * 1.4) * (G.Settings.get('calm') ? 0.3 : 1);
      ctx.fillStyle = flashCol;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // ---------------- fondo de los menús ----------------

  /**
   * El mundo de verdad, con Pokémon salvajes paseando y la cámara a la deriva.
   * Así el menú enseña desde el primer segundo cómo se ve el juego.
   */
  const Backdrop = (() => {
    let wanderers = [], t = 0, ready = false, biomeT = 0, bi = 0;
    const CAST = [1, 4, 7, 25, 133, 52, 39, 35, 16, 43, 60, 69, 74, 92, 129, 147, 113, 143, 54, 79];

    function init() {
      G.World.reset(4242);
      G.World.setBiome(0, true);
      G.Camera.x = 0; G.Camera.y = 0;
      wanderers = CAST.map(dex => spawn(dex, true));
      ready = true;
    }

    function spawn(dex, anywhere) {
      const a = new G.Sprites.Animator(dex, 1);
      const r = G.Sprites.bodyRadius(dex);
      let x = 0, y = 0;
      for (let i = 0; i < 20; i++) {
        x = G.Camera.x + G.U.rand(-1, 1) * (anywhere ? G.Camera.w * 0.6 : G.Camera.w * 0.7);
        y = G.Camera.y + G.U.rand(-1, 1) * (anywhere ? G.Camera.h * 0.6 : G.Camera.h * 0.7);
        if (G.World.isFree(x, y, r)) break;
      }
      return { dex, anim: a, x, y, r, vx: 0, vy: 0, t: 0, draw(ctx) {
        G.Sprites.drawShadow(ctx, this.dex, this.x, this.y);
        this.anim.draw(ctx, this.x, this.y);
      } };
    }

    function step(dt) {
      t += dt;
      G.World.update(dt, G.Camera);
      // Deriva lenta de la cámara.
      G.Camera.x += Math.cos(t * 0.05) * 14 * dt;
      G.Camera.y += Math.sin(t * 0.037) * 10 * dt;
      G.Camera.follow(G.Camera.x, G.Camera.y, dt);

      biomeT += dt;
      if (biomeT > 30) { biomeT = 0; bi = (bi + 1) % 3; G.World.setBiome(bi); }

      for (const wd of wanderers) {
        wd.t -= dt;
        if (wd.t <= 0) {
          // Pasea, se para o "ataca" al aire de vez en cuando.
          wd.t = G.U.rand(1, 3.5);
          const r = Math.random();
          if (r < 0.55) {
            const a = Math.random() * 6.2832, s = G.U.rand(25, 55);
            wd.vx = Math.cos(a) * s; wd.vy = Math.sin(a) * s;
          } else {
            wd.vx = wd.vy = 0;
            if (r > 0.85) wd.anim.play(G.U.pick(['Attack', 'Shoot', 'Charge']));
          }
        }
        wd.x += wd.vx * dt; wd.y += wd.vy * dt;
        G.World.collide(wd);
        const moving = Math.abs(wd.vx) + Math.abs(wd.vy) > 1;
        if (moving) wd.anim.dir = G.Sprites.dirFromAngle(Math.atan2(wd.vy, wd.vx));
        wd.anim.loop(moving ? 'Walk' : 'Idle');
        wd.anim.update(dt);
        // Si se queda fuera de cámara, reaparece dentro.
        if (!G.Camera.sees(wd.x, wd.y, 120)) Object.assign(wd, spawn(wd.dex, false));
      }
    }

    function render(ctx, w, h, dpr, dt) {
      if (!ready) return;
      step(dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      ctx.scale(G.Camera.scale, G.Camera.scale);
      G.Camera.apply(ctx);
      drawScene(G.Camera, wanderers);
      ctx.restore();
      G.World.drawVignette(ctx, w, h);
    }

    /** Al volver de una run, recupera el mundo del menú. */
    function restore() {
      G.World.reset(4242);
      G.World.setBiome(bi, true);
      G.FX.clear(); G.Projectiles.clear(); G.Combat.clearFields(); G.EnemyMgr.clear(); G.Pickups.clear();
      wanderers = CAST.map(dex => spawn(dex, true));
    }

    return { init, render, restore };
  })();

  /**
   * MicaSurvivor (M5 lote 8): niveles gratis (la Torre: una mejora por piso saltado desde un punto de
   * control, main.gd 3338-3344; raise = false: sólo la carta, el "Entrenamiento" del descanso).
   */
  function grantLevels(n, raise = true) {
    if (!pl || n <= 0) return;
    if (raise) { pl.level += n; pl.xpNext = G.Player.xpFor(pl.level); }
    pendingLevels += n;
  }
  /** MicaSurvivor (M5 lote 8): una elección que para la partida (el descanso de la Torre), como el objeto. */
  function choiceStart() { if (state === 'playing' || state === 'held') state = 'choice'; }
  function choiceEnd() { if (state === 'choice') { state = holdBy.length ? 'held' : 'playing'; afterLevelUp(); } }

  return {
    init, startRun, everyone, levelXp, flash, offerBond, offerItem, grantLevels, choiceStart, choiceEnd, endRun,
    get pendingLevels() { return pendingLevels; },
    /** Para pruebas: recoge un objeto del suelo como si lo tocaras (monedas, objetos...). */
    debugCollect(p) { onCollect(p); },
    /** Para pruebas: salta el reloj de la run. */
    debugTime(t) { tampered = true; time = t; },
    /** Para grabar vídeos: cámara lenta (0,5 = mitad de velocidad). */
    debugSpeed(k) { if (k > 1) tampered = true; speedK = k; },
    togglePause,
    /** Abandona la partida en curso (p. ej. al cerrar sesión desde Ajustes). */
    quit() { if (state !== 'ui' && state !== 'over') quitRun(); },
    /** Para grabar vídeos: abre las cartas de subir de nivel. */
    debugLevelUp() { tampered = true; pl.level++; pendingLevels++; },
    toUI() { state = 'ui'; Backdrop.restore(); },
    /** MicaSurvivor (M5 lote 4): modo de la partida ('normal'; M5 lote 6: 'daily' | 'party' | 'rifts' | 'type'; lote 7: 'team'; lote 8: 'rush' | 'tower'). */
    get mode() { return runMode; }, set mode(m) { runMode = m || 'normal'; },
    get state() { return state; }, get player() { return pl; }, st
  };
})();

/* ============ Flow — transiciones entre pantallas ============ */
G.Flow = {
  boot() {
    G.UI.initChrome();
    G.LoginUI.init(); G.TestUI.init(); G.MenuUI.init(); G.GachaUI.init();
    G.SocialUI.init(); G.RankingUI.init(); G.ModUI.init(); G.ModesUI.init(); G.GoalsUI.init(); G.ProfileUI.init(); G.SettingsUI.init(); G.NewsUI.init();   // MicaSurvivor: no SupportUI (donations) / Updater (forced reloads)
    // Tu nombre arriba a la derecha abre tu perfil.
    document.getElementById('user-pill').onclick = () => G.GoalsUI.open('profile');
    G.Audio.music('village');     // suena tras el primer clic (lo exige el navegador)
    G.Game.init();
    // La base de datos (nube o local) recupera la sesión anterior.
    G.DB.ready().then(restored => {
      document.getElementById('boot').classList.add('hidden');
      G.MicaUI.decorate();   // MicaSurvivor (M3): Magepunk login button / way back / leaderboard label
      // En otra tarea: crear el sonido para comprobarlo cuesta ~60 ms y no debe bloquear la carga.
      setTimeout(() => this.tapToStart(() => { if (restored) this.afterLogin(); else this.toLogin(); }), 0);
    });
  },
  /**
   * "Pulsa para empezar": los navegadores no dejan que una web suene hasta
   * que se toca algo. Con esta pantalla la música empieza en cuanto entras.
   * (Si el navegador ya deja sonar, no sale.)
   */
  tapToStart(then) {
    G.Audio.unlock();
    if (G.Audio.canPlay()) { then(); return; }
    const el = document.getElementById('tap-start');
    el.classList.remove('hidden');
    const go = e => {
      if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      G.Audio.unlock();
      el.classList.add('hidden');
      el.removeEventListener('click', go); removeEventListener('keydown', go, true);
      then();
    };
    el.addEventListener('click', go);
    addEventListener('keydown', go, true);
  },
  toLogin() { G.Audio.music('village'); G.LoginUI.open(); },
  afterLogin() {
    G.Audio.music('village');
    // MicaSurvivor (M3): a guest save in this browser is offered to the Magepunk account, once.
    if (G.DB.carryOffer) { G.MicaUI.offerCarry(() => this.afterLogin()); return; }
    if (!G.DB.save.partner) G.TestUI.start();
    else this.goMenu();
  },
  goMenu() {
    if (G.Game.state !== 'ui') G.Game.toUI();
    G.Audio.music('village');
    G.MenuUI.open();
    G.LoginUI.offerRecovery();
  },
  /** Al cerrar el resumen: a la sala si sigues en una, si no al menú. */
  afterRun() {
    if (G.Social.room) {
      if (G.Game.state !== 'ui') G.Game.toUI();
      G.Audio.music('village');
      if (G.Social.room.isHost) G.Social.setOpen(true);
      G.LobbyUI.open();
    } else this.goMenu();
  },
  play(mode) { G.Game.startRun(null, mode); },   // MicaSurvivor (M5 lote 6): mode = un modo rápido (js/ui/modes-ui.js)
  /** Empieza la partida en grupo (el anfitrión la manda a todos). */
  startCoop(cfg) {
    if (G.Game.state !== 'ui' || !G.Social.room) return;
    G.LobbyUI.close();
    G.Game.startRun(cfg);
  }
};
