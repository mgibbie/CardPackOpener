'use strict';
/* ============ expedition/economy.js — ₽, Poké Balls, Meowth, altars and the other interactables (MicaSurvivor DLC D7) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it, and every entry point acts
 * only in an Expedition run on its own player, or draws an Expedition zone (G.World.zone, which base modes never have).
 * Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.7 (interactables, the economy), 2.15 (tips, the big map) and the D7 row.
 * Every number is in K (README "DLC D7").
 *
 *   ₽          the run's in-play currency: the player's run coins (pl.coins), which an Expedition run never pays into the
 *              base save. 0.2 a KO x the gold stat (Nugget, Amulet Coin) x greed; elites 1, alphas / totems 5, bosses 20 x
 *              zone; gold rocks 6-14 x zone; a level-up Skip 10 x zone. Never real money: nothing here is bought.
 *   balls      paid (18 x 1.22^(0.65 x bought) ₽, luck takes up to 25 % off): pick 1 of 3 items; free: 1 item; cursed: free,
 *              +5 % difficulty, a ghost ambush of 4 + 2 x zone, 1 item and a second at 40 % x (1 + luck / 100); the Great
 *              Ball (a cleared challenge altar): pick 1 of 3, Uncommon or better. Stand on one to open it.
 *   Meowth     visits each zone (at ~0:50, then every 2:30, for 70 s, at one of 3 stalls) with 3 items for ₽. Market heat:
 *              2 + ⌊balls opened / 3⌋ buys are at list price; each buy past that multiplies prices by x1.15, x1.32 ... x2.
 *   Unown      altars in 4 tiers (charge 8 / 14 / 22 / 35 s, radius 3 / 2.75 / 2.5 / 2.25 tiles; leaving drains at half
 *              speed): pick 1 of 3 (Common+), 1 of 3 (Uncommon+), 1 of 4 (Rare+), 2 of 4 (Epic+). Epic and Golden call a
 *              horde every 7 s while charging; Golden is sealed for the zone's first 90 s.
 *   comet      appears once a zone (2:30-5:00), a 10 s charge; it burns out 45 s after it lands if it isn't finished.
 *              Pick 1 of 3 (Uncommon+) and +25 % Ultimate charge.
 *   altars     challenge (a wave of 10 + 4 x zone, x1.5 HP: clear it for a Great Ball), cursed (a Rare+ item for +8 %
 *              difficulty and +15 % spawns), Gengar's greed (+10 % difficulty, +15 % XP, +25 % ₽, one more card per ball).
 *   others     Ditto copies one of your items (never a capped one), Hypno makes you forget a vitamin (its slot is free
 *              again), gold rocks (₽), berry bushes (heal 50 %), cages (20 + 10 x zone ₽: +50 % of a level's XP).
 *   map / fog  the zone map (M, a tap on the minimap, the pause screen's button) with a legend; the minimap and the map
 *              only show what you have found: tiles within 14 of you are explored (the fog of war), an interactable shows
 *              once its tile is.
 *   tips       a one-time tip the first time you meet each kind (the Expedition save: tip.<kind>, merged by max).
 *
 * Where everything is comes from the zone's own grids and the world seed (layoutOf, pure), so a co-op guest, a replay and a
 * spectator place the same interactables. What only the host knows (used, charge, Meowth's stock, heat, the curses) is the
 * `x` block v7 `o` (oBlock / applyO, js/expedition/core.js). Every roll (the items offered, Meowth's stock, a rock's ₽,
 * Ditto's pick, a wave's Pokémon) comes from a G.DLC.rng stream (the seed, the zone, the interactable, a draw count), never
 * Math.random.
 */
G.ExpEN = Object.assign(G.ExpEN || {}, {
  'Poké Ball': 'Poké Ball', 'Poké Ball gratis': 'Free Poké Ball', 'Poké Ball maldita': 'Cursed Poké Ball', 'Super Ball': 'Great Ball',
  'Tienda de Meowth': "Meowth's shop", 'Altar Unown': 'Unown altar', 'Altar Unown raro': 'Rare Unown altar', 'Altar Unown épico': 'Epic Unown altar',
  'Altar Unown dorado': 'Golden Unown altar', 'Fragmento de cometa': 'Comet shard', 'Altar de desafío': 'Challenge altar',
  'Altar maldito': 'Cursed altar', 'Altar de Gengar': "Gengar's greed altar", 'Ditto': 'Ditto', 'Hypno': 'Hypno',
  'Roca dorada': 'Gold rock', 'Bayas': 'Berry bush', 'Jaula': 'Cage', 'Tú': 'You', 'Altar del guardián': "Guardian's altar", 'Portal': 'Portal',
  'Mapa de la zona': 'Zone map', 'Cerrar · M': 'Close · M', 'Explorado: {x} %': 'Explored: {x}%', 'Leyenda': 'Legend', 'Usado': 'used',
  'Elige un objeto': 'Pick an item', 'Elige {x} objetos': 'Pick {x} items', 'Elige 1 de {x}': 'Pick 1 of {x}', 'Elige 2 de {x}': 'Pick 2 of {x}',
  'Bendición Unown': 'Unown blessing', '¡Bendición dorada!': 'Golden blessing!', 'Cometa': 'Comet',
  'Meowth: «¡Miau! ¿Qué te llevas?»': 'Meowth: "Meowth! What\'ll it be?"', 'Tienes {x} ₽': 'You have {x} ₽', 'Calor del mercado ×{x}': 'Market heat ×{x}',
  'Irse': 'Leave', 'Vendido': 'Sold', 'Comprar · {x} ₽': 'Buy · {x} ₽', 'Te faltan {x} ₽': 'You need {x} ₽ more',
  'Hypno: «Mira el péndulo...»': 'Hypno: "Watch the pendulum..."', 'Olvidar {x}': 'Forget {x}', 'Quedármelas': 'Keep them',
  'Libera su hueco (nivel {x}).': 'Frees its slot (level {x}).', 'Olvidas {x}': 'You forget {x}', 'No tienes vitaminas que olvidar': 'You have no vitamins to forget',
  'Ditto copia {x}': 'Ditto copies {x}', 'Ditto no tiene nada que copiar': 'Ditto has nothing to copy',
  '+{x} ₽': '+{x} ₽', '¡Liberas a {x}! +{x} de experiencia': 'You free {x}! +{x} XP', '¡Bayas! +{x} de vida': 'Berries! +{x} HP',
  '¡Emboscada fantasma!': 'Ghost ambush!', '¡La Poké Ball estaba maldita! +5 % de dificultad': 'The Poké Ball was cursed! +5% difficulty',
  '¡Desafío! Derrota la oleada': 'Challenge! Defeat the wave', '¡Desafío superado! Una Super Ball': 'Challenge cleared! A Great Ball',
  '¡Maldición! Más enemigos y más dificultad': 'Cursed! More foes and more difficulty', '¡Codicia de Gengar! Más dificultad, más botín': "Gengar's greed! More difficulty, more loot",
  '¡Un fragmento de cometa ha caído!': 'A comet shard has landed!', 'El fragmento de cometa se apaga': 'The comet shard burns out',
  '¡Meowth ha abierto su tienda!': 'Meowth has opened his shop!', 'Meowth recoge su tienda': 'Meowth packs up his shop',
  '¡Horda!': 'Horde!', 'SELLADO {x}': 'SEALED {x}', 'TIENDA': 'SHOP', 'Definitivo +25 %': 'Ultimate +25%',
  '₽ {x} · Poké Balls {x} · Altares {x}': '₽ {x} · Poké Balls {x} · Altars {x}',
  // the tips (once each)
  'Consejo': 'Tip',
  '₽ (Pokédólares): los ganas derrotando Pokémon y rompiendo rocas doradas. Gástalos en Poké Balls, en la tienda de Meowth y en las jaulas.':
    "₽ (PokéDollars): you earn them from KOs and gold rocks. Spend them on Poké Balls, Meowth's shop and cages.",
  'Poké Ball: quédate encima para abrirla. Cuesta ₽, cada vez más, y eliges 1 de 3 objetos.': 'Poké Ball: stand on it to open it. It costs ₽ (more each time) and you pick 1 of 3 items.',
  'Poké Ball gratis: ábrela y llévate un objeto.': 'Free Poké Ball: open it for an item.',
  'Poké Ball maldita: gratis, pero sube la dificultad y salen fantasmas. Puede dar 2 objetos.': 'Cursed Poké Ball: free, but it raises the difficulty and ghosts come out. It can give 2 items.',
  'Meowth vende objetos por ₽ un rato. Si compras mucho sin abrir Poké Balls, sube los precios.': "Meowth sells items for ₽ for a while. Buy a lot without opening Poké Balls and his prices go up.",
  'Altar Unown: quédate en el círculo para cargarlo (si sales, se vacía). Lleno, eliges una bendición.': 'Unown altar: stand in the circle to charge it (leaving drains it). Full, you pick a blessing.',
  'Altar dorado: sellado los primeros 90 s; mientras lo cargas llegan hordas. Eliges 2 de 4.': 'Golden altar: sealed for the first 90 s; hordes come while you charge it. You pick 2 of 4.',
  'Fragmento de cometa: cárgalo 10 s antes de que se apague.': 'Comet shard: charge it for 10 s before it burns out.',
  'Altar de desafío: invoca una oleada; derrótala y gana una Super Ball.': 'Challenge altar: it calls a wave; beat it to win a Great Ball.',
  'Altar maldito: un objeto raro a cambio de más enemigos y más dificultad.': 'Cursed altar: a rare item, for more foes and more difficulty.',
  'Altar de Gengar: más dificultad, más experiencia y más botín.': "Gengar's altar: more difficulty, more XP and more loot.",
  'Ditto copia uno de tus objetos (nunca uno al máximo).': 'Ditto copies one of your items (never a maxed one).',
  'Hypno te hace olvidar una vitamina para liberar su hueco.': 'Hypno makes you forget a vitamin, to free its slot.',
  'Roca dorada: tócala para romperla y ganar ₽.': 'Gold rock: touch it to smash it for ₽.',
  'Arbusto de bayas: cura la mitad de tu vida.': 'Berry bush: heals half your HP.',
  'Jaula: paga ₽ para liberar al Pokémon y ganar experiencia.': 'Cage: pay ₽ to free the Pokémon and gain XP.',
  'Pulsa M (o toca el minimapa) para ver el mapa de la zona.': 'Press M (or tap the minimap) for the zone map.'
});
G.I18n.add(G.ExpEN);

G.ExpEco = (() => {
  const T = G.I18n;
  const F = (es, ...v) => { const en = T.lang === 'en' && G.ExpEN[es]; let i = 0; return en ? en.replace(/\{x\}/g, () => v[i++]) : T.f(es, ...v); };
  const IT = () => G.ExpItems, LV = () => G.ExpLevel, C = () => G.ExpClassic;
  // ---------------- balance (tune here; README "DLC D7") ----------------
  const K = {
    KO: 0.2, KO_ELITE: 1, KO_ALPHA: 5, KO_BOSS: 20,      // ₽ a kill (study 2.7: 0.2 x gold); the specials' are ours (a boss x zone)
    ROCK: [6, 14],                                         // a gold rock: 6-14 x zone (study 2.7)
    BALL: 18, BALL_GROW: 1.22, BALL_EXP: 0.65,             // a paid ball: 18 x 1.22^(0.65 x bought) (study 2.7)
    LUCK_OFF: 400, LUCK_OFF_MAX: 0.25,                     // luck / 400 off a ball, at most 25 %
    OFFERS: 3,                                             // a ball's pick (study 0.7.0: 1 of 3)
    CURSE_BALL: 0.05, GHOSTS: [4, 2], CURSE_2ND: 0.4,      // a cursed ball: +5 % difficulty, 4 + 2 x zone ghosts, a 2nd item at 40 % x (1 + luck)
    GHOST_DEX: [92, 93, 200, 355, 425, 562],
    MEOWTH_FIRST: 50, MEOWTH_EVERY: 150, MEOWTH_JIT: 20, MEOWTH_STAY: 70, STOCK: 3,
    PRICE: [30, 55, 95, 160, 260], PRICE_ZONE: 0.3,        // Meowth's list price by rarity, +30 % a zone
    FREE_BUYS: 2, BALLS_PER_BUY: 3, HEAT0: 1.15, HEAT_STEP: 0.17, HEAT_MAX: 2,   // market heat (study 2.7: x1.15-2 per buy past 2 + ⌊balls / 3⌋)
    UNOWN_T: [8, 14, 22, 35], UNOWN_R: [3, 2.75, 2.5, 2.25],   // charge seconds and radius (tiles) by tier (study 2.7: 6-4.5 m, halved)
    UNOWN_OFFERS: [[3, 1, 0], [3, 1, 1], [4, 1, 2], [4, 2, 3]],   // [cards, picks, the lowest rarity]
    DRAIN: 0.5, SEAL: 90, HORDE_EVERY: 7, HORDE: [6, 2, 4],   // leaving drains at half speed; Golden sealed 90 s; hordes of 6 + 2 x zone (+4 Golden)
    COMET_AT: [150, 300], COMET_LIFE: 45, COMET_T: 10, COMET_R: 2.5, COMET_ULT: 0.25,
    CHAL_T: 2, CHAL_N: [10, 4], CHAL_HP: 1.5,              // the challenge: stand 2 s; a wave of 10 + 4 x zone at x1.5 HP
    ALTAR_T: 1.6, CURSE_ALTAR: { diff: 0.08, rate: 0.15 }, GREED: { diff: 0.10, xp: 0.15, money: 0.25, loot: 1 },
    OPEN_T: 0.45, MEET_T: 0.8,                             // stand this long to open a ball / meet Ditto, Hypno, a cage
    CAGE: [20, 10], CAGE_XP: 0.5,                          // 20 + 10 x zone ₽; +50 % of a level's XP (study 2.7)
    BERRY: 0.5,
    SIGHT: 14, RADAR: 9,                                   // the fog: tiles within 14 are explored; an interactable within 9 shows anyway
    TIP_T: 6.5
  };
  // what each zone holds (zones 1-3; the shrine has none), placed in this order (the big ones first)
  const PLACE = [['unown4', 1], ['unown3', 1], ['unown2', 1], ['unown1', 2], ['challenge', 1], ['cursedaltar', 1], ['greed', 1],
    ['comet', 1], ['meowth', 3], ['ball', 6], ['freeball', 2], ['cursedball', 2], ['ditto', 1], ['hypno', 1], ['cage', 2], ['rock', 8], ['berry', 8]];
  const SMALL = new Set(['rock', 'berry']);
  const KINDS = PLACE.map(p => p[0]);
  const NAME = { ball: 'Poké Ball', freeball: 'Poké Ball gratis', cursedball: 'Poké Ball maldita', great: 'Super Ball', meowth: 'Tienda de Meowth',
    unown1: 'Altar Unown', unown2: 'Altar Unown raro', unown3: 'Altar Unown épico', unown4: 'Altar Unown dorado', comet: 'Fragmento de cometa',
    challenge: 'Altar de desafío', cursedaltar: 'Altar maldito', greed: 'Altar de Gengar', ditto: 'Ditto', hypno: 'Hypno', rock: 'Roca dorada',
    berry: 'Bayas', cage: 'Jaula' };
  const TIP = {
    money: '₽ (Pokédólares): los ganas derrotando Pokémon y rompiendo rocas doradas. Gástalos en Poké Balls, en la tienda de Meowth y en las jaulas.',
    ball: 'Poké Ball: quédate encima para abrirla. Cuesta ₽, cada vez más, y eliges 1 de 3 objetos.',
    freeball: 'Poké Ball gratis: ábrela y llévate un objeto.',
    cursedball: 'Poké Ball maldita: gratis, pero sube la dificultad y salen fantasmas. Puede dar 2 objetos.',
    meowth: 'Meowth vende objetos por ₽ un rato. Si compras mucho sin abrir Poké Balls, sube los precios.',
    unown1: 'Altar Unown: quédate en el círculo para cargarlo (si sales, se vacía). Lleno, eliges una bendición.',
    unown4: 'Altar dorado: sellado los primeros 90 s; mientras lo cargas llegan hordas. Eliges 2 de 4.',
    comet: 'Fragmento de cometa: cárgalo 10 s antes de que se apague.',
    challenge: 'Altar de desafío: invoca una oleada; derrótala y gana una Super Ball.',
    cursedaltar: 'Altar maldito: un objeto raro a cambio de más enemigos y más dificultad.',
    greed: 'Altar de Gengar: más dificultad, más experiencia y más botín.',
    ditto: 'Ditto copia uno de tus objetos (nunca uno al máximo).',
    hypno: 'Hypno te hace olvidar una vitamina para liberar su hueco.',
    rock: 'Roca dorada: tócala para romperla y ganar ₽.',
    berry: 'Arbusto de bayas: cura la mitad de tu vida.',
    cage: 'Jaula: paga ₽ para liberar al Pokémon y ganar experiencia.',
    map: 'Pulsa M (o toca el minimapa) para ver el mapa de la zona.'
  };
  const TIP_OF = { unown2: 'unown1', unown3: 'unown1' };   // (the rare / epic altars share the Unown tip; the golden one has its own)
  const COL = { ball: '#ff4d5e', freeball: '#eef3ff', cursedball: '#a35cff', great: '#4f9cf0', meowth: '#ffd23f', unown1: '#b9c4d4', unown2: '#5fd07a',
    unown3: '#b46cf2', unown4: '#ffb020', comet: '#7fe9ff', challenge: '#ff7b3d', cursedaltar: '#7c3fb0', greed: '#d05cff', ditto: '#f0a8e8',
    hypno: '#f6d860', rock: '#e8b93a', berry: '#3f8cff', cage: '#9aa3b2' };
  // the states an interactable can be in (the `o` block sends every one that isn't FRESH)
  const FRESH = 0, USED = 1, ACTIVE = 2, GONE = 3, READY = 4;

  // ---------------- seeded helpers ----------------
  function mix(...vals) {
    let h = 0x7F4A7C15 | 0;
    for (const v of vals) { h ^= v | 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16; }
    return h >>> 0;
  }
  const R = s => G.DLC.rng(s);
  const mapIdx = m => ['viridian', 'mtmoon', 'cerulean'].indexOf(m) + 1;
  const TS = () => G.World.TS;
  const zkey = z => z ? [z.seed | 0, z.map, z.zone | 0, z.hash].join(':') : '';

  // ---------------- the layout (pure: the zone's grids + the seed) ----------------
  function flat3(z, tx, ty) {
    const h = z.height(tx, ty);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, y = ty + dy;
      if (!z.inside(x, y) || z.terr(x, y) !== 0 || z.height(x, y) !== h || z.rampDir(x, y) || z.propAt(x, y) || z.padAt(x, y)) return false;
    }
    return true;
  }
  /**
   * The zone's interactables: [{i, kind, tx, ty, x, y, v}] (v: a rock's ₽ factor, a cage's Pokémon), or null outside zones 1-3
   * of a known map. The same for every viewer (the zone's grids and the seed only). Cached on the zone.
   */
  function layoutOf(z) {
    const Cl = C();
    if (!z || !z.map || !(z.zone >= 1 && z.zone <= 3) || !Cl || !Cl.MAPS[z.map]) return null;
    if (z.xeco && z.xeco.h === z.hash) return z.xeco.v;
    const si = Cl.sitesOf(z), alt = si ? si.altar : [0, -12];
    const rng = R(mix(z.seed | 0, mapIdx(z.map), z.zone | 0, 0xEC07));
    const cand = [];
    for (let y = 2; y < z.h - 2; y += 2) for (let x = 2; x < z.w - 2; x += 2) {
      const tx = x + z.x0, ty = y + z.y0;
      if (Math.hypot(tx, ty) < 9 || Math.hypot(tx - alt[0], ty - alt[1]) < 7) continue;
      if (flat3(z, tx, ty)) cand.push([tx, ty]);
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    const objs = [], res = Cl.poolOf(z.map, z.zone).res;
    for (const [kind, n] of PLACE) {
      const small = SMALL.has(kind);
      let placed = 0;
      for (let ci = 0; ci < cand.length && placed < n; ci++) {
        const c = cand[ci];
        if (!c) continue;
        if (objs.some(o => Math.hypot(o.tx - c[0], o.ty - c[1]) < (small || SMALL.has(o.kind) ? 4 : 8))) continue;
        cand[ci] = null; placed++;
        const o = { i: objs.length, kind, tx: c[0], ty: c[1], x: (c[0] + 0.5) * TS(), y: (c[1] + 0.5) * TS(), v: 0 };
        if (kind === 'rock') o.v = K.ROCK[0] + Math.floor(rng() * (K.ROCK[1] - K.ROCK[0] + 1));
        else if (kind === 'cage') o.v = res.length ? res[Math.floor(rng() * res.length) % res.length] : 16;
        objs.push(o);
      }
    }
    // Meowth's visits and the comet's landing (zone seconds)
    const visits = [];
    const nSp = objs.filter(o => o.kind === 'meowth').map(o => o.i);
    for (let v = 0, at = K.MEOWTH_FIRST; at < C().K.FINAL + 120 && nSp.length; v++, at += K.MEOWTH_EVERY) {
      const a = at + Math.floor(rng() * (K.MEOWTH_JIT + 1));
      visits.push({ v, at: a, until: a + K.MEOWTH_STAY, spot: nSp[v % nSp.length] });
    }
    const cometAt = K.COMET_AT[0] + Math.floor(rng() * (K.COMET_AT[1] - K.COMET_AT[0] + 1));
    const v = { objs, visits, cometAt, key: zkey(z) };
    z.xeco = { h: z.hash, v };
    return v;
  }
  const visitAt = (lay, zt) => (lay ? lay.visits.find(w => zt >= w.at && zt < w.until) || null : null);

  // ---------------- the pure economy (README "DLC D7": the tables are these) ----------------
  /** A paid ball's price after `bought` balls, with `luck`. */
  const ballCost = (bought, luck = 0) => Math.round(K.BALL * Math.pow(K.BALL_GROW, K.BALL_EXP * bought) * (1 - Math.min(K.LUCK_OFF_MAX, Math.max(0, luck) / K.LUCK_OFF)));
  /** The buys at list price: 2 + ⌊balls opened / 3⌋ (opening balls cools the market). */
  const allowance = opened => K.FREE_BUYS + Math.floor(opened / K.BALLS_PER_BUY);
  const heatOf = (bought, opened) => Math.max(0, bought - allowance(opened));
  /** The heat multiplier: x1.15, then each buy past the allowance x0.17 more, up to x2 a step. */
  function heatMul(h) { let m = 1; for (let i = 1; i <= h; i++) m *= Math.min(K.HEAT_MAX, K.HEAT0 + K.HEAT_STEP * (i - 1)); return m; }
  const price = (rar, zone, heat) => Math.round(K.PRICE[rar] * (1 + K.PRICE_ZONE * (Math.max(1, zone) - 1)) * heatMul(heat));
  const cageCost = zone => K.CAGE[0] + K.CAGE[1] * Math.max(1, zone);
  const zoneNow = () => { const r = C() && C().run; return r ? Math.min(3, r.zone || 1) : (G.World.zone && G.World.zone.zone) || 1; };

  /** n different items for player pl from rng, none below rarity `min` (it steps down a rarity, then up, when one is empty). */
  function rollOffers(pl, rng, n, min = 0) {
    const I = IT(), L = LV(), out = [];
    for (let k = 0; k < n; k++) {
      const ti = Math.max(min, L.rollRarity(rng, { level: pl ? pl.level : 1, luck: pl ? pl.xluck || 0 : 0, zone: zoneNow() }));
      const order = [ti];
      for (let d = 1; d < 5; d++) { if (ti - d >= min) order.push(ti - d); if (ti + d <= 4) order.push(ti + d); }
      for (const t of order) {
        const pool = I.ITEMS.filter(it => it.rar === t && (!pl || I.room(pl, it.id)) && !out.includes(it.id));
        if (pool.length) { out.push(pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id); break; }
      }
    }
    return out;
  }

  // ---------------- the run (host) ----------------
  let S = null;        // {frac, earned, spent, balls, opened, buys, mods, used, last, draws, waves, z: the zone's state, log}
  let view = null;     // a viewer's / guest's copy of the `o` block
  const on = pl => !!(S && G.Modes.isExp() && pl && pl === G.Game.player && !pl.remote);

  function begin(pl) {
    S = null; view = null; closePick(true); closeMap();
    if (!pl || !G.Modes.isExp()) return null;
    S = { frac: 0, earned: 0, spent: 0, balls: 0, opened: 0, buys: 0, mods: { diff: 0, rate: 0, xp: 0, money: 0, loot: 0 }, used: 0, last: 0,
          draws: 0, waves: 0, z: null, log: { balls: 0, shop: 0, altars: 0, freed: 0, rocks: 0, berries: 0, ditto: 0, hypno: 0 }, tipQ: [], tipLog: [], hordes: [] };
    mountUI();
    return S;
  }
  function reset() { S = null; view = null; closePick(true); closeMap(); hideTip(); syncPause(); }
  /** The run's difficulty / spawn / XP / ₽ modifiers (classic.js reads them for every new foe). */
  const NOMODS = { diff: 0, rate: 0, xp: 0, money: 0, loot: 0 };
  const mods = () => (S && G.Modes.isExp() ? S.mods : NOMODS);
  const goldK = pl => Math.max(0, 1 + (IT() && pl ? IT().total(pl, 'coin') : 0)) * (1 + mods().money);

  /** ₽ into the run (the player's run coins): n whole ₽ (kills keep their fraction). */
  function earn(n, src) {
    const pl = G.Game.player;
    if (!S || !pl || !(n > 0)) return 0;
    S.frac += n;
    const whole = Math.floor(S.frac + 1e-9);
    S.frac -= whole;
    pl.coins = (pl.coins || 0) + whole;
    S.earned += whole;
    if (whole > 0) tipOnce('money');
    return whole;
  }
  function spend(n) {
    const pl = G.Game.player;
    if (!S || !pl || (pl.coins || 0) < n) return false;
    pl.coins -= n; S.spent += n;
    return true;
  }
  /** enemy.ko (the host / solo sim): ₽ for the kill. */
  function onKill(e, pl) {
    if (!S || !e) return;
    const p = G.Game.player;
    let v = K.KO;
    if (e.boss || e.xk === 'guardian' || e.xk === 'legend') v = K.KO_BOSS * zoneNow();
    else if (e.xk === 'alpha' || e.xk === 'totem') v = K.KO_ALPHA;
    else if (e.xk === 'elite' || e.xk === 'summoner') v = K.KO_ELITE;
    earn(v * goldK(p), 'ko');
  }

  // ---------------- the zone's state ----------------
  function zoneState(lay) {
    const n = lay.objs.length;
    return { key: lay.key, lay, st: new Array(n).fill(FRESH), ch: new Array(n).fill(0), t: new Array(n).fill(0), latch: new Set(), wave: new Map(),
             visit: -1, stock: null, sold: 0, spot: -1 };
  }
  const zoneTime = () => { const r = C() && C().run, st = G.Game.st; return r && st ? st.time - r.zs : st ? st.time : 0; };
  const rngFor = (i, salt) => R(mix(G.World.seed | 0, mapIdx(G.World.zone.map), G.World.zone.zone | 0, i, salt, S.draws++));
  function markUsed(Z, o, st = USED) { Z.st[o.i] = st; if (st === USED) { S.used++; S.last = o.i; } }
  const say = (t, s = 2.8) => G.Spawner.say(t, s, true);

  /** run.tick: the interactables round the player. */
  function tick(dt, pl) {
    if (!S || !on(pl)) return;
    const z = G.World.zone, lay = layoutOf(z);
    if (!lay) { S.z = null; return; }
    if (!S.z || S.z.key !== lay.key) { S.z = zoneState(lay); preload(); }
    reveal(pl);
    const Z = S.z, zt = zoneTime(), tsz = TS();
    // Meowth comes and goes
    const vis = visitAt(lay, zt);
    if (vis && (Z.visit !== vis.v || Z.spot < 0)) {   // (a new visit; or, after a jump of the zone clock, the same one again)
      Z.visit = vis.v; Z.spot = vis.spot; Z.sold = 0;
      Z.stock = rollOffers(pl, R(mix(G.World.seed | 0, mapIdx(z.map), z.zone | 0, 0x3E0, vis.v)), K.STOCK, 0);
      say(F('¡Meowth ha abierto su tienda!'), 2.6);
    } else if (!vis && Z.visit >= 0 && Z.spot >= 0) {
      if (pickOpen() && pick.kind === 'shop') closePick();
      Z.spot = -1; Z.stock = null;
      say(F('Meowth recoge su tienda'), 2.2);
    }
    for (const o of lay.objs) {
      const st = Z.st[o.i];
      if (st === USED || st === GONE) continue;
      const d = Math.hypot(pl.x - o.x, pl.y - o.y);
      if (Z.latch.has(o.i) && d > 3.2 * tsz + (pl.r || 0)) Z.latch.delete(o.i);
      if (d < 7 * tsz && (o.kind !== 'meowth' || Z.spot === o.i) && (o.kind !== 'comet' || st === READY || st === ACTIVE)) tipOnce(TIP_OF[o.kind] || o.kind);
      if (pl.dead) continue;
      step(o, Z, st, d, dt, pl, zt);
      if (pickOpen()) break;   // (a choice opened: the world holds)
    }
    tickTips(dt);
  }
  /** One interactable's step (the host). */
  function step(o, Z, st, d, dt, pl, zt) {
    const tsz = TS(), pr = pl.r || 14;
    const stand = (r, need) => {
      if (d < r) { Z.t[o.i] += dt; return Z.t[o.i] >= need; }
      Z.t[o.i] = Math.max(0, Z.t[o.i] - dt * 2);
      return false;
    };
    switch (o.kind) {
      case 'ball': case 'freeball': case 'cursedball': {
        if (Z.latch.has(o.i) || !stand(1.15 * tsz + pr, K.OPEN_T)) return;
        openBall(o, Z, pl);
        return;
      }
      case 'meowth': {
        if (Z.spot !== o.i || Z.latch.has(o.i) || d > 1.7 * tsz + pr) return;
        Z.latch.add(o.i);
        openShop(o, Z, pl);
        return;
      }
      case 'unown1': case 'unown2': case 'unown3': case 'unown4': case 'comet': {
        const comet = o.kind === 'comet', tier = comet ? 0 : +o.kind[5] - 1;
        if (comet) {
          if (st === FRESH) { if (zt >= Z.lay.cometAt) { Z.st[o.i] = READY; say(F('¡Un fragmento de cometa ha caído!'), 2.6); G.FX.ring(o.x, o.y, 8, 160, COL.comet, 0.7, 5); } return; }
          if (zt >= Z.lay.cometAt + K.COMET_LIFE && d >= K.COMET_R * tsz + pr) { Z.st[o.i] = GONE; Z.ch[o.i] = 0; say(F('El fragmento de cometa se apaga'), 2.2); return; }
        } else if (tier === 3 && zt < K.SEAL) return;   // (the golden altar is sealed)
        const Tt = comet ? K.COMET_T : K.UNOWN_T[tier], r = (comet ? K.COMET_R : K.UNOWN_R[tier]) * tsz + pr * 0.5;
        const inside = d < r;
        Z.ch[o.i] = G.U.clamp(Z.ch[o.i] + (inside ? dt / Tt : -dt / Tt * K.DRAIN), 0, 1);
        if (!comet) Z.st[o.i] = Z.ch[o.i] > 0 ? ACTIVE : FRESH;
        else Z.st[o.i] = Z.ch[o.i] > 0 ? ACTIVE : READY;
        if (inside && !comet && tier >= 2 && Z.ch[o.i] < 1) {
          Z.t[o.i] -= dt;
          if (Z.t[o.i] <= 0) { Z.t[o.i] = K.HORDE_EVERY; horde(o, K.HORDE[0] + K.HORDE[1] * zoneNow() + (tier === 3 ? K.HORDE[2] : 0)); }
        }
        if (Z.ch[o.i] >= 1) blessing(o, Z, pl, comet ? null : tier);
        return;
      }
      case 'challenge': {
        if (st === FRESH) {
          if (!stand(1.6 * tsz + pr, K.CHAL_T)) return;
          Z.st[o.i] = ACTIVE; Z.t[o.i] = 0;
          const ids = horde(o, K.CHAL_N[0] + K.CHAL_N[1] * zoneNow(), { hp: K.CHAL_HP });
          Z.wave.set(o.i, ids);
          say(F('¡Desafío! Derrota la oleada'), 2.6); G.Audio.sfx('surge');
          if (!ids.length) Z.st[o.i] = READY;
        } else if (st === ACTIVE) {
          const ids = Z.wave.get(o.i) || [];
          if (!ids.some(id => { const e = G.EnemyMgr.get(id); return e && !e.dead; })) {
            Z.st[o.i] = READY; Z.wave.delete(o.i); Z.t[o.i] = 0;
            say(F('¡Desafío superado! Una Super Ball'), 2.8); G.Audio.sfx('legend'); G.FX.ring(o.x, o.y, 8, 140, COL.great, 0.7, 5);
          }
        } else if (st === READY) {
          if (Z.latch.has(o.i) || !stand(1.15 * tsz + pr, K.OPEN_T)) return;
          openBall(o, Z, pl, 'great');
        }
        return;
      }
      case 'cursedaltar': case 'greed': {
        if (!stand(1.6 * tsz + pr, K.ALTAR_T)) return;
        markUsed(Z, o); S.log.altars++;
        const M = S.mods;
        if (o.kind === 'cursedaltar') {
          M.diff += K.CURSE_ALTAR.diff; M.rate += K.CURSE_ALTAR.rate;
          const id = rollOffers(pl, rngFor(o.i, 0xC0A5), 1, 2)[0];
          if (id) LV().itemTake(pl, IT().PREFIX + id);
          say(F('¡Maldición! Más enemigos y más dificultad'), 3);
        } else {
          M.diff += K.GREED.diff; M.xp += K.GREED.xp; M.money += K.GREED.money; M.loot = Math.max(M.loot, K.GREED.loot);
          say(F('¡Codicia de Gengar! Más dificultad, más botín'), 3);
        }
        G.Audio.sfx('boss'); G.FX.ring(o.x, o.y, 8, 180, COL[o.kind], 0.8, 6);
        return;
      }
      case 'ditto': {
        if (Z.latch.has(o.i) || !stand(1.3 * tsz + pr, K.MEET_T)) return;
        const I = IT(), have = Object.keys(pl.xi || {}).filter(id => I.IT[id] && I.room(pl, id));
        Z.latch.add(o.i); Z.t[o.i] = 0;
        if (!have.length) { say(F('Ditto no tiene nada que copiar'), 2.4); return; }
        const id = have[Math.floor(rngFor(o.i, 0xD170)() * have.length) % have.length];
        markUsed(Z, o); S.log.ditto++;
        LV().itemTake(pl, I.PREFIX + id);
        say(F('Ditto copia {x}', T.t(I.IT[id].name)), 2.8); G.FX.ring(o.x, o.y, 8, 120, COL.ditto, 0.6, 4);
        return;
      }
      case 'hypno': {
        if (Z.latch.has(o.i) || !stand(1.3 * tsz + pr, K.MEET_T)) return;
        Z.latch.add(o.i); Z.t[o.i] = 0;
        if (!pl.xv || !pl.xv.length) { say(F('No tienes vitaminas que olvidar'), 2.4); return; }
        openHypno(o, Z, pl);
        return;
      }
      case 'cage': {
        if (Z.latch.has(o.i) || !stand(1.3 * tsz + pr, K.MEET_T)) return;
        Z.latch.add(o.i); Z.t[o.i] = 0;
        const cost = cageCost(zoneNow());
        if (!spend(cost)) { say(F('Te faltan {x} ₽', cost - (pl.coins || 0)), 2.4); G.Audio.sfx('error'); return; }
        markUsed(Z, o); S.log.freed++;
        const xp = Math.round(pl.xpNext * K.CAGE_XP), ups = pl.gainXp(xp / (pl.xpMul || 1));
        if (ups > 0) G.Game.grantLevels(ups, false);
        say(F('¡Liberas a {x}! +{x} de experiencia', (G.DEX_BY[o.v] || {}).name || '', xp), 2.8);
        G.Audio.sfx('legend'); G.FX.ring(o.x, o.y, 8, 140, '#7dffb0', 0.6, 5);
        return;
      }
      case 'rock': {
        if (d > 0.75 * tsz + pr) return;
        markUsed(Z, o); S.log.rocks++;
        const got = earn(o.v * zoneNow() * goldK(pl), 'rock');
        G.FX.dmgText(o.x, o.y - 20, new String(F('+{x} ₽', got)), '#ffd23f', true);   // eslint-disable-line no-new-wrappers
        G.Audio.sfx('coin'); G.FX.burst(o.x, o.y - 6, '#e8b93a', 10, 140);
        return;
      }
      case 'berry': {
        if (d > 0.85 * tsz + pr || pl.hp >= pl.maxHp) return;
        markUsed(Z, o); S.log.berries++;
        const before = pl.hp;
        pl.heal(pl.maxHp * K.BERRY);
        say(F('¡Bayas! +{x} de vida', Math.round(pl.hp - before)), 2.2); G.Audio.sfx('heal');
        return;
      }
    }
  }

  /** A wave of the zone's Pokémon round interactable o (its own stream). -> the new foes' ids */
  function horde(o, n, opt = {}) {
    const Cl = C(), run = Cl && Cl.run, ids = [];
    if (!run || !run.plan) return ids;
    const cards = run.plan.cards.slice(0, Math.min(8, run.plan.cards.length)), rng = R(mix(G.World.seed | 0, G.World.zone.zone | 0, o.i, 0x7A7E, S.waves++));
    const a0 = rng() * 6.2832, p = { x: o.x, y: o.y };
    for (let k = 0; k < n; k++) {
      const dex = opt.dex ? opt.dex[k % opt.dex.length] : cards[Math.floor(rng() * cards.length) % cards.length];
      const fly = G.Sprites.hovers(dex), ang = a0 + k / n * 6.2832, d0 = opt.d || 250;
      let pt = null;
      for (const f of [1, 0.6, 1.5, 0.3]) { pt = Cl.spotNear(rng, p, ang, fly, d0 * f); if (pt) break; }   // (a cliff in the way: nearer, then further)
      if (!pt) pt = [o.x + Math.cos(ang) * 40, o.y + Math.sin(ang) * 30];
      const e = Cl.spawnFoe(dex, pt[0], pt[1], { hp: opt.hp || 1 });
      if (e) { e.xch = o.i + 1; ids.push(e.id); }
    }
    S.hordes.push([o.i, ids.length]);
    if (!opt.quiet) { say(F(opt.msg || '¡Horda!'), 2); G.Audio.sfx('surge'); }
    return ids;
  }

  // ---------------- the balls ----------------
  function openBall(o, Z, pl, as) {
    const kind = as || o.kind, I = IT();
    if (kind === 'ball') {
      const cost = ballCost(S.balls, pl.xluck || 0);
      Z.latch.add(o.i); Z.t[o.i] = 0;
      if ((pl.coins || 0) < cost) { say(F('Te faltan {x} ₽', cost - (pl.coins || 0)), 2.4); G.Audio.sfx('error'); return false; }
      spend(cost); S.balls++;
    }
    markUsed(Z, o); S.opened++; S.log.balls++;
    G.Audio.sfx('legend'); G.FX.ring(o.x, o.y, 6, 110, COL[kind], 0.5, 4);
    const rng = rngFor(o.i, 0xBA11);
    if (kind === 'ball' || kind === 'great') {
      const n = K.OFFERS + (S.mods.loot | 0), ids = rollOffers(pl, rng, n, kind === 'great' ? 1 : 0);
      openPick({ kind: 'ball', title: NAME[kind], sub: F('Elige 1 de {x}', ids.length), ids, picks: 1 });
      return true;
    }
    if (kind === 'freeball') { const id = rollOffers(pl, rng, 1, 0)[0]; if (id) LV().itemTake(pl, I.PREFIX + id); return true; }
    // cursed: +5 % difficulty, a ghost ambush, 1 item (a 2nd at 40 % x (1 + luck / 100))
    S.mods.diff += K.CURSE_BALL;
    const two = rng() < K.CURSE_2ND * (1 + (pl.xluck || 0) / 100);
    const ids = rollOffers(pl, rng, two ? 2 : 1, 0);
    for (const id of ids) LV().itemTake(pl, I.PREFIX + id);
    const ghosts = K.GHOST_DEX.filter(d => G.SPRITE_META[d]);
    horde({ i: o.i, x: pl.x, y: pl.y }, K.GHOSTS[0] + K.GHOSTS[1] * zoneNow(), { dex: ghosts.length ? ghosts : null, d: 220, msg: '¡Emboscada fantasma!' });
    say(F('¡La Poké Ball estaba maldita! +5 % de dificultad'), 3);
    return true;
  }
  /** An Unown altar (tier 0-3) or the comet (tier null) is full: its blessing. */
  function blessing(o, Z, pl, tier) {
    markUsed(Z, o); Z.ch[o.i] = 1; S.log.altars++;
    G.Audio.sfx('legend'); G.FX.ring(o.x, o.y, 10, 200, COL[o.kind], 0.8, 6);
    const rng = rngFor(o.i, 0xB1E5);
    if (tier == null) {   // the comet
      const ids = rollOffers(pl, rng, 3, 1);
      const U = G.ExpUlt;
      if (U && U.run && !U.run.cast) U.run.c = Math.min(1, U.run.c + K.COMET_ULT);
      openPick({ kind: 'comet', title: NAME.comet, sub: F('Elige 1 de {x}', ids.length) + ' · ' + F('Definitivo +25 %'), ids, picks: 1 });
      return;
    }
    const [n, picks, min] = K.UNOWN_OFFERS[tier];
    const ids = rollOffers(pl, rng, n, min);
    openPick({ kind: 'unown', title: tier === 3 ? F('¡Bendición dorada!') : F('Bendición Unown'), sub: F(picks > 1 ? 'Elige 2 de {x}' : 'Elige 1 de {x}', ids.length), ids, picks: Math.min(picks, ids.length) });
  }

  // ---------------- Meowth ----------------
  const heatNow = () => (S ? heatOf(S.buys, S.opened) : view ? heatOf(view.h[1], view.h[2]) : 0);
  /** Meowth's prices now (by stock slot). */
  function shopPrices(stock) { const h = heatNow(), z = zoneNow(), I = IT(); return (stock || []).map(id => price(I.IT[id] ? I.IT[id].rar : 0, z, h)); }
  function openShop(o, Z, pl) { openPick({ kind: 'shop', title: NAME.meowth, ids: Z.stock || [], picks: 99, cancel: 'Irse' }); }
  function buy(slot) {
    const pl = G.Game.player, Z = S && S.z;
    if (!Z || !Z.stock || (Z.sold & (1 << slot))) return false;
    const id = Z.stock[slot], cost = shopPrices(Z.stock)[slot];
    if (!spend(cost)) { say(F('Te faltan {x} ₽', cost - (pl.coins || 0)), 2.2); G.Audio.sfx('error'); return false; }
    Z.sold |= 1 << slot; S.buys++; S.log.shop++; S.used++; S.last = Z.spot;
    LV().itemTake(pl, IT().PREFIX + id);
    G.Audio.sfx('coin');
    return true;
  }

  // ---------------- Hypno ----------------
  function openHypno(o, Z, pl) {
    openPick({ kind: 'hypno', title: NAME.hypno, sub: F('Hypno: «Mira el péndulo...»'), vit: pl.xv.map(x => x.id), picks: 1, cancel: 'Quedármelas', obj: o.i });
  }
  /** Forget vitamin id: off pl.xv, the stats re-applied (D5: same-stat sums). */
  function forget(pl, id) {
    const k = pl.xv ? pl.xv.findIndex(x => x.id === id) : -1;
    if (k < 0) return false;
    pl.xv.splice(k, 1);
    IT().apply(pl);
    if (LV().syncUI) LV().syncUI(true);
    return true;
  }

  // ---------------- the choice screen (balls, blessings, the shop, Hypno) ----------------
  let pick = null, pickEl = null;
  const pickOpen = () => !!pick;
  /** o: {kind, title, sub, ids | vit, picks, cancel} */
  function openPick(o) {
    if (typeof document === 'undefined' || !pickEl) mountUI();
    if (!pickEl) return;
    if (!o.vit && o.kind !== 'shop' && !(o.ids || []).length) { const pl = G.Game.player; if (pl) pl.heal(pl.maxHp * 0.2); return; }   // (every item capped: a heal, as D5's pickups)
    pick = Object.assign({ left: o.picks || 1, at: performance.now(), taken: [] }, o);
    G.Game.choiceStart();
    if (G.Coop && G.Coop.active) G.Coop.holdStart();
    renderPick();
    pickEl.classList.remove('hidden');
  }
  function closePick(silent) {
    if (!pick) { if (pickEl) pickEl.classList.add('hidden'); return; }
    const was = pick;
    pick = null;
    if (pickEl) pickEl.classList.add('hidden');
    if (silent) return;
    if (was.kind === 'hypno' && S && S.z) { /* Hypno stays until you forget one */ }
    if (G.Coop && G.Coop.active) G.Coop.holdEnd();
    G.Game.choiceEnd();
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function renderPick() {
    if (!pick || !pickEl) return;
    const I = IT(), pl = G.Game.player, P = pick;
    pickEl.querySelector('#xeco-h').textContent = T.t(P.title);
    let sub = P.sub || '';
    if (P.kind === 'shop') sub = F('Meowth: «¡Miau! ¿Qué te llevas?»') + ' · ' + F('Tienes {x} ₽', Math.floor(pl.coins || 0)) + (heatNow() > 0 ? ' · ' + F('Calor del mercado ×{x}', heatMul(heatNow()).toFixed(2)) : '');
    pickEl.querySelector('#xeco-sub').textContent = sub;
    const box = pickEl.querySelector('#xeco-cards');
    let html = '';
    if (P.vit) {
      P.vit.forEach((id, k) => {
        const d = I.VIT[id], x = pl.xv.find(v => v.id === id);
        if (!d || !x) return;
        html += `<div class="card rar rar-1" data-i="${k}"><div class="ico"><img class="ico-item" src="${I.icon(d.icon)}" alt=""></div>
          <div class="txt"><div class="nm">${esc(F('Olvidar {x}', T.t(d.name)))}</div><div class="ds">${esc(F('Libera su hueco (nivel {x}).', x.lvl))} ${esc(I.statText(d.stat, x.v))}</div></div>
          <div class="key"><span class="key-k">${k + 1}</span>${G.Pad.glyphHTML('confirm', 22)}</div></div>`;
      });
    } else {
      const prices = P.kind === 'shop' ? shopPrices(P.ids) : null, Z = S && S.z;
      P.ids.forEach((id, k) => {
        const it = I.IT[id];
        if (!it) return;
        const sold = P.kind === 'shop' ? !!(Z && (Z.sold & (1 << k))) : P.taken.includes(k);
        const cost = prices ? prices[k] : 0, poor = prices && (pl.coins || 0) < cost;
        const tag = prices ? (sold ? T.t('Vendido') : F('Comprar · {x} ₽', cost)) : '';
        html += `<div class="card rar rar-${it.rar + 1}${sold ? ' picked xsold' : ''}${poor && !sold ? ' xpoor' : ''}" data-i="${k}"><div class="ico"><img class="ico-item" src="${I.icon(it.icon)}" alt=""></div>
          <div class="txt"><div class="nm">${esc(T.t(it.name))} <span class="rar-chip">${esc(T.t(I.RAR_NAME[it.rar]))}</span></div><div class="ds">${esc(I.itemText(id))}</div>${tag ? `<span class="xprice">${esc(tag)}</span>` : ''}</div>
          <div class="key"><span class="key-k">${k + 1}</span>${G.Pad.glyphHTML('confirm', 22)}</div></div>`;
      });
    }
    box.innerHTML = html;
    for (const el of box.querySelectorAll('.card')) el.onclick = () => choose(+el.dataset.i);
    const cb = pickEl.querySelector('#xeco-close');
    cb.classList.toggle('hidden', !P.cancel);
    if (P.cancel) cb.textContent = T.t(P.cancel);
  }
  /** Card k picked (a click, a digit, the pad). -> true if it did something */
  function choose(k) {
    const P = pick, pl = G.Game.player;
    if (!P || !pl || performance.now() - P.at < 380) return false;   // (no accidental pick: the A that walked you in)
    if (P.vit) {
      const id = P.vit[k];
      if (!id || !forget(pl, id)) return false;
      const Z = S && S.z, o = Z && P.obj != null ? Z.lay.objs[P.obj] : null;
      if (o) markUsed(Z, o);
      S.log.hypno++;
      say(F('Olvidas {x}', T.t(IT().VIT[id].name)), 2.4); G.Audio.sfx('select');
      closePick();
      return true;
    }
    const id = P.ids[k];
    if (!id) return false;
    if (P.kind === 'shop') { if (!buy(k)) return false; renderPick(); return true; }
    if (P.taken.includes(k)) return false;
    P.taken.push(k);
    LV().itemTake(pl, IT().PREFIX + id);
    G.Audio.sfx('select');
    if (--P.left <= 0) closePick(); else { P.at = performance.now() - 200; renderPick(); }
    return true;
  }

  // ---------------- the fog of war ----------------
  let fog = null;
  function fogFor(z) {
    const k = zkey(z);
    if (!fog || fog.key !== k) fog = { key: k, x0: z.x0, y0: z.y0, w: z.w, h: z.h, a: new Uint8Array(z.w * z.h), n: 0, lt: null };
    return fog;
  }
  /** Tiles within SIGHT of p are explored (once per tile p stands on). */
  function reveal(p) {
    const z = G.World.zone;
    if (!z || !p || !layoutOf(z)) return;
    const f = fogFor(z), tx = Math.floor(p.x / TS()), ty = Math.floor(p.y / TS());
    if (f.lt && f.lt[0] === tx && f.lt[1] === ty) return;
    f.lt = [tx, ty];
    const S2 = K.SIGHT;
    for (let oy = -S2; oy <= S2; oy++) for (let ox = -S2; ox <= S2; ox++) {
      if (ox * ox + oy * oy > S2 * S2) continue;
      const x = tx + ox - f.x0, y = ty + oy - f.y0;
      if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue;
      const i = y * f.w + x;
      if (!f.a[i]) { f.a[i] = 1; f.n++; }
    }
  }
  const explored = (tx, ty) => { if (!fog) return false; const x = tx - fog.x0, y = ty - fog.y0; return x >= 0 && y >= 0 && x < fog.w && y < fog.h && !!fog.a[y * fog.w + x]; };
  const viewer = () => (G.Game.state === 'watch' && G.WatchUI && G.WatchUI.player) || G.Game.player;
  /** Found: its tile explored, or within RADAR of the viewer. */
  function found(o, p) { return explored(o.tx, o.ty) || (p && Math.hypot(p.x - o.x, p.y - o.y) < K.RADAR * TS()); }

  // ---------------- what viewers see: the host's state, or the `o` block ----------------
  /** {st, ch, spot, stock, sold, h} for the current zone (the host's, or a viewer's copy), or null. */
  function cur() {
    const z = G.World.zone, lay = layoutOf(z);
    if (!lay) return null;
    if (S && S.z && S.z.key === lay.key && G.Modes.isExp()) return { lay, st: S.z.st, ch: S.z.ch, spot: S.z.spot, stock: S.z.stock, sold: S.z.sold, h: [S.balls, S.buys, S.opened], host: true };
    const n = lay.objs.length, st = new Array(n).fill(FRESH), ch = new Array(n).fill(0);
    let spot = -1, stock = null, sold = 0, h = [0, 0, 0];
    if (view) {
      for (let k = 0; k + 2 < view.s.length; k += 3) { const i = view.s[k]; if (i >= 0 && i < n) { st[i] = view.s[k + 1]; ch[i] = view.s[k + 2] / 100; } }
      if (view.m && view.m.length >= 3) { spot = view.m[1]; stock = view.m.slice(2, -1); sold = view.m[view.m.length - 1] | 0; }   // (a short stock: every item at its cap)
      h = view.h;
    }
    return { lay, st, ch, spot, stock, sold, h, host: false };
  }
  /** The host's `o` block: {s, h, g, n, u, m?} (null outside an Expedition zone with interactables). */
  function oBlock() {
    if (!S || !G.Modes.isExp()) return null;
    const Z = S.z, M = S.mods;
    const o = { s: [], h: [S.balls, S.buys, S.opened], g: [Math.round(M.diff * 100), Math.round(M.rate * 100), Math.round(M.xp * 100), Math.round(M.money * 100), M.loot | 0], n: S.used, u: S.last };
    if (Z) {
      for (let i = 0; i < Z.st.length; i++) if (Z.st[i] !== FRESH || Z.ch[i] > 0) o.s.push(i, Z.st[i], Math.round(Z.ch[i] * 100));
      if (Z.spot >= 0 && Z.stock) o.m = [Z.visit, Z.spot, ...Z.stock, Z.sold];
    }
    return o;
  }
  /** A viewer / guest: a snapshot's / host frame's `o` (null: none, every interactable fresh). */
  function applyO(o) {
    if (!o || !Array.isArray(o.s) || !Array.isArray(o.h)) { view = null; return; }
    view = { s: o.s, h: o.h, g: o.g || [0, 0, 0, 0, 0], m: Array.isArray(o.m) ? o.m : null, n: o.n | 0 };
    mountUI();
    const p = viewer();
    if (p) reveal(p);
  }

  // ---------------- drawing (in code + the overworld's item pictures and the Pokémon sheets: no new art) ----------------
  const imgs = {};
  function img(name) {
    let im = imgs[name];
    if (!im && typeof Image !== 'undefined') { im = imgs[name] = new Image(); im.src = IT().icon(name); }
    return im && im.complete && im.naturalWidth ? im : null;
  }
  const ICON = { ball: 'poke_ball', freeball: 'premier_ball', cursedball: 'poke_ball', great: 'great_ball', comet: 'star_piece', berry: 'oran_berry' };
  const MON = { meowth: 52, ditto: 132, hypno: 97, greed: 94, unown1: 201, unown2: 201, unown3: 201, unown4: 201 };
  const anims = {};
  function anim(dex) {
    if (!G.SPRITE_META[dex]) return null;
    if (!anims[dex]) { anims[dex] = new G.Sprites.Animator(dex, 1); anims[dex].loop('Idle'); }
    return anims[dex];
  }
  function preload() { const l = Object.values(MON).concat(K.GHOST_DEX); if (S && S.z) for (const o of S.z.lay.objs) if (o.kind === 'cage') l.push(o.v); G.Sprites.preload([...new Set(l)].filter(d => G.SPRITE_META[d]), 8000); }
  let lastT = 0;
  /** Under everything (classic.js drawGround): each interactable on screen. */
  function drawGround(ctx) {
    const c = cur();
    if (!c) return;
    const p = viewer();
    if (p && !(S && S.z)) reveal(p);
    const cam = G.Camera, now = performance.now() / 1000, dt = lastT ? Math.min(0.05, now - lastT) : 0;
    lastT = now;
    for (const a of Object.values(anims)) a.update(dt);
    const tsz = TS(), zt = viewZoneTime();
    for (const o of c.lay.objs) {
      const st = c.st[o.i];
      if (!cam.sees(o.x, o.y, 90)) continue;
      if (o.kind === 'meowth' && c.spot !== o.i) continue;
      if (o.kind === 'comet' && st !== READY && st !== ACTIVE) continue;
      ctx.save();
      drawObj(ctx, o, st, c.ch[o.i], now, tsz, zt);
      ctx.restore();
    }
  }
  const viewZoneTime = () => { const v = C() && C().cur(), t = G.Game.st ? G.Game.st.time : 0; return v ? t - v.zs : t; };
  const shadow = (ctx, x, y, r) => { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y + 3, r, r * 0.45, 0, 0, 6.2832); ctx.fill(); };
  function icon(ctx, name, x, y, s, alpha = 1) {
    const im = img(name);
    if (!im) return false;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    ctx.restore();
    return true;
  }
  function ringArc(ctx, x, y, R0, frac, col) {
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(x, y, R0, R0 * 0.6, 0, 0, 6.2832); ctx.stroke();
    if (frac > 0) { ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, y, R0, R0 * 0.6, 0, -Math.PI / 2, -Math.PI / 2 + frac * 6.2832); ctx.stroke(); }
  }
  function drawObj(ctx, o, st, ch, now, tsz, zt) {
    const { x, y } = o, used = st === USED, bob = Math.sin(now * 3 + o.i) * 2;
    switch (o.kind) {
      case 'ball': case 'freeball': case 'cursedball': {
        if (used) { ctx.globalAlpha = 0.35; shadow(ctx, x, y, 10); return; }
        if (o.kind === 'cursedball') { ctx.globalAlpha = 0.3 + Math.sin(now * 4 + o.i) * 0.1; ctx.fillStyle = COL.cursedball; ctx.beginPath(); ctx.ellipse(x, y, 22, 12, 0, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; }
        shadow(ctx, x, y, 11);
        if (!icon(ctx, ICON[o.kind], x, y - 10 + bob, 26)) { ctx.fillStyle = COL[o.kind]; ctx.beginPath(); ctx.arc(x, y - 10 + bob, 9, 0, 6.2832); ctx.fill(); }
        if (o.kind === 'cursedball') { ctx.globalAlpha = 0.45; ctx.fillStyle = '#5a1f9a'; ctx.beginPath(); ctx.arc(x, y - 10 + bob, 10, 0, 6.2832); ctx.fill(); }
        return;
      }
      case 'meowth': {
        // a little stall: an awning in stripes, Meowth behind the counter
        ctx.fillStyle = '#8a5a2c'; ctx.fillRect(x - 26, y - 6, 52, 14);
        for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#fff3c8' : '#e2483d'; ctx.fillRect(x - 30 + k * 10, y - 50, 10, 10); }
        ctx.fillStyle = '#6b4320'; ctx.fillRect(x - 28, y - 40, 3, 36); ctx.fillRect(x + 25, y - 40, 3, 36);
        const a = anim(MON.meowth);
        if (a) a.draw(ctx, x, y - 4); else { ctx.fillStyle = COL.meowth; ctx.beginPath(); ctx.arc(x, y - 16, 10, 0, 6.2832); ctx.fill(); }
        icon(ctx, 'nugget', x - 14, y + 1, 14); icon(ctx, 'amulet_coin', x + 14, y + 1, 14);
        return;
      }
      case 'unown1': case 'unown2': case 'unown3': case 'unown4': case 'comet': {
        const comet = o.kind === 'comet', tier = comet ? 1 : +o.kind[5] - 1, col = COL[o.kind];
        const R0 = (comet ? K.COMET_R : K.UNOWN_R[tier]) * tsz;
        const sealed = !comet && tier === 3 && zt < K.SEAL;
        ctx.globalAlpha = used ? 0.35 : 0.85;
        ctx.fillStyle = 'rgba(20,24,36,.35)'; ctx.beginPath(); ctx.ellipse(x, y, R0, R0 * 0.6, 0, 0, 6.2832); ctx.fill();
        ctx.setLineDash([6, 6]); ctx.lineDashOffset = -now * 12; ctx.strokeStyle = sealed ? '#6b7180' : col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y, R0, R0 * 0.6, 0, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
        if (!used) ringArc(ctx, x, y, R0 - 4, ch, col);
        if (comet) { icon(ctx, ICON.comet, x, y - 16 + bob, 28, used ? 0.4 : 1); ctx.globalAlpha = 0.5 + Math.sin(now * 6) * 0.3; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - 16 + bob, 16, 0, 6.2832); ctx.fill(); return; }
        // the stone and its Unown
        ctx.globalAlpha = used ? 0.45 : 1;
        ctx.fillStyle = '#6f6b5f'; ctx.fillRect(x - 6, y - 22, 12, 20);
        ctx.fillStyle = col; ctx.fillRect(x - 7, y - 25, 14, 4);
        const a = anim(MON[o.kind]);
        if (a && !used) { ctx.globalAlpha = sealed ? 0.4 : 0.9; a.draw(ctx, x, y - 30 + bob); }
        if (sealed) { ctx.globalAlpha = 1; ctx.strokeStyle = '#c9ced8'; ctx.lineWidth = 2; ctx.strokeRect(x - 6, y - 16, 12, 9); ctx.beginPath(); ctx.arc(x, y - 16, 4, Math.PI, 0); ctx.stroke(); }
        return;
      }
      case 'challenge': case 'cursedaltar': case 'greed': {
        const col = COL[o.kind];
        ctx.globalAlpha = used ? 0.4 : 1;
        shadow(ctx, x, y, 16);
        ctx.fillStyle = '#4a4656'; ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.lineTo(x + 7, y - 34); ctx.lineTo(x - 7, y - 34); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col; ctx.fillRect(x - 3, y - 28, 6, 14);
        if (o.kind === 'greed' && !used) { const a = anim(MON.greed); if (a) { ctx.globalAlpha = 0.85; a.draw(ctx, x, y - 36 + bob); } }
        if (o.kind === 'challenge' && st === READY) { ctx.globalAlpha = 1; icon(ctx, ICON.great, x, y - 46 + bob, 26); }
        if (o.kind === 'challenge' && st === ACTIVE) { ctx.globalAlpha = 0.5 + Math.sin(now * 8) * 0.3; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, 30, 18, 0, 0, 6.2832); ctx.stroke(); }
        return;
      }
      case 'ditto': case 'hypno': {
        ctx.globalAlpha = used ? 0.3 : 1;
        ctx.fillStyle = 'rgba(240,168,232,.25)'; ctx.beginPath(); ctx.ellipse(x, y, 20, 10, 0, 0, 6.2832); ctx.fill();
        const a = anim(MON[o.kind]);
        if (a && !used) a.draw(ctx, x, y); else { ctx.fillStyle = COL[o.kind]; ctx.beginPath(); ctx.arc(x, y - 10, 9, 0, 6.2832); ctx.fill(); }
        return;
      }
      case 'rock': {
        if (used) { ctx.globalAlpha = 0.6; ctx.fillStyle = '#7d6a4a'; for (let k = 0; k < 4; k++) ctx.fillRect(x - 10 + k * 6, y - 3 + (k % 2) * 3, 4, 3); return; }
        shadow(ctx, x, y, 13);
        ctx.fillStyle = '#8a7a5c'; ctx.beginPath(); ctx.moveTo(x - 13, y); ctx.lineTo(x - 9, y - 14); ctx.lineTo(x + 2, y - 18); ctx.lineTo(x + 12, y - 10); ctx.lineTo(x + 13, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd95e'; ctx.fillRect(x - 6, y - 11, 4, 3); ctx.fillRect(x + 3, y - 8, 3, 3); ctx.fillRect(x - 1, y - 4, 3, 2);
        if (Math.sin(now * 5 + o.i * 2) > 0.85) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 4, y - 14, 2, 2); }
        return;
      }
      case 'berry': {
        shadow(ctx, x, y, 14);
        ctx.fillStyle = used ? '#3d6b3a' : '#2f8a3a';
        for (const [dx, dy, r] of [[-7, -8, 8], [6, -9, 8], [0, -15, 8], [0, -6, 9]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, 6.2832); ctx.fill(); }
        if (!used) { if (!icon(ctx, ICON.berry, x, y - 12, 16)) { ctx.fillStyle = COL.berry; for (const [dx, dy] of [[-5, -10], [5, -12], [1, -5]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 3, 0, 6.2832); ctx.fill(); } } }
        return;
      }
      case 'cage': {
        shadow(ctx, x, y, 16);
        if (!used) { const a = anim(o.v); if (a) a.draw(ctx, x, y - 2); }
        ctx.globalAlpha = used ? 0.35 : 1;
        ctx.strokeStyle = '#c9ced8'; ctx.lineWidth = 2;
        ctx.strokeRect(x - 16, y - 34, 32, 34);
        for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(x - 16 + k * 6.4, y - 34); ctx.lineTo(x - 16 + k * 6.4, y); ctx.stroke(); }
        ctx.fillStyle = '#9aa3b2'; ctx.fillRect(x - 18, y - 37, 36, 4);
        return;
      }
    }
  }

  /** Over the HUD (classic.js drawHud): price / timer labels of the interactables near the viewer, the tip box. */
  function drawHud(ctx, w, h, pl, Fn, mark) {
    const c = cur();
    if (!c || !pl) return;
    const cam = G.Camera, k = G.HUD ? G.HUD.k : 1, tsz = TS(), zt = viewZoneTime();
    ctx.save(); ctx.textAlign = 'center'; ctx.font = Fn(800, 11); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
    const label = (o, txt, col, dy = 44) => {
      const sx = (o.x - cam.left()) * cam.scale / k, sy = (o.y - dy - cam.top()) * cam.scale / k;
      if (sx < 0 || sx > w || sy < 0 || sy > h) return;
      const s = new String(txt);   // eslint-disable-line no-new-wrappers
      ctx.strokeText(s, sx, sy); ctx.fillStyle = col; ctx.fillText(s, sx, sy);
    };
    for (const o of c.lay.objs) {
      const st = c.st[o.i];
      if (st === USED || st === GONE || Math.hypot(o.x - pl.x, o.y - pl.y) > 9 * tsz) continue;
      if (o.kind === 'ball') label(o, ballCost(c.h[0], pl.xluck || 0) + ' ₽', (pl.coins || 0) >= ballCost(c.h[0], pl.xluck || 0) ? '#ffd23f' : '#ff9aa4', 34);
      else if (o.kind === 'cage') label(o, cageCost(zoneNow()) + ' ₽', (pl.coins || 0) >= cageCost(zoneNow()) ? '#ffd23f' : '#ff9aa4', 48);
      else if (o.kind === 'meowth' && c.spot === o.i) label(o, T.t('TIENDA'), '#ffd23f', 60);
      else if (o.kind === 'unown4' && zt < K.SEAL) label(o, F('SELLADO {x}', G.U.mmss(Math.max(0, K.SEAL - zt))), '#c9ced8', 56);
      else if ((o.kind.startsWith('unown') || o.kind === 'comet') && st === ACTIVE) label(o, Math.floor(c.ch[o.i] * 100) + ' %', COL[o.kind], o.kind === 'comet' ? 40 : 56);
      else if (o.kind === 'comet' && st === READY) label(o, G.U.mmss(Math.max(0, c.lay.cometAt + K.COMET_LIFE - zt)), COL.comet, 40);
    }
    ctx.restore();
    placeTip(w, h, k);
    const tb = tipRect();
    if (tb && mark) mark('xtip', tb.x, tb.y, tb.w, tb.h);
  }
  /** Where the tip box goes: top centre on a desktop (under the zone line, above the banners); on a phone the banners
   *  are higher (h x 0.3), so it goes down the left column, under the minimap. */
  function placeTip(w, h, k) {
    if (!tipEl || tipEl.classList.contains('hidden')) return;
    const mm = G.HUD && G.HUD.minimap, side = G.Touch.active && mm;
    const want = side ? `l${Math.round(mm.x * k)}t${Math.round((mm.y + mm.s) * k + 10)}` : 'c';
    if (tipEl.dataset.at === want) return;
    tipEl.dataset.at = want;
    tipEl.classList.toggle('side', !!side);
    tipEl.style.left = side ? Math.round(mm.x * k) + 'px' : '';
    tipEl.style.top = side ? Math.round((mm.y + mm.s) * k + 10) + 'px' : '';
  }
  /** The tip box on screen, in HUD units (null: none showing). */
  function tipRect() {
    if (!tipEl || tipEl.classList.contains('hidden')) return null;
    const r = tipEl.getBoundingClientRect(), k = G.HUD ? G.HUD.k : 1;
    return r.width ? { x: r.left / k, y: r.top / k, w: r.width / k, h: r.height / k } : null;
  }

  /** A small icon for the minimap and the legend (in code, so it reads at 8 px). */
  function mini(ctx, kind, x, y, s = 1, dim = false) {
    ctx.save();
    ctx.globalAlpha = dim ? 0.4 : 1;
    ctx.translate(x, y); ctx.scale(s, s);
    const col = COL[kind] || '#ffffff';
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.85)';
    if (kind === 'ball' || kind === 'freeball' || kind === 'cursedball' || kind === 'great') {
      ctx.fillStyle = kind === 'freeball' ? '#ffffff' : col; ctx.beginPath(); ctx.arc(0, 0, 5, Math.PI, 0); ctx.fill();
      ctx.fillStyle = kind === 'freeball' ? '#e2483d' : '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, 6.2832); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke();
    } else if (kind === 'meowth') {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a3a10'; ctx.font = '700 8px Arial,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('₽', 0, 3);
    } else if (kind.startsWith('unown') || kind === 'comet') {
      ctx.fillStyle = col; ctx.beginPath();
      if (kind === 'comet') { for (let k = 0; k < 10; k++) { const a = k / 10 * 6.2832 - Math.PI / 2, r = k % 2 ? 2.6 : 6.5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } }
      else { ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (kind === 'challenge' || kind === 'cursedaltar' || kind === 'greed') {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5.5, 5); ctx.lineTo(-5.5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (kind === 'rock') {
      ctx.fillStyle = col; ctx.fillRect(-4, -4, 8, 8); ctx.strokeRect(-4, -4, 8, 8);
    } else if (kind === 'cage') {
      ctx.fillStyle = '#3a404c'; ctx.fillRect(-5, -5, 10, 10); ctx.strokeStyle = col; ctx.strokeRect(-5, -5, 10, 10);
      ctx.beginPath(); ctx.moveTo(-1.5, -5); ctx.lineTo(-1.5, 5); ctx.moveTo(1.5, -5); ctx.lineTo(1.5, 5); ctx.stroke();
    } else if (kind === 'you') {
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 6.2832); ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.stroke();
    } else if (kind === 'altar') {
      ctx.fillStyle = '#ffd95e'; ctx.fillRect(-5, -5, 10, 10); ctx.strokeRect(-5, -5, 10, 10); ctx.fillStyle = '#6f6b5f'; ctx.fillRect(-1.5, -4, 3, 8);
    } else if (kind === 'portal') {
      ctx.fillStyle = '#b48aff'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 4.5, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 6.2832); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  /** What a legend / minimap entry is: the challenge altar's Great Ball, Meowth only while he's in, the comet once it lands. */
  function shownKind(o, c) {
    const st = c.st[o.i];
    if (o.kind === 'meowth') return c.spot === o.i ? 'meowth' : null;
    if (o.kind === 'comet') return st === READY || st === ACTIVE ? 'comet' : null;
    if (o.kind === 'challenge' && st === READY) return 'great';
    if (st === GONE) return null;
    return o.kind;
  }
  let miniRect = null, miniDrawn = 0;
  /** minimap.draw (an Expedition zone): the interactables you have found; a tap on the minimap opens the zone map. */
  function drawMini(ctx, pl, api) {
    const c = cur();
    if (!c || !pl) return;
    reveal(pl);
    miniDrawn = 0;
    for (const o of c.lay.objs) {
      const kind = shownKind(o, c);
      if (!kind || !found(o, pl)) continue;
      const q = api.pt(o.x, o.y);
      if (!api.inside(q, 6)) continue;
      const used = c.st[o.i] === USED;
      mini(ctx, kind, q.x, q.y, 1.15, used);
      api.rec(used ? 'x-used' : 'x-' + kind, q);
      miniDrawn++;
    }
    const mm = api.mm;
    if (mm && G.Game.state === 'playing' && !pl.remote && S) {
      miniRect = { x: mm.x, y: mm.y, s: mm.s };
      G.Touch.addButton(mm.x, mm.y, mm.s, mm.s, () => openMap(), 0);
    }
  }

  // ---------------- the zone map (M, a tap on the minimap, the pause screen's button) ----------------
  let mapEl = null, mapOpen = false, mapPaused = false, terrCache = null, mapInfo = null;
  function terrainImage(z) {
    const k = zkey(z) + ':' + G.World.biome;
    if (terrCache && terrCache.k === k) return terrCache.cv;
    const cv = document.createElement('canvas'); cv.width = z.w; cv.height = z.h;
    const g = cv.getContext('2d'), im = g.createImageData(z.w, z.h), d = im.data;
    for (let y = 0; y < z.h; y++) for (let x = 0; x < z.w; x++) {
      const col = G.Minimap.colorAt(x + z.x0, y + z.y0), o = (y * z.w + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    terrCache = { k, cv };
    return cv;
  }
  function openMap() {
    const z = G.World.zone, c = cur();
    if (!c || mapOpen || pickOpen() || typeof document === 'undefined') return false;
    mountUI();
    mapOpen = true;
    mapPaused = G.Game.state === 'playing' && !(G.Coop && G.Coop.active);
    if (mapPaused) G.Game.choiceStart();
    renderMap(z, c);
    mapEl.classList.remove('hidden');
    tipOnce('map');
    return true;
  }
  function closeMap() {
    if (!mapOpen) { if (mapEl) mapEl.classList.add('hidden'); return; }
    mapOpen = false;
    if (mapEl) mapEl.classList.add('hidden');
    if (mapPaused) { mapPaused = false; G.Game.choiceEnd(); }
  }
  function renderMap(z, c) {
    const cv = mapEl.querySelector('#xmap-cv'), PX = 4, W = z.w * PX, H = z.h * PX;
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(terrainImage(z), 0, 0, W, H);
    // the fog: unexplored tiles all but black
    const f = fogFor(z);
    g.fillStyle = 'rgba(8,13,28,.93)';
    for (let y = 0; y < z.h; y++) {
      let run = -1;
      for (let x = 0; x <= z.w; x++) {
        const dark = x < z.w && !f.a[y * z.w + x];
        if (dark && run < 0) run = x;
        else if (!dark && run >= 0) { g.fillRect(run * PX, y * PX, (x - run) * PX, PX); run = -1; }
      }
    }
    const at = (wx, wy) => [(wx / TS() - z.x0) * PX, (wy / TS() - z.y0) * PX];
    const counts = {}, p = viewer();
    for (const o of c.lay.objs) {
      const kind = shownKind(o, c);
      if (!kind || !found(o, p)) continue;
      const used = c.st[o.i] === USED, [mx, my] = at(o.x, o.y);
      mini(g, kind, mx, my, 1.6, used);
      const e = counts[kind] || (counts[kind] = { n: 0, used: 0 });
      e.n++; if (used) e.used++;
    }
    const si = C() && C().sitesOf(z), cl = C() && C().cur();
    if (si && explored(si.altar[0], si.altar[1])) { const [ax, ay] = at(...C().siteXY(si.altar)); mini(g, cl && cl.ph === 2 ? 'portal' : 'altar', ax, ay, 1.8); counts[cl && cl.ph === 2 ? 'portal' : 'altar'] = { n: 1, used: 0 }; }
    if (p) { const [px, py] = at(p.x, p.y); mini(g, 'you', px, py, 1.8); }
    g.strokeStyle = 'rgba(244,248,255,.6)'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
    // the legend: what's on this map
    const LBL = Object.assign({ you: 'Tú', altar: 'Altar del guardián', portal: 'Portal' }, NAME);
    const order = ['you', 'altar', 'portal'].concat(KINDS.slice(), ['great']);
    const rows = order.filter(kd => kd === 'you' || counts[kd]).map(kd => {
      const e = counts[kd] || { n: 1, used: 0 };
      return `<div class="xl-row" data-kind="${kd}"><canvas width="22" height="22" data-ico="${kd}"></canvas><span>${esc(T.t(LBL[kd]))}</span><b>${kd === 'you' || kd === 'altar' || kd === 'portal' ? '' : (e.n - e.used) + (e.used ? ` <i>(${e.used} ${esc(T.t('Usado'))})</i>` : '')}</b></div>`;
    }).join('');
    const pct = Math.round(f.n / (z.w * z.h) * 100);
    mapEl.querySelector('#xmap-legend').innerHTML = `<h4>${esc(T.t('Leyenda'))}</h4>${rows}<p class="xl-ex">${esc(F('Explorado: {x} %', pct))}</p>`;
    for (const k2 of mapEl.querySelectorAll('canvas[data-ico]')) { const g2 = k2.getContext('2d'); g2.clearRect(0, 0, 22, 22); mini(g2, k2.dataset.ico, 11, 11, 1.4); }
    mapEl.querySelector('#xmap-h').textContent = T.t('Mapa de la zona');
    mapInfo = { counts, pct, explored: f.n, rows: order.filter(kd => kd === 'you' || counts[kd]) };
  }

  // ---------------- the first-run tips (the Expedition save: tip.<kind>, once each) ----------------
  let tipEl = null, tipNow = null;
  function tipOnce(id) {
    if (!S || !TIP[id] || G.Game.state === 'watch') return false;
    const Sv = G.ExpSave;
    if (!Sv || Sv.get('tip.' + id) >= 1 || S.tipQ.includes(id) || (tipNow && tipNow.id === id)) return false;
    Sv.best('tip.' + id, 1); Sv.commit();
    S.tipQ.push(id); S.tipLog.push(id);
    if (!tipNow) nextTip();
    return true;
  }
  function nextTip() {
    const id = S && S.tipQ.shift();
    if (!id) { tipNow = null; hideTip(); return; }
    tipNow = { id, t: K.TIP_T };
    mountUI();
    if (!tipEl) return;
    tipEl.innerHTML = `<b>${esc(T.t('Consejo'))}</b>${esc(T.t(TIP[id]))}`;
    tipEl.dataset.tip = id;
    tipEl.classList.remove('hidden');
  }
  function hideTip() { if (tipEl) tipEl.classList.add('hidden'); }
  function tickTips(dt) { if (tipNow && (tipNow.t -= dt) <= 0) nextTip(); }

  // ---------------- the DOM ----------------
  const CSS = `
#scr-xeco .box { width: min(760px, 100%); }
#scr-xeco .cards { display: flex; flex-direction: column; gap: 8px; }
#scr-xeco .card.picked { opacity: .45; }
#scr-xeco .card.xpoor .xprice { color: #ff9aa4; }
#scr-xeco .xprice { display: inline-block; margin-top: 3px; font-size: 13px; font-weight: 800; color: #ffd23f; }
#scr-xeco .row { margin-top: 10px; justify-content: center; }
@media (max-height: 520px) { #scr-xeco .box > h2 { margin: 0 0 2px; font-size: 20px; } #scr-xeco .box > .sub { margin: 0 0 6px; font-size: 12px; }
  #scr-xeco .cards { gap: 5px; } #scr-xeco .card { padding-top: 5px; padding-bottom: 5px; } #scr-xeco .card .ds { font-size: 12px; line-height: 1.2; } #scr-xeco .card .nm { font-size: 15px; } #scr-xeco .row { margin-top: 6px; } }
#scr-xmap .box { width: auto; max-width: 100%; }
#scr-xmap .xmap-row { display: flex; gap: 14px; align-items: flex-start; justify-content: center; }
#xmap-cv { width: min(62vh, 56vw); height: min(62vh, 56vw); image-rendering: pixelated; border-radius: 8px; background: #080d1c; }
#xmap-legend { min-width: 170px; max-height: min(62vh, 56vw); overflow-y: auto; text-align: left; font-size: 13px; }
#xmap-legend h4 { margin: 0 0 6px; color: #ffd23f; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; }
#xmap-legend .xl-row { display: flex; align-items: center; gap: 6px; padding: 1px 0; color: #c9d4e4; }
#xmap-legend .xl-row b { margin-left: auto; color: #f4f8ff; } #xmap-legend .xl-row i { color: #8b97ab; font-weight: 400; }
#xmap-legend .xl-ex { margin: 8px 0 0; color: #9fb1c9; font-size: 12px; }
#scr-xmap .row { margin-top: 10px; justify-content: center; }
@media (max-height: 520px) { #scr-xmap { padding: 6px; } #scr-xmap .box { padding: 8px 12px; } #scr-xmap .box > h2 { margin: 0 0 4px; font-size: 18px; }
  #xmap-cv { width: min(70vh, 50vw); height: min(70vh, 50vw); } #xmap-legend { max-height: min(70vh, 50vw); font-size: 12px; min-width: 150px; } #scr-xmap .row { margin-top: 4px; } }
#xtip { position: fixed; left: 50%; top: 96px; transform: translateX(-50%); z-index: 7; width: max-content; max-width: min(440px, 46vw); pointer-events: none;
  background: rgba(10,16,32,.9); border: 2px solid #ffd23f; border-radius: 10px; padding: 7px 12px; font: 600 13px/1.3 system-ui, sans-serif; color: #f4f8ff; box-shadow: 0 4px 14px rgba(0,0,0,.4); }
#xtip.hidden { display: none; }
#xtip b { display: block; color: #ffd23f; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 2px; }
body.touch #xtip { top: 78px; font-size: 12px; max-width: min(360px, 40vw); padding: 5px 10px; }
#xtip.side, body.touch #xtip.side { transform: none; max-width: min(250px, 30vw); font-size: 11.5px; line-height: 1.25; }
`;
  let mounted = false, pauseBtn = null;
  function mountUI() {
    if (mounted || typeof document === 'undefined') return;
    const ref = document.getElementById('scr-item');
    if (!ref) return;
    mounted = true;
    const st = document.createElement('style'); st.id = 'exp-d7-style'; st.textContent = CSS; document.head.appendChild(st);
    pickEl = document.createElement('section'); pickEl.id = 'scr-xeco'; pickEl.className = 'scr dim hidden';
    pickEl.innerHTML = `<div class="box center"><h2 id="xeco-h"></h2><p class="sub" id="xeco-sub"></p><div id="xeco-cards" class="cards"></div>
      <div class="row"><button id="xeco-close" class="btn small ghost hidden" type="button" data-sfx="none"></button></div></div>`;
    ref.parentNode.appendChild(pickEl);
    pickEl.querySelector('#xeco-close').onclick = () => { if (pick && pick.cancel) { G.Audio.sfx('select'); closePick(); } };
    mapEl = document.createElement('section'); mapEl.id = 'scr-xmap'; mapEl.className = 'scr dim hidden';
    mapEl.innerHTML = `<div class="box center"><h2 id="xmap-h"></h2><div class="xmap-row"><canvas id="xmap-cv"></canvas><div id="xmap-legend"></div></div>
      <div class="row"><button id="xmap-close" class="btn small" type="button" data-sfx="none"></button></div></div>`;
    ref.parentNode.appendChild(mapEl);
    mapEl.querySelector('#xmap-close').onclick = () => { G.Audio.sfx('select'); closeMap(); };
    mapEl.querySelector('#xmap-close').textContent = T.t('Cerrar · M');
    tipEl = document.createElement('div'); tipEl.id = 'xtip'; tipEl.className = 'hidden'; document.body.appendChild(tipEl);
    // the pause screen's button (the pad's way to the map)
    const box = document.querySelector('#scr-pause .box');
    if (box) {
      pauseBtn = document.createElement('button');
      pauseBtn.id = 'pause-xmap'; pauseBtn.type = 'button'; pauseBtn.className = 'btn small ghost hidden'; pauseBtn.dataset.sfx = 'none';
      pauseBtn.onclick = () => { G.Audio.sfx('select'); openMap(); };
      box.insertBefore(pauseBtn, box.querySelector('.row') || null);
      new MutationObserver(syncPause).observe(document.getElementById('scr-pause'), { attributes: true, attributeFilter: ['class'] });
    }
    addEventListener('keydown', e => {
      if (pick) {
        const d = /^(Digit|Numpad)([1-9])$/.exec(e.code || '');
        if (d) { choose(+d[2] - 1); e.preventDefault(); }
        return;
      }
      if (e.code === 'KeyM' && !e.repeat) {
        if (mapOpen) { closeMap(); e.preventDefault(); }
        else if (S && G.Game.state === 'playing' && G.World.zone) { if (openMap()) e.preventDefault(); }
      }
    });
  }
  function syncPause() {
    if (!pauseBtn) return;
    const show = !!S && G.Modes.isExp() && !!cur();
    pauseBtn.classList.toggle('hidden', !show);
    if (show) pauseBtn.textContent = T.t('Mapa de la zona') + ' · M';
  }

  // ---------------- the end of the run (the Expedition save: counters, merged by max) ----------------
  function record() {
    const Sv = G.ExpSave;
    closePick(true); closeMap(); hideTip();
    if (!S || !Sv) return [];
    const L = S.log;
    if (S.earned) { Sv.bump('eco.earned', S.earned); Sv.best('eco.best', S.earned); }
    if (S.spent) Sv.bump('eco.spent', S.spent);
    for (const k of ['balls', 'shop', 'altars', 'freed', 'rocks', 'berries', 'ditto', 'hypno']) if (L[k]) Sv.bump('eco.' + k, L[k]);
    return [F('₽ {x} · Poké Balls {x} · Altares {x}', S.earned, L.balls, L.altars)];
  }

  return {
    K, KINDS, NAME, TIP, FRESH, USED, ACTIVE, GONE, READY,
    layoutOf, visitAt, ballCost, allowance, heatOf, heatMul, price, cageCost, rollOffers, shopPrices,
    begin, reset, mods, earn, spend, onKill, tick, buy, forget, choose, openPick, closePick, openMap, closeMap,
    oBlock, applyO, cur, drawGround, drawHud, tipRect, drawMini, mini, reveal, explored, found, record, syncPause,
    get run() { return S; }, get view() { return view; }, get pick() { return pick; }, get mapOpen() { return mapOpen; }, get mapInfo() { return mapInfo; },
    get fog() { return fog; }, get tip() { return tipNow ? tipNow.id : null; }, get tips() { return S ? S.tipLog.slice() : []; }, get miniDrawn() { return miniDrawn; }, get miniRect() { return miniRect; },
    /** For tests: the zone's state (host). */
    get zone() { return S ? S.z : null; }
  };
})();
