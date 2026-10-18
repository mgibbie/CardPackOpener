/* ============ zmoves.js — Movimientos Z (MicaSurvivor M5 lote 4) ============
 * Del port de Android de JayElDragon (MIT, github.com/JayElDragon/poke-survivor): zmove.gd (datos,
 * utilidades, las 18 coreografías, los efectos continuos y el fuego fatuo dibujado en código),
 * main.gd 171-182 / 1226-1322 (estado, enfriamiento, cinemática), 8504-8594 (el cartel y el
 * botón del HUD), save_data.gd 250-266 / 479-551 (tipo por Pokémon, cristal del gacha),
 * progress.gd 233-289 (las 18 misiones de Cristal Z) y menu.gd (Pokédex, misiones).
 *
 *   Un ataque final por tipo, con su propia coreografía. Desde el nivel 15; tras usarlo, 240 s de
 *   enfriamiento que empiezan a contar cuando el movimiento TERMINA. Primero 2,2 s de cinemática
 *   (el mundo se para y la pantalla se oscurece), luego el movimiento; invulnerable todo el rato.
 *   Daño base (100 + 24 × nivel) × ataque, que pasa por el mismo golpe que el resto
 *   (G.Combat.land: tipos, crítico, habilidad, objetos). Un Z no puede quitar a un jefe más del
 *   28 % de su vida máxima en total. No se puede en la Torre (modo 'tower', lote 8), en la arena
 *   de una grieta ni en la Sentencia de Arceus.
 *
 *   Se desbloquea el de un tipo con: 250 Pokémon de ese tipo derrotados (stats.tk_<tipo>, lote 1),
 *   su misión de Cristal Z (save.zmis[id]) o un cristal del gacha (3 % por tirada ×10, sólo de
 *   tipos aún bloqueados). El cristal se apunta como stats.zcr_<tipo> = 1, como en el port: la
 *   fusión de partidas (db.js merge) se queda con el mayor de cada stat, así que es una unión.
 *   Un Pokémon de dos tipos con los dos desbloqueados elige cuál en la Pokédex
 *   (save.pz[dex] = { type, at }; al fusionar gana la elección más reciente).
 *
 *   Arreglo respecto al port: el tipo se lee del Pokémon ACTIVO al usarlo (el port lo fijaba al
 *   empezar la partida); así el modo Equipo (lote 7) no tiene que hacer nada.
 *
 *   G.ZMoves.tryStart(pl)   tecla Z, botón del HUD (también táctil) y la acción `zmove` del mando
 *   G.ZMoves.cineTick / update / updateWorld / drawWorld / drawDim / drawCine / drawButton
 *   (los llama game.js / hud.js)
 */
G.ZMoves = (() => {
  const ORDER = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
  const NEED = 250;           // derrotados de un tipo para desbloquear su Z
  const COOLDOWN = 240;       // 4 minutos desde que acaba el movimiento
  const MIN_LEVEL = 15;
  const CINE_T = 2.2;
  const BOSS_CAP = 0.28;      // tope contra un jefe: el 28 % de su vida máxima por Z
  const CRYSTAL_P = 0.03;     // cristal Z por tirada ×10
  const ZMIS_COINS = 500;
  const BLOCKED_MODES = ['tower'];   // la Torre (lote 8, js/systems/tower.js; main.gd 1243 _z_can: mode != "tower")
  const DEF = {
    normal: { name: 'Carrera Estelar', desc: 'Embistes tres veces a toda velocidad contra los enemigos, atravesando todo a tu paso.' },
    fire: { name: 'Hecatombe Pirotécnica', desc: 'Una lluvia de bolas de fuego cae sobre los enemigos.' },
    water: { name: 'Hidrovórtice Abisal', desc: 'Un vórtice gigante arrastra a los enemigos hacia el centro y una ola final los lanza lejos.' },
    electric: { name: 'Tormenta Gigavoltio', desc: 'Tres rayos saltan de enemigo en enemigo en cadena y los paralizan, cada vez más fuertes.' },
    grass: { name: 'Floración Cataclísmica', desc: 'Raíces inmovilizan a los enemigos, los estrangulan y al florecer te curan por cada uno.' },
    ice: { name: 'Cero Absoluto', desc: 'Congela a todos los enemigos de la pantalla y un golpe final los rompe a la vez.' },
    fighting: { name: 'Aplastamiento Total', desc: 'Te lanzas contra el enemigo más fuerte y le das una ráfaga de golpes con un gancho final devastador.' },
    poison: { name: 'Diluvio Ácido', desc: 'Charcos ácidos aparecen entre los enemigos y los envenenan mientras estén dentro.' },
    ground: { name: 'Furia Tectónica', desc: 'Grietas se abren desde ti en todas direcciones y aplastan a los que están sobre ellas.' },
    flying: { name: 'Picado Supersónico', desc: 'Desapareces en el cielo y caes en picado sobre el mayor grupo de enemigos.' },
    psychic: { name: 'Mente Quebrada', desc: 'Los enemigos quedan confundidos y se atacan entre ellos.' },
    bug: { name: 'Plaga Devastadora', desc: 'Un enjambre de insectos persigue por su cuenta a los enemigos, uno por objetivo.' },
    rock: { name: 'Alud Continental', desc: 'Una avalancha de rocas arrasa la pantalla de un lado a otro empujando todo a su paso.' },
    ghost: { name: 'Pesadilla Eterna', desc: 'Drenas las almas de los enemigos: pierden vida según su salud y tú te curas.' },
    dragon: { name: 'Cataclismo Dracónico', desc: 'Cuatro rayos dracónicos giran rapidísimo a tu alrededor mientras eres invencible.' },
    dark: { name: 'Eclipse Abismal', desc: 'La oscuridad se cierra sobre ti en un círculo que se contrae y termina en una implosión.' },
    steel: { name: 'Taladro Metálico', desc: 'Perforas en línea recta a través de todo con un taladro de acero y rematas con una explosión.' },
    fairy: { name: 'Destello Ensueño', desc: 'Duermes a todos los enemigos y te curas; al final devoras sus sueños y recibes más cura por cada uno.' }
  };
  // Misiones de Cristal Z (progress.gd ZMIS): [tipo, texto, stat, meta]. Las de modos leen el stat que
  // escribe cada modo: el Desafío diario y la Supervivencia por tipo desde el lote 6 (js/systems/modes.js),
  // el Equipo desde el lote 7, y el Rush de Jefes (Bicho: rushBest) y la Torre (Roca: towerBest) desde el lote 8.
  const ZMIS = [
    ['normal', 'Derrota a 1.500 Pokémon en total.', 'totalKills', 1500],
    ['fire', 'Aguanta 8 minutos en una partida.', 'bestMin', 8],
    ['water', 'Juega 15 partidas.', 'runs', 15],
    ['electric', 'Llega al nivel 25 en una partida.', 'bestLevel', 25],
    ['grass', 'Abre 25 cofres.', 'chests', 25],
    ['ice', 'Haz 30 tiradas en el gacha.', 'pulls', 30],
    ['fighting', 'Derrota a 10 jefes.', 'bossesTotal', 10],
    ['poison', 'Evoluciona 10 movimientos.', 'evolutions', 10],
    ['ground', 'Consigue 30 Pokémon.', 'own', 30],
    ['flying', 'Juega 5 Desafíos diarios.', 'dailyPlays', 5],
    ['psychic', 'Encuentra 10 objetos distintos.', 'itemsFound', 10],
    ['bug', 'Derrota a 4 jefes en el Rush de Jefes.', 'rushBest', 4],
    ['rock', 'Supera el piso 8 de la Torre de pisos.', 'towerBest', 8],
    ['ghost', 'Gana 5 peleas en grietas.', 'riftWins', 5],
    ['dragon', 'Aguanta 12 minutos en una partida.', 'bestMin', 12],
    ['dark', 'Vence a 3 legendarios distintos.', 'legends', 3],
    ['steel', 'Aguanta 8 minutos en Supervivencia por tipo.', 'typeBestMin', 8],
    ['fairy', 'Aguanta 8 minutos en Modo Equipo.', 'teamBestMin', 8]
  ].map(([type, desc, stat, goal]) => ({ id: 'zc_' + type, type, desc, stat, goal }));

  // ======================= desbloqueos =======================
  const save = () => G.DB && G.DB.save;
  const statsOf = s => (s && s.stats) || {};
  /** ¿Tiene desbloqueado el Z de `type`? (250 derrotados de ese tipo o su cristal) */
  function unlocked(type, s = save()) {
    const st = statsOf(s);
    return (st['tk_' + type] || 0) >= NEED || (st['zcr_' + type] || 0) >= 1;
  }
  const unlockedList = (s = save()) => ORDER.filter(t => unlocked(t, s));
  /** Tipos de un Pokémon con el Z desbloqueado (save_data.gd zm_types). */
  function typesFor(dex, s = save()) {
    const p = G.DEX_BY[dex];
    return p ? p.types.filter(t => DEF[t] && unlocked(t, s)) : [];
  }
  /** El Z de un Pokémon: el elegido en la Pokédex, o el primero de sus tipos desbloqueados. */
  function typeFor(dex, s = save()) {
    const l = typesFor(dex, s);
    if (!l.length) return '';
    const c = s && s.pz && s.pz[dex];
    return c && l.includes(c.type) ? c.type : l[0];
  }
  /** Elige el Z de un Pokémon de dos tipos (Pokédex). */
  function choose(dex, type) {
    const s = save();
    if (!s || !typesFor(dex, s).includes(type)) return false;
    s.pz = s.pz || {};
    s.pz[dex] = { type, at: Date.now() };
    G.DB.commit();
    return true;
  }
  /** Apunta un cristal Z (stats.zcr_<tipo>, como el port). */
  function grantCrystal(s, type) { s.stats = s.stats || {}; s.stats['zcr_' + type] = 1; }

  /** Cristal Z de una tirada (save_data.gd pull): sólo en las de 10, un 3 %, de un tipo aún bloqueado. */
  function rollCrystal(s, n, rnd = Math.random) {
    if (!s || n < 10 || !(rnd() < CRYSTAL_P)) return '';
    const locked = ORDER.filter(t => !unlocked(t, s));
    if (!locked.length) return '';
    const t = locked[Math.min(locked.length - 1, Math.floor(rnd() * locked.length))];
    grantCrystal(s, t);
    return t;
  }

  // ---------------- misiones de Cristal Z ----------------
  function stat(name, s = save()) {
    const st = statsOf(s);
    switch (name) {
      case 'own': return Object.keys((s && s.owned) || {}).length;
      case 'bestMin': return Math.floor((st.bestTime || 0) / 60);
      case 'itemsFound': return Object.keys((s && s.itemsFound) || {}).length;
      case 'legends': return Object.keys((s && s.legends) || {}).length;
      default: return st[name] || 0;
    }
  }
  const zdone = (zm, s = save()) => !!(s && ((s.zmis && s.zmis[zm.id]) || (statsOf(s)['zcr_' + zm.type] || 0) >= 1));
  /** Da las misiones cumplidas (progress.gd zcheck): cristal + 500 monedas + aviso. */
  function zcheck(s = save()) {
    if (!s) return 0;
    s.zmis = s.zmis || {};
    let n = 0;
    for (const zm of ZMIS) {
      if (s.zmis[zm.id] || stat(zm.stat, s) < zm.goal) continue;
      s.zmis[zm.id] = Date.now();
      grantCrystal(s, zm.type);
      s.coins = (s.coins || 0) + ZMIS_COINS;
      n++;
      if (G.Progress && G.Progress.notify) G.Progress.notify('¡Cristal Z: ' + DEF[zm.type].name + '!', 'Movimiento Z desbloqueado · +' + ZMIS_COINS + ' monedas', null);
    }
    if (n && G.DB.commit) G.DB.commit();
    return n;
  }

  // ======================= en la partida =======================
  let state = '', t = 0, used = false, cd = 0, fx = null, ztype = '';
  let wisps = [];

  function reset() {
    state = ''; t = 0; used = false; cd = 0; fx = null; ztype = ''; wisps = [];
    const pl = G.Game && G.Game.player;
    if (pl) pl.zHidden = false;
  }
  const busy = () => state !== '';
  /** ¿Dónde no se puede? La Torre (modo), la arena de una grieta y la Sentencia de Arceus. */
  function blocked() {
    return BLOCKED_MODES.includes(G.Game && G.Game.mode) || !!(G.Rift && G.Rift.inArena) || !!(G.Judgment && G.Judgment.active);
  }
  /** El Z del Pokémon ACTIVO, leído ahora (el port lo fijaba al empezar la partida). */
  const activeType = pl => (pl ? typeFor(pl.dex) : '');
  function can(pl) {
    return !!pl && !pl.dead && !pl.remote && !!G.Game && G.Game.state === 'playing' && !(G.Judgment && G.Judgment.cinematic)
      && state === '' && !used && pl.level >= MIN_LEVEL && !!activeType(pl) && !blocked();
  }
  function tryStart(pl) {
    if (!can(pl)) return false;
    start(pl);
    return true;
  }
  function start(pl) {
    ztype = activeType(pl);
    used = true;
    state = 'cine';
    t = 0;
    pl.invuln = 5;
    G.Audio.sfx('legend');
    G.FX.ring(pl.x, pl.y, 10, 220, G.U.TYPE_COLOR[ztype] || '#ffffff', 0.8, 4);
    pl.attackFace = 1.5;
  }
  /** Cinemática (2,2 s): el mundo está parado; luego empieza el movimiento. */
  function cineTick(dt, pl) {
    t += dt;
    pl.invuln = 5;
    if (t < 0.7) shake(3);
    if (t >= CINE_T) {
      state = 'fx';
      t = 0;
      fx = new Effect(pl, ztype);
      G.Audio.sfx('bossDown');
    }
  }
  /** Cada fotograma de juego: enfriamiento (sólo cuando el Z ha terminado) y el movimiento. */
  function update(dt, pl) {
    if (used && state === '' && cd > 0) {
      cd -= dt;
      if (cd <= 0) {
        cd = 0; used = false;
        G.FX.dmgText(pl.x, pl.y - pl.bodyH - 20, '¡Movimiento Z listo!', '#ffd23f', true);
      }
    }
    if (state === 'fx') {
      t += dt;
      if (!fx || fx.done) {
        state = ''; fx = null; cd = COOLDOWN; pl.zHidden = false;
        return;
      }
      fx.tick(dt);
    }
  }
  function dim() {
    if (state === 'cine') return G.U.clamp(t / 0.3, 0, 1) * 0.62;
    if (state === 'fx') {
      const base = G.U.clamp(1 - t / 0.9, 0, 1) * 0.62;
      return fx ? Math.max(base, fx.dim) : base;
    }
    return 0;
  }

  // ---------------- utilidades ----------------
  function shake(s) {
    const k = G.Settings.get('calm') ? 0.25 : 1;
    G.Camera.shake = Math.min(1.2, Math.max(G.Camera.shake, s / 7 * k));
  }
  const live = () => G.EnemyMgr.all().filter(e => !e.dead);
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const TAU = Math.PI * 2;
  const rr = (a, b) => a + Math.random() * (b - a);
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    if (l2 < 0.01) return dist(px, py, ax, ay);
    const u = G.U.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return dist(px, py, ax + dx * u, ay + dy * u);
  }

  // ======================= el movimiento (zmove.gd) =======================
  class Effect {
    constructor(pl, type) {
      this.pl = pl; this.type = type; this.pal = type;
      this.cx = pl.x; this.cy = pl.y;
      this.t = 0; this.dur = 3; this.ev = []; this.done = false;
      this.acc = 0; this.acc2 = 0; this.dim = 0; this.st = { bs: {} };
      this.dmg = (100 + 24 * pl.level) * pl.atk;
      this.plan();
    }
    col(i) { return (G.VFX.PAL[this.pal] || G.VFX.PAL.normal)[i]; }
    at(time, f) { this.ev.push({ time, f, fired: false }); }
    tick(dt) {
      this.t += dt;
      this.pl.invuln = Math.max(this.pl.invuln, 0.3);
      for (let i = 0; i < this.ev.length; i++) {
        const e = this.ev[i];
        if (!e.fired && this.t >= e.time) { e.fired = true; e.f(); }
      }
      this.cont(dt);
      if (this.t >= this.dur) { this.done = true; this.pl.zHidden = false; }
    }
    rpos(rmax, rmin = 40) { const a = Math.random() * TAU, d = rr(rmin, rmax); return [this.cx + Math.cos(a) * d, this.cy + Math.sin(a) * d]; }
    /** Un enemigo cercano (al azar entre los 10 más próximos) o un punto al azar. */
    tpos(rmax = 460) {
      const l = live().filter(e => dist(e.x, e.y, this.cx, this.cy) < rmax);
      if (!l.length) return this.rpos(rmax * 0.7);
      l.sort((a, b) => dist(a.x, a.y, this.cx, this.cy) - dist(b.x, b.y, this.cx, this.cy));
      const e = l[Math.floor(Math.random() * Math.min(l.length, 10))];
      return [e.x, e.y];
    }
    /** Un golpe del Z. Contra un jefe, el total de este Z no pasa del 28 % de su vida máxima. */
    zhit(e, amount, dx, dy, knock = 0, poison = 0, slow = 0, cc = '') {
      const pl = this.pl;
      const src = { mtype: this.type, cc, ccp: cc ? 1 : 0, poison, slow, mkind: 'zmove' };
      const crit = pl.critChance > 0 && Math.random() < pl.critChance;
      let d;
      if (!e.boss) d = G.Combat.land(e, amount, this.col(3), dx, dy, knock, src, crit, pl);
      else {
        const spent = this.st.bs[e.id] || 0;
        const room = Math.max(0, BOSS_CAP * e.maxHp - spent);
        const before = e.hp;
        // El tope cuenta tras todos los multiplicadores: la vida no puede bajar de before - room.
        e.hpFloor = before - room;
        try { d = G.Combat.land(e, amount, this.col(3), dx, dy, knock, src, crit, pl); }
        finally { delete e.hpFloor; }
        const lost = Math.max(0, Math.min(room, before - e.hp));
        this.st.bs[e.id] = spent + lost;
        d = lost;
      }
      pl.onDealt(d);
      pl.dmgDealt += d;
    }
    hit(px, py, r, k = 1, knock = 0, cc = '', poison = 0, slow = 0) {
      for (const e of live()) {
        if (dist(e.x, e.y, px, py) <= r + e.r * 0.5) {
          const [dx, dy] = G.U.norm(e.x - px, e.y - py);
          this.zhit(e, this.dmg * k, dx, dy, knock, poison, slow, cc);
        }
      }
    }
    boom(x, y, r, s = 3) {
      G.FX.ring(x, y, r * 0.15, r, this.col(3), 0.38, 4);
      G.FX.burst(x, y, this.col(2), 16, 170);
      G.FX.sp('impact', this.pal, x, y, { life: 0.26, scale: G.U.clamp(r / 45, 1.2, 4), frameRate: 12, fade: false });
      shake(s);
    }
    ringBurst(shape, n, r0, speed, life, scl = 1.4) {
      for (let i = 0; i < n; i++) {
        const a = TAU * i / n;
        G.FX.sp(shape, this.pal, this.cx + Math.cos(a) * r0, this.cy + Math.sin(a) * r0,
          { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, scale: scl, angle: a, spin: G.VFX.spins(shape) ? 4 : 0 });
      }
    }
    near(x, y, r) { return live().filter(e => dist(e.x, e.y, x, y) <= r); }
    hitOne(e, k, knock = 0, cc = '', poison = 0, slow = 0, from = null) {
      if (!e || e.dead) return;
      const ox = from ? from[0] : this.cx, oy = from ? from[1] : this.cy;
      let [dx, dy] = G.U.norm(e.x - ox, e.y - oy);
      if (!dx && !dy) dx = 1;
      this.zhit(e, this.dmg * k, dx, dy, knock, poison, slow, cc);
    }
    /** Golpea a lo que toque el segmento (una vez por enemigo mientras siga en `seen`). */
    hitSeg(ax, ay, bx, by, w, k, knock = 0, cc = '', seen = new Set(), poison = 0, slow = 0) {
      let n = 0;
      for (const e of live()) {
        if (seen.has(e.id)) continue;
        if (segDist(e.x, e.y, ax, ay, bx, by) <= w + e.r * 0.5) {
          seen.add(e.id);
          this.hitOne(e, k, knock, cc, poison, slow, [ax, ay]);
          n++;
        }
      }
      return n;
    }
    /** El punto con más enemigos juntos (a menos de 160 unos de otros). */
    densest(rmax = 520) {
      const l = this.near(this.cx, this.cy, rmax);
      if (!l.length) { const a = Math.random() * TAU; return [this.cx + Math.cos(a) * 220, this.cy + Math.sin(a) * 220]; }
      let best = [l[0].x, l[0].y], bn = -1;
      for (const e of l) {
        let n = 0;
        for (const o of l) if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 25600) n++;
        if (n > bn) { bn = n; best = [e.x, e.y]; }
      }
      return best;
    }
    heal(frac) { const pl = this.pl; pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * frac); }
    healText(total) { const pl = this.pl; G.FX.dmgText(pl.x, pl.y - pl.bodyH - 8, '+' + Math.round(pl.maxHp * total), '#7dffb0', true); }
    moveTo(x, y) { const pl = this.pl; pl.x = x; pl.y = y; G.World.collide(pl); }
    chainFrom(first, used, maxn, reach) {
      const out = [];
      let cur = first;
      while (cur && out.length < maxn) {
        out.push(cur);
        used.add(cur.id);
        let best = null, bd = reach;
        for (const e of live()) {
          if (used.has(e.id)) continue;
          const d = dist(e.x, e.y, cur.x, cur.y);
          if (d < bd) { bd = d; best = e; }
        }
        cur = best;
      }
      return out;
    }
    startDash(len, speed, tx, ty) {
      const pl = this.pl;
      let [dx, dy] = G.U.norm(tx - pl.x, ty - pl.y);
      if (!dx && !dy) dx = 1;
      this.st.dash = { ax: pl.x, ay: pl.y, bx: pl.x + dx * len, by: pl.y + dy * len, u: 0, sp: speed / len, seen: new Set() };
    }

    // ---------------- las 18 coreografías (zmove.gd _plan) ----------------
    plan() {
      const S = this.st, pl = this.pl;
      switch (this.type) {
        case 'normal':
          // Tres embestidas a toda velocidad contra grupos distintos, atravesando todo
          this.dur = 2.9;
          for (let i = 0; i < 3; i++) this.at(0.15 + i * 0.8, () => { const [x, y] = this.tpos(520); this.startDash(470, 1250, x, y); });
          this.at(2.5, () => {
            this.boom(pl.x, pl.y, 260, 8);
            G.FX.ring(pl.x, pl.y, 30, 300, '#ffffff', 0.4, 5);
            this.hit(pl.x, pl.y, 260, 1.4, 450);
          });
          break;
        case 'fire': {
          // Fuego fatuo: una corona de bolas de fuego flota alrededor del Pokémon y cada una se lanza contra un enemigo
          this.dur = 4.2;
          const nw = 24;
          for (let i = 0; i < nw; i++) {
            const t0 = 0.08 + i * 0.05;
            this.at(t0, () => {
              const [px, py] = this.tpos();
              wisps.push(new Wisp(pl, i * 2.4, 120 + (i % 3) * 38, 1.5 + i * 0.09 - t0, px, py, () => {
                this.boom(px, py, 95, 2);
                G.FX.burst(px, py, this.col(3), 12, 200);
                this.hit(px, py, 100, 1.15, 160, '', 0);
              }));
            });
          }
          break;
        }
        case 'water':
          // Un vórtice que arrastra a todos hacia el centro y una ola final que los lanza
          this.dur = 3.6;
          this.at(0.1, () => { S.vortex = true; G.FX.ring(this.cx, this.cy, 520, 60, this.col(3), 0.7, 6); });
          this.at(2.9, () => {
            S.vortex = false;
            G.FX.ring(this.cx, this.cy, 30, 520, this.col(3), 0.7, 9);
            this.ringBurst('drop', 30, 30, 620, 0.7, 1.8);
            this.boom(this.cx, this.cy, 360, 10);
            this.hit(this.cx, this.cy, 400, 2.2, 700);
          });
          break;
        case 'electric': {
          // Tres cadenas de rayos que saltan de enemigo en enemigo y paralizan
          this.dur = 3.6;
          const used = new Set();
          const vis = G.VFX.forMove({ id: 'thunderbolt', type: 'electric' });
          for (let ci = 0; ci < 3; ci++) {
            this.at(0.2 + ci * 0.25, () => {
              const pool = this.near(this.cx, this.cy, 560).filter(e => !used.has(e.id));
              if (!pool.length) return;
              pool.sort((a, b) => dist(a.x, a.y, this.cx, this.cy) - dist(b.x, b.y, this.cx, this.cy));
              const first = pool[Math.min(ci * 3, pool.length - 1)];
              const chain = this.chainFrom(first, used, 14, 300);
              chain.forEach((e, j) => {
                this.at(this.t + j * 0.1, () => {
                  if (e.dead) return;
                  let fx0 = e.x, fy0 = e.y - 520;
                  const prev = chain[j - 1];
                  if (j > 0 && prev) { fx0 = prev.x; fy0 = prev.y; }
                  const dvx = e.x - fx0, dvy = e.y - fy0;
                  G.FX.beam(fx0, fy0, Math.atan2(dvy, dvx), Math.hypot(dvx, dvy), 20, this.col(3), vis);
                  this.boom(e.x, e.y, 70, 3);
                  this.hitOne(e, 1.1 + 0.1 * j, 150, 'para', 0, 0, [fx0, fy0]);
                });
              });
            });
          }
          break;
        }
        case 'grass':
          // Raíces inmovilizan, estrangulan y al florecer curan por cada enemigo atrapado
          this.dur = 3.6;
          this.at(0.2, () => {
            S.roots = this.near(this.cx, this.cy, 600);
            G.FX.ring(this.cx, this.cy, 20, 600, this.col(3), 0.6, 5);
            const vis = G.VFX.forMove({ id: 'vine-whip', type: 'grass' });
            for (const e of S.roots) for (let j = 0; j < 5; j++) G.FX.slash(e.x, e.y, TAU * j / 5, 44, 0.5, this.col(3), vis);
          });
          for (let k = 0; k < 3; k++) {
            this.at(0.9 + k * 0.6, () => {
              for (const e of S.roots || []) {
                if (e.dead) continue;
                this.hitOne(e, 0.5, 0);
                G.FX.sp('leaf', this.pal, e.x, e.y, { vx: rr(-60, 60), vy: -80, life: 0.6, scale: 1.6, spin: 6 });
              }
            });
          }
          this.at(2.9, () => {
            let n = 0;
            for (const e of S.roots || []) {
              if (e.dead) continue;
              n++;
              if (n <= 30) { this.boom(e.x, e.y, 80, 1.5); G.FX.burst(e.x, e.y, this.col(3), 10, 180); }
              this.hitOne(e, 1.8, 120);
            }
            const h = Math.min(0.25, 0.02 * n);
            this.heal(h);
            this.healText(h);
          });
          break;
        case 'ice':
          // Congela a todos los enemigos y un golpe final los rompe a la vez
          this.dur = 3.8;
          this.at(0.2, () => {
            G.FX.ring(this.cx, this.cy, 20, 760, this.col(4), 0.7, 10);
            this.ringBurst('star', 30, 30, 700, 0.8, 1.5);
            for (const e of this.near(this.cx, this.cy, 760)) G.Status.apply(e, 'freeze', 2.4);
          });
          this.at(2.9, () => {
            G.FX.ring(this.cx, this.cy, 20, 800, '#ffffff', 0.5, 10);
            let n = 0;
            for (const e of this.near(this.cx, this.cy, 800)) {
              if (!(e.frozenT > 0)) continue;
              n++;
              e.frozenT = 0;
              if (n <= 30) {
                this.boom(e.x, e.y, 70, 1);
                for (let j = 0; j < 3; j++) { const a = Math.random() * TAU; G.FX.sp('shard', this.pal, e.x, e.y, { vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, life: 0.5, scale: 2, spin: 6 }); }
              }
              this.hitOne(e, 2.6, 120);
            }
            shake(10);
          });
          break;
        case 'fighting':
          // Duelo: saltas sobre el enemigo más fuerte y le das una ronda de golpes con gancho final
          this.dur = 3.2;
          this.at(0.05, () => {
            let best = null, bh = -1;
            for (const e of this.near(this.cx, this.cy, 560)) {
              const sc = e.maxHp * (e.boss ? 10 : 1);
              if (sc > bh) { bh = sc; best = e; }
            }
            S.tgt = best;
            if (best) G.FX.ring(best.x, best.y, 200, 30, this.col(3), 0.4, 5);
          });
          for (let i = 0; i < 22; i++) {
            this.at(0.35 + i * 0.085, () => {
              let e = S.tgt;
              if (!e || e.dead) { const l = this.near(pl.x, pl.y, 400); e = l[0] || null; S.tgt = e; }
              const [px, py] = e ? [e.x, e.y] : this.tpos(300);
              const a = Math.random() * TAU;
              G.FX.sp('impact', this.pal, px + Math.cos(a) * 22, py + Math.sin(a) * 22, { life: 0.18, scale: 2.6, frameRate: 12, fade: false });
              G.FX.burst(px, py, this.col(3), 6, 160);
              shake(3);
              if (e) this.hitOne(e, 0.4, 40, '', 0, 0, [pl.x, pl.y]);
            });
          }
          this.at(2.5, () => {
            const e = S.tgt;
            const ok = e && !e.dead;
            const px = ok ? e.x : pl.x, py = ok ? e.y : pl.y;
            G.FX.sp('impact', this.pal, px, py, { life: 0.5, scale: 6.5, frameRate: 12, fade: false });
            this.boom(px, py, 220, 12);
            if (e) this.hitOne(e, 4.0, 650, '', 0, 0, [pl.x, pl.y]);
            this.hit(px, py, 190, 1.0, 500);
          });
          break;
        case 'poison':
          // Charcos ácidos entre los enemigos: envenenan mientras estás dentro
          this.dur = 4.2;
          S.pools = [];
          for (let i = 0; i < 9; i++) {
            this.at(0.2 + i * 0.28, () => {
              const [px, py] = this.tpos(520);
              S.pools.push({ x: px, y: py, end: this.t + 2.5, next: 0 });
              G.FX.ring(px, py, 10, 115, this.col(3), 0.5, 5);
              G.FX.burst(px, py, this.col(3), 12, 150);
            });
          }
          break;
        case 'ground':
          // Grietas que salen de ti en todas direcciones y aplastan lo que hay sobre ellas
          this.dur = 3.4;
          for (let w = 0; w < 3; w++) {
            this.at(0.2 + w * 0.85, () => {
              const base = Math.random() * TAU;
              const seen = new Set();
              for (let j = 0; j < 5; j++) {
                const a = base + TAU * j / 5, ca = Math.cos(a), sa = Math.sin(a);
                G.FX.beam(this.cx, this.cy, a, 600, 26, this.col(3), { pal: 'ground', beam: null });
                for (let q = 0; q < 9; q++) {
                  const d = 50 + q * 62;
                  G.FX.sp('rock', this.pal, this.cx + ca * d, this.cy + sa * d, { vx: rr(-30, 30), vy: rr(-230, -120), life: 0.8, scale: rr(1.4, 2.4), grav: 520, spin: rr(-6, 6) });
                }
                this.hitSeg(this.cx, this.cy, this.cx + ca * 600, this.cy + sa * 600, 60, 2.6, 0, '', seen, 0, 0.6);
              }
              shake(9);
              G.FX.ring(this.cx, this.cy, 20, 300, this.col(3), 0.4, 6);
            });
          }
          break;
        case 'flying':
          // Desapareces en el cielo y caes en picado sobre el mayor grupo de enemigos
          this.dur = 2.8;
          this.at(0.1, () => {
            pl.zHidden = true;
            G.FX.ring(this.cx, this.cy, 10, 90, this.col(4), 0.4, 5);
            this.ringBurst('wind', 12, 20, 380, 0.5, 1.6);
            S.air = true;
            S.tp = this.densest(560);
          });
          this.at(1.5, () => {
            S.air = false;
            this.moveTo(S.tp[0], S.tp[1]);
            pl.zHidden = false;
            G.FX.ring(pl.x, pl.y, 20, 380, this.col(4), 0.6, 9);
            const cx = this.cx, cy = this.cy;
            this.cx = pl.x; this.cy = pl.y;          // la ráfaga sale de donde caes
            this.ringBurst('wind', 24, 30, 620, 0.6, 2.0);
            this.cx = cx; this.cy = cy;
            this.boom(pl.x, pl.y, 320, 14);
            this.hit(pl.x, pl.y, 320, 4.2, 760);
          });
          break;
        case 'psychic':
          // Enemigos confundidos que se atacan entre sí
          this.dur = 3.6;
          for (let k = 0; k < 6; k++) {
            this.at(0.2 + k * 0.4, () => {
              G.FX.ring(this.cx, this.cy, 20, 560, this.col(2 + (k % 2)), 0.6, 5);
              for (const e of this.near(this.cx, this.cy, 560)) { G.Status.apply(e, 'conf', 1.6); this.hitOne(e, 0.28, 0); }
            });
          }
          this.at(2.9, () => {
            this.boom(this.cx, this.cy, 330, 6);
            for (const e of this.near(this.cx, this.cy, 560)) this.hitOne(e, 0.9, 0, 'conf');
          });
          break;
        case 'bug':
          // Un enjambre: cada insecto persigue a un enemigo distinto por su cuenta
          this.dur = 3.9;
          S.bugs = [];
          this.at(0.2, () => {
            for (let j = 0; j < 16; j++) {
              const a = TAU * j / 16;
              S.bugs.push({ x: this.cx + Math.cos(a) * 40, y: this.cy + Math.sin(a) * 40, tgt: null, ang: a, seed: Math.random() * 10 });
            }
            for (let j = 0; j < 24; j++) {
              const a = TAU * j / 24;
              G.FX.sp('web', this.pal, this.cx + Math.cos(a) * 50, this.cy + Math.sin(a) * 50, { vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, life: 0.7, scale: 1.4, spin: 3 });
            }
          });
          break;
        case 'rock':
          // Dos avalanchas que cruzan toda la pantalla, una en cada sentido
          this.dur = 4.0;
          S.rolls = [];
          for (let r = 0; r < 2; r++) {
            this.at(0.2 + r * 1.9, () => {
              const [tx, ty] = this.densest(560);
              let [dx, dy] = G.U.norm(tx - this.cx, ty - this.cy);
              if (!dx && !dy) dx = 1;
              if (r === 1 && S.dir0) { dx = -S.dir0[0]; dy = -S.dir0[1]; }
              S.dir0 = [dx, dy];
              S.rolls.push({ dx, dy, px: -dy, py: dx, sx: this.cx - dx * 520, sy: this.cy - dy * 520, t0: this.t, seen: new Map() });
              G.FX.ring(this.cx, this.cy, 10, 200, this.col(3), 0.5, 5);
            });
          }
          break;
        case 'ghost':
          // Drenaje de almas: daño según la salud del enemigo y curación para ti
          this.dur = 3.8;
          S.heal = 0;
          for (let k = 0; k < 8; k++) {
            this.at(0.3 + k * 0.35, () => {
              const px = pl.x, py = pl.y;
              G.FX.ring(px, py, 560, 40, this.col(3), 0.5, 5);
              let n = 0;
              for (const e of this.near(this.cx, this.cy, 560)) {
                n++;
                const extra = e.hp * 0.07;
                const [dx, dy] = G.U.norm(px - e.x, py - e.y);
                this.zhit(e, this.dmg * 0.22 + extra, dx, dy, 0);
                if (n <= 14) G.FX.sp('shadow', this.pal, e.x, e.y, { vx: dx * 520, vy: dy * 520, life: 0.5, scale: 1.6 });
                if (S.heal < 0.18) { S.heal += 0.006; this.heal(0.006); }
              }
            });
          }
          this.at(3.2, () => {
            this.healText(S.heal);
            this.boom(this.cx, this.cy, 360, 8);
            this.hit(this.cx, this.cy, 560, 1.1, 0);
          });
          break;
        case 'dragon':
          // Cuatro rayos dracónicos giratorios mientras eres invencible (todo en cont)
          this.dur = 3.8;
          break;
        case 'dark':
          // La oscuridad se cierra: un círculo que se contrae y termina en una implosión
          this.dur = 3.6;
          this.at(0.2, () => { S.ring = 580; });
          this.at(2.8, () => {
            S.ring = -1;
            G.FX.ring(pl.x, pl.y, 400, 10, this.col(4), 0.5, 12);
            this.boom(pl.x, pl.y, 300, 12);
            this.hit(pl.x, pl.y, 330, 3.0, 450);
          });
          break;
        case 'steel':
          // Un taladro que perfora en línea recta, cada vez más fuerte
          this.dur = 3.0;
          this.at(0.2, () => { const [x, y] = this.densest(560); this.startDash(900, 640, x, y); });
          this.at(2.2, () => {
            const cx = this.cx, cy = this.cy;
            this.cx = pl.x; this.cy = pl.y;          // (el port la lanza desde el centro inicial; se ve mejor donde acabas)
            this.ringBurst('shard', 24, 30, 560, 0.5, 2.0);
            this.cx = cx; this.cy = cy;
            this.boom(pl.x, pl.y, 260, 10);
            this.hit(pl.x, pl.y, 260, 2.4, 520);
          });
          break;
        case 'fairy':
          // Duermes a todos, te curas y al final devoras sus sueños
          this.dur = 3.6;
          S.heal = 0;
          this.at(0.2, () => {
            G.FX.ring(this.cx, this.cy, 20, 620, this.col(3), 0.7, 7);
            for (const e of this.near(this.cx, this.cy, 620)) G.Status.apply(e, 'sleep', 1.5);
          });
          this.at(2.9, () => {
            let n = 0;
            for (const e of this.near(this.cx, this.cy, 640)) {
              if (!(e.sleepT > 0)) continue;
              n++;
              if (n <= 26) { const [dx, dy] = G.U.norm(pl.x - e.x, pl.y - e.y); G.FX.sp('heart', this.pal, e.x, e.y, { vx: dx * 380, vy: dy * 380, life: 0.6, scale: 1.8 }); }
              this.hitOne(e, 2.0, 80);
            }
            const h = Math.min(0.2, 0.012 * n);
            this.heal(h);
            this.healText(h);
            this.boom(this.cx, this.cy, 380, 6);
          });
          break;
      }
    }

    // ---------------- efectos continuos (zmove.gd _cont) ----------------
    cont(dt) {
      this.acc += dt; this.acc2 += dt;
      const S = this.st, pl = this.pl, t = this.t, px = pl.x, py = pl.y, cx = this.cx, cy = this.cy;
      switch (this.type) {
        case 'normal': case 'steel': {
          const d = S.dash;
          if (!d) break;
          d.u += dt * d.sp;
          const u = Math.min(d.u, 1);
          const ox = pl.x, oy = pl.y;
          this.moveTo(d.ax + (d.bx - d.ax) * u, d.ay + (d.by - d.ay) * u);
          const nx = pl.x, ny = pl.y;
          const kk = this.type === 'steel' ? 0.7 + 1.3 * u : 1.5;
          // varias pasadas por segundo: cada enemigo puede volver a recibir (el taladro)
          if (this.type === 'steel') {
            if (this.acc >= 0.12) { this.acc = 0; d.seen.clear(); }
            this.hitSeg(ox, oy, nx, ny, 62, kk * 0.5, 160, '', d.seen);
          } else this.hitSeg(ox, oy, nx, ny, 78, kk, 280, '', d.seen);
          const ang = Math.atan2(d.by - d.ay, d.bx - d.ax);
          if (this.type === 'normal') {
            G.FX.sp('streak', this.pal, nx, ny, { life: 0.3, scale: 2.4, angle: ang, fade: true });
            const a = Math.random() * TAU;
            G.FX.sp('star', this.pal, nx + Math.cos(a) * 24, ny + Math.sin(a) * 24, { vx: Math.cos(ang + Math.PI) * 120, vy: Math.sin(ang + Math.PI) * 120, life: 0.4, scale: 1.4, spin: 5 });
          } else {
            const vis = G.VFX.forMove({ id: 'flash-cannon', type: 'steel' });
            for (let j = 0; j < 3; j++) G.FX.beam(nx, ny, t * 14 + j * TAU / 3, 120, 22, this.col(3), vis);
            G.FX.burst(nx + Math.cos(ang) * 40, ny + Math.sin(ang) * 40, this.col(3), 4, 200);
            shake(3);
          }
          if (u >= 1) delete S.dash;
          break;
        }
        case 'water':
          if (!S.vortex) break;
          for (const e of this.near(cx, cy, 540)) {
            const dvx = cx - e.x, dvy = cy - e.y;
            const [nx, ny] = G.U.norm(dvx, dvy), [tx, ty] = G.U.norm(-dvy, dvx);
            e.x += (nx * 210 + tx * 90) * dt; e.y += (ny * 210 + ty * 90) * dt;
          }
          for (let i = 0; i < 3; i++) {
            const a = t * 6 + i * TAU / 3;
            const r = 80 + (((t * 160 + i * 140) % 440) + 440) % 440;
            const aa = a - r * 0.004;
            G.FX.sp('drop', this.pal, cx + Math.cos(aa) * r, cy + Math.sin(aa) * r, { vx: Math.cos(a + Math.PI / 2) * 160, vy: Math.sin(a + Math.PI / 2) * 160, life: 0.35, scale: 1.7 });
          }
          if (this.acc2 >= 0.22) {
            this.acc2 = 0;
            G.FX.ring(cx, cy, 20, 130, this.col(3), 0.3, 4);
            this.hit(cx, cy, 140, 0.38, 0);
            shake(3);
          }
          break;
        case 'ice':
          if (t < 2.9) for (let i = 0; i < 4; i++) G.FX.sp('star', this.pal, px + rr(-560, 560), py + rr(-380, 300), { vx: rr(-40, 40), vy: rr(90, 170), life: 0.9, scale: rr(0.8, 1.6), spin: 3 });
          break;
        case 'grass':
          if (t > 0.2 && t < 2.9) {
            for (const e of S.roots || []) {
              if (e.dead) continue;
              e.applySlow(0.97, 0.25);
              if (Math.random() < 0.05) G.FX.sp('leaf', this.pal, e.x + rr(-16, 16), e.y + 6, { vy: -70, life: 0.5, scale: 1.4, spin: 4 });
            }
          }
          break;
        case 'fighting': {
          const e = S.tgt;
          if (e && !e.dead && t > 0.1 && t < 2.9) {
            this.moveTo(e.x - 48, e.y + 8);
            e.kx *= 0.5; e.ky *= 0.5;
          }
          break;
        }
        case 'poison':
          for (const p of S.pools || []) {
            if (t > p.end) continue;
            if (Math.random() < 0.6) { const a = Math.random() * TAU, d = rr(0, 100); G.FX.sp('bubble', this.pal, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, { vy: rr(-80, -40), life: 0.7, scale: rr(1.2, 2.4) }); }
            p.next -= dt;
            if (p.next <= 0) {
              p.next = 0.35;
              G.FX.ring(p.x, p.y, 20, 110, this.col(3), 0.35, 3);
              this.hit(p.x, p.y, 110, 0.38, 0, '', 2, 0.3);
            }
          }
          if (t < 3.4) for (let i = 0; i < 2; i++) G.FX.sp('drop', this.pal, px + rr(-520, 520), py - 360, { vy: 560, life: 0.65, scale: 1.2, fade: false });
          break;
        case 'ground':
          if (t < 3.0) shake(4);
          break;
        case 'flying':
          if (S.air) {
            const [tx, ty] = S.tp || [cx, cy];
            G.FX.sp('shadow', 'dark', tx, ty, { life: 0.08, scale: 1 + Math.min(2, (t - 0.1) * 1.6) });
            if (t > 0.4 && this.acc2 >= 0.15) { this.acc2 = 0; G.FX.ring(tx, ty, 150, 40, this.col(4), 0.3, 3); }
            for (let i = 0; i < 2; i++) {
              const a = t * 9 + i * Math.PI;
              G.FX.sp('wind', this.pal, cx + Math.cos(a) * 50, cy + Math.sin(a) * 50 - t * 120, { vy: -200, life: 0.4, scale: 1.6, spin: 6 });
            }
          }
          break;
        case 'psychic':
          if (t < 3.0) {
            for (let i = 0; i < 2; i++) {
              const a = t * 3 + i * Math.PI;
              const r = 60 + (t * 120 + i * 200) % 460;
              G.FX.sp('ring', this.pal, cx + Math.cos(a + r * 0.01) * r, cy + Math.sin(a + r * 0.01) * r, { life: 0.5, scale: 1.6, spin: 2 });
            }
          }
          break;
        case 'bug':
          if (t >= 3.5) break;
          for (const b of S.bugs || []) {
            let tg = b.tgt;
            if (!tg || tg.dead) {
              const l = this.near(b.x, b.y, 800);
              if (!l.length) {
                b.tgt = null;
                b.ang += 3 * dt;
                b.x += Math.cos(b.ang) * 200 * dt; b.y += Math.sin(b.ang) * 200 * dt;
                continue;
              }
              l.sort((p, q) => dist(p.x, p.y, b.x, b.y) - dist(q.x, q.y, b.x, b.y));
              tg = l[Math.floor(Math.random() * Math.min(3, l.length))];
              b.tgt = tg;
            }
            const bx = b.x, by = b.y;
            const dvx = tg.x - bx, dvy = tg.y - by, d = Math.hypot(dvx, dvy);
            const [nx, ny] = G.U.norm(dvx, dvy), [wx, wy] = G.U.norm(-dvy, dvx);
            const wob = Math.sin(t * 18 + b.seed) * 120;
            b.x = bx + (nx * 600 + wx * wob) * dt; b.y = by + (ny * 600 + wy * wob) * dt;
            G.FX.sp('needle', this.pal, b.x, b.y, { life: 0.22, scale: 1.3, angle: Math.atan2(dvy, dvx) });
            if (d < 34) {
              G.FX.burst(tg.x, tg.y, this.col(3), 6, 150);
              this.hitOne(tg, 0.7, 90, '', 1, 0.4, [bx, by]);
              b.tgt = null;
            }
          }
          break;
        case 'rock':
          for (const ro of S.rolls || []) {
            const u = (t - ro.t0) / 1.7;
            if (u < 0 || u > 1) continue;
            const fx0 = ro.sx + ro.dx * 1040 * u, fy0 = ro.sy + ro.dy * 1040 * u;
            for (let i = -5; i <= 5; i++) {
              const bx = fx0 + ro.px * i * 78 + ro.dx * Math.sin(i * 1.7) * 18, by = fy0 + ro.py * i * 78 + ro.dy * Math.sin(i * 1.7) * 18;
              G.FX.sp('rock', this.pal, bx, by, { life: 0.09, scale: 3.8, spin: 4, fade: false });
              if (Math.random() < 0.15) G.FX.sp('rock', this.pal, bx, by, { vx: -ro.dx * 100, vy: -ro.dy * 100 - 120, life: 0.5, scale: 1.5, grav: 420, spin: 5 });
              for (const e of this.near(bx, by, 80)) {
                if (t - (ro.seen.has(e.id) ? ro.seen.get(e.id) : -9) > 0.45) {
                  ro.seen.set(e.id, t);
                  this.hitOne(e, 1.3, 380, '', 0, 0, [bx - ro.dx * 60, by - ro.dy * 60]);
                }
              }
            }
            shake(5);
          }
          break;
        case 'ghost':
          if (t < 3.3) {
            for (let i = 0; i < 3; i++) {
              const a = Math.random() * TAU, dx = Math.cos(a), dy = Math.sin(a);
              G.FX.sp('shadow', this.pal, px + dx * 420, py + dy * 420, { vx: -dx * 330, vy: -dy * 330, life: 1.05, scale: rr(1.2, 2.2) });
            }
          }
          break;
        case 'dragon':
          if (t < 3.6 && this.acc2 >= 0.1) {
            this.acc2 = 0;
            const vis = G.VFX.forMove({ id: 'dragon-rage', type: 'dragon' });
            const seen = new Set();
            for (let j = 0; j < 4; j++) {
              const a = t * 3.4 + j * Math.PI / 2;
              G.FX.beam(px, py, a, 540, 30, this.col(3), vis);
              this.hitSeg(px, py, px + Math.cos(a) * 540, py + Math.sin(a) * 540, 46, 0.75, 140, '', seen);
            }
            shake(3);
          }
          break;
        case 'dark': {
          const ring = S.ring == null ? -1 : S.ring;
          if (ring > 0) {
            const k = G.U.clamp((t - 0.2) / 2.6, 0, 1);
            const R = G.U.lerp(580, 90, k);
            S.R = R;
            this.dim = 0.5 * Math.min(1, (t - 0.2) / 0.4);
            for (let i = 0; i < 5; i++) {
              const a = Math.random() * TAU;
              G.FX.sp('crescent', this.pal, cx + Math.cos(a) * R, cy + Math.sin(a) * R, { vx: Math.cos(a + Math.PI * 0.5) * 120, vy: Math.sin(a + Math.PI * 0.5) * 120, life: 0.35, scale: 1.8, angle: a + Math.PI });
            }
            for (const e of this.near(cx, cy, R + 80)) {
              if (dist(e.x, e.y, cx, cy) > R - 60) {
                const [nx, ny] = G.U.norm(cx - e.x, cy - e.y);
                e.x += nx * 230 * dt; e.y += ny * 230 * dt;
                e.applySlow(0.5, 0.3);
              }
            }
            if (this.acc2 >= 0.3) {
              this.acc2 = 0;
              G.FX.ring(cx, cy, R, R - 24, this.col(3), 0.3, 6);
              for (const e of this.near(cx, cy, R + 70)) if (dist(e.x, e.y, cx, cy) > R - 70) this.hitOne(e, 0.5, 0);
            }
          } else if (t > 2.8) this.dim = Math.max(0, this.dim - dt * 1.2);
          break;
        }
        case 'fairy':
          if (t < 3.0) {
            for (let i = 0; i < 3; i++) G.FX.sp('star', this.pal, cx + rr(-420, 420), cy + rr(-320, 320) - 200, { vy: 340, life: 0.6, scale: rr(1.2, 2.2), spin: 5 });
            if (t > 0.3 && t < 2.8 && this.acc2 >= 0.25) {
              this.acc2 = 0;
              this.heal(0.012);
              S.heal = (S.heal || 0) + 0.012;
              G.FX.sp('heart', this.pal, px + rr(-60, 60), py, { vy: -80, life: 0.8, scale: 1.8 });
            }
          }
          break;
      }
    }
  }

  // ======================= fuego fatuo (zmove.gd Wisp, dibujado en código) =======================
  class Wisp {
    constructor(home, ang, rad, tGo, toX, toY, cb) {
      this.life = 0; this.sd = Math.random() * 10; this.home = home; this.ang = ang; this.rad = rad;
      this.tGo = tGo; this.dash = 0.5; this.toX = toX; this.toY = toY; this.cb = cb;
      this.x = home.x; this.y = home.y; this.launched = false; this.trail = []; this.sz = 0; this.vx = 0; this.vy = 0; this.gone = false;
    }
    update(d) {
      this.life += d;
      const grow = G.U.clamp(this.life / 0.35, 0, 1);
      this.sz = grow;
      const ox = this.x, oy = this.y;
      if (this.life < this.tGo) {
        this.ang += d * (2.6 + 0.8 * G.U.clamp(this.life / this.tGo, 0, 1));
        const hv = Math.sin(this.life * 3 + this.sd) * 8;
        const r = this.rad * (0.4 + 0.6 * grow);
        this.x = this.home.x + Math.cos(this.ang) * r;
        this.y = this.home.y + Math.sin(this.ang) * r * 0.55 - 46 + hv;
      } else {
        if (!this.launched) {
          this.launched = true;
          this.fx = this.x; this.fy = this.y;
          const mx = (this.fx + this.toX) / 2, my = (this.fy + this.toY) / 2;
          const [nx, ny] = G.U.norm(-(this.toY - this.fy), this.toX - this.fx);
          const off = rr(-120, 120);
          this.cx = mx + nx * off; this.cy = my + ny * off - 90;
        }
        const k = G.U.clamp((this.life - this.tGo) / this.dash, 0, 1), e = k * k;
        this.x = (1 - e) * (1 - e) * this.fx + 2 * (1 - e) * e * this.cx + e * e * this.toX;
        this.y = (1 - e) * (1 - e) * this.fy + 2 * (1 - e) * e * this.cy + e * e * this.toY;
        if (k >= 1) { this.gone = true; this.cb(); return; }
      }
      this.vx = (this.x - ox) / Math.max(d, 0.0001); this.vy = (this.y - oy) / Math.max(d, 0.0001);
      this.trail.unshift([this.x, this.y]);
      if (this.trail.length > 14) this.trail.pop();
    }
    draw(ctx) {
      const flick = 0.88 + 0.12 * Math.sin(this.life * 17 + this.sd) + 0.06 * Math.sin(this.life * 29 + this.sd * 2);
      const r = 12 * this.sz * flick;
      if (r <= 0.2) return;
      const sp = Math.hypot(this.vx, this.vy);
      const fast = sp > 40;
      const [bx, by] = fast ? [-this.vx / sp, -this.vy / sp] : [0, 1];
      const circle = (x, y, rad, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, rad), 0, TAU); ctx.fill(); };
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // estela de brasas
      this.trail.forEach(([tx, ty], i) => { const f = 1 - i / this.trail.length; circle(tx, ty, r * (0.25 + 0.6 * f), `rgba(255,115,26,${0.22 * f})`); });
      ctx.translate(this.x, this.y);
      // resplandor
      circle(0, 0, r * 2.4, 'rgba(255,77,13,0.06)');
      circle(0, 0, r * 1.7, 'rgba(255,102,20,0.10)');
      // llama: gota con punta hacia atrás (o hacia arriba si flota)
      const [ux, uy] = fast ? [bx, by] : [0, -1];
      const [sx, sy] = [-uy, ux];
      const LAYERS = [[1.0, 'rgba(230,46,10,0.6)'], [0.78, 'rgba(255,115,20,0.7)'], [0.52, 'rgba(255,199,77,0.8)'], [0.3, 'rgba(255,247,217,0.95)']];
      for (const [k2, c] of LAYERS) {
        circle(0, 0, r * k2, c);
        // lengua de fuego ondulante
        const len = r * (2.1 + 0.5 * Math.sin(this.life * 13 + this.sd + k2 * 3)) * k2 + (fast ? r * 0.8 : 0);
        const wv = Math.sin(this.life * 9 + this.sd) * r * 0.25;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(sx * r * k2 * 0.85, sy * r * k2 * 0.85);
        ctx.lineTo(ux * len + sx * wv, uy * len + sy * wv);
        ctx.lineTo(-sx * r * k2 * 0.85, -sy * r * k2 * 0.85);
        ctx.closePath(); ctx.fill();
      }
      // chispas
      for (let i = 0; i < 4; i++) {
        const ph = ((this.life * 1.4 + i * 0.25 + this.sd) % 1 + 1) % 1;
        const o = Math.sin(i * 5 + this.life * 4) * 10;
        circle(ux * (r * 1.2 + ph * 40) + sx * o, uy * (r * 1.2 + ph * 40) + sy * o, 2 * (1 - ph), `rgba(255,204,77,${1 - ph})`);
      }
      ctx.restore();
    }
  }
  /**
   * MicaSurvivor (M5 lote 5): un golpe de área suelto con las utilidades del Z, sin coreografía
   * (dynamax.gd _pulse hace ZMS.new() y usa boom / hit / ring_burst): las ondas Max del Dynamax.
   * El tope del 28 % contra jefes cuenta por objeto, como en el port (una onda = un objeto).
   */
  function area(pl, type, cx, cy, dmg) {
    const z = Object.create(Effect.prototype);
    return Object.assign(z, { pl, type, pal: type, cx, cy, t: 0, dur: 0, ev: [], done: true, acc: 0, acc2: 0, dim: 0, st: { bs: {} }, dmg });
  }
  function updateWorld(dt) {
    for (const w of wisps) w.update(dt);
    if (wisps.some(w => w.gone)) wisps = wisps.filter(w => !w.gone);
  }
  function drawWorld(ctx) { for (const w of wisps) w.draw(ctx); }

  // ======================= pantalla (main.gd draw_z) =======================
  const F = (wt, s) => `${wt} ${Math.round(s)}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const easeOut = x => 1 - Math.pow(1 - x, 3);
  const easeBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  // Un carácter suelto se dibuja tal cual (sin pasar por la traducción del canvas, i18n.js).
  const raw = s => new String(s);   // eslint-disable-line no-new-wrappers

  /** El oscurecido de la pantalla (debajo del HUD). */
  function drawDim(ctx, w, h) {
    const d = dim();
    if (d <= 0) return;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,10,${d.toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** El cartel de la cinemática: rayos, banda, líneas de velocidad, el cristal y el nombre que cae letra a letra. */
  function drawCine(ctx, w, h) {
    if (state !== 'cine') return;
    const k = G.U.clamp(Math.min(w / 1280, h / 720), 0.5, 1.4);
    const tc = rgb(G.U.TYPE_COLOR[ztype] || '#ffffff');
    const lite = tc.map(v => Math.min(255, v + 77));
    const T = CINE_T, cy = h * 0.42, mid = w / 2;
    const open = easeOut(G.U.clamp((t - 0.05) / 0.3, 0, 1));
    const fade = G.U.clamp((T - t) / 0.3, 0, 1);
    const al = open * fade;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    // rayos giratorios detrás del cartel
    const rl = w * 0.9;
    ctx.fillStyle = rgba(tc, 0.16 * al);
    for (let i = 0; i < 16; i++) {
      const ra = i * TAU / 16 + t * 0.5, ww = 0.075;
      ctx.beginPath();
      ctx.moveTo(mid, cy);
      ctx.lineTo(mid + Math.cos(ra - ww) * rl, cy + Math.sin(ra - ww) * rl);
      ctx.lineTo(mid + Math.cos(ra + ww) * rl, cy + Math.sin(ra + ww) * rl);
      ctx.closePath(); ctx.fill();
    }
    // la banda que se abre
    const hh = 66 * k * open;
    ctx.fillStyle = rgba(tc.map(v => v * 0.22), 0.8 * fade);
    ctx.fillRect(0, cy - hh, w, hh * 2);
    ctx.fillStyle = rgba(lite, fade);
    ctx.fillRect(0, cy - hh - 3, w, 5);
    ctx.fillRect(0, cy + hh - 2, w, 5);
    // líneas de velocidad
    ctx.fillStyle = `rgba(255,255,255,${(0.28 * al).toFixed(3)})`;
    for (let i = 0; i < 22; i++) {
      const h1 = (i * 0.6180339 + 0.13) % 1, h2 = (i * 0.7548776 + 0.29) % 1;
      const yy = cy - 120 * k + h1 * 240 * k;
      const span = w + 300;
      const xx = (((h2 * w - t * (900 + h1 * 700)) % span) + span) % span - 150;
      ctx.fillRect(xx, yy, 90 + h2 * 120, 2);
    }
    // el cristal Z, que late
    const crp = 1 + 0.08 * Math.sin(t * 9);
    const crx = mid, cry = cy - 112 * k * open;
    ctx.fillStyle = rgba(tc, 0.22 * al);
    ctx.beginPath(); ctx.arc(crx, cry, 58 * k * crp, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${(0.16 * al).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(crx, cry, 38 * k * crp, 0, TAU); ctx.fill();
    const cw = 120 * k * crp * open;
    if (cw > 2) {
      const cv = G.Icons.canvas('zc:' + ztype);
      ctx.globalAlpha = al;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cv, crx - cw / 2, cry - cw * cv.height / cv.width / 2, cw, cw * cv.height / cv.width);
      ctx.globalAlpha = 1;
    }
    // subtítulo con letras que se separan
    const sub = G.T('MOVIMIENTO Z');
    const sp = G.U.lerp(1, 14, easeOut(G.U.clamp((t - 0.1) / 0.6, 0, 1))) * k;
    ctx.font = `800 ${Math.round(22 * k)}px Arial,Helvetica,sans-serif`; // (en Pixelify la Z parece un 2: "2-MOVE")
    ctx.textAlign = 'left';
    const subW = [...sub].reduce((a, ch) => a + ctx.measureText(raw(ch)).width, 0) + sp * (sub.length - 1);
    let sx = mid - subW / 2;
    ctx.fillStyle = `rgba(255,255,255,${(0.85 * al).toFixed(3)})`;
    for (const ch of sub) { ctx.fillText(raw(ch), sx, cy - 28 * k); sx += ctx.measureText(raw(ch)).width + sp; }
    // el nombre: cada letra cae con un golpe y rebota
    const name = G.T(DEF[ztype] ? DEF[ztype].name : '');
    const fs = (w >= 900 ? 60 : 40) * Math.min(1, k * 1.2);
    ctx.font = F(800, fs);
    const chars = [...name];
    const widths = chars.map(ch => ctx.measureText(raw(ch)).width);
    const tw = widths.reduce((a, b) => a + b, 0);
    const sweep = w * G.U.clamp((t - 1.0) / 0.75, 0, 1) * 1.3 - w * 0.15;
    let cx = mid - tw / 2;
    const n = chars.length;
    chars.forEach((ch, i) => {
      const cwid = widths[i];
      const ts = 0.35 + i * (0.5 / Math.max(n, 1));
      const pr = G.U.clamp((t - ts) / 0.26, 0, 1);
      if (pr > 0 && ch !== ' ') {
        const scl = G.U.lerp(3.4, 1, easeBack(pr));
        const ca = G.U.clamp(pr * 5, 0, 1) * fade;
        let shx = 0, shy = 0;
        if (pr < 1 || t < ts + 0.4) {
          const q = G.U.clamp(1 - (t - ts) / 0.4, 0, 1);
          shx = Math.sin(t * 90 + i) * 3 * q; shy = Math.cos(t * 70 + i * 2) * 3 * q;
        }
        ctx.save();
        ctx.translate(cx + cwid / 2 + shx, cy + 22 * k + shy);
        ctx.scale(scl, scl);
        const shine = G.U.clamp(1 - Math.abs((cx + cwid / 2) - sweep) / 110, 0, 1);
        const base = tc.map(v => Math.min(255, v * 0.45 + 140));
        const fc = base.map(v => v + (255 - v) * shine);
        ctx.fillStyle = rgba(tc, 0.55 * ca);
        for (const [ox, oy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) ctx.fillText(raw(ch), -cwid / 2 + ox, oy);
        ctx.fillStyle = `rgba(0,0,0,${(0.7 * ca).toFixed(3)})`;
        ctx.fillText(raw(ch), -cwid / 2 + 3, 4);
        ctx.fillStyle = rgba(fc, ca);
        ctx.fillText(raw(ch), -cwid / 2, 0);
        ctx.restore();
      }
      cx += cwid;
    });
    // destello blanco con el primer golpe ("Menos destellos": un tercio)
    const fl = G.U.clamp(1 - Math.abs(t - 0.38) / 0.12, 0, 1);
    if (fl > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(0.5 * fl * (G.Settings.get('calm') ? 0.3 : 1)).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  /** Dónde va el botón del HUD (a la derecha, encima de la barra de movimientos). */
  function buttonRect(w, h) {
    const S = 64;
    const sa = G.Touch.active ? G.Touch.safeArea() : { right: 0, bottom: 0 };
    return { x: w - S - 18 - Math.min(44, sa.right || 0), y: h - S - 132 - Math.min(28, sa.bottom || 0), s: S };
  }
  /**
   * El botón del Movimiento Z (main.gd draw_z): late cuando está listo; gris con "Nv. 15", la cuenta
   * atrás del enfriamiento o "Aquí no" (grieta, Sentencia). Se pulsa con el dedo o el ratón; con
   * mando, el icono del botón asignado a `zmove`; con teclado, la tecla Z.
   */
  function drawButton(ctx, w, h, pl) {
    const zt = activeType(pl);
    if (!zt || busy() || BLOCKED_MODES.includes(G.Game.mode)) return null;
    const r = buttonRect(w, h), c = { x: r.x + r.s / 2, y: r.y + r.s / 2 };
    const tc = rgb(G.U.TYPE_COLOR[zt]);
    const lvlOk = pl.level >= MIN_LEVEL, here = !blocked();
    const ready = !used && lvlOk && here;
    const beat = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    const R = 30;
    ctx.save();
    if (ready) { ctx.fillStyle = rgba(tc, 0.25 + beat * 0.25); ctx.beginPath(); ctx.arc(c.x, c.y, R + 4 + beat * 4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(13,18,36,.85)';
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = ready ? rgba(tc, 1) : 'rgb(128,133,148)';
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.stroke();
    ctx.globalAlpha = ready ? 1 : 0.45;
    G.Icons.draw(ctx, 'zc:' + zt, c.x - 24, c.y - 16 - 2 - (ready ? beat * 2 : 0), 48);
    ctx.globalAlpha = 1;
    ctx.font = F(700, 11);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgb(191,199,217)';
    const label = used && cd > 0 ? G.U.mmss(cd) : !lvlOk ? 'Nv. ' + MIN_LEVEL : !here ? 'Aquí no' : '';
    if (label) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(label, c.x, r.y + r.s + 12); ctx.fillText(label, c.x, r.y + r.s + 12); }
    // lo que se pulsa: el botón del mando o la tecla Z
    if (G.Pad && G.Pad.mode === 'pad') G.Pad.drawGlyph(ctx, 'zmove', r.x - 4, r.y - 4, 22);
    else if (!G.Touch.active) {
      ctx.fillStyle = 'rgba(10,16,28,.9)'; ctx.fillRect(r.x - 2, r.y - 2, 17, 17);
      ctx.strokeStyle = 'rgba(244,248,255,.7)'; ctx.lineWidth = 1; ctx.strokeRect(r.x - 1.5, r.y - 1.5, 16, 16);
      ctx.font = '700 11px Arial,Helvetica,sans-serif'; ctx.fillStyle = '#f4f8ff'; ctx.fillText(raw('Z'), r.x + 6.5, r.y + 10);   // (en Pixelify la Z parece un 2)
    }
    ctx.restore();
    G.Touch.addButton(r.x, r.y, r.s, r.s, () => { if (!tryStart(pl)) G.Audio.sfx('error'); }, 6);
    return r;
  }

  return {
    ORDER, NEED, COOLDOWN, MIN_LEVEL, CINE_T, BOSS_CAP, CRYSTAL_P, ZMIS_COINS, BLOCKED_MODES, DEF, ZMIS,
    unlocked, unlockedList, typesFor, typeFor, choose, grantCrystal, rollCrystal, stat, zdone, zcheck,
    reset, can, tryStart, cineTick, update, updateWorld, drawWorld, drawDim, drawCine, drawButton, buttonRect, blocked, activeType, area,
    get busy() { return busy(); }, get cine() { return state === 'cine'; }, get state() { return state; }, get t() { return t; },
    get used() { return used; }, get cd() { return cd; }, get type() { return ztype; }, get fx() { return fx; }, get wisps() { return wisps.length; }
  };
})();
