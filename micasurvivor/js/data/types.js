/* ============ types.js — tabla de tipos ============
 * La de los juegos (6.ª gen. en adelante), con SUS números (el dueño, 2026-11-13: "the full typing system of
 * effectiveness from the full Pokemon game", Plans/MICASURVIVOR_TYPES_VFX_PLAN.md, parte A):
 *
 *   ×2 muy eficaz    ×0,5 poco eficaz    ×0 inmune
 *
 * Con dos tipos se multiplican (×4, ×0,25, ×0), sin tope. Hasta ese día estaba suavizada (×1,6 / ×0,6 / ×0,3, con
 * tope en [×0,3, ×2,4]).
 * Se usa en los dos sentidos: tus ataques contra los enemigos y los de los enemigos contra ti (su tipo principal, o
 * el de su disparo). Los tres juegos leen ESTA tabla: el 2D, y la Expedición y el Dive en 3D (m3d/combat.js dataFrom).
 *
 * Sin callejón sin salida (STRUGGLE): si NINGUNO de tus movimientos de daño puede herir a un enemigo (es inmune a
 * todos), tus golpes contra él entran como Forcejeo: ×0,25, peor que casi cualquier golpe resistido, pero nunca cero.
 * Con un solo movimiento que sí le haga daño, los demás le hacen ×0 de verdad.
 *
 * Decisiones del dueño, 2026-11-14 ("x0 on enemies only", "Add both"):
 *   - El ×0 es sólo CONTRA LOS ENEMIGOS. Tú nunca eres del todo inmune a un ataque: lo que sería ×0 contra ti es
 *     ×0,25 (PLAYER_MIN; multIn).
 *   - STAB: un movimiento de uno de tus tipos hace ×1,5 (STAB). Los enemigos atacan siempre con su propio tipo, así
 *     que a ellos no se les aplica: sería sólo un +50 % a todo lo que recibes.
 *   - Inmunidades de habilidad (ABILITY_IMMUNE, con la habilidad que cada especie tiene en systems/abilities.js):
 *     Levitación a Tierra, Absorbe Agua a Agua, Absorbe Elec a Eléctrico, Absorbe Fuego a Fuego, Herbívoro a Planta.
 *     Un ENEMIGO con una de ellas es inmune (×0) a ese tipo; tú, con una de ellas, recibes ×0,25 de ese tipo.
 */
G.Types = (() => {
  // atacante -> { defensor: multiplicador de los juegos } (los ×1 no se apuntan)
  const CHART = {
    normal:   { rock: .5, ghost: 0, steel: .5 },
    fire:     { fire: .5, water: .5, grass: 2, ice: 2, bug: 2, rock: .5, dragon: .5, steel: 2 },
    water:    { fire: 2, water: .5, grass: .5, ground: 2, rock: 2, dragon: .5 },
    electric: { water: 2, electric: .5, grass: .5, ground: 0, flying: 2, dragon: .5 },
    grass:    { fire: .5, water: 2, grass: .5, poison: .5, ground: 2, flying: .5, bug: .5, rock: 2, dragon: .5, steel: .5 },
    ice:      { fire: .5, water: .5, grass: 2, ice: .5, ground: 2, flying: 2, dragon: 2, steel: .5 },
    fighting: { normal: 2, ice: 2, poison: .5, flying: .5, psychic: .5, bug: .5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: .5 },
    poison:   { grass: 2, poison: .5, ground: .5, rock: .5, ghost: .5, steel: 0, fairy: 2 },
    ground:   { fire: 2, electric: 2, grass: .5, poison: 2, flying: 0, bug: .5, rock: 2, steel: 2 },
    flying:   { electric: .5, grass: 2, fighting: 2, bug: 2, rock: .5, steel: .5 },
    psychic:  { fighting: 2, poison: 2, psychic: .5, dark: 0, steel: .5 },
    bug:      { fire: .5, grass: 2, fighting: .5, poison: .5, flying: .5, psychic: 2, ghost: .5, dark: 2, steel: .5, fairy: .5 },
    rock:     { fire: 2, ice: 2, fighting: .5, ground: .5, flying: 2, bug: 2, steel: .5 },
    ghost:    { normal: 0, psychic: 2, ghost: 2, dark: .5 },
    dragon:   { dragon: 2, steel: .5, fairy: 0 },
    dark:     { fighting: .5, psychic: 2, ghost: 2, dark: .5, fairy: .5 },
    steel:    { fire: .5, water: .5, electric: .5, ice: 2, rock: 2, steel: .5, fairy: 2 },
    fairy:    { fire: .5, fighting: 2, poison: .5, dragon: 2, dark: 2, steel: .5 }
  };
  const STRUGGLE = 0.25, PLAYER_MIN = 0.25, STAB = 1.5;
  // El dueño, 2026-11-14: los enemigos que llegan y los jefes tienen un 5 % más de vida, por el STAB. Primero fue un 22 %
  // (la cuenta, tools/micasurvivor/type_balance.mjs, daba +31 % de daño con el STAB); jugado, el STAB apenas sube los KO
  // (la tabla real, más dura con las resistencias, se come casi todo) y el 22 % dejaba un 13 % menos de KO que antes:
  // "yes cut". Lo leen data/enemies.js (scale, bossScale) y m3d/combat.js (addEnemy, addBoss).
  const ENEMY_HP = 1.05;
  const ABILITY_IMMUNE = { levitate: 'ground', waterabsorb: 'water', voltabsorb: 'electric', flashfire: 'fire', sapsipper: 'grass' };
  /** El tipo al que una especie es inmune por su habilidad, o undefined. */
  const immuneBy = dex => (dex != null && G.Abilities && G.Abilities.of ? ABILITY_IMMUNE[G.Abilities.of(dex)] : undefined);

  /** Multiplicador de un ataque de tipo `atk` contra un Pokémon de tipos `def`: 0, 0,25, 0,5, 1, 2 o 4.
   *  @param dex  la especie que lo recibe, si es un ENEMIGO: su habilidad puede hacerlo inmune (×0). */
  function mult(atk, def, dex) {
    if (dex != null && atk && immuneBy(dex) === atk) return 0;
    const row = CHART[atk];
    if (!row || !def) return 1;
    let m = 1;
    for (const t of def) if (row[t] != null) m *= row[t];
    return m;
  }

  /** …de un ataque CONTRA TI (o tu compañero): nunca ×0; lo que sería inmune es ×0,25. */
  function multIn(atk, def) { const m = mult(atk, def); return m === 0 ? PLAYER_MIN : m; }

  /** 'super' | 'weak' | 'immune' | null, para enseñar el aviso (y para lo que depende de él: Cinta Experto…). */
  function label(m) { return m === 0 ? 'immune' : m > 1 ? 'super' : m < 1 ? 'weak' : null; }

  /** ¿Ninguno de estos movimientos puede herir a un Pokémon de tipos `def`? (los de apoyo y los sin tipo no cuentan) */
  function noAnswer(moves, def, dex) {
    let any = false;
    for (const m of moves || []) { if (!m || m.kind === 'buff' || !m.type) continue; any = true; if (mult(m.type, def, dex) > 0) return false; }
    return any;
  }

  /** El aviso "Inmune" sobre `o` (un enemigo, tú): como mucho uno cada 0,7 s por cuerpo. */
  function showImmune(o) {
    const now = performance.now();
    if (o.immAt != null && now - o.immAt < 700) return;
    o.immAt = now;
    if (G.FX) G.FX.dmgText(o.x, o.y - (o.bodyH || 0) - 4, 'Inmune', '#a3abb8');
  }

  return { CHART, STRUGGLE, PLAYER_MIN, STAB, ENEMY_HP, ABILITY_IMMUNE, immuneBy, mult, multIn, label, noAnswer, showImmune };
})();
