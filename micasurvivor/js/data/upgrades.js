/* ============ upgrades.js — mejoras permanentes entre runs ============
 * Se compran con Pokémonedas en el menú. `per` es lo que da cada nivel.
 * MicaSurvivor (DLC D17-D18): a RETIRED upgrade (`retired`: the batch) stays in LIST / BY (G.DB.sanitize drops an unknown id,
 * and its levels are the refund's basis) but does nothing, isn't sold and isn't listed; G.DB.refundRetired pays its levels
 * back once per account. D17: Backpack (owner: "1 slot for an equipped held item in both modes").
 */
G.Upgrades = (() => {
  const LIST = [
    { id: 'hp',     icon: 'heart', name: 'Vitalidad',      unit: '+8 vida',            max: 10, base: 60,  grow: 1.35 },
    { id: 'atk',    icon: 'fist', name: 'Fuerza',         unit: '+4% daño',           max: 10, base: 80,  grow: 1.38 },
    { id: 'spd',    icon: 'boot', name: 'Zancada',        unit: '+3% velocidad',      max: 8,  base: 70,  grow: 1.4 },
    { id: 'cd',     icon: 'clock', name: 'Reflejos',       unit: '-3% recarga',        max: 8,  base: 90,  grow: 1.42 },
    { id: 'def',    icon: 'shield', name: 'Coraza',         unit: '+2% defensa',        max: 8,  base: 80,  grow: 1.4 },
    { id: 'regen',  icon: 'sprout', name: 'Síntesis',       unit: '+0.2 vida/s',        max: 5,  base: 120, grow: 1.5 },
    { id: 'magnet', icon: 'magnet', name: 'Imán',           unit: '+12% recogida',      max: 6,  base: 50,  grow: 1.4 },
    { id: 'xp',     icon: 'book', name: 'Sabiduría',      unit: '+5% experiencia',    max: 8,  base: 100, grow: 1.42 },
    { id: 'coins',  icon: 'coin', name: 'Fortuna',        unit: '+8% Pokémonedas',    max: 8,  base: 120, grow: 1.45 },
    { id: 'moves',  icon: 'cards', name: 'Repertorio',     unit: 'Empiezas con 2 movimientos', max: 1, base: 1500, grow: 1 },
    { id: 'crit',   icon: 'star', name: 'Golpe Crítico',  unit: '+3% de críticos (x1,5 de daño)', max: 10, base: 90, grow: 1.4 },
    // MicaSurvivor (M5 lote 3): las 4 del port de Android (save_data.gd UPGRADES), en su sitio y con sus números.
    { id: 'size',   icon: 'size', name: 'Calibre',        unit: '+8% de tamaño de proyectiles, orbes y áreas', max: 6, base: 80, grow: 1.4 },
    { id: 'reroll', icon: 'up', name: 'Cambio de cartas', unit: '+1 cambio de cartas de nivel por run', max: 5, base: 150, grow: 1.6 },
    { id: 'tm',     icon: 'tm', name: 'MT',             unit: 'Elige tu movimiento inicial (de tus tipos)', max: 1, base: 2000, grow: 1 },
    { id: 'ban',    icon: 'ban', name: 'Veto',           unit: 'Bloquea 1 movimiento: no te sale en las cartas', max: 3, base: 300, grow: 1.9 },
    { id: 'revive', icon: 'revive', name: 'Segunda oportunidad', unit: '+1 corazón: al caer, revives con la vida completa', max: 2, base: 2500, grow: 2 },
    { id: 'bag',    icon: 'bag', name: 'Mochila',        unit: 'Llevas 2 objetos a la vez por partida', max: 1, base: 7500, grow: 1, retired: 'D17' }
  ];
  const BY = {};
  for (const u of LIST) BY[u.id] = u;

  function cost(id, lvl) {
    const u = BY[id];
    return Math.round(u.base * Math.pow(u.grow, lvl) / 10) * 10;
  }

  /** Niveles comprados -> modificadores para G.Player. */
  function perks(levels = {}) {
    // Nunca por encima del máximo (una partida editada a mano no da más poder).
    const L = id => Math.max(0, Math.min(BY[id].max, Math.floor(+levels[id] || 0)));
    return {
      hp: L('hp') * 8,
      atkMul: 1 + L('atk') * 0.04,
      spdMul: 1 + L('spd') * 0.03,
      cdMul: 1 - L('cd') * 0.03,
      dmgReduce: L('def') * 0.02,
      regen: L('regen') * 0.2,
      magnetMul: 1 + L('magnet') * 0.12,
      xpMul: 1 + L('xp') * 0.05,
      coinMul: 1 + L('coins') * 0.08,
      startMoves: 1 + L('moves'),
      crit: L('crit') * 0.03,
      size: 1 + L('size') * 0.08,          // MicaSurvivor (M5 lote 3): Calibre (Player.sizePerk)
      tm: L('tm'),                         // MT: G.startMoveOf usa el elegido (save.ptm)
      revives: L('revive'),                // Segunda oportunidad: corazones por partida
      bag: false,                          // Mochila: retired (DLC D17: one held item); its level stays for the refund
      rerolls: L('reroll'),
      bans: L('ban')
    };
  }

  /** DLC D17-D18: the upgrades on sale (the retired ones are not). */
  const live = () => LIST.filter(u => !u.retired);
  return { LIST, BY, cost, perks, live };
})();
