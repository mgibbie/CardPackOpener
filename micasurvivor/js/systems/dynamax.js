/* ============ dynamax.js — Dynamax y guaridas Dynamax (MicaSurvivor M5 lote 5) ============
 * Del port de Android de JayElDragon (MIT, github.com/JayElDragon/poke-survivor): dynamax.gd (todo:
 * números, tabla de estados, aura, cráter y columna de luz dibujados en código), main.gd 183-189
 * (estado), 383-385 (guaridas), 1226-1281 (enfriamiento, cuándo se puede, empezar / acabar),
 * 4216 / 4263 (el Movimiento Max del jefe), 5867-5870 (5 % por chequeo), 5903-5936 (abrir la
 * guarida), 5990-5996 (el jefe), 6037-6051 (gigante y con aura), 6189-6221 (el premio) y el HUD
 * draw_dyn 8430-8503 (botón MAX, barra de tiempo, borde rojo y el cartel "DYNAMAX").
 *
 *   Tu Pokémon se hace gigante 60 s: +30 % a todos sus atributos (daño ×1,3, velocidad ×1,3,
 *   recargas ÷1,3 y un 23,08 % menos de daño recibido) y +30 % de vida máxima (se quita al acabar,
 *   con la vida en la misma proporción). Crece a ×1,6 a saltos, como la seta gigante de Super Mario
 *   Bros DS. Cada 1,5 s lanza una onda Max de su tipo (radio 280; cada tercera, radio 420 y ×1,9)
 *   de (30 + 8 × nivel) × ataque, con el estado de su tipo (STATUS). Desde el nivel 20; 240 s de
 *   enfriamiento desde que acaba. No se puede en la Torre (modo 'tower', lote 8) ni en la Sentencia
 *   de Arceus; en la arena de una grieta o de una guarida, sí (como en el port). Caer lo termina;
 *   cambiar de Pokémon en el modo Equipo (lote 7) también: G.Dynamax.stop(pl).
 *
 *   Se desbloquea al vencer una guarida Dynamax (stats.dens >= 1, más stats.dynamax = 1; la fusión
 *   de partidas se queda con el mayor de cada stat: el desbloqueo nunca se pierde). Cada guarida
 *   vencida lo recarga al instante.
 *
 *   Guaridas: desde los 120 s de partida, cada chequeo de grieta (cada 30 s) tiene un 5 % de abrir
 *   una guarida en vez de una grieta (no en la Contrarreloj de grietas, modo 'rifts', lote 6).
 *   Abierta 30 s. Dentro, un Pokémon normal del tramo actual, gigante (×1,5) y con el aura roja,
 *   con 2400 + 8 × t de vida, que a veces lanza su Movimiento Max. Premio: 12 orbes de experiencia
 *   (380 + t en total), 2 objetos, 2 tickets, 120 monedas y una curación.
 *
 *   G.Dynamax.tryStart(pl)   tecla C, botón MAX del HUD (también táctil) y la acción `dynamax` del mando
 */
G.Dynamax = (() => {
  const COOLDOWN = 240;          // 4 minutos desde que acaba
  const DUR = 60;
  const MIN_LEVEL = 20;
  const GROW = 1.6;
  const STAT_K = 1.3;            // +30 % a todos los atributos mientras dura
  const HP_BONUS = 0.3;
  const DMG_K = 1.3;
  const TAKEN = 0.2308;          // 1 - 1/1,3: defensa +30 %
  const PULSE = 1.5;
  const FIRST_PULSE = 0.6;
  const PULSE_R = 280, BIG_R = 420, BIG_K = 1.9;
  // Efecto de estado de la onda según el tipo: [cc, veneno, lentitud]
  const STATUS = {
    fire: ['', 0, 0], water: ['', 0, 0.4], electric: ['para', 0, 0], ice: ['freeze', 0, 0], poison: ['', 1, 0],
    psychic: ['conf', 0, 0], ghost: ['sleep', 0, 0], fairy: ['conf', 0, 0], bug: ['', 0, 0.35], grass: ['', 1, 0], ground: ['', 0, 0.3]
  };
  // Crecimiento por pasos: [escala x, escala y, segundos] (cada uno parte del anterior, seno "out").
  const STEPS = [[1.22, 1.0, 0.14], [1.04, 1.04, 0.10], [1.42, 1.3, 0.16], [1.16, 1.2, 0.10], [GROW * 1.12, GROW * 1.12, 0.22], [GROW, GROW, 0.18]];
  const SHRINK = 0.35;
  const GROW_FX = [[0.14, 0.4], [0.40, 0.7], [0.72, 1.0]];
  const BLOCKED_MODES = ['tower'];        // la Torre (lote 8, js/systems/tower.js; main.gd 1267 _dyn_can: mode != "tower")
  const NO_DEN_MODES = ['rifts'];         // la Contrarreloj de grietas (lote 6, js/systems/modes.js)
  const DEN_RATE = 0.05, DEN_TTL = 30, DEN_FROM = 120;
  const DEN_SCALE = 1.5, DEN_MAXMOVE = 0.28;
  const DEN_REWARD = { orbs: 12, items: 2, tickets: 2, coins: 12, coinValue: 10, heal: 1 };
  const RED = '#ff3d6e';
  const AURA_COL = [0.9, 0.08, 0.25];

  // ======================= desbloqueo =======================
  const save = () => G.DB && G.DB.save;
  function unlocked(s = save()) {
    const st = (s && s.stats) || {};
    return (st.dens || 0) >= 1 || (st.dynamax || 0) >= 1;
  }

  // ======================= en la partida =======================
  let active = false, left = 0, since = 0, bonus = 0, pulse = 0, n = 0, type = 'normal', auraT = 0;
  let used = false, cd = 0, flash = 99, shrinkT = -1, shrinkFrom = [1, 1], fxDone = 0, owner = null;

  function reset() {
    const pl = owner;
    if (pl) { pl.dyn = false; pl.dynScale = null; }
    active = false; left = 0; since = 0; bonus = 0; pulse = 0; n = 0; type = 'normal'; auraT = 0;
    used = false; cd = 0; flash = 99; shrinkT = -1; shrinkFrom = [1, 1]; fxDone = 0; owner = null;
  }
  /** ¿Dónde no se puede? La Torre (modo) y la Sentencia de Arceus. (Las arenas, sí: main.gd _dyn_can.) */
  function blocked() {
    return BLOCKED_MODES.includes(G.Game && G.Game.mode) || !!(G.Judgment && G.Judgment.active);
  }
  function can(pl) {
    return !!pl && !pl.dead && !pl.coopDown && !pl.remote && !!G.Game && G.Game.state === 'playing' && !(G.Judgment && G.Judgment.cinematic)   // (M5 lote 12a: no mientras espectas, main.gd 1243 / 1267)
      && !(G.ZMoves && G.ZMoves.cine) && unlocked() && !used && !active && pl.level >= MIN_LEVEL && !blocked();
  }
  function tryStart(pl) {
    if (!can(pl)) return false;
    start(pl);
    return true;
  }
  const typeColor = t => (G.U.TYPE_COLOR && G.U.TYPE_COLOR[t]) || '#ff2a6d';
  function shake(s) {
    const k = G.Settings && G.Settings.get('calm') ? 0.25 : 1;
    G.Camera.shake = Math.min(1.2, Math.max(G.Camera.shake, s / 7 * k));
  }

  function start(pl) {
    used = true;
    active = true;
    owner = pl;
    left = DUR; since = 0; n = 0; pulse = FIRST_PULSE; auraT = 0; fxDone = 0; shrinkT = -1;
    flash = 0;
    // (el tipo del Pokémon ACTIVO, como el Z: en el modo Equipo es el que está jugando)
    type = (G.DEX_BY[pl.dex] && G.DEX_BY[pl.dex].types[0]) || (pl.mon && pl.mon.types && pl.mon.types[0]) || 'normal';
    bonus = Math.round(pl.maxHp * HP_BONUS);
    pl.maxHp += bonus;
    pl.hp += bonus;
    pl.dyn = true;
    pl.dynScale = [1, 1];
    pl.invuln = Math.max(pl.invuln, 1.2);
    shake(9);
    const col = typeColor(type);
    G.FX.ring(pl.x, pl.y, 10, 360, col, 0.7, 6);
    G.FX.ring(pl.x, pl.y, 10, 240, '#ffffff', 0.5, 4);
    G.FX.burst(pl.x, pl.y, col, 28, 260);
    G.Audio.sfx('legend');
  }

  /** Acaba (se agota, caes, o cambias de Pokémon en el modo Equipo): quita la vida extra en proporción. */
  function stop(pl = owner) {
    if (!active || !pl) return;
    active = false;
    cd = COOLDOWN;
    const mx = pl.maxHp, nm = Math.max(1, mx - bonus);
    if (pl.hp > 0) pl.hp = Math.max(1, Math.round(pl.hp * nm / Math.max(mx, 1)));
    pl.maxHp = nm;
    bonus = 0;
    pl.dyn = false;
    shrinkFrom = pl.dynScale ? pl.dynScale.slice() : [1, 1];
    shrinkT = 0;
    const col = typeColor(type);
    G.FX.ring(pl.x, pl.y, 10, 200, col, 0.5, 4);
    G.FX.burst(pl.x, pl.y, col, 14, 160);
  }

  /** Escala del sprite a los `s` segundos de empezar (los pasos de STEPS, seno "out"). */
  function scaleAt(s) {
    let from = [1, 1], t0 = 0;
    for (const [sx, sy, d] of STEPS) {
      if (s < t0 + d) {
        const k = Math.sin(((s - t0) / d) * Math.PI / 2);
        return [from[0] + (sx - from[0]) * k, from[1] + (sy - from[1]) * k];
      }
      from = [sx, sy]; t0 += d;
    }
    return [GROW, GROW];
  }

  /** Cada fotograma de juego (game.js): enfriamiento, crecimiento, aura, ondas y final. */
  function update(dt, pl) {
    if (flash < 99) flash += dt;
    if (!active && used && cd > 0) {
      cd -= dt;
      if (cd <= 0) {
        cd = 0; used = false;
        G.FX.dmgText(pl.x, pl.y - pl.bodyH - 20, '¡Dynamax listo!', '#ff5a8a', true);
      }
    }
    if (shrinkT >= 0 && owner) {
      shrinkT += dt;
      const k = Math.min(1, shrinkT / SHRINK), e = k * k;   // cuadrática "in"
      owner.dynScale = [shrinkFrom[0] + (1 - shrinkFrom[0]) * e, shrinkFrom[1] + (1 - shrinkFrom[1]) * e];
      if (k >= 1) { owner.dynScale = null; shrinkT = -1; }
    }
    if (!active) return;
    if (pl.dead) { stop(pl); return; }
    left -= dt;
    since += dt;
    pl.dynScale = scaleAt(since);
    while (fxDone < GROW_FX.length && since >= GROW_FX[fxDone][0]) growFx(pl, GROW_FX[fxDone++][1]);
    const col = typeColor(type);
    auraT -= dt;
    if (auraT <= 0) {
      auraT = 0.18;
      G.FX.burst(pl.x + G.U.rand(-26, 26), pl.y - 20, col, 2, 70);
    }
    pulse -= dt;
    if (pulse <= 0) {
      pulse = PULSE;
      n++;
      maxPulse(pl, n % 3 === 0);
    }
    if (left <= 0) stop(pl);
  }

  /** Destello y sonido de cada paso del crecimiento. */
  function growFx(pl, k) {
    pl.flash = 1;
    shake(4 + 5 * k);
    G.Audio.sfx('levelup');
    G.FX.ring(pl.x, pl.y, 8, 90 + 110 * k, '#ff99ab', 0.45, 4);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, '#ff4d73', Math.floor(10 + 14 * k), 220);
  }

  /** Onda Max: golpea a los enemigos cercanos con el tipo del Pokémon; cada tercera es más grande. */
  function maxPulse(pl, big) {
    const z = G.ZMoves.area(pl, type, pl.x, pl.y, (30 + 8 * pl.level) * pl.atk * (big ? BIG_K : 1));
    z.dsrc = 'dyna';   // MicaSurvivor (M5 lote 11): en el desglose de daño, a "Dynamax" (no al Movimiento Z)
    const r = big ? BIG_R : PULSE_R;
    z.boom(z.cx, z.cy, r, big ? 6 : 3);
    const st = STATUS[type] || ['', 0, 0];
    z.hit(z.cx, z.cy, r, 1, big ? 260 : 140, st[0], st[1], st[2]);
    if (big) z.ringBurst('star', 14, 40, 520, 0.5, 1.6);
    return z;
  }

  // ======================= guaridas =======================
  /** ¿Abre una guarida este chequeo de grieta? (main.gd 5867-5870) */
  function denRoll(time, rnd = Math.random) {
    if (NO_DEN_MODES.includes(G.Game && G.Game.mode)) return false;
    return time >= DEN_FROM && rnd() < DEN_RATE;
  }
  /** El Pokémon de la guarida: uno normal del tramo actual (main.gd _candidates(_tier_at(t))). */
  function denMon(t) {
    const E = G.Enemies;
    let ti = 0;
    E.TIERS.forEach((tr, i) => { if (t >= tr.from) ti = i; });
    const list = E.candidates(E.TIERS[ti]);
    return list.length ? G.U.pick(list) : null;
  }
  /** Las cifras del jefe: las del legendario de la grieta, con la vida y la experiencia de la guarida. */
  function denDef(base, t) {
    return Object.assign({}, base, { hp: Math.round(2400 + 8 * t), xp: Math.round(380 + t), dyna: true });
  }
  /** Gigante (×1,5, también su altura) y con el aura roja (main.gd 6042-6051). */
  function giant(e) {
    e.den = true;
    e.scale *= DEN_SCALE;
    if (e.anim) e.anim.scale *= DEN_SCALE;
    e.bodyH *= DEN_SCALE;
    G.FX.ring(e.x, e.y, e.r, e.r * 6, RED, 0.9, 5);
  }

  /**
   * Victoria en una guarida (main.gd _den_down): premio, el Caramelo Dynamax (recarga el Dynamax) y,
   * la primera vez, el desbloqueo. `drop`: quien manda suelta el premio (en grupo, el anfitrión).
   */
  function denDown(x, y, drop = true) {
    const s = save();
    let first = false;
    if (s && (!G.Modes || G.Modes.saves())) {   // (M5 lote 6: en el Modo Fiesta no se guarda)
      s.stats = s.stats || {};
      first = !unlocked(s);
      s.stats.dens = (s.stats.dens || 0) + 1;
      s.stats.dynamax = 1;
      if (G.DB.commit) G.DB.commit();
    }
    if (drop) {
      const xp = Math.round(380 + ((G.Game && G.Game.st && G.Game.st.time) || 0));
      const per = Math.ceil(xp / DEN_REWARD.orbs);
      for (let k = 0; k < DEN_REWARD.orbs; k++) G.Pickups.drop('xpBig', x + G.U.rand(-10, 10), y + G.U.rand(-10, 10), per);
      G.Pickups.drop('item', x + 24, y, G.Items.roll());
      G.Pickups.drop('item', x - 24, y, G.Items.roll());
      for (let k = 0; k < DEN_REWARD.tickets; k++) G.Pickups.drop('ticket', x + k * 10 - 5, y + 24, 1);
      for (let k = 0; k < DEN_REWARD.coins; k++) G.Pickups.drop('coin', x + G.U.rand(-12, 12), y + G.U.rand(-12, 12), DEN_REWARD.coinValue);
      G.Pickups.drop('heal', x, y - 24, 0);
      G.Pickups.pullAll();
    }
    used = false;
    cd = 0;
    G.Audio.sfx('bossDown');
    if (first) G.Spawner.say('¡Has desbloqueado el Dynamax! Botón MAX, tecla C o gatillo izquierdo (desde el nivel ' + MIN_LEVEL + ')', 4.2, true);
    else G.Spawner.say('¡Guarida superada! Caramelo Dynamax: puedes usar el Dynamax otra vez', 3.6, true);
    const pl = G.Game && G.Game.player;
    if (pl) {
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, 'DYNAMAX', RED, true);
      G.FX.ring(pl.x, pl.y, 8, 110, RED, 0.7, 5);
    }
    shake(12);
    return first;
  }

  // ======================= dibujo en el mundo =======================
  const TAU = Math.PI * 2;
  const rgba = (r, g, b, a) => `rgba(${Math.round(G.U.clamp(r, 0, 1) * 255)},${Math.round(G.U.clamp(g, 0, 1) * 255)},${Math.round(G.U.clamp(b, 0, 1) * 255)},${G.U.clamp(a, 0, 1).toFixed(3)})`;
  const hexf = hex => { const v = parseInt(hex.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; };
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const fmod = (v, m) => ((v % m) + m) % m;
  const raw = s => new String(s);   // eslint-disable-line no-new-wrappers

  /**
   * Aura roja del Pokémon Dynamax (dynamax.gd Aura): charco de luz, resplandor, niebla roja y violeta
   * que sube en espiral y chispas. (x, y) = los pies; h = altura del cuerpo; w = radio × 1,8.
   */
  function drawAura(ctx, x, y, h, w, t, col = AURA_COL) {
    const beat = 0.5 + 0.5 * Math.sin(t * 4);
    const cy = y - h * 0.5;
    ctx.save();
    ctx.fillStyle = rgba(col[0], col[1], col[2], 0.38 + 0.10 * beat);
    ctx.beginPath(); ctx.ellipse(x, y, w * (1.7 + 0.12 * beat), w * 0.55, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const k = i / 3;
      ctx.fillStyle = rgba(col[0], col[1] + 0.3 * k, col[2] + 0.2 * k, 0.07 + 0.03 * k);
      ctx.beginPath(); ctx.arc(x, cy, Math.max(w, h * 0.5) * (1.55 - k * 0.55) + beat * 4, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 14; i++) {
      const ph = fmod(t * 0.55 + i * 0.0714, 1);
      const a2 = t * 1.6 + i * 0.9;
      const rr = w * (0.9 + 0.35 * Math.sin(t * 2 + i));
      const px = x + Math.cos(a2) * rr, py = cy + h * 0.55 - ph * h * 1.25 + Math.sin(a2) * rr * 0.3;
      const c = lerp3(col, [0.5, 0.1, 0.7], 0.5 + 0.5 * Math.sin(i));
      ctx.fillStyle = rgba(c[0], c[1], c[2], Math.sin(ph * Math.PI) * 0.45);
      ctx.beginPath(); ctx.arc(px, py, 4 + 6 * (1 - ph) + 2 * beat, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 9; i++) {
      const ph2 = fmod(t * 0.9 + i * 0.111, 1);
      const xx = x + Math.sin(i * 7.3 + t * 1.7) * w * 1.1, yy = cy + h * 0.5 - ph2 * h * 1.5;
      const sz = 2 + 2 * (1 - ph2);
      ctx.fillStyle = rgba(1, 0.85, 0.9, Math.sin(ph2 * Math.PI) * 0.9);
      ctx.fillRect(xx - sz / 2, yy - sz / 2, sz, sz);
    }
    ctx.restore();
  }

  const sn = v => Math.round(v / 3) * 3;
  const hs = (i, k) => fmod(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453, 1);
  function ringPath(ctx, x, y, rx, ry, jag, seed, nn = 26) {
    ctx.beginPath();
    for (let i = 0; i < nn; i++) {
      const a = TAU * i / nn, r = 1 + (hs(i, seed) - 0.5) * jag;
      const px = x + sn(Math.cos(a) * rx * r), py = y + sn(Math.sin(a) * ry * r);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  function poly(ctx, x, y, pts, fill) {
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px, y + py) : ctx.moveTo(x + px, y + py)));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  const CRYSTAL_ORDER = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => Math.sin(TAU * a / 7 + 0.5) - Math.sin(TAU * b / 7 + 0.5));

  /** Guarida Dynamax (dynamax.gd Den): cráter rocoso con cristales rojos y un foso de energía que late. */
  function drawDen(ctx, x, y, t, alpha = 1) {
    const beat = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.save();
    ctx.globalAlpha = alpha;
    ringPath(ctx, x, y, 86, 34, 0, 1, 30); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
    ringPath(ctx, x, y, 76, 30, 0.22, 3); ctx.fillStyle = '#2f2024'; ctx.fill();
    ringPath(ctx, x, y, 70, 26, 0.18, 5); ctx.fillStyle = '#4a3438'; ctx.fill();
    ringPath(ctx, x, y, 60, 22, 0.12, 7); ctx.fillStyle = '#17081c'; ctx.fill();
    ringPath(ctx, x, y, 48, 17, 0.10, 9); ctx.fillStyle = rgba(0.55, 0.05, 0.22, 0.95); ctx.fill();
    ringPath(ctx, x, y, 36, 12, 0.10, 11); ctx.fillStyle = rgba(1, 0.18, 0.4, 0.75 + 0.2 * beat); ctx.fill();
    ringPath(ctx, x, y, 22, 7, 0.08, 13); ctx.fillStyle = rgba(1, 0.7, 0.8, 0.8 + 0.2 * beat); ctx.fill();
    ctx.strokeStyle = rgba(1, 0.85, 0.9, 0.7); ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const a0 = t * 1.8 + TAU * i / 3;
      ctx.beginPath(); ctx.arc(x, y, 30, a0, a0 + 1.4); ctx.stroke();
    }
    // rocas sueltas en el borde
    for (let i = 0; i < 9; i++) {
      const a1 = TAU * i / 9 + 0.3, bx = sn(Math.cos(a1) * 72), by = sn(Math.sin(a1) * 28), rs = 6 + hs(i, 21) * 7;
      poly(ctx, x + bx, y + by, [[-rs, 0], [-rs * 0.4, -rs], [rs * 0.6, -rs * 0.8], [rs, 0]], '#5d4448');
      poly(ctx, x + bx, y + by, [[-rs * 0.4, -rs], [rs * 0.6, -rs * 0.8], [rs * 0.1, -rs * 0.3]], '#7a5c60');
    }
    // cristales rojos (los de atrás primero)
    const lit = lerp3(hexf('#ff3d6a'), hexf('#ff8aa6'), 0.3 * beat);
    for (const idx of CRYSTAL_ORDER) {
      const a2 = TAU * idx / 7 + 0.5, bx = x + sn(Math.cos(a2) * 68), by = y + sn(Math.sin(a2) * 26);
      const hh = 30 + hs(idx, 33) * 26, wd = 9 + hs(idx, 35) * 5, tilt = (hs(idx, 37) - 0.5) * 14;
      const top = [tilt, -hh];
      ctx.fillStyle = rgba(1, 0.2, 0.4, 0.05 + 0.04 * beat);
      ctx.beginPath(); ctx.arc(bx + tilt * 0.5, by - hh * 0.5, hh * 0.8, 0, TAU); ctx.fill();
      poly(ctx, bx, by, [[-wd, 0], [-wd * 0.8, -hh * 0.65], top, [0, 0]], '#b3103a');
      poly(ctx, bx, by, [[0, 0], top, [wd * 0.8, -hh * 0.65], [wd, 0]], rgba(lit[0], lit[1], lit[2], 1));
      poly(ctx, bx, by, [top, [wd * 0.8, -hh * 0.65], [wd * 0.25, -hh * 0.6]], '#ffd0dc');
    }
    ctx.restore();
  }

  /** Columna de luz roja de la guarida (dynamax.gd Pillar): haz con núcleo claro, anillos que suben y chispas (suma de luz). */
  function drawPillar(ctx, x, y, t, alpha = 1) {
    const beat = 0.5 + 0.5 * Math.sin(t * 3);
    const hgt = 1100;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    for (const [w0, al, c] of [[70, 0.14, [1, 0.15, 0.3]], [46, 0.22, [1, 0.25, 0.4]], [28, 0.34, [1, 0.45, 0.58]], [14, 0.55, [1, 0.85, 0.9]]]) {
      const w = w0 + beat * 5;
      const g = ctx.createLinearGradient(0, y, 0, y - hgt);
      g.addColorStop(0, rgba(c[0], c[1], c[2], al));
      g.addColorStop(1, rgba(c[0], c[1], c[2], 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.5, y); ctx.lineTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.3, y - hgt); ctx.lineTo(x - w * 0.3, y - hgt);
      ctx.closePath(); ctx.fill();
    }
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const ph = fmod(t * 0.35 + i / 6, 1), rx = 26 + 14 * ph;
      ctx.strokeStyle = rgba(1, 0.7, 0.8, (1 - ph) * 0.55);
      ctx.beginPath(); ctx.ellipse(x, y - ph * 520, rx, rx * 0.3, 0, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = rgba(1, 0.3, 0.45, 0.22);
    ctx.beginPath(); ctx.ellipse(x, y, 58 + beat * 6, (58 + beat * 6) * 0.32, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(1, 0.7, 0.8, 0.25);
    ctx.beginPath(); ctx.ellipse(x, y, 34, 34 * 0.32, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 26; i++) {
      const ph2 = fmod(t * 0.45 + i * 0.0385, 1);
      const xx = Math.sin(i * 5.1 + t * 1.3) * (16 + 12 * ph2), sz = i % 3 === 0 ? 4 : 3;
      ctx.fillStyle = rgba(1, 0.9, 0.93, (1 - ph2) * 0.9);
      ctx.fillRect(x + Math.round(xx / 3) * 3, y + Math.round(-ph2 * 760 / 3) * 3, sz, sz);
    }
    ctx.restore();
  }

  /** La columna de la guarida abierta, por encima de todo (game.js, tras los efectos). */
  function drawWorld(ctx) {
    const r = G.Rift && G.Rift.rift;
    if (r && r.den) drawPillar(ctx, r.x, r.y, r.t, Math.min(1, r.t * 2) * Math.min(1, r.ttl / 1.5));
  }

  // ======================= pantalla (main.gd draw_dyn) =======================
  const F = (wt, s) => `${wt} ${Math.round(s)}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  function bounce(x) {
    const n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) { x -= 1.5 / d1; return n1 * x * x + 0.75; }
    if (x < 2.5 / d1) { x -= 2.25 / d1; return n1 * x * x + 0.9375; }
    x -= 2.625 / d1; return n1 * x * x + 0.984375;
  }

  /** Borde rojo, barra de tiempo y el cartel "DYNAMAX" que cae letra a letra (debajo del resto del HUD). */
  function drawOverlay(ctx, w, h) {
    if (!active && flash >= 2.7) return;
    const beat = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    const calm = G.Settings && G.Settings.get('calm');
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    if (active) {
      const a = 0.10 + 0.06 * beat, th = 26;
      ctx.fillStyle = `rgba(255,26,77,${a.toFixed(3)})`;
      ctx.fillRect(0, 0, w, th); ctx.fillRect(0, h - th, w, th);
      ctx.fillRect(0, th, th, h - 2 * th); ctx.fillRect(w - th, th, th, h - 2 * th);
      // (el port la pone arriba, a 62 px; aquí arriba están el reloj, el aviso y la barra del jefe:
      // va abajo, encima de la barra de movimientos)
      const bw = Math.max(120, Math.min(360, w - 380)), x0 = w / 2 - bw / 2, fr = G.U.clamp(left / DUR, 0, 1), by = h - 126;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x0 - 2, by, bw + 4, 20);
      ctx.fillStyle = fr > 0.25 ? RED : '#ffb347'; ctx.fillRect(x0, by + 2, bw * fr, 16);
      ctx.font = F(800, 14); ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      const lbl = raw('DYNAMAX  ' + Math.ceil(left) + ' s');
      ctx.strokeText(lbl, w / 2, by - 4); ctx.fillText(lbl, w / 2, by - 4);
    }
    if (flash < 2.7) {
      const fl = G.U.clamp(1 - flash / 0.25, 0, 1);
      if (fl > 0) { ctx.fillStyle = `rgba(255,153,179,${(0.45 * fl * (calm ? 0.3 : 1)).toFixed(3)})`; ctx.fillRect(0, 0, w, h); }
      const al = G.U.clamp((2.7 - flash) / 0.5, 0, 1);
      const k = G.U.clamp(Math.min(w / 1280, h / 720), 0.5, 1.4);
      const fs = 84 * k, word = 'DYNAMAX';
      ctx.font = F(800, fs); ctx.textAlign = 'left';
      const widths = [...word].map(ch => ctx.measureText(raw(ch)).width + 3 * k);
      const tw = widths.reduce((a, b) => a + b, 0);
      const by = h * 0.30;
      const shine = (flash - 0.9) / 0.9 * (tw + 160) - 80;
      let cx = w / 2 - tw / 2;
      const x00 = cx;
      for (let i = 0; i < word.length; i++) {
        const loc = flash - 0.35 - i * 0.08, cw = widths[i];
        if (loc >= 0) {
          const kk = G.U.clamp(loc / 0.55, 0, 1);
          const drop = (1 - bounce(kk)) * 190 * k;
          const sc = 1 + 0.35 * Math.max(0, 1 - loc / 0.25);
          const wave = Math.sin(flash * 5 - i * 0.7) * 5 * k * G.U.clamp((flash - 1.2) / 0.3, 0, 1);
          const ox = cx + cw / 2, oy = by - drop + wave;
          const base = lerp3(hexf('#ff2f63'), hexf('#ffd6e0'), G.U.clamp(i / 6 + 0.15 * Math.sin(flash * 6 - i), 0, 1));
          ctx.save();
          ctx.translate(ox, oy); ctx.scale(sc, sc);
          const ch = raw(word[i]);
          ctx.lineJoin = 'round';
          ctx.lineWidth = 16 * k; ctx.strokeStyle = rgba(0.22, 0, 0.1, 0.92 * al);
          ctx.strokeText(ch, -cw / 2, 6);
          ctx.fillStyle = rgba(0.55, 0, 0.2, 0.9 * al); ctx.fillText(ch, -cw / 2 + 3, 9);
          ctx.fillStyle = rgba(base[0], base[1], base[2], al); ctx.fillText(ch, -cw / 2, 6);
          const sh = G.U.clamp(1 - Math.abs(cx + cw / 2 - x00 - shine) / 55, 0, 1);
          if (sh > 0) { ctx.fillStyle = rgba(1, 1, 1, sh * 0.9 * al); ctx.fillText(ch, -cw / 2, 6); }
          ctx.restore();
          if (loc < 0.45) {
            const burst = 1 - loc / 0.45;
            ctx.fillStyle = rgba(1, 0.85, 0.9, burst * al);
            for (let q = 0; q < 5; q++) {
              const ang = q * 1.256 + i;
              ctx.beginPath(); ctx.arc(ox + Math.cos(ang) * loc * 260 * k, by - 28 * k + Math.sin(ang) * loc * 260 * k, 3 * burst + 1, 0, TAU); ctx.fill();
            }
          }
        }
        cx += cw;
      }
    }
    ctx.restore();
  }

  /** El botón MAX: encima del botón del Movimiento Z. */
  function buttonRect(w, h) {
    const z = G.ZMoves.buttonRect(w, h);
    return { x: z.x, y: z.y - z.s - 30, s: z.s };
  }
  /**
   * Botón MAX (main.gd draw_dyn): late cuando está listo; gris con "Nv. 20", la cuenta atrás del
   * enfriamiento o "Aquí no" (Sentencia). Oculto sin desbloquear, en la Torre y mientras dura.
   * Se pulsa con el dedo o el ratón; con mando, el icono del botón de `dynamax`; con teclado, la C.
   */
  function drawButton(ctx, w, h, pl) {
    if (!unlocked() || active || BLOCKED_MODES.includes(G.Game.mode)) return null;
    const r = buttonRect(w, h), c = { x: r.x + r.s / 2, y: r.y + r.s / 2 };
    const lvlOk = pl.level >= MIN_LEVEL, here = !blocked();
    const ready = !used && lvlOk && here;
    const beat = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    const R = 30;
    ctx.save();
    if (ready) { ctx.fillStyle = `rgba(255,61,110,${(0.25 + beat * 0.25).toFixed(3)})`; ctx.beginPath(); ctx.arc(c.x, c.y, R + 4 + beat * 4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(36,8,18,.88)';
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = ready ? RED : 'rgb(128,133,148)';
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.stroke();
    ctx.textAlign = 'center';
    const cool = used && cd > 0;
    ctx.font = F(800, cool ? 15 : 18);
    ctx.fillStyle = ready ? '#ffffff' : 'rgb(153,158,173)';
    ctx.fillText(raw('MAX'), c.x, c.y + (cool ? 1 : 6));
    if (cool) { ctx.font = F(700, 11); ctx.fillStyle = 'rgb(217,224,242)'; ctx.fillText(G.U.mmss(cd), c.x, c.y + 15); }
    const label = !cool && !lvlOk ? 'Nv. ' + MIN_LEVEL : !cool && !here ? 'Aquí no' : '';
    if (label) {
      ctx.font = F(700, 11); ctx.fillStyle = 'rgb(191,199,217)';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(label, c.x, r.y + r.s + 12); ctx.fillText(label, c.x, r.y + r.s + 12);
    }
    // lo que se pulsa: el botón del mando o la tecla C
    if (G.Pad && G.Pad.mode === 'pad') G.Pad.drawGlyph(ctx, 'dynamax', r.x - 4, r.y - 4, 22);
    else if (!G.Touch.active) {
      ctx.fillStyle = 'rgba(10,16,28,.9)'; ctx.fillRect(r.x - 2, r.y - 2, 17, 17);
      ctx.strokeStyle = 'rgba(244,248,255,.7)'; ctx.lineWidth = 1; ctx.strokeRect(r.x - 1.5, r.y - 1.5, 16, 16);
      ctx.font = '700 11px Arial,Helvetica,sans-serif'; ctx.fillStyle = '#f4f8ff'; ctx.fillText(raw('C'), r.x + 6.5, r.y + 10);
    }
    ctx.restore();
    G.Touch.addButton(r.x, r.y, r.s, r.s, () => { if (!tryStart(pl)) G.Audio.sfx('error'); }, 6);
    return r;
  }

  return {
    COOLDOWN, DUR, MIN_LEVEL, GROW, STAT_K, HP_BONUS, DMG_K, TAKEN, PULSE, FIRST_PULSE, PULSE_R, BIG_R, BIG_K, STATUS, STEPS,
    BLOCKED_MODES, NO_DEN_MODES, DEN_RATE, DEN_TTL, DEN_FROM, DEN_SCALE, DEN_MAXMOVE, DEN_REWARD, RED,
    unlocked, reset, can, tryStart, start, stop, update, scaleAt, blocked, maxPulse,
    denRoll, denMon, denDef, giant, denDown,
    drawAura, drawDen, drawPillar, drawWorld, drawOverlay, drawButton, buttonRect,
    get active() { return active; }, get left() { return left; }, get used() { return used; }, get cd() { return cd; },
    get bonus() { return bonus; }, get pulses() { return n; }, get type() { return type; }, get since() { return since; }, get flash() { return flash; }
  };
})();
