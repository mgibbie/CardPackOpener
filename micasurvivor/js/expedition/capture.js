'use strict';
/* ============ expedition/capture.js — Alphas, capture and shinies (MicaSurvivor DLC D8, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it, and every entry point acts
 * only in an Expedition run on its own player, or draws an Expedition zone (G.World.zone, which base modes never have).
 * Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.1 (League unlocks), 2.8 (Alphas, shinies), 2.14 / 2.15 and the D8 row. Every
 * number is in K (README "DLC D8").
 *
 *   alphas       D3's timeline alphas (x1.6, x9 HP) can't be KO'd outright: at 1 HP an alpha FAINTS (hpFloor), and for 8 s
 *                (the FAINT WINDOW) it lies there with a circle round it. Stand in the circle (no interact key: D3's rule)
 *                and you throw a FRIEND BALL: the capture cinematic, then it fights for you this run as a SUPPORT ALPHA.
 *                Leave it and the window closes: it drops its prize (an item and a berry, D3's).
 *   support      2 slots (3 with the Lab's "Support team", D10: the counter lab.support). With both full, the Friend Ball
 *                asks which one to swap (or keep your team: the prize). Each Support Alpha follows you, shoots its type at the
 *                nearest foe (your attack, its level, to the "Partner / team" damage row) and gives a TYPE PERK (PERK:
 *                Fire +15 % status chance, Rock +15 max HP, Fairy +8 luck... study 2.8), a stat of D5's sums (items.js
 *                total(): same-stat bonuses add).
 *   League       a challenge completed from D8 on puts the member in league.met AND league.wild: in your next run its
 *                "wild X appeared!" encounter comes 50-120 s into a zone (one per zone, up to 3 a run). Weaken it (x0.8 /
 *                1.2 / 1.6 / 5 of an alpha's HP by rank); at 1 HP it faints (12 s window); stand by it: a Poké Ball, the
 *                cinematic, and it joins the League (league.own, saved at once). It flees after 150 s (legendaries 240 s)
 *                or when its window closes, and comes back next run. Members met in D4 (met, never wild) stay playable.
 *   shinies      8 % a zone + luck / 1,000 (x1.5 with the Shiny Charm item; study 2.8): a shiny of the zone's Pokémon roams
 *                near you (it never attacks) and flees after 120 s (150 s with the charm). Weaken it, catch it: shiny.caught
 *                (and league.shiny when it's a League family's: that member plays shiny, cosmetic).
 *   cinematic    the throw's arc, the Pokémon drawn into the ball, 3 shakes with their pips, "Gotcha!": 2.95 s that hold the
 *                world (the run.hold seam), then 1 s of i-frames.
 *
 * Determinism: when the encounters come, which member, whether a zone has a shiny and which one, and where they appear come
 * from G.DLC.rng streams (the seed, the zone; zonePlan is pure). Combat stays the base game's (Math.random).
 * Viewers: the `x` block v8 `p` (pBlock / applyP, js/expedition/core.js): the Support Alphas, the encounters on the field,
 * the fainted Pokémon, the capture under way and a capture count (the replay's `xc` event).
 */
G.ExpEN = Object.assign(G.ExpEN || {}, {
  '¡{x} alfa se debilita! Ponte a su lado para lanzar una Amigo Ball': 'The alpha {x} faints! Stand by it to throw a Friend Ball',
  '¡{x} se debilita! Ponte a su lado para lanzar una Poké Ball': '{x} faints! Stand by it to throw a Poké Ball',
  '{x} se recupera y suelta su premio': '{x} recovers and leaves its prize',
  '¡{x} se ha escapado! Volverá en tu próxima partida': '{x} got away! It will be back in your next run',
  '¡{x} variocolor se ha escapado!': 'The shiny {x} got away!',
  '¡Un {x} salvaje apareció!': 'A wild {x} appeared!', '¡Un {x} variocolor anda cerca!': 'A shiny {x} is nearby!',
  '¡Ya está! {x} se une a tu equipo': 'Gotcha! {x} joins your team', '¡Ya está! {x} se une a la Liga': 'Gotcha! {x} joined the League!',
  '¡Ya está! ¡{x} variocolor atrapado!': 'Gotcha! The shiny {x} was caught!', '¡Ya está! ¡{x}!': 'Gotcha! {x}!',
  'Alfa de apoyo': 'Support Alpha', 'Alfas de apoyo': 'Support Alphas', 'Amigo Ball': 'Friend Ball', 'Poké Ball': 'Poké Ball',
  'Tu equipo está lleno': 'Your team is full', 'Cambia a {x} por {x}': 'Swap {x} for {x}', 'Quedarme con mi equipo': 'Keep my team',
  '¿A quién cambias por {x}?': 'Who do you swap for {x}?', 'Su premio cae al suelo.': 'Its prize drops to the ground.',
  'LANZA · {x} s': 'THROW · {x} s', 'HUYE EN {x}': 'FLEES IN {x}', 'SALVAJE': 'WILD', 'VARIOCOLOR': 'SHINY',
  'Alfas de apoyo: {x}': 'Support Alphas: {x}', 'Capturados: {x}': 'Caught: {x}', 'Variocolor: {x}': 'Shinies: {x}',
  '¡{x} lanza una Amigo Ball!': '{x} throws a Friend Ball!', '¡{x} lanza una Poké Ball!': '{x} throws a Poké Ball!',
  'Alfa: debilítalo hasta que se desmaye y quédate a su lado: tu Amigo Ball lo une a tu equipo.': 'Alpha: weaken it until it faints, then stand by it: a Friend Ball makes it a Support Alpha.',
  'Encuentro de la Liga: debilítalo y quédate a su lado para capturarlo. Huye si tardas.': 'League encounter: weaken it, then stand by it to catch it. It flees if you take too long.',
  'Variocolor: no ataca, pero huye pronto. Debilítalo y captúralo.': "Shiny: it doesn't attack, but it flees soon. Weaken it and catch it.",
  // the perks
  '+{x} % de experiencia': '+{x}% XP', '+{x} % de estado': '+{x}% status chance', '+{x} % de área': '+{x}% area',
  '+{x} de vida por segundo': '+{x} HP per second', '+{x} % de velocidad de ataque': '+{x}% attack speed', '+{x} % de duración': '+{x}% duration',
  '+{x} % de daño físico': '+{x}% physical damage', '+{x} % de robo de vida': '+{x}% lifesteal', '+{x} % de daño a jefes': '+{x}% damage to bosses',
  '+{x} % de velocidad': '+{x}% speed', '+{x} % de daño especial': '+{x}% special damage', '+{x} % de radio de recogida': '+{x}% pickup range',
  '+{x} de vida máxima': '+{x} max HP', '+{x} % de evasión': '+{x}% evasion', '+{x} % de daño': '+{x}% damage', '+{x} % de crítico': '+{x}% crit',
  '+{x} de armadura': '+{x} armor', '+{x} de suerte': '+{x} luck'
});
G.I18n.add(G.ExpEN);

G.ExpCap = (() => {
  const T = G.I18n;
  const F = (es, ...v) => { const en = T.lang === 'en' && G.ExpEN[es]; let i = 0; return en ? en.replace(/\{x\}/g, () => v[i++]) : T.f(es, ...v); };
  const C = () => G.ExpClassic, LG = () => G.ExpLeague, IT = () => G.ExpItems, EC = () => G.ExpEco;
  // ---------------- balance (tune here; README "DLC D8") ----------------
  const K = {
    FAINT_T: 8,                      // s: an alpha's faint window (study 2.8: "8 s to throw a Friend Ball")
    THROW_R: 1.6, THROW_T: 0.35,     // stand within 1.6 tiles (+ your radius) of a fainted Pokémon for 0.35 s: the throw
    SLOTS: 2, LAB_SLOTS: 1,          // Support Alpha slots: 2, +1 with the Lab (study 2.14: "Support team", D10: lab.support)
    SA_DMG: 9, SA_LV: 0.06, SA_CD: 1.25, SA_REACH: 320, SA_SPEED: 430, SA_SIZE: 7, SA_SCALE: 1.15, SA_FOLLOW: 70, SA_LEASH: 520,
    // League encounters (study 2.1): 50-120 s into a zone, HP x rank of an alpha's (x9), flees after 150 s (legendary 240 s)
    LG_AT: [50, 120], LG_HP: 9, LG_RANK: { starter: 0.8, common: 0.8, uncommon: 1.2, rare: 1.6, legendary: 5 }, LG_DMG: 1.3, LG_XP: 6,
    LG_SCALE: 1.3, LG_FLEE: 150, LG_FLEE_LEG: 240, LG_WINDOW: 12, PER_RUN: 3,
    // shinies (study 2.8): 8 % a zone + luck / 1,000, x1.5 with the Shiny Charm; it roams and flees after 120 s (150 s)
    SHINY: 0.08, SHINY_LUCK: 1000, SHINY_CHARM: 1.5, SH_AT: [60, 420], SH_FLEE: 120, SH_FLEE_CHARM: 150, SH_HP: 4, SH_XP: 5, SH_WINDOW: 10,
    SH_ROAM: [220, 480], SH_SPD: 0.7,
    // the capture cinematic (s): the throw, the Pokémon drawn in, the ball's drop, 3 shakes, the click
    CINE: { throw: 0.5, absorb: 0.35, drop: 0.25, shake: 0.5, shakes: 3, click: 0.6 }, AFTER: 1
  };
  const CINE_T = K.CINE.throw + K.CINE.absorb + K.CINE.drop + K.CINE.shake * K.CINE.shakes + K.CINE.click;
  // the type perks (study 2.8's examples: Fire +15 % status, Rock +15 HP, Fairy +8 luck; the rest ours), as D5's stats
  const PERK = { normal: ['xp', 0.08], fire: ['status', 0.15], water: ['area', 0.08], grass: ['regen', 0.8], electric: ['atkspd', 0.08],
    ice: ['dur', 0.12], fighting: ['phys', 0.08], poison: ['steal', 0.03], ground: ['boss', 0.10], flying: ['spd', 0.06], psychic: ['spec', 0.08],
    bug: ['magnet', 0.15], rock: ['hp', 15], ghost: ['evade', 0.05], dragon: ['dmg', 0.06], dark: ['crit', 0.05], steel: ['armor', 3], fairy: ['luck', 8] };
  const KC = { alpha: 1, league: 7, shiny: 8 };
  const KN = { 1: 'alpha', 7: 'league', 8: 'shiny' };
  const BALL = { alpha: 'friend_ball', league: 'poke_ball', shiny: 'poke_ball' };

  // ---------------- seeded helpers ----------------
  function mix(...vals) {
    let h = 0x9E3779B9 | 0;
    for (const v of vals) { h ^= v | 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16; }
    return h >>> 0;
  }
  const R = s => G.DLC.rng(s);
  const mapIdx = m => ['viridian', 'mtmoon', 'cerulean'].indexOf(m) + 1;
  const intR = (rng, a, b) => a + Math.min(b - a, Math.floor(rng() * (b - a + 1)));
  const TS = () => G.World.TS;
  const now = () => (G.Game.st ? G.Game.st.time : 0);
  const name = d => (G.DEX_BY[d] || {}).name || '#' + d;
  const say = (t, s = 3) => G.Spawner.say(t, s, true);

  /** A zone's shiny chance (study 2.8): 8 % + luck / 1,000, x1.5 with the Shiny Charm. Pure. */
  const shinyChance = (luck = 0, charm = false) => Math.min(1, (K.SHINY + Math.max(0, luck) / K.SHINY_LUCK) * (charm ? K.SHINY_CHARM : 1));
  /**
   * A zone's encounters from the run's seed: {league: {member, at} | null, shiny: {at, pick} | null, roll, p}. Pure: the
   * same seed, map, zone, member and luck give the same plan (no Math.random).
   */
  function zonePlan(seed, map, zone, o = {}) {
    if (!(zone >= 1 && zone <= 3)) return { league: null, shiny: null, roll: 1, p: 0 };
    const rng = R(mix(seed | 0, mapIdx(map), zone | 0, 0xCA97));
    const at = intR(rng, K.LG_AT[0], K.LG_AT[1]), roll = rng(), sAt = intR(rng, K.SH_AT[0], K.SH_AT[1]), pick = rng();
    const p = shinyChance(o.luck || 0, !!o.charm);
    return { league: o.member ? { member: o.member, at } : null, shiny: roll < p || o.force ? { at: sAt, pick } : null, roll, p };   // (D10: force = Dawn Stone)
  }
  /** The League members waiting to be caught (met from D8 on, not yet owned), in a seeded order for this run. */
  function pendingOf(seed) {
    const L = LG(), Sv = G.ExpSave;
    if (!L || !Sv) return [];
    const list = Sv.list('league.wild').map(Number).filter(d => L.BY[d] && !L.own(d)).sort((a, b) => a - b);
    const rng = R(mix(seed | 0, 0x1EA6));
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list.slice(0, K.PER_RUN);
  }
  /** The perk of a Pokémon of type `type`: [stat, value]. */
  const perkOf = type => PERK[type] || PERK.normal;
  const perkText = type => { const [s, v] = perkOf(type); return IT() ? IT().statText(s, v) : ''; };
  const slotsMax = () => K.SLOTS + Math.min(K.LAB_SLOTS, G.ExpMeta ? G.ExpMeta.labNow('support') : (G.ExpSave && G.ExpSave.get('lab.support')) || 0);   // (D10: the run's row)

  // ---------------- the run (host) ----------------
  let S = null;        // {seed, map, sa, tg, faint, cine, fseq, seq, n, last, zkey, zplan, pend, log}
  let view = null;     // a viewer's / guest's copy of the `p` block
  const on = pl => !!(S && G.Modes.isExp() && pl && pl === G.Game.player && !pl.remote);
  // (D11: online co-op. The HOST owns the targets and the faint windows; a GUEST standing by a fainted Pokémon is seen by the
  //  host through its puppet, which hands it the catch ('xcg'): the guest throws, plays the cinematic and keeps it (its own
  //  Support Alphas, its own League / shiny saves). A guest's Support Alphas fight on its side (their hits reach the host like
  //  any guest hit) and travel to the others in its frames (p.s), drawn round its puppet everywhere (p.g).)
  const guestSide = () => !!(G.Coop && G.Coop.active && !G.Coop.isHost);
  const authority = () => !!(S && G.Modes.isExp() && !guestSide());

  function begin(pl) {
    S = null; view = null; vcine = null; doneIds.clear();
    if (!pl || !G.Modes.isExp()) return null;
    const seed = G.World.seed | 0, map = (G.Modes.run && G.Modes.run.map) || 'viridian';
    S = { seed, map, sa: [], tg: new Map(), faint: [], cine: null, fseq: 0, seq: 0, n: 0, last: 0, zkey: '', zplan: null, zone: 0,
          pend: pendingOf(seed), lgDone: false, shDone: false, prompt: null,
          log: { alpha: 0, league: [], shiny: [], seen: 0, fled: 0, prizes: 0, swaps: 0, best: 0 } };
    return S;
  }
  function reset() { S = null; view = null; vcine = null; doneIds.clear(); }

  /** Marks an enemy as a capture target (an alpha: classic.js spawn; a League encounter; a shiny): it faints at 1 HP. */
  function mark(e, kind, o = {}) {
    if (!S || !e) return e;
    e.hpFloor = 1; e.xcap = kind;
    if ((kind === 'league' || kind === 'shiny') && G.ExpMeta && G.ExpMeta.useMaster()) e.hp = 1;   // (D10: Master Ball: it faints at once)
    S.tg.set(e.id, Object.assign({ kind, e, t0: now(), dex: e.dex }, o));
    return e;
  }

  /** run.tick: the encounters' schedule, the targets, the faint windows, the Support Alphas. */
  function tick(dt, pl) {
    if (!on(pl) || S.cine) return;
    if (guestSide()) { tickSupport(dt, pl); return; }   // (D11: a guest: its own Support Alphas; the targets are the host's)
    const z = G.World.zone, run = C() && C().run;
    if (!z || !run) return;
    const key = z.map + ':' + z.zone;
    if (S.zkey !== key) {
      S.zkey = key; S.zone = z.zone; S.lgDone = false; S.shDone = false;
      const member = z.zone <= 3 ? S.pend[z.zone - 1] || 0 : 0, I = IT();
      const M = G.ExpMeta;   // (D10: the 6-shiny perk is a Shiny Charm every run; Dawn Stone: a shiny in zone 1)
      S.zplan = zonePlan(S.seed, z.map, z.zone, { member, luck: pl.xluck || 0, charm: !!(I && I.has(pl, 'shinycharm')) || !!(M && M.charm()), force: !!(M && M.dawn(z.zone)) });
    }
    const zt = now() - run.zs, P = S.zplan;
    if (P && P.league && !S.lgDone && zt >= P.league.at) { S.lgDone = true; spawnLeague(P.league.member, pl); }
    if (P && P.shiny && !S.shDone && zt >= P.shiny.at) { S.shDone = true; spawnShiny(P.shiny.pick, pl); }
    // the targets: faint at 1 HP; League / shiny flee on time
    for (const [id, g] of S.tg) {
      const e = G.EnemyMgr.get(id);
      if (!e) { S.tg.delete(id); continue; }
      if (e.dead) { faint(e, g); continue; }
      if (e.hp <= 1) { faint(e, g); continue; }
      if (g.flee && now() - g.t0 >= g.flee) flee(e, g);
    }
    tickFaint(dt, pl);
    tickSupport(dt, pl);
  }

  // ---------------- encounters ----------------
  function place(pl, salt, d) {
    const Cl = C(), rng = R(mix(S.seed, S.zone, salt));
    const ang = rng() * 6.2832;
    for (const f of [1, 0.7, 1.3, 0.45]) { const pt = Cl.spotNear(rng, pl, ang + f, false, d * f); if (pt) return pt; }
    return [pl.x + Math.cos(ang) * 120, pl.y + Math.sin(ang) * 90];
  }
  /** "A wild X appeared!": League member `member` (its first stage), weaker or stronger by rank. */
  function spawnLeague(member, pl) {
    const L = LG(), m = L && L.BY[member];
    if (!m || L.own(member)) return null;
    const [x, y] = place(pl, 0x1EA7, G.Camera.outerRadius() * 0.75);
    G.Sprites.preload([m.dex], 6000);
    const e = C().spawnFoe(m.dex, x, y, { ti: 1, hp: K.LG_HP * (K.LG_RANK[m.rank] || 1), dmg: K.LG_DMG, xp: K.LG_XP, scale: K.LG_SCALE });
    if (!e) return null;
    e.xk = 'league';
    mark(e, 'league', { member, flee: m.rank === 'legendary' ? K.LG_FLEE_LEG : K.LG_FLEE });
    say(F('¡Un {x} salvaje apareció!', name(m.dex)), 3.4); G.Audio.sfx('boss');
    G.FX.ring(x, y, 8, 120, '#7fe0ff', 0.6, 4);
    if (EC()) EC().tipOnce('league');
    return e;
  }
  /** A shiny of the zone's Pokémon (one with a shiny sheet), roaming near you. */
  function spawnShiny(pick, pl) {
    const run = C().run, cards = run && run.plan ? run.plan.cards.filter(d => G.Sprites.hasShiny(d)) : [];
    if (!cards.length) return null;
    const dex = cards[Math.min(cards.length - 1, Math.floor(pick * cards.length))];
    const [x, y] = place(pl, 0x5417, K.SH_ROAM[1]);
    const e = C().spawnFoe(dex, x, y, { hp: K.SH_HP, xp: K.SH_XP });
    if (!e) return null;
    e.anim = new G.Sprites.Animator(dex, e.scale, true);
    G.Sprites.preload([dex], 6000, true);
    e.xk = 'shiny'; e.xsh = true;
    e.xroam = { rng: R(mix(S.seed, S.zone, e.id, 0x40A)), t: 0, tx: x, ty: y };
    e.xmove = roam;
    const I = IT(), charm = !!(I && I.has(pl, 'shinycharm')) || !!(G.ExpMeta && G.ExpMeta.charm());
    mark(e, 'shiny', { flee: charm ? K.SH_FLEE_CHARM : K.SH_FLEE });
    S.log.seen++;
    say(F('¡Un {x} variocolor anda cerca!', name(dex)), 3.4); G.Audio.sfx('shinyGet');
    if (EC()) EC().tipOnce('shiny');
    return e;
  }
  /** A shiny's step (Enemy.update calls e.xmove first): it wanders round you, never attacks (its own seeded stream). */
  function roam(dt, pl) {
    const r = this.xroam;
    this.touchCd = 1; this.shotCd = Math.max(this.shotCd || 0, 1);
    if (this.frozenT > 0 || this.sleepT > 0) { this.anim.loop('Idle'); return true; }
    r.t -= dt;
    const d = Math.hypot(r.tx - this.x, r.ty - this.y);
    if (r.t <= 0 || d < 18) {
      const p = pl || G.Game.player, a = r.rng() * 6.2832, dd = K.SH_ROAM[0] + r.rng() * (K.SH_ROAM[1] - K.SH_ROAM[0]);
      r.t = 2.4 + r.rng() * 2.2; r.tx = p.x + Math.cos(a) * dd; r.ty = p.y + Math.sin(a) * dd * 0.8;
    }
    const [nx, ny] = G.U.norm(r.tx - this.x, r.ty - this.y), sp = this.spd * K.SH_SPD * (1 - (this.slow || 0));
    this.x += nx * sp * dt + this.kx * dt; this.y += ny * sp * dt + this.ky * dt;
    this.kx *= Math.pow(0.0015, dt); this.ky *= Math.pow(0.0015, dt);
    if (!this.flying) G.World.collide(this);
    this.anim.dir = G.Sprites.dirFromAngle(Math.atan2(ny, nx));
    this.anim.loop('Walk', 1.1);
    if ((this.sparkT -= dt) <= 0) { this.sparkT = 0.25; G.FX.twinkle(this.x + G.U.rand(-this.r, this.r), this.y - G.U.rand(4, this.bodyH)); }
    return true;
  }
  function flee(e, g) {
    S.tg.delete(e.id);
    G.EnemyMgr.removeRemote(e.id, false);
    if (G.Coop.isHost) G.Coop.enemyGone(e, false);
    G.FX.burst(e.x, e.y - 10, g.kind === 'shiny' ? '#9ae6ff' : '#7fe0ff', 16, 150);
    S.log.fled++;
    say(g.kind === 'shiny' ? F('¡{x} variocolor se ha escapado!', name(e.dex)) : F('¡{x} se ha escapado! Volverá en tu próxima partida', name(e.dex)), 3);
  }

  // ---------------- the faint window ----------------
  /** Target e is down to 1 HP (or fell some other way): it faints in place, and the window opens. */
  function faint(e, g) {
    S.tg.delete(e.id);
    if (S.faint.some(f => f.eid === e.id)) return;
    const t = now(), win = g.kind === 'alpha' ? K.FAINT_T : g.kind === 'league' ? K.LG_WINDOW : K.SH_WINDOW;
    const f = { i: ++S.fseq, eid: e.id, kind: g.kind, dex: e.dex, member: g.member || 0, x: e.x, y: e.y, scale: e.scale || 1, shiny: g.kind === 'shiny',
                t0: t, end: t + win, stand: 0, latch: false, anim: new G.Sprites.Animator(e.dex, e.scale || 1, g.kind === 'shiny') };
    f.anim.dir = e.anim ? e.anim.dir : 0;
    f.anim.play('Faint', { hold: true });
    if (!e.dead) {
      // (no die(): no base drops, no base shiny prize; the KO still counts on the next EnemyMgr step: kills, enemy.ko)
      G.Pickups.dropXp(e.x, e.y, e.xp, false, false, false);
      e.dead = true; e.fade = 0; e.hp = 0;
      G.FX.burst(e.x, e.y - e.bodyH * 0.5, '#ffffff', 12, 140);
    }
    S.faint.push(f);
    G.FX.ring(e.x, e.y, e.r, e.r * 3, g.kind === 'alpha' ? '#ff4d5e' : g.kind === 'shiny' ? '#9ae6ff' : '#7fe0ff', 0.5, 4);
    say(g.kind === 'alpha' ? F('¡{x} alfa se debilita! Ponte a su lado para lanzar una Amigo Ball', name(e.dex)) : F('¡{x} se debilita! Ponte a su lado para lanzar una Poké Ball', name(e.dex)), 3);
    return f;
  }
  /** classic.js tickSpecials: an alpha is down. -> true: D8 owns it (a faint window; the prize only if you leave it) */
  function alphaDown(e) {
    if (!S || !G.Modes.isExp() || !e) return false;
    if (!S.faint.some(f => f.eid === e.id) && !(S.cine && S.cine.eid === e.id) && !doneIds.has(e.id)) faint(e, { kind: 'alpha' });
    return true;
  }
  function tickFaint(dt, pl) {
    const t = now(), tsz = TS();
    for (let k = S.faint.length - 1; k >= 0; k--) {
      const f = S.faint[k];
      f.anim.update(dt);
      if (t >= f.end && !(EC() && EC().pick && S.prompt === f)) { S.faint.splice(k, 1); expire(f); continue; }
      if (pl.dead || S.cine || (EC() && EC().pick)) continue;
      const d = Math.hypot(pl.x - f.x, pl.y - f.y);
      if (d < K.THROW_R * tsz + (pl.r || 14)) {
        if (f.latch) continue;
        f.stand += dt;
        if (f.stand >= K.THROW_T) throwAt(f, pl);
      } else { f.stand = Math.max(0, f.stand - dt * 2); f.latch = false; }
      // (D11: a co-op guest standing by it: the host hands it the catch)
      if (G.Coop && G.Coop.active && G.Coop.isHost && S.faint.includes(f)) for (const g of G.Coop.puppets()) {
        if (g.dead) continue;
        const gs = f.gs || (f.gs = new Map()), gd = Math.hypot(g.x - f.x, g.y - f.y);
        const v = gd < K.THROW_R * tsz + (g.r || 14) ? (gs.get(g.uid) || 0) + dt : 0;
        gs.set(g.uid, v);
        if (v >= K.THROW_T) { grant(f, g); break; }
      }
    }
  }
  /** D11 (host): guest puppet g caught fainted f: off the field here, the catch on its side ('xcg'). */
  function grant(f, g) {
    const m = G.Coop.mate(g.uid);
    if (!m || !m.connected) return false;
    const i = S.faint.indexOf(f);
    if (i >= 0) S.faint.splice(i, 1);
    doneIds.add(f.eid);
    m.q.push(['xcg', KC[f.kind], f.dex, f.member | 0, Math.round(f.x), Math.round(f.y), f.shiny ? 1 : 0, Math.round((f.scale || 1) * 100)]);
    say(f.kind === 'alpha' ? F('¡{x} lanza una Amigo Ball!', m.name) : F('¡{x} lanza una Poké Ball!', m.name), 2.4);
    G.Audio.sfx('select');
    return true;
  }
  /**
   * D11 net.event: on a GUEST, the host's 'xcg' (your catch: the throw, the cinematic, the Support Alpha or the save); on the
   * HOST, a guest's 'xcp' [x, y] (it kept its full team: the alpha's prize drops there). -> true if handled
   */
  function netEvent(ev, from) {
    const pl = G.Game.player;
    if (!S || !pl || !Array.isArray(ev)) return false;
    if (from != null) {
      if (ev[0] !== 'xcp' || guestSide()) return false;
      prize({ x: +ev[1] || pl.x, y: +ev[2] || pl.y });
      return true;
    }
    if (ev[0] !== 'xcg' || !guestSide()) return false;
    const kind = KN[ev[1]] || 'alpha', dex = ev[2] | 0, sc = (ev[7] || 100) / 100;
    const f = { i: 0, eid: -1, kind, dex, member: ev[3] | 0, x: +ev[4], y: +ev[5], scale: sc, shiny: !!ev[6], anim: new G.Sprites.Animator(dex, sc, !!ev[6]) };
    f.anim.play('Faint', { hold: true });
    G.Sprites.preload([dex], 4000, f.shiny);
    if (kind === 'alpha' && S.sa.length >= slotsMax() && EC()) {
      S.prompt = f;
      EC().openPick({ kind: 'friend', title: F('Tu equipo está lleno'), sub: F('¿A quién cambias por {x}?', name(dex)), picks: 1, cancel: 'Quedarme con mi equipo',
        cards: S.sa.map(s => ({ nm: F('Cambia a {x} por {x}', name(s.dex), name(dex)), ds: T.t('Alfa de apoyo') + ' · ' + perkText(typeOf(dex)), icon: IT() ? IT().icon(BALL.alpha) : '', dex, rar: 3 })),
        onPick: k => { S.prompt = null; startCine(f, pl, k); return true; },
        onCancel: () => { S.prompt = null; if (G.Coop.active) G.Coop.toHost(['xcp', Math.round(f.x), Math.round(f.y)]); say(T.t('Su premio cae al suelo.'), 2.2); } });
      return true;
    }
    startCine(f, pl, null);
    return true;
  }
  const doneIds = new Set();   // (the targets already caught / prized / gone: a late tickSpecials never re-opens them)
  function expire(f) {
    doneIds.add(f.eid);
    if (f.kind === 'alpha') { prize(f); say(F('{x} se recupera y suelta su premio', name(f.dex)), 2.6); }
    else if (f.kind === 'league') { S.log.fled++; say(F('¡{x} se ha escapado! Volverá en tu próxima partida', name(f.dex)), 3); }
    else { S.log.fled++; say(F('¡{x} variocolor se ha escapado!', name(f.dex)), 3); }
    G.FX.burst(f.x, f.y - 10, '#ffffff', 10, 120);
  }
  /** An alpha's prize (D3's: an item and a berry). */
  function prize(f) {
    G.Pickups.drop('item', f.x - 20, f.y, G.Items.roll());
    G.Pickups.drop('heal', f.x + 20, f.y, 0);
    S.log.prizes++;
  }
  /** The throw: a Friend Ball at an alpha (with your team full: which one to swap, or keep it), a Poké Ball otherwise. */
  function throwAt(f, pl) {
    f.latch = true;
    if (f.kind === 'alpha' && S.sa.length >= slotsMax()) {
      const E = EC();
      if (!E) return;
      S.prompt = f;
      E.openPick({ kind: 'friend', title: F('Tu equipo está lleno'), sub: F('¿A quién cambias por {x}?', name(f.dex)), picks: 1, cancel: 'Quedarme con mi equipo',
        cards: S.sa.map(s => ({ nm: F('Cambia a {x} por {x}', name(s.dex), name(f.dex)), ds: T.t('Alfa de apoyo') + ' · ' + perkText(typeOf(f.dex)), icon: IT() ? IT().icon(BALL.alpha) : '', dex: f.dex, rar: 3 })),
        onPick: k => { S.prompt = null; const i = S.faint.indexOf(f); if (i >= 0) S.faint.splice(i, 1); startCine(f, pl, k); return true; },
        onCancel: () => { S.prompt = null; const i = S.faint.indexOf(f); if (i >= 0) { S.faint.splice(i, 1); doneIds.add(f.eid); prize(f); say(T.t('Su premio cae al suelo.'), 2.2); } } });
      return;
    }
    const i = S.faint.indexOf(f);
    if (i >= 0) S.faint.splice(i, 1);
    startCine(f, pl, null);
  }

  // ---------------- the capture cinematic (host: run.hold holds the world) ----------------
  function startCine(f, pl, slot) {
    S.cine = { kind: f.kind, eid: f.eid, dex: f.dex, member: f.member, x: f.x, y: f.y, scale: f.scale, shiny: f.shiny, slot, t: 0,
               from: [pl.x, pl.y - (pl.bodyH || 30) * 0.6], seq: ++S.seq, anim: f.anim, fx: 0 };
    doneIds.add(f.eid);
    G.Audio.sfx('select');
    return S.cine;
  }
  /** run.hold: the cinematic plays, the world holds. */
  function hold(dt, pl) {
    if (!S || !S.cine) return undefined;
    const c = S.cine;
    c.t += dt;
    pl.invuln = Math.max(pl.invuln, 0.5);
    cineFx(c, c.t - dt, c.t);
    if (c.t >= CINE_T) finish(c, pl);
    return true;
  }
  const phase = t => {
    const P = K.CINE;
    let a = P.throw; if (t < a) return { n: 'throw', u: t / P.throw };
    if (t < a + P.absorb) return { n: 'absorb', u: (t - a) / P.absorb }; a += P.absorb;
    if (t < a + P.drop) return { n: 'drop', u: (t - a) / P.drop }; a += P.drop;
    if (t < a + P.shake * P.shakes) { const s = (t - a) / P.shake; return { n: 'shake', u: s - Math.floor(s), k: Math.floor(s) }; } a += P.shake * P.shakes;
    return { n: 'click', u: Math.min(1, (t - a) / P.click) };
  };
  /** The cinematic's one-off effects between t0 and t1 (sounds, flashes): the same for the host and a viewer. */
  function cineFx(c, t0, t1) {
    const P = K.CINE, at = [P.throw, P.throw + P.absorb, P.throw + P.absorb + P.drop];
    for (let k = 0; k < P.shakes; k++) at.push(P.throw + P.absorb + P.drop + P.shake * (k + 1));
    at.forEach((a, k) => {
      if (!(t0 < a && t1 >= a)) return;
      if (k === 0) { G.FX.ring(c.x, c.y - 14, 4, 46, '#ff5a5a', 0.3, 3); G.Audio.sfx('hit'); }
      else if (k === 2) G.FX.burst(c.x, c.y, '#ffffff', 6, 70);
      else if (k >= 3) { G.Audio.sfx(k === at.length - 1 ? 'legend' : 'select'); if (k === at.length - 1) { G.FX.burst(c.x, c.y - 10, '#ffe14d', 22, 180); G.FX.ring(c.x, c.y, 6, 70, '#ffe14d', 0.5, 4); } }
    });
  }
  function finish(c, pl) {
    S.cine = null;
    pl.invuln = Math.max(pl.invuln, K.AFTER);
    S.n++; S.last = c.dex;
    const Sv = G.ExpSave;
    if (c.kind === 'alpha') {
      recruit(pl, c.dex, c.slot, c);
      say(F('¡Ya está! {x} se une a tu equipo', name(c.dex)) + ' · ' + perkText(typeOf(c.dex)), 3.4);
    } else if (c.kind === 'league') {
      if (Sv) { Sv.add('league.own', c.member || c.dex); Sv.bump('cap.league'); Sv.commit(); }
      S.log.league.push(c.member || c.dex);
      say(F('¡Ya está! {x} se une a la Liga', name(c.member || c.dex)), 4);
    } else {
      if (Sv) {
        Sv.add('shiny.caught', c.dex); Sv.bump('cap.shiny');
        const fam = LG() && LG().FAM[c.dex];
        if (fam) Sv.add('league.shiny', fam);
        Sv.commit();
      }
      S.log.shiny.push(c.dex);
      say(F('¡Ya está! ¡{x} variocolor atrapado!', name(c.dex)), 4);
    }
    G.Game.flash('#fff3c8', 0.5);
  }

  // ---------------- Support Alphas ----------------
  const typeOf = d => ((G.DEX_BY[d] || {}).types || ['normal'])[0];
  function recruit(pl, dex, slot, c) {
    const s = { dex, type: typeOf(dex), types: ((G.DEX_BY[dex] || {}).types || ['normal']).slice(), x: c ? c.x : pl.x, y: c ? c.y : pl.y, cd: 0.6, aim: 0,
                anim: new G.Sprites.Animator(dex, K.SA_SCALE), shots: 0 };
    G.Sprites.preload([dex], 6000);
    if (slot != null && S.sa[slot]) { S.sa[slot] = s; S.log.swaps++; } else S.sa.push(s);
    S.log.alpha++;
    S.log.best = Math.max(S.log.best, S.sa.length);
    if (IT()) IT().apply(pl);
    return s;
  }
  /** items.js total(): the Support Alphas' type perks on stat s (same-stat bonuses add, as D5's). */
  function perk(pl, s) {
    if (!S || !pl || pl !== G.Game.player || pl.remote) return 0;
    let v = 0;
    for (const a of S.sa) { const [st, n] = perkOf(a.type); if (st === s) v += n; }
    return v;
  }
  /** Where Support Alpha i of n stands round player p (behind it, fanned out): the host's target and a viewer's spot. */
  function slotSpot(p, i, n) {
    const face = p.anim && p.anim.dir != null ? [Math.PI / 2, 3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4, 0, Math.PI / 4][p.anim.dir] || Math.PI / 2 : Math.PI / 2;
    const a = face + Math.PI + (n > 1 ? (i / (n - 1) - 0.5) * 1.6 : 0);
    return [p.x + Math.cos(a) * K.SA_FOLLOW, p.y + Math.sin(a) * K.SA_FOLLOW * 0.8];
  }
  function nearest(x, y, reach) {
    let best = null, bd = reach * reach;
    for (const e of G.EnemyMgr.queryCircle(x, y, reach)) { if (e.dead) continue; const d2 = G.U.dist2(x, y, e.x, e.y); if (d2 <= bd) { bd = d2; best = e; } }
    return best;
  }
  const saDmg = pl => K.SA_DMG * (1 + K.SA_LV * Math.max(0, (pl.level || 1) - 1)) * (pl.atk || 1);
  function tickSupport(dt, pl) {
    const n = S.sa.length;
    S.sa.forEach((s, i) => {
      s.anim.update(dt);
      const [tx, ty] = slotSpot(pl, i, n), d = Math.hypot(tx - s.x, ty - s.y);
      if (d > K.SA_LEASH) { s.x = tx; s.y = ty; G.FX.ring(s.x, s.y, 6, 40, '#ff4d5e', 0.3, 2); }
      else if (d > 6) { const sp = Math.min(d / dt, Math.max(120, (pl.spd || 110) * 1.25 + d * 1.5)); s.x += (tx - s.x) / d * sp * dt; s.y += (ty - s.y) / d * sp * dt; }
      const moving = d > 10, tg = nearest(s.x, s.y, K.SA_REACH);
      if (tg) s.aim = Math.atan2(tg.y - s.y, tg.x - s.x);
      s.anim.dir = G.Sprites.dirFromAngle(tg ? s.aim : Math.atan2(ty - s.y, tx - s.x));
      s.anim.loop(moving ? 'Walk' : 'Idle', 1.2);
      s.cd -= dt;
      if (s.cd <= 0 && tg && !pl.dead) { s.cd = K.SA_CD; fire(pl, s); }
    });
  }
  function fire(pl, s) {
    const col = G.U.TYPE_COLOR[s.type] || '#ffffff', a = s.aim;
    G.Projectiles.spawn({
      x: s.x + Math.cos(a) * 4, y: s.y + Math.sin(a) * 4, vx: Math.cos(a) * K.SA_SPEED, vy: Math.sin(a) * K.SA_SPEED,
      dmg: saDmg(pl), r: K.SA_SIZE, life: 1.1, pierce: 0, color: col, homing: 0, hits: new Set(), vis: G.VFX.forType(s.type), ghost: false, owner: pl,
      burn: s.type === 'fire' ? 1 : 0, poison: s.type === 'poison' ? 1 : 0, slow: s.type === 'ice' ? 0.3 : 0, knock: 40, mtype: s.type,
      cc: '', ccp: 0, mkind: 'bolt', mid: 'xsa', dsrc: 'ally', xsa: s.types
    });
    s.shots++;
    G.FX.spark(s.x + Math.cos(a) * 10, s.y - 14 + Math.sin(a) * 10, col, Math.cos(a), Math.sin(a), 3);
  }

  // ---------------- the `x` block's `p` (viewers and guests) ----------------
  /**
   * The host's `p`: {s: [dex, ...] the Support Alphas, t: [id, kind, ...] the League / shiny encounters on the field, f: [kind, dex,
   * x, y, flags (1 shiny), ...] the fainted Pokémon, k: [kind, dex, x, y, flags, seq] the capture under way, n: captures, u: the last
   * one's dex, h: (host frames) the host's uid}. It changes only when one of them does (the replay keeps it in its slow state).
   */
  function pBlock() {
    if (!S || !G.Modes.isExp()) return null;
    const p = {};
    // (D11: the others' Support Alphas: each co-op guest's, from its frames; by uid here, the snapshot renames them)
    if (G.Coop && G.Coop.active && G.Coop.isHost) { const g = {}; for (const m of G.Coop.mates) if (m.connected && m.pl && Array.isArray(m.pl.xsa) && m.pl.xsa.length) g[m.uid] = m.pl.xsa; if (Object.keys(g).length) p.g = g; }
    if (S.sa.length) p.s = S.sa.map(s => s.dex);
    const t = [];
    for (const [id, g] of S.tg) if (g.kind !== 'alpha') t.push(id, KC[g.kind]);
    if (t.length) p.t = t;
    const f = [];
    for (const x of S.faint) f.push(KC[x.kind], x.dex, Math.round(x.x), Math.round(x.y), x.shiny ? 1 : 0);
    if (f.length) p.f = f;
    if (S.cine) p.k = [KC[S.cine.kind], S.cine.dex, Math.round(S.cine.x), Math.round(S.cine.y), S.cine.shiny ? 1 : 0, S.cine.seq];
    if (S.n) { p.n = S.n; p.u = S.last; }
    return Object.keys(p).length ? p : null;
  }
  let vcine = null, vseq = 0, vn = 0, lastDraw = 0;
  /** A viewer / guest: a snapshot's / host frame's `p` (null: none). */
  function applyP(p) {
    if (!p || typeof p !== 'object') { view = null; return; }
    const prevN = view ? view.n : vn;
    view = { s: Array.isArray(p.s) ? p.s : [], t: Array.isArray(p.t) ? p.t : [], f: Array.isArray(p.f) ? p.f : [], k: Array.isArray(p.k) ? p.k : null, n: p.n | 0, u: p.u | 0, h: p.h || null,
             g: p.g && typeof p.g === 'object' ? p.g : null };
    // the encounters on their copies: League (x1.3, ringed), shiny (its shiny sheet, ringed)
    for (let i = 0; i + 1 < view.t.length; i += 2) {
      const e = G.EnemyMgr.get(view.t[i]), kind = KN[view.t[i + 1]];
      if (!e || !e.remote || e.xk === kind) continue;
      e.xk = kind;
      const sc = kind === 'league' ? K.LG_SCALE : e.scale || 1;
      e.scale = sc; e.anim = new G.Sprites.Animator(e.dex, sc, kind === 'shiny'); e.xsh = kind === 'shiny';
      e.r = G.Sprites.bodyRadius(e.dex, sc); e.bodyH = G.Sprites.bodyHeight(e.dex, sc);
      if (kind === 'shiny') G.Sprites.preload([e.dex], 4000, true);
    }
    if (view.k && view.k[5] !== vseq) {
      vseq = view.k[5];
      const w = viewer();
      vcine = { kind: KN[view.k[0]], dex: view.k[1], x: view.k[2], y: view.k[3], shiny: !!view.k[4], seq: vseq, t: 0, scale: view.k[0] === 7 ? K.LG_SCALE : view.k[0] === 1 ? 1.6 : 1,
                from: w ? [w.x, w.y - 18] : [view.k[2], view.k[3] - 80], anim: null };
      vcine.anim = new G.Sprites.Animator(vcine.dex, vcine.scale, vcine.shiny);
      G.Sprites.preload([vcine.dex], 4000, vcine.shiny);
    }
    if (view.n > prevN && G.Game.state === 'watch' && view.u) G.Spawner.say(F('¡Ya está! ¡{x}!', name(view.u)), 2.4, true);   // (a spectator: the host's banners stay on its side)
    vn = view.n;
    for (const d of view.s) if (!vAnims[d]) { vAnims[d] = new G.Sprites.Animator(d, K.SA_SCALE); G.Sprites.preload([d], 4000); }
  }
  /** D11: a player's Support Alphas on its puppet (a co-op guest's, seen by the others; a watched partner's). */
  function applyMate(p, list) {
    if (!p) return;
    p.xsa = Array.isArray(list) && list.length ? list.slice(0, 4).map(d => d | 0) : null;
    for (const d of p.xsa || []) if (!vAnims[d]) { vAnims[d] = new G.Sprites.Animator(d, K.SA_SCALE); G.Sprites.preload([d], 4000); }
  }
  // (D11: the Support Alphas this page doesn't run still shoot, as ghosts: a cosmetic shot at the nearest foe every SA_CD,
  //  no damage, so a spectator / partner sees the allies fight. Keyed by owner and slot.)
  const ghostCd = new Map();
  let ghostShots = 0;
  function ghostShot(key, x, y, type, dt) {
    const c = (ghostCd.has(key) ? ghostCd.get(key) : K.SA_CD * (0.3 + (ghostCd.size % 5) * 0.14)) - dt;
    if (c > 0) { ghostCd.set(key, c); return; }
    ghostCd.set(key, K.SA_CD);
    const tg = nearest(x, y, K.SA_REACH);
    if (!tg) return;
    const a = Math.atan2(tg.y - y, tg.x - x), col = G.U.TYPE_COLOR[type] || '#ffffff';
    G.Projectiles.spawn({ x: x + Math.cos(a) * 4, y: y + Math.sin(a) * 4, vx: Math.cos(a) * K.SA_SPEED, vy: Math.sin(a) * K.SA_SPEED, dmg: 0, r: K.SA_SIZE, life: 1.1,
      pierce: 0, color: col, homing: 0, hits: new Set(), vis: G.VFX.forType(type), ghost: true, friendly: true, owner: null, mtype: type, mkind: 'bolt', mid: 'xsa' });
    G.FX.spark(x + Math.cos(a) * 10, y - 14 + Math.sin(a) * 10, col, Math.cos(a), Math.sin(a), 3);
    ghostShots++;
  }
  const vAnims = {}, vFaint = {};
  const viewer = () => (G.Game.state === 'watch' && G.WatchUI && G.WatchUI.player) || G.Game.player;

  // ---------------- drawing (in code + the Pokémon sheets and the overworld's ball pictures: no new art) ----------------
  const imgs = {};
  function img(nm) {
    let im = imgs[nm];
    if (!im && typeof Image !== 'undefined' && IT()) { im = imgs[nm] = new Image(); im.src = IT().icon(nm); }
    return im && im.complete && im.naturalWidth ? im : null;
  }
  function ballAt(ctx, nm, x, y, s, rot = 0) {
    const im = img(nm);
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); ctx.imageSmoothingEnabled = false;
    if (im) ctx.drawImage(im, -s / 2, -s / 2, s, s);
    else { ctx.fillStyle = nm === 'friend_ball' ? '#5fd07a' : '#ff4d5e'; ctx.beginPath(); ctx.arc(0, 0, s * 0.32, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, Math.PI); ctx.fill(); }
    ctx.restore();
  }
  /** What the scene draws with the y-sorted entities (game.js drawScene): Support Alphas, fainted Pokémon, the ball. */
  function drawables(cam) {
    const out = [], t = performance.now() / 1000, dt = lastDraw ? Math.min(0.05, t - lastDraw) : 0;
    lastDraw = t;
    const own = !!(S && G.Modes.isExp() && G.Game.state !== 'watch'), host = own && !guestSide() && !!S.zkey;   // (D11: own = this page's player's; host = the targets' owner)
    // Support Alphas: your own (the host's, a guest's), then the ones this page sees from others (drawn, and shooting as ghosts)
    if (own) for (const s of S.sa) { if (cam.sees(s.x, s.y, 80)) out.push({ y: s.y, draw: ctx => drawSa(ctx, s.anim, s.x, s.y, s.type) }); }
    const team = (w, list, key) => list.forEach((d, i) => {
      const a = vAnims[d]; if (!a) return;
      a.update(dt); a.loop('Idle'); a.dir = w.anim ? w.anim.dir : 0;
      const [x, y] = slotSpot(w, i, list.length);
      if (dt > 0 && G.Game.state !== 'over' && !w.dead) ghostShot(key + ':' + i, x, y, typeOf(d), dt);
      out.push({ y, draw: ctx => drawSa(ctx, a, x, y, typeOf(d)) });
    });
    if (view && view.s.length && !(own && !guestSide())) {
      const w = view.h && G.Coop && G.Coop.active ? (G.Coop.puppets().find(p => p.uid === view.h) || null) : viewer();
      if (w) team(w, view.s, 'v:' + (view.h || 'me'));
    }
    const pups = G.Game.state === 'watch' ? (G.WatchUI && G.WatchUI.drawables ? G.WatchUI.drawables().slice(1) : []) : G.Coop && G.Coop.active ? G.Coop.puppets() : [];
    for (const p of pups) if (p && Array.isArray(p.xsa) && p.xsa.length && !(view && view.h && p.uid === view.h)) team(p, p.xsa, 'p:' + (p.uid || p.tag || ''));
    // fainted Pokémon (the host's: its own windows, or its `p` block on a guest / viewer)
    const faints = host ? S.faint.map(f => ({ kind: f.kind, x: f.x, y: f.y, anim: f.anim, end: f.end }))
      : view ? chunk(view.f, 5).map(r => ({ kind: KN[r[0]], x: r[2], y: r[3], anim: vFaintAnim(r) })) : [];
    for (const f of faints) {
      if (!cam.sees(f.x, f.y, 90)) continue;
      if (!host && f.anim) f.anim.update(dt);
      out.push({ y: f.y, draw: ctx => drawFaint(ctx, f, t) });
    }
    // the ball (and the Pokémon drawn into it): your own catch, or the one the host's block shows
    const mine = own && S.cine;
    const c = mine ? S.cine : vcine;
    if (c) {
      if (!mine) { c.t += dt; if (c.t > CINE_T + 0.3) vcine = null; else cineFx(c, c.t - dt, c.t); }
      out.push({ y: c.y + 4000, draw: ctx => drawCine(ctx, c, t) });   // (over the sprites round it: the Support Alphas crowd the spot)
    }
    return out;
  }
  const chunk = (a, n) => { const o = []; for (let i = 0; i + n - 1 < (a || []).length; i += n) o.push(a.slice(i, i + n)); return o; };
  function vFaintAnim(r) {
    const k = r.join(':');
    if (!vFaint[k]) { vFaint[k] = new G.Sprites.Animator(r[1], r[0] === 7 ? K.LG_SCALE : r[0] === 1 ? 1.6 : 1, !!r[4]); vFaint[k].play('Faint', { hold: true }); }
    return vFaint[k];
  }
  function drawSa(ctx, a, x, y, type) {
    ctx.save();
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#ff4d5e';
    ctx.beginPath(); ctx.ellipse(x, y, 15, 7, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = G.U.TYPE_COLOR[type] || '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, 17, 8, 0, 0, 6.2832); ctx.stroke();
    ctx.restore();
    a.draw(ctx, x, y);
  }
  function drawFaint(ctx, f, t) {
    const R0 = K.THROW_R * TS(), col = f.kind === 'alpha' ? '#5fd07a' : f.kind === 'shiny' ? '#9ae6ff' : '#7fe0ff';
    ctx.save();
    ctx.globalAlpha = 0.22 + Math.sin(t * 5) * 0.06; ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, R0, R0 * 0.6, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 20; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(f.x, f.y, R0, R0 * 0.6, 0, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    if (f.end != null) {   // (the host's: the window's time left as an arc)
      const left = G.U.clamp((f.end - now()) / (f.kind === 'alpha' ? K.FAINT_T : f.kind === 'league' ? K.LG_WINDOW : K.SH_WINDOW), 0, 1);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(f.x, f.y, R0 + 4, (R0 + 4) * 0.6, 0, -Math.PI / 2, -Math.PI / 2 + left * 6.2832); ctx.stroke();
    }
    ctx.restore();
    if (f.anim) f.anim.draw(ctx, f.x, f.y, { alpha: 0.95 });
    ballAt(ctx, BALL[f.kind] || 'poke_ball', f.x, f.y - 46 + Math.sin(t * 4) * 3, 20);
  }
  /** The capture in the world: the ball's arc, the Pokémon drawn in (white, shrinking), the drop, the shakes, the click. */
  function drawCine(ctx, c, t) {
    const ph = phase(c.t), ball = BALL[c.kind] || 'poke_ball', gy = c.y - 8;
    if (ph.n === 'throw') {
      const u = ph.u, x = c.from[0] + (c.x - c.from[0]) * u, y = c.from[1] + (gy - 26 - c.from[1]) * u - Math.sin(u * Math.PI) * 70;
      if (c.anim) c.anim.draw(ctx, c.x, c.y);
      ballAt(ctx, ball, x, y, 22, u * 12);
      return;
    }
    if (ph.n === 'absorb') {
      const u = ph.u;
      if (c.anim) {
        ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1 - u * 0.95, 1 - u * 0.95); ctx.translate(-c.x, -c.y);
        c.anim.draw(ctx, c.x, c.y + (gy - 26 - c.y) * u, { flash: true }); ctx.restore();
      }
      ctx.save(); ctx.globalAlpha = 0.6 * (1 - u); ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 3;
      for (let k = 0; k < 5; k++) { const a = k / 5 * 6.2832 + t * 3; ctx.beginPath(); ctx.moveTo(c.x, gy - 26); ctx.lineTo(c.x + Math.cos(a) * 30, gy - 26 + Math.sin(a) * 20); ctx.stroke(); }
      ctx.restore();
      ballAt(ctx, ball, c.x, gy - 26, 22, 0);
      return;
    }
    if (ph.n === 'drop') { ballAt(ctx, ball, c.x, gy - 26 + 26 * ph.u * ph.u, 22, 0); return; }
    if (ph.n === 'shake') { ballAt(ctx, ball, c.x, gy, 22, Math.sin(ph.u * Math.PI * 2) * 0.45 * (ph.u < 0.7 ? 1 : 0)); return; }
    // click: the ball, still, with sparkles
    ballAt(ctx, ball, c.x, gy, 22, 0);
    ctx.save(); ctx.fillStyle = '#ffe14d';
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.2832 + t * 2, r = 16 + ph.u * 14; ctx.globalAlpha = 1 - ph.u * 0.6; ctx.fillRect(Math.round(c.x + Math.cos(a) * r) - 1, Math.round(gy + Math.sin(a) * r * 0.7) - 1, 3, 3); }
    ctx.restore();
  }
  /** Under everything (classic.js drawGround): the encounters' auras. */
  function drawGround(ctx) {
    const t = performance.now() / 1000;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || (e.xk !== 'league' && e.xk !== 'shiny') || !G.Camera.sees(e.x, e.y, 60)) continue;
      const col = e.xk === 'league' ? '#7fe0ff' : '#9ae6ff';
      ctx.save();
      ctx.globalAlpha = 0.3 + Math.sin(t * 5 + e.id) * 0.08; ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.5, e.r * 0.75, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = e.xk === 'league' ? '#ffffff' : '#ffe9a0'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 18;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.75, e.r * 0.88, 0, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      if (e.xk === 'shiny' && e.remote && Math.random() < 0.08) G.FX.twinkle(e.x + G.U.rand(-e.r, e.r), e.y - G.U.rand(4, e.bodyH));
    }
  }

  // ---------------- the HUD (classic.js drawHud) and the overlay (ultimates.js drawCut) ----------------
  const hudAnims = {};
  let hudRect = null, overDrawn = 0, overText = '', overRect = null;
  function drawHud(ctx, w, h, pl, Fn, mark) {
    hudRect = null;
    const own = !!(S && G.Modes.isExp() && G.Game.state !== 'watch'), host = own && !guestSide() && !!S.zkey;   // (D11: a guest's chips are its own team)
    const team = own ? S.sa.map(s => s.dex) : view ? view.s : [];
    const cam = G.Camera, k = G.HUD ? G.HUD.k : 1, t = performance.now() / 1000;
    // the Support Alphas: a chip each under the HP bar (and the status chips), with the perk
    if (team.length) {
      const R = G.HUD.rects(), chips = R.find(r => r.name === 'chips'), hp = R.find(r => r.name === 'hp');
      const x0 = 16, y0 = chips ? chips.y + chips.h + 5 : hp ? hp.y + hp.h + 4 : 56, S2 = 30, gap = 4;
      ctx.save(); ctx.textAlign = 'center'; ctx.font = Fn(800, 8);
      team.forEach((d, i) => {
        const x = x0 + i * (S2 + gap), ty = typeOf(d);
        G.HUD.roundRect(ctx, x, y0, S2, S2, 6);
        ctx.fillStyle = 'rgba(10,16,28,.75)'; ctx.fill();
        ctx.strokeStyle = G.U.TYPE_COLOR[ty] || '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
        const a = hudAnims[d] || (hudAnims[d] = new G.Sprites.Animator(d, 0.55));
        ctx.save(); ctx.beginPath(); ctx.rect(x + 1, y0 + 1, S2 - 2, S2 - 2); ctx.clip(); a.draw(ctx, x + S2 / 2, y0 + S2 - 3); ctx.restore();
        const [st, v] = perkOf(ty), txt = st === 'hp' || st === 'armor' || st === 'luck' || st === 'regen' ? '+' + v : '+' + Math.round(v * 100) + '%';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, x + S2 / 2, y0 + S2 + 9); ctx.fillStyle = '#ffd0d4'; ctx.fillText(txt, x + S2 / 2, y0 + S2 + 9);
      });
      ctx.restore();
      hudRect = { x: x0, y: y0, w: team.length * (S2 + gap) - gap, h: S2 + 11 };
      if (mark) mark('xsup', hudRect.x, hudRect.y, hudRect.w, hudRect.h);
    }
    if (!pl) return;
    // labels: a fainted Pokémon's window, an encounter's flee timer
    ctx.save(); ctx.textAlign = 'center'; ctx.font = Fn(800, 11); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
    const label = (x, y, txt, col) => {
      const sx = (x - cam.left()) * cam.scale / k, sy = (y - cam.top()) * cam.scale / k;
      if (sx < 0 || sx > w || sy < 0 || sy > h) return false;
      const s = new String(txt);   // eslint-disable-line no-new-wrappers
      ctx.strokeText(s, sx, sy); ctx.fillStyle = col; ctx.fillText(s, sx, sy);
      return true;
    };
    if (host) {
      for (const f of S.faint) label(f.x, f.y - 66, F('LANZA · {x} s', Math.max(0, Math.ceil(f.end - now()))), f.kind === 'alpha' ? '#9dffb0' : '#bff2ff');
      for (const [, g] of S.tg) {
        if (g.kind === 'alpha' || !g.e || g.e.dead) continue;
        label(g.e.x, g.e.y - g.e.bodyH - 18, (g.kind === 'shiny' ? T.t('VARIOCOLOR') : T.t('SALVAJE')) + ' · ' + F('HUYE EN {x}', G.U.mmss(Math.max(0, g.flee - (now() - g.t0)))), g.kind === 'shiny' ? '#ffe9a0' : '#bff2ff');
      }
    }
    ctx.restore();
    // an arrow at the screen's edge to an encounter or a fainted Pokémon off screen (clear of the minimap)
    const goals = [];
    if (host) { for (const f of S.faint) goals.push([f.x, f.y, f.kind]); for (const [, g] of S.tg) if (g.kind !== 'alpha' && g.e && !g.e.dead) goals.push([g.e.x, g.e.y, g.kind]); }
    else if (own && view) for (const r of chunk(view.f, 5)) goals.push([r[2], r[3], KN[r[0]]]);   // (D11: a guest's arrows to the host's fainted Pokémon)
    for (const [gx, gy, kind] of goals.slice(0, 2)) {
      const sx = (gx - cam.left()) * cam.scale / k, sy = (gy - 30 - cam.top()) * cam.scale / k;
      if (sx > 0 && sx < w && sy > 0 && sy < h) continue;
      const M2 = 40, ey = G.U.clamp(sy, M2 + 90, h - M2 - 110);
      let ex = G.HUD.avoid(G.U.clamp(sx, M2, w - M2 - 200), ey, 22);
      if (hudRect && ex - 24 < hudRect.x + hudRect.w && ex + 24 > hudRect.x && ey + 24 > hudRect.y && ey - 24 < hudRect.y + hudRect.h) ex = hudRect.x + hudRect.w + 30;   // (clear of the chips)
      const a = Math.atan2(sy - ey, sx - ex);
      ctx.save(); ctx.translate(ex, ey);
      ctx.globalAlpha = 0.85; ctx.fillStyle = kind === 'alpha' ? '#5fd07a' : '#7fe0ff';
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24); ctx.lineTo(Math.cos(a + 2.5) * 12, Math.sin(a + 2.5) * 12); ctx.lineTo(Math.cos(a - 2.5) * 12, Math.sin(a - 2.5) * 12); ctx.fill();
      ctx.globalAlpha = 1;
      if (kind === 'shiny') G.Icons.draw(ctx, 'shiny', -11, -11, 22); else ballAt(ctx, BALL[kind] || 'poke_ball', 0, 0, 20, Math.sin(t * 4) * 0.3);
      ctx.restore();
      if (mark) mark('xcap', ex - 24, ey - 24, 48, 48);
    }
  }
  /** Over the HUD: the capture's banner (the ball, the name, 3 shake pips, "Gotcha!") and a soft dim. */
  function drawOver(ctx, w, h) {
    const host = !!(S && S.cine && G.Game.state !== 'watch'), c = host ? S.cine : vcine;
    if (!c) return;
    const ph = phase(c.t), k = G.U.clamp(Math.min(w / 1280, h / 720), 0.55, 1.4), al = Math.min(1, c.t / 0.2) * Math.min(1, (CINE_T + 0.3 - c.t) / 0.3);
    if (al <= 0) return;
    ctx.save();
    ctx.globalAlpha = al * 0.3; ctx.fillStyle = '#000010'; ctx.fillRect(0, 0, w, h);
    const bw = Math.min(w - 24, 520 * k), bh = 64 * k;
    let bx = (w - bw) / 2;
    // (above the move bar: on a phone h x 0.72 would cover its labels)
    const mv = G.HUD && G.HUD.rects().find(r => r.name === 'moves'), top = mv ? mv.y * G.HUD.k : h;
    const by = Math.max(8, Math.min(h * 0.72 - bh / 2, top - bh - 8));
    // (and clear of a first-run tip's box: D7's tip sits under the minimap on a phone, so the banner steps right of it)
    const tb = EC() && EC().tipRect(), hk = G.HUD ? G.HUD.k : 1;
    if (tb && bx < (tb.x + tb.w) * hk + 8 && bx + bw > tb.x * hk && by < (tb.y + tb.h) * hk && by + bh > tb.y * hk) bx = Math.min(w - bw - 8, (tb.x + tb.w) * hk + 10);
    overRect = { x: bx, y: by, w: bw, h: bh };
    ctx.globalAlpha = al;
    G.HUD.roundRect(ctx, bx, by, bw, bh, 12 * k); ctx.fillStyle = 'rgba(10,16,32,.9)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = c.kind === 'alpha' ? '#5fd07a' : c.shiny ? '#ffe14d' : '#7fe0ff'; ctx.stroke();
    ballAt(ctx, BALL[c.kind] || 'poke_ball', bx + 34 * k, by + bh / 2, 34 * k, ph.n === 'shake' ? Math.sin(ph.u * Math.PI * 2) * 0.4 : 0);
    const shakes = ph.n === 'click' ? K.CINE.shakes : ph.n === 'shake' ? ph.k + (ph.u > 0.6 ? 1 : 0) : 0;
    const title = ph.n === 'click' ? (c.kind === 'alpha' ? F('¡Ya está! {x} se une a tu equipo', name(c.dex)) : c.kind === 'league' ? F('¡Ya está! {x} se une a la Liga', name(c.member || c.dex)) : F('¡Ya está! ¡{x} variocolor atrapado!', name(c.dex)))
      : (c.kind === 'alpha' ? T.t('Amigo Ball') : T.t('Poké Ball')) + ' · ' + name(c.dex) + (c.shiny ? ' ★' : '');
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(17 * k)}px Pixelify,"Segoe UI",system-ui,sans-serif`; ctx.fillStyle = '#f4f8ff';
    const tx = bx + 64 * k;
    ctx.fillText(new String(title), tx, by + bh * 0.36, bw - 80 * k);   // eslint-disable-line no-new-wrappers
    for (let i = 0; i < K.CINE.shakes; i++) {
      ctx.beginPath(); ctx.arc(tx + 8 * k + i * 22 * k, by + bh * 0.72, 7 * k, 0, 6.2832);
      ctx.fillStyle = i < shakes ? '#ffe14d' : 'rgba(255,255,255,.18)'; ctx.fill();
    }
    ctx.restore();
    overDrawn++; overText = title;
  }

  // ---------------- the minimap (minimap.draw): the encounters and the fainted Pokémon ----------------
  function drawMini(ctx, pl, api) {
    if (!S || !G.Modes.isExp()) return;
    const pts = [];
    for (const [, g] of S.tg) if (g.kind !== 'alpha' && g.e && !g.e.dead) pts.push([g.e.x, g.e.y, g.kind]);
    for (const f of S.faint) pts.push([f.x, f.y, 'faint']);
    for (const [x, y, kind] of pts) {
      const q = api.edge(api.pt(x, y));
      ctx.save(); ctx.fillStyle = kind === 'shiny' ? '#ffe9a0' : kind === 'faint' ? '#5fd07a' : '#7fe0ff'; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.2832 - Math.PI / 2, r = i % 2 ? 2.4 : 5.5; ctx.lineTo(q.x + Math.cos(a) * r, q.y + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      api.rec('x-cap-' + kind, q);
    }
  }

  // ---------------- the end of the run (the Expedition save: sets unioned, counters max-merged) ----------------
  function record() {
    const Sv = G.ExpSave;
    if (!S || !Sv) return [];
    const L = S.log;
    if (L.alpha) Sv.bump('cap.alpha', L.alpha);
    if (L.best) Sv.best('sa.best', L.best);
    for (const s of S.sa) Sv.add('sa.types', s.type);
    if (L.seen) Sv.bump('shiny.seen', L.seen);
    if (L.fled) Sv.bump('cap.fled', L.fled);
    const out = [];
    if (S.sa.length) out.push(F('Alfas de apoyo: {x}', S.sa.map(s => name(s.dex)).join(', ')));
    if (L.league.length) out.push(F('Capturados: {x}', L.league.map(name).join(', ')));
    if (L.shiny.length) out.push(F('Variocolor: {x}', L.shiny.map(name).join(', ')));
    return out;
  }

  return {
    K, PERK, CINE_T, KC, shinyChance, zonePlan, pendingOf, perkOf, perkText, slotsMax, phase,
    begin, reset, mark, tick, hold, alphaDown, perk, recruit, slotSpot, pBlock, applyP, drawables, drawGround, drawHud, drawOver, drawMini, record,
    spawnLeague, spawnShiny, faint, startCine, netEvent, applyMate, grant,
    get ghostShots() { return ghostShots; },
    get run() { return S; }, get view() { return view; }, get vcine() { return vcine; }, get hudRect() { return hudRect; },
    get overDrawn() { return overDrawn; }, get overText() { return overText; }, get overRect() { return overRect; }
  };
})();
