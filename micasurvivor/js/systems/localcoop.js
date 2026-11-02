/* ============ localcoop.js — Modo Cooperativo local (MicaSurvivor M5 lote 12a) ============
 * Del port de Android de JayElDragon (MIT, github.com/JayElDragon/poke-survivor): menu.gd 1584-1600 (la
 * tarjeta "Modo Cooperativo" y "Elegir compañero"), 2109 / 2151-2156 (el selector: sólo tus Pokémon;
 * guarda coop_dex), main.gd 162-167 / 195-202 (estado), 439 / 523-524 (empezar), 815-817 / 838-841 (al
 * acabar: -20 % de monedas, stats coopRuns y groupRuns), 985-989 (cada fotograma), 1062 (la barra), 1243 /
 * 1267 (sin Z ni Dynamax mientras espectas), 1623-1731 (coop_dex, _partner_move_for, _setup_partner,
 * _update_partner), 1807-1811 (los golpes van al compañero), 1917 (al caer), 1939-2007 (_enter_down,
 * _update_down, _revive_from_down, _hurt_partner), 8653-8661 (el aviso de espectador) y progress.gd 105-106 /
 * 155 (los logros "partida en grupo" cuentan el cooperativo). Los números son del port.
 *
 *   Un segundo Pokémon (el compañero, `mate`) te acompaña en la partida. Nunca le pegan mientras tú estés en
 *   pie: los enemigos van a por ti, como en el port.
 *   - Lo mueve la IA, o el jugador 2 con el stick izquierdo de un SEGUNDO mando (el port: el segundo mando
 *     conectado; aquí, el que no usa el jugador 1, js/core/pad.js p2). Zona muerta 0,22 sin reescalar,
 *     velocidad fija 118. El jugador 2 no tiene botones ni maneja los menús (el port sólo lee su stick). Si
 *     el mando se desconecta, vuelve la IA; si se conecta, manda él. El segundo mando pasa por la misma capa
 *     que el primero (js/core/pad.js): funciona para quien pueda usar el del jugador 1.
 *   - IA: si estás a más de 150, va hacia ti; si estás a menos de 120 y hay un enemigo a menos de 240, se
 *     acerca a él a media velocidad; si no, se para. El giro se suaviza (×5 por segundo). Si se queda a más
 *     de 520 de ti, aparece a 70 de ti con un aro azul (también con el jugador 2; no mientras espectas).
 *   - Ataca solo: el primer movimiento de proyectil de su tipo principal (si no hay, uno Normal; si tampoco,
 *     Ascuas), de nivel 1 + tu nivel / 6 (hasta 6), al enemigo más cercano a menos de 520. Cada disparo ×0,8
 *     de daño y su recarga ×1,15 (sin tus mejoras de recarga). "Comparte tus mejoras": el daño sale de tu
 *     ataque (mejoras, cartas, objetos, habilidad, Dynamax), el tamaño de tu Calibre / Esfera Colosal, tus
 *     críticos y los efectos de tus objetos al golpear. Sus golpes van a "Compañero / equipo" en el desglose.
 *   - En la grieta no está (ni se ve); vuelve al salir.
 *   - Si caes (después de la Segunda oportunidad), no se acaba: espectas a tu compañero (la cámara le sigue)
 *     durante 20 s y luego te revive con la mitad de tu vida (2,5 s invulnerable, empuja a los enemigos a
 *     menos de 220). Mientras, él tiene tu vida máxima, recibe los golpes que te tocarían a ti (×0,8; con su
 *     tipo y el clima; 0,45 s invulnerable tras cada uno) y la IA huye de los enemigos a menos de 190. Si cae
 *     él, se acaba la partida. Sin Movimiento Z ni Dynamax mientras espectas (el Dynamax se acaba al caer).
 *   - Es su propio modo (con los modificadores elegidos, como la partida normal): -20 % de monedas al acabar
 *     (multiplica, como el port). Ni ranking ni grupo online. Stats coopRuns y, si dura 60 s o más,
 *     groupRuns (los logros "En compañía" y "Compañero fiel", progress.gd 105-106).
 *
 *   El compañero se guarda en save.coopDex (el coop_dex del port) con save.coopAt (cuándo se eligió): al
 *   fusionar dos partidas gana el elegido más tarde. Sin elegir (o si ya no vale): el primero del equipo
 *   (js/systems/team.js list) que no sea el tuyo; si no, Eevee (Pikachu si juegas con Eevee).
 *
 * MicaSurvivor U2 (Plans/MICASURVIVOR_UNIFIED_PLAN.md, owner decision 4: "local multiplayer = 2-4 pads with FULL kits"): the
 * Play flow's Players step sets how many play on this device (setPlayers(n, pads), n = 2..4, consumed by the next run's
 * begin). Then every variant (each Survival mode, Classic, Survival, Dive, the Weekly) brings n - 1 partners, each with a
 * FULL kit, on its own pad (pads 2-4: G.Pad.others(), the ones that pressed A on the join row first) or the AI (no pad):
 *   - its own Pokémon (save.coopDex for player 2, coopDex3 / coopDex4 for 3 and 4; else the team's next ones), its own
 *     family upgrades (G.Upgrades.perks), every move firing on its own cooldown (G.Combat.tick with it: its own attack,
 *     items, crits; hits go to "Partner / team"), its own held item slot (an item it picks up is equipped on it; a Rare Candy
 *     levels the team), the shared level (each level you pick a card, each partner takes one too: a new move of its pool, a
 *     move level or a stat, picked for it: the cards are player 1's screen)
 *   - the mode's kit rules: base = its start move (+ Repertoire); Expedition = its League member's kit (the stage's stats,
 *     the kit's next move at Lv 2, 4, 6) and its Ultimate (Y / RB / RT on its pad: charged in 95 s, cast when full; the AI
 *     casts it with a foe near); Dive = PokéDive's kit (basic + 2 specials pressed on X / Y, dodge on A / B), the Ultimate on
 *     RB / RT / LB. Expedition: hop on A, slide on B.
 *   - the rest is today's partner: it never takes hits while you stand; if you fall you spectate the first partner, which
 *     takes your hits for 20 s; leash 520; the camera frames you and every pad partner.
 * The legacy partner (the old screen's "Co-op Mode" card, mode 'coop', and the Expedition's micasurvivorexp_mate setting)
 * plays exactly as before (above): one partner, one auto move at ×0.8 of your attack. Neither ever goes online (an online
 * run is one player per device) and no local run reaches a solo board (game.js endRun; js/expedition/core.js boardOk).
 */
G.I18n.add({
  'Jugador {x}: mando conectado': 'Player {x}: controller connected',
  'Jugador {x}: mando desconectado, la IA lleva a tu compañero': 'Player {x}: controller disconnected, the AI takes over',
  'J3': 'P3', 'J4': 'P4', '{x} · J3': '{x} · P3', '{x} · J4': '{x} · P4', '¡Definitivo de {x}!': '{x}\'s Ultimate!'
});
G.LocalCoop = (() => {
  const K = {
    speed: 118,          // velocidad fija (main.gd 1697)
    follow: 150,         // a más de esto de ti, va hacia ti
    engage: 120,         // a menos de esto de ti, se acerca a un enemigo...
    seek: 240,           // ... que esté a menos de esto de él
    flee: 190,           // espectando: huye de los enemigos a menos de esto
    steer: 5,            // suavizado del giro (lerp × dt × 5)
    leash: 520,          // a más de esto de ti, aparece a tu lado
    tpR: 70,             // ... a esta distancia
    tpRing: { r0: 6, r1: 80, color: '#9ad0ff', dur: 0.5 },
    dz: 0.22,            // zona muerta del stick del jugador 2
    reach: 520,          // AIM_REACH: alcance para apuntar
    dmg: 0.8,            // daño de cada disparo
    cd: 1.15,            // recarga
    lvEvery: 6, lvMax: 6,
    start: [60, 20],     // dónde aparece al empezar
    coins: 0.8,          // -20 % de monedas
    groupMin: 60,        // s para que cuente como partida en grupo
    reviveT: 20,         // s espectando hasta que te revive
    downK: 0.8,          // daño que recibe él mientras espectas
    downInv: 0.45,
    reviveHp: 0.5, reviveInv: 2.5, reviveR: 220, reviveKnock: 450, reviveOff: [-50, 10],
    downRing: { r0: 8, r1: 160, color: '#9ad0ff', dur: 0.7 },
    reviveRing: { r0: 8, r1: 240, color: '#7dffb0', dur: 0.8 },
    fallback: 133, fallback2: 25,
    // U2 (full kits): up to 4 players on one device; the Ultimate's passive charge (js/expedition/ultimates.js PASSIVE_T)
    // and the AI's cast range; the kit's next move at Lv 2, 4, 6 (Expedition); the AI presses a Dive special this often
    maxPlayers: 4, ultT: 95, ultR: 480, kitEvery: 2, aiSpecial: 0.5
  };
  const COLOR = '#5fc8ff';   // el segundo color del cooperativo (net/coop.js COLORS[1])
  const COLORS = ['#ffcb3d', '#5fc8ff', '#7ee07a', '#ff8ad8'];   // (U2: player n's colour, as online)
  const DEX_KEYS = [null, null, 'coopDex', 'coopDex3', 'coopDex4'];   // (U2: player n's pick in the save)

  const save = () => G.DB && G.DB.save;
  const valid = d => !!(G.DEX_BY && G.DEX_BY[d] && G.SPRITE_META && G.SPRITE_META[d]);

  // ======================= el compañero elegido (save.coopDex; U2: coopDex3 / coopDex4) =======================
  /** El compañero de la partida (main.gd coop_dex): el elegido; si no, el primero del equipo que no seas tú; si no, Eevee.
   *  (U2: n = the player 2..4; `taken` = Pokémon already playing, so 3 and 4 fall back to the team's next ones.) */
  function dex(s = save(), runDex = s && s.partner, n = 2, taken = []) {
    if (!s) return K.fallback;
    const d = Math.floor(+s[DEX_KEYS[n] || 'coopDex']);
    if (d > 0 && valid(d)) return d;
    const team = G.Team ? G.Team.list(s) : [];
    for (const x of team) if (+x !== +runDex && !taken.includes(+x)) return +x;
    if (n > 2) for (const x of owned(s)) if (+x !== +runDex && !taken.includes(+x)) return +x;
    return +runDex === K.fallback ? K.fallback2 : K.fallback;
  }
  /** "Elegir compañero": sólo uno de los tuyos (menu.gd 2109). (U2: n = the player it is for, 2..4) */
  function pick(d, n = 2) {
    d = Math.floor(+d);
    const s = save();
    if (!s || !valid(d) || !(s.owned && s.owned[d]) || !DEX_KEYS[n]) return false;
    s[DEX_KEYS[n]] = d; s.coopAt = Date.now();
    G.DB.commit();
    return true;
  }
  /** Tus Pokémon para el selector. */
  function owned(s = save()) { return s && s.owned ? Object.keys(s.owned).map(Number).filter(valid).sort((a, b) => a - b) : []; }

  /** db.js merge: gana el elegido más tarde (coopAt). (U2: the three picks go together) */
  function merge(r, older) {
    if (!older || (older.coopDex == null && older.coopDex3 == null && older.coopDex4 == null)) return;
    if ((r.coopDex == null && r.coopDex3 == null && r.coopDex4 == null) || (+older.coopAt || 0) > (+r.coopAt || 0)) {
      for (const k of ['coopDex', 'coopDex3', 'coopDex4']) { if (older[k] != null) r[k] = older[k]; else delete r[k]; }
      r.coopAt = older.coopAt || 0;
    }
  }
  /** db.js sanitize: un número de Pokémon que exista, y su fecha. */
  function sanitize(s) {
    if (s.coopDex == null && s.coopAt == null && s.coopDex3 == null && s.coopDex4 == null) return;
    for (const k of ['coopDex3', 'coopDex4']) {
      if (s[k] == null) continue;
      const d = Math.floor(+s[k]);
      if (d > 0 && G.DEX_BY && G.DEX_BY[d]) s[k] = d; else delete s[k];
    }
    if (s.coopDex != null) {
      const d = Math.floor(+s.coopDex);
      if (!(d > 0) || !(G.DEX_BY && G.DEX_BY[d])) delete s.coopDex; else s.coopDex = d;
    }
    if (s.coopDex == null && s.coopDex3 == null && s.coopDex4 == null) { delete s.coopAt; return; }
    s.coopAt = Number.isFinite(+s.coopAt) && +s.coopAt > 0 ? Math.floor(+s.coopAt) : 0;
  }

  // ======================= U2: how many play on this device (the Play flow) =======================
  let want = 1, wantPads = [], ran = 1, planned = false;
  /** The next run is played by n players on this device (1..4); pads = the pad indices that joined, in order (players 2..). */
  function setPlayers(n, pads = []) {
    want = G.U.clamp(Math.floor(+n) || 1, 1, K.maxPlayers);
    planned = true;
    wantPads = (Array.isArray(pads) ? pads : []).filter(i => Number.isInteger(i)).slice(0, want - 1);
    return want;
  }

  // ======================= la partida =======================
  // One record per partner: {pl, n, full, ctrl ('pad' | 'ai'), padIdx, padId, dir, cd, move, lvl, prev, aiHopT, aiSlideT,
  // aiSpT, ult {c, fx, ready}, member, kit, kitN, color}. The legacy getters below read the first one.
  let on = false, full = false, mates = [], joinPads = [];
  let down = false, downT = 0, mateHp = 1, mateMax = 1, mateInv = 0, tpN = 0;
  const reset = () => { on = false; full = false; mates = []; joinPads = []; down = false; downT = 0; mateHp = mateMax = 1; mateInv = 0; tpN = 0; };
  const first = () => mates[0] || null;

  /** El movimiento del compañero (main.gd _partner_move_for). */
  function moveFor(d, level) {
    const mon = G.DEX_BY[d], ty = (mon && mon.types && mon.types[0]) || 'normal';
    const all = G.Moves.ALL;
    const m = all.find(x => x.kind === 'projectile' && x.type === ty) || all.find(x => x.kind === 'projectile' && x.type === 'normal');
    const id = m ? m.id : 'ember';
    return G.Moves.instance(id, Math.min(level, G.Moves.BY_ID[id].maxLvl));
  }
  const levelFor = pl => G.U.clamp(1 + Math.floor(pl.level / K.lvEvery), 1, K.lvMax);

  /** Un sitio libre cerca de (x, y) (main.gd _free_spot). */
  function freeSpot(x, y, r = 14) {
    if (G.World.isFree(x, y, r)) return [x, y];
    for (let ring = 1; ring <= 8; ring++) {
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2, d = ring * 16;
        const nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
        if (G.World.isFree(nx, ny, r)) return [nx, ny];
      }
    }
    return [x, y];
  }

  const isExp = () => !!(G.Modes && G.Modes.isExp && G.Modes.isExp());
  const isDive = () => isExp() && G.Modes.run && G.Modes.run.mode === 'exp-dive';

  /** Al empezar (game.js startRun): main.gd _setup_partner. (U2: the Play flow's players, each with a full kit.) */
  function begin(pl) {
    const n = want, pads = wantPads, chosen = planned;
    want = 1; wantPads = []; planned = false;   // (one run: the Play flow sets it again)
    reset();
    ran = 1;
    if (!pl || !G.Game || (G.Coop && G.Coop.active) || (G.Modes.run && G.Modes.run.group)) return;
    // (MicaSurvivor DLC D11: an Expedition run with player 2's pad connected, or the Expedition's "local partner" setting,
    //  brings the partner too: G.Exp.localMate, js/expedition/core.js. A base run: only the 'coop' mode, as always.)
    // (U2: a run the Play flow started says how many play: Solo is solo, even with a second pad plugged in)
    const expMate = !chosen && isExp() && !!(G.Exp && G.Exp.localMate && G.Exp.localMate());
    full = n >= 2;
    if (!full && G.Game.mode !== 'coop' && !expMate) return;
    const s = save(), count = full ? n - 1 : 1, taken = [+pl.dex];
    joinPads = pads.slice();
    for (let i = 0; i < count; i++) {
      const pn = i + 2, d = dex(s, pl.dex, pn, taken), mon = G.DEX_BY[d];
      if (!mon) continue;
      taken.push(d);
      const shiny = !!(s && s.partnerShiny) && G.DB.ownsShiny(d) && G.Sprites.hasShiny(d);
      const perks = full ? G.Upgrades.perks(G.DB.levelsOf ? G.DB.levelsOf(d) : {}) : {};
      const p = new G.Player(mon, perks, shiny);
      p.remote = true;            // (no es tuyo: ni objetos ni Segunda oportunidad ni daño de terreno)
      p.isMate = true;
      p.mateN = pn;
      p.tagColor = full ? COLORS[pn - 1] : COLOR;
      const off = [[K.start[0], K.start[1]], [-K.start[0], K.start[1]], [0, -K.start[0]]][i] || K.start;
      const [x, y] = freeSpot(pl.x + off[0], pl.y + off[1]);
      p.x = x; p.y = y;
      const M = { pl: p, n: pn, full, ctrl: 'ai', padIdx: null, padId: '', dir: [0, 0], cd: 0, move: null, lvl: 0, prev: [],
                  aiHopT: 0, aiSlideT: 0, aiSpT: 0, ult: { c: 0, fx: null, ready: false }, member: 0, kit: [], kitN: 0, color: p.tagColor };
      if (full) baseKit(M, perks); else syncMove(M, pl);
      mates.push(M);
      G.Sprites.preload([d], 8000, shiny);
    }
    if (!mates.length) return;
    on = true;
    ran = 1 + mates.length;
    poll(true);
  }
  /** U2, after the run's start seam (game.js startRun: the Expedition has set YOUR kit): each partner's Expedition / Dive kit. */
  function afterStart(pl) {
    if (!on || !full || !isExp()) return;
    for (const M of mates) expKit(M, pl);
  }
  function end() { for (const M of mates) G.Projectiles.clearOrbs(M.pl); if (G.Game && G.Game.player) G.Game.player.coopDown = false; reset(); }

  // ---------------- U2: the full kits ----------------
  /** Base: its start move (+ a second one with the Repertoire upgrade), every slot firing at the run's move-damage factor. */
  function baseKit(M, perks) {
    const p = M.pl;
    p.afDmg = G.Combat.AF.DMG;
    p.addMove(G.startMoveOf(p.dex));
    if (perks.startMoves >= 2) {
      const pool = G.Moves.poolFor(p.mon).filter(id => !p.hasMove(id) && G.Moves.BY_ID[id].kind !== 'buff');
      if (pool.length) p.addMove(G.U.pick(pool));
    }
    p.level = 1;
  }
  /** Expedition: its League member's kit on the stage's stats (as G.ExpLeague.begin does for you); Dive: 3 slots, specials. */
  function expKit(M, pl) {
    const LG = G.ExpLeague, p = M.pl, d = p.dex;
    if (!LG || !LG.BY) return;
    const member = LG.FAM && LG.BY[LG.FAM[d]] ? LG.FAM[d] : LG.K.DEFAULT, m = LG.BY[member];
    const st = LG.statsOf(d);
    p.mon = Object.assign({}, G.DEX_BY[d], { hp: st.hp, spd: st.spd, atk: st.atk });
    p.baseSpd = st.spd; p.baseAtk = st.atk;
    p.maxHp = Math.max(1, p.maxHp - G.DEX_BY[d].hp + st.hp); p.hp = p.maxHp;
    p.dmgReduce += st.taken || 0;
    p.afDmg = G.Combat.AF.DMG_EXP;
    G.Projectiles.clearOrbs(p);
    p.moves = []; p.slots = []; p.active = 0;
    p.xkit = true; p.xst = st;
    M.member = member; M.kit = (m && m.kit) || []; M.kitN = 0;
    const n = isDive() ? Math.min(3, M.kit.length) : 1;
    for (let i = 0; i < n; i++) learnKit(M);
    if (!p.moves.length) p.addMove(G.startMoveOf(d));
    if (isDive()) { p.maxMoves = 3; roles(p); }
    p.level = pl.level;
  }
  function learnKit(M) {
    const p = M.pl, LG = G.ExpLeague;
    while (M.kitN < M.kit.length) {
      const id = M.kit[M.kitN++];
      if (!id || p.hasMove(id) || !G.Moves.BY_ID[id]) continue;
      if (!p.addMove(id)) return false;
      const mv = p.moves.find(x => x.id === id);
      if (mv && mv.dmg != null && LG && LG.factorOf && p.xst) { const k = LG.factorOf(id, p.xst); mv.dmg *= k; mv.xk = k; }
      return true;
    }
    return false;
  }
  /** Dive: slot 1 the basic (auto), slots 2-3 the specials (pressed), as js/expedition/dive.js roles. */
  function roles(p) { p.slots.forEach((g, i) => { for (const m of g) { m.xman = i > 0; if (!(i > 0)) m.xreq = 0; } }); }

  /** U2: player 1 picked a level-up card: each full-kit partner takes one too (picked for it). */
  function levelUp() {
    if (!on || !full) return;
    const pl = G.Game && G.Game.player;
    for (const M of mates) {
      const p = M.pl;
      if (pl) p.level = pl.level;
      try {
        if (isExp()) {
          if (!isDive() && p.slots.length < p.maxMoves && p.level >= K.kitEvery * (M.kitN) && learnKit(M)) continue;
          statCard(p);
          continue;
        }
        const cards = G.LevelUp.offer(p, 3);
        const c = cards.find(x => x.type === 'evo') || cards.find(x => x.type === 'new') || cards.find(x => x.type === 'up') || cards[0];
        if (c) c.apply(p); else statCard(p);
      } catch (e) { console.warn('[LocalCoop] level-up', e); }
    }
  }
  function statCard(p) {
    const S = (G.LevelUp.STATS || []).filter(s => !s.max || (p.statsTaken[s.id] || 0) < s.max);
    if (!S.length) return;
    const s = G.U.pick(S);
    s.apply(p); p.statsTaken[s.id] = (p.statsTaken[s.id] || 0) + 1;
  }
  /** U2: a partner picked up a held item: on ITS slot (an instant one, a Rare Candy, is the team's: game.js). -> true if taken */
  function takeItem(p, id) {
    const it = G.Items.BY[id];
    if (!p || !p.isMate || !it || it.instant) return false;
    if (p.hasItem(id)) return true;
    p.equip(id, 1);
    G.FX.dmgText(p.x, p.y - p.bodyH - 10, it.name, p.tagColor || '#fff', true);
    return true;
  }
  /** U2: the partners who pick things up (full kits: they walk over pickups too). */
  const collectors = pl => (on && full && visible(pl) ? mates.map(M => M.pl) : []);
  /** U2: the camera frames you and every pad partner near you (full kits); else you. */
  function camTarget(pl) {
    if (!on || !full || !visible(pl)) return [pl.x, pl.y];
    let x = pl.x, y = pl.y, n = 1;
    for (const M of mates) if (M.ctrl === 'pad' && G.U.dist2(M.pl.x, M.pl.y, pl.x, pl.y) < 420 * 420) { x += M.pl.x; y += M.pl.y; n++; }
    return [x / n, y / n];
  }

  function syncMove(M, pl) {
    const L = levelFor(pl);
    if (L === M.lvl && M.move) return;
    M.lvl = L;
    M.move = moveFor(M.pl.dex, L);
    M.pl.moves = [M.move]; M.pl.slots = [[M.move]]; M.pl.active = 0;
  }

  /** ¿Quién lleva al compañero? (main.gd 1672: el segundo mando conectado, cada fotograma) (U2: pads 2-4, joined first) */
  function poll(quiet) {
    let list;
    if (!full) list = [G.Pad && G.Pad.p2 ? G.Pad.p2() : null];
    else {
      // a player who joined on a pad keeps it (unplugged: the AI until it comes back); one who didn't takes a free pad
      const others = G.Pad && G.Pad.others ? G.Pad.others() : [];
      const free = others.filter(p => !joinPads.includes(p.index));
      list = mates.map((M, i) => (joinPads[i] != null ? others.find(p => p.index === joinPads[i]) || null : free.shift() || null));
    }
    mates.forEach((M, i) => {
      const p = list[i] || null, was = M.ctrl;
      M.padIdx = p ? p.index : null; M.padId = p ? String(p.id || '') : '';
      M.ctrl = p ? 'pad' : 'ai';
      M.pl.tag = M.ctrl === 'pad' ? 'J' + M.n : full ? 'IA' : '';
      if (!quiet && was !== M.ctrl && G.UI) {
        if (!full) G.UI.toast(M.ctrl === 'pad' ? 'Jugador 2: mando conectado' : 'Jugador 2: mando desconectado, la IA lleva a tu compañero', 2600);
        else G.UI.toast(G.I18n.f(M.ctrl === 'pad' ? 'Jugador {x}: mando conectado' : 'Jugador {x}: mando desconectado, la IA lleva a tu compañero', M.n), 2600);
      }
    });
  }
  const padOf = M => (M.padIdx == null || !G.Pad || !G.Pad.others ? (M.ctrl === 'pad' && !full && G.Pad && G.Pad.p2 ? G.Pad.p2() : null) : G.Pad.others().find(p => p.index === M.padIdx) || null);
  function axisOf(M) {
    if (!full) return G.Pad.p2Axis ? G.Pad.p2Axis() : null;
    const p = padOf(M);
    if (!p) return null;
    let x = +(p.axes && p.axes[0]) || 0, y = +(p.axes && p.axes[1]) || 0;
    const b = p.buttons || [], dn = i => !!(b[i] && (b[i].pressed || b[i].value > 0.5));
    const dx = (dn(15) ? 1 : 0) - (dn(14) ? 1 : 0), dy = (dn(13) ? 1 : 0) - (dn(12) ? 1 : 0);
    if (dx || dy) { const m = Math.hypot(dx, dy); return [dx / m, dy / m]; }
    const m = Math.hypot(x, y);
    if (m < K.dz) return [0, 0];
    if (m > 1) { x /= m; y /= m; }
    return [x, y];
  }
  /** This frame's button presses on a partner's pad: {held: [i...], tap: [i...]}. */
  function buttons(M) {
    const p = padOf(M), out = { held: new Set(), tap: new Set() };
    if (!p) { M.prev = []; return out; }
    const b = p.buttons || [];
    for (let i = 0; i < b.length; i++) {
      const d = !!(b[i] && (b[i].pressed || b[i].value > 0.5));
      if (d) { out.held.add(i); if (!M.prev[i]) out.tap.add(i); }
      M.prev[i] = d;
    }
    return out;
  }

  function nearestEnemy(x, y, reach) {
    let best = null, bd = reach * reach;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead) continue;
      const d2 = G.U.dist2(x, y, e.x, e.y);
      if (d2 <= bd) { bd = d2; best = e; }
    }
    return best;
  }

  const visible = pl => on && !!first() && !!pl && !pl.dead && !(G.Rift && G.Rift.inArena);

  /** Cada fotograma de juego (main.gd _update_partner), después de moverte tú. */
  function update(dt, pl) {
    if (!on || !mates.length) return;
    poll(false);
    for (const M of mates) {
      M.pl.anim.update(dt);
      if (M.pl.flash > 0) M.pl.flash -= dt;
    }
    if (!visible(pl)) return;
    mates.forEach((M, i) => step(M, i, dt, pl));
  }
  function step(M, i, dt, pl) {
    const mate = M.pl, bt = full ? buttons(M) : null;
    let vx = 0, vy = 0;
    const ax = M.ctrl === 'pad' ? axisOf(M) : null;
    if (ax) {
      [vx, vy] = ax;
    } else {
      // IA: te sigue a distancia y se acerca un poco a los enemigos
      const tx = pl.x - mate.x, ty = pl.y - mate.y, tl = Math.hypot(tx, ty);
      let wx = 0, wy = 0;
      const near = nearestEnemy(mate.x, mate.y, K.seek);
      if (down && i === 0) {
        // sin ti cerca: huye de los enemigos mientras dispara
        const close = nearestEnemy(mate.x, mate.y, K.flee);
        if (close) [wx, wy] = G.U.norm(mate.x - close.x, mate.y - close.y);
      } else if (tl > K.follow) [wx, wy] = G.U.norm(tx, ty);
      else if (near && tl < K.engage) { const [nx, ny] = G.U.norm(near.x - mate.x, near.y - mate.y); wx = nx * 0.5; wy = ny * 0.5; }
      const f = Math.min(1, dt * K.steer);
      M.dir = [M.dir[0] + (wx - M.dir[0]) * f, M.dir[1] + (wy - M.dir[1]) * f];
      [vx, vy] = M.dir;
    }
    const len = Math.hypot(vx, vy);
    if (len > 1) { vx /= len; vy /= len; }
    const moving = Math.hypot(vx, vy) > 0.05;
    // MicaSurvivor (DLC D11): in an Expedition zone the partner has the movement verbs (js/expedition/verbs.js): player 2's A
    // hops (held: a Flying type glides), B slides; the AI hops up to you when you stand a level above it, and slides to catch
    // up. A base run has no zone: the plain step below, as always. (U2: in a Dive, A / B dodge: a slide)
    const XV = G.World.zone && G.ExpVerbs && G.Modes.isExp() ? G.ExpVerbs : null;
    const speed = full ? Math.max(K.speed, mate.spd) : K.speed;
    if (XV) {
      mate.svx = vx * speed; mate.svy = vy * speed;
      XV.step(mate, dt, vx, vy, mateInput(M, pl, dt, bt));
      mate.x += mate.svx * dt; mate.y += mate.svy * dt;
    } else {
      mate.x += vx * speed * dt;
      mate.y += vy * speed * dt;
    }
    const r = mate.r;
    mate.r = r * 0.55;             // (el port choca con el 55 % de su radio)
    G.World.collide(mate);
    mate.r = r;
    if (XV) XV.after(mate, dt);
    if (!(down && i === 0) && G.U.dist2(mate.x, mate.y, pl.x, pl.y) > K.leash * K.leash) {
      const a = Math.random() * Math.PI * 2;
      [mate.x, mate.y] = freeSpot(pl.x + Math.cos(a) * K.tpR, pl.y + Math.sin(a) * K.tpR);
      G.FX.ring(mate.x, mate.y, K.tpRing.r0, K.tpRing.r1, K.tpRing.color, K.tpRing.dur, 3);
      tpN++;
    }
    const tg = nearestEnemy(mate.x, mate.y, K.reach);
    if (tg) mate.aim = Math.atan2(tg.y - mate.y, tg.x - mate.x);
    else if (moving) mate.aim = Math.atan2(vy, vx);
    mate.walking = moving;
    if (moving) mate.moveAngle = Math.atan2(vy, vx);
    if (!full) {
      mate.anim.dir = G.Sprites.dirFromAngle(tg || !moving ? mate.aim : Math.atan2(vy, vx));
      mate.anim.loop(moving ? 'Walk' : 'Idle', moving ? K.speed / 110 : 1);
      // ataque automático
      syncMove(M, pl);
      M.cd -= dt;
      if (M.cd <= 0 && tg) {
        M.cd = M.move.cd * K.cd;
        fire(mate, pl, M.move);
        if (G.Replay) G.Replay.cast(mate, M.move.id, M.move.lvl, mate.aim, M.move.evolved);   // (U4: noted for the replay)
      }
      return;
    }
    // ---- U2: a full kit: its body's clocks, every slot firing, the Dive specials, the Ultimate ----
    mate.target = tg;
    mate.level = pl.level;
    if (mate.attackFace > 0) mate.attackFace -= dt;
    if (mate.invuln > 0) mate.invuln -= dt;
    if (mate.meleeT > 0) mate.meleeT -= dt;
    mate.itemClock += dt;
    for (const k in mate.buffs) { const b = mate.buffs[k]; if (b.n > 0) { b.t -= dt; if (b.t <= 0) b.n = 0; } }
    if (mate.power && (mate.power.t -= dt) <= 0) { mate.power.def.off(mate); mate.power = null; }
    const face = mate.attackFace > 0 || !moving ? mate.aim : mate.moveAngle;
    mate.anim.dir = G.Sprites.dirFromAngle(face);
    if (!mate.anim.busy || !mate.anim.busy()) mate.anim.loop(moving ? 'Walk' : 'Idle', moving ? speed / 110 : 1);
    if (isDive()) {
      roles(mate);
      const sp = j => { const g = mate.slots[j]; if (g) for (const m of g) if (m.t <= 0.15) m.xreq = 0.6; };
      if (M.ctrl === 'pad') { if (bt.tap.has(2)) sp(1); if (bt.tap.has(3)) sp(2); }
      else if (tg && (M.aiSpT -= dt) <= 0) { M.aiSpT = K.aiSpecial; sp(1); sp(2); }
    }
    G.Combat.tick(dt, mate, G.Game.st ? G.Game.st.time : 0);
    if (isExp()) ultTick(M, dt, bt, tg);
  }

  // ---------------- U2: a partner's Ultimate (its pad's Y / RB / RT in Expedition; RB / RT / LB in a Dive) ----------------
  function ultTick(M, dt, bt, tg) {
    const U = G.ExpUlt, p = M.pl;
    if (!U || !U.makeFx) return;
    const c = M.ult;
    if (c.fx) {
      p.invuln = Math.max(p.invuln, 0.3);
      c.fx.tick(dt);
      if (c.fx.done) { c.fx = null; p.zHidden = false; p.xult = false; }
      return;
    }
    c.c = Math.min(1, c.c + dt / K.ultT);
    if (c.c >= 1 && !c.ready) { c.ready = true; G.FX.dmgText(p.x, p.y - p.bodyH - 20, '¡Listo!', p.tagColor || '#ffd23f', true); }
    const keys = isDive() ? [4, 5, 7] : [3, 5, 7];
    const want = M.ctrl === 'pad' ? keys.some(k => bt.tap.has(k)) : !!(tg && G.U.dist2(tg.x, tg.y, p.x, p.y) < K.ultR * K.ultR);
    if (!want || c.c < 1) return;
    castUlt(M);
  }
  function castUlt(M) {
    const U = G.ExpUlt, LG = G.ExpLeague, p = M.pl, c = M.ult;
    let code, tier = 0;
    try {
      const m = LG && LG.BY[M.member];
      tier = m && LG.stagesOf ? Math.max(0, LG.stagesOf(m).indexOf(p.dex)) : 0;
      code = M.member ? U.codeFor(M.member, p.dex) : U.typeCode((p.mon.types && p.mon.types[0]) || 'normal');
      c.fx = U.makeFx(p, code, tier, false);
    } catch (e) { console.warn('[LocalCoop] ultimate', e); c.fx = null; }
    c.c = 0; c.ready = false;
    if (!c.fx) return false;
    p.xult = true;
    M.ults = (M.ults || 0) + 1;
    G.Audio.sfx('legend');
    G.FX.ring(p.x, p.y, 10, 240, p.tagColor || '#ffffff', 0.7, 5);
    G.Spawner.say(G.I18n.f('¡Definitivo de {x}!', p.mon.name), 2);
    return true;
  }

  // MicaSurvivor (DLC D11): the partner's verbs in an Expedition zone: player 2's buttons (A hop / hold to glide, B slide), else its AI
  // (U2: a full kit reads its own pad; in a Dive, A and B dodge)
  function mateInput(M, pl, dt, bt) {
    const mate = M.pl;
    if (M.ctrl === 'pad') {
      if (bt) {
        if (isDive()) return { hop: false, slide: bt.tap.has(0) || bt.tap.has(1), held: false };
        return { hop: bt.tap.has(0), slide: bt.tap.has(1), held: bt.held.has(0) };
      }
      const p = G.Pad && G.Pad.p2 ? G.Pad.p2() : null;
      if (p) {
        const b = i => !!(p.buttons && p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
        const a = b(0), bb = b(1), out = { hop: a && !M.prev[0], slide: bb && !M.prev[1], held: a };
        M.prev[0] = a; M.prev[1] = bb;
        return out;
      }
    }
    M.aiHopT -= dt; M.aiSlideT -= dt;
    const d = Math.hypot(pl.x - mate.x, pl.y - mate.y), out = { hop: false, slide: false, held: false };
    if (!down && !mate.air && M.aiHopT <= 0 && (pl.layer || 0) >= (mate.layer || 0) + 0.9 && d < 200) { out.hop = true; M.aiHopT = 1.2; }
    else if (!down && !mate.air && M.aiSlideT <= 0 && d > 330) { out.slide = true; M.aiSlideT = 2.5; }
    return out;
  }

  /** Un disparo (main.gd 1719-1730): tu ataque, tu tamaño y tus objetos; ×0,8; al desglose como "Compañero". */
  function fire(mate, pl, m0) {
    const m = G.Combat.eff(pl, m0);   // el Calibre / la Esfera Colosal / la Lente Amplia y el empuje por nivel
    const col = G.U.TYPE_COLOR[m.type], vis = G.VFX.forMove(m);
    const n = Math.max(1, m.count | 0), spread = m.spread || 0;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * n;
      const a = mate.aim + off + G.U.rand(-0.03, 0.03);
      G.Projectiles.spawn({
        x: mate.x + Math.cos(a) * 3, y: mate.y + Math.sin(a) * 3,
        vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
        dmg: m.dmg * pl.atk * K.dmg, r: m.size, life: m.life || 1.4,
        pierce: m.pierce | 0, color: col, homing: m.homing || 0,
        hits: new Set(), vis, ghost: false, owner: pl,
        burn: m.burn || 0, poison: m.poison || 0, slow: m.slow || 0, knock: m.knock || 0, mtype: m.type,
        cc: m.cc || '', ccp: m.ccp || 0, mkind: m.kind, mid: m.id,
        dsrc: 'ally', fromMate: true
      });
    }
    G.FX.spark(mate.x + Math.cos(mate.aim) * mate.r, mate.y - G.LIFT + Math.sin(mate.aim) * mate.r, col, Math.cos(mate.aim), Math.sin(mate.aim), 3);
  }

  // ---------- espectador (main.gd 1917 / 1939-2007) ----------
  /** Player.hurt, si caes (después de la Banda Focus, Robustez y la Segunda oportunidad): a espectar. */
  function onFaint(pl) {
    const mate = first() && first().pl;
    if (!on || !mate || !pl || pl.remote || pl.hp > 0 || down || (G.Rift && G.Rift.inArena)) return false;
    if (G.Dynamax) G.Dynamax.stop(pl);
    down = true; downT = 0;
    pl.coopDown = true;
    pl.hp = 0; pl.invuln = 0; pl.flash = 0;
    mateMax = Math.max(1, pl.maxHp); mateHp = mateMax; mateInv = 0;
    pl.x = mate.x; pl.y = mate.y;
    G.Projectiles.clearOrbs(pl);
    G.Audio.sfx('hurt');
    G.Camera.kick(0.6);
    G.FX.ring(mate.x, mate.y, K.downRing.r0, K.downRing.r1, K.downRing.color, K.downRing.dur, 5);
    G.FX.dmgText(mate.x, mate.y - mate.bodyH - 14, '¡Has caído! Mira a tu compañero', '#ff8a9a', true);
    return true;
  }
  /** game.js, en lugar de Player.update mientras espectas (main.gd _update_down). */
  function downTick(dt, pl) {
    const mate = first().pl;
    downT += dt;
    mateInv = Math.max(0, mateInv - dt);
    pl.x = mate.x; pl.y = mate.y;
    if (downT >= K.reviveT) revive(pl);
  }
  function revive(pl) {
    const mate = first().pl;
    down = false;
    pl.coopDown = false;
    [pl.x, pl.y] = freeSpot(mate.x + K.reviveOff[0], mate.y + K.reviveOff[1]);
    pl.hp = pl.maxHp * K.reviveHp;
    pl.invuln = K.reviveInv;
    pl.flash = 0;
    pl.dead = false;
    pl.anim._start('Idle', false);
    G.Audio.sfx('legend');
    G.Camera.kick(0.4);
    G.FX.ring(pl.x, pl.y, K.reviveRing.r0, K.reviveRing.r1, K.reviveRing.color, K.reviveRing.dur, 5);
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 22, '¡Tu compañero te ha revivido!', '#7dffb0', true);
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || G.U.dist2(e.x, e.y, pl.x, pl.y) >= K.reviveR * K.reviveR) continue;
      const [nx, ny] = G.U.norm(e.x - pl.x, e.y - pl.y);
      e.kx = nx * K.reviveKnock; e.ky = ny * K.reviveKnock;
    }
  }
  /** Mientras espectas, los golpes que te tocarían los recibe él (main.gd _hurt_partner). */
  function hurtMate(amount, type, pure) {
    const mate = first() && first().pl;
    if (!down || mateInv > 0 || !mate) return;
    const pl = G.Game && G.Game.player;
    let eff = null;
    if (type) {
      const k = G.Types.mult(type, mate.mon.types);
      eff = G.Types.label(k);
      amount *= k * G.Weather.mult(type);
    }
    const d = pure ? Math.max(1, amount) : Math.max(1, amount * K.downK);
    mateHp -= d;
    mateInv = K.downInv;
    mate.flash = 0.6;
    G.Camera.kick(0.28);
    G.Audio.sfx('hurt');
    G.FX.dmgText(mate.x, mate.y - mate.bodyH - 4, '-' + Math.round(d), eff === 'super' ? '#ff3048' : '#ff6b7a', eff === 'super');
    if (mateHp <= 0) {
      mateHp = 0;
      down = false;
      if (pl) {
        // main.gd _player_final_death: se acaba (game.js ve al jugador caído y cierra la partida)
        pl.coopDown = false;
        pl.hp = 0; pl.dead = true;
        pl.anim.play('Faint', { hold: true });
        G.Projectiles.clearOrbs(pl);
        if (G.Dynamax) G.Dynamax.stop(pl);
      }
    }
  }

  // ---------- al acabar (main.gd 815-817 / 838-841) ----------
  function finish(S, time) {
    S.coopRuns = (S.coopRuns || 0) + 1;
    if (time >= K.groupMin) S.groupRuns = (S.groupRuns || 0) + 1;
  }

  /** Lo que se dibuja en el mundo (game.js drawScene). */
  const drawables = pl => (visible(pl) ? mates.map(M => M.pl) : []);

  return {
    K, COLOR, COLORS, dex, pick, owned, merge, sanitize, moveFor, levelFor,
    begin, afterStart, end, update, onFaint, downTick, hurtMate, finish, drawables, visible, nearestEnemy,
    setPlayers, levelUp, takeItem, collectors, camTarget, castUlt,
    get on() { return on; }, get full() { return full; }, get ran() { return ran; }, get want() { return want; },
    get mates() { return mates.map(M => M.pl); }, get rows() { return mates.slice(); },
    get padIdxs() { return mates.map(M => M.padIdx).filter(i => i != null); },
    get mate() { const M = first(); return M ? M.pl : null; }, get move() { const M = first(); return M ? M.move : null; },
    get ctrl() { const M = first(); return M && M.ctrl === 'pad' ? 'p2' : 'ai'; },
    get padIdx() { const M = first(); return M ? M.padIdx : null; }, get padId() { const M = first(); return M ? M.padId : ''; },
    get down() { return down; }, get downT() { return downT; },
    get downLeft() { return Math.max(0, K.reviveT - downT); }, get mateHp() { return mateHp; }, get mateMax() { return mateMax; },
    get mateInv() { return mateInv; }, get cd() { const M = first(); return M ? M.cd : 0; }, get teleports() { return tpN; },
    get dir() { const M = first(); return M ? M.dir.slice() : [0, 0]; }
  };
})();
