'use strict';
/* ============ expedition/reactions.js — elemental reactions and weather boosts (MicaSurvivor DLC D8, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it, and every entry point acts
 * only on an Expedition run's own player (on(pl)) in an Expedition zone. Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.3
 * (type statuses, elemental reactions, weather moves) and the D8 row. Every number is in K (README "DLC D8").
 *
 *   marks      a Water hit leaves a foe WET for 4 s; an Ice hit adds a CHILL stack (3 stacks, or 1 on a wet foe, freeze it
 *              for 1.6 s). Burn, poison, freeze, paralysis, sleep and confusion are the base game's (systems/status.js).
 *   reactions  one per hit, each with a 0.25 s cool-down per foe (study 2.3):
 *                Electrocuted   Electric on a wet foe: x1.5, and it chains to up to 12 other wet foes within 9 m (half the
 *                               hit each, paralysis 60 %)
 *                Steam          Water on a burning foe: x1.4, confuses and roots the foes within 6 m (the burn goes out)
 *                Inferno        Grass or Flying on a burning foe: the burn spreads to the foes within 7 m
 *                Wreckage       Fighting, Rock or Steel on a frozen foe: x2.6 (the ice shatters)
 *                Poison Gas     Fire on a poisoned foe: x1.3 and a cloud that poisons the foes within 6 m (ours: the study
 *                               gives none)
 *                Psychic Meltdown  Psychic on a confused or sleeping foe: x1.6 (ours)
 *                Dragon Rage    Dragon on a foe with 2+ statuses (wet and chill count): x1.8 (ours)
 *              The study's metres are halved into our tiles, as D7 did (9 m = 4.5 tiles = 144 px).
 *   weather    the base game's weather (systems/weather.js: its own type multipliers, for you and the foes) plus the study's
 *              two it lacks: Sun boosts Grass, Fog (the study's Mist) boosts Dark, x1.3 each; and a WEATHER BOOST: while
 *              the weather favours one of your Pokémon's types (or a Support Alpha's, for its own shots), all its hits
 *              do +10 % (x the weather's fade in / out).
 * All through the combat.out seam (js/systems/combat.js land: a multiplier on the hit, before it lands), so the hit's types,
 * crits, abilities and items are the base game's. A chained / spread effect's chance (paralysis) is combat: Math.random, as
 * in the base game. Counters: rx.<name> and rx.total in the Expedition save (D10's tasks can read them).
 */
G.ExpEN = Object.assign(G.ExpEN || {}, {
  '¡Electrocutado!': 'Electrocuted!', '¡Vapor!': 'Steam!', '¡Infierno!': 'Inferno!', '¡Demolición!': 'Wreckage!',
  '¡Gas venenoso!': 'Poison Gas!', '¡Colapso psíquico!': 'Psychic Meltdown!', '¡Furia dragón!': 'Dragon Rage!',
  '¡Mojado!': 'Wet!', '¡Congelado por el frío!': 'Frozen solid!',
  '{x} potencia a tu {x}: +{x} % de daño': '{x} boosts your {x}: +{x}% damage',
  'Reacciones: {x}': 'Reactions: {x}'
});
G.I18n.add(G.ExpEN);

G.ExpRx = (() => {
  const T = G.I18n;
  const F = (es, ...v) => { const en = T.lang === 'en' && G.ExpEN[es]; let i = 0; return en ? en.replace(/\{x\}/g, () => v[i++]) : T.f(es, ...v); };
  // ---------------- balance (tune here; README "DLC D8") ----------------
  const M = 16;   // px per study metre (the study's radii halved into our 32-px tiles, as D7's altars)
  const K = {
    CD: 0.25,                                  // s between two reactions of the same kind on one foe (study 2.3)
    WET_T: 4, CHILL_T: 3, CHILL_N: 3, FREEZE_T: 1.6,   // wet 4 s; 3 chill stacks (1 on a wet foe) freeze for 1.6 s (study)
    ELECTRO: { k: 1.5, n: 12, r: 9 * M, share: 0.5, para: 0.6 },
    STEAM: { k: 1.4, r: 6 * M, root: 0.85, rootT: 1.4 },
    INFERNO: { k: 1, r: 7 * M, burn: 2 },
    WRECK: { k: 2.6 },
    GAS: { k: 1.3, r: 6 * M, poison: 2 },
    MELT: { k: 1.6 },
    RAGE: { k: 1.8, n: 2 },
    WX_EXTRA: { sun: { grass: 1.3 }, fog: { dark: 1.3 } },   // the study's boosts the base weather lacks
    WX_SELF: 0.10                              // the weather boost: +10 % to every hit of a Pokémon the weather favours
  };
  const NAME = { electro: '¡Electrocutado!', steam: '¡Vapor!', inferno: '¡Infierno!', wreck: '¡Demolición!', gas: '¡Gas venenoso!',
    melt: '¡Colapso psíquico!', rage: '¡Furia dragón!' };
  const COL = { electro: '#ffe14d', steam: '#e8f4ff', inferno: '#ff7a2f', wreck: '#c8a26a', gas: '#b45cf0', melt: '#ff6fd8', rage: '#8a6bff' };
  const KINDS = Object.keys(NAME);
  const WX_NAME = { sun: 'Sol abrasador', rain: 'Lluvia', sand: 'Tormenta de arena', snow: 'Nevada', fog: 'Niebla' };

  let S = null;   // {rx: {name: n}, n, wx: the weather already announced}
  const on = pl => !!(S && G.Modes.isExp() && G.World.zone && pl && pl === G.Game.player && !pl.remote);
  function begin(pl) { S = null; if (!pl || !G.Modes.isExp()) return null; S = { rx: {}, n: 0, wx: null, log: [] }; return S; }
  function reset() { S = null; }
  const now = () => (G.Game.st ? G.Game.st.time : 0);

  // ---------------- marks ----------------
  const wet = (e, t = now()) => (e.xwet || 0) > t;
  /** How many statuses a foe has (Dragon Rage): burn, poison, freeze, paralysis, sleep, confusion, slow, wet, chill. */
  function statuses(e, t = now()) {
    return (e.burn > 0) + (e.poison > 0) + (e.frozenT > 0) + (e.paraT > 0) + (e.sleepT > 0) + (e.confT > 0) + (e.slow > 0) + wet(e, t) + ((e.xchill || 0) > 0 && (e.xchillT || 0) > t);
  }
  function chill(e, t) {
    if (wet(e, t)) return freeze(e);
    e.xchill = ((e.xchillT || 0) > t ? e.xchill || 0 : 0) + 1;
    e.xchillT = t + K.CHILL_T;
    if (e.xchill >= K.CHILL_N) return freeze(e);
    return false;
  }
  function freeze(e) {
    e.xchill = 0; e.xchillT = 0; e.xwet = 0;
    const d = G.Status.apply(e, 'freeze', K.FREEZE_T / 1.8);   // (the base freeze is 1.8 s: this one is the study's 1.6 s)
    if (d > 0) G.FX.dmgText(e.x, e.y - e.bodyH - 30, raw(F('¡Congelado por el frío!')), '#8fe3ff', true);
    return d > 0;
  }
  const raw = s => new String(s);   // eslint-disable-line no-new-wrappers

  // ---------------- weather ----------------
  /** The current weather's favoured types: the base game's (mult > 1) and the study's extras. */
  function favoured(kind) {
    const W = G.Weather.KINDS[kind];
    if (!W) return [];
    return Object.keys(W.mult).filter(t => W.mult[t] > 1).concat(Object.keys(K.WX_EXTRA[kind] || {}));
  }
  /** The weather's multiplier on a hit of type t by a Pokémon of types `who` (on top of the base G.Weather.mult). Pure but
   *  for the weather now: {k, extra, self}. */
  function wxK(t, who) {
    const cur = G.Weather.current, lv = G.Weather.level();
    if (!cur || !(lv > 0)) return { k: 1, extra: 1, self: 1 };
    const ex = K.WX_EXTRA[cur.kind] && K.WX_EXTRA[cur.kind][t] ? 1 + (K.WX_EXTRA[cur.kind][t] - 1) * lv : 1;
    const fav = favoured(cur.kind), self = (who || []).some(x => fav.includes(x)) ? 1 + K.WX_SELF * lv : 1;
    return { k: ex * self, extra: ex, self };
  }

  // ---------------- the seam ----------------
  /**
   * combat.out (js/systems/combat.js land): the hit's multiplier k on foe e from src (a move, a projectile) by player pl;
   * dmg is the hit before k. Applies the weather and at most one reaction, then leaves the hit's marks (wet, chill).
   */
  function out(k, pl, e, src, dmg) {
    if (!on(pl) || !e || e.dead || e.remote || !src) return k;
    const t = src.mtype || src.type;
    if (!t) return k;
    const tm = now();
    k *= wxK(t, src.xsa || (pl.mon && pl.mon.types)).k;
    let rx = null;
    if (t === 'electric' && wet(e, tm)) rx = 'electro';
    else if (t === 'water' && e.burn > 0) rx = 'steam';
    else if ((t === 'grass' || t === 'flying') && e.burn > 0) rx = 'inferno';
    else if ((t === 'fighting' || t === 'rock' || t === 'steel') && e.frozenT > 0) rx = 'wreck';
    else if (t === 'fire' && e.poison > 0) rx = 'gas';
    else if (t === 'psychic' && (e.confT > 0 || e.sleepT > 0)) rx = 'melt';
    else if (t === 'dragon' && statuses(e, tm) >= K.RAGE.n) rx = 'rage';
    if (rx) {
      const cd = e.xrxT || (e.xrxT = {});
      if (!(cd[rx] > tm)) { cd[rx] = tm + K.CD; k *= react(rx, e, dmg * k, tm); }
    }
    if (t === 'water' && rx !== 'steam') e.xwet = tm + K.WET_T;
    if (t === 'ice') chill(e, tm);
    return k;
  }
  /** Reaction `rx` on foe e (the hit d before the reaction's own multiplier). -> that multiplier */
  function react(rx, e, d, tm) {
    const near = (r, self) => G.EnemyMgr.queryCircle(e.x, e.y, r).filter(o => !o.dead && !o.remote && (self || o !== e) && Math.hypot(o.x - e.x, o.y - e.y) <= r);
    let k = 1;
    if (rx === 'electro') {
      const P = K.ELECTRO;
      k = P.k;
      e.xwet = 0;
      const others = near(P.r).filter(o => wet(o, tm)).sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y)).slice(0, P.n);
      for (const o of others) {
        o.xwet = 0;
        G.FX.spark(o.x, o.y - o.bodyH * 0.5, COL.electro, e.x - o.x, e.y - o.y, 4);
        G.DmgLog.as('status', () => o.hurt(d * k * P.share, COL.electro));
        if (!o.dead && Math.random() < P.para) G.Status.apply(o, 'para');
      }
      lastChain = others.length;
    } else if (rx === 'steam') {
      const P = K.STEAM;
      k = P.k; e.burn = 0; e.burnT = 0;
      for (const o of near(P.r, true)) { G.Status.apply(o, 'conf'); o.applySlow(P.root, P.rootT); }
    } else if (rx === 'inferno') {
      const P = K.INFERNO;
      k = P.k;
      for (const o of near(P.r)) o.applyBurn(P.burn);
    } else if (rx === 'wreck') {
      k = K.WRECK.k; e.frozenT = Math.min(e.frozenT, 0.01);
    } else if (rx === 'gas') {
      const P = K.GAS;
      k = P.k;
      for (const o of near(P.r)) o.applyPoison(P.poison);
    } else if (rx === 'melt') k = K.MELT.k;
    else if (rx === 'rage') k = K.RAGE.k;
    const R = (K[{ electro: 'ELECTRO', steam: 'STEAM', inferno: 'INFERNO', gas: 'GAS' }[rx]] || {}).r || 40;
    G.FX.dmgText(e.x, e.y - e.bodyH - 22, raw(F(NAME[rx])), COL[rx], true);
    G.FX.ring(e.x, e.y, 6, R, COL[rx], 0.42, 4);
    if (S) { S.rx[rx] = (S.rx[rx] || 0) + 1; S.n++; S.log.push(rx); if (S.log.length > 40) S.log.shift(); }
    return k;
  }
  let lastChain = 0;

  /** run.tick: the weather boost's banner (once per weather, when it favours your Pokémon). */
  function tick(dt, pl) {
    if (!on(pl)) return;
    const cur = G.Weather.current;
    if (!cur) { S.wx = null; return; }
    if (S.wx === cur.kind) return;
    const fav = favoured(cur.kind), mine = (pl.mon.types || []).filter(x => fav.includes(x));
    if (!mine.length) return;
    S.wx = cur.kind;
    G.Spawner.say(F('{x} potencia a tu {x}: +{x} % de daño', T.t(WX_NAME[cur.kind] || cur.name), pl.mon.name, Math.round(K.WX_SELF * 100)), 3, true);
  }

  // ---------------- drawing: wet drops and chill pips on the foes on screen (in code) ----------------
  function drawGround(ctx) {
    const tm = now(), cam = G.Camera;
    for (const e of G.EnemyMgr.all()) {
      if (e.dead || !cam.sees(e.x, e.y, 40)) continue;
      const w = wet(e, tm), ch = (e.xchillT || 0) > tm ? e.xchill | 0 : 0;
      if (!w && !ch) continue;
      ctx.save();
      if (w) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#4fa3ff'; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.2, e.r * 0.55, 0, 0, 6.2832); ctx.fill(); }
      ctx.globalAlpha = 0.9;
      for (let i = 0; i < ch; i++) { ctx.fillStyle = '#bff2ff'; ctx.fillRect(Math.round(e.x - 7 + i * 6), Math.round(e.y - e.bodyH - 8), 4, 4); }
      ctx.restore();
    }
  }

  /** The run into the Expedition save (counters, max-merged) and a line for the run-over screen. */
  function record() {
    const Sv = G.ExpSave;
    if (!S || !Sv) return [];
    for (const k of KINDS) if (S.rx[k]) Sv.bump('rx.' + k, S.rx[k]);
    if (S.n) Sv.bump('rx.total', S.n);
    return S.n ? [F('Reacciones: {x}', S.n)] : [];
  }

  return { K, KINDS, NAME, COL, begin, reset, out, react, wet, statuses, chill, favoured, wxK, tick, drawGround, record,
    get run() { return S; }, get lastChain() { return lastChain; } };
})();
