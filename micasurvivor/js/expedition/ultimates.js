'use strict';
/* ============ expedition/ultimates.js — the Expedition's Ultimates (MicaSurvivor DLC D6, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it. In an Expedition zone the
 * Ultimate takes the Z-move's place (its key, its pad buttons, its HUD spot: js/systems/zmoves.js steps aside when
 * G.World.zone is set). Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.4 and the D6 row; numbers in K (README "DLC D6").
 *
 *   charge   0 -> 1. Passive: full in 95 s. A kill: +0.004 from a bucket that holds 0.024 and refills 0.008 a second
 *            (so a swarm can't fill it at once). Elite / summoner +0.03, alpha / totem +0.08, guardian / legendary / any
 *            boss +0.2 (outside the bucket). Damage taken: +0.35 x the damage / max HP. Nothing charges while casting.
 *            pl.xultCharge multiplies every source (1; the study's Soul Dew / Lunar Blessing are for a later item batch).
 *   cast     Z or R / the pad's Z-move, Y or RT buttons (the base game's Z-move buttons, in a zone only) / the HUD button
 *            (touch or mouse). A 0.32 s hit-stop (the world holds: the run.hold seam), the cut-in (1.1 s: the caster's
 *            sprite, the Ultimate's name, its tier), then the choreography. I-frames for the whole cast + 0.6 s (pl.invuln
 *            and the player.hurt seam, before the items' shield).
 *   damage   base 40 x (1 + 0.1 level) x (1 + 0.15 tier) x attack x 0.62 (D5's study-to-our-scale factor) per unit of each
 *            hit's own weight in the choreography; against a boss the Z-move's own cap holds (28 % of its max HP a piece).
 *   tier     the League row's evolutions + Maturity (0..4; study: "evolution stage + Maturity"). The signature's NAME is
 *            the tier's (min 2): Charmander -> Charmeleon -> Charizard, or a non-evolver's Maturity.
 *   type     every other member: its form's first type's Z-move choreography (js/systems/zmoves.js, all 18), rescaled,
 *            under the Z-move's name.
 *   signatures 16 (SIGS): the 3 Kanto starters, Pikachu's line (Pichu), Gengar's (Gastly), Gyarados's (Magikarp),
 *            Dragonite's (Dratini), Mewtwo, Mew, the 3 birds, and in place of the plan's Eevee, Snorlax, Lapras and Ditto
 *            (none of them is a League entry: not three-stage, no Mega, not legendary) Alakazam's (Abra), Machamp's
 *            (Machop), Tyranitar's (Larvitar) and Garchomp's (Gible). Each is its type's choreography plus its own
 *            beats by tier. Mew: "Metronome", 1 / 2 / 3 copies of the other 15 (the run's seeded stream).
 *   auto     a setting (the Expedition save: two Lamport counters, `ult.auto.on` / `ult.auto.off`, merged by max, so the
 *            latest switch wins on every device): casts as soon as it is full with a foe within 480 px. U toggles it,
 *            the AUTO chip under the button (touch, mouse), or the pause screen's button (pad).
 *
 * Sync (the `x` block v6 `w`, js/expedition/core.js): row() = [charge %, pieces cast, piece code, tier, flags (1 casting,
 * 2 auto), the cast's code]; applyRow(p, r) on a viewer's / partner's puppet shows the meter, the cut-in when the casting
 * flag rises and each piece's choreography (a GHOST: no damage, no heal, no move) when the count goes up. Codes: a
 * signature is its member's dex, a type Ultimate 2000 + its index in G.ZMoves.ORDER.
 * Determinism: the charge is pure (time, kills, hurts); Mew's copies come from G.DLC.rng; the choreography's flourishes
 * use Math.random like the base Z-move (combat stays Math.random, as in base).
 */
G.I18n.add({
  'Definitivo': 'Ultimate', 'DEFINITIVO': 'ULTIMATE', 'DEFINITIVO DE TIPO': 'TYPE ULTIMATE',
  '¡Definitivo listo!': 'Ultimate ready!', '¡Listo!': 'Ready!', '¡En uso!': 'Casting!',
  'Definitivo automático: Sí': 'Auto-Ultimate: On', 'Definitivo automático: No': 'Auto-Ultimate: Off',
  'Definitivos: {x}': 'Ultimates: {x}',
  // the 16 signatures (our own names, never PokéBonk's)
  'Semilla Furiosa': 'Furious Seed', 'Tormenta de Pétalos': 'Petal Storm', 'Jardín Solar': 'Solar Garden',
  'Brasa Rugiente': 'Roaring Ember', 'Torbellino Ígneo': 'Fire Vortex', 'Infierno Alado': 'Winged Inferno',
  'Ola Burbuja': 'Bubble Wave', 'Marea Giratoria': 'Spinning Tide', 'Cañón Hidráulico': 'Hydro Cannon',
  'Chispazo': 'Spark Burst', 'Rayo en Cadena': 'Chain Bolt', 'Placaje Voltio': 'Volt Tackle',
  'Lengüetazo Sombrío': 'Shadow Lick', 'Lluvia de Sombras': 'Shadow Rain', 'Mal de Ojo': 'Evil Eye',
  'Salpicadura Feroz': 'Fierce Splash', 'Furia del Mar': 'Sea Rage', 'Hiperrayo Abisal': 'Abyssal Hyper Beam',
  'Furia Dragón': 'Dragon Fury', 'Danza Dragón': 'Dragon Dance', 'Cometa Draco': 'Draco Comet',
  'Onda Mental': 'Mind Wave', 'Psicocarga': 'Psycho Charge', 'Psicoataque Total': 'Total Psystrike',
  'Metrónomo': 'Metronome', 'Metrónomo Doble': 'Double Metronome', 'Metrónomo Triple': 'Triple Metronome',
  'Viento Hielo': 'Icy Wind', 'Ventisca': 'Blizzard', 'Cero Glacial': 'Glacial Zero',
  'Impactrueno': 'Thunder Shock', 'Tormenta Eléctrica': 'Electric Storm', 'Ala Trueno': 'Thunder Wing',
  'Ala Ígnea': 'Flame Wing', 'Fuego Sagrado': 'Sacred Fire', 'Sol Abrasador': 'Scorching Sun',
  'Teletransporte': 'Teleport Burst', 'Psicorrayo Estelar': 'Star Psybeam', 'Premonición': 'Future Sight',
  'Puño Kárate': 'Karate Rush', 'Tajo Cruzado': 'Cross Chop', 'Puño Dinámico': 'Dynamic Punch',
  'Lanzarrocas': 'Rock Toss', 'Avalancha': 'Rock Avalanche', 'Filo del Desierto': 'Desert Edge',
  'Bucle Arena': 'Sand Tomb', 'Garra Dragón': 'Dragon Claw', 'Cometa Terrestre': 'Earth Comet'
});

G.ExpUlt = (() => {
  // ---------------- balance (tune here; README "DLC D6") ----------------
  const K = {
    PASSIVE_T: 95,                     // seconds to fill from nothing (study 2.4)
    KILL: 0.004, BUCKET: 0.024, BUCKET_RATE: 0.008,   // a kill's share, the bucket's size, its refill a second
    ELITE: 0.03, ALPHA: 0.08, BOSS: 0.2,              // elite / summoner, alpha / totem, guardian / legendary / boss
    HURT: 0.35,                        // damage taken: + 0.35 x damage / max HP
    HITSTOP: 0.32, CUT_T: 1.1, AFTER: 0.6,            // the hold, the cut-in, the i-frames after the cast
    DMG: 40, DMG_LV: 0.1, DMG_TIER: 0.15, DMG_K: 0.62,   // 40 x (1 + 0.1 L) x (1 + 0.15 tier) x atk x 0.62
    TIER_MAX: 4,                       // evolutions (0-2) + Maturity (0-2)
    AUTO_R: 480,                       // auto casts with a foe this close
    TYPE0: 2000                        // a type Ultimate's code: 2000 + its index in G.ZMoves.ORDER
  };
  const T = G.I18n;
  const TAU = Math.PI * 2;
  const ORDER = () => G.ZMoves.ORDER;
  const LG = () => G.ExpLeague;

  // ---------------- the 16 signatures ----------------
  // {type: the Z choreography it starts from, names: by tier (0, 1, 2+), x: [[min tier, beat, args]]}. A beat's t is
  // seconds into the piece; the piece lasts at least until its last beat + 0.5 s.
  const SIGS = {
    1: { type: 'grass', names: ['Semilla Furiosa', 'Tormenta de Pétalos', 'Jardín Solar'],
      x: [[1, 'ring', { t: 1.6, r: 320, k: 1.2, sp: 'leaf' }], [2, 'beams', { t: 2.4, n: 3, len: 640, k: 2.0, w: 34 }], [2, 'heal', { t: 3.0, f: 0.08 }]] },
    4: { type: 'fire', names: ['Brasa Rugiente', 'Torbellino Ígneo', 'Infierno Alado'],
      x: [[1, 'ring', { t: 2.0, r: 300, k: 1.4, sp: 'fire' }], [2, 'dive', { t: 3.0, r: 330, k: 3.0 }]] },
    7: { type: 'water', names: ['Ola Burbuja', 'Marea Giratoria', 'Cañón Hidráulico'],
      x: [[1, 'ring', { t: 1.3, r: 300, k: 1.1, sp: 'drop' }], [2, 'beams', { t: 3.1, n: 4, len: 660, k: 2.2, w: 38 }]] },
    172: { type: 'electric', names: ['Chispazo', 'Rayo en Cadena', 'Placaje Voltio'],
      x: [[1, 'smite', { t: 1.2, n: 5, k: 1.6 }], [2, 'dive', { t: 2.9, r: 280, k: 2.8, cc: 'para' }]] },
    92: { type: 'ghost', names: ['Lengüetazo Sombrío', 'Lluvia de Sombras', 'Mal de Ojo'],
      x: [[1, 'meteors', { t: 1.0, n: 6, k: 1.5, sp: 'shadow' }], [2, 'drain', { t: 3.5, p: 0.12 }]] },
    129: { type: 'water', names: ['Salpicadura Feroz', 'Furia del Mar', 'Hiperrayo Abisal'],
      x: [[1, 'beams', { t: 1.8, n: 2, len: 700, k: 2.0, w: 34 }], [2, 'beams', { t: 3.1, n: 1, len: 920, k: 4.5, w: 64 }]] },
    147: { type: 'dragon', names: ['Furia Dragón', 'Danza Dragón', 'Cometa Draco'],
      x: [[1, 'ring', { t: 1.2, r: 260, k: 1.2, sp: 'fire' }], [2, 'meteors', { t: 2.2, n: 8, k: 2.2, r: 120 }]] },
    150: { type: 'psychic', names: ['Onda Mental', 'Psicocarga', 'Psicoataque Total'],
      x: [[0, 'pull', { t: 0.2, d: 2.2, r: 520 }], [1, 'smite', { t: 1.6, n: 6, k: 1.6, cc: 'conf' }], [2, 'nova', { t: 3.3, r: 440, k: 3.4 }]] },
    151: { type: 'psychic', names: ['Metrónomo', 'Metrónomo Doble', 'Metrónomo Triple'], copies: true, x: [] },
    144: { type: 'ice', names: ['Viento Hielo', 'Ventisca', 'Cero Glacial'],
      x: [[1, 'meteors', { t: 1.0, n: 10, k: 1.0, sp: 'shard' }], [2, 'nova', { t: 3.4, r: 480, k: 2.4, cc: 'freeze' }]] },
    145: { type: 'electric', names: ['Impactrueno', 'Tormenta Eléctrica', 'Ala Trueno'],
      x: [[0, 'smite', { t: 0.9, n: 4, k: 1.4 }], [1, 'smite', { t: 1.8, n: 6, k: 1.6 }], [2, 'smite', { t: 2.6, n: 10, k: 1.8 }]] },
    146: { type: 'fire', names: ['Ala Ígnea', 'Fuego Sagrado', 'Sol Abrasador'],
      x: [[0, 'dive', { t: 1.6, r: 260, k: 2.0 }], [1, 'ring', { t: 2.4, r: 320, k: 1.6, sp: 'fire' }], [2, 'nova', { t: 3.6, r: 520, k: 2.6 }]] },
    63: { type: 'psychic', names: ['Teletransporte', 'Psicorrayo Estelar', 'Premonición'],
      x: [[0, 'dive', { t: 0.3, r: 200, k: 1.2 }], [1, 'beams', { t: 1.6, n: 5, len: 520, k: 1.4, w: 26 }], [2, 'meteors', { t: 3.0, n: 5, k: 2.6, r: 140, sp: 'ring' }]] },
    66: { type: 'fighting', names: ['Puño Kárate', 'Tajo Cruzado', 'Puño Dinámico'],
      x: [[1, 'beams', { t: 2.6, n: 2, len: 420, k: 2.0, w: 40 }], [2, 'nova', { t: 2.95, r: 300, k: 2.4, cc: 'conf' }]] },
    246: { type: 'rock', names: ['Lanzarrocas', 'Avalancha', 'Filo del Desierto'],
      x: [[1, 'meteors', { t: 1.2, n: 6, k: 1.6, sp: 'rock' }], [2, 'ring', { t: 3.6, r: 420, k: 2.4, sp: 'rock' }]] },
    443: { type: 'ground', names: ['Bucle Arena', 'Garra Dragón', 'Cometa Terrestre'],
      x: [[1, 'dive', { t: 1.0, r: 240, k: 1.8 }], [2, 'meteors', { t: 2.6, n: 6, k: 2.4, r: 130, sp: 'rock' }]] }
  };
  const SIG_CODES = Object.keys(SIGS).map(Number);

  // ---------------- codes, names, tiers (pure) ----------------
  const isType = c => c >= K.TYPE0 && c < K.TYPE0 + 18;
  const typeOfCode = c => (isType(c) ? ORDER()[c - K.TYPE0] : SIGS[c] ? SIGS[c].type : 'normal');
  const typeCode = t => K.TYPE0 + Math.max(0, ORDER().indexOf(t));
  /** The Ultimate of League member `member` playing form `form`: its signature, or its form's first type's. */
  function codeFor(member, form) {
    if (SIGS[member]) return member;
    const p = G.DEX_BY[form] || G.DEX_BY[member];
    return typeCode(p && p.types ? p.types[0] : 'normal');
  }
  /** The tier from a League row [member, form, kit, Maturity, evolutions]. */
  const tierOfRow = r => (Array.isArray(r) ? Math.min(K.TIER_MAX, (r[4] | 0) + (r[3] | 0)) : 0);
  /** An Ultimate's name at a tier (Spanish key; the canvas translates). */
  function nameOf(code, tier) {
    if (SIGS[code]) return SIGS[code].names[Math.min(2, Math.max(0, tier | 0))];
    const d = G.ZMoves.DEF[typeOfCode(code)];
    return d ? d.name : 'Definitivo';
  }
  /** Its damage per unit of a hit's weight (study 2.4, rescaled). */
  function dmgOf(pl, tier) {
    return K.DMG * (1 + K.DMG_LV * (pl.level || 1)) * (1 + K.DMG_TIER * (tier | 0)) * (pl.atk || 1) * K.DMG_K * (pl.xultDmg || 1);
  }

  // ---------------- state ----------------
  let S = null;
  const queued = { cast: false };
  function begin(pl) {
    S = null;
    if (!pl || !G.Modes.isExp()) return null;
    S = { c: 0, bucket: K.BUCKET, n: 0, casts: 0, sigs: 0, cast: null, iT: 0, ready: false, code: 0, head: 0, tier: 0,
          src: { passive: 0, kill: 0, elite: 0, alpha: 0, boss: 0, hurt: 0 }, names: [] };
    pl.xult = false;
    queued.cast = false;
    sync(pl);
    mountUI();
    return S;
  }
  function reset() {
    if (S && S.cast && S.cast.fx && G.Game.player) G.Game.player.zHidden = false;
    S = null; ghosts.length = 0; vcut = null;
    const pl = G.Game && G.Game.player; if (pl) pl.xult = false;
    syncPause();
  }
  /** The local player's current Ultimate (code, tier) from its League row. */
  function sync(pl) {
    if (!S) return;
    const r = LG() && LG().row();
    S.tier = tierOfRow(r);
    const c = r ? codeFor(r[0], r[1]) : typeCode((pl.mon && pl.mon.types && pl.mon.types[0]) || 'normal');
    if (!S.cast) { S.code = c; S.head = c; }
    return c;
  }
  const chargeK = pl => (pl && pl.xultCharge > 0 ? pl.xultCharge : 1);
  function gain(pl, v, src) {
    if (!S || S.cast || !(v > 0)) return 0;
    v *= chargeK(pl);
    S.src[src] = (S.src[src] || 0) + v;
    S.c = Math.min(1, S.c + v);
    return v;
  }

  // ---------------- the charge sources ----------------
  /** enemy.ko (the host / solo sim): the bucket for a plain kill, the bonuses for special ones. */
  function onKill(e, pl) {
    if (!S || !e) return;
    const p = G.Game.player;
    if (e.boss || e.xk === 'guardian' || e.xk === 'legend') gain(p, K.BOSS, 'boss');
    else if (e.xk === 'alpha' || e.xk === 'totem') gain(p, K.ALPHA, 'alpha');
    else if (e.xk === 'elite' || e.xk === 'summoner') gain(p, K.ELITE, 'elite');
    else if (!S.cast) { const take = Math.min(S.bucket, K.KILL); S.bucket -= take; gain(p, take, 'kill'); }
  }
  /** player.hurt (after the items): damage actually taken charges. */
  function hurt(d, pl) { if (S && pl && pl === G.Game.player && d > 0 && pl.maxHp > 0) gain(pl, K.HURT * d / pl.maxHp, 'hurt'); }
  /** player.hurt (first): the cast's i-frames (also against lava, which zeroes pl.invuln). */
  const guard = pl => !!S && !!pl && pl === G.Game.player && (!!S.cast || S.iT > 0);

  // ---------------- casting ----------------
  const ready = () => !!S && S.c >= 0.9999 && !S.cast;
  function canCast(pl) {
    return !!S && !!pl && pl === G.Game.player && !pl.dead && !pl.remote && G.Game.state === 'playing' && ready() && G.Modes.isExp();
  }
  /** A press from the pad / a HUD button: cast on the next step. */
  function press() { queued.cast = true; }
  function mixSeed(...v) { return G.ExpLevel && G.ExpLevel.mix ? G.ExpLevel.mix(...v) : v.reduce((h, x) => (Math.imul(h ^ (x | 0), 0x85EBCA6B) >>> 0), 0x2545F491); }
  /** Mew's copies: `n` of the other signatures, from the run's seeded stream (the world seed + the cast count). */
  function copiesOf(n) {
    const rng = G.DLC.rng(mixSeed(G.World.seed | 0, S.casts, 0x3E7));
    const pool = SIG_CODES.filter(c => c !== 151), out = [];
    for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
  }
  function tryCast(pl = G.Game.player) {
    if (!canCast(pl)) return false;
    const head = sync(pl), tier = S.tier;
    const queue = SIGS[head] && SIGS[head].copies ? copiesOf(1 + Math.min(2, tier)) : [head];
    S.cast = { t: 0, hold: K.HITSTOP, head, tier, queue, fx: null };
    S.c = 0; S.ready = false; S.casts++; S.head = head;
    if (SIGS[head]) S.sigs++;
    S.names.push(nameOf(head, tier));
    pl.xult = true;
    pl.invuln = Math.max(pl.invuln, 1);
    G.Audio.sfx('legend');
    G.FX.ring(pl.x, pl.y, 10, 240, G.U.TYPE_COLOR[typeOfCode(head)] || '#ffffff', 0.7, 5);
    shake(5);
    return true;
  }
  function shake(s) {
    const k = G.Settings.get('calm') ? 0.25 : 1;
    G.Camera.shake = Math.min(1.2, Math.max(G.Camera.shake || 0, s / 7 * k));
  }
  /** run.hold: the cast's hit-stop holds the world (the cut-in plays on). */
  function hold(dt, pl) {
    if (!S || !S.cast || !(S.cast.hold > 0)) return undefined;
    S.cast.hold -= dt; S.cast.t += dt;
    pl.invuln = Math.max(pl.invuln, 0.5);
    return true;
  }
  function endCast(pl) {
    S.cast = null; S.iT = K.AFTER;
    pl.xult = false; pl.zHidden = false;
    pl.invuln = Math.max(pl.invuln, K.AFTER);
    sync(pl);
  }
  function stepCast(dt, pl) {
    const c = S.cast;
    if (pl.dead) { endCast(pl); return; }
    c.t += dt;
    pl.invuln = Math.max(pl.invuln, 0.3);
    if (!c.fx) {
      const code = c.queue.shift();
      c.fx = makeFx(pl, code, c.tier, false);
      S.code = code; S.n++;
      return;
    }
    c.fx.tick(dt);
    if (c.fx.done) {
      pl.zHidden = false;
      if (c.queue.length) c.fx = null;   // (Mew: the next copy, on the next step)
      else endCast(pl);
    }
  }
  /** run.tick (an Expedition run, the world running): the charge, the keys, auto, the cast. */
  function tick(dt, pl) {
    if (!S || !pl) return;
    if (S.iT > 0) S.iT -= dt;
    if (S.cast) { stepCast(dt, pl); queued.cast = false; return; }
    sync(pl);
    gain(pl, dt / K.PASSIVE_T, 'passive');
    S.bucket = Math.min(K.BUCKET, S.bucket + K.BUCKET_RATE * dt);
    if (G.Input.tap('keyu')) setAuto(!auto());
    const want = queued.cast || G.Input.tap('keyz') || G.Input.tap('keyr');
    queued.cast = false;
    if (ready() && !S.ready) {
      S.ready = true;
      G.FX.dmgText(pl.x, pl.y - (pl.bodyH || 30) - 20, '¡Definitivo listo!', '#ffd23f', true);
      G.Audio.sfx('select');
    }
    if (want) { if (!tryCast(pl)) G.Audio.sfx('error'); }
    else if (auto() && ready() && foeNear(pl)) tryCast(pl);
  }
  function foeNear(pl) {
    const r2 = K.AUTO_R * K.AUTO_R;
    for (const e of G.EnemyMgr.all()) if (!e.dead && G.U.dist2(e.x, e.y, pl.x, pl.y) < r2) return true;
    return false;
  }

  // ---------------- the choreography: a Z-move Effect + the signature's beats ----------------
  /** One piece: the code's type choreography (G.ZMoves.effect), its damage, the signature's beats; a ghost hurts nothing. */
  function makeFx(p, code, tier, ghost) {
    const sig = SIGS[code], type = typeOfCode(code);
    const fx = G.ZMoves.effect(p, type);
    fx.dmg = ghost ? 0 : dmgOf(p, tier);
    fx.xcode = code; fx.xtier = tier; fx.xcont = [];
    if (ghost) {
      const none = () => 0;
      fx.zhit = none; fx.heal = none; fx.healText = none; fx.moveTo = none;
    }
    const base = fx.cont;
    fx.cont = function (dt) { base.call(this, dt); for (const f of this.xcont) f(dt); };
    if (sig) for (const [min, beat, a] of sig.x) if ((tier | 0) >= min && BEATS[beat]) { BEATS[beat](fx, a); fx.dur = Math.max(fx.dur, a.t + (a.d || 0) + 0.14 * (a.n || 0) + 0.6); }
    return fx;
  }
  const vis = fx => G.VFX.forMove({ id: 'xult-' + fx.type, type: fx.type });
  const BEATS = {
    /** a shock ring around the caster */
    ring(fx, a) {
      fx.at(a.t, () => {
        const x = fx.pl.x, y = fx.pl.y;
        G.FX.ring(x, y, 16, a.r, fx.col(3), 0.5, 6);
        if (a.sp) for (let i = 0; i < 18; i++) { const g = TAU * i / 18; G.FX.sp(a.sp, fx.pal, x + Math.cos(g) * 30, y + Math.sin(g) * 30, { vx: Math.cos(g) * a.r * 1.7, vy: Math.sin(g) * a.r * 1.7, life: 0.5, scale: 1.6, angle: g }); }
        fx.boom(x, y, a.r * 0.7, 5);
        fx.hit(x, y, a.r, a.k, 240, a.cc || '');
      });
    },
    /** n beams from the caster, the first at the densest group */
    beams(fx, a) {
      fx.at(a.t, () => {
        const x = fx.pl.x, y = fx.pl.y, [tx, ty] = fx.densest(620), a0 = Math.atan2(ty - y, tx - x) || 0, seen = new Set(), w = a.w || 30, v = vis(fx);
        for (let j = 0; j < a.n; j++) {
          const g = a0 + TAU * j / a.n;
          G.FX.beam(x, y, g, a.len, w, fx.col(3), v);
          fx.hitSeg(x, y, x + Math.cos(g) * a.len, y + Math.sin(g) * a.len, w + 16, a.k, 200, a.cc || '', seen);
        }
        shake(6);
      });
    },
    /** n strikes from the sky on foes near the caster */
    smite(fx, a) {
      for (let i = 0; i < a.n; i++) {
        fx.at(a.t + i * 0.09, () => {
          const [x, y] = fx.tpos(540);
          G.FX.beam(x, y - 480, Math.PI / 2, 480, 18, fx.col(4), vis(fx));
          fx.boom(x, y, 80, 2);
          fx.hit(x, y, 85, a.k, 120, a.cc || 'para');
        });
      }
    },
    /** the caster dives onto the densest group */
    dive(fx, a) {
      fx.at(a.t, () => {
        const [x, y] = fx.densest(560);
        G.FX.ring(fx.pl.x, fx.pl.y, 10, 90, fx.col(4), 0.35, 4);
        fx.moveTo(x, y);
        const px = fx.ghostX != null ? x : fx.pl.x, py = fx.ghostX != null ? y : fx.pl.y;
        G.FX.ring(px, py, 20, a.r, fx.col(4), 0.6, 8);
        fx.boom(px, py, a.r, 10);
        fx.hit(px, py, a.r, a.k, 600, a.cc || '');
      });
    },
    /** n meteors on foes, each landing 0.2 s after it shows */
    meteors(fx, a) {
      for (let i = 0; i < a.n; i++) {
        fx.at(a.t + i * 0.14, () => {
          const [x, y] = fx.tpos(560), r = a.r || 100;
          G.FX.sp(a.sp || 'star', fx.pal, x, y - 260, { vy: 1300, life: 0.2, scale: 3 });
          fx.at(fx.t + 0.2, () => { fx.boom(x, y, r, 3); fx.hit(x, y, r, a.k, 200, a.cc || ''); });
        });
      }
    },
    /** a nova from the caster: the ring closes in, then bursts */
    nova(fx, a) {
      fx.at(a.t - 0.3, () => G.FX.ring(fx.pl.x, fx.pl.y, a.r, 20, fx.col(4), 0.3, 8));
      fx.at(a.t, () => {
        const x = fx.pl.x, y = fx.pl.y;
        G.FX.ring(x, y, 20, a.r * 1.1, '#ffffff', 0.5, 10);
        fx.boom(x, y, a.r, 12);
        fx.hit(x, y, a.r, a.k, 700, a.cc || '');
      });
    },
    /** foes within r are pulled to the caster for d seconds */
    pull(fx, a) {
      fx.xcont.push(dt => {
        if (fx.t < a.t || fx.t > a.t + a.d) return;
        const x = fx.pl.x, y = fx.pl.y;
        for (const e of fx.near(x, y, a.r)) { if (e.boss) continue; const [nx, ny] = G.U.norm(x - e.x, y - e.y); e.x += nx * 240 * dt; e.y += ny * 240 * dt; }
      });
    },
    /** non-boss foes on screen lose a share of their life; you heal a little for each */
    drain(fx, a) {
      fx.at(a.t, () => {
        const x = fx.pl.x, y = fx.pl.y;
        let n = 0;
        for (const e of fx.near(x, y, 560)) {
          n++;
          const [dx, dy] = G.U.norm(x - e.x, y - e.y);
          fx.zhit(e, (e.boss ? 0 : e.hp * a.p) + fx.dmg * 0.4, dx, dy, 0);
          if (n <= 16) G.FX.sp('shadow', fx.pal, e.x, e.y, { vx: dx * 520, vy: dy * 520, life: 0.5, scale: 1.6 });
        }
        const h = Math.min(0.1, 0.004 * n);
        fx.heal(h); fx.healText(h);
        fx.boom(x, y, 300, 8);
      });
    },
    heal(fx, a) { fx.at(a.t, () => { fx.heal(a.f); fx.healText(a.f); G.FX.ring(fx.pl.x, fx.pl.y, 6, 90, '#7dffb0', 0.5, 4); }); }
  };

  // ---------------- viewers: rows, ghosts, the cut-in ----------------
  /** The local player's row (null outside an Expedition run). */
  function row() {
    if (!S) return null;
    return [Math.round(S.c * 100), S.n, S.code, S.cast ? S.cast.tier : S.tier, (S.cast ? 1 : 0) | (auto() ? 2 : 0), S.cast ? S.cast.head : S.head];
  }
  const ghosts = [];
  let vcut = null;
  /** A puppet p (a viewer's watched player, a co-op partner) shows row r: the meter; a rising cast flag: the cut-in; a
   *  higher piece count: that piece's choreography, as a ghost. The first row a puppet gets only sets it up. */
  function applyRow(p, r) {
    if (!p) return false;
    mountUI();
    const prev = p.xw || null;
    p.xw = Array.isArray(r) ? r : null;
    if (!p.xw || !prev) return false;
    if ((r[4] & 1) && !(prev[4] & 1)) vcut = { p, head: r[5], tier: r[3], t: 0 };
    if ((r[4] & 1) && r[1] > prev[1]) {
      const fx = makeFx(p, r[2], r[3], true);
      fx.ghostX = 1;
      ghosts.push({ p, fx });
      p.xult = true;
    }
    return true;
  }
  /** The ghosts' and the viewer cut-in's clock (each render: the watch screen and a co-op guest run no Expedition tick). */
  function viewTick(dt) {
    if (vcut) { vcut.t += dt; if (vcut.t > K.CUT_T) vcut = null; }
    if (!ghosts.length) return;
    for (const g of ghosts) { try { g.fx.tick(dt); } catch (e) { g.fx.done = true; } }
    for (let i = ghosts.length - 1; i >= 0; i--) if (ghosts[i].fx.done) { const p = ghosts[i].p; ghosts.splice(i, 1); if (!ghosts.some(g => g.p === p)) { p.xult = false; p.zHidden = false; } }
    if (G.Game.state === 'watch') G.ZMoves.updateWorld(dt);   // (the fire wisps: the base loop only runs them in play)
  }
  let lastDraw = 0;
  /** The dim under the HUD (called each render in a zone): the local cast's and a viewer's; also the viewers' clock. */
  function drawDim(ctx, w, h) {
    const now = performance.now(), dt = lastDraw ? Math.min(0.05, (now - lastDraw) / 1000) : 0;
    lastDraw = now;
    viewTick(dt);
    const c = cutNow();
    let d = c ? 0.42 * Math.min(1, c.t / 0.15) * Math.min(1, (K.CUT_T - c.t) / 0.3 + 0.4) : 0;
    const fx = S && S.cast && S.cast.fx;
    if (fx && fx.dim) d = Math.max(d, fx.dim);
    if (d <= 0) return;
    ctx.save(); ctx.fillStyle = `rgba(0,0,12,${Math.min(0.62, d).toFixed(3)})`; ctx.fillRect(0, 0, w, h); ctx.restore();
  }
  /** The cut-in now: the local cast's, else a viewer's. {p, head, tier, t} */
  function cutNow() {
    if (S && S.cast && S.cast.t < K.CUT_T) return { p: G.Game.player, head: S.cast.head, tier: S.cast.tier, t: S.cast.t };
    return vcut;
  }
  const F = (wt, s) => `${wt} ${Math.round(s)}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const raw = s => new String(s);   // eslint-disable-line no-new-wrappers
  const easeOut = x => 1 - Math.pow(1 - x, 3);
  const rgb = hex => { const n = parseInt((hex || '#ffffff').slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  let cutDrawn = 0, cutLast = null;
  /** The cut-in (study 2.4's portrait cut-in): a slanted band in the type's colour, the caster's sprite, the name. */
  function drawCut(ctx, w, h) {
    if (G.ExpCap) G.ExpCap.drawOver(ctx, w, h);   // (D8: the capture cinematic's banner, the host's and a viewer's)
    const c = cutNow();
    if (!c || !c.p) return;
    const u = c.t / K.CUT_T, inn = easeOut(G.U.clamp(c.t / 0.18, 0, 1)), out = G.U.clamp((K.CUT_T - c.t) / 0.22, 0, 1), al = Math.min(1, inn * 1.2) * out;
    if (al <= 0) return;
    const k = G.U.clamp(Math.min(w / 1280, h / 720), 0.5, 1.4);
    const type = typeOfCode(c.head), tc = rgb(G.U.TYPE_COLOR[type]), lite = tc.map(v => Math.min(255, v + 80));
    const cy = h * 0.36, bh = 70 * k + 18, skew = 40 * k, off = (1 - inn) * -w * 0.9;
    ctx.save();
    ctx.globalAlpha = al;
    ctx.textBaseline = 'alphabetic';
    // the band
    ctx.fillStyle = rgba(tc.map(v => v * 0.25), 0.88);
    ctx.beginPath(); ctx.moveTo(off - 60, cy - bh + skew); ctx.lineTo(off + w + 60, cy - bh - skew); ctx.lineTo(off + w + 60, cy + bh - skew); ctx.lineTo(off - 60, cy + bh + skew); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba(lite, 1);
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(off - 60, cy + sgn * bh + skew); ctx.lineTo(off + w + 60, cy + sgn * bh - skew); ctx.lineTo(off + w + 60, cy + sgn * (bh + 5) - skew); ctx.lineTo(off - 60, cy + sgn * (bh + 5) + skew); ctx.closePath(); ctx.fill(); }
    // speed lines
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 18; i++) {
      const h1 = (i * 0.6180339 + 0.13) % 1, h2 = (i * 0.7548776 + 0.29) % 1, yy = cy - bh * 0.8 + h1 * bh * 1.6, span = w + 300;
      const xx = (((h2 * w - c.t * (1100 + h1 * 700)) % span) + span) % span - 150;
      ctx.fillRect(xx, yy, 80 + h2 * 120, 2);
    }
    // the caster: its sprite, big, with a light outline
    portrait(ctx, c.p.dex, c.p.shiny, off + w * 0.2, cy + bh * 0.7, bh * 2.1, tc);
    // the name and the tier
    const tx = off + w * 0.34;
    const sub = SIGS[c.head] ? 'DEFINITIVO' : 'DEFINITIVO DE TIPO';
    ctx.font = `800 ${Math.round(15 * k + 5)}px Arial,Helvetica,sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(sub, tx, cy - bh * 0.32);
    const sw = ctx.measureText(sub).width;
    ctx.fillStyle = rgba(lite, 1);
    ctx.fillText(raw('★'.repeat(1 + (c.tier | 0))), tx + sw + 10, cy - bh * 0.32);
    const name = G.T(nameOf(c.head, c.tier));
    const fs = Math.max(20, Math.min(60 * k, (w - tx - 20) / Math.max(6, name.length) * 1.7));
    ctx.font = F(800, fs);
    const shine = G.U.clamp(1 - Math.abs(u - 0.5) * 3, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillText(raw(name), tx + 3, cy + bh * 0.42 + 4);
    ctx.fillStyle = rgba(tc.map(v => Math.min(255, v * 0.45 + 140 + 115 * shine)), 1); ctx.fillText(raw(name), tx, cy + bh * 0.42);
    ctx.restore();
    cutDrawn++; cutLast = { head: c.head, tier: c.tier, name, at: c.t };
  }
  /** One frame of a Pokémon's Idle sheet, facing right, feet at (x, y), height ~hh px. */
  function portrait(ctx, dex, shiny, x, y, hh, tc) {
    const Sp = G.Sprites, m = Sp.animMeta(dex, 'Idle', shiny), s = Sp.sheet(dex, 'Idle', shiny);
    if (!m || !s || !s.ready) { ctx.fillStyle = rgba(tc, 0.8); ctx.beginPath(); ctx.arc(x, y - hh * 0.4, hh * 0.3, 0, TAU); ctx.fill(); return; }
    const row = Sp.rowOf(dex, 2, m), flip = Sp.flipOf(dex, 2);
    const kk = Math.max(1, hh / Math.max(16, m.ay * 1.25));
    const dw = m.w * kk, dh = m.h * kk;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    const dx = -m.ax * kk, dy = -m.ay * kk;
    ctx.globalAlpha *= 0.9;
    const wh = Sp.white(s.img);
    for (const [ox, oy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) ctx.drawImage(wh, 0, row * m.h, m.w, m.h, dx + ox, dy + oy, dw, dh);
    ctx.globalAlpha /= 0.9;
    ctx.drawImage(s.img, 0, row * m.h, m.w, m.h, dx, dy, dw, dh);
    ctx.restore();
  }

  // ---------------- the HUD button (the Z-move's spot) ----------------
  let autoRect = null;
  /** The button with its charge ring (a viewer: the watched player's meter, no button); the AUTO chip under it. */
  function drawButton(ctx, w, h, pl) {
    if (!pl) return null;
    const local = !pl.remote && !!S && pl === G.Game.player;
    const r0 = local ? row() : pl.xw;
    if (!r0) return null;
    const r = G.ZMoves.buttonRect(w, h), cx = r.x + r.s / 2, cy = r.y + r.s / 2, R = 30;
    const frac = G.U.clamp(r0[0] / 100, 0, 1), casting = !!(r0[4] & 1), full = frac >= 0.9999 && !casting, isAuto = !!(r0[4] & 2);
    const type = typeOfCode(r0[5] || r0[2]), tc = rgb(G.U.TYPE_COLOR[type]);
    const beat = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    ctx.save();
    if (full) { ctx.fillStyle = rgba(tc, 0.25 + beat * 0.25); ctx.beginPath(); ctx.arc(cx, cy, R + 4 + beat * 4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = casting ? 'rgba(60,40,90,.9)' : 'rgba(13,18,36,.85)';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgb(70,76,92)';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = rgba(tc, 1);
    ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * (casting ? 1 : frac)); ctx.stroke();
    ctx.globalAlpha = full || casting ? 1 : 0.55;
    G.Icons.draw(ctx, 'zc:' + type, cx - 22, cy - 15 - (full ? beat * 2 : 0), 44);
    ctx.globalAlpha = 1;
    ctx.font = F(700, 11); ctx.textAlign = 'center';
    const label = casting ? '¡En uso!' : full ? '¡Listo!' : raw(Math.floor(frac * 100) + '%');
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(label, cx, r.y + r.s + 11); ctx.fillStyle = full ? '#ffd23f' : 'rgb(191,199,217)'; ctx.fillText(label, cx, r.y + r.s + 11);
    // the AUTO chip
    const ax = r.x + 4, ay = r.y + r.s + 15, aw = r.s - 8, ah = 13;
    ctx.fillStyle = isAuto ? 'rgba(40,120,70,.92)' : 'rgba(10,16,28,.85)';
    ctx.fillRect(ax, ay, aw, ah);
    ctx.strokeStyle = isAuto ? '#7dffb0' : 'rgba(140,150,170,.7)'; ctx.lineWidth = 1; ctx.strokeRect(ax + 0.5, ay + 0.5, aw - 1, ah - 1);
    ctx.font = '700 9px Arial,Helvetica,sans-serif'; ctx.fillStyle = isAuto ? '#eafff0' : '#aab4c6';
    ctx.fillText(raw('AUTO' + (local && !G.Touch.active && !(G.Pad && G.Pad.mode === 'pad') ? ' (U)' : '')), cx, ay + 10);
    if (local) {
      if (G.Pad && G.Pad.mode === 'pad') G.Pad.drawGlyph(ctx, 'zmove', r.x - 4, r.y - 4, 22);
      else if (!G.Touch.active) {
        ctx.fillStyle = 'rgba(10,16,28,.9)'; ctx.fillRect(r.x - 2, r.y - 2, 17, 17);
        ctx.strokeStyle = 'rgba(244,248,255,.7)'; ctx.lineWidth = 1; ctx.strokeRect(r.x - 1.5, r.y - 1.5, 16, 16);
        ctx.font = '700 11px Arial,Helvetica,sans-serif'; ctx.fillStyle = '#f4f8ff'; ctx.fillText(raw('Z'), r.x + 6.5, r.y + 10);
      }
    }
    ctx.restore();
    if (local) {
      G.Touch.addButton(r.x, r.y, r.s, r.s, () => { if (!tryCast(pl)) G.Audio.sfx('error'); }, 6);
      G.Touch.addButton(ax, ay, aw, ah, () => { setAuto(!auto()); G.Audio.sfx('select'); }, 4);   // (after the button: the later one wins a tap)
      autoRect = { x: ax, y: ay, w: aw, h: ah };
    }
    return r;
  }

  // ---------------- the auto setting (the Expedition save: the latest switch wins on every device) ----------------
  const AON = 'ult.auto.on', AOFF = 'ult.auto.off';
  const Sv = () => G.ExpSave;
  function auto() { const s = Sv(); return !!s && s.get(AON) > s.get(AOFF); }
  function setAuto(on) {
    const s = Sv();
    if (!s || on === auto()) return auto();
    const stamp = Math.max(s.get(AON), s.get(AOFF)) + 1;
    s.best(on ? AON : AOFF, stamp);
    s.commit();
    syncPause();
    return auto();
  }

  // ---------------- the pause screen's toggle (so a pad reaches it too) ----------------
  let mounted = false, pauseBtn = null;
  function mountUI() {
    if (mounted || typeof document === 'undefined') return;
    const box = document.querySelector('#scr-pause .box');
    if (!box) return;
    mounted = true;
    pauseBtn = document.createElement('button');
    pauseBtn.id = 'pause-xult'; pauseBtn.type = 'button'; pauseBtn.className = 'btn small ghost hidden'; pauseBtn.dataset.sfx = 'none';
    pauseBtn.onclick = () => { setAuto(!auto()); G.Audio.sfx('select'); };
    const rowEl = box.querySelector('.row');
    box.insertBefore(pauseBtn, rowEl || null);
    new MutationObserver(syncPause).observe(document.getElementById('scr-pause'), { attributes: true, attributeFilter: ['class'] });
  }
  function syncPause() {
    if (!pauseBtn) return;
    const on = !!S && G.Modes.isExp();
    pauseBtn.classList.toggle('hidden', !on);
    if (on) pauseBtn.textContent = G.T(auto() ? 'Definitivo automático: Sí' : 'Definitivo automático: No');
  }

  // ---------------- the end of the run (the Expedition save: counters, merged by max) ----------------
  function record() {
    const s = Sv();
    if (!S || !s) return [];
    if (S.casts) { s.bump('ult.casts', S.casts); s.best('ult.best', S.casts); }
    if (S.sigs) s.bump('ult.sig', S.sigs);
    if (!S.casts) return [];
    const names = [...new Set(S.names.map(n => G.T(n)))].slice(0, 3).join(', ');
    return [T.f('Definitivos: {x}', S.casts) + ' (' + names + ')'];
  }

  return {
    K, SIGS, SIG_CODES, codeFor, tierOfRow, nameOf, dmgOf, typeOfCode, typeCode, isType, makeFx, copiesOf,
    begin, reset, onKill, hurt, guard, hold, tick, press, tryCast, canCast, row, applyRow, viewTick,
    drawDim, drawCut, drawButton, auto, setAuto, record, syncPause,
    get run() { return S; }, get ghosts() { return ghosts.length; }, get vcut() { return vcut; },
    get cutDrawn() { return cutDrawn; }, get cutLast() { return cutLast; }, get autoRect() { return autoRect; },
    /** For tests: set the charge (0..1). */
    debugCharge(v) { if (S) { S.c = G.U.clamp(v, 0, 1); S.ready = S.c >= 0.9999; } }
  };
})();
