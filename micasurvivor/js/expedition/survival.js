'use strict';
/* ============ expedition/survival.js — Expedition · Survival (MicaSurvivor DLC D11, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it, and every entry point acts
 * only in a Survival run (G.Modes.is('exp-survival')) or draws an Expedition zone that a Survival snapshot describes.
 * Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 1 ("Run: Survival"), 2.8 (siege), 2.12 (the score), 5.3 and the D11 row.
 * Every number is in K (README "DLC D11").
 *
 * An ENDLESS run on one map. Classic's engine (js/expedition/classic.js: the spawner, the trickle, the events, the bosses
 * from your DPS) runs it with S.surv set; this file drives what is Survival's own:
 *   milestones   a boss every 5:00 (MILE_S); every 3rd a LEGENDARY (the map's: Mew, then a bird, ...), and at 45:00 MEWTWO
 *                (it doesn't end the run). Each milestone boss down: every player chooses a PACT
 *   phases       at 12:00 and 24:00 the enemies move to the next band (middle, then final stages) and grow tougher
 *   timeline     every 5:00 segment brings an alpha, a swarm or stampede, a flock, an elite wave, a rock slide, a totem
 *                (every 2nd) and a summoner (every 3rd), bigger as the segments go (seeded: segPlan is pure)
 *   wounds       "Deep wounds" from 30:00: every heal is worth WOUND_RATE less a minute (to WOUND_MIN)
 *   night        "Endless Night" from 45:00: each new enemy has NIGHT_HP more HP and NIGHT_DMG more damage a minute,
 *                and the screen darkens round the players
 *   pacts        9 boon / bane pacts (PACTS): 3 offered after each milestone boss (seeded), one taken or none. Boons are
 *                the player's own stats (items.js total); banes are the player's own or the team's (the host reads every
 *                player's row: foeK)
 *   siege        from 5:00, staying within SIEGE_R of one spot for SIEGE_T s starts a SIEGE: your damage falls toward
 *                SIEGE_MIN and flocks of fliers hunt you (study 2.8; the radius halved like D7's)
 *   migration    at 11:00 (and every 11:00 after) a migration portal opens at the land's portal site for PORTAL_OPEN s:
 *                step in and the run moves to new lands (the next zone's terrain and its fresh interactables)
 *   hazards      hostile terrain on every land (pure from its grids: hazardsOf): mud slows, quicksand slows and pulls,
 *                brambles cut you while you move, burning ground burns; more kinds wake with the phases. A hop clears them
 *
 * Score (study 2.12, Survival; + D9's catch term): (2 KOs + 4 s + damage / 200 + 800 bosses + 2,000 legendaries + 400 a
 * catch) x (1 + 0.5 tier). The server recomputes it (server/mp.mjs msurvExpSurvScore) for its board
 * runboard:micasurvivor_expedition:<map>:<diff>:survival.
 *
 * Sync: the host's state is the `x` block's `s` [milestones, bosses down, legendaries down, land, portal s left, Mewtwo
 * down, pacts seq]; each player's own row is `v` [pacts, siege %] (v.p the watched / sending player's, v.q the others').
 * Wounds, night, phases and the hazards follow the run's clock and the land's grids, so every viewer computes them.
 */
G.ExpEN = Object.assign(G.ExpEN || {}, {
  '— Tierra {x} · {x} —': '— Land {x} · {x} —',
  '¡Jefe de hito: {x}!': 'Milestone boss: {x}!', '¡Legendario de hito: {x}!': 'Legendary milestone: {x}!',
  '¡MEWTWO DESPIERTA! La medianoche ha llegado': 'MEWTWO AWAKENS! Midnight has come',
  '¡{x} derrotado! Elige un pacto': '{x} defeated! Choose a pact',
  'Fase {x}: el bosque se agita': 'Phase {x}: the forest stirs', 'Fase {x}: lo peor del bosque': 'Phase {x}: the worst of the forest',
  'Heridas profundas: curarte cada vez cuesta más': 'Deep wounds: healing gets harder every minute',
  'Noche sin fin: cada minuto, enemigos más fuertes': 'Endless Night: stronger enemies every minute',
  '¡Asedio! Muévete o te cazarán': 'Siege! Keep moving or they will hunt you',
  'El asedio se levanta': 'The siege lifts', '¡Una bandada te caza!': 'A flock hunts you!',
  '¡Un portal de migración se abre! Entra para viajar a tierras nuevas': 'A migration portal opens! Step in to travel to new lands',
  'El portal de migración se cierra': 'The migration portal closes',
  'SUPERVIVENCIA': 'SURVIVAL', 'FASE {x}': 'PHASE {x}', 'JEFE EN {x}': 'BOSS IN {x}', 'LEGENDARIO EN {x}': 'LEGENDARY IN {x}', 'MEWTWO EN {x}': 'MEWTWO IN {x}',
  'NOCHE ×{x}': 'NIGHT ×{x}', 'HERIDAS −{x} %': 'WOUNDS −{x}%', 'PORTAL {x} s': 'PORTAL {x} s', 'ASEDIO': 'SIEGE',
  'ASEDIO · DAÑO {x} %': 'SIEGE · DAMAGE {x}%', 'MUÉVETE': 'KEEP MOVING',
  'Un pacto: un don a cambio de un precio': 'A pact: a boon for a price', 'Hito {x} · elige 1 de {x}': 'Milestone {x} · choose 1 of {x}',
  'Sin pacto': 'No pact', 'Pacto sellado: {x}': 'Pact sealed: {x}',
  'Aguantaste {x}': 'Survived {x}', 'Jefes de hito: {x} ({x} legendarios)': 'Milestone bosses: {x} ({x} legendary)',
  '¡Mewtwo derrotado!': 'Mewtwo defeated!', 'Pactos: {x}': 'Pacts: {x}', '¡Nuevo récord de Supervivencia!': 'New Survival record!',
  'Tierras visitadas: {x}': 'Lands visited: {x}', 'Supervivencia · {x} · {x}': 'Survival · {x} · {x}',
  'Barro': 'Mud', 'Zarzas': 'Brambles', 'Arenas movedizas': 'Quicksand', 'Suelo ardiente': 'Burning ground',
  // the pacts
  'Cañón de cristal': 'Glass Cannon', '+25 % de daño · −30 de vida máxima': '+25% damage · −30 max HP',
  'Piel de hierro': 'Iron Hide', '+8 de armadura · −10 % de velocidad': '+8 armor · −10% speed',
  'Frenesí': 'Frenzy', '+15 % de velocidad de ataque y +8 % de velocidad · enemigos +15 % de daño': '+15% attack speed and +8% speed · enemies +15% damage',
  'Codicia': 'Greed', '+50 % de ₽ y +10 de suerte · enemigos +15 % de vida': '+50% ₽ and +10 luck · enemies +15% HP',
  'Horda': 'Horde', '+30 % de experiencia · +25 % de enemigos': '+30% XP · +25% more enemies',
  'Vampiro': 'Vampire', '+4 % de robo de vida · −1 de vida por segundo': '+4% lifesteal · −1 HP per second',
  'Cazador': 'Hunter', '+30 % de daño a jefes · jefes de hito +25 % de vida': '+30% damage to bosses · milestone bosses +25% HP',
  'Titán': 'Titan', '+60 de vida máxima y +4 de armadura · −12 % de daño': '+60 max HP and +4 armor · −12% damage',
  'Erudito': 'Scholar', '+25 % de radio de recogida y +6 % de crítico · +6 % de élites': '+25% pickup range and +6% crit · +6% elites'
});
G.I18n.add(G.ExpEN);

G.ExpSurv = (() => {
  const T = G.I18n;
  const F = (es, ...v) => { const en = T.lang === 'en' && G.ExpEN[es]; let i = 0; return en ? en.replace(/\{x\}/g, () => v[i++]) : T.f(es, ...v); };
  const C = () => G.ExpClassic, EC = () => G.ExpEco, IT = () => G.ExpItems, CP = () => G.ExpCap;
  // ---------------- balance (tune here; README "DLC D11") ----------------
  const K = {
    MILE_S: 300,                 // a milestone boss every 5:00 (study: "a milestone boss every 5 min")
    LEGEND_EVERY: 3,             // ... every 3rd a legendary
    MEWTWO_AT: 2700, MEWTWO: 150, MEWTWO_TARGET: 90,   // Mewtwo at 45:00 (the 9th milestone): a 90 s fight from your DPS
    MILE_TARGET: [40, 50, 60], LEGEND_TARGET: 60,      // the bosses' target times by phase (D3's), legendaries 60 s
    MILE_HP: 0.06,               // + 6 % boss HP a milestone (on top of the DPS target and the curve)
    PHASES: [720, 1440],         // the phases at 12:00 and 24:00 (study)
    WOUNDS_AT: 1800, WOUND_RATE: 0.04, WOUND_MIN: 0.2,   // from 30:00 every heal x(1 - 0.04 a minute), down to x0.2
    NIGHT_AT: 2700, NIGHT_HP: 0.12, NIGHT_DMG: 0.06, NIGHT_DARK: 0.55,   // from 45:00, per minute, on each new enemy
    SIEGE_FROM: 300, SIEGE_R: 6, SIEGE_T: 20, SIEGE_MIN: 0.3, SIEGE_FALL: 0.07, SIEGE_RISE: 0.5,   // R in metres (32 px)
    SIEGE_FLOCK: 8, SIEGE_N: 5,  // a flock of 5 fliers every 8 s while you are under siege
    MIGRATE_AT: 660, MIGRATE_EVERY: 660, PORTAL_OPEN: 90,   // the migration portal: 11:00, then every 11:00; open 90 s
    HAZ_N: 16, HAZ_R: [1.6, 2.8], HAZ_GAP: 7, HAZ_SPAWN: 9,   // hazards a land, their radius (tiles), spacing, clear of the spawn
    MUD: 0.6, QUICK: 0.5, QUICK_PULL: 30, BRAMBLE: 0.03, BURN: 0.05,   // slows, the pull (px/s), damage (x max HP a second)
    SEG_GROW: 0.15, SEG_MAX: 3,  // the timeline's events grow +15 % a segment, to x3
    // the score (study 2.12, Survival; + D9's catch term and the tier's x(1 + 0.5 tier)); = server/mp.mjs MSURV_EXP_SURV_SCORE
    SCORE: { KO: 2, SEC: 4, DMG: 200, BOSS: 800, LEGEND: 2000, CATCH: 400, TIER: 0.5 },
    // the legendary milestones in order (the map's own, then the others), then Mewtwo at 45. (D12: Mt. Moon's own is the moon's
    // Clefable, its shrine boss, then the birds; Cerulean Cape's Zapdos, then the other two birds and Mew)
    LEGENDS: { viridian: [151, 145, 144, 146], mtmoon: [36, 144, 146, 145], cerulean: [145, 144, 146, 151] }
  };
  // (each pact's picture: the overworld's item pictures, no new art)
  const PACT_ICON = { glass: 'life_orb', iron: 'hard_stone', frenzy: 'quick_claw', greed: 'amulet_coin', horde: 'lucky_egg', vampire: 'shell_bell', hunter: 'razor_claw', titan: 'focus_band', scholar: 'scope_lens' };
  // the 9 pacts: [id, name, text, boons {stat: v}, banes {stat: v} (the player's own), team banes {hp, dmg, rate, boss, elite}]
  const PACTS = [
    ['glass', 'Cañón de cristal', '+25 % de daño · −30 de vida máxima', { dmg: 0.25 }, { hp: -30 }, null],
    ['iron', 'Piel de hierro', '+8 de armadura · −10 % de velocidad', { armor: 8 }, { spd: -0.10 }, null],
    ['frenzy', 'Frenesí', '+15 % de velocidad de ataque y +8 % de velocidad · enemigos +15 % de daño', { atkspd: 0.15, spd: 0.08 }, null, { dmg: 0.15 }],
    ['greed', 'Codicia', '+50 % de ₽ y +10 de suerte · enemigos +15 % de vida', { coin: 0.5, luck: 10 }, null, { hp: 0.15 }],
    ['horde', 'Horda', '+30 % de experiencia · +25 % de enemigos', { xp: 0.3 }, null, { rate: 0.25 }],
    ['vampire', 'Vampiro', '+4 % de robo de vida · −1 de vida por segundo', { steal: 0.04 }, { regen: -1 }, null],
    ['hunter', 'Cazador', '+30 % de daño a jefes · jefes de hito +25 % de vida', { boss: 0.3 }, null, { boss: 0.25 }],
    ['titan', 'Titán', '+60 de vida máxima y +4 de armadura · −12 % de daño', { hp: 60, armor: 4 }, { dmg: -0.12 }, null],
    ['scholar', 'Erudito', '+25 % de radio de recogida y +6 % de crítico · +6 % de élites', { magnet: 0.25, crit: 0.06 }, null, { elite: 0.06 }]
  ].map(([id, name, text, boon, bane, team], i) => ({ id, code: String.fromCharCode(97 + i), name, text, boon, bane: bane || {}, team: team || {}, icon: PACT_ICON[id] }));
  const PACT_BY = {}, PACT_CODE = {};
  for (const p of PACTS) { PACT_BY[p.id] = p; PACT_CODE[p.code] = p; }
  const HAZ = [['mud', 'Barro', 0, '#7a5a34'], ['brambles', 'Zarzas', 1, '#3f7a3a'], ['quicksand', 'Arenas movedizas', 1, '#d9b56a'], ['burning', 'Suelo ardiente', 2, '#ff6a2a']]
    .map(([id, name, phase, col], i) => ({ id, i, name, phase, col }));
  // DLC D12: each map's hazard colours (the same four hazards and rules; only the look): [fill, detail, rim] by hazard. Viridian
  // keeps D11's. Mt. Moon: grey gravel, violet crystal shards, dark scree, moon-fire; Cerulean Cape: tidal mud, coral, wet sand,
  // live sparks.
  const HAZ_D11 = { mud: ['#7a5a34', '#5a4026', 'rgba(0,0,0,.35)'], brambles: ['#3f7a3a', '#1f4a1c', 'rgba(0,0,0,.35)'], quicksand: ['#d9b56a', '#a8833f', 'rgba(0,0,0,.35)'], burning: ['#ff6a2a', '#ffe08a|#ff8a3d', '#ffd06a'] };
  const HAZ_PAL = {
    viridian: HAZ_D11,
    mtmoon: { mud: ['#6b6470', '#45404c', 'rgba(0,0,0,.4)'], brambles: ['#7a5ac0', '#d8c8ff', 'rgba(20,0,40,.45)'], quicksand: ['#8c8478', '#5e574e', 'rgba(0,0,0,.4)'], burning: ['#9a4fff', '#f0d8ff|#c88aff', '#e0c0ff'] },
    cerulean: { mud: ['#5e7a80', '#3b5258', 'rgba(0,0,0,.3)'], brambles: ['#d0607a', '#ffd0dc', 'rgba(80,0,20,.4)'], quicksand: ['#e2cd96', '#b89a5a', 'rgba(0,0,0,.3)'], burning: ['#e8c020', '#fff6c0|#ffd23f', '#fff6c0'] }
  };
  /** The colours of hazard `kind` on `map`: [fill, detail (two for the flicker: 'a|b'), rim]. */
  const hazPal = (map, kind) => (HAZ_PAL[map] || HAZ_D11)[kind] || HAZ_D11[kind];

  // ---------------- seeded helpers ----------------
  function mix(...vals) {
    let h = 0x9E3779B9 | 0;
    for (const v of vals) { h ^= v | 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16; }
    return h >>> 0;
  }
  const R = s => G.DLC.rng(s);
  const mapIdx = m => ['viridian', 'mtmoon', 'cerulean'].indexOf(m) + 1;
  const pickR = (rng, a) => a[Math.min(a.length - 1, Math.floor(rng() * a.length))];
  const intR = (rng, a, b) => a + Math.min(b - a, Math.floor(rng() * (b - a + 1)));
  const strHash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; };
  const TS = () => G.World.TS;
  const now = () => (G.Game.st ? G.Game.st.time : 0);
  const name = d => (G.DEX_BY[d] ? G.I18n.t(G.DEX_BY[d].name) : '#' + d);   // (D13: the English name where it differs)
  const mmss = s => G.U.mmss(Math.max(0, s));

  // ---------------- the clock's rules (pure: every viewer computes them from the run's time) ----------------
  /** The phase at run time t: 0 (to 12:00), 1 (to 24:00), 2. */
  const phaseOf = t => (t >= K.PHASES[1] ? 2 : t >= K.PHASES[0] ? 1 : 0);
  /** Deep wounds: what a heal is worth at t (1 before 30:00). */
  const woundK = t => (t < K.WOUNDS_AT ? 1 : Math.max(K.WOUND_MIN, 1 - K.WOUND_RATE * (t - K.WOUNDS_AT) / 60));
  /** Endless Night at t: {hp, dmg} multipliers of a new enemy (x1 before 45:00) and the darkness 0-1. */
  function nightOf(t) {
    if (t < K.NIGHT_AT) return { hp: 1, dmg: 1, dark: 0 };
    const m = (t - K.NIGHT_AT) / 60;
    return { hp: 1 + K.NIGHT_HP * m, dmg: 1 + K.NIGHT_DMG * m, dark: Math.min(K.NIGHT_DARK, 0.25 + 0.03 * m) };
  }
  /** Milestone n (1, 2, ...): {n, at, legend, mewtwo, dex} for map. Pure. */
  function milestone(n, map, seed) {
    const at = n * K.MILE_S, legend = n % K.LEGEND_EVERY === 0, mewtwo = at === K.MEWTWO_AT;
    let dex;
    if (mewtwo) dex = K.MEWTWO;
    else if (legend) {
      // (the 1st legendary is the map's own (Mew), the 2nd one of the others (the birds), the 3rd is Mewtwo at 45:00 (above);
      //  then a seeded one of them all, Mewtwo included)
      const L = K.LEGENDS[map] || K.LEGENDS.viridian, k = n / K.LEGEND_EVERY - 1, rng = R(mix(seed | 0, mapIdx(map), n, 0x1E6));
      dex = k === 0 ? L[0] : k === 1 ? pickR(rng, L.slice(1)) : pickR(rng, L.concat([K.MEWTWO]));
    } else {
      const M = C() ? C().MAPS[map] || C().MAPS.viridian : null, zi = phaseOf(at - 1);
      dex = M ? pickR(R(mix(seed | 0, mapIdx(map), n, 0x6A2)), M.guardians[zi]) : 15;
    }
    return { n, at, legend, mewtwo, dex };
  }
  /**
   * The timeline of segment g (run time g*300 .. g*300+300): plan()-shaped events {at (run time), kind, n, dex, seed}. Pure:
   * the run's seed, the map, the segment, the tier. The species come from the phase's cards (G.ExpClassic.plan).
   */
  function segPlan(seed, map, g, diff = 'normal') {
    const Cl = C();
    if (!Cl) return [];
    const t0 = g * K.MILE_S, zi = phaseOf(t0 + 150), M = Cl.MAPS[map] || Cl.MAPS.viridian, TR = Cl.tierOf(diff);
    const cards = Cl.plan(seed, map, zi + 1, diff).cards, early = cards.slice(0, Math.min(cards.length, 8));
    const rng = R(mix(seed | 0, mapIdx(map), g, 0x5E6)), zk = Math.min(K.SEG_MAX, 1 + K.SEG_GROW * g) * (1 + 0.2 * zi);
    const tl = [[intR(rng, 40, 80), 'alpha'], [intR(rng, 95, 135), rng() < 0.5 ? 'swarm' : 'stampede'], [intR(rng, 150, 190), 'flock'],
      [intR(rng, 200, 225), 'elite'], [intR(rng, 235, 270), 'rockslide']];
    if (g % 2 === 1) tl.push([intR(rng, 100, 160), 'totem']);
    if (g % 3 === 2) tl.push([intR(rng, 160, 220), 'summoner']);
    const ev = tl.map(([at, kind], i) => {
      let n = 1, dex = [];
      if (kind === 'alpha') dex = [pickR(rng, cards.slice(0, Math.min(cards.length, 10)))];
      else if (kind === 'swarm') { n = Math.round(intR(rng, 24, 40) * zk); dex = [pickR(rng, early), pickR(rng, early)]; }
      else if (kind === 'stampede') { n = Math.round(intR(rng, 16, 26) * zk); dex = [pickR(rng, M.stampede[zi])]; }
      else if (kind === 'flock') { n = Math.round(intR(rng, 10, 16) * zk); dex = [pickR(rng, M.flock[zi])]; }
      else if (kind === 'rockslide') n = Cl.K.ROCKS;
      else if (kind === 'elite') { n = Math.round((5 + 2 * zi) * Math.min(2, zk)); dex = [pickR(rng, early), pickR(rng, early)]; }
      else if (kind === 'totem') dex = [pickR(rng, M.totem[zi])];
      else if (kind === 'summoner') dex = [pickR(rng, M.summoner[zi])];
      if (TR.event !== 1 && n > 1) n = Math.round(n * TR.event);
      return { at: t0 + Math.max(20, at - TR.early), kind, n, dex, seed: Math.floor(rng() * 4294967296) >>> 0, i };
    });
    // (DLC D20, its own stream, after the segment's draws: phase 3 adds a rarity-5 elite pack; from phase 2 a legendary may roam)
    const rd = R(mix(seed | 0, mapIdx(map), g, 0xD20)), CK = Cl.K, r5 = Cl.rare5 ? Cl.rare5() : [], rl = Cl.roamers ? Cl.roamers(map) : [];
    if (zi === 2 && r5.length) ev.push({ at: t0 + intR(rd, 60, 240), kind: 'elite', n: Math.round(CK.RARE5_N * Math.min(2, zk)), dex: [pickR(rd, r5), pickR(rd, r5)], seed: Math.floor(rd() * 4294967296) >>> 0, i: 90, rare: 1 });
    if (zi >= 1 && rl.length && rd() < CK.ROAM_P) ev.push({ at: t0 + intR(rd, 30, 270), kind: 'roam', n: 1, dex: [pickR(rd, rl)], seed: Math.floor(rd() * 4294967296) >>> 0, i: 91 });
    ev.sort((a, b) => a.at - b.at || a.i - b.i);
    ev.forEach(e => { delete e.i; });
    return ev;
  }

  // ---------------- the hostile terrain (pure from a land's grids) ----------------
  function flat3(z, tx, ty) {
    const h = z.height(tx, ty);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, y = ty + dy;
      if (!z.inside(x, y) || z.terr(x, y) !== 0 || z.height(x, y) !== h || z.rampDir(x, y) || z.propAt(x, y) || z.padAt(x, y)) return false;
    }
    return true;
  }
  /** A land's hazards: [{x, y, r (px), kind}] (every viewer places the same). Cached on the zone. */
  function hazardsOf(z) {
    if (!z || !z.map || !(z.zone >= 1 && z.zone <= 3)) return [];
    if (z.xhaz && z.xhaz.h === z.hash) return z.xhaz.v;
    const rng = R(mix(z.seed | 0, mapIdx(z.map), z.zone | 0, 0x4A2)), cand = [], tsz = TS();
    const si = C() ? C().sitesOf(z) : null, alt = si ? si.altar : [1e9, 1e9];
    for (let y = 2; y < z.h - 2; y += 2) for (let x = 2; x < z.w - 2; x += 2) {
      const tx = x + z.x0, ty = y + z.y0;
      if (Math.hypot(tx, ty) < K.HAZ_SPAWN || Math.hypot(tx - alt[0], ty - alt[1]) < 5) continue;
      if (flat3(z, tx, ty)) cand.push([tx, ty]);
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    const out = [];
    for (const [tx, ty] of cand) {
      if (out.length >= K.HAZ_N) break;
      if (out.some(o => Math.hypot(o.tx - tx, o.ty - ty) < K.HAZ_GAP)) continue;
      const kind = HAZ[out.length % HAZ.length];
      out.push({ tx, ty, x: (tx + 0.5) * tsz, y: (ty + 0.5) * tsz, r: (K.HAZ_R[0] + rng() * (K.HAZ_R[1] - K.HAZ_R[0])) * tsz, kind: kind.id, k: kind.i, phase: kind.phase });
    }
    z.xhaz = { h: z.hash, v: out };
    return out;
  }
  /** The hazard under (x, y) at run time t (only those awake in its phase), or null. */
  function hazardAt(x, y, t) {
    const ph = phaseOf(t);
    for (const o of hazardsOf(G.World.zone)) if (o.phase <= ph && G.U.dist2(x, y, o.x, o.y) < o.r * o.r) return o;
    return null;
  }

  // ---------------- the run ----------------
  let S = null;        // this page's run (the host's state, or a guest's own: its pacts, siege; `view` holds the host's)
  let view = null;     // the host's `s` as a guest / viewer sees it
  const isSurv = () => !!(G.Modes && G.Modes.is && G.Modes.is('exp-survival'));
  const guest = () => !!(G.Coop && G.Coop.active && !G.Coop.isHost);
  const on = pl => !!(S && isSurv() && pl && pl === G.Game.player && !pl.remote);

  function begin(pl, cfg) {
    S = null; view = null; vstate.miles = -1; vstate.downs = -1;
    if (!pl || !isSurv()) return null;
    const seed = G.World.seed | 0;
    S = { seed, map: (cfg && cfg.map) || 'viridian', diff: (cfg && cfg.diff) || 'normal', guest: guest(),
          phase: 0, miles: 0, downs: 0, legends: 0, mewtwo: 0, land: 1, seg: -1, segEv: [], segN: 0, nextMig: K.MIGRATE_AT, portalUntil: 0,
          bosses: [], pacts: [], pactSeen: 0, pactOpen: false,
          siege: { ax: pl.x, ay: pl.y, t: 0, on: false, k: 1 }, others: new Map(), lastHp: pl.hp, lastMax: pl.maxHp, px: pl.x, py: pl.y, hazT: 0, hazTxt: 0,
          said: { wounds: false, night: false }, log: { lands: 1, pacts: [], sieges: 0, flocks: 0, bestPhase: 0 } };
    pl.xsv = row();
    return S;
  }
  function reset() { S = null; view = null; }
  const landOf = () => (S ? S.land : view ? view.land : 1);

  // ---------------- the host: milestones, phases, the timeline, migration, siege flocks ----------------
  /** classic.js update, a Survival run on the host (every step). */
  function update(dt, players, t, alive) {
    if (!S || S.guest) return;
    const Cl = C(), run = Cl && Cl.run;
    if (!run) return;
    // the phases
    const ph = phaseOf(t);
    if (ph !== S.phase) {
      S.phase = ph; S.log.bestPhase = Math.max(S.log.bestPhase, ph);
      Cl.setPhase(ph, t);
      G.Spawner.say(F(ph === 1 ? 'Fase {x}: el bosque se agita' : 'Fase {x}: lo peor del bosque', ph + 1), 3.4);
      G.Audio.sfx('surge'); G.Camera.kick(0.5);
    }
    if (!S.said.wounds && t >= K.WOUNDS_AT) { S.said.wounds = true; G.Spawner.say(F('Heridas profundas: curarte cada vez cuesta más'), 3.4); }
    if (!S.said.night && t >= K.NIGHT_AT) { S.said.night = true; G.Spawner.say(F('Noche sin fin: cada minuto, enemigos más fuertes'), 3.4); }
    // the segment's timeline
    const g = Math.floor(t / K.MILE_S);
    if (g !== S.seg) { S.seg = g; S.segEv = segPlan(S.seed, S.map, g, S.diff); S.segN = 0; }
    const live = alive.length ? alive : players;
    while (S.segN < S.segEv.length && t >= S.segEv[S.segN].at) Cl.fireEvent(S.segEv[S.segN++], live);
    // milestones
    while (t >= (S.miles + 1) * K.MILE_S) { S.miles++; spawnMile(milestone(S.miles, S.map, S.seed), t, live); }
    tickBosses(t);
    // the migration portal (it waits while a milestone boss is up: the portal empties the land)
    if (run.ph === 2 && t >= S.portalUntil) { run.ph = 0; run.portalT = 0; S.nextMig = t + K.MIGRATE_EVERY - K.PORTAL_OPEN; G.Spawner.say(F('El portal de migración se cierra'), 2.4); }
    else if (run.ph !== 2 && t >= S.nextMig && !S.bosses.length) {
      run.ph = 2; run.portalT = 0; S.portalUntil = t + K.PORTAL_OPEN;
      G.Spawner.say(F('¡Un portal de migración se abre! Entra para viajar a tierras nuevas'), 3.6); G.Audio.sfx('legend');
      const [ax, ay] = Cl.siteXY(run.sites.altar);
      G.FX.ring(ax, ay, 10, 180, '#b48aff', 0.8, 6);
    }
    // siege flocks: every player under siege (the host's own, and each guest's by its position)
    siegeFlocks(dt, t, players);
  }
  /** classic.js nextZone: the run steps through the portal into the next land. */
  function migrated(t) {
    if (!S) return;
    S.land++; S.log.lands++;
    S.nextMig = t + K.MIGRATE_EVERY; S.portalUntil = 0;
  }
  function spawnMile(m, t, alive) {
    const Cl = C(), p = alive[0] || G.Game.player;
    if (!p) return null;
    const rng = R(mix(S.seed, m.n, 0xB055)), a = rng() * 6.2832;
    let pt = Cl.spotNear(rng, p, a, true, G.Camera.outerRadius() * 0.6) || [p.x + Math.cos(a) * 200, p.y + Math.sin(a) * 150];
    const zone = Math.min(3, phaseOf(t) + 1), team = foeTeam();
    const target = m.mewtwo ? K.MEWTWO_TARGET : m.legend ? K.LEGEND_TARGET : K.MILE_TARGET[zone - 1];
    const { e } = Cl.makeBoss({ dex: m.dex, legend: m.legend, zone, x: pt[0], y: pt[1], target, hpK: (1 + K.MILE_HP * m.n) * (1 + team.boss) * nightOf(t).hp, dmgK: nightOf(t).dmg }, t, alive);
    e.xmile = m.n; e.xmew = m.mewtwo ? 1 : 0;
    Cl.escorts(Cl.tierOf(S.diff).escorts, pt[0], pt[1], t);
    S.bosses.push({ e, m, at: t });
    Cl.run.boss = e; Cl.run.exhSaid = false;
    G.Sprites.preload([m.dex], 8000);
    G.Spawner.say(m.mewtwo ? F('¡MEWTWO DESPIERTA! La medianoche ha llegado') : F(m.legend ? '¡Legendario de hito: {x}!' : '¡Jefe de hito: {x}!', name(m.dex)), 3.6);
    G.Camera.kick(m.legend ? 1.2 : 0.8); G.Audio.sfx('boss');
    G.FX.ring(pt[0], pt[1], 10, 220, m.legend ? '#ff9ed8' : '#ffd95e', 0.8, 6);
    return e;
  }
  function tickBosses(t) {
    const Cl = C();
    for (let i = S.bosses.length - 1; i >= 0; i--) {
      const b = S.bosses[i], e = b.e;
      if (e.dead || !G.EnemyMgr.get(e.id)) {
        S.bosses.splice(i, 1);
        if (!e.dead) continue;   // (gone some other way: no prize)
        const rec = Cl.run.bosses.find(x => x.dex === e.dex && x.down == null);
        if (rec) rec.down = Math.round((t - rec.at) * 10) / 10;
        S.downs++; if (b.m.legend) S.legends++; if (b.m.mewtwo) S.mewtwo++;
        G.Pickups.drop('item', e.x - 20, e.y, G.Items.roll());
        G.Pickups.drop('heal', e.x + 20, e.y, 0);
        if (b.m.legend) G.Pickups.drop('item', e.x, e.y + 20, G.Items.roll());
        G.Pickups.pullAll();
        G.Spawner.say(F('¡{x} derrotado! Elige un pacto', name(e.dex)), 3);
        G.Audio.sfx('legend'); G.Game.flash('#fff3c8', 0.5);
        if (Cl.run.boss === e) Cl.run.boss = null;
        continue;
      }
      const k = Cl.exhaustion(t - e.xborn, e.xtarget);
      e.takenK = k > 1 ? k : 0;
    }
    if (!Cl.run.boss && S.bosses.length) Cl.run.boss = S.bosses[S.bosses.length - 1].e;
  }
  /** The team's banes from every player's pacts (the host's own + each co-op player's row): {hp, dmg, rate, boss, elite}. */
  function foeTeam() {
    const out = { hp: 0, dmg: 0, rate: 0, boss: 0, elite: 0 };
    const add = code => { for (const ch of String(code || '')) { const p = PACT_CODE[ch]; if (p) for (const k in p.team) out[k] += p.team[k]; } };
    if (S) add(S.pacts.map(id => PACT_BY[id].code).join(''));
    if (G.Coop && G.Coop.active && G.Coop.isHost) for (const m of G.Coop.mates) if (m.connected && m.pl && m.pl.xsv) add(m.pl.xsv[0]);
    return out;
  }
  /** classic.js spawn / trickle: the night and the pacts on a new enemy at t: {hp, dmg, rate, elite}. */
  function foeK(t, kind) {
    const n = nightOf(t), tm = foeTeam();
    return { hp: n.hp * (1 + tm.hp), dmg: n.dmg * (1 + tm.dmg), rate: 1 + tm.rate, elite: tm.elite };
  }

  // ---------------- siege ----------------
  const SIEGE_PX = () => K.SIEGE_R * 32;
  /** One player's siege clock (pure step): s = {ax, ay, t, on}. -> true when it just started */
  function siegeStep(s, x, y, dt, t) {
    if (t < K.SIEGE_FROM || G.U.dist2(x, y, s.ax, s.ay) > SIEGE_PX() * SIEGE_PX()) { const was = s.on; s.ax = x; s.ay = y; s.t = 0; s.on = false; return was ? -1 : 0; }
    s.t += dt;
    if (!s.on && s.t >= K.SIEGE_T) { s.on = true; return 1; }
    return 0;
  }
  function siegeFlocks(dt, t, players) {
    const Cl = C(), run = Cl.run;
    for (const p of players) {
      if (!p || p.dead) continue;
      const key = p.remote ? p.uid || 'mate' : 'me';
      let s = S.others.get(key);
      if (!s) { s = { ax: p.x, ay: p.y, t: 0, on: false, cd: 1 }; S.others.set(key, s); }
      siegeStep(s, p.x, p.y, dt, t);
      if (!s.on) { s.cd = 1; continue; }
      if ((s.cd -= dt) > 0) continue;
      s.cd = K.SIEGE_FLOCK;
      const zi = run.zi, M = Cl.MAPS[S.map] || Cl.MAPS.viridian, rng = R(mix(S.seed, Math.floor(t * 10), strHash(key), 0x5146));
      const dex = pickR(rng, M.flock[zi]), a0 = rng() * 6.2832, R0 = G.Camera.outerRadius() * 0.9;
      for (let i = 0; i < K.SIEGE_N; i++) {
        const a = a0 + (rng() - 0.5) * 0.9, d = R0 + rng() * 60;
        const e = Cl.spawnFoe(dex, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.9, { spd: 1.25 });
        if (e) { e.flying = true; e.xsiege = 1; }
      }
      S.log.flocks++;
      if (!p.remote) G.Spawner.say(F('¡Una bandada te caza!'), 2.2, true);
    }
  }

  // ---------------- each player's own: wounds, hazards, siege, pacts (run.tick, the host and every guest) ----------------
  function tick(dt, pl) {
    if (!on(pl)) return;
    const t = now();
    // deep wounds: what this step healed is worth woundK (a max-HP gain, a revive and a zone change are left alone)
    const wk = woundK(t);
    if (wk < 1 && !pl.dead && S.lastHp > 0 && pl.hp > S.lastHp && pl.maxHp === S.lastMax) pl.hp = S.lastHp + (pl.hp - S.lastHp) * wk;
    // hostile terrain (a hop or a glide clears it)
    const moved = Math.hypot(pl.x - S.px, pl.y - S.py);
    const hz = !pl.dead && !pl.air && moved < 60 ? hazardAt(pl.x, pl.y, t) : null;
    if (hz) {
      if (hz.kind === 'mud' || hz.kind === 'quicksand') {
        const k = hz.kind === 'mud' ? K.MUD : K.QUICK;
        const nx = S.px + (pl.x - S.px) * k, ny = S.py + (pl.y - S.py) * k;
        if (G.World.isFree(nx, ny, pl.r || 12)) { pl.x = nx; pl.y = ny; }
        if (hz.kind === 'quicksand') {
          const d = Math.hypot(hz.x - pl.x, hz.y - pl.y);
          if (d > 4) { const qx = pl.x + (hz.x - pl.x) / d * K.QUICK_PULL * dt, qy = pl.y + (hz.y - pl.y) / d * K.QUICK_PULL * dt; if (G.World.isFree(qx, qy, pl.r || 12)) { pl.x = qx; pl.y = qy; } }
        }
      } else {
        const rate = hz.kind === 'burning' ? K.BURN : moved > 0.4 ? K.BRAMBLE : 0;
        if (rate > 0 && pl.invuln <= 0) {
          const d = pl.maxHp * rate * dt;
          pl.hp = Math.max(1, pl.hp - d);   // (hostile terrain bites, it never knocks you out)
          S.hazT += d;
          if ((S.hazTxt -= dt) <= 0 && S.hazT >= 1) { S.hazTxt = 0.6; G.FX.dmgText(pl.x, pl.y - (pl.bodyH || 30) - 4, '-' + Math.round(S.hazT), hz.kind === 'burning' ? '#ff8a3d' : '#7fd16a'); S.hazT = 0; }
        }
      }
    }
    S.px = pl.x; S.py = pl.y; S.lastHp = pl.hp; S.lastMax = pl.maxHp;
    // siege (this player's own clock: its damage)
    const sg = S.siege, ch = siegeStep(sg, pl.x, pl.y, dt, t);
    if (ch === 1) { G.Spawner.say(F('¡Asedio! Muévete o te cazarán'), 2.8, true); G.Audio.sfx('error'); S.log.sieges++; }
    else if (ch === -1) G.Spawner.say(F('El asedio se levanta'), 1.8, true);
    sg.k = sg.on ? Math.max(K.SIEGE_MIN, sg.k - K.SIEGE_FALL * dt) : Math.min(1, sg.k + K.SIEGE_RISE * dt);
    // pacts: one choice per milestone boss down (the host's count, or the one its `s` block says: idempotent)
    const downs = S.guest ? (view ? view.downs : 0) : S.downs;
    if (downs > S.pactSeen && !S.pactOpen && G.Game.state === 'playing' && !(EC() && EC().pick)) offerPact(pl, downs);
    pl.xsv = row();
  }
  /** combat.out: the siege's damage factor on your hits. */
  function out(k, pl) { return on(pl) && S.siege.k < 1 ? k * S.siege.k : k; }
  /** The run's pacts and siege: the player's row [pacts, siege %] (x block `v`). */
  const row = () => (S ? [S.pacts.map(id => PACT_BY[id].code).join(''), S.siege.on || S.siege.k < 1 ? Math.round((1 - S.siege.k) * 100) || 1 : 0] : null);

  // ---------------- pacts ----------------
  /** The 3 pacts offered after milestone boss n to a player (seeded by the run, n and who): ids. Pure for the same inputs. */
  function offerOf(seed, n, who, taken) {
    const pool = PACTS.map(p => p.id).filter(id => !taken.includes(id)), rng = R(mix(seed | 0, n, who | 0, 0x9AC7));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, 3);
  }
  const whoOf = () => strHash(String((G.Coop && G.Coop.active && G.Net && G.Net.uid) || 'solo'));
  function offerPact(pl, downs) {
    S.pactSeen++;
    const n = S.pactSeen, ids = offerOf(S.seed, n, whoOf(), S.pacts);
    if (!ids.length || !EC()) return;
    S.pactOpen = true;
    EC().openPick({ kind: 'pact', title: F('Un pacto: un don a cambio de un precio'), sub: F('Hito {x} · elige 1 de {x}', n, ids.length), picks: 1, cancel: 'Sin pacto',
      cards: ids.map(id => { const p = PACT_BY[id]; return { nm: T.t(p.name), ds: T.t(p.text), icon: IT() ? IT().icon(p.icon) : '', rar: 3 }; }),
      onPick: k => { S.pactOpen = false; take(pl, ids[k]); return true; },
      onCancel: () => { S.pactOpen = false; } });
    if (!(EC().pick && EC().pick.kind === 'pact')) S.pactOpen = false;   // (the screen couldn't open: try at the next milestone)
  }
  /** Seal pact id on player pl (its boons and banes from now on). -> true */
  function take(pl, id) {
    const p = PACT_BY[id];
    if (!S || !p || S.pacts.includes(id)) return false;
    S.pacts.push(id); S.log.pacts.push(id);
    if (IT()) IT().apply(pl);
    G.Spawner.say(F('Pacto sellado: {x}', T.t(p.name)), 2.6, true);
    G.Audio.sfx('legend');
    pl.xsv = row();
    return true;
  }
  /** items.js total(): the pacts' boons and banes on stat s of player pl (its own, or a viewer's puppet from its row). */
  function statOf(pl, s) {
    if (!pl) return 0;
    const codes = on(pl) ? S.pacts.map(id => PACT_BY[id].code).join('') : pl.xsv ? String(pl.xsv[0] || '') : '';
    let v = 0;
    for (const ch of codes) { const p = PACT_CODE[ch]; if (!p) continue; if (p.boon[s]) v += p.boon[s]; if (p.bane[s]) v += p.bane[s]; }
    return v;
  }

  // ---------------- the `x` block: `s` (the host's state) and `v` (each player's row) ----------------
  /** The host's `s`: [milestones, bosses down, legendaries down, land, portal s left, Mewtwo down, pacts seq]. */
  function sBlock() {
    if (!S || S.guest || !isSurv()) return null;
    const t = now(), run = C() && C().run;
    return [S.miles, S.downs, S.legends, S.land, run && run.ph === 2 ? Math.max(0, Math.ceil(S.portalUntil - t)) : 0, S.mewtwo, S.pactSeen];
  }
  const vstate = { miles: -1, downs: -1 };
  /** A viewer / guest: the host's `s` (null: none). */
  function applyS(s) {
    if (!Array.isArray(s)) { view = null; return; }
    const prev = view;
    view = { miles: s[0] | 0, downs: s[1] | 0, legends: s[2] | 0, land: s[3] | 0 || 1, portal: s[4] | 0, mewtwo: s[5] | 0 };
    // a spectator sees the milestone banners (a co-op guest already gets the host's)
    if (G.Game.state === 'watch' && prev) {
      if (view.miles > prev.miles) { const m = milestone(view.miles, (G.World.zone && G.World.zone.map) || 'viridian', G.World.seed); G.Spawner.say(m.mewtwo ? F('¡MEWTWO DESPIERTA! La medianoche ha llegado') : F(m.legend ? '¡Legendario de hito: {x}!' : '¡Jefe de hito: {x}!', name(m.dex)), 3, true); }
      else if (view.downs > prev.downs) G.Spawner.say(F('Pactos: {x}', view.downs), 2, true);
    }
  }
  /** A viewer / guest: a player's row on its puppet. */
  function applyRow(p, r) { if (p) p.xsv = Array.isArray(r) ? r : null; }

  // ---------------- the HUD (classic.js hudLine / drawHud) ----------------
  const cur = () => (S && !S.guest ? { miles: S.miles, downs: S.downs, land: S.land, portal: C() && C().run && C().run.ph === 2 ? Math.max(0, Math.ceil(S.portalUntil - now())) : 0 } : view);
  function hudLine(pl, st) {
    const t = st ? st.time : now(), v = cur() || { miles: 0 }, T2 = G.I18n;
    const parts = [F('SUPERVIVENCIA'), F('FASE {x}', phaseOf(t) + 1)];
    const diff = C() && C().run ? C().run.diff : (C() && C().view ? C().view.diff : 'normal');
    if (diff && diff !== 'normal') parts.push(T2.t(diff === 'hard' ? 'Difícil' : 'Pesadilla').toUpperCase());
    const m = milestone((v.miles | 0) + 1, (G.World.zone && G.World.zone.map) || 'viridian', G.World.seed | 0), left = mmss(m.at - t);
    parts.push(m.mewtwo ? F('MEWTWO EN {x}', left) : m.legend ? F('LEGENDARIO EN {x}', left) : F('JEFE EN {x}', left));
    if (v.portal > 0) parts.push(F('PORTAL {x} s', v.portal));
    const n = nightOf(t), wk = woundK(t);
    if (n.hp > 1) parts.push(F('NOCHE ×{x}', n.hp.toFixed(1)));
    else if (wk < 1) parts.push(F('HERIDAS −{x} %', Math.round((1 - wk) * 100)));
    if (pl) parts.push('₽ ' + Math.floor(pl.coins || 0));
    return parts.join('  ·  ');
  }
  const hudColor = () => { const t = now(); return t >= K.NIGHT_AT ? '#c9a6ff' : t >= K.WOUNDS_AT ? '#ff9aa4' : '#ffd23f'; };
  let siegeRect = null;
  /** Over the HUD: the siege warning with its damage factor. */
  function drawHud(ctx, w, h, pl, Fn, mark) {
    siegeRect = null;
    const watching = G.Game.state === 'watch';
    const r = S && !watching ? row() : pl && pl.xsv ? pl.xsv : null;
    if (!r || !(r[1] > 0)) return;
    const pct = 100 - r[1], beat = 0.5 + Math.sin(performance.now() / 160) * 0.5;
    const txt = new String(F('ASEDIO · DAÑO {x} %', pct) + '  ·  ' + F('MUÉVETE'));   // eslint-disable-line no-new-wrappers
    ctx.save(); ctx.textAlign = 'center'; ctx.font = Fn(800, 12);
    const tw = ctx.measureText(txt).width + 20, x = w / 2 - tw / 2, y = 104;
    G.HUD.roundRect(ctx, x, y - 13, tw, 20, 8); ctx.fillStyle = `rgba(90,10,20,${0.55 + beat * 0.25})`; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ff6b7a'; ctx.stroke();
    ctx.fillStyle = '#ffd0d4'; ctx.fillText(txt, w / 2, y + 2);
    ctx.restore();
    siegeRect = { x, y: y - 13, w: tw, h: 20 };
    if (mark) mark('xsiege', x, y - 13, tw, 20);
  }
  /** Over the scene (ultimates.js drawDim): the Endless Night, dark round the players. */
  function drawNight(ctx, w, h) {
    const zn = G.World.zone;
    if (!zn || !(isSurv() || (G.Game.state === 'watch' && view))) return;
    const n = nightOf(now());
    if (!(n.dark > 0)) return;
    ctx.save();
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.62);
    g.addColorStop(0, 'rgba(8,6,30,0)'); g.addColorStop(1, `rgba(8,6,30,${n.dark})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = n.dark * 0.35; ctx.fillStyle = '#0a0628'; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    nightDrawn++;
  }
  let nightDrawn = 0, hazDrawn = 0;
  /** Under the entities (classic.js drawGround): the hostile terrain awake in this phase. */
  function drawGround(ctx) {
    const zn = G.World.zone;
    if (!zn || !(isSurv() || (G.Game.state === 'watch' && view))) return;
    const t = now(), ph = phaseOf(t), cam = G.Camera, tt = performance.now() / 1000;
    for (const o of hazardsOf(zn)) {
      if (o.phase > ph || !cam.sees(o.x, o.y, o.r + 20)) continue;
      const P = hazPal(zn.map, o.kind), det = P[1].split('|');   // (D12: the map's colours)
      ctx.save();
      ctx.globalAlpha = 0.55; ctx.fillStyle = P[0];
      ctx.beginPath(); ctx.ellipse(o.x, o.y, o.r, o.r * 0.7, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.strokeStyle = P[2]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(o.x, o.y, o.r, o.r * 0.7, 0, 0, 6.2832); ctx.stroke();
      // texture: mud bubbles, thorns, sand swirls, embers
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39996 + (o.kind === 'quicksand' ? tt * 0.8 : 0), rr = o.r * (0.2 + 0.75 * ((i * 37) % 10) / 10);
        const x = o.x + Math.cos(a) * rr, y = o.y + Math.sin(a) * rr * 0.7;
        if (o.kind === 'mud') { ctx.fillStyle = det[0]; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, 6.2832); ctx.fill(); }
        else if (o.kind === 'brambles') { ctx.strokeStyle = det[0]; ctx.globalAlpha = 0.9; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 4, y + 3); ctx.lineTo(x, y - 4); ctx.lineTo(x + 4, y + 3); ctx.stroke(); }
        else if (o.kind === 'quicksand') { ctx.strokeStyle = det[0]; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(o.x, o.y, rr * 0.6, a, a + 1.2); ctx.stroke(); }
        else { ctx.fillStyle = Math.sin(tt * 6 + i) > 0 ? det[0] : det[1] || det[0]; ctx.globalAlpha = 0.9; ctx.fillRect(Math.round(x), Math.round(y - ((tt * 20 + i * 5) % 10)), 2, 2); }
      }
      ctx.restore();
      hazDrawn++;
    }
  }

  // ---------------- the end of the run ----------------
  /** The score's parts {kills, time, dmg, bosses, legends, catches, zone} (whole numbers: the server recomputes the score). */
  function scoreParts(sum) {
    const v = S && !S.guest ? S : view || { downs: 0, legends: 0 };
    return { kills: Math.floor(sum.kills || 0), time: Math.floor(sum.time || 0), dmg: Math.floor(G.DmgLog.summary([]).total || 0),
             bosses: v.downs | 0, legends: v.legends | 0, catches: CP() && CP().run ? CP().run.n | 0 : 0, zone: Math.min(3, phaseOf(sum.time || 0) + 1), won: false };
  }
  const tierIdx = d => Math.max(0, ['normal', 'hard', 'nightmare'].indexOf(d));
  /** The Survival score of parts p on tier diff (study 2.12 + the catch term, x the tier). Pure; = server msurvExpSurvScore. */
  function scoreOf(p, diff) {
    const Q = K.SCORE;
    return Math.floor((Q.KO * p.kills + Q.SEC * p.time + p.dmg / Q.DMG + Q.BOSS * p.bosses + Q.LEGEND * p.legends + Q.CATCH * p.catches) * (1 + Q.TIER * tierIdx(diff)));
  }
  const diffNow = () => (S && S.diff) || (G.Modes.run && G.Modes.run.diff) || 'normal';
  const score = sum => scoreOf(scoreParts(sum), diffNow());
  const bestKey = (map, diff) => 'surv.best.' + map + '.' + diff;
  /** The run-over screen's lines (read before the run is recorded, so a record is news). */
  function result() {
    if (!S) return null;
    const t = Math.floor(now()), v = S.guest ? view || { downs: 0, legends: 0, mewtwo: 0, land: 1 } : S, map = S.map, diff = S.diff;
    const DN = { normal: 'Normal', hard: 'Difícil', nightmare: 'Pesadilla' };
    const lines = [F('Supervivencia · {x} · {x}', T.t((C() && C().MAPS[map] ? C().MAPS[map].name : 'Bosque Verde')), T.t(DN[diff] || 'Normal')),
      F('Aguantaste {x}', mmss(t)) + ' · ' + F('FASE {x}', phaseOf(t) + 1).toLowerCase().replace(/^./, c => c.toUpperCase())];
    if (v.downs) lines.push(F('Jefes de hito: {x} ({x} legendarios)', v.downs, v.legends | 0));
    if (v.mewtwo) lines.push(F('¡Mewtwo derrotado!'));
    if (S.pacts.length) lines.push(F('Pactos: {x}', S.pacts.map(id => T.t(PACT_BY[id].name)).join(', ')));
    if ((v.land | 0) > 1) lines.push(F('Tierras visitadas: {x}', v.land));
    const best = G.ExpSave ? G.ExpSave.get(bestKey(map, diff)) : 0;
    if (t > best && t >= 60) lines.push(F('¡Nuevo récord de Supervivencia!'));
    return { won: false, title: null, lines, splits: null, zone: Math.min(3, phaseOf(t) + 1), map, diff };
  }
  /** The run into the Expedition save (counters only, max-merged / summed; never the base save). */
  function record() {
    const Sv = G.ExpSave;
    if (!S || !Sv) return;
    const t = Math.floor(now()), v = S.guest ? view || { downs: 0, legends: 0, mewtwo: 0, land: 1 } : S;
    Sv.best(bestKey(S.map, S.diff), t);
    Sv.best('surv.best', t);
    Sv.bump('surv.runs');
    if (v.downs) Sv.bump('surv.miles', v.downs);
    if (v.legends) Sv.bump('surv.legends', v.legends);
    if (v.mewtwo) Sv.bump('surv.mewtwo', v.mewtwo);
    if (S.pacts.length) Sv.bump('surv.pacts', S.pacts.length);
    if (S.log.lands > 1) Sv.bump('surv.lands', S.log.lands - 1);
    Sv.commit();
  }
  /** D10's task metrics of this run: Survival minutes and milestone bosses. */
  function metrics(sum) {
    const v = S ? (S.guest ? view || { downs: 0 } : S) : { downs: 0 };
    return { smins: (sum.time || 0) / 60, miles: v.downs | 0 };
  }

  return {
    K, PACTS, PACT_BY, HAZ, HAZ_PAL, hazPal, phaseOf, woundK, nightOf, milestone, segPlan, hazardsOf, hazardAt, offerOf, scoreOf, siegeStep,
    begin, reset, update, migrated, tick, out, row, take, statOf, foeK, foeTeam, sBlock, applyS, applyRow, landOf,
    hudLine, hudColor, drawHud, drawNight, drawGround, scoreParts, score, result, record, metrics,
    get run() { return S; }, get view() { return view; }, get nightDrawn() { return nightDrawn; }, get hazDrawn() { return hazDrawn; }, get siegeRect() { return siegeRect; }
  };
})();
