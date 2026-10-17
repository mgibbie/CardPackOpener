/* ============ items.js — objetos equipables (uno por run) ============
 * Se encuentran en los cofres (a veces en los normales, a menudo en los de
 * candado) y los sueltan los jefes. Sólo puedes llevar UNO; si encuentras
 * otro, eliges con cuál quedarte. Duran lo que dura la run.
 * MicaSurvivor (M5 lote 3): +15 objetos del port de Android (types_data.gd ITEMS, con los
 * números de main.gd), y con la mejora Mochila se llevan DOS (Player.itemSlots()).
 *
 *   on(pl)   se lo pones (lo que hace mientras lo llevas)
 *   off(pl)  se lo quitas (deshace lo de on)
 *   only     (opcional) los Pokémon que pueden usarlo: sólo les sale a ellos (main.gd _item_ok_for)
 *   instant  (opcional) se gasta al cogerlo y no ocupa hueco (Caramelo Raro)
 * Los que reaccionan a algo (golpe mortal, daño hecho...) los mira el
 * jugador con pl.hasItem(id).
 */
G.Items = (() => {
  const nop = () => {};
  // Números del port (main.gd): Baya Zidra 1866-1870, Seguro Debilidad 1863-1865 y _atk(),
  // Incienso Puro 3213-3216 / 3261 / 5379, Hielo Eterno 3971, Periscopio 2521, Lente Amplia
  // 1412, Esfera Colosal 1399, Bola Luminosa / Hueso Grueso 1433-1439 y 2502-2505.
  const SITRUS = { below: 0.5, heal: 0.3, every: 90 };
  const WPOLICY = { atk: 1.5, dur: 8 };
  const INCENSE = { rate: 0.75, hp: 1.3, xp: 1.5, coins: 1.25 };
  const ICE = { slow: 0.3, dur: 2 };
  const SCOPE = 0.15, WIDE = 1.2, BIG = 1.3;
  const LIGHTBALL = [172, 25, 26], THICKCLUB = [104, 105];

  const LIST = [
    { id: 'leftovers', name: 'Restos', desc: 'Recuperas un 1,5% de tu vida por segundo.',
      on: p => { p.regenFlat += p.maxHp * 0.015; p._itemRegen = p.maxHp * 0.015; },
      off: p => { p.regenFlat -= p._itemRegen || 0; } },
    { id: 'choiceband', name: 'Cinta Elección', desc: '+40% de daño, pero no puedes cambiar de movimiento.',
      on: p => { p.atkMul *= 1.4; }, off: p => { p.atkMul /= 1.4; } },
    { id: 'quickclaw', name: 'Garra Rápida', desc: '-20% de recarga en todos tus movimientos.',
      on: p => { p.cdMul *= 0.8; }, off: p => { p.cdMul /= 0.8; } },
    { id: 'focussash', name: 'Banda Focus', desc: 'Un golpe que te dejaría KO te deja con 1 de vida (cada 60 s).',
      on: nop, off: nop },
    { id: 'shellbell', name: 'Cascabel Concha', desc: 'Recuperas vida con el daño que haces.',
      on: nop, off: nop },
    { id: 'amuletcoin', name: 'Moneda Amuleto', desc: '+50% de Pokémonedas al acabar la run.',
      on: p => { p.coinMul *= 1.5; }, off: p => { p.coinMul /= 1.5; } },
    { id: 'luckyegg', name: 'Huevo Suerte', desc: '+30% de experiencia.',
      on: p => { p.xpMul *= 1.3; }, off: p => { p.xpMul /= 1.3; } },
    { id: 'lifeorb', name: 'Vidasfera', desc: '+30% de daño, pero cada ataque te quita un poco de vida.',
      on: p => { p.atkMul *= 1.3; }, off: p => { p.atkMul /= 1.3; } },
    { id: 'choicescarf', name: 'Pañuelo Elección', desc: '+35% de velocidad.',
      on: p => { p.spdMul *= 1.35; }, off: p => { p.spdMul /= 1.35; } },
    { id: 'rockyhelmet', name: 'Casco Dentado', desc: 'Los que te golpean cuerpo a cuerpo reciben daño.',
      on: nop, off: nop },
    // ---- MicaSurvivor (M5 lote 3): los del port de Android, en su orden ----
    { id: 'eternalice', name: 'Hielo Eterno', desc: 'Los enemigos que te golpean van un 30% más lentos durante 2 s.',
      on: nop, off: nop },                                   // combat.js (contacto)
    { id: 'assaultvest', name: 'Chaleco Asalto', desc: '+20% de reducción de daño recibido.',
      on: p => { p.dmgReduce += 0.2; }, off: p => { p.dmgReduce -= 0.2; } },
    { id: 'scopelens', name: 'Periscopio', desc: '+15% de probabilidad de golpe crítico.',
      on: p => { p.critChance += SCOPE; }, off: p => { p.critChance -= SCOPE; } },
    { id: 'expertbelt', name: 'Cinta Experto', desc: '+25% de daño en golpes súper efectivos.',
      on: nop, off: nop },                                   // outK()
    { id: 'widelens', name: 'Lente Amplia', desc: '+20% de radio y alcance en tus movimientos.',
      on: nop, off: nop },                                   // combat.js eff()
    { id: 'bigorb', name: 'Esfera Colosal', desc: '+30% de tamaño en tus proyectiles, orbes y áreas.',
      on: nop, off: nop },                                   // Player.sizeK() y las evoluciones alternativas
    { id: 'typegem', name: 'Gema de tipo', desc: '+20% de daño con movimientos del tipo de tu Pokémon.',
      on: nop, off: nop },                                   // outK()
    { id: 'sitrusberry', name: 'Baya Zidra', desc: 'Al bajar del 50% de vida, curas un 30% (cada 90 s).',
      on: nop, off: nop },                                   // Player.hurt
    { id: 'heavyboots', name: 'Botas Gruesas', desc: 'Eres inmune a las trampas del mapa.',
      on: nop, off: nop },                                   // G.Abilities.trapImmune
    { id: 'safetygoggles', name: 'Gafas Protectoras', desc: 'Eres inmune al daño del clima (arena y nieve).',
      on: nop, off: nop },                                   // G.Abilities.weatherImmune
    { id: 'weaknesspolicy', name: 'Seguro Debilidad', desc: 'Si te golpea algo súper efectivo, +50% de daño durante 8 s.',
      on: nop, off: nop },                                   // Player.hurt + Player.atk
    { id: 'rarecandy', name: 'Caramelo Raro', desc: 'Subes 1 nivel al cogerlo (no ocupa hueco).',
      instant: true, on: nop, off: nop },                    // game.js offerItem
    { id: 'pureincense', name: 'Incienso Puro', desc: 'Salen un 25% menos de enemigos, pero más fuertes y con más experiencia y monedas.',
      on: nop, off: nop },                                   // spawner.js + monedas (game.js)
    { id: 'lightball', name: 'Bola Luminosa', desc: 'Pikachu, Pichu y Raichu: x2 de daño eléctrico.',
      only: LIGHTBALL, on: nop, off: nop },
    { id: 'thickclub', name: 'Hueso Grueso', desc: 'Cubone y Marowak: +50% de daño de Tierra.',
      only: THICKCLUB, on: nop, off: nop },
    { id: 'silverpowder', name: 'Polvo Plata', desc: '+20% de daño con movimientos de tipo Bicho.',
      on: nop, off: nop }
  ];
  const BY = {};
  for (const it of LIST) BY[it.id] = it;

  /** ¿Le puede salir este objeto a este Pokémon? (los exclusivos de especie, sólo a ellos) */
  function okFor(id, dex) {
    const it = BY[id];
    return !!it && (!it.only || it.only.includes(+dex));
  }

  /**
   * Uno al azar (todos con el mismo peso, como el port: main.gd _offer_item), distinto de los
   * que llevas y que le sirva a tu Pokémon.
   * @param except  id a excluir, o el jugador (por defecto, el de la partida)
   */
  function roll(except) {
    const pl = except && typeof except === 'object' ? except : (G.Game && G.Game.player) || null;
    const no = new Set([typeof except === 'string' ? except : null, pl && pl.item, pl && pl.item2].filter(Boolean));
    const pool = LIST.filter(i => !no.has(i.id) && (!pl || okFor(i.id, pl.dex)));
    return G.U.pick(pool.length ? pool : LIST).id;
  }

  /**
   * Multiplicador de daño de los objetos en un golpe de `pl` con un ataque de tipo `mt` a `e`
   * (main.gd 2498-2507): Cinta Experto (súper eficaz), Gema de tipo (tipo propio), Bola
   * Luminosa, Hueso Grueso y Polvo Plata.
   */
  function outK(pl, e, mt) {
    if (!pl || !pl.hasItem || !mt || (!pl.item && !pl.item2)) return 1;
    let k = 1;
    if (pl.hasItem('expertbelt') && e && G.Types.label(G.Types.mult(mt, e.types)) === 'super') k *= 1.25;
    if (pl.hasItem('typegem') && pl.mon && pl.mon.types.includes(mt)) k *= 1.2;
    if (mt === 'electric' && pl.hasItem('lightball') && LIGHTBALL.includes(pl.dex)) k *= 2;
    if (mt === 'ground' && pl.hasItem('thickclub') && THICKCLUB.includes(pl.dex)) k *= 1.5;
    if (mt === 'bug' && pl.hasItem('silverpowder')) k *= 1.2;
    return k;
  }

  return { LIST, BY, roll, okFor, outK, SITRUS, WPOLICY, INCENSE, ICE, SCOPE, WIDE, BIG, LIGHTBALL, THICKCLUB };
})();
