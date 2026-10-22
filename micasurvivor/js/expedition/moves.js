'use strict';
/* ============ expedition/moves.js — the 8 new archetypes and move levels to 8 (MicaSurvivor DLC D5, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it. Every entry point acts
 * only on an Expedition run's moves (they carry m.x, set here) or on a move kind the base doesn't know.
 * Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.3 (archetypes, move levels, roll sizes) and the D5 row.
 *
 *   the 8 archetypes   lob, homing, barrage, smite, vortex, wave, spin, weather (the study's names; 5.4 "15 existing + 8
 *                      new"). G.Moves (frozen) never learns them: their moves live in MOVES here, an instance is built by
 *                      instance(id), and js/systems/combat.js hands a kind it doesn't know to the combat.run seam (run()
 *                      here). Numbers: the study's table (damage / cooldown), rescaled like the base moves (K below).
 *   18 Expedition moves  2 per archetype (4 weather moves), each of a type. They reach a run as level-up cards: "moves the
 *                      line learns" (its types) and the kits of other League members of your type (js/expedition/levelups.js)
 *   move levels        an Expedition move (every move of an Expedition run, the kit's too) levels 1 -> 8 (K.MAX_LV). Each
 *                      level: +8 % damage and 2 random stat ROLLS from its archetype's list (3 at Epic or better), scaled
 *                      by the card's rarity multiplier m: damage +22 % m; cooldown -min(25 %, 8 % m); +1 projectile (+2 at
 *                      Epic+); area or speed +15 % m; duration +20 % m; crit +5 % m; status chance +25 % m (study 2.3).
 *                      The level lives in m.xlv (m.lvl stays 1, so a base reader of a snapshot never indexes a ladder
 *                      past its end) and the rolls in m.x.r; refresh() rebuilds the instance from its first-level numbers
 *                      (m.x.b), the League's class factor (m.xk), the level, the rolls and the run's item / vitamin stats.
 *
 * Determinism: the rolls are drawn by the caller from a seeded stream (G.DLC.rng, levelups.js) when the card is DEALT, so
 * the card shows exactly what it gives. The archetypes' own randomness (which foe a smite picks, a crit) is combat, as in
 * the base game (Math.random).
 */
G.ExpEN = Object.assign(G.ExpEN || {}, {
  'Bomba Fango': 'Mud Bomb', 'Bomba Lodo': 'Sludge Bomb', 'Rapidez': 'Swift', 'Hoja Mágica': 'Magical Leaf',
  'Recurrente': 'Bullet Seed', 'Pin Misil': 'Pin Missile', 'Trueno': 'Thunder', 'Ataque Aéreo': 'Sky Attack',
  'Torbellino': 'Whirlpool', 'Ciclón': 'Twister', 'Surf': 'Surf', 'Terremoto': 'Earthquake', 'Giro Rápido': 'Rapid Spin',
  'Giro Bola': 'Gyro Ball', 'Danza Lluvia': 'Rain Dance', 'Día Soleado': 'Sunny Day', 'Tormenta Arena': 'Sandstorm',
  'Paisaje Nevado': 'Snowscape',
  'Lanza una bomba en parábola que estalla donde cae.': 'Lobs a bomb that bursts where it lands.',
  'Disparos que buscan solos al enemigo.': 'Shots that seek out the enemy on their own.',
  'Una ráfaga de disparos rápidos seguidos.': 'A burst of quick shots in a row.',
  'Un golpe cae del cielo sobre varios enemigos.': 'A strike falls from the sky on several foes.',
  'Un remolino que atrae a los enemigos y los daña.': 'A whirl that pulls foes in and hurts them.',
  'Una onda que se expande desde ti y golpea a todos.': 'A wave that spreads out from you and hits everyone.',
  'Giras y golpeas todo lo que te rodea.': 'You spin and hit everything around you.',
  'Cambia el clima de la partida un rato.': "Changes the run's weather for a while.",
  'lanzamiento': 'lob', 'teledirigido': 'homing', 'ráfaga': 'barrage', 'castigo': 'smite', 'remolino': 'vortex',
  'onda': 'wave', 'giro': 'spin', 'clima': 'weather',
  '+{x} % de daño': '+{x}% damage', '-{x} % de recarga': '-{x}% cooldown', '+{x} proyectil': '+{x} projectile',
  '+{x} proyectiles': '+{x} projectiles', '+{x} % de área': '+{x}% area', '+{x} % de velocidad': '+{x}% speed',
  '+{x} % de duración': '+{x}% duration', '+{x} % de crítico': '+{x}% crit', '+{x} % de estado': '+{x}% status chance'
});
G.I18n.add(G.ExpEN);

G.ExpMoves = (() => {
  // ---------------- balance (tune here; README "DLC D5") ----------------
  const K = {
    MAX_LV: 8, LV_DMG: 0.08,            // move levels 1 -> 8, +8 % damage each (study 2.3)
    ROLLS: 2, ROLLS_EPIC: 3,             // stat rolls per level (3 at Epic or better)
    ROLL: { dmg: 0.22, cd: 0.08, cdMax: 0.25, area: 0.15, speed: 0.15, dur: 0.2, crit: 0.05, status: 0.25 },
    CD_FLOOR: 0.35,                     // a move's cooldown never drops under 35 % of its first-level one
    CCP_MAX: 0.8,                       // a status chance never goes over 80 %
    DMG_K: 0.62,                        // the study's damage numbers -> ours (the base moves' tackle 13 / ember 10 scale)
    TICK: 0.25                          // the vortex's damage tick (s)
  };
  // which rolls each archetype can get, in its own order (a roll that doesn't fit the move, e.g. +projectile on a move
  // without a count, is left out by rollsFor)
  const ROLLS_OF = {
    projectile: ['dmg', 'cd', 'count', 'speed', 'crit', 'status'], melee: ['dmg', 'cd', 'area', 'crit', 'status'],
    beam: ['dmg', 'cd', 'area', 'crit'], orbit: ['dmg', 'count', 'area', 'speed'], nova: ['dmg', 'cd', 'count', 'crit'],
    aura: ['dmg', 'cd', 'area', 'status'], buff: ['dur', 'cd'], boomerang: ['dmg', 'count', 'area', 'crit'],
    chain: ['dmg', 'cd', 'count', 'status'], mine: ['dmg', 'cd', 'count', 'area'], meteor: ['dmg', 'cd', 'count', 'area'],
    turret: ['dmg', 'cd', 'dur', 'count'], dash: ['dmg', 'cd', 'area', 'crit'], trail: ['dmg', 'dur', 'area', 'status'],
    cone: ['dmg', 'count', 'area', 'status'],
    lob: ['dmg', 'cd', 'count', 'area', 'crit'], homing: ['dmg', 'cd', 'count', 'speed', 'crit'],
    barrage: ['dmg', 'cd', 'count', 'speed', 'status'], smite: ['dmg', 'cd', 'count', 'crit', 'status'],
    vortex: ['dmg', 'cd', 'area', 'dur'], wave: ['dmg', 'cd', 'area', 'speed', 'status'], spin: ['dmg', 'cd', 'area', 'crit'],
    weather: ['dur', 'cd']
  };
  const KINDS = ['lob', 'homing', 'barrage', 'smite', 'vortex', 'wave', 'spin', 'weather'];
  const KIND_NAME = { lob: 'lanzamiento', homing: 'teledirigido', barrage: 'ráfaga', smite: 'castigo', vortex: 'remolino', wave: 'onda', spin: 'giro', weather: 'clima' };
  const KIND_DESC = {
    lob: 'Lanza una bomba en parábola que estalla donde cae.', homing: 'Disparos que buscan solos al enemigo.',
    barrage: 'Una ráfaga de disparos rápidos seguidos.', smite: 'Un golpe cae del cielo sobre varios enemigos.',
    vortex: 'Un remolino que atrae a los enemigos y los daña.', wave: 'Una onda que se expande desde ti y golpea a todos.',
    spin: 'Giras y golpeas todo lo que te rodea.', weather: 'Cambia el clima de la partida un rato.'
  };
  // the study's table (damage / cooldown): lob 20 / 1.9, homing 9x2 / 1.25, barrage 5x4 / 1.15, smite 24x2 / 1.7,
  // vortex 34 / 3.6, wave 15 / 2.4, spin 9 / 0.8, weather 32 s cooldown / 14 s
  const BASE = {
    lob: { dmg: 20, cd: 1.9, count: 1, radius: 52, speed: 1, xtarget: true, xreach: 360 },
    homing: { dmg: 9, cd: 1.25, count: 2, speed: 300, size: 6, life: 2.2, homing: 5 },
    barrage: { dmg: 5, cd: 1.15, count: 4, speed: 560, size: 5, life: 0.8, spread: 0.06, xtarget: true, xreach: 430 },
    smite: { dmg: 24, cd: 1.7, count: 2, radius: 34, xtarget: true, xreach: 330 },
    vortex: { dmg: 34, cd: 3.6, radius: 74, dur: 2.2, xtarget: true, xreach: 340 },
    wave: { dmg: 15, cd: 2.4, radius: 230, speed: 360 },
    spin: { dmg: 9, cd: 0.8, radius: 66, knock: 120 },
    weather: { cd: 32, dur: 14 }
  };
  const RAW = [
    ['mud-bomb', 'Bomba Fango', 'ground', 'lob', { slow: 0.4 }], ['sludge-bomb', 'Bomba Lodo', 'poison', 'lob', { poison: 3 }],
    ['swift', 'Rapidez', 'normal', 'homing', {}], ['magical-leaf', 'Hoja Mágica', 'grass', 'homing', {}],
    ['bullet-seed', 'Recurrente', 'grass', 'barrage', {}], ['pin-missile', 'Pin Misil', 'bug', 'barrage', {}],
    ['thunder', 'Trueno', 'electric', 'smite', { cc: 'para', ccp: 0.2 }], ['sky-attack', 'Ataque Aéreo', 'flying', 'smite', {}],
    ['whirlpool', 'Torbellino', 'water', 'vortex', {}], ['twister', 'Ciclón', 'dragon', 'vortex', {}],
    ['surf', 'Surf', 'water', 'wave', {}], ['earthquake', 'Terremoto', 'ground', 'wave', {}],
    ['rapid-spin', 'Giro Rápido', 'normal', 'spin', {}], ['gyro-ball', 'Giro Bola', 'steel', 'spin', {}],
    ['rain-dance', 'Danza Lluvia', 'water', 'weather', { wx: 'rain' }], ['sunny-day', 'Día Soleado', 'fire', 'weather', { wx: 'sun' }],
    ['sandstorm', 'Tormenta Arena', 'rock', 'weather', { wx: 'sand' }], ['snowscape', 'Paisaje Nevado', 'ice', 'weather', { wx: 'snow' }]
  ];
  const PHYS = ['bullet-seed', 'pin-missile', 'sky-attack', 'earthquake', 'rapid-spin', 'gyro-ball'];
  const MOVES = {};
  for (const [id, name, type, kind, extra] of RAW) {
    const b = Object.assign({}, BASE[kind]);
    if (b.dmg != null) b.dmg = Math.round(b.dmg * K.DMG_K * 10) / 10;
    // the real games' class (the League scales a move by it: G.ExpLeague.classOf)
    const cls = kind === 'weather' ? 'status' : PHYS.includes(id) ? 'phys' : 'spec';
    MOVES[id] = Object.freeze(Object.assign({ id, name, type, kind, cls, desc: KIND_DESC[kind], xexp: true }, b, extra));
  }
  const isExpMove = id => !!MOVES[id];
  const T = G.I18n;
  // a text with {x} holes: the exact English (the I18n patterns can match an older, shorter one first), else I18n.f
  const F = (es, ...v) => { const en = T.lang === 'en' && G.ExpEN[es]; let i = 0; return en ? en.replace(/\{x\}/g, () => v[i++]) : T.f(es, ...v); };

  /** A fresh instance of a move of either table (an Expedition one here, a base one from G.Moves). */
  function instance(id) {
    const d = MOVES[id];
    if (!d) return G.Moves.BY_ID[id] ? G.Moves.instance(id, 1) : null;
    const s = Object.assign({}, d, { id, def: d, lvl: 1, t: 0 });
    return s;
  }
  /** Learn move id into a free slot (the base addMove for base moves; the same for ours, by hand). -> the instance or null */
  function learn(pl, id) {
    if (!pl || pl.hasMove(id) || pl.slots.length >= pl.maxMoves) return null;
    if (!MOVES[id]) { if (!pl.addMove(id)) return null; return pl.moves.find(m => m.id === id); }
    const m = instance(id);
    pl.moves.push(m);
    const group = [m];
    pl.slots.push(group);
    pl.arrange();
    if (!(pl.slots[pl.active] && pl.slots[pl.active].length > 1)) pl.setActive(pl.slots.indexOf(group));
    return m;
  }

  // ---------------- move levels and rolls ----------------
  const FIELDS = ['dmg', 'cd', 'count', 'speed', 'radius', 'width', 'size', 'dur', 'ccp', 'amount'];
  /** The move's own first-level numbers (taken once; the damage without the League's class factor). */
  function base(m) {
    if (m.x) return m.x.b;
    const b = {};
    for (const f of FIELDS) if (m[f] != null) b[f] = m[f];
    if (b.dmg != null) b.dmg = b.dmg / (m.xk || 1);
    m.x = { b, r: { dmg: 0, cd: 0, count: 0, area: 0, speed: 0, dur: 0, crit: 0, status: 0 }, log: [] };
    m.xlv = m.xlv || 1;
    return b;
  }
  const hasStatus = m => !!(m.cc || m.burn || m.poison || m.slow);
  /** The rolls this move can get (its archetype's list, minus those that don't fit it). */
  function rollsFor(m) {
    const b = base(m), out = [];
    for (const r of ROLLS_OF[m.kind] || ['dmg', 'cd']) {
      if (r === 'dmg' && b.dmg == null) continue;
      if (r === 'crit' && b.dmg == null) continue;
      if (r === 'cd' && m.kind === 'orbit') continue;
      if (r === 'count' && b.count == null) continue;
      if (r === 'speed' && b.speed == null) continue;
      if (r === 'area' && b.radius == null && b.size == null && b.width == null) continue;
      if (r === 'dur' && b.dur == null) continue;
      if (r === 'status' && !hasStatus(m)) continue;
      out.push(r);
    }
    return out.length ? out : ['dmg'];
  }
  /** One roll's size at rarity tier ti (0 common .. 4 legendary) and multiplier mul. */
  function rollValue(kind, ti, mul) {
    const R = K.ROLL;
    switch (kind) {
      case 'dmg': return +(R.dmg * mul).toFixed(4);
      case 'cd': return +Math.min(R.cdMax, R.cd * mul).toFixed(4);
      case 'count': return ti >= 3 ? 2 : 1;
      case 'area': return +(R.area * mul).toFixed(4);
      case 'speed': return +(R.speed * mul).toFixed(4);
      case 'dur': return +(R.dur * mul).toFixed(4);
      case 'crit': return +(R.crit * mul).toFixed(4);
      case 'status': return +(R.status * mul).toFixed(4);
    }
    return 0;
  }
  /** The rolls of one level-up at rarity ti / mul, drawn from rng (no repeats when the list allows). -> [[kind, value]] */
  function drawRolls(m, ti, mul, rng) {
    const list = rollsFor(m).slice(), n = ti >= 3 ? K.ROLLS_EPIC : K.ROLLS, out = [];
    for (let i = 0; i < n; i++) {
      const pool = list.length ? list : rollsFor(m);
      const j = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
      const k = pool[j];
      if (list.length) list.splice(j, 1);
      out.push([k, rollValue(k, ti, mul)]);
    }
    return out;
  }
  function rollText(r) {
    const [k, v] = r, p = Math.round(v * 100);
    switch (k) {
      case 'dmg': return F('+{x} % de daño', p);
      case 'cd': return F('-{x} % de recarga', p);
      case 'count': return F(v === 1 ? '+{x} proyectil' : '+{x} proyectiles', v);
      case 'area': return F('+{x} % de área', p);
      case 'speed': return F('+{x} % de velocidad', p);
      case 'dur': return F('+{x} % de duración', p);
      case 'crit': return F('+{x} % de crítico', p);
      case 'status': return F('+{x} % de estado', p);
    }
    return '';
  }
  /** Level move m up once with these rolls (refresh rebuilds its numbers). */
  function levelUp(pl, m, rolls) {
    base(m);
    if (m.xlv >= K.MAX_LV) return false;
    m.xlv++;
    for (const [k, v] of rolls || []) m.x.r[k] = (m.x.r[k] || 0) + v;
    m.x.log.push(rolls || []);
    refresh(pl, m);
    return true;
  }
  /** Give m extra rolls without a level (a new move dealt at a rarity above common). */
  function addRolls(pl, m, rolls) {
    base(m);
    for (const [k, v] of rolls || []) m.x.r[k] = (m.x.r[k] || 0) + v;
    refresh(pl, m);
  }

  /** Rebuild one move's numbers: first level x class factor x level x rolls x the run's stats (G.ExpItems.total). */
  function refresh(pl, m) {
    const b = base(m), r = m.x.r, I = G.ExpItems, tot = s => (I ? I.total(pl, s) : 0);
    const cls = G.ExpLeague ? G.ExpLeague.classOf(m.id) : 'spec';
    if (b.dmg != null) {
      const typeK = 1 + tot('type.' + m.type);
      const clsK = 1 + (cls === 'phys' ? tot('phys') : cls === 'spec' ? tot('spec') : 0);
      m.dmg = b.dmg * (m.xk || 1) * (1 + K.LV_DMG * (m.xlv - 1)) * (1 + r.dmg) * typeK * clsK;
    }
    if (b.cd != null) m.cd = b.cd * Math.max(K.CD_FLOOR, 1 - r.cd);
    if (b.count != null) m.count = b.count + r.count + (m.kind === 'orbit' || m.kind === 'chain' || m.kind === 'turret' || m.kind === 'mine' ? 0 : Math.floor(tot('proj')));
    if (b.speed != null) m.speed = b.speed * (1 + r.speed + (m.kind === 'orbit' || m.kind === 'lob' ? 0 : tot('pspd')));
    const area = 1 + r.area + tot('area');
    if (b.radius != null) m.radius = b.radius * area;
    if (b.width != null) m.width = b.width * area;
    if (b.size != null) m.size = b.size * (1 + (area - 1) * 0.5);
    if (b.dur != null) m.dur = b.dur * (1 + r.dur + tot('dur'));
    if (b.amount != null) m.amount = b.amount * (1 + r.dur * 0.5);
    if (b.ccp != null) m.ccp = Math.min(K.CCP_MAX, b.ccp * (1 + r.status + tot('status')));
    const crit = r.crit;
    if (crit > 0) m.xcrit = crit; else delete m.xcrit;
    return m;
  }
  function refreshAll(pl) { if (pl) for (const m of pl.moves) refresh(pl, m); }
  /** A move's level / the text of its rolls so far (the bag screen). */
  const levelOf = m => m.xlv || 1;

  // ---------------- the archetypes in combat (the combat.run seam) ----------------
  let effects = [];   // timed effects: shells in the air, barrage shots to come, smites to fall, vortexes, waves
  const col = m => G.U.TYPE_COLOR[m.type] || '#ffffff';
  /** One hit of an Expedition effect (combat's own private hit, rebuilt from its exported land()). */
  function hitE(pl, e, dmg, c, dx, dy, knock, m, ghost) {
    if (ghost || !e || e.dead) return 0;
    const crit = pl.critChance + (m.xcrit || 0) > 0 && Math.random() < pl.critChance + (m.xcrit || 0);
    const src = { type: m.type, mtype: m.type, cc: m.cc || '', ccp: m.ccp || 0, burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, mkind: m.kind, mid: m.id, kind: m.kind };
    const d = G.Combat.land(e, dmg, c, dx, dy, knock, src, crit, pl);
    pl.onDealt(d);
    pl.dmgDealt += d;
    return d;
  }
  function nearest(x, y, r, n, skip) {
    const out = [];
    for (const e of G.EnemyMgr.queryCircle(x, y, r)) if (!e.dead && !(skip && skip.has(e))) out.push([G.U.dist2(e.x, e.y, x, y), e]);
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, n).map(o => o[1]);
  }
  function shot(pl, m, a, ghost, extra) {
    G.Projectiles.spawn(Object.assign({
      x: pl.x + Math.cos(a) * 3, y: pl.y + Math.sin(a) * 3, vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
      dmg: m.dmg * pl.atk, r: m.size || 5, life: m.life || 1, pierce: m.pierce | 0, color: col(m), homing: m.homing || 0,
      hits: new Set(), vis: G.VFX.forMove(m), ghost, owner: pl,
      burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, knock: m.knock || 0, mtype: m.type, cc: m.cc || '', ccp: m.ccp || 0, mkind: m.kind, mid: m.id
    }, m.xcrit ? { xcrit: m.xcrit } : {}, extra || {}));
  }
  /** combat.run: an archetype the base doesn't know. (ghost: a co-op partner's cast, shown only.) */
  function run(pl, m, ghost) {
    if (!pl || !m || !BASE[m.kind]) return;
    const c = col(m), tg = pl.target;
    switch (m.kind) {
      case 'lob': {
        const n = Math.max(1, m.count | 0), foes = nearest(pl.x, pl.y, m.xreach, n);
        for (let i = 0; i < n; i++) {
          const e = foes[i % Math.max(1, foes.length)] || tg;
          const tx = e ? e.x + (i >= foes.length ? G.U.rand(-30, 30) : 0) : pl.x + Math.cos(pl.aim) * 200, ty = e ? e.y : pl.y + Math.sin(pl.aim) * 200;
          effects.push({ k: 'lob', pl, m, ghost, x0: pl.x, y0: pl.y, x: tx, y: ty, t: 0, dur: 0.55 + i * 0.05 });
        }
        break;
      }
      case 'homing': {
        const n = Math.max(1, m.count | 0);
        for (let i = 0; i < n; i++) shot(pl, m, pl.aim + (i - (n - 1) / 2) * 0.5, ghost);
        break;
      }
      case 'barrage': {
        const n = Math.max(1, m.count | 0);
        shot(pl, m, pl.aim, ghost);
        for (let i = 1; i < n; i++) effects.push({ k: 'bar', pl, m, ghost, t: -i * 0.07 });
        break;
      }
      case 'smite': {
        const n = Math.max(1, m.count | 0), foes = nearest(pl.x, pl.y, m.xreach, n);
        if (!foes.length && tg) foes.push(tg);
        for (const e of foes) effects.push({ k: 'smite', pl, m, ghost, x: e.x, y: e.y, t: 0, dur: 0.28 });
        break;
      }
      case 'vortex': {
        const e = tg || nearest(pl.x, pl.y, m.xreach, 1)[0];
        const x = e ? e.x : pl.x + Math.cos(pl.aim) * 160, y = e ? e.y : pl.y + Math.sin(pl.aim) * 160;
        effects.push({ k: 'vortex', pl, m, ghost, x, y, t: 0, dur: m.dur || 2, tick: 0 });
        break;
      }
      case 'wave':
        effects.push({ k: 'wave', pl, m, ghost, x: pl.x, y: pl.y, r: pl.r, hit: new Set() });
        G.Camera.kick(0.15);
        break;
      case 'spin':
        G.FX.ring(pl.x, pl.y, m.radius * 0.4, m.radius, c, 0.25, 4);
        G.FX.burst(pl.x, pl.y - G.LIFT * 0.5, c, 10, 160);
        if (!ghost) for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, m.radius)) hitE(pl, e, m.dmg * pl.atk, c, e.x - pl.x, e.y - pl.y, m.knock || 0, m, ghost);
        break;
      case 'weather': {
        if (ghost || !m.wx || !G.Weather.KINDS[m.wx]) break;
        G.Weather.force(m.wx, Math.round(m.dur || 14));
        if (G.Coop.active && G.Coop.isHost) G.Coop.broadcast(['wx', m.wx, Math.round(m.dur || 14)]);
        G.FX.ring(pl.x, pl.y, 8, 140, c, 0.6, 4);
        break;
      }
    }
  }
  /** combat.ghost: a co-op partner cast an Expedition move: show it (no damage). */
  function ghost(pl, id, lvl, aim) {
    const m = instance(id);
    if (!m || !MOVES[id]) return;
    pl.aim = aim;
    pl.cast(m);
    run(pl, m, true);
  }
  /** run.tick: every timed effect. */
  function tick(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const f = effects[i], pl = f.pl, m = f.m, c = col(m);
      if (!pl || pl.dead) { effects.splice(i, 1); continue; }
      f.t = (f.t || 0) + dt;
      if (f.k === 'lob') {
        if (f.t < f.dur) continue;
        G.FX.ring(f.x, f.y, 6, m.radius, c, 0.35, 4);
        G.FX.burst(f.x, f.y - 6, c, 12, 170);
        if (!f.ghost) for (const e of G.EnemyMgr.queryCircle(f.x, f.y, m.radius)) hitE(pl, e, m.dmg * pl.atk, c, e.x - f.x, e.y - f.y, 60, m, f.ghost);
        effects.splice(i, 1);
      } else if (f.k === 'bar') {
        if (f.t < 0) continue;
        shot(pl, m, pl.aim + G.U.rand(-1, 1) * (m.spread || 0.06), f.ghost);
        effects.splice(i, 1);
      } else if (f.k === 'smite') {
        if (f.t < f.dur) continue;
        G.FX.beam(f.x, f.y - 220, Math.PI / 2, 220, 5, c);
        G.FX.ring(f.x, f.y, 4, m.radius, c, 0.3, 3);
        if (!f.ghost) for (const e of G.EnemyMgr.queryCircle(f.x, f.y, m.radius)) hitE(pl, e, m.dmg * pl.atk, c, 0, 1, 40, m, f.ghost);
        effects.splice(i, 1);
      } else if (f.k === 'vortex') {
        f.tick += dt;
        for (const e of G.EnemyMgr.queryCircle(f.x, f.y, m.radius * 1.6)) {
          if (e.dead || e.boss || e.remote) continue;
          const [nx, ny] = G.U.norm(f.x - e.x, f.y - e.y);
          e.x += nx * 110 * dt; e.y += ny * 110 * dt;
        }
        if (f.tick >= K.TICK) {
          f.tick -= K.TICK;
          if (!f.ghost) for (const e of G.EnemyMgr.queryCircle(f.x, f.y, m.radius)) hitE(pl, e, m.dmg * pl.atk * K.TICK / (f.dur || 2), c, e.x - f.x, e.y - f.y, 0, m, f.ghost);
        }
        if (f.t >= f.dur) effects.splice(i, 1);
      } else if (f.k === 'wave') {
        f.r += (m.speed || 360) * dt;
        if (!f.ghost) for (const e of G.EnemyMgr.queryCircle(f.x, f.y, f.r)) {
          if (f.hit.has(e) || G.U.dist(e.x, e.y, f.x, f.y) < f.r - 40) continue;
          f.hit.add(e);
          hitE(pl, e, m.dmg * pl.atk, c, e.x - f.x, e.y - f.y, 90, m, f.ghost);
        }
        if (f.r >= m.radius) effects.splice(i, 1);
      }
    }
  }
  /** The effects on the ground (js/expedition/classic.js drawGround, under everyone). */
  function draw(ctx) {
    if (!effects.length) return;
    const now = performance.now() / 1000;
    ctx.save();
    for (const f of effects) {
      const m = f.m, c = col(m);
      if (f.k === 'lob') {
        const k = Math.min(1, f.t / f.dur), x = f.x0 + (f.x - f.x0) * k, y = f.y0 + (f.y - f.y0) * k, h = Math.sin(k * Math.PI) * 90;
        ctx.globalAlpha = 0.35; ctx.strokeStyle = c; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, m.radius, m.radius * 0.6, 0, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(x, y - h, 7, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (f.k === 'smite') {
        ctx.globalAlpha = 0.25 + 0.5 * (f.t / f.dur); ctx.fillStyle = c;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, m.radius, m.radius * 0.6, 0, 0, 6.2832); ctx.fill();
      } else if (f.k === 'vortex') {
        const k = 1 - f.t / f.dur;
        for (let j = 0; j < 3; j++) {
          ctx.globalAlpha = 0.25 + 0.2 * k; ctx.strokeStyle = c; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, m.radius * (1 - j * 0.28), m.radius * 0.6 * (1 - j * 0.28), now * (3 + j), 0.3, 4.8); ctx.stroke();
        }
      } else if (f.k === 'wave') {
        ctx.globalAlpha = Math.max(0.1, 0.6 * (1 - f.r / m.radius)); ctx.strokeStyle = c; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.62, 0, 0, 6.2832); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function clear(owner) { effects = owner ? effects.filter(f => f.pl !== owner) : []; }

  /** The card line for a new move: its type and archetype. */
  const kindName = m => T.t(KIND_NAME[m.kind] || m.kind);

  return {
    K, KINDS, MOVES, BASE, ROLLS_OF, KIND_NAME, isExpMove, instance, learn, base, rollsFor, rollValue, drawRolls, rollText,
    levelUp, addRolls, refresh, refreshAll, levelOf, run, ghost, tick, draw, clear, kindName,
    get effects() { return effects; }
  };
})();
