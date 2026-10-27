'use strict';
/* ============ expedition/classic.js — Expedition · Classic (MicaSurvivor DLC D3, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load(), js/systems/expedition.js); a base page never runs it,
 * and every entry point below is reached only from an Expedition run (G.Modes.isExp()) or an Expedition zone
 * (G.World.zone), which base modes never have. Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.7-2.10 / 5.3 and the D3 row.
 *
 * A Classic run is one MAP (D3: Viridian Forest) of 3 ZONES plus the legendary SHRINE (zone 4):
 *   zone n         a bounded seeded zone (G.ExpTerrain.generate, D1/D2), a 10:00 zone clock and a TIMELINE of events
 *                  (plan(): alphas, swarm, stampede, flock, rock slide, elite wave, totem, summoner) on top of a steady
 *                  trickle of the map's Pokémon (the zone's "cards": one more species every minute)
 *   guardian altar a stone circle placed from the zone's own grids (sitesOf): stand in it ALTAR_T s and the zone's
 *                  guardian wakes (one of 3 per zone, from the plan). Its HP comes from your measured DPS (bossHp)
 *   portal         opens on the altar when the guardian falls (and pulls in every pickup); stand in it PORTAL_T s and
 *                  the next zone starts: zone 3's portal leads to the shrine
 *   final swarm    at FINAL (10:00 of zone time) spawns go x6 and each new enemy's HP x4 / damage x2 per minute past it:
 *                  a soft timer (wake the guardian before it buries you)
 *   shrine         zone 4, hand-made (shrine()): stand on the pedestal and the map's legendary (Mew) appears; beating it
 *                  wins the map: the victory banner, then the run-over screen with the zone SPLITS against your best
 *   exhaustion     a guardian / legendary past its target time (40 / 50 / 60 s, the legendary 60 s) takes more and more
 *                  damage (takenK, read by Enemy.hurt), so a fight is never a 10-minute slog
 *
 * Determinism: every random choice of the timeline (which events, when, how many, which Pokémon, which guardian, where
 * the altar is) and of the trickle comes from G.DLC.rng streams seeded by the run's world seed + map + zone, never
 * Math.random. plan(seed, map, zone, diff) is pure: a co-op guest, a replay viewer and a spectator rebuild the same
 * plan (and the same altar) from the seed. What only the host knows travels in the `x` block's `c` part (xblockC /
 * applyC, js/expedition/core.js: x v3).
 *
 * Numbers live in K (balance; see micasurvivor/README.md "DLC D3"). Hooks for D4+ are noted where they belong.
 */
G.I18n.add({
  'Bosque Verde': 'Viridian Forest', 'Monte Moon': 'Mt. Moon', 'Cabo Celeste': 'Cerulean Cape',
  '¡Una bandada cruza la cueva!': 'A flock crosses the cave!', '¡Una bandada cruza el cabo!': 'A flock crosses the cape!',
  'Zona {x}': 'Zone {x}', 'Santuario': 'Shrine', 'Normal': 'Normal', 'Difícil': 'Hard', 'Pesadilla': 'Nightmare',
  '¡Un {x} alfa aparece!': 'An alpha {x} appears!',
  '¡Enjambre! Te rodean': 'Swarm! You are surrounded',
  '¡Estampida de {x}!': '{x} stampede!',
  '¡Una bandada cruza el bosque!': 'A flock crosses the forest!',
  '¡Avalancha! Sal de los círculos': 'Rock Slide! Get out of the circles',
  '¡Oleada de élite!': 'Elite wave!',
  '¡{x} dominante llama a los suyos!': 'Totem {x} calls its allies!',
  '¡{x} invocador!': 'Summoner {x}!',
  '¡Un {x} legendario merodea por la zona!': 'A legendary {x} roams the zone!', '¡{x} se ha marchado!': '{x} has left!',   // (DLC D20)
  '¡ENJAMBRE FINAL! Despierta al guardián': 'FINAL SWARM! Wake the guardian',
  '¡{x}, el guardián, despierta!': '{x}, the guardian, awakens!',
  '¡{x} está agotado!': '{x} is exhausted!',
  '¡El portal se abre! Entra en él': 'The portal opens! Step into it',
  '— Zona {x} · {x} —': '— Zone {x} · {x} —',
  '— Santuario de {x} —': '— Shrine of {x} —',
  '¡{x} aparece en el santuario!': '{x} appears at the shrine!',
  '¡EXPEDICIÓN COMPLETADA!': 'EXPEDITION COMPLETE!',
  'Busca el altar y despierta al guardián': 'Find the altar and wake the guardian',
  'ZONA {x}/3': 'ZONE {x}/3', 'SANTUARIO': 'SHRINE',
  'ENJAMBRE FINAL EN {x}': 'FINAL SWARM IN {x}', '¡ENJAMBRE FINAL!': 'FINAL SWARM!',
  'ALTAR {x} m': 'ALTAR {x} m', 'PORTAL {x} m': 'PORTAL {x} m', 'SANTUARIO {x} m': 'SHRINE {x} m',
  'GUARDIÁN': 'GUARDIAN', 'LEGENDARIO': 'LEGENDARY', '¡COMPLETADO!': 'COMPLETE!',
  'AGOTADO ×{x}': 'EXHAUSTED ×{x}', 'ALTAR': 'ALTAR', 'PORTAL': 'PORTAL',
  '¡Mapa completado!': 'Map complete!', 'Llegaste a la zona {x}': 'Reached zone {x}', 'Llegaste al santuario': 'Reached the shrine',
  '¡Nuevo récord del mapa!': 'New map record!', 'Tiempos parciales': 'Splits', 'Mejor': 'Best', 'Victoria': 'Victory'
});

G.ExpClassic = (() => {
  // ---------------- balance (tune here) ----------------
  const K = {
    FINAL: 600,                  // s of zone time before the final swarm (study 2.8: 10:00)
    SHIFT: [0, 20, 40],          // s every timeline event of zone 1 / 2 / 3 comes earlier ("later zones arrive earlier")
    ZMIN: [0, 240, 480],         // a zone's enemies are at least this far into the run (rushing a zone can't make it easy)
    CAP: 110, CAP_TOUCH: 80,     // concurrent enemies (owner #11: raised for Expedition, lower on phones)
    FINAL_SPAWN: 6, FINAL_HP: 4, FINAL_DMG: 2, FINAL_CAP: 1.4,   // the final swarm: x6 spawns, HP x4 / dmg x2 per minute
    ZONE_RATE: 0.2,              // trickle x(1 + 0.2 per zone)
    BOSS_RATE: 0.35,             // the trickle while a guardian / legendary is up
    SHRINE_RATE: 0.5,            // the shrine's trickle (only once the legendary is up)
    CARDS0: 4, CARD_EVERY: 60,   // the zone starts with 4 species, one more every 60 s (newest x1.4, older x0.85 each)
    DMG_K: 2.4, XP_K: 5.6,       // as the base spawner (js/systems/spawner.js)
    ALTAR_R: 2.2, ALTAR_T: 3,    // altar radius (tiles) and the seconds you stand in it to wake the guardian
    PORTAL_R: 1.6, PORTAL_T: 0.8,
    WIN_T: 3,                    // s of victory banner before the run-over screen
    // bosses: HP = max(curve, DPS x target x SINGLE x (1 + 0.15 x tier)); past the target, x(1 + EXH_RATE per s) taken
    TARGET: [40, 50, 60], LEGEND_TARGET: 60, TIER_K: 0.15, SINGLE: 0.5, DPS_WIN: 30, DPS_MIN: 5,
    EXH_RATE: 0.15, EXH_MAX: 8,
    GUARD_HP: [2400, 6000, 12000], LEGEND_HP: 20000, GUARD_DMG: [40, 52, 64], LEGEND_DMG: 75, GUARD_XP: [2, 2.5, 3], LEGEND_XP: 4,
    // events
    ALPHA: { hp: 9, dmg: 1.5, xp: 8, scale: 1.6 }, ELITE: { hp: 3, dmg: 1.3, xp: 3, scale: 1.25 },
    TOTEM: { hp: 12, dmg: 1.3, xp: 6, scale: 1.5, spd: 0.7, every: 7, calls: 3 },
    SUMMONER: { hp: 14, dmg: 1.2, xp: 6, scale: 1.4, life: 50 },
    STAMPEDE_SPD: 230, FLOCK_SPD: 180, ROCK_R: 44, ROCKS: 14,
    // DLC D20 (owner 2026-10-26: "the full 1025 for both enemies and playable characters"): every Pokémon is an enemy somewhere.
    // WANDER: the share of the trickle that is one of the zone's WANDER_N seeded "wanderers" (Pokémon NOT of the map's types, from
    // the zone's band; zone 1 also those below it): a minority, so a map keeps its identity. RARE5: zone 3's rarity-5 elite pack
    // (the pseudo-legendaries, the Paradox...; n). ROAM: a legendary roams zones 2-3 (ROAM_P a zone) and leaves after life s.
    WANDER: 0.12, WANDER_N: 6, RARE5_N: 3, RARE5_AT: [300, 470], ROAM_P: 0.35, ROAM_AT: [200, 420],
    ROAM: { hp: 16, dmg: 1.4, xp: 10, scale: 1.4, life: 90 }
  };
  const KINDS = ['alpha', 'swarm', 'stampede', 'flock', 'rockslide', 'elite', 'totem', 'summoner', 'roam'];   // (D20: + roam)
  // zone 1's timeline (study 2.8, rescaled); 'a|b' = one of them, by the zone's stream. Plus a flock (170-280 s), a
  // rock slide (400-500 s) and, half the time, one more of either (540-585 s).
  const TIMELINE = [[150, 'alpha'], [235, 'swarm|stampede'], [290, 'totem'], [330, 'alpha'], [330, 'elite'], [360, 'summoner'],
    [390, 'swarm'], [420, 'totem'], [450, 'elite'], [480, 'alpha'], [520, 'stampede']];
  const DIFFS = ['normal', 'hard', 'nightmare'];
  const DIFF_NAME = { normal: 'Normal', hard: 'Difícil', nightmare: 'Pesadilla' };
  // (D9: the tier's table, js/expedition/tiers.js G.ExpTier.K.TIERS: HP, damage, speed, amount, cap, elites, events, earlier,
  //  telegraphs, escorts, XP. Normal is all x1 / 0, so a Normal run plays exactly as before D9.)
  const NORMAL_T = { hp: 1, dmg: 1, spd: 1, amount: 1, cap: 1, elite: 0, event: 1, early: 0, tele: 1, escorts: 0, xp: 1, score: 1 };
  const tierOf = d => (G.ExpTier ? G.ExpTier.of(d) : NORMAL_T);

  // ---------------- the maps (D3: Viridian Forest; D12 adds Mt. Moon and Cerulean Cape) ----------------
  // types: the map's residents' types (study 5.3); bands: the BST of each zone's enemies (base forms, middle, final);
  // residents: hand-picked families weighted first; then every other Pokémon of those types in the band (all 1025).
  // guardians: 3 per zone (one is drawn); legend: the shrine's boss; stampede / flock / totem / summoner: per-zone pools
  // (summoner -> its minion); flock: the banner of its flock event. (D12: the unlock rule is G.ExpTier.mapOpen: a map opens
  // when the one before it is cleared.)
  const MAPS = {
    viridian: {
      name: 'Bosque Verde', types: ['grass', 'bug', 'normal', 'flying'],
      bands: [[180, 340], [300, 440], [400, 560]],
      residents: [[10, 13, 16, 19, 21, 25, 43, 46, 48, 69], [11, 14, 17, 20, 22, 44, 47, 70], [12, 15, 18, 45, 49, 71, 123, 127]],
      guardians: [[15, 12, 20], [47, 49, 22], [45, 71, 18]], legend: 151,
      stampede: [[19, 84], [20, 128], [85, 128]], flock: [[16, 21], [17, 22], [18, 22]],
      totem: [[14, 11], [44, 70], [3, 15]], summoner: [[15], [18], [416]], minion: { 15: 13, 18: 16, 416: 415 }
    },
    // DLC D12: Mt. Moon (rock / ground / fairy, cave ledges; study 5.3: "Clefable as a guardian": the moon's own, at the shrine)
    mtmoon: {
      name: 'Monte Moon', types: ['rock', 'ground', 'fairy'], flockSay: '¡Una bandada cruza la cueva!',
      bands: [[200, 360], [320, 470], [420, 590]],
      residents: [[41, 74, 246, 35, 27, 50, 173, 104, 39], [42, 75, 47, 28, 51, 95, 138, 140, 111], [36, 76, 112, 105, 139, 141, 142, 169, 208]],
      guardians: [[95, 28, 47], [105, 139, 141], [76, 112, 142]], legend: 36,
      stampede: [[74, 27], [75, 111], [76, 112]], flock: [[41], [42, 41], [169, 42]],
      totem: [[35, 74], [75, 47], [36, 76]], summoner: [[35], [139], [36]], minion: { 35: 173, 139: 138, 36: 35 }
    },
    // DLC D12: Cerulean Cape (water / electric / flying, islands, surf and glide gaps; study 5.3: Zapdos)
    cerulean: {
      name: 'Cabo Celeste', types: ['water', 'electric', 'flying'], flockSay: '¡Una bandada cruza el cabo!',
      bands: [[180, 345], [300, 455], [400, 570]],
      residents: [[60, 72, 54, 118, 116, 81, 100, 278, 98, 120], [61, 55, 119, 117, 82, 101, 22, 99, 86], [62, 73, 121, 130, 87, 125, 135, 26, 131]],
      guardians: [[99, 117, 82], [121, 125, 22], [130, 131, 26]], legend: 145,
      stampede: [[98, 60], [99, 86], [62, 87]], flock: [[278, 81], [22, 82], [22, 279]],
      totem: [[120, 100], [119, 101], [121, 125]], summoner: [[54], [82], [130]], minion: { 54: 60, 82: 81, 130: 129 }
    }
  };
  const MAP_IDS = ['viridian', 'mtmoon', 'cerulean'];

  // ---------------- seeded helpers ----------------
  function mix(...vals) {
    let h = 0x9E3779B9 | 0;
    for (const v of vals) { h ^= v | 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16; }
    return h >>> 0;
  }
  const R = s => G.DLC.rng(s);
  const pickR = (rng, a) => a[Math.min(a.length - 1, Math.floor(rng() * a.length))];
  const intR = (rng, a, b) => a + Math.min(b - a, Math.floor(rng() * (b - a + 1)));
  function shuffle(rng, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const zoneStream = (seed, map, zone, salt) => R(mix(seed | 0, MAP_IDS.indexOf(map) + 1, zone | 0, salt));

  // ---------------- the plan (pure) ----------------
  /** The zone's Pokémon: its residents (with sprites) and every other one of the map's types in its BST band. */
  function poolOf(map, zone) {
    const M = MAPS[map], zi = Math.min(3, zone) - 1, band = M.bands[zi], res = M.residents[zi].filter(d => G.SPRITE_META[d]);
    const others = G.DEX.filter(p => !p.leg && p.rarity < 5 && G.SPRITE_META[p.dex] && p.bst >= band[0] && p.bst <= band[1]
      && p.types.some(t => M.types.includes(t)) && !res.includes(p.dex)).map(p => p.dex);
    return { res, others };
  }
  // DLC D20: the enemies the map's types and bands leave out (a test checks every one of the 1,025 is somewhere)
  /** The zone's wanderers' pool: the Pokémon of no map type in the zone's band (zone 1: below it too, e.g. Wishiwashi, BST 175). */
  function wanderPool(map, zone) {
    const M = MAPS[map], zi = Math.min(3, zone) - 1, band = M.bands[zi];
    return G.DEX.filter(p => !p.leg && p.rarity < 5 && G.SPRITE_META[p.dex] && p.bst <= band[1] && (p.bst >= band[0] || zi === 0)
      && (!p.types.some(t => M.types.includes(t)) || p.bst < band[0])).map(p => p.dex);
  }
  /** The rarity-5 Pokémon that are not legendary (Dragonite, Tyranitar, Slaking, the Paradox...): zone 3's elite packs. */
  const rare5 = () => G.DEX.filter(p => !p.leg && p.rarity >= 5 && G.SPRITE_META[p.dex]).map(p => p.dex);
  /** The legendaries and mythicals that may roam (all but the map's own shrine legendary). */
  const roamers = map => G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex] && p.dex !== MAPS[map].legend).map(p => p.dex);
  /**
   * The zone's plan from the run's seed: {map, zone, diff, guardian, legend, cards: [dex], events: [{at, kind, n, dex: [],
   * seed}]}, events sorted by time (zone 4, the shrine, has none). Pure: same arguments, same plan, no Math.random.
   */
  function plan(seed, map, zone, diff = 'normal') {
    map = MAPS[map] ? map : 'viridian';
    diff = DIFFS.includes(diff) ? diff : 'normal';
    const M = MAPS[map], zi = Math.min(3, zone) - 1, rng = zoneStream(seed, map, zone, 0xC3), TR = tierOf(diff);
    const P = poolOf(map, zone);
    const cards = shuffle(rng, P.res).concat(shuffle(rng, P.others).slice(0, 12));
    const guardian = pickR(rng, M.guardians[zi]);
    const events = [];
    if (zone <= 3) {
      const shift = K.SHIFT[zi] + TR.early;   // (D9: Hard 15 s, Nightmare 30 s earlier)
      const tl = TIMELINE.slice();
      tl.push([intR(rng, 170, 280), 'flock'], [intR(rng, 400, 500), 'rockslide']);
      if (rng() < 0.5) tl.push([intR(rng, 540, 585), rng() < 0.5 ? 'flock' : 'rockslide']);
      const zk = 1 + 0.2 * zi;
      const early = cards.slice(0, Math.min(cards.length, 8));
      tl.forEach(([at0, k0], i) => {
        const kind = k0.includes('|') ? pickR(rng, k0.split('|')) : k0;
        let n = 1, dex = [];
        if (kind === 'alpha') dex = [pickR(rng, cards.slice(0, Math.min(cards.length, 10)))];
        else if (kind === 'swarm') { n = Math.round(intR(rng, 24, 40) * zk); dex = [pickR(rng, early), pickR(rng, early)]; }
        else if (kind === 'stampede') { n = Math.round(intR(rng, 16, 26) * zk); dex = [pickR(rng, M.stampede[zi])]; }
        else if (kind === 'flock') { n = Math.round(intR(rng, 10, 16) * zk); dex = [pickR(rng, M.flock[zi])]; }
        else if (kind === 'rockslide') n = K.ROCKS;
        else if (kind === 'elite') { n = 5 + 2 * zi; dex = [pickR(rng, early), pickR(rng, early)]; }
        else if (kind === 'totem') dex = [pickR(rng, M.totem[zi])];
        else if (kind === 'summoner') dex = [pickR(rng, M.summoner[zi])];
        if (TR.event !== 1 && n > 1) n = Math.round(n * TR.event);   // (D9: bigger events; no extra draw, so the plan's stream is the same)
        events.push({ at: Math.max(30, at0 - shift), kind, n, dex, seed: Math.floor(rng() * 4294967296) >>> 0, i });
      });
      events.sort((a, b) => a.at - b.at || a.i - b.i);
      events.forEach(e => { delete e.i; });
    }
    // (DLC D20, from its own stream, after every draw above: the cards, the guardian and the timeline are as before)
    let wander = [];
    if (zone <= 3) {
      const rd = zoneStream(seed, map, zone, 0xD20), shift = K.SHIFT[zi] + TR.early;
      wander = shuffle(rd, wanderPool(map, zone)).slice(0, K.WANDER_N);
      const r5 = rare5(), rl = roamers(map);
      if (zone === 3 && r5.length) events.push({ at: Math.max(30, intR(rd, K.RARE5_AT[0], K.RARE5_AT[1]) - shift), kind: 'elite', n: K.RARE5_N, dex: [pickR(rd, r5), pickR(rd, r5)], seed: Math.floor(rd() * 4294967296) >>> 0, rare: 1 });
      if (zone >= 2 && rl.length && rd() < K.ROAM_P) events.push({ at: Math.max(30, intR(rd, K.ROAM_AT[0], K.ROAM_AT[1]) - shift), kind: 'roam', n: 1, dex: [pickR(rd, rl)], seed: Math.floor(rd() * 4294967296) >>> 0 });
      events.sort((a, b) => a.at - b.at);   // (stable: the D3 timeline's order kept)
    }
    return { map, zone, diff, guardian, legend: M.legend, cards, events, wander };
  }

  // ---------------- the shrine (zone 4, hand-made) ----------------
  const SHRINE = { w: 44, h: 44, ped: [0, -13] };
  /**
   * The shrine zone: a round grove (rock outside), a raised dais to the north with stairs, two ponds. (D12: Mt. Moon's is a
   * crater: rock pillars for the ponds and a crystal ring; Cerulean Cape's an island: a ring of sea round the grove, the
   * ponds kept. The dais, its stairs and the pedestal are the same on every map.)
   */
  function shrine(seed, map) {
    if (map === 'mtmoon' || map === 'cerulean') return shrineD12(seed, map);
    const { w, h } = SHRINE, cx = w >> 1, cy = h >> 1;
    const d = (x, y) => Math.hypot(x - cx, (y - cy) * 1.1);
    const dais = (x, y) => Math.abs(x - cx) <= 4 && y - cy >= -16 && y - cy <= -10;
    const pond = (x, y) => Math.hypot(Math.abs(x - cx) - 11, y - cy - 4) < 2.6;
    return G.ExpTerrain.custom({
      w, h, seed, map, zone: 4,
      kind: (x, y) => d(x, y) > 19.5 ? 1 : pond(x, y) ? 2 : 0,
      hgt: (x, y) => dais(x, y) ? 1 : 0,
      ramp: (x, y) => Math.abs(x - cx) <= 1 && y - cy === -9 ? 1 : 0,
      prop: (x, y) => { const r = d(x, y); if (r > 17.6 && r <= 19.5 && (x * 7 + y * 3) % 4 === 0) return 1; if (r < 17 && r > 9 && (x * 13 + y * 5) % 11 === 0 && !dais(x, y) && !pond(x, y)) return 3; return 0; }
    });
  }
  function shrineD12(seed, map) {
    const { w, h } = SHRINE, cx = w >> 1, cy = h >> 1, cave = map === 'mtmoon';
    const d = (x, y) => Math.hypot(x - cx, (y - cy) * 1.1);
    const dais = (x, y) => Math.abs(x - cx) <= 4 && y - cy >= -16 && y - cy <= -10;
    const side = (x, y) => Math.hypot(Math.abs(x - cx) - 11, y - cy - 4) < 2.6;      // Viridian's ponds: Mt. Moon's rock pillars
    const sea = (x, y) => !cave && d(x, y) > 16.2 && d(x, y) <= 19.5;                  // Cerulean Cape: the sea round the island
    return G.ExpTerrain.custom({
      w, h, seed, map, zone: 4,
      kind: (x, y) => d(x, y) > 19.5 ? 1 : sea(x, y) ? 2 : side(x, y) ? (cave ? 1 : 2) : 0,
      hgt: (x, y) => dais(x, y) ? 1 : 0,
      ramp: (x, y) => Math.abs(x - cx) <= 1 && y - cy === -9 ? 1 : 0,
      prop: (x, y) => {
        const r = d(x, y);
        if (sea(x, y) || side(x, y) || dais(x, y) || (Math.abs(x - cx) <= 2 && y - cy >= -10 && y - cy <= -6)) return 0;   // (never on or by the stairs)
        if (cave && r > 17.6 && r <= 19.5 && (x * 7 + y * 3) % 3 === 0) return 1;   // (the cave biome paints a tree as a crystal)
        if (!cave && r > 15 && r <= 16.2 && (x * 7 + y * 3) % 5 === 0) return 1;
        if (r < 15 && r > 9 && (x * 13 + y * 5) % (cave ? 13 : 11) === 0) return cave ? 2 : 3;
        return 0;
      }
    });
  }
  /** The zone for (seed, map, z): zones 1-3 from the generator, zone 4 the shrine. Used by the host and every viewer. */
  const build = (seed, map, z) => z === 4 ? shrine(seed, map) : G.ExpTerrain.generate({ seed, map, zone: z });

  // ---------------- the sites (from the zone's grids only: every viewer finds the same) ----------------
  function flat5(z, tx, ty) {
    const h = z.height(tx, ty);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = tx + dx, y = ty + dy;
      if (!z.inside(x, y) || z.terr(x, y) !== 0 || z.height(x, y) !== h || z.rampDir(x, y) || z.propAt(x, y) || z.padAt(x, y)) return false;
    }
    return true;
  }
  /** {altar: [tx, ty], shrine: bool} for an Expedition zone of a known map, else null. Cached on the zone. */
  function sitesOf(z) {
    if (!z || !MAPS[z.map]) return null;
    if (z.xsites && z.xsites.h === z.hash) return z.xsites.v;
    let v;
    if (z.zone === 4) v = { altar: SHRINE.ped.slice(), shrine: true };
    else {
      const rng = R(mix(z.seed | 0, z.zone | 0, MAP_IDS.indexOf(z.map) + 1, 0xA1)), cand = [];
      for (let y = 3; y < z.h - 3; y += 2) for (let x = 3; x < z.w - 3; x += 2) {
        const tx = x + z.x0, ty = y + z.y0, dd = Math.hypot(tx, ty);
        if (dd >= 26 && dd <= 48 && flat5(z, tx, ty)) cand.push([tx, ty]);
      }
      v = { altar: cand.length ? pickR(rng, cand) : [0, -12], shrine: false };
    }
    z.xsites = { h: z.hash, v };
    return v;
  }
  const TSz = () => G.World.TS;
  const siteXY = t => [(t[0] + 0.5) * TSz(), (t[1] + 0.5) * TSz()];

  // ---------------- the run state (host) ----------------
  let S = null;        // the host's run: null outside a Classic run
  let view = null;     // a viewer's / guest's copy of what the `x` block's `c` says
  const on = () => !!(S && G.Modes.isExp());
  const diffIdx = d => Math.max(0, DIFFS.indexOf(d));
  const say = (t, s = 3) => G.Spawner.say(t, s);
  const capNow = () => Math.round((G.Touch && G.Touch.active ? K.CAP_TOUCH : K.CAP) * (S && S.fs ? K.FINAL_CAP : 1) * (S ? tierOf(S.diff).cap : 1));   // (D9: the tier's cap)

  /** A Classic run starts (js/expedition/core.js run.start, after zone 1 is set). (DLC D11: and a Survival run: the same
   *  spawner, events and bosses, driven by js/expedition/survival.js; S.surv, S.zi = its phase, the land = S.zone) */
  function begin(cfg) {
    S = { map: MAPS[cfg.map] ? cfg.map : 'viridian', diff: DIFFS.includes(cfg.diff) ? cfg.diff : 'normal', seed: G.World.seed | 0,
          zone: 0, zs: 0, splits: [], log: [], bosses: [], won: false, ended: false, dps: [], surv: cfg.mode === 'exp-survival', zi: 0, pzs: 0 };
    zoneStart(1, 0);
    return S;
  }
  function reset() { S = null; view = null; }
  /** D11: the zone index (0-2) of the enemies' bands and stats: the zone in Classic, the phase in Survival. */
  const zIdx = () => (S && S.surv ? S.zi : Math.min(3, S ? S.zone : 1) - 1);

  function zoneStart(z, t) {
    const p = plan(S.seed, S.map, S.surv ? S.zi + 1 : z, S.diff);
    if (S.surv) p.events = [];   // (D11: Survival's timeline is its own, js/expedition/survival.js; its cards follow the phase)
    Object.assign(S, { zone: z, zs: t, plan: p, n: 0, ph: 0, charge: 0, portalT: 0, fs: false, boss: null, exhSaid: false, acc: 0,
                       trick: zoneStream(S.seed, S.map, z, 0xC4), specials: new Map(), sites: sitesOf(G.World.zone) });
    G.Sprites.preload(p.cards.slice(0, 8).concat([p.guardian, p.legend], p.wander || [], ...p.events.map(e => e.dex)), 8000);   // (D20: + the wanderers)
    if (S.surv) say(G.I18n.f('— Tierra {x} · {x} —', G.ExpSurv ? G.ExpSurv.landOf() : 1, G.I18n.t(MAPS[S.map].name)), 3.2);
    else if (z === 4) say(G.I18n.f('— Santuario de {x} —', G.DEX_BY[p.legend].name), 3.4);
    else say(G.I18n.f('— Zona {x} · {x} —', z, G.I18n.t(MAPS[S.map].name)), 3.2);
  }
  /** D11: Survival's phase (0-2): the enemies' band and stats move on, and the trickle's cards are the new phase's. */
  function setPhase(zi, t) {
    if (!S || !S.surv) return;
    S.zi = zi; S.pzs = t;
    const p = plan(S.seed, S.map, zi + 1, S.diff);
    p.events = [];
    S.plan = p;
    G.Sprites.preload(p.cards.slice(0, 8).concat(p.wander || []), 8000);
  }

  /** Every step of an Expedition run on the host (js/systems/spawner.js, instead of the base waves). */
  function update(dt, players, t) {
    // (a zone that isn't this run's, e.g. a test's hand-made one: nothing spawns and nothing happens)
    if (!on() || S.ended || !G.World.zone || G.World.zone.map !== S.map || G.World.zone.zone !== S.zone || !S.sites) return;
    const alive = players.filter(p => !p.dead);
    dpsSample(t);
    tickSpecials(dt, t, alive);
    if (S.surv) {   // (D11: Survival: milestones, phases, migration, siege flocks; the portal when the migration opens)
      if (G.ExpSurv) G.ExpSurv.update(dt, players, t, alive);
      if (S.ph === 2) {
        const site = siteXY(S.sites.altar), TS = TSz();
        const nearP = alive.some(p => G.U.dist2(p.x, p.y, site[0], site[1]) < (K.PORTAL_R * TS) ** 2);
        S.portalT = nearP ? S.portalT + dt : Math.max(0, S.portalT - dt);
        if (S.portalT >= K.PORTAL_T) { nextZone(t, players); return; }
      }
      trickle(dt, t, t - S.pzs, alive.length ? alive : players);
      return;
    }
    tickBoss(t);
    const site = siteXY(S.sites.altar), TS = TSz();
    const near = r => alive.some(p => G.U.dist2(p.x, p.y, site[0], site[1]) < (r * TS) ** 2);
    if (S.ph === 0) {
      S.charge = G.U.clamp(S.charge + (near(K.ALTAR_R) ? dt / K.ALTAR_T : -dt / K.ALTAR_T * 0.5), 0, 1);
      if (S.charge >= 1) wake(t, alive);
    } else if (S.ph === 2) {
      S.portalT = near(K.PORTAL_R) ? S.portalT + dt : Math.max(0, S.portalT - dt);
      if (S.portalT >= K.PORTAL_T) { nextZone(t, players); return; }
    } else if (S.ph === 4) {
      S.wonT += dt;
      if (S.wonT >= K.WIN_T) { S.ended = true; G.Game.endRun(false); return; }
    }
    const zt = t - S.zs;
    if (S.zone <= 3) {
      while (S.n < S.plan.events.length && zt >= S.plan.events[S.n].at) fire(S.plan.events[S.n++], t, alive.length ? alive : players);
      if (!S.fs && zt >= K.FINAL) { S.fs = true; say('¡ENJAMBRE FINAL! Despierta al guardián', 4); G.Audio.sfx('surge'); G.Camera.kick(0.6); }
    }
    if (S.ph !== 4) trickle(dt, t, zt, alive.length ? alive : players);
  }

  // ---------------- DPS (for the bosses' HP) ----------------
  /** Once a second: the run's total damage (js/systems/dmglog.js), kept for the last DPS_WIN seconds. */
  function dpsSample(t) {
    const L = S.dps;
    if (L.length && t - L[L.length - 1][0] < 1) return;
    const d = G.DmgLog.raw.dmg;
    let tot = 0;
    for (const k in d) tot += d[k];
    L.push([t, tot]);
    while (L.length > 2 && t - L[1][0] >= K.DPS_WIN) L.shift();
  }
  /** Your measured damage per second over the last DPS_WIN s (0 before DPS_MIN s of data). */
  function dps() {
    const L = S ? S.dps : [];
    if (L.length < 2) return 0;
    const a = L[0], b = L[L.length - 1], span = b[0] - a[0];
    return span >= K.DPS_MIN ? Math.max(0, (b[1] - a[1]) / span) : 0;
  }
  /** A guardian's / the legendary's HP: max(curve, DPS x target x SINGLE x (1 + 0.15 x tier)). Pure. */
  function bossHp({ zone, dps: d = 0, tier = 0, t = 0, legend = false, players = 1 }) {
    const zi = Math.min(3, zone) - 1;
    const curve = (legend ? K.LEGEND_HP : K.GUARD_HP[zi]) * G.Enemies.bossScale(t).hp * G.Coop.scaleHp(players) * (players > 1 ? 1.4 : 1);
    const target = legend ? K.LEGEND_TARGET : K.TARGET[zi];
    const fromDps = d * target * K.SINGLE * (1 + K.TIER_K * tier);
    return { hp: Math.round(Math.max(curve, fromDps)), curve: Math.round(curve), fromDps: Math.round(fromDps), target };
  }
  /** Exhaustion: the damage a boss takes, x(1 + EXH_RATE per second past its target), up to EXH_MAX. Pure. */
  const exhaustion = (since, target) => since <= target ? 1 : Math.min(K.EXH_MAX, 1 + K.EXH_RATE * (since - target));

  // ---------------- bosses ----------------
  /**
   * A guardian / legendary at (x, y) (D3's wake; D11: Survival's milestone bosses too). o: {dex, legend, zone (1-4, the HP
   * curve and target), target (s, overrides), dmgK, hpK}. -> {e, hp} (the enemy is added; its HP from your DPS, bossHp).
   */
  function makeBoss(o, t, alive) {
    const legend = !!o.legend, dex = o.dex, p = G.DEX_BY[dex], E = G.Enemies;
    const zi = Math.min(3, o.zone) - 1, d0 = dps();
    const hp = bossHp({ zone: o.zone, dps: d0, tier: diffIdx(S.diff), t, legend, players: Math.max(1, alive.length) });
    if (o.target) { const k = o.target / hp.target; hp.fromDps = Math.round(hp.fromDps * k); hp.hp = Math.max(hp.curve, hp.fromDps); hp.target = o.target; }
    if (o.hpK) hp.hp = Math.round(hp.hp * o.hpK);
    const bs = E.bossScale(t), lv = (G.Game.player && G.Game.player.level) || 1;
    const TR = tierOf(S.diff), dmg = (legend ? K.LEGEND_DMG : K.GUARD_DMG[zi]) * TR.dmg * (o.dmgK || 1);   // (D9: the tier's damage)
    const def = { dex, name: p.name, hp: hp.hp, spd: Math.round(G.U.clamp(40 + E.baseSpd(p) * 0.5, 40, 100)), dmg: Math.round(dmg * 1.2), xp: G.Player.xpFor(lv) * (legend ? K.LEGEND_XP : K.GUARD_XP[zi]),
      behavior: E.behaviorOf(p) === 'ranged' || legend ? 'ranged' : E.baseSpd(p) > 90 ? 'charger' : 'chase', shotDmg: Math.round(dmg * 0.55), shotCd: 1.1, range: 260 };
    const e = new G.Enemy(def, o.x, o.y, { hp: 1, dmg: bs.dmg, spd: 1 }, true);
    e.xk = legend ? 'legend' : 'guardian'; e.xborn = t; e.xtarget = hp.target;
    G.EnemyMgr.add(e);
    S.bosses.push({ zone: o.zone, dex, hp: e.maxHp, curve: hp.curve, fromDps: hp.fromDps, dps: Math.round(d0), target: hp.target, at: t, down: null });
    return { e, hp };
  }
  function wake(t, alive) {
    const legend = S.zone === 4, dex = legend ? S.plan.legend : S.plan.guardian, p = G.DEX_BY[dex];
    const TR = tierOf(S.diff);
    const [ax, ay] = siteXY(S.sites.altar);
    const { e } = makeBoss({ dex, legend, zone: S.zone, x: ax, y: ay - 70 }, t, alive);
    S.boss = e; S.ph = legend ? 3 : 1; S.charge = 1; S.exhSaid = false;
    escorts(TR.escorts, ax, ay - 70, t);   // (D9: Hard 1, Nightmare 2)
    say(G.I18n.f(legend ? '¡{x} aparece en el santuario!' : '¡{x}, el guardián, despierta!', p.name), 3.4);
    G.Camera.kick(1.1); G.Audio.sfx('boss'); G.FX.ring(ax, ay, 10, 220, legend ? '#ff9ed8' : '#ffd95e', 0.8, 6);
    return e;
  }
  /** D9: a boss's escorts, elites of the zone's first cards round it (their own seeded stream). */
  function escorts(n, x, y, t) {
    if (!(n > 0)) return [];
    const rng = R(mix(S.seed, S.zone, MAP_IDS.indexOf(S.map) + 1, 0xE5C)), E = G.ExpTier ? G.ExpTier.K.ESCORT : K.ELITE, out = [];
    for (let i = 0; i < n; i++) {
      const dex = S.plan.cards[Math.floor(rng() * Math.min(S.plan.cards.length, 6))], a = (i + 0.5) / n * 6.2832 + rng() * 0.6;
      let px = x + Math.cos(a) * 90, py = y + Math.sin(a) * 60;
      if (!G.World.isFree(px, py, 14) && !G.Sprites.hovers(dex)) { px = x; py = y; }
      const e = spawn(dex, px, py, t, { hp: E.hp, dmg: E.dmg, xp: E.xp, scale: E.scale, kind: 'elite' });
      if (e) { e.xescort = 1; out.push(e); }
    }
    return out;
  }
  function tickBoss(t) {
    const e = S.boss;
    if (!e) return;
    if (e.dead) {
      S.boss = null;
      const b = S.bosses[S.bosses.length - 1];
      if (b) b.down = Math.round((t - b.at) * 10) / 10;
      if (e.xk === 'legend') {
        S.ph = 4; S.won = true; S.wonT = 0; S.splits[3] = t;
        say('¡EXPEDICIÓN COMPLETADA!', K.WIN_T + 1);
        G.Game.flash('#fff3c8', 1.2); G.Audio.sfx('legend');
      } else {
        S.ph = 2; S.portalT = 0;
        G.Pickups.pullAll();
        say('¡El portal se abre! Entra en él', 3.4); G.Audio.sfx('legend');
        const [ax, ay] = siteXY(S.sites.altar);
        G.FX.ring(ax, ay, 10, 160, '#b48aff', 0.8, 6);
      }
      return;
    }
    const k = exhaustion(t - e.xborn, e.xtarget);
    e.takenK = k > 1 ? k : 0;
    if (k > 1 && !S.exhSaid) { S.exhSaid = true; say(G.I18n.f('¡{x} está agotado!', e.name), 2.6); }
  }

  /** Through the portal: the next zone (zone 3's portal: the shrine). */
  function nextZone(t, players) {
    // (D11: Survival's migration: the next land, zones 1 -> 2 -> 3 -> 1 again; no splits)
    const z = S.surv ? S.zone % 3 + 1 : S.zone + 1;
    if (!S.surv) S.splits[S.zone - 1] = t;
    G.EnemyMgr.clear(); G.Pickups.clear(); G.Projectiles.clear(); G.Hazards.clear(); G.Combat.clearFields();
    if (S.surv && G.ExpSurv) G.ExpSurv.migrated(t);
    G.Exp.enterZone(z);
    const mates = (G.LocalCoop && G.LocalCoop.mate ? [G.LocalCoop.mate] : []);
    for (const [i, p] of players.concat(mates).entries()) {
      if (p.remote) continue;
      p.x = i ? 40 * i : 0; p.y = 0; p.zMask = null; p.air = null; p.airZ = 0; p._px = null;
    }
    G.Camera.x = players[0].x; G.Camera.y = players[0].y;
    G.Game.flash('#ffffff', 0.7); G.Audio.sfx('biome');
    zoneStart(z, t);
  }

  // ---------------- spawning ----------------
  const tierAt = t => { let ti = 0; G.Enemies.TIERS.forEach((tr, i) => { if (t >= tr.from) ti = i; }); return ti; };
  const TIER_RANGE = [[0, 2], [2, 4], [3, 5]];
  const hpK = t => 3.3 + Math.min(1.7, t / 210);   // (the base spawner's)
  /** An enemy definition (the base game's defFor shape) of `dex` at stats tier ti. */
  function defOf(dex, ti) {
    const p = G.DEX_BY[dex], tier = G.Enemies.TIERS[ti], E = G.Enemies;
    const hpk = G.U.clamp((p.hp - 70) / 0.45 / 65, 0.7, 1.6), spdK = G.U.clamp(0.75 + E.baseSpd(p) / 260, 0.75, 1.3);
    const behavior = E.behaviorOf(p);
    const d = { dex, name: p.name, behavior,
      hp: Math.round(tier.hp * hpk * (behavior === 'tank' ? 1.5 : 1)), spd: Math.round(tier.spd * spdK * (behavior === 'tank' ? 0.7 : 1)),
      dmg: Math.round(tier.dmg * (behavior === 'tank' ? 1.2 : 1)), xp: Math.max(3, Math.round(tier.xp * (behavior === 'tank' ? 1.3 : 1))) };
    const CD = { ranged: 2.2 - ti * 0.15, fan: 3.2 - ti * 0.15, beamer: 4.4 - ti * 0.2, zoner: 4.6 - ti * 0.2, healer: 3.5, summoner: 7 };
    if (CD[behavior]) {
      d.shotDmg = Math.round(tier.dmg * (behavior === 'fan' ? 0.7 : 0.8)); d.shotCd = +CD[behavior].toFixed(2);
      d.range = (behavior === 'beamer' ? 260 : behavior === 'healer' || behavior === 'summoner' ? 230 : 190) + ti * 6;
    }
    if (behavior === 'fan') d.fanN = ti < 2 ? 3 : 5;
    if (behavior === 'zoner') d.zones = ti < 2 ? 1 : ti < 4 ? 2 : 3;
    if (behavior === 'bomber') { d.spd = Math.round(d.spd * 1.25); d.hp = Math.round(d.hp * 0.8); }
    return d;
  }
  /** Creates an enemy of the zone at (x, y). o: {ti+, hp, dmg, xp, scale, behavior, spd, kind} -> the enemy */
  function spawn(dex, x, y, t, o = {}) {
    const zi = zIdx(), teff = Math.max(t, K.ZMIN[zi]), [lo, hi] = TIER_RANGE[zi];
    const ti = G.U.clamp(tierAt(teff) + (o.ti || 0), lo, Math.min(5, hi + (o.ti || 0)));
    const def = defOf(dex, ti);
    if (o.behavior) def.behavior = o.behavior;
    if (o.minion) def.minion = o.minion;
    if (o.behavior === 'summoner') { def.shotCd = 5; def.range = 420; }
    const m = S.fs ? Math.max(0, (t - S.zs - K.FINAL) / 60) : 0;
    const sc = G.Enemies.scale(teff), n = Math.max(1, (G.Game.everyone ? G.Game.everyone().length : 1)), TR = tierOf(S.diff);   // (D9: the tier)
    const e = new G.Enemy(def, x, y, { hp: sc.hp * G.Coop.scaleHp(n) * hpK(teff) * Math.pow(K.FINAL_HP, m) * (o.hp || 1) * TR.hp, dmg: sc.dmg, spd: sc.spd * (o.spd != null ? o.spd : 1) * TR.spd });
    e.dmg *= K.DMG_K * Math.pow(K.FINAL_DMG, m) * (o.dmg || 1) * TR.dmg;
    // (D11: Survival: the Endless Night and the pacts' banes (enemies' HP / damage), js/expedition/survival.js foeK)
    const sk = S.surv && G.ExpSurv ? G.ExpSurv.foeK(t, o.kind) : null;
    if (sk) { e.maxHp = e.hp = Math.round(e.maxHp * sk.hp); e.dmg *= sk.dmg; }
    e.xp = Math.round(e.xp * K.XP_K * (o.xp || 1) * TR.xp * (sk && sk.xp ? sk.xp : 1));   // (D21: Survival's pacing, foeK)
    // (D5: the Cursed Incense vitamin, +12 % difficulty a level: HP and damage)
    const cu = G.ExpItems ? G.ExpItems.total(G.Game.player, 'curse') : 0;
    if (cu > 0) { e.maxHp = e.hp = Math.round(e.maxHp * (1 + cu)); e.dmg *= 1 + cu; }
    // (D7: the cursed Poké Balls and the cursed / greed altars: + difficulty (HP and damage), + XP)
    const xm = G.ExpEco && G.ExpEco.mods();
    if (xm && xm.diff > 0) { e.maxHp = e.hp = Math.round(e.maxHp * (1 + xm.diff)); e.dmg *= 1 + xm.diff; }
    if (xm && xm.xp > 0) e.xp = Math.round(e.xp * (1 + xm.xp));
    if (o.scale) setScale(e, o.scale);
    if (o.kind) { e.xk = o.kind; S.specials.set(e.id, { kind: o.kind, e, t0: t, next: K.TOTEM.every, rng: R(mix(S.seed, e.id, 0x70)) }); }
    if (o.kind === 'alpha' && G.ExpCap) G.ExpCap.mark(e, 'alpha');   // (D8: an alpha faints at 1 HP: the Friend Ball's window)
    G.EnemyMgr.add(e);
    return e;
  }
  /** A bigger sprite (alphas, elites, totems, summoners): the base Enemy only scales bosses. */
  function setScale(e, s) {
    e.scale = s; e.anim = new G.Sprites.Animator(e.dex, s, e.shiny);
    e.r = G.Sprites.bodyRadius(e.dex, s); e.bodyH = G.Sprites.bodyHeight(e.dex, s);
  }
  /** A free spot round player p, on the ring just off screen (or at distance d), from the stream rng. */
  function spot(rng, p, ang, flying, d) {
    const R0 = d != null ? d : G.Camera.outerRadius() + 10;
    for (let i = 0; i < 10; i++) {
      const a = ang + (i ? (rng() - 0.5) * 1.8 : 0), dd = R0 + rng() * 60;
      const x = p.x + Math.cos(a) * dd, y = p.y + Math.sin(a) * dd * 0.9;
      const tx = Math.floor(x / TSz()), ty = Math.floor(y / TSz());
      if (!G.World.zone.inside(tx, ty)) continue;
      if (flying || G.World.isFree(x, y, 14)) return [x, y];
    }
    return null;
  }
  /** The steady trickle: the zone's cards (one more species a minute; the newest weighs x1.4, older ones x0.85 each). */
  function trickle(dt, t, zt, players) {
    if (S.zone === 4 && S.ph !== 3) return;   // (the shrine is quiet until the legendary is up)
    const cap = capNow();
    if (G.EnemyMgr.count >= cap) { S.acc = 0; return; }
    const zi = zIdx(), teff = Math.max(t, K.ZMIN[zi]);
    const TR = tierOf(S.diff), sk = S.surv && G.ExpSurv ? G.ExpSurv.foeK(t) : null;   // (D11: Survival's pacts: + spawns, + elites)
    const k = (sk ? sk.rate : 1) * TR.amount * G.Coop.scaleRate(players.length) * (S.boss ? K.BOSS_RATE : 1) * (S.fs ? K.FINAL_SPAWN : 1) * (S.zone === 4 ? K.SHRINE_RATE : 1) * (1 + K.ZONE_RATE * zi) * (G.ExpEco ? 1 + G.ExpEco.mods().rate : 1);   // (D7: the cursed altar's + spawns)
    S.acc = Math.min(8, S.acc + G.Spawner.rate(teff) * k * dt);
    const cards = S.plan.cards, nC = Math.min(cards.length, K.CARDS0 + Math.floor(Math.max(0, zt) / K.CARD_EVERY));
    while (S.acc >= 1 && G.EnemyMgr.count < cap) {
      S.acc -= 1;
      const rng = S.trick;
      let tot = 0;
      const w = [];
      // (a card's age: how many cards came after it; the first CARDS0 are all as old as the oldest)
      for (let i = 0; i < nC; i++) { const v = i === nC - 1 && nC > K.CARDS0 ? 1.4 : Math.pow(0.85, nC - 1 - Math.max(i, K.CARDS0 - 1)); w.push(v); tot += v; }
      let r = rng() * tot, ci = 0;
      while (ci < nC - 1 && (r -= w[ci]) > 0) ci++;
      let dex = cards[ci];
      // (D20: a minority share of the trickle is one of the zone's wanderers, off the map's types)
      const wd = S.plan.wander;
      if (wd && wd.length && rng() < K.WANDER) dex = wd[Math.floor(rng() * wd.length) % wd.length];
      const p = players[Math.floor(rng() * players.length) % players.length];
      const pt = spot(rng, p, rng() * 6.2832, G.Sprites.hovers(dex));
      // (D9: Hard / Nightmare make a share of the trickle elites; Normal draws nothing more, so its stream is unchanged)
      const el = TR.elite + (sk ? sk.elite : 0);
      if (pt) spawn(dex, pt[0], pt[1], t, el > 0 && rng() < el ? { hp: K.ELITE.hp, dmg: K.ELITE.dmg, xp: K.ELITE.xp, scale: K.ELITE.scale, kind: 'elite' } : undefined);
    }
  }

  // ---------------- the timeline's events ----------------
  /** A straight run across (a stampede's herd, a flock): Enemy.update calls e.xmove first (js/entities/enemy.js). */
  function runStep(dt) {
    const r = this.xrun;
    r.t -= dt;
    if (r.t <= 0) { this.xmove = null; this.xrun = null; return false; }
    const ox = this.x, oy = this.y;
    this.x += r.dx * r.spd * dt + this.kx * dt; this.y += r.dy * r.spd * dt + this.ky * dt;
    this.kx *= Math.pow(0.0015, dt); this.ky *= Math.pow(0.0015, dt);
    if (!this.flying && G.World.collide(this) && Math.hypot(this.x - ox, this.y - oy) < r.spd * dt * 0.3) r.t = Math.min(r.t, 0.15);
    this.anim.dir = G.Sprites.dirFromAngle(Math.atan2(r.dy, r.dx));
    this.anim.loop('Walk', 1.6);
    return true;
  }
  function charge(e, dx, dy, spd, dur) { e.xrun = { dx, dy, spd, t: dur }; e.xmove = runStep; }

  function fire(ev, t, players) {
    const p = players[0], rng = R(ev.seed), zi = zIdx(), Rr = G.Camera.outerRadius();
    const entry = { at: ev.at, kind: ev.kind, n: ev.n, dex: ev.dex.slice(), zt: Math.round((t - S.zs) * 10) / 10, spawned: 0 };
    S.log.push(entry);
    const add = e => { if (e) entry.spawned++; return e; };
    const name = d => (G.DEX_BY[d] ? G.I18n.t(G.DEX_BY[d].name) : '');   // (D13: the English name where it differs)
    if (ev.kind === 'alpha') {
      const pt = spot(rng, p, rng() * 6.2832, G.Sprites.hovers(ev.dex[0]));
      if (pt) add(spawn(ev.dex[0], pt[0], pt[1], t, { ti: 1, hp: K.ALPHA.hp, dmg: K.ALPHA.dmg, xp: K.ALPHA.xp, scale: K.ALPHA.scale, spd: 0.9, kind: 'alpha' }));
      say(G.I18n.f('¡Un {x} alfa aparece!', name(ev.dex[0])), 3); G.Audio.sfx('boss');
    } else if (ev.kind === 'swarm') {
      const a0 = rng() * 6.2832;
      for (let i = 0; i < ev.n; i++) {
        const dex = ev.dex[i % ev.dex.length], pt = spot(rng, p, a0 + i / ev.n * 6.2832, G.Sprites.hovers(dex), Rr * 0.8);
        if (pt) add(spawn(dex, pt[0], pt[1], t));
      }
      say('¡Enjambre! Te rodean', 2.6); G.Audio.sfx('surge');
    } else if (ev.kind === 'stampede' || ev.kind === 'flock') {
      const fly = ev.kind === 'flock', a = rng() * 6.2832, dx = Math.cos(a), dy = Math.sin(a), spd = fly ? K.FLOCK_SPD : K.STAMPEDE_SPD;
      const back = Rr + 60, side = [-dy, dx];
      for (let i = 0; i < ev.n; i++) {
        const lane0 = (i % 7 - 3) * 44 + (rng() - 0.5) * 20, row0 = Math.floor(i / 7) * 46 + rng() * 16;
        // (the herd's spot, or the nearest free one along its lane: a cliff or a pond in the way doesn't drop it)
        for (const [dl, dr] of [[0, 0], [0, 50], [0, -50], [30, 100], [-30, 100], [0, 160], [0, -110], [50, 220]]) {
          const lane = lane0 + dl, row = row0 + dr;
          const x = p.x - dx * (back + row) + side[0] * lane, y = p.y - dy * (back + row) + side[1] * lane;
          const tx = Math.floor(x / TSz()), ty = Math.floor(y / TSz());
          if (!G.World.zone.inside(tx, ty) || (!fly && !G.World.isFree(x, y, 14))) continue;
          const e = add(spawn(ev.dex[0], x, y, t, { spd: fly ? 1 : 0.9 }));
          if (fly) e.flying = true;
          charge(e, dx, dy, spd, (2 * back + row) / spd);
          break;
        }
      }
      if (fly) say(MAPS[S.map].flockSay || '¡Una bandada cruza el bosque!', 2.6);
      else say(G.I18n.f('¡Estampida de {x}!', name(ev.dex[0])), 2.6);
      G.Audio.sfx('surge'); if (!fly) G.Camera.kick(0.4);
    } else if (ev.kind === 'rockslide') {
      const zt0 = tierAt(Math.max(t, K.ZMIN[zi])), dmg = G.Enemies.TIERS[zt0].dmg * 1.6 * G.Enemies.scale(t).dmg * K.DMG_K;
      for (let i = 0; i < ev.n; i++) {
        const close = i < 4, a = rng() * 6.2832, d = close ? rng() * 60 : 70 + rng() * 190;
        G.Hazards.add({ kind: 'zone', x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.8, r: K.ROCK_R, delay: (1.1 + i / ev.n * 1.6) * tierOf(S.diff).tele,   // (D9: shorter telegraphs)
                        dmg: Math.round(dmg), type: 'rock', color: '#c8a26a' });
        entry.spawned++;
      }
      say('¡Avalancha! Sal de los círculos', 2.6); G.Audio.sfx('surge');
    } else if (ev.kind === 'elite') {
      const a0 = rng() * 6.2832;
      for (let i = 0; i < ev.n; i++) {
        const dex = ev.dex[i % ev.dex.length], pt = spot(rng, p, a0 + i / ev.n * 6.2832, G.Sprites.hovers(dex));
        if (pt) add(spawn(dex, pt[0], pt[1], t, { hp: K.ELITE.hp, dmg: K.ELITE.dmg, xp: K.ELITE.xp, scale: K.ELITE.scale, kind: 'elite' }));
      }
      say('¡Oleada de élite!', 2.6); G.Audio.sfx('surge');
    } else if (ev.kind === 'totem') {
      const pt = spot(rng, p, rng() * 6.2832, G.Sprites.hovers(ev.dex[0]));
      if (pt) add(spawn(ev.dex[0], pt[0], pt[1], t, { ti: 1, hp: K.TOTEM.hp, dmg: K.TOTEM.dmg, xp: K.TOTEM.xp, scale: K.TOTEM.scale, spd: K.TOTEM.spd, kind: 'totem' }));
      say(G.I18n.f('¡{x} dominante llama a los suyos!', name(ev.dex[0])), 3); G.Audio.sfx('boss');
    } else if (ev.kind === 'roam') {   // (D20: a legendary roams the zone, and leaves after K.ROAM.life s)
      const pt = spot(rng, p, rng() * 6.2832, G.Sprites.hovers(ev.dex[0]));
      if (pt) add(spawn(ev.dex[0], pt[0], pt[1], t, { ti: 1, hp: K.ROAM.hp, dmg: K.ROAM.dmg, xp: K.ROAM.xp, scale: K.ROAM.scale, kind: 'roam' }));
      say(G.I18n.f('¡Un {x} legendario merodea por la zona!', name(ev.dex[0])), 3.2); G.Audio.sfx('boss');
    } else if (ev.kind === 'summoner') {
      const pt = spot(rng, p, rng() * 6.2832, true, Rr * 0.7);
      const minion = MAPS[S.map].minion[ev.dex[0]] || ev.dex[0];
      if (pt) add(spawn(ev.dex[0], pt[0], pt[1], t, { ti: 1, hp: K.SUMMONER.hp, dmg: K.SUMMONER.dmg, xp: K.SUMMONER.xp, scale: K.SUMMONER.scale, spd: 0, behavior: 'summoner', minion, kind: 'summoner' }));
      say(G.I18n.f('¡{x} invocador!', name(ev.dex[0])), 3); G.Audio.sfx('boss');
    }
    return entry;
  }
  /** Alphas and totems drop a prize; totems call allies; a summoner leaves after its time. */
  function tickSpecials(dt, t, players) {
    for (const [id, s] of S.specials) {
      const e = s.e;
      if (e.dead) {
        if (s.kind === 'alpha') {   // (D8: it faints; a Friend Ball makes it a Support Alpha, and it drops its prize only if you leave it)
          if (!(G.ExpCap && G.ExpCap.alphaDown(e))) {
            G.Pickups.drop('item', e.x - 20, e.y, G.Items.roll());
            G.Pickups.drop('heal', e.x + 20, e.y, 0);
          }
        } else if (s.kind === 'totem' || s.kind === 'summoner') G.Pickups.drop('heal', e.x, e.y, 0);
        else if (s.kind === 'roam') { G.Pickups.drop('item', e.x - 20, e.y, G.Items.roll()); G.Pickups.drop('heal', e.x + 20, e.y, 0); }   // (D20)
        S.specials.delete(id);
        continue;
      }
      if (!G.EnemyMgr.get(id)) { S.specials.delete(id); continue; }
      if (s.kind === 'totem' && (s.next -= dt) <= 0) {
        s.next = K.TOTEM.every;
        if (G.EnemyMgr.count < capNow() + 10) for (let i = 0; i < K.TOTEM.calls; i++) {
          const dex = S.plan.cards[Math.floor(s.rng() * Math.min(S.plan.cards.length, 6))], a = s.rng() * 6.2832;
          const x = e.x + Math.cos(a) * (e.r + 40), y = e.y + Math.sin(a) * (e.r + 30);
          if (G.World.isFree(x, y, 12) || G.Sprites.hovers(dex)) spawn(dex, x, y, t);
        }
        G.FX.ring(e.x, e.y, e.r, e.r * 4, '#c47bff', 0.5, 4);
      } else if (s.kind === 'summoner' && t - s.t0 > K.SUMMONER.life) {
        e.behavior = 'thief'; e.life = 0;   // (the base "it got away" exit: gone this step, no drop)
        S.specials.delete(id);
      } else if (s.kind === 'roam' && t - s.t0 > K.ROAM.life) {   // (D20: a roaming legendary moves on)
        e.behavior = 'thief'; e.life = 0;
        S.specials.delete(id);
        say(G.I18n.f('¡{x} se ha marchado!', G.DEX_BY[e.dex] ? G.I18n.t(G.DEX_BY[e.dex].name) : ''), 2.6);
      }
    }
  }

  // ---------------- the `x` block's `c` (viewers and guests) ----------------
  const KCODE = { alpha: 1, elite: 2, totem: 3, summoner: 4, guardian: 5, legend: 6, roam: 7 };   // (D20: + roam; an older viewer ignores 7)
  const KNAME = Object.fromEntries(Object.entries(KCODE).map(([k, v]) => [v, k]));
  const KSCALE = { alpha: K.ALPHA.scale, elite: K.ELITE.scale, totem: K.TOTEM.scale, summoner: K.SUMMONER.scale, roam: K.ROAM.scale };
  /**
   * The host's `c`: {s: zone start (run ds), p: phase (0 altar / 1 guardian / 2 portal / 3 legendary / 4 won), q: altar
   * charge 0-8, f: bits (1 final swarm, 2 won), n: timeline events fired, d: difficulty index, k: [id, kind, ...] the
   * special enemies, b: [boss id, exhaustion x10] while a boss is up}. Null outside a Classic run.
   */
  function xblockC() {
    if (!on()) return null;
    const c = { s: Math.round(S.zs * 10), p: S.ph, q: Math.round(S.charge * 8), f: (S.fs ? 1 : 0) | (S.won ? 2 : 0), n: S.n, d: diffIdx(S.diff) };
    if (S.surv) c.v = 1;   // (D11: a Survival run: no altar; its own state is the x block's `s`, js/expedition/survival.js)
    const k = [];
    for (const [id, s] of S.specials) if (!s.e.dead) k.push(id, KCODE[s.kind]);
    if (k.length) c.k = k;
    if (S.boss && !S.boss.dead) c.b = [S.boss.id, Math.round(Math.max(1, S.boss.takenK || 1) * 10)];
    return c;
  }
  /** A viewer / guest: a snapshot's / host frame's `c` (null: none). */
  function applyC(c) {
    if (!c) { view = null; return; }
    const prevN = view && view.z === (G.World.zone && G.World.zone.zone) ? view.n : null;
    view = { z: G.World.zone ? G.World.zone.zone : 0, zs: (c.s || 0) / 10, ph: c.p | 0, charge: (c.q || 0) / 8, fs: !!(c.f & 1), won: !!(c.f & 2), n: c.n | 0,
             diff: DIFFS[c.d | 0] || 'normal', bossEx: c.b ? c.b[1] / 10 : 0, bossId: c.b ? c.b[0] : 0, surv: !!c.v };
    const k = c.k || [];
    for (let i = 0; i + 1 < k.length; i += 2) {
      const e = G.EnemyMgr.get(k[i]), kind = KNAME[k[i + 1]];
      if (!e || !e.remote || e.xk === kind) continue;
      e.xk = kind;
      if (KSCALE[kind]) setScale(e, KSCALE[kind]);
    }
    // a spectator sees the event banners too (a co-op guest already gets the host's)
    if (prevN != null && view.n > prevN && G.Game.state === 'watch' && !view.surv) {
      const z = G.World.zone, P = z && MAPS[z.map] ? planFor(z) : null, ev = P && P.events[view.n - 1];
      if (ev) G.Spawner.say(bannerOf(ev), 2.6, true);
    }
  }
  let planCache = null;
  function planFor(z) {
    const key = [z.seed, z.map, z.zone, view ? view.diff : 'normal'].join(':');
    if (!planCache || planCache.key !== key) planCache = { key, p: plan(z.seed, z.map, z.zone, view ? view.diff : 'normal') };
    return planCache.p;
  }
  function bannerOf(ev) {
    const name = (G.DEX_BY[ev.dex[0]] || {}).name || '';
    return { alpha: G.I18n.f('¡Un {x} alfa aparece!', name), swarm: '¡Enjambre! Te rodean', stampede: G.I18n.f('¡Estampida de {x}!', name),
             flock: (MAPS[(G.World.zone && G.World.zone.map)] || {}).flockSay || '¡Una bandada cruza el bosque!', rockslide: '¡Avalancha! Sal de los círculos', elite: '¡Oleada de élite!',
             totem: G.I18n.f('¡{x} dominante llama a los suyos!', name), summoner: G.I18n.f('¡{x} invocador!', name) }[ev.kind] || '';
  }

  /** What the HUD and the painter show: the host's state, or a viewer's copy. */
  function cur() {
    const z = G.World.zone;
    if (!z || !MAPS[z.map]) return null;
    if (on() && S.zone === z.zone) return { zone: S.zone, zs: S.zs, ph: S.ph, charge: S.charge, fs: S.fs, won: S.won, bossEx: S.boss && S.boss.takenK > 1 ? S.boss.takenK : 0, boss: S.boss, diff: S.diff, surv: S.surv };
    if (view) return { zone: z.zone, zs: view.zs, ph: view.ph, charge: view.charge, fs: view.fs, won: view.won, bossEx: view.bossEx, boss: view.bossId ? G.EnemyMgr.get(view.bossId) : null, diff: view.diff, surv: view.surv };
    return null;
  }
  const active = () => !!cur();

  // ---------------- drawing (in code, no image assets) ----------------
  const AURA = { alpha: '#ff4d5e', elite: '#ffcb3d', totem: '#c47bff', summoner: '#4fe0d0', guardian: null, legend: null };
  let shrineMon = null;
  /** Under everything (game.js drawScene, after the hazards): the altar / portal / shrine and the special enemies' auras. */
  function drawGround(ctx) {
    if (G.ExpMoves) G.ExpMoves.draw(ctx);   // (D5: the new archetypes' shells, vortexes, waves; the items' rifts)
    if (G.ExpItems) G.ExpItems.draw(ctx);
    if (G.ExpEco) G.ExpEco.drawGround(ctx);   // (D7: the interactables)
    if (G.ExpRx) G.ExpRx.drawGround(ctx);     // (D8: wet and chilled foes)
    if (G.ExpCap) G.ExpCap.drawGround(ctx);   // (D8: the League / shiny encounters' auras)
    if (G.ExpSurv) G.ExpSurv.drawGround(ctx);   // (D11: Survival's hostile terrain)
    const c = cur(), z = G.World.zone, si = c && sitesOf(z);
    if (!si) return;
    const now = performance.now() / 1000, [x, y] = siteXY(si.altar), cam = G.Camera;
    if (cam.sees(x, y, 160)) {
      if (si.shrine) drawShrine(ctx, x, y, c, now);
      else if (!c.surv) drawAltar(ctx, x, y, c, now);   // (D11: Survival has no altar: the site is its migration portal's)
      if (c.ph === 2) drawPortal(ctx, x, y, now);
    }
    for (const e of G.EnemyMgr.all()) {
      const col = e.xk && AURA[e.xk];
      if (!col || e.dead || !cam.sees(e.x, e.y, 60)) continue;
      ctx.save();
      ctx.globalAlpha = 0.28 + Math.sin(now * 5 + e.id) * 0.08;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.5, e.r * 0.75, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.7; ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.7, e.r * 0.85, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
  }
  function drawAltar(ctx, x, y, c, now) {
    const R = K.ALTAR_R * TSz();
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.ellipse(x, y + 3, R + 4, (R + 4) * 0.6, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#8e8a7c'; ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.6, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#a9a594'; ctx.beginPath(); ctx.ellipse(x, y - 2, R - 5, (R - 5) * 0.6, 0, 0, 6.2832); ctx.fill();
    // runes round the rim
    ctx.fillStyle = c.ph === 0 ? '#5d6b8a' : '#3f4656';
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.2832 + now * 0.2; ctx.fillRect(Math.round(x + Math.cos(a) * (R - 10) - 2), Math.round(y - 2 + Math.sin(a) * (R - 10) * 0.6 - 2), 4, 4); }
    // the charge: a gold arc round the rim
    if (c.ph === 0 && c.charge > 0) {
      ctx.strokeStyle = '#ffd95e'; ctx.lineWidth = 4; ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.ellipse(x, y - 2, R - 2, (R - 2) * 0.6, 0, -Math.PI / 2, -Math.PI / 2 + c.charge * 6.2832); ctx.stroke();
      ctx.globalAlpha = 0.25 * c.charge; ctx.fillStyle = '#ffd95e';
      ctx.beginPath(); ctx.ellipse(x, y - 2, R - 5, (R - 5) * 0.6, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // the stone in the middle
    ctx.fillStyle = '#6f6b5f'; ctx.fillRect(x - 7, y - 26, 14, 24);
    ctx.fillStyle = '#c6c1ad'; ctx.fillRect(x - 7, y - 30, 14, 5);
    ctx.fillStyle = c.ph === 0 ? (Math.sin(now * 3) > 0 ? '#ffe9a8' : '#ffd95e') : '#55607a';
    ctx.fillRect(x - 2, y - 20, 4, 8);
    ctx.restore();
  }
  function drawPortal(ctx, x, y, now) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const k = 1 - i * 0.2;
      ctx.globalAlpha = 0.25 + i * 0.15;
      ctx.fillStyle = i % 2 ? '#7fe0ff' : '#a06bff';
      ctx.beginPath(); ctx.ellipse(x, y - 4, 34 * k, 22 * k, 0, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#e2d0ff'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -now * 30;
    ctx.beginPath(); ctx.ellipse(x, y - 4, 38, 25, 0, 0, 6.2832); ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      const a = now * 2 + i, r = 12 + ((now * 20 + i * 7) % 24);
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.8;
      ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 4 + Math.sin(a) * r * 0.65), 2, 2);
    }
    ctx.restore();
  }
  function drawShrine(ctx, x, y, c, now) {
    ctx.save();
    const R = K.ALTAR_R * TSz();
    ctx.fillStyle = '#d8d0c0'; ctx.beginPath(); ctx.ellipse(x, y, R + 6, (R + 6) * 0.6, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#efe7d4'; ctx.beginPath(); ctx.ellipse(x, y - 3, R - 2, (R - 2) * 0.6, 0, 0, 6.2832); ctx.fill();
    if (c.ph === 0 && c.charge > 0) {
      ctx.strokeStyle = '#ff9ed8'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(x, y - 3, R, R * 0.6, 0, -Math.PI / 2, -Math.PI / 2 + c.charge * 6.2832); ctx.stroke();
    }
    // two pillars
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#bdb39c'; ctx.fillRect(x + s * (R + 2) - 5, y - 44, 10, 40);
      ctx.fillStyle = '#f4ecd8'; ctx.fillRect(x + s * (R + 2) - 7, y - 48, 14, 5);
    }
    // the legendary, faint, above the pedestal until it wakes
    if (c.ph === 0) {
      const dex = MAPS[G.World.zone.map].legend;
      if (!shrineMon || shrineMon.dex !== dex) { shrineMon = new G.Sprites.Animator(dex, 1); G.Sprites.preload([dex], 8000); }
      shrineMon.loop('Idle'); shrineMon.update(1 / 60);
      ctx.globalAlpha = 0.45 + Math.sin(now * 2) * 0.15;
      shrineMon.draw(ctx, x, y - 18 - Math.sin(now * 1.6) * 4);
    }
    ctx.restore();
  }

  // ---------------- the HUD (js/ui/hud.js) ----------------
  const mmss = s => G.U.mmss(Math.max(0, s));
  /** The line under the clock (already translated: drawn as a String object, like the Tower's). */
  function hudLine(pl, st) {
    const c = cur();
    if (!c) return '';
    if (c.surv) return G.ExpSurv ? G.ExpSurv.hudLine(pl, st, c) : '';   // (D11)
    const T = G.I18n, zt = (st ? st.time : G.Game.st.time) - c.zs, si = sitesOf(G.World.zone);
    const parts = [c.zone === 4 ? T.t('SANTUARIO') : T.f('ZONA {x}/3', c.zone)];
    if (c.diff && c.diff !== 'normal') parts.push(T.t(DIFF_NAME[c.diff]).toUpperCase());   // (D9: the tier, on Hard / Nightmare)
    if (c.zone <= 3 && c.ph < 2) parts.push(c.fs ? T.t('¡ENJAMBRE FINAL!') : T.f('ENJAMBRE FINAL EN {x}', mmss(K.FINAL - zt)));
    const dist = () => si && pl ? Math.round(G.U.dist(pl.x, pl.y, ...siteXY(si.altar)) / 32) : 0;
    if (c.ph === 0) parts.push(si && si.shrine ? ((G.DEX_BY[MAPS[G.World.zone.map].legend] || {}).name || '').toUpperCase() + ' ' + dist() + ' m' : T.f('ALTAR {x} m', dist()));
    else if (c.ph === 1) parts.push(T.t('GUARDIÁN'));
    else if (c.ph === 2) parts.push(T.f('PORTAL {x} m', dist()));
    else if (c.ph === 3) parts.push(T.t('LEGENDARIO'));
    else parts.push(T.t('¡COMPLETADO!'));
    if (pl) parts.push('₽ ' + Math.floor(pl.coins || 0));   // (D7: the run's ₽)
    return parts.join('  ·  ');
  }
  const hudColor = () => { const c = cur(); if (c && c.surv && G.ExpSurv) return G.ExpSurv.hudColor(c); return c && c.fs && c.ph < 2 ? (Math.sin(performance.now() / 150) > 0 ? '#ff6b7a' : '#ffb0b8') : c && c.ph === 4 ? '#ffd23f' : '#9fd8a8'; };
  /** Over the HUD: an arrow to the altar / portal / shrine when it is off screen, and the boss's exhaustion. */
  function drawHud(ctx, w, h, pl, st, F, mark) {
    if (G.ExpEco) G.ExpEco.drawHud(ctx, w, h, pl, F, mark);   // (D7: the interactables' labels and the tips)
    if (G.ExpCap) G.ExpCap.drawHud(ctx, w, h, pl, F, mark);   // (D8: the Support Alphas' chips, the encounters' labels and arrows)
    if (G.ExpSurv) G.ExpSurv.drawHud(ctx, w, h, pl, F, mark);   // (D11: Survival's siege warning and the night / wounds chips)
    const c = cur(), si = c && sitesOf(G.World.zone);
    if (!si || !pl) return;
    const k = G.HUD ? G.HUD.k : 1, cam = G.Camera, now = performance.now() / 1000;
    if (c.bossEx > 1) {
      const txt = new String(G.I18n.f('AGOTADO ×{x}', c.bossEx.toFixed(1)));   // eslint-disable-line no-new-wrappers
      ctx.save(); ctx.textAlign = 'center'; ctx.font = F(800, 11);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(txt, w / 2, 96);
      ctx.fillStyle = '#c9a6ff'; ctx.fillText(txt, w / 2, 96);
      ctx.restore();
      if (mark) mark('exhaust', w / 2 - 60, 85, 120, 14);
    }
    if (c.ph !== 0 && c.ph !== 2) return;
    if (c.surv && c.ph !== 2) return;   // (D11: Survival points only at an open migration portal)
    const [wx, wy] = siteXY(si.altar);
    const sx = (wx - cam.left()) * cam.scale / k, sy = (wy - 30 - cam.top()) * cam.scale / k;
    if (sx > 0 && sx < w && sy > 0 && sy < h) return;
    // (kept clear of the HUD: the minimap on the left, the buttons down the right, the move bar at the bottom; D6: the
    //  Ultimate's button and meter are always on the right in a zone, so the column is kept clear without touch too)
    const touch = G.Touch.active && G.Game.state !== 'watch', M = 46, mm = G.HUD && G.HUD.minimap;
    let ey = G.U.clamp(sy, M + 80, h - M - (touch ? 120 : 90));
    let ex = G.U.clamp(sx, M, w - M - 200);
    if (mm && ex - 30 < mm.x + mm.s && ex + 30 > mm.x && ey + 30 > mm.y && ey - 30 < mm.y + mm.s) ex = mm.x + mm.s + 36;
    // (D7: and clear of a first-run tip's box, under it)
    const tb = G.ExpEco && G.ExpEco.tipRect();
    if (tb && ex - 30 < tb.x + tb.w && ex + 30 > tb.x && ey + 30 > tb.y && ey - 30 < tb.y + tb.h) ey = tb.y + tb.h + 34;
    // (D8: and clear of the Support Alphas' chips, to their right)
    const sr = G.ExpCap && G.ExpCap.hudRect;
    if (sr && ex - 30 < sr.x + sr.w && ex + 30 > sr.x && ey + 30 > sr.y && ey - 30 < sr.y + sr.h) ex = sr.x + sr.w + 36;
    const a = Math.atan2(sy - ey, sx - ex);
    if (mark) mark('xarrow', ex - 30, ey - 30, 60, 60);
    const col = c.ph === 2 ? '#b48aff' : si.shrine ? '#ff9ed8' : '#ffd95e', beat = 0.5 + Math.sin(now * 6) * 0.5;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.globalAlpha = 0.2 + beat * 0.2; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, 22 + beat * 6, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); ctx.lineTo(Math.cos(a + 2.45) * 15, Math.sin(a + 2.45) * 15); ctx.lineTo(Math.cos(a - 2.45) * 15, Math.sin(a - 2.45) * 15); ctx.closePath();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.stroke(); ctx.fillStyle = col; ctx.fill();
    ctx.font = F(800, 10); ctx.textAlign = 'center';
    const lbl = new String(G.I18n.t(c.ph === 2 ? 'PORTAL' : si.shrine ? 'SANTUARIO' : 'ALTAR'));   // eslint-disable-line no-new-wrappers
    ctx.lineWidth = 3; ctx.strokeText(lbl, -Math.cos(a) * 30, -Math.sin(a) * 26 + 4); ctx.fillText(lbl, -Math.cos(a) * 30, -Math.sin(a) * 26 + 4);
    ctx.restore();
  }

  // ---------------- the end of the run ----------------
  const INV = 1e9;   // splits / clear times are kept as INV - deciseconds, so the save's max-merge keeps the FASTEST
  const pbKey = (map, diff, z) => 'split.' + map + '.' + diff + '.z' + z;
  /** D9: the score's parts {kills, time, dmg, zone, bosses, won, catches} (whole numbers: the server recomputes the score from them). */
  function scoreParts(sum) {
    if (S && S.surv && G.ExpSurv) return G.ExpSurv.scoreParts(sum);   // (D11: Survival's own parts)
    return { kills: Math.floor(sum.kills || 0), time: Math.floor(sum.time || 0), dmg: Math.floor(G.DmgLog.summary([]).total || 0), zone: S ? S.zone : 1,
             bosses: sum.bosses | 0, won: !!(S && S.won), catches: G.ExpCap && G.ExpCap.run ? G.ExpCap.run.n | 0 : 0 };
  }
  /** The score (study 2.12, Classic, + D9's catch term): G.ExpTier.score of the parts on the run's tier. */
  function score(sum) {
    if (S && S.surv && G.ExpSurv) return G.ExpSurv.score(sum);   // (D11)
    const p = scoreParts(sum), tier = S ? diffIdx(S.diff) : 0;
    return G.ExpTier ? G.ExpTier.score(p, S ? S.diff : 'normal')
      : Math.floor((2 * p.kills + 3 * p.time + p.dmg / 200 + 1500 * (p.zone - 1) + 800 * p.bosses + (p.won ? 6000 : 0)) * (1 + 0.5 * tier));
  }
  /**
   * The run-over screen's parts (js/expedition/core.js run.end): {won, title, lines, splits: [{label, t, best, delta}]}
   * against the best splits in the Expedition save (read before this run is recorded).
   */
  function result() {
    if (!S) return null;
    if (S.surv) return G.ExpSurv ? G.ExpSurv.result() : null;   // (D11)
    const Sv = G.ExpSave, names = [1, 2, 3].map(z => G.I18n.f('Zona {x}', z)).concat([G.I18n.t('Santuario')]);
    const splits = [];
    for (let z = 1; z <= 4; z++) {
      const t = S.splits[z - 1];
      if (t == null) continue;
      const pb = Sv.get(pbKey(S.map, S.diff, z)), best = pb ? (INV - pb) / 10 : null;
      splits.push({ zone: z, label: names[z - 1], t: Math.round(t * 10) / 10, best, delta: best != null ? Math.round((t - best) * 10) / 10 : null });
    }
    const where = S.won ? '¡Mapa completado!' : S.zone === 4 ? 'Llegaste al santuario' : G.I18n.f('Llegaste a la zona {x}', S.zone);
    const lines = [G.I18n.t(MAPS[S.map].name) + ' · ' + G.I18n.t(DIFF_NAME[S.diff]), where];
    const pbAll = Sv.get('clear.' + S.map + '.' + S.diff);
    if (S.won && (!pbAll || S.splits[3] * 10 < INV - pbAll)) lines.push('¡Nuevo récord del mapa!');
    return { won: S.won, title: S.won ? '¡EXPEDICIÓN COMPLETADA!' : null, lines, splits, zone: S.zone, map: S.map, diff: S.diff };
  }
  /** The run into the Expedition save: wins, the best clear and the best split of each zone (never the base save). */
  function record() {
    if (!S) return;
    if (S.surv) { if (G.ExpSurv) G.ExpSurv.record(); return; }   // (D11)
    const Sv = G.ExpSave;
    for (let z = 1; z <= 4; z++) if (S.splits[z - 1] != null) Sv.best(pbKey(S.map, S.diff, z), INV - Math.round(S.splits[z - 1] * 10));
    Sv.best('zone.' + S.map + '.' + S.diff, S.zone);
    if (S.won) { Sv.bump('wins.' + S.map + '.' + S.diff); Sv.best('clear.' + S.map + '.' + S.diff, INV - Math.round(S.splits[3] * 10)); }
  }

  return {
    K, KINDS, TIMELINE, MAPS, MAP_IDS, DIFFS, plan, poolOf, wanderPool, rare5, roamers, shrine, build, sitesOf, siteXY, bossHp, exhaustion, dps, defOf,
    begin, reset, update, xblockC, applyC, cur, active, drawGround, drawHud, hudLine, hudColor, score, scoreParts, result, record, tierOf,
    zIdx, setPhase, makeBoss, escorts,   // (D11: Survival's engine room, js/expedition/survival.js)
    /** D11: one timeline event ({at, kind, n, dex, seed}: plan()'s shape) fired now round the players. */
    fireEvent(ev, players) { return on() ? fire(ev, G.Game.st.time, players) : null; },
    /** D7: a foe of the zone at (x, y) (the interactables' waves and ambushes); null outside a Classic run. */
    spawnFoe(dex, x, y, o) { return on() ? spawn(dex, x, y, G.Game.st.time, o || {}) : null; },
    /** D7: a free spot round point p at distance d, from the stream rng. */
    spotNear(rng, p, ang, flying, d) { return on() ? spot(rng, p, ang, flying, d) : null; },
    get run() { return S; }, get view() { return view; }, get on() { return on(); },
    /** For tests: jump the zone clock to `sec` (events between are fired on the next step, in order). */
    debugZoneTime(sec) { if (S) S.zs = G.Game.st.time - sec; }
  };
})();
