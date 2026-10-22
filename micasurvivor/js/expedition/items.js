'use strict';
/* ============ expedition/items.js — vitamins, items and the run's stats (MicaSurvivor DLC D5, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it, and every listener below
 * acts only on an Expedition run's own player (on(pl)). Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.5 (vitamins) and 2.6
 * (items), and the D5 row.
 *
 *   vitamins   21 (VITAMINS): each a stat, max level 10 (K.VIT_MAX), in one of 3 slots (K.VIT_SLOTS; the Lab's +1 / +2
 *              is D10). Each level adds its `per` x the card's rarity multiplier. Cursed Incense: +12 % difficulty a level
 *              for +6 % XP and Pokémonedas.
 *   items      60 (ITEMS): 18 type boosters (+30 % to their type, common) and 42 others in 5 rarities (10 common, 12
 *              uncommon, 10 rare, 6 epic, 4 legendary). Items STACK up to their cap (`cap`); there are no item slots.
 *              They drop where base items drop (the alphas, guardians, chests: the item.roll seam, a seeded stream) and
 *              are taken at once (the item.take seam), never a choice screen.
 *   stats      every vitamin, item and Training bonus feeds a STAT (`dmg`, `phys`, `hp`, `armor`, `type.fire`...). Bonuses
 *              of the same stat ADD (study 2.6: "since 0.5.3 same-stat bonuses add instead of multiplying"): total(pl, s)
 *              is their sum, applied once (apply(pl)). Different stats multiply, as before.
 *   procs      the items that do something (Focus Band, revives, thorns, lifesteal, Electirizer...) through the seams
 *              player.hurt / player.ko / player.dealt / combat.out / run.tick (js/core/hooks.js).
 *
 * Icons are the overworld's item pictures (/overworld/item_icons/<icon>.png, already deployed with the site): no new art.
 * Determinism: an item drop (roll) and a card's vitamin rarity come from seeded streams (G.DLC.rng, levelups.js / here);
 * a proc's chance (Focus Band, evasion) is combat, Math.random, as in the base game.
 */
G.ExpEN = Object.assign(G.ExpEN || {}, {
  'Proteína': 'Protein', 'Calcio': 'Calcium', 'Hierro': 'Iron', 'Zinc': 'Zinc', 'Carburante': 'Carbos', 'Más PS': 'HP Up',
  'Más PP': 'PP Up', 'Éter': 'Ether', 'Directo': 'Dire Hit', 'Velocidad X': 'X Speed', 'Defensa X': 'X Defense',
  'Precisión X': 'X Accuracy', 'Seta Grande': 'Big Mushroom', 'PP Máximos': 'PP Max', 'Leche Mu-mu': 'Moomoo Milk',
  'Pepita': 'Nugget', 'Repartir Exp': 'Exp. Share', 'Puño Suerte': 'Lucky Punch', 'Raíz Energía': 'Energy Root',
  'Buscaobjetos': 'Itemfinder', 'Incienso Maldito': 'Cursed Incense',
  '+{x} % de daño físico': '+{x}% physical damage', '+{x} % de daño especial': '+{x}% special damage', '+{x} % de daño': '+{x}% damage',
  '+{x} de armadura': '+{x} armor', '+{x} de escudo que se regenera': '+{x} regenerating shield', '+{x} % de velocidad': '+{x}% speed',
  '+{x} de vida máxima': '+{x} max HP', '+{x} proyectiles': '+{x} projectiles', '+{x} % de velocidad de ataque': '+{x}% attack speed',
  '+{x} % de crítico': '+{x}% crit', '+{x} % de velocidad de proyectil': '+{x}% projectile speed', '+{x} % de evasión': '+{x}% evasion',
  '+{x} % de estado': '+{x}% status chance', '+{x} % de área': '+{x}% area', '+{x} % de duración': '+{x}% duration',
  '+{x} de vida por segundo': '+{x} HP per second', '+{x} % de Pokémonedas': '+{x}% Pokémonedas', '+{x} % de ₽': '+{x}% ₽', '+{x} % de experiencia': '+{x}% XP',
  '+{x} de suerte': '+{x} luck', '+{x} % de robo de vida': '+{x}% lifesteal', '+{x} % de radio de recogida': '+{x}% pickup range',
  '+{x} % de dificultad': '+{x}% difficulty', '+{x} % contra súper eficaces': '+{x}% super-effective damage',
  '+{x} % de daño a jefes': '+{x}% damage to bosses', '+{x} % de daño de tipo {x}': '+{x}% {x}-type damage',
  '-{x} % de vida máxima': '-{x}% max HP', '-{x} % de velocidad de ataque': '-{x}% attack speed', '-{x} % de velocidad': '-{x}% speed', '-{x} % de daño': '-{x}% damage',
  '+{x} % de vida máxima': '+{x}% max HP',
  // items
  'Cinta Fuerte': 'Muscle Band', 'Gafas Especiales': 'Wise Glasses', 'Garra Rápida': 'Quick Claw', 'Restos': 'Leftovers',
  'Huevo Suerte': 'Lucky Egg', 'Moneda Amuleto': 'Amulet Coin', 'Periscopio': 'Scope Lens', 'Lupa': 'Wide Lens',
  'Refleluz': 'Light Clay', 'Vidasfera': 'Life Orb', 'Cinta Elección': 'Choice Band', 'Gafas Elección': 'Choice Specs',
  'Pañuelo Elección': 'Choice Scarf', 'Cinta Experto': 'Expert Belt', 'Campana Concha': 'Shell Bell', 'Casco Dentado': 'Rocky Helmet',
  'Cinta Focus': 'Focus Band', 'Mineral Evolutivo': 'Eviolite', 'Cascabel Alivio': 'Soothe Bell', 'Protector': 'Protector',
  'Baya Zidra': 'Sitrus Berry', 'Brazal Firme': 'Macho Brace', 'Colmillo Agudo': 'Razor Fang', 'Seguro Debilidad': 'Weakness Policy',
  'Chaleco Asalto': 'Assault Vest', 'Botas Gruesas': 'Heavy-Duty Boots', 'Mejora': 'Up-Grade', 'Amuleto Iris': 'Shiny Charm',
  'Repartir Experiencia': 'Exp. Share', 'Diente Marino': 'Deep Sea Tooth', 'Roca del Rey': "King's Rock", 'Revivir': 'Revive',
  'Electrizador': 'Electirizer', 'Piedra Solar': 'Sun Stone', 'Magmatizador': 'Magmarizer', 'Meteorito': 'Meteorite',
  'Corona Ancestral': 'Relic Crown', 'Escama Bella': 'Prism Scale', 'Master Ball': 'Master Ball', 'Revivir Máximo': 'Max Revive',
  'Hierba Revivir': 'Revival Herb', 'Armadura Rencor': 'Malicious Armor',
  'Pañuelo Seda': 'Silk Scarf', 'Carbón': 'Charcoal', 'Agua Mística': 'Mystic Water', 'Semilla Milagro': 'Miracle Seed',
  'Imán': 'Magnet', 'Antiderretir': 'Never-Melt Ice', 'Cinturón Negro': 'Black Belt', 'Flecha Venenosa': 'Poison Barb',
  'Arena Fina': 'Soft Sand', 'Pico Afilado': 'Sharp Beak', 'Cuchara Torcida': 'Twisted Spoon', 'Polvo Plata': 'Silver Powder',
  'Piedra Dura': 'Hard Stone', 'Hechizo': 'Spell Tag', 'Colmillo Dragón': 'Dragon Fang', 'Gafas de Sol': 'Black Glasses',
  'Revestimiento Metálico': 'Metal Coat', 'Pañuelo Rosa': 'Pink Scarf',
  'Un 15 % de aguantar con 1 de vida (cada 20 s)': 'A 15% chance to hold on at 1 HP (every 20 s)',
  'Daña a quien te golpea': 'Hurts whoever hits you', 'Recupera el {x} % del daño que haces': 'Heals {x}% of the damage you deal',
  'Con poca vida recupera el 25 % (cada 60 s)': 'At low HP, heals 25% (every 60 s)',
  'Remata a los enemigos (no jefes) por debajo del {x} %': 'Finishes off foes (not bosses) below {x}%',
  'Al recibir un golpe, +30 % de daño 6 s': 'When hit, +30% damage for 6 s', 'Inmune a ralentizaciones': 'Immune to slows',
  'Un {x} % de aturdir al golpear': 'A {x}% chance to stun on hit', 'Revives una vez al 30 % de vida': 'Revive once at 30% HP',
  'Un rayo a 3 enemigos cada 2,5 s': 'A bolt on 3 foes every 2.5 s', 'Un golpe solar cada 6 s': 'A solar strike every 6 s',
  'Un anillo de fuego cada 4 s': 'A ring of fire every 4 s', 'Una grieta que atrae a los enemigos cada 8 s': 'A rift that pulls foes in every 8 s',
  'Detiene el tiempo al golpear (cada 20 s)': 'Stops time on hit (every 20 s)', 'Revives una vez al 60 % de vida': 'Revive once at 60% HP',
  'Revives al 40 % una vez por zona, entre llamas': 'Revive at 40% once per zone, in flames',
  'Si aún no has evolucionado del todo': 'While not fully evolved',
  '¡Esquivado!': 'Dodged!', '¡Aguanta!': 'Held on!', '¡Revivir!': 'Revive!', '¡Detiene el tiempo!': 'Time stops!',
  'Máx. {x}': 'Max {x}', '¡{x}!': '{x}!', 'Objeto: {x}': 'Item: {x}', 'Objeto: {x} ×{x}': 'Item: {x} ×{x}',
  'Común': 'Common', 'Poco común': 'Uncommon', 'Rara': 'Rare', 'Épica': 'Epic', 'Legendaria': 'Legendary'
});
G.I18n.add(G.ExpEN);

G.ExpItems = (() => {
  const T = G.I18n;
  // a text with {x} holes: the exact English (the I18n patterns can match an older, shorter one first), else I18n.f
  const F = (es, ...v) => { const en = T.lang === 'en' && G.ExpEN[es]; let i = 0; return en ? en.replace(/\{x\}/g, () => v[i++]) : T.f(es, ...v); };
  // ---------------- balance (tune here; README "DLC D5") ----------------
  const K = {
    VIT_SLOTS: 3, VIT_MAX: 10,        // vitamin slots and max level (study 2.5; + the Lab's +1 / +2 slots: D10, G.ExpMeta.labNow)
    ARMOR_PT: 0.01, ARMOR_CAP: 0.5,   // 1 armor point = 1 % less damage taken; the Expedition's items + vitamins cap at 50 %
    EVADE_CAP: 0.4,                   // evasion never above 40 %
    STEAL_CAP: 0.05,                  // lifesteal heals at most 5 % of max HP a second
    SHIELD_T: 4,                      // the shield (Zinc) refills 4 s after the last hit
    CURSE_XP: 0.5,                    // Cursed Incense: XP / Pokémonedas get half its difficulty (+12 % -> +6 %)
    PROC_LV: 0.06,                    // an item's proc damage: its base x (1 + 6 % per player level) x the player's attack
    ICON: '/overworld/item_icons/'    // the overworld's item pictures (deployed with the site)
  };
  const RAR = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const RAR_NAME = ['Común', 'Poco común', 'Rara', 'Épica', 'Legendaria'];
  const RAR_COL = ['#b9c4d4', '#5fd07a', '#4f9cf0', '#b46cf2', '#ffb020'];
  const RAR_MUL = [1, 1.2, 1.45, 1.75, 2.1];   // study 2.5

  // the 21 vitamins: [id, name, icon, stat, per level, text]
  const VITAMINS = [
    ['protein', 'Proteína', 'protein', 'phys', 0.10], ['calcium', 'Calcio', 'calcium', 'spec', 0.10],
    ['iron', 'Hierro', 'iron', 'armor', 5], ['zinc', 'Zinc', 'zinc', 'shield', 12],
    ['carbos', 'Carburante', 'carbos', 'spd', 0.07], ['hpup', 'Más PS', 'hp_up', 'hp', 18],
    ['ppup', 'Más PP', 'pp_up', 'proj', 0.5], ['ether', 'Éter', 'ether', 'atkspd', 0.08],
    ['direhit', 'Directo', 'dire_hit', 'crit', 0.05], ['xspeed', 'Velocidad X', 'x_speed', 'pspd', 0.12],
    ['xdefense', 'Defensa X', 'x_defend', 'evade', 0.035], ['xaccuracy', 'Precisión X', 'x_accuracy', 'status', 0.12],
    ['bigmushroom', 'Seta Grande', 'big_mushroom', 'area', 0.08], ['ppmax', 'PP Máximos', 'pp_max', 'dur', 0.10],
    ['moomoo', 'Leche Mu-mu', 'moomoo_milk', 'regen', 0.5], ['nugget', 'Pepita', 'nugget', 'coin', 0.10],
    ['expshare', 'Repartir Exp', 'exp_share', 'xp', 0.06], ['luckypunch', 'Puño Suerte', 'lucky_punch', 'luck', 8],
    ['energyroot', 'Raíz Energía', 'energy_root', 'steal', 0.01], ['itemfinder', 'Buscaobjetos', 'itemfinder', 'magnet', 0.15],
    ['cursed', 'Incienso Maldito', 'lax_incense', 'curse', 0.12]
  ].map(([id, name, icon, stat, per]) => ({ id, name, icon, stat, per }));
  const VIT = {};
  for (const v of VITAMINS) VIT[v.id] = v;

  // the 18 type boosters (+30 % to their type and +3 % to everything, study 2.6)
  const BOOST = [['normal', 'silkscarf', 'Pañuelo Seda', 'silk_scarf'], ['fire', 'charcoal', 'Carbón', 'charcoal'], ['water', 'mysticwater', 'Agua Mística', 'mystic_water'],
    ['grass', 'miracleseed', 'Semilla Milagro', 'miracle_seed'], ['electric', 'magnet', 'Imán', 'magnet'], ['ice', 'nevermeltice', 'Antiderretir', 'never_melt_ice'],
    ['fighting', 'blackbelt', 'Cinturón Negro', 'black_belt'], ['poison', 'poisonbarb', 'Flecha Venenosa', 'poison_barb'], ['ground', 'softsand', 'Arena Fina', 'soft_sand'],
    ['flying', 'sharpbeak', 'Pico Afilado', 'sharp_beak'], ['psychic', 'twistedspoon', 'Cuchara Torcida', 'twisted_spoon'], ['bug', 'silverpowder', 'Polvo Plata', 'silver_powder'],
    ['rock', 'hardstone', 'Piedra Dura', 'hard_stone'], ['ghost', 'spelltag', 'Hechizo', 'spell_tag'], ['dragon', 'dragonfang', 'Colmillo Dragón', 'dragon_fang'],
    ['dark', 'blackglasses', 'Gafas de Sol', 'black_glasses'], ['steel', 'metalcoat', 'Revestimiento Metálico', 'metal_coat'], ['fairy', 'pinkscarf', 'Pañuelo Rosa', 'pink_scarf']];
  // the other 42: {id, name, icon, rar (0-4), cap, stats: {stat: value per stack}, proc?, text? (a proc's line)}
  const OTHER = [
    // common (10)
    { id: 'muscleband', name: 'Cinta Fuerte', icon: 'muscle_band', rar: 0, cap: 4, stats: { phys: 0.12 } },
    { id: 'wiseglasses', name: 'Gafas Especiales', icon: 'wise_glasses', rar: 0, cap: 4, stats: { spec: 0.12 } },
    { id: 'quickclaw', name: 'Garra Rápida', icon: 'quick_claw', rar: 0, cap: 5, stats: { atkspd: 0.08 } },
    { id: 'leftovers', name: 'Restos', icon: 'leftovers', rar: 0, cap: 5, stats: { regen: 0.8 } },
    { id: 'luckyegg', name: 'Huevo Suerte', icon: 'lucky_egg', rar: 0, cap: 4, stats: { xp: 0.10 } },
    { id: 'amuletcoin', name: 'Moneda Amuleto', icon: 'amulet_coin', rar: 0, cap: 4, stats: { coin: 0.15 } },
    { id: 'scopelens', name: 'Periscopio', icon: 'scope_lens', rar: 0, cap: 4, stats: { crit: 0.05 } },
    { id: 'widelens', name: 'Lupa', icon: 'wide_lens', rar: 0, cap: 4, stats: { area: 0.12 } },
    { id: 'lightclay', name: 'Refleluz', icon: 'light_clay', rar: 0, cap: 3, stats: { dur: 0.20 } },
    { id: 'lifeorb', name: 'Vidasfera', icon: 'life_orb', rar: 0, cap: 3, stats: { dmg: 0.30, hpPct: -0.10 } },
    // uncommon (12)
    { id: 'choiceband', name: 'Cinta Elección', icon: 'choice_band', rar: 1, cap: 1, stats: { phys: 0.35, atkspd: -0.08 } },
    { id: 'choicespecs', name: 'Gafas Elección', icon: 'choice_specs', rar: 1, cap: 1, stats: { spec: 0.35, atkspd: -0.08 } },
    { id: 'choicescarf', name: 'Pañuelo Elección', icon: 'choice_scarf', rar: 1, cap: 1, stats: { spd: 0.20, dmg: -0.06 } },
    { id: 'expertbelt', name: 'Cinta Experto', icon: 'expert_belt', rar: 1, cap: 2, stats: { super: 0.30 } },
    { id: 'shellbell', name: 'Campana Concha', icon: 'shell_bell', rar: 1, cap: 3, stats: { steal: 0.03 } },
    { id: 'rockyhelmet', name: 'Casco Dentado', icon: 'rocky_helmet', rar: 1, cap: 3, stats: { thorns: 25 }, text: 'Daña a quien te golpea' },
    { id: 'focusband', name: 'Cinta Focus', icon: 'focus_band', rar: 1, cap: 2, stats: { focus: 0.15 }, text: 'Un 15 % de aguantar con 1 de vida (cada 20 s)' },
    { id: 'eviolite', name: 'Mineral Evolutivo', icon: 'eviolite', rar: 1, cap: 1, stats: { eviolite: 15 }, text: 'Si aún no has evolucionado del todo' },
    { id: 'soothebell', name: 'Cascabel Alivio', icon: 'soothe_bell', rar: 1, cap: 3, stats: { luck: 10 } },
    { id: 'protector', name: 'Protector', icon: 'protector', rar: 1, cap: 4, stats: { armor: 4 } },
    { id: 'sitrusberry', name: 'Baya Zidra', icon: 'sitrus_berry', rar: 1, cap: 2, stats: { sitrus: 1 }, text: 'Con poca vida recupera el 25 % (cada 60 s)' },
    { id: 'machobrace', name: 'Brazal Firme', icon: 'macho_brace', rar: 1, cap: 2, stats: { dmg: 0.15, spd: -0.10 } },
    // rare (10)
    { id: 'razorfang', name: 'Colmillo Agudo', icon: 'razor_fang', rar: 2, cap: 2, stats: { execute: 0.08 } },
    { id: 'weaknesspolicy', name: 'Seguro Debilidad', icon: 'weakness_policy', rar: 2, cap: 1, stats: { wpolicy: 0.30 }, text: 'Al recibir un golpe, +30 % de daño 6 s' },
    { id: 'assaultvest', name: 'Chaleco Asalto', icon: 'assault_vest', rar: 2, cap: 2, stats: { hpPct: 0.15, armor: 8 } },
    { id: 'heavyboots', name: 'Botas Gruesas', icon: 'heavy_duty_boots', rar: 2, cap: 1, stats: { spd: 0.08, noslow: 1 }, text: 'Inmune a ralentizaciones' },
    { id: 'upgrade', name: 'Mejora', icon: 'up_grade', rar: 2, cap: 2, stats: { proj: 1 } },
    { id: 'shinycharm', name: 'Amuleto Iris', icon: 'shiny_charm', rar: 2, cap: 2, stats: { luck: 25 } },
    { id: 'expsharex', name: 'Repartir Experiencia', icon: 'exp_share', rar: 2, cap: 2, stats: { xp: 0.15, magnet: 0.10 } },
    { id: 'deepseatooth', name: 'Diente Marino', icon: 'deep_sea_tooth', rar: 2, cap: 2, stats: { boss: 0.25 } },
    { id: 'kingsrock', name: 'Roca del Rey', icon: 'kings_rock', rar: 2, cap: 3, stats: { flinch: 0.06 } },
    { id: 'revive', name: 'Revivir', icon: 'revive', rar: 2, cap: 2, stats: { revive: 1 }, text: 'Revives una vez al 30 % de vida' },
    // epic (6)
    { id: 'electirizer', name: 'Electrizador', icon: 'electirizer', rar: 3, cap: 2, stats: { p_bolt: 1 }, text: 'Un rayo a 3 enemigos cada 2,5 s' },
    { id: 'sunstone', name: 'Piedra Solar', icon: 'sun_stone', rar: 3, cap: 2, stats: { p_solar: 1 }, text: 'Un golpe solar cada 6 s' },
    { id: 'magmarizer', name: 'Magmatizador', icon: 'magmarizer', rar: 3, cap: 2, stats: { p_ring: 1 }, text: 'Un anillo de fuego cada 4 s' },
    { id: 'meteorite', name: 'Meteorito', icon: 'meteorite', rar: 3, cap: 2, stats: { p_rift: 1 }, text: 'Una grieta que atrae a los enemigos cada 8 s' },
    { id: 'reliccrown', name: 'Corona Ancestral', icon: 'relic_crown', rar: 3, cap: 1, stats: { timestop: 1 }, text: 'Detiene el tiempo al golpear (cada 20 s)' },
    { id: 'prismscale', name: 'Escama Bella', icon: 'prism_scale', rar: 3, cap: 2, stats: { dmg: 0.20, area: 0.10 } },
    // legendary (4)
    { id: 'masterball', name: 'Master Ball', icon: 'master_ball', rar: 4, cap: 1, stats: { dmg: 0.25 } },
    { id: 'maxrevive', name: 'Revivir Máximo', icon: 'max_revive', rar: 4, cap: 1, stats: { maxrevive: 1 }, text: 'Revives una vez al 60 % de vida' },
    { id: 'revivalherb', name: 'Hierba Revivir', icon: 'revival_herb', rar: 4, cap: 1, stats: { phoenix: 1 }, text: 'Revives al 40 % una vez por zona, entre llamas' },
    { id: 'maliciousarmor', name: 'Armadura Rencor', icon: 'malicious_armor', rar: 4, cap: 1, stats: { dmg: 0.40, hpPct: -0.15 } }
  ];
  const ITEMS = BOOST.map(([type, id, name, icon]) => ({ id, name, icon, rar: 0, cap: 3, type, stats: { ['type.' + type]: 0.30, dmg: 0.03 } })).concat(OTHER);
  const IT = {};
  for (const it of ITEMS) IT[it.id] = it;
  const PREFIX = 'x:';   // an Expedition item's pickup value ('x:lifeorb'): never a base item id
  const idOf = v => typeof v === 'string' && v.startsWith(PREFIX) ? v.slice(PREFIX.length) : null;

  // ---------------- the run's state on the player ----------------
  // pl.xv    vitamins [{id, lvl, v}] (v: the summed value of its levels)    pl.xi  items {id: stacks}
  // pl.xtr   Training {dmg, hp} taken                                        pl.xap the stats applied to the base fields
  const ensure = pl => { if (!pl.xv) { pl.xv = []; pl.xi = {}; pl.xtr = { n: 0, dmg: 0, hp: 0 }; pl.xap = {}; pl.xproc = { shield: 0, shieldT: 0, focusT: -99, sitrusT: -99, wpT: 0, crownT: -99, steal: 0, t: {}, phoenixZone: 0, revives: 0, maxrev: 0 }; } return pl; };
  /** The sum of one stat over the run's vitamins, items and Training (same-stat bonuses ADD). */
  function total(pl, s) {
    if (!pl || !pl.xv) return 0;
    let v = 0;
    for (const x of pl.xv) if (VIT[x.id].stat === s) v += x.v;
    for (const id in pl.xi) { const st = IT[id] && IT[id].stats[s]; if (st) v += st * pl.xi[id]; }
    if (s === 'dmg') v += pl.xtr.dmg;
    if (G.ExpCap) v += G.ExpCap.perk(pl, s);   // (D8: the Support Alphas' type perks add like any same-stat bonus)
    if (G.ExpMeta) v += G.ExpMeta.statOf(pl, s);   // (D10: the Lab, the shiny perks and the boosts of the run's row, the same way)
    if (s === 'hp') v += pl.xtr.hp;
    if (s === 'xp' || s === 'coin') v += total(pl, 'curse') * K.CURSE_XP;
    if (s === 'armor' && pl.xi.eviolite && G.ExpLeague && G.ExpLeague.run) {
      const L = G.ExpLeague, r = L.run;
      if (L.nextOf(L.BY[r.member], r.form).length) v += IT.eviolite.stats.eviolite;
    }
    return v;
  }
  /** Put the stats on the player's own fields (each applied amount is remembered, so a re-apply swaps old for new). */
  function apply(pl) {
    ensure(pl);
    const ap = pl.xap;
    const ratio = (field, k) => { const old = ap[field] || 1; if (Math.abs(k - old) < 1e-12) return; pl[field] = pl[field] / old * k; ap[field] = k; };
    const add = (field, v) => { const old = ap[field] || 0; if (Math.abs(v - old) < 1e-12) return; pl[field] = pl[field] - old + v; ap[field] = v; };
    ratio('atkMul', Math.max(0.2, 1 + total(pl, 'dmg')));
    ratio('spdMul', Math.max(0.3, 1 + total(pl, 'spd')));
    ratio('cdMul', 1 / Math.max(0.3, 1 + total(pl, 'atkspd')));
    ratio('coinMul', Math.max(0, 1 + total(pl, 'coin')));
    ratio('xpMul', Math.max(0.1, 1 + total(pl, 'xp')));
    ratio('magnet', Math.max(0.2, 1 + total(pl, 'magnet')));
    add('critChance', total(pl, 'crit'));
    add('regenFlat', total(pl, 'regen'));
    add('dmgReduce', Math.min(K.ARMOR_CAP, total(pl, 'armor') * K.ARMOR_PT));
    // max HP: the flat part, then the % part on what the player has without either
    const oldHp = (ap.hpFlat || 0) + (ap.hpPctAmt || 0);
    const bare = pl.maxHp - oldHp, flat = Math.round(total(pl, 'hp')), pct = Math.round(bare * total(pl, 'hpPct'));
    const nw = flat + pct;
    if (nw !== oldHp) {
      const d = nw - oldHp;
      pl.maxHp = Math.max(1, pl.maxHp + d);
      pl.hp = Math.max(1, Math.min(pl.maxHp, pl.hp + Math.max(0, d)));
      ap.hpFlat = flat; ap.hpPctAmt = pct;
    }
    pl.xluck = total(pl, 'luck');
    if (G.ExpMoves) G.ExpMoves.refreshAll(pl);
  }

  // ---------------- vitamins ----------------
  const vitOf = (pl, id) => ensure(pl).xv.find(x => x.id === id) || null;
  /** Take vitamin id (new, if a slot is free, or one more level) at rarity tier ti. -> its entry or null */
  function takeVitamin(pl, id, ti = 0) {
    const d = VIT[id];
    if (!d) return null;
    let x = vitOf(pl, id);
    if (!x) { if (pl.xv.length >= slots(pl)) return null; x = { id, lvl: 0, v: 0 }; pl.xv.push(x); }
    if (x.lvl >= K.VIT_MAX) return null;
    x.lvl++;
    x.v = +(x.v + d.per * RAR_MUL[ti]).toFixed(4);
    apply(pl);
    return x;
  }
  const slots = () => K.VIT_SLOTS + (G.ExpMeta ? G.ExpMeta.labNow('vitamins') : 0);   // (D10: the Lab's +1 / +2)
  /** A vitamin's per-level text at rarity multiplier mul (or its total, v). */
  function statText(stat, v) {
    const p = Math.round(v * 1000) / 10, n = Math.round(v * 10) / 10;
    switch (stat) {
      case 'phys': return F('+{x} % de daño físico', p);
      case 'spec': return F('+{x} % de daño especial', p);
      case 'dmg': return v < 0 ? F('-{x} % de daño', -p) : F('+{x} % de daño', p);
      case 'armor': return F('+{x} de armadura', n);
      case 'shield': return F('+{x} de escudo que se regenera', Math.round(v));
      case 'spd': return v < 0 ? F('-{x} % de velocidad', -p) : F('+{x} % de velocidad', p);
      case 'hp': return F('+{x} de vida máxima', Math.round(v));
      case 'hpPct': return v < 0 ? F('-{x} % de vida máxima', -p) : F('+{x} % de vida máxima', p);
      case 'proj': return F('+{x} proyectiles', n);
      case 'atkspd': return v < 0 ? F('-{x} % de velocidad de ataque', -p) : F('+{x} % de velocidad de ataque', p);
      case 'crit': return F('+{x} % de crítico', p);
      case 'pspd': return F('+{x} % de velocidad de proyectil', p);
      case 'evade': return F('+{x} % de evasión', p);
      case 'status': return F('+{x} % de estado', p);
      case 'area': return F('+{x} % de área', p);
      case 'dur': return F('+{x} % de duración', p);
      case 'regen': return F('+{x} de vida por segundo', n);
      case 'coin': return F('+{x} % de ₽', p);   // (D7: the run's ₽)
      case 'xp': return F('+{x} % de experiencia', p);
      case 'luck': return F('+{x} de suerte', Math.round(v));
      case 'steal': return F('+{x} % de robo de vida', p);
      case 'magnet': return F('+{x} % de radio de recogida', p);
      case 'curse': return F('+{x} % de dificultad', p) + ' · ' + F('+{x} % de experiencia', Math.round(p * K.CURSE_XP * 10) / 10);
      case 'super': return F('+{x} % contra súper eficaces', p);
      case 'boss': return F('+{x} % de daño a jefes', p);
      case 'execute': return F('Remata a los enemigos (no jefes) por debajo del {x} %', p);
      case 'flinch': return F('Un {x} % de aturdir al golpear', p);
    }
    if (stat.startsWith('type.')) return F('+{x} % de daño de tipo {x}', p, T.t(G.U.TYPE_NAME[stat.slice(5)] || stat.slice(5)));
    return '';
  }
  const vitText = (id, mul = 1) => statText(VIT[id].stat, VIT[id].per * mul);
  /** An item's lines (its stats per stack, its proc). */
  function itemText(id) {
    const it = IT[id], out = [];
    for (const s in it.stats) { const t = statText(s, it.stats[s]); if (t) out.push(t); }
    if (it.text) out.push(T.t(it.text));
    if (id === 'shellbell') { out.length = 0; out.push(F('Recupera el {x} % del daño que haces', Math.round(it.stats.steal * 100))); }
    return out.join(' · ');
  }
  const icon = name => K.ICON + name + '.png';

  // ---------------- items ----------------
  const has = (pl, id) => !!(pl && pl.xi && pl.xi[id]);
  const stacks = (pl, id) => (pl && pl.xi && pl.xi[id]) || 0;
  const room = (pl, id) => stacks(pl, id) < IT[id].cap;
  /** D10: an item that can drop now: room for it, and not kept out of this run's pool (locked until bought, or archived). */
  const inPool = (pl, id) => (!pl || room(pl, id)) && !(G.ExpMeta && G.ExpMeta.excluded(id));
  /** Take one stack of item id. -> the new count, or 0 at its cap. */
  function takeItem(pl, id) {
    ensure(pl);
    if (!IT[id] || !room(pl, id)) return 0;
    pl.xi[id] = stacks(pl, id) + 1;
    if (id === 'revive') pl.xproc.revives++;
    if (id === 'maxrevive') pl.xproc.maxrev++;
    apply(pl);
    return pl.xi[id];
  }
  /** The item's rarity weights by luck / zone (the cards' table, levelups.js), then one of that rarity with room. */
  function rollItem(pl, rng) {
    const L = G.ExpLevel;
    const ti = L ? L.rollRarity(rng, { level: pl ? pl.level : 1, luck: pl ? pl.xluck || 0 : 0, zone: L.zone(), item: true }) : 0;
    for (let t = ti; t >= 0; t--) {
      const pool = ITEMS.filter(it => it.rar === t && inPool(pl, it.id));
      if (pool.length) return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id;
    }
    return null;
  }

  // ---------------- procs ----------------
  const on = pl => !!(pl && pl.xv && G.Modes.isExp() && pl === G.Game.player && !pl.remote);
  const pdmg = (pl, b) => b * (1 + K.PROC_LV * (pl.level - 1)) * pl.atk;
  const say = (pl, txt, c) => G.FX.dmgText(pl.x, pl.y - pl.bodyH - 16, txt, c, true);
  /** player.hurt: evasion, then the shield. */
  function hurt(d, pl) {
    if (!on(pl)) return d;
    const P = pl.xproc, ev = Math.min(K.EVADE_CAP, total(pl, 'evade'));
    if (ev > 0 && Math.random() < ev) { say(pl, T.t('¡Esquivado!'), '#bfe8ff'); return 0; }
    P.shieldT = 0;
    if (P.shield > 0) {
      const a = Math.min(P.shield, d);
      P.shield -= a; d -= a;
      if (d <= 0) { G.FX.dmgText(pl.x, pl.y - pl.bodyH - 4, T.t('Escudo'), '#7fe0ff'); return 0; }
    }
    if (has(pl, 'weaknesspolicy')) P.wpT = 6;
    const th = total(pl, 'thorns');
    if (th > 0) {
      const e = G.EnemyMgr.queryCircle(pl.x, pl.y, pl.r + 46).find(o => !o.dead);
      if (e) G.DmgLog.as('item', () => G.Combat.land(e, th * (1 + K.PROC_LV * (pl.level - 1)), '#9aa6b5', e.x - pl.x, e.y - pl.y, 80, { kind: 'item' }, false, pl));
    }
    return d;
  }
  /** player.ko: Focus Band, Revival Herb (once per zone), Revive, Max Revive. */
  function ko(pl) {
    if (!on(pl) || pl.hp > 0) return;
    const P = pl.xproc, t = G.Game.st ? G.Game.st.time : 0;
    const f = total(pl, 'focus');
    if (f > 0 && t - P.focusT >= 20 && Math.random() < f) { P.focusT = t; pl.hp = 1; pl.invuln = 1.2; say(pl, T.t('¡Aguanta!'), '#ff9a3d'); return; }
    const zone = G.ExpLevel ? G.ExpLevel.zone() : 1;
    const back = (k, txt, c) => {
      pl.hp = Math.max(1, Math.round(pl.maxHp * k)); pl.invuln = 2.2;
      say(pl, txt, c); G.FX.ring(pl.x, pl.y, 8, 200, c, 0.7, 6); G.Audio.sfx('legend'); G.Camera.kick(0.5);
    };
    if (has(pl, 'revivalherb') && P.phoenixZone !== zone) {
      P.phoenixZone = zone;
      back(0.4, F('¡{x}!', T.t('Hierba Revivir')), '#ff7a3d');
      for (const e of G.EnemyMgr.queryCircle(pl.x, pl.y, 220)) if (!e.dead) G.Combat.land(e, pdmg(pl, 60), '#ff7a3d', e.x - pl.x, e.y - pl.y, 300, { type: 'fire', mtype: 'fire', burn: 4, kind: 'item' }, false, pl);
      return;
    }
    if (P.revives > 0) { P.revives--; back(0.3, T.t('¡Revivir!'), '#ffd23f'); return; }
    if (P.maxrev > 0) { P.maxrev--; back(0.6, F('¡{x}!', T.t('Revivir Máximo')), '#ffe14d'); }
  }
  /** player.dealt: lifesteal (banked, healed at most STEAL_CAP of max HP a second in tick). */
  function dealt(pl, d) {
    if (!on(pl)) return;
    const s = total(pl, 'steal');
    if (s > 0 && d > 0) pl.xproc.steal = Math.min(pl.maxHp * K.STEAL_CAP, pl.xproc.steal + d * s);
  }
  /** combat.out: super-effective, bosses, Weakness Policy, execute, flinch, the time stop. */
  function out(k, pl, e, src, dmg) {
    if (!on(pl) || !e) return k;
    const mt = src && (src.mtype || src.type);
    const se = total(pl, 'super');
    if (se > 0 && mt && G.Types.label(G.Types.mult(mt, e.types)) === 'super') k *= 1 + se;
    const b = total(pl, 'boss');
    if (b > 0 && e.boss) k *= 1 + b;
    if (pl.xproc.wpT > 0) k *= 1 + total(pl, 'wpolicy');
    const ex = total(pl, 'execute');
    if (ex > 0 && !e.boss && e.hp > 0 && e.hp / e.maxHp < ex && dmg > 0) k = Math.max(k, (e.hp + 1) / dmg);
    const fl = total(pl, 'flinch');
    if (fl > 0 && !e.boss && Math.random() < fl) G.Status.apply(e, 'freeze', 0.4);
    const t = G.Game.st ? G.Game.st.time : 0;
    if (has(pl, 'reliccrown') && t - pl.xproc.crownT >= 20) {
      pl.xproc.crownT = t;
      say(pl, T.t('¡Detiene el tiempo!'), '#d9c2ff');
      G.FX.ring(pl.x, pl.y, 10, 300, '#d9c2ff', 0.8, 6);
      for (const o of G.EnemyMgr.queryCircle(pl.x, pl.y, 300)) if (!o.dead) G.Status.apply(o, 'freeze', 1);
    }
    return k;
  }
  const PROCS = { p_bolt: 2.5, p_solar: 6, p_ring: 4, p_rift: 8 };
  let rifts = [];
  /** run.tick: the shield, Sitrus, lifesteal, the epic items' timed strikes, the rifts. */
  function tick(dt, pl) {
    if (!on(pl) || pl.dead) { rifts = []; return; }
    const P = pl.xproc;
    const sh = total(pl, 'shield');
    P.shieldT += dt;
    if (sh > 0 && P.shieldT >= K.SHIELD_T) P.shield = sh;
    if (P.shield > sh) P.shield = sh;
    if (P.wpT > 0) P.wpT -= dt;
    if (P.steal > 0) { const h = Math.min(P.steal, pl.maxHp * K.STEAL_CAP * dt); P.steal -= h; pl.hp = Math.min(pl.maxHp, pl.hp + h); }
    if (total(pl, 'noslow') > 0) pl.slowT = 0;
    const t = G.Game.st ? G.Game.st.time : 0;
    if (has(pl, 'sitrusberry') && pl.hp < pl.maxHp * 0.4 && t - P.sitrusT >= 60 / stacks(pl, 'sitrusberry')) {
      P.sitrusT = t; pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.25); say(pl, F('¡{x}!', T.t('Baya Zidra')), '#ffd83d');
    }
    for (const p in PROCS) {
      const n = total(pl, p);
      if (!n) continue;
      P.t[p] = (P.t[p] || 0) + dt;
      if (P.t[p] < PROCS[p]) continue;
      P.t[p] = 0;
      proc(pl, p, n);
    }
    for (let i = rifts.length - 1; i >= 0; i--) {
      const r = rifts[i];
      r.t += dt;
      for (const e of G.EnemyMgr.queryCircle(r.x, r.y, 220)) {
        if (e.dead || e.boss || e.remote) continue;
        const [nx, ny] = G.U.norm(r.x - e.x, r.y - e.y);
        e.x += nx * 150 * dt; e.y += ny * 150 * dt;
      }
      if (r.t >= 1.5) {
        for (const e of G.EnemyMgr.queryCircle(r.x, r.y, 90)) if (!e.dead) G.DmgLog.as('item', () => G.Combat.land(e, r.dmg, '#a98bff', e.x - r.x, e.y - r.y, 120, { type: 'psychic', mtype: 'psychic', kind: 'item' }, false, pl));
        G.FX.ring(r.x, r.y, 6, 90, '#a98bff', 0.4, 5);
        rifts.splice(i, 1);
      }
    }
  }
  function proc(pl, p, n) {
    const foes = G.EnemyMgr.queryCircle(pl.x, pl.y, 340).filter(e => !e.dead).sort((a, b) => G.U.dist2(a.x, a.y, pl.x, pl.y) - G.U.dist2(b.x, b.y, pl.x, pl.y));
    if (!foes.length) return;
    const hit = (e, d, c, src) => G.DmgLog.as('item', () => G.Combat.land(e, d, c, e.x - pl.x, e.y - pl.y, 40, Object.assign({ kind: 'item' }, src), false, pl));
    if (p === 'p_bolt') {
      for (const e of foes.slice(0, 3)) { hit(e, pdmg(pl, 14) * n, '#ffe14d', { type: 'electric', mtype: 'electric' }); G.FX.beam(e.x, e.y - 180, Math.PI / 2, 180, 3, '#ffe14d'); }
    } else if (p === 'p_solar') {
      const e = foes[0];
      G.FX.beam(e.x, e.y - 260, Math.PI / 2, 260, 10, '#fff08a');
      G.FX.ring(e.x, e.y, 6, 90, '#ffd23f', 0.4, 5);
      for (const o of G.EnemyMgr.queryCircle(e.x, e.y, 90)) if (!o.dead) hit(o, pdmg(pl, 40) * n, '#ffd23f', { type: 'grass', mtype: 'grass' });
    } else if (p === 'p_ring') {
      G.FX.ring(pl.x, pl.y, 10, 120, '#ff7a3d', 0.4, 6);
      for (const o of G.EnemyMgr.queryCircle(pl.x, pl.y, 120)) if (!o.dead) hit(o, pdmg(pl, 16) * n, '#ff7a3d', { type: 'fire', mtype: 'fire', burn: 3 });
    } else if (p === 'p_rift') {
      const e = foes[Math.floor(foes.length / 2)];
      rifts.push({ x: e.x, y: e.y, t: 0, dmg: pdmg(pl, 30) * n });
      G.FX.ring(e.x, e.y, 4, 220, '#a98bff', 1.4, 3);
    }
  }
  function draw(ctx) {
    if (!rifts.length) return;
    const now = performance.now() / 1000;
    ctx.save();
    for (const r of rifts) {
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#a98bff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, 60 * (1 - r.t / 1.5) + 20, 36 * (1 - r.t / 1.5) + 12, now * 4, 0.2, 5.2); ctx.stroke();
    }
    ctx.restore();
  }
  function reset() { rifts = []; }

  // ---------------- the row for viewers (the `x` block's `u`) ----------------
  /** [[vitamin, level]...], {item: stacks} */
  const row = pl => pl && pl.xv ? { v: pl.xv.map(x => [x.id, x.lvl]), i: Object.assign({}, pl.xi) } : null;

  return {
    K, RAR, RAR_NAME, RAR_COL, RAR_MUL, VITAMINS, VIT, ITEMS, IT, BOOST, PREFIX, idOf, ensure, total, apply,
    vitOf, takeVitamin, slots, statText, vitText, itemText, icon, has, stacks, room, inPool, takeItem, rollItem,
    hurt, ko, dealt, out, tick, draw, reset, row, on
  };
})();
