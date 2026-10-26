'use strict';
/* ============ expedition/meta.js — the League meta: Pokémonedas (D11: the base game's), the Lab, item unlocks, the Archive, research, tasks,
 *              achievements, shiny perks, the trainer card (MicaSurvivor DLC D10, not upstream) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it, and every run hook acts only
 * in an Expedition run. Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.5 (Archive), 2.6 (item unlocks, pre-run boosts), 2.14 (the
 * Lab, tasks, achievements, research, shiny perks) and the D10 row. Numbers live in K (README "DLC D10").
 *
 * OWNER RULE: no ads, nothing sold, no real money. The currency is the base game's POKÉMONEDAS (owner decision #4, 2026-10-22:
 * one currency, shared both ways), earned in play only (runs, tasks, achievements) and spent here or in the base game.
 *
 * The coins live in the BASE save and move only through G.Expedition.wallet (js/systems/expedition.js): `save.coins` += / -=,
 * then G.DB.commit, whose fold() books the change on THIS device's ledger entry (save.led[device] = [earned, spent], merged
 * by max per entry: js/core/db.js). So a payment is booked once, by the device that made it, and a merge never repeats it.
 * What the ledger can't know is that two devices paid for the SAME thing while apart (the same Lab level, item, achievement or
 * task): each purchase / claim is also written in the Expedition save with the device's id (`cur.spend` / `cur.earn`:
 * "<what>:<device>"; the tasks' in bounded counters `tkp.*` / `tkbp.*`), and reconcile() makes every device but the first
 * (by id) undo its own copy exactly once (`cur.fix`): a refund for a spend, a claw-back for an earning, through the ledger.
 * Loading never writes the base save; only a payment (and a reconcile with something to undo) does.
 * Prices and rewards are written in the D10 tables' units and converted with K.SCALE (coinsOf): one Pokémoneda tuning knob.
 *
 * Everything else persists in the Expedition save (G.ExpSave: max per counter, union per set), so it can't go backwards:
 *   the Lab       `lab.<id>` levels (max). 19 upgrades (study 2.14). Their effects reach the run through the run's ROW.
 *   unlocks       25 items start out of the drop pool; a counter goal reveals each, then Pokémonedas buy it (`items.bought`).
 *   Archive       a Lab upgrade: 3 slots a level to keep chosen items out of the pool (`arc.<item>` = Lamport stamp x 2 + on,
 *                 so the latest toggle wins on every device).
 *   research      every KO of a League family adds research (`rs.<family>`, study 2.14's 1 / 2 / 4 / 5 / 10, a cage 25,
 *                 x(1 + 0.25 Lab Research)); a finished family is an AVATAR (`avatar`); avatars and achievements give FRAMES.
 *   tasks         3 daily + 3 weekly, seeded by the period and the account; progress in bounded counters (`tk.*` = (period + 1)
 *                 x 1e7 + reroll x 1e6 + progress: a newer period always wins the max). Paid when done; all 3 a day pays a
 *                 streak bonus and a pre-run BOOST, all 3 a week a bonus and 3 boosts. The date is passed in (record(sum, now)).
 *   achievements  32, from the save's counters; claimed into the set `ach` (exactly once, on every device).
 *   shiny perks   by shinies caught: 2 +3 luck, 4 +4 % XP, 6 the Shiny Charm, 10 +3 % damage, 15 +20 % damage as a shiny member.
 *   boosts        Rare Candy (+2 levels), Lucky Egg (+25 % XP), Amulet Coin (+50 % ₽), Honey (+1 alpha a zone), Dawn Stone (a
 *                 shiny in zone 1), Master Ball (the run's first League / shiny encounter faints at once). Max 9 each; armed
 *                 on this device, spent at the run's start (G-counters `bg.<id>.<dev>` got, `bu.<id>.<dev>` used).
 *   the card      avatar, frame and title (`card.*` = Lamport stamp x 4096 + choice: the latest pick wins).
 *
 * The RUN ROW (row()): [Lab levels as base-36 digits, shiny-perk tier, boost mask, shiny member 0/1], fixed at the run's
 * start (begin). Every Lab / perk / boost effect is effects(row) (pure), so the host, a co-op guest and a replay or spectator
 * read the same numbers: the `x` block v9 carries it as `k` (core.js), the replay header as `h.k`. Item exclusions (locked,
 * archived) are fixed at begin too and only the host rolls items.
 */
G.ExpEN = Object.assign(G.ExpEN || {}, {
  'Pokémonedas': 'Pokémonedas', 'Expedición · cuartel de la Liga': 'Expedition · League HQ',
  'Laboratorio': 'Lab', 'Objetos': 'Items', 'Archivo': 'Archive', 'Investigación': 'Research', 'Tareas': 'Tasks', 'Logros': 'Achievements', 'Tarjeta': 'Card',
  'Atrás': 'Back', 'Nv. {x}/{x}': 'Lv {x}/{x}', 'Máximo': 'Max', 'Comprar': 'Buy', 'Te faltan Pokémonedas': 'Not enough Pokémonedas',
  'Pokémonedas: +{x}': 'Pokémonedas: +{x}', 'Pokémonedas: +{x} (×{x} {x})': 'Pokémonedas: +{x} (×{x} {x})',
  'Tus Pokémonedas de siempre: se ganan jugando (partidas, tareas y logros) y nunca se venden.': 'Your usual Pokémonedas: earned by playing (runs, tasks and achievements), never sold.',
  // the Lab
  'Entrenamiento': 'Training', 'Aguante': 'Stamina', 'Agilidad': 'Agility', 'Estudio': 'Study', 'Comercio': 'Trading', 'Fortuna': 'Fortune',
  'Magnetismo': 'Magnetism', 'Restos': 'Leftovers', 'Caparazón': 'Shell', 'Cambiar': 'Refresh', 'Saltar': 'Skip', 'Vetar': 'Banish',
  'Huecos de vitamina': 'Vitamin slots', 'Hueco de movimiento': 'Move slot', 'Cuarta opción': 'Fourth option', 'Revivir': 'Revive',
  'Equipo de apoyo': 'Support team',
  '+{x} uso por partida': '+{x} use a run', '+{x} hueco de vitamina': '+{x} vitamin slot', '+{x} hueco de movimiento': '+{x} move slot',
  '+{x} carta en cada subida de nivel': '+{x} card at each level-up', 'Empiezas con un Revivir Máximo': 'Start with a Max Revive',
  '+{x} % de investigación': '+{x}% research', '+{x} hueco de Alfa de apoyo': '+{x} Support Alpha slot', '+{x} huecos de Archivo': '+{x} Archive slots',
  'Ahora: {x}': 'Now: {x}', 'Siguiente: {x}': 'Next: {x}', 'Nada todavía': 'Nothing yet',
  // items / archive
  'Desbloqueo: {x}': 'Unlock: {x}', 'En la bolsa de objetos': 'In the drop pool', 'Bloqueado': 'Locked', 'Listo para comprar': 'Ready to buy',
  '{x} / {x} objetos en la bolsa': '{x} / {x} items in the drop pool',
  'El Archivo guarda objetos fuera de la bolsa: {x} / {x} huecos': 'The Archive keeps items out of the pool: {x} / {x} slots',
  'Construye el Archivo en el Laboratorio para apartar objetos de la bolsa.': 'Build the Archive in the Lab to keep items out of the drop pool.',
  'Archivado': 'Archived', 'Archivar': 'Archive', 'Sacar': 'Return', 'El Archivo está lleno': 'The Archive is full',
  // research
  'Avatares: {x} / {x} · investigación ×{x}': 'Avatars: {x} / {x} · research ×{x}', 'Avatar': 'Avatar',
  'Cada derrota de la familia suma: 1, élite 2, invocador 4, alfa o tótem 5, jefe 10, jaula 25.': "Each defeat in the family adds: 1, elite 2, summoner 4, alpha or totem 5, boss 10, cage 25.",
  '¡Avatar nuevo: {x}!': 'New avatar: {x}!', 'Investigación: +{x}': 'Research: +{x}',
  // tasks
  'Diarias': 'Daily', 'Semanales': 'Weekly', 'Se renuevan en {x}': 'Reset in {x}', 'Hecha': 'Done', 'Cambiar tarea': 'Reroll',
  'Bonus: las 3 diarias · racha {x} → +{x} Pokémonedas y un potenciador': 'Bonus: all 3 dailies · streak {x} → +{x} Pokémonedas and a boost',
  'Bonus: las 3 semanales → +{x} Pokémonedas y 3 potenciadores': 'Bonus: all 3 weeklies → +{x} Pokémonedas and 3 boosts',
  'Potenciadores (para la próxima partida)': 'Boosts (for your next run)', 'Usar': 'Use', 'Usará': 'Armed',
  '¡Tarea hecha: {x}! +{x} Pokémonedas': 'Task done: {x}! +{x} Pokémonedas', '¡Bonus diario! +{x} Pokémonedas · {x}': 'Daily bonus! +{x} Pokémonedas · {x}', '¡Bonus semanal! +{x} Pokémonedas': 'Weekly bonus! +{x} Pokémonedas',
  'Pago doble corregido: {x} Pokémonedas': 'Double payment fixed: {x} Pokémonedas',
  'Ya cambiaste una tarea hoy': 'You already rerolled a task today', 'Ya cambiaste una tarea esta semana': 'You already rerolled a task this week',
  'Derrota a {x} Pokémon': 'Defeat {x} Pokémon', 'Juega {x} minutos': 'Play {x} minutes', 'Llega a la zona {x}': 'Reach zone {x}',
  'Vence a {x} guardianes': 'Beat {x} guardians', 'Abre {x} Poké Balls': 'Open {x} Poké Balls', 'Usa {x} altares': 'Use {x} altars',
  'Lanza {x} definitivos': 'Cast {x} Ultimates', 'Provoca {x} reacciones': 'Trigger {x} reactions', 'Captura {x} alfas': 'Catch {x} alphas',
  'Captura {x} Pokémon': 'Catch {x} Pokémon', 'Evoluciona {x} veces': 'Evolve {x} times', 'Termina {x} partidas': 'Finish {x} runs',
  'Gana {x} mapas': 'Win {x} maps', 'Libera {x} Pokémon enjaulados': 'Free {x} caged Pokémon',
  'Vence a un guardián': 'Beat a guardian', 'Usa un altar': 'Use an altar', 'Captura un alfa': 'Catch an alpha', 'Captura un Pokémon': 'Catch a Pokémon',
  'Evoluciona una vez': 'Evolve once', 'Termina una partida': 'Finish a run', 'Libera a un Pokémon enjaulado': 'Free a caged Pokémon', 'Gana un mapa': 'Win a map',
  'Captura un variocolor': 'Catch a shiny', 'Consigue una medalla de oro': 'Earn a gold medal', 'Consigue una medalla de campeón': 'Earn a champion medal',
  'Consigue un avatar': 'Earn an avatar', 'Captura un miembro de la Liga': 'Catch a League member', 'Alcanza la madurez': 'Reach Maturity',
  'Caramelo Raro': 'Rare Candy', 'Huevo Suerte': 'Lucky Egg', 'Moneda Amuleto': 'Amulet Coin', 'Miel': 'Honey', 'Piedra Alba': 'Dawn Stone', 'Master Ball': 'Master Ball',
  '+2 niveles al empezar': '+2 levels at the start', '+25 % de experiencia': '+25% XP', '+50 % de ₽': '+50% ₽', '+1 alfa por zona': '+1 alpha a zone',
  'Un variocolor en la zona 1': 'A shiny in zone 1', 'Tu primer encuentro se debilita al momento': 'Your first encounter faints at once',
  'Potenciadores: {x}': 'Boosts: {x}',
  // achievements
  '{x} / {x} logros': '{x} / {x} achievements', '¡Logro: {x}! +{x} Pokémonedas': 'Achievement: {x}! +{x} Pokémonedas', 'Título: {x}': 'Title: {x}', 'Marco: {x}': 'Frame: {x}',
  // card
  'Tu tarjeta de la Expedición': 'Your Expedition card', 'Marcos': 'Frames', 'Títulos': 'Titles', 'Avatares': 'Avatars', 'Sin título': 'No title',
  'Tu miembro de la Liga': 'Your League member', 'Ventajas variocolor ({x} capturados)': 'Shiny perks ({x} caught)',
  '{x} variocolor: {x}': '{x} shinies: {x}', 'Amuleto Iris en cada partida': 'Shiny Charm every run', '+20 % de daño con un miembro variocolor': '+20% damage as a shiny member',
  'Básico': 'Basic', 'Hoja': 'Leaf', 'Piedra': 'Stone', 'Cristal': 'Crystal', 'Prisma': 'Prism', 'Campeón': 'Champion', 'Pesadilla': 'Nightmare',
  'Variocolor': 'Shiny', 'Cinta': 'Ribbon', 'Maestro': 'Master', 'Desbloquéalo: {x}': 'Unlock: {x}', 'En uso': 'In use', 'Elegir': 'Choose',
  // goals
  'Compra {x} veces a Meowth': 'Buy from Meowth {x} times', 'Come {x} bayas': 'Eat {x} berries', 'Alcanza la madurez {x}': 'Reach Maturity {x}',
  'Gana un mapa en Difícil': 'Win a map on Hard', 'Captura {x} variocolor': 'Catch {x} shinies', 'Consigue {x} medalla de oro': 'Earn {x} gold medal',
  'Gana un mapa en Pesadilla': 'Win a map on Nightmare', 'Consigue {x} medalla de campeón': 'Earn {x} champion medal',
  'Ten {x} miembros de la Liga': 'Have {x} League members', 'Captura {x} miembros de la Liga': 'Catch {x} League members',
  'Consigue {x} avatares': 'Earn {x} avatars', 'Sube el Laboratorio a {x} niveles': 'Raise the Lab to {x} levels', 'Completa {x} tareas': 'Complete {x} tasks',
  'Élite / Maestro': 'Elite / Master',
  // achievement names and titles
  'Primeros pasos': 'First steps', 'Habitual': 'Regular', 'Veterano': 'Veteran', 'Más allá del bosque': 'Beyond the forest', 'El santuario': 'The shrine',
  'Mapa completado': 'Map complete', 'Explorador': 'Explorer', 'Sin miedo': 'Fearless', 'Pesadilla superada': 'Nightmare overcome', 'Pesadilla andante': 'Walking Nightmare',
  'Contrarreloj de oro': 'Golden time attack', 'Campeón del reloj': 'Clock champion', 'Mil derrotas': 'A thousand KOs', 'Diez mil derrotas': 'Ten thousand KOs',
  'Imparable': 'Unstoppable', 'Cazaguardianes': 'Guardian hunter', 'Alfa amigo': 'Alpha friend', 'Manada alfa': 'Alpha pack', 'Primer fichaje': 'First signing',
  'Liga en marcha': 'League on the move', 'Gran Liga': 'Grand League', 'Directiva de la Liga': 'League Director', 'Destello': 'Sparkle', 'Coleccionista variocolor': 'Shiny collector',
  'Química': 'Chemistry', 'Alquimista': 'Alchemist', 'Definitivo': 'Ultimate', 'Sin límites': 'No limits', 'Abrebolas': 'Ball opener', 'Liberador': 'Liberator',
  'Investigador': 'Researcher', 'Enciclopedia': 'Encyclopedia', 'Investigador jefe': 'Head Researcher', 'Ayudante de laboratorio': 'Lab assistant', 'Profesor': 'Professor',
  'Constante': 'Steady', 'Élite de temporada': 'Season Elite', 'Maestro de temporada': 'Season Master',
  // (DLC D11: Survival's tasks and achievements)
  'Aguanta {x} minutos en Supervivencia': 'Last {x} minutes in Survival', 'Vence a {x} jefes de hito': 'Beat {x} milestone bosses',
  'Vence a un jefe de hito': 'Beat a milestone boss', 'Sella {x} pactos': 'Seal {x} pacts', 'Derrota a Mewtwo en Supervivencia': 'Defeat Mewtwo in Survival',
  'Superviviente': 'Survivor', 'Resistencia': 'Endurance', 'Medianoche': 'Midnight', 'Leyenda de la Supervivencia': 'Survival Legend',
  'Pactista': 'Pact maker', 'Cazahitos': 'Milestone hunter'

});
G.I18n.add(G.ExpEN);

G.ExpMeta = (() => {
  const T = G.I18n;
  const F = (es, ...v) => { const en = T.lang === 'en' && G.ExpEN[es]; let i = 0; return en ? en.replace(/\{x\}/g, () => v[i++]) : T.f(es, ...v); };
  const Sv = () => G.ExpSave;
  const LG = () => G.ExpLeague, IT = () => G.ExpItems, C = () => G.ExpClassic, TR = () => G.ExpTier;
  const CP = () => G.ExpCap, UL = () => G.ExpUlt, EC = () => G.ExpEco, RX = () => G.ExpRx, LV = () => G.ExpLevel;
  const ICON = n => '/overworld/item_icons/' + n + '.png';

  // ---------------- balance (tune here; README "DLC D10") ----------------
  const K = {
    // POKÉMONEDAS (owner decision #4): every price and reward below is in the D10 table's units; coinsOf(n) = round(n x SCALE / 5) x 5.
    // SCALE makes an Expedition clear pay about what a base run of the same length pays (README "DLC D11", measured with the
    // same fixed-step sim): a base Normal run pays time / 5 + KOs / 4 + 80 a boss + the coins picked up, 854 at 15:00 and
    // 1,190 at 19:00 (~1,300-1,500 at 23:00); a Normal clear (~23:00, ~4,000 KOs, 420-455 units) x3 = ~1,270-1,365. Prices
    // scale the same, so the Lab and the unlocks take the runs D10 intended (the base game's own upgrades: 58,310 in all).
    SCALE: 3,
    // a run: (BASE + KOs / 40 + 25 (zone - 1) + 30 a boss + 120 if won + 15 a catch) x the tier's pay (study 2.11: x1 / 1.75 / 2.5),
    // then x SCALE in Pokémonedas. A run under MIN_T seconds pays nothing (no quit-farming).
    PAY: { BASE: 10, KO: 1 / 40, ZONE: 25, BOSS: 30, WIN: 120, CATCH: 15, MIN_T: 60, LEGEND: 60, SURV_MIN: 4 },   // (D11: Survival: + 60 a legendary, on top of its boss, and + 4 a minute survived (x3 = 12 a minute, the base run's time / 5): an endless run has no zones or win to pay)
    // research (study 2.14): a KO 1, elite 2, summoner 4, alpha / totem 5, boss 10, a freed cage 25; x(1 + 0.25 Lab Research)
    RS: { ko: 1, elite: 2, summoner: 4, alpha: 5, boss: 10, cage: 25, LAB: 0.25 },
    RS_NEED: { starter: 400, common: 400, uncommon: 600, rare: 900, legendary: 60 },   // a family's research to finish it (ours)
    // tasks (study 2.14): 3 daily (60 / 100 / 160) + 50 x streak (max 5) and a boost; 3 weekly (300 / 450 / 700) + 500 and 3 boosts (x SCALE)
    DAILY: [60, 100, 160], WEEKLY: [300, 450, 700], STREAK: 50, STREAK_MAX: 5, WEEK_BONUS: 500, WEEK_BOOSTS: 3,
    DAY0: Date.UTC(2026, 0, 1), WEEK0: Date.UTC(2025, 11, 29), DAY: 86400000,   // (WEEK0: a Monday, UTC)
    BOOST_MAX: 9, ARCHIVE_PER: 3, HONEY_AT: [200, 300],
    // shiny perks (study 2.14) by shinies caught
    SHINY: [[2, 'luck', 3], [4, 'xp', 0.04], [6, 'charm', 1], [10, 'dmg', 0.03], [15, 'member', 0.2]]
  };
  // the 19 Lab upgrades (study 2.14). ORDER IS THE ROW'S: append only. price(lvl) = round(base x growth^lvl / 5) x 5 or `prices`.
  const LAB = [
    { id: 'training', name: 'Entrenamiento', icon: 'muscle_band', max: 8, base: 300, g: 1.35, stat: 'dmg', per: 0.04 },
    { id: 'stamina', name: 'Aguante', icon: 'hp_up', max: 8, base: 250, g: 1.35, stat: 'hp', per: 8 },
    { id: 'agility', name: 'Agilidad', icon: 'carbos', max: 6, base: 300, g: 1.4, stat: 'spd', per: 0.025 },
    { id: 'study', name: 'Estudio', icon: 'exp_share', max: 5, base: 400, g: 1.45, stat: 'xp', per: 0.05 },
    { id: 'trading', name: 'Comercio', icon: 'amulet_coin', max: 5, base: 300, g: 1.45, stat: 'coin', per: 0.08 },
    { id: 'fortune', name: 'Fortuna', icon: 'lucky_punch', max: 5, base: 400, g: 1.5, stat: 'luck', per: 5 },
    { id: 'magnetism', name: 'Magnetismo', icon: 'magnet', max: 4, base: 250, g: 1.5, stat: 'magnet', per: 0.1 },
    { id: 'leftovers', name: 'Restos', icon: 'leftovers', max: 4, base: 400, g: 1.5, stat: 'regen', per: 0.3 },
    { id: 'shell', name: 'Caparazón', icon: 'shoal_shell', max: 5, base: 350, g: 1.45, stat: 'armor', per: 2 },
    { id: 'refresh', name: 'Cambiar', icon: 'vs_seeker', max: 4, base: 400, g: 1.6, text: '+{x} uso por partida' },
    { id: 'skip', name: 'Saltar', icon: 'escape_rope', max: 4, base: 300, g: 1.6, text: '+{x} uso por partida' },
    { id: 'banish', name: 'Vetar', icon: 'cleanse_tag', max: 5, base: 500, g: 1.5, text: '+{x} uso por partida' },
    { id: 'vitamins', name: 'Huecos de vitamina', icon: 'protein', max: 2, prices: [1200, 3000], text: '+{x} hueco de vitamina' },
    { id: 'moveslot', name: 'Hueco de movimiento', icon: 'tm', max: 1, prices: [1500], text: '+{x} hueco de movimiento' },
    { id: 'option', name: 'Cuarta opción', icon: 'teachy_tv', max: 1, prices: [3000], text: '+{x} carta en cada subida de nivel' },
    { id: 'revive', name: 'Revivir', icon: 'max_revive', max: 1, prices: [5000], text: 'Empiezas con un Revivir Máximo' },
    { id: 'research', name: 'Investigación', icon: 'silph_scope', max: 4, base: 500, g: 1.6, text: '+{x} % de investigación', k: 25 },
    { id: 'support', name: 'Equipo de apoyo', icon: 'friend_ball', max: 1, prices: [3500], text: '+{x} hueco de Alfa de apoyo' },
    { id: 'archive', name: 'Archivo', icon: 'storage_key', max: 3, base: 800, g: 2, text: '+{x} huecos de Archivo', k: K.ARCHIVE_PER }
  ];
  const LAB_BY = {};
  LAB.forEach((u, i) => { u.i = i; LAB_BY[u.id] = u; });
  function price(id, lvl) {
    const u = LAB_BY[id];
    if (!u || lvl >= u.max) return Infinity;
    return u.prices ? u.prices[lvl] : Math.round(u.base * Math.pow(u.g, lvl) / 5) * 5;
  }
  const labCost = (id, lvl) => { let s = 0; for (let i = 0; i < Math.min(lvl, LAB_BY[id].max); i++) s += price(id, i); return s; };

  // the 6 pre-run boosts (study 2.6). ORDER IS THE ROW'S MASK: append only.
  const BOOSTS = [
    { id: 'candy', name: 'Caramelo Raro', icon: 'rare_candy', text: '+2 niveles al empezar' },
    { id: 'egg', name: 'Huevo Suerte', icon: 'lucky_egg', text: '+25 % de experiencia', stat: 'xp', v: 0.25 },
    { id: 'coin', name: 'Moneda Amuleto', icon: 'amulet_coin', text: '+50 % de ₽', stat: 'coin', v: 0.5 },
    { id: 'honey', name: 'Miel', icon: 'syrupy_apple', text: '+1 alfa por zona' },
    { id: 'dawn', name: 'Piedra Alba', icon: 'dawn_stone', text: 'Un variocolor en la zona 1' },
    { id: 'master', name: 'Master Ball', icon: 'master_ball', text: 'Tu primer encuentro se debilita al momento' }
  ];
  const BOOST_BY = {};
  BOOSTS.forEach((b, i) => { b.i = i; BOOST_BY[b.id] = b; });

  // ---------------- the save's numbers ----------------
  const S0 = () => Sv().data.counters;
  const sumPrefix = p => { let s = 0; const c = S0(); for (const k in c) if (k.startsWith(p)) s += c[k]; return s; };
  const maxPrefix = p => { let s = 0; const c = S0(); for (const k in c) if (k.startsWith(p)) s = Math.max(s, c[k]); return s; };
  const labLv = id => Math.min(LAB_BY[id].max, Sv().get('lab.' + id));
  let devMemo = {};
  /** This browser's id for the save's identity (G-counter keys). Never Math.random (crypto, else a fixed id). */
  function dev() {
    const w = Sv().who || 'guest';
    if (devMemo[w]) return devMemo[w];
    const k = 'micasurvivorexp_dev.' + w;
    let d = null;
    try { d = localStorage.getItem(k); } catch (e) { /* no storage: a fixed id */ }
    if (!d || !/^[a-z0-9]{4,12}$/.test(d)) {
      d = 'local';
      try { const a = new Uint32Array(2); crypto.getRandomValues(a); d = (a[0].toString(36) + a[1].toString(36)).slice(0, 10).padEnd(6, '0'); localStorage.setItem(k, d); } catch (e) { /* the fixed id */ }
    }
    return (devMemo[w] = d);
  }

  // ---------------- the items (D5's 60): 25 start out of the pool ----------------
  // [item, counter goal, need, price (x SCALE in Pokémonedas)] (study 2.6: "revealed by a counter goal, then bought, 150-3,500")
  const UNLOCKS = [
    ['scopelens', 'kos', 2000, 300], ['widelens', 'balls', 25, 300], ['lightclay', 'casts', 20, 300], ['amuletcoin', 'shop', 10, 250],
    ['choiceband', 'wins', 1, 600], ['choicespecs', 'wins', 1, 600], ['choicescarf', 'zone', 3, 500], ['expertbelt', 'reactions', 100, 500],
    ['shellbell', 'kos', 5000, 600], ['rockyhelmet', 'guardians', 10, 500], ['focusband', 'runs', 20, 500], ['eviolite', 'evos', 10, 500],
    ['sitrusberry', 'berries', 20, 400], ['machobrace', 'mat', 1, 600],
    ['razorfang', 'kos', 20000, 1200], ['weaknesspolicy', 'guardians', 25, 1200], ['assaultvest', 'winHard', 1, 1500], ['heavyboots', 'wins', 3, 1200],
    ['upgrade', 'alphas', 5, 1000], ['shinycharm', 'shinies', 1, 1500],
    ['electirizer', 'reactions', 1000, 2500], ['sunstone', 'casts', 50, 2500], ['reliccrown', 'gold', 1, 3000],
    ['maxrevive', 'winNight', 1, 3500], ['revivalherb', 'champion', 1, 3500]
  ].map(([id, k, n, cost]) => ({ id, k, n, cost }));
  const UNLOCK_BY = {};
  for (const u of UNLOCKS) UNLOCK_BY[u.id] = u;
  const bought = id => Sv().has('items.bought', id);
  const locked = id => !!UNLOCK_BY[id] && !bought(id);

  /** The meta counters goals, achievements and unlocks read (all from the Expedition save). */
  function stat(k) {
    const S = Sv(), c = S0();
    switch (k) {
      case 'runs': return S.get('runs');
      case 'kos': return S.get('kos');
      case 'wins': { let w = 0; for (const n in c) if (/^wins\./.test(n)) w += c[n]; return w; }
      case 'winHard': return Object.keys(c).some(n => /^wins\.[a-z]+\.hard$/.test(n) && c[n] > 0) ? 1 : 0;
      case 'winNight': return Object.keys(c).some(n => /^wins\.[a-z]+\.nightmare$/.test(n) && c[n] > 0) ? 1 : 0;
      case 'zone': return maxPrefix('zone.');
      case 'guardians': return S.get('guardians');
      case 'balls': return S.get('eco.balls');
      case 'shop': return S.get('eco.shop');
      case 'altars': return S.get('eco.altars');
      case 'freed': return S.get('eco.freed');
      case 'berries': return S.get('eco.berries');
      case 'casts': return S.get('ult.casts');
      case 'reactions': return S.get('rx.total');
      case 'evos': return S.get('lg.evo');
      case 'mat': return S.get('lg.mat');
      case 'alphas': return S.get('cap.alpha');
      case 'league': return LG() ? LG().roster().length : 0;
      case 'leagueCaught': return S.get('cap.league');
      case 'shinies': return shinies();
      case 'gold': return S.get('medals.gold') + S.get('medals.champion');
      case 'champion': return S.get('medals.champion');
      case 'avatars': return avatars().length;
      case 'lab': return LAB.reduce((a, u) => a + labLv(u.id), 0);
      case 'tasks': return S.get('tk.done');
      case 'survMin': return Math.floor(S.get('surv.best') / 60);   // (D11: Survival)
      case 'miles': return S.get('surv.miles');
      case 'mewtwo': return S.get('surv.mewtwo');
      case 'pacts': return S.get('surv.pacts');
    }
    return 0;
  }
  const GOAL_TEXT = {
    kos: 'Derrota a {x} Pokémon', balls: 'Abre {x} Poké Balls', casts: 'Lanza {x} definitivos', shop: 'Compra {x} veces a Meowth', wins: 'Gana {x} mapas',
    zone: 'Llega a la zona {x}', reactions: 'Provoca {x} reacciones', guardians: 'Vence a {x} guardianes', runs: 'Termina {x} partidas',
    evos: 'Evoluciona {x} veces', berries: 'Come {x} bayas', mat: 'Alcanza la madurez {x}', winHard: 'Gana un mapa en Difícil',
    alphas: 'Captura {x} alfas', shinies: 'Captura {x} variocolor', gold: 'Consigue {x} medalla de oro', winNight: 'Gana un mapa en Pesadilla',
    champion: 'Consigue {x} medalla de campeón', freed: 'Libera {x} Pokémon enjaulados', altars: 'Usa {x} altares', league: 'Ten {x} miembros de la Liga',
    leagueCaught: 'Captura {x} miembros de la Liga', avatars: 'Consigue {x} avatares', lab: 'Sube el Laboratorio a {x} niveles', tasks: 'Completa {x} tareas',
    survMin: 'Aguanta {x} minutos en Supervivencia', miles: 'Vence a {x} jefes de hito', pacts: 'Sella {x} pactos', smins: 'Aguanta {x} minutos en Supervivencia'   // (D11)
  };
  // (one: the singular, "Win a map" rather than "Win 1 maps")
  const GOAL_ONE = { wins: 'Gana un mapa', runs: 'Termina una partida', guardians: 'Vence a un guardián', altars: 'Usa un altar', alphas: 'Captura un alfa',
    catches: 'Captura un Pokémon', evos: 'Evoluciona una vez', freed: 'Libera a un Pokémon enjaulado', shinies: 'Captura un variocolor', gold: 'Consigue una medalla de oro',
    champion: 'Consigue una medalla de campeón', avatars: 'Consigue un avatar', leagueCaught: 'Captura un miembro de la Liga', mat: 'Alcanza la madurez',
    mewtwo: 'Derrota a Mewtwo en Supervivencia', miles: 'Vence a un jefe de hito' };
  const goalText = (k, n) => (n === 1 && GOAL_ONE[k] ? T.t(GOAL_ONE[k]) : F(GOAL_TEXT[k] || '{x}', n.toLocaleString('en')));

  // ---------------- achievements (32; the set `ach`) ----------------
  const ACH = [
    ['run1', 'Primeros pasos', 'runs', 1, 50], ['run10', 'Habitual', 'runs', 10, 150], ['run50', 'Veterano', 'runs', 50, 400],
    ['zone2', 'Más allá del bosque', 'zone', 2, 50], ['zone4', 'El santuario', 'zone', 4, 150],
    ['win1', 'Mapa completado', 'wins', 1, 300], ['win10', 'Explorador', 'wins', 10, 800, 'Explorador'],
    ['winhard', 'Sin miedo', 'winHard', 1, 500], ['winnight', 'Pesadilla superada', 'winNight', 1, 1000, 'Pesadilla andante', 'nightmare'],
    ['gold', 'Contrarreloj de oro', 'gold', 1, 400], ['champ', 'Campeón del reloj', 'champion', 1, 800, null, 'champion'],
    ['ko1k', 'Mil derrotas', 'kos', 1000, 100], ['ko10k', 'Diez mil derrotas', 'kos', 10000, 400], ['ko50k', 'Imparable', 'kos', 50000, 1000, 'Imparable'],
    ['guard10', 'Cazaguardianes', 'guardians', 10, 200],
    ['alpha1', 'Alfa amigo', 'alphas', 1, 100], ['alpha10', 'Manada alfa', 'alphas', 10, 400],
    ['league1', 'Primer fichaje', 'leagueCaught', 1, 200], ['league5', 'Liga en marcha', 'leagueCaught', 5, 400], ['league30', 'Gran Liga', 'league', 30, 1000, 'Directiva de la Liga'],
    ['shiny1', 'Destello', 'shinies', 1, 300], ['shiny5', 'Coleccionista variocolor', 'shinies', 5, 800, null, 'shiny'],
    ['rx100', 'Química', 'reactions', 100, 150], ['rx1k', 'Alquimista', 'reactions', 1000, 500],
    ['ult10', 'Definitivo', 'casts', 10, 150], ['ult100', 'Sin límites', 'casts', 100, 500],
    ['ball50', 'Abrebolas', 'balls', 50, 200], ['cage10', 'Liberador', 'freed', 10, 300],
    ['avatar1', 'Investigador', 'avatars', 1, 150], ['avatar10', 'Enciclopedia', 'avatars', 10, 600, 'Investigador jefe'],
    ['lab10', 'Ayudante de laboratorio', 'lab', 10, 300], ['lab50', 'Profesor', 'lab', 50, 1000, 'Profesor'],
    ['task30', 'Constante', 'tasks', 30, 500],
    // (D11: Survival)
    ['surv10', 'Superviviente', 'survMin', 10, 150], ['surv30', 'Resistencia', 'survMin', 30, 500], ['miles10', 'Cazahitos', 'miles', 10, 300],
    ['mewtwo', 'Medianoche', 'mewtwo', 1, 1200, 'Leyenda de la Supervivencia'], ['pact10', 'Pactista', 'pacts', 10, 300]
  ].map(([id, name, k, n, star, title, frame]) => ({ id, name, k, n, star, title: title || null, frame: frame || null }));
  const ACH_BY = {};
  for (const a of ACH) ACH_BY[a.id] = a;
  const achDone = a => stat(a.k) >= a.n;
  const achHave = id => Sv().has('ach', id);
  /** Claim every achievement now complete (into the set: exactly once). -> the new ones */
  function checkAch() {
    const out = [];
    for (const a of ACH) if (!achHave(a.id) && achDone(a) && Sv().add('ach', a.id)) { credit(coinsOf(a.star), 'ach.' + a.id); out.push(a); }
    if (out.length) Sv().commit();
    return out;
  }

  // ---------------- Pokémonedas: the base save's, through G.Expedition.wallet and its per-device ledger ----------------
  /** A D10-table amount in Pokémonedas (rounded to 5). Pure. */
  const coinsOf = n => Math.max(0, Math.round(n * K.SCALE / 5) * 5);
  const W = () => G.Expedition.wallet;
  /** Your Pokémonedas (the base save's, shown below 0 as 0 like the base game). */
  const balance = () => Math.max(0, W().balance());
  /** What the Expedition has paid you (a stat for the panel; the coins themselves are the base save's). */
  const earned = () => Sv().get('pay.coins');
  /** An earning: into the base save (this device's ledger entry). what: once per account ("<what>:<device>" in cur.earn). */
  function credit(n, what) {
    n = Math.floor(n);
    if (!(n > 0)) return 0;
    if (what) Sv().add('cur.earn', what + ':' + dev());
    if (!W().earn(n)) return 0;
    Sv().bump('pay.coins', n);
    return n;
  }
  /** A spend (refused if you can't afford it). what: once per account ("<what>:<device>" in cur.spend). -> true / false */
  function debit(n, what) {
    n = Math.floor(n);
    if (!(n > 0)) return true;
    if (balance() < n || !W().spend(n)) return false;
    if (what) Sv().add('cur.spend', what + ':' + dev());
    return true;
  }
  /** The Pokémonedas of a recorded purchase / claim `what` (lab.<id>.<lv>, item.<id>, ach.<id>), or 0. */
  function amountOf(what) {
    const p = what.split('.');
    if (p[0] === 'lab' && LAB_BY[p[1]]) { const v = price(p[1], +p[2]); return Number.isFinite(v) ? coinsOf(v) : 0; }
    if (p[0] === 'item' && UNLOCK_BY[p[1]]) return coinsOf(UNLOCK_BY[p[1]].cost);
    if (p[0] === 'ach' && ACH_BY[p[1]]) return coinsOf(ACH_BY[p[1]].star);
    return 0;
  }
  /**
   * Two devices paid for the same thing while apart: every device but the first (by id) undoes its own copy, once. A spend is
   * refunded, an earning taken back (as far as the balance goes); each fix is "<what>:<device>" in cur.fix (a union set).
   * Tasks: this device's last paid slot (`tkp.<kind>.<slot>.<dev>` = (period + 1) x 10 + reroll) and bonus (`tkbp.<kind>.<dev>` =
   * (period + 1) x 10 + streak) against the others'. -> the Pokémonedas moved (+ refunded, - taken back)
   */
  function reconcile() {
    if (!Sv() || !Sv().data || !G.Expedition || !G.Expedition.wallet || !(G.DB && G.DB.save)) return 0;
    const me = dev(), fixed = new Set(Sv().list('cur.fix'));
    let moved = 0;
    const fix = (key, amt, refund) => {
      if (fixed.has(key) || !(amt > 0)) return;
      fixed.add(key); Sv().add('cur.fix', key);
      if (refund) { if (W().earn(amt)) moved += amt; }
      else { const take = Math.min(amt, Math.max(0, W().balance())); if (take > 0 && W().spend(take)) moved -= take; }
    };
    for (const [set, refund] of [['cur.spend', true], ['cur.earn', false]]) {
      const by = new Map();
      for (const id of Sv().list(set)) { const i = id.lastIndexOf(':'); if (i < 1) continue; const w = id.slice(0, i); if (!by.has(w)) by.set(w, []); by.get(w).push(id.slice(i + 1)); }
      for (const [w, devs] of by) {
        if (devs.length < 2 || !devs.includes(me)) continue;
        devs.sort();
        if (devs[0] !== me) fix(w + ':' + me, amountOf(w), refund);
      }
    }
    // the tasks: the same slot, period and reroll paid on another device (one with a smaller id) as on this one
    const c = S0();
    for (const k in c) {
      const m = /^(tkp|tkbp)\.([dw])(?:\.(\d))?\.([a-z0-9]+)$/.exec(k);
      if (!m || m[4] !== me || !c[k]) continue;
      const rest = k.slice(0, k.length - me.length);
      const first = Object.keys(c).filter(o => o.startsWith(rest) && c[o] === c[k] && /^[a-z0-9]+$/.test(o.slice(rest.length))).map(o => o.slice(rest.length)).sort()[0];
      if (first === me) continue;
      const amt = m[1] === 'tkp' ? coinsOf((m[2] === 'd' ? K.DAILY : K.WEEKLY)[+m[3]] || 0) : coinsOf(m[2] === 'd' ? K.STREAK * (c[k] % 10) : K.WEEK_BONUS);
      fix('tk.' + k.slice(0, k.length - me.length - 1) + '.' + c[k] + ':' + me, amt, false);
    }
    if (moved) { Sv().commit(); if (G.UI && G.UI.toast) G.UI.toast(F('Pago doble corregido: {x} Pokémonedas', (moved > 0 ? '+' : '') + moved), 3200); }
    else if (fixed.size !== Sv().list('cur.fix').length) Sv().commit();
    return moved;
  }

  /** A run's pay (pure): {base (the table's units), mul (the tier's), pay (Pokémonedas)}. p: {kills, time, zone, bosses, won, catches, legends, surv (D11: a Survival run: its minutes pay)}. */
  function payOf(p, diff) {
    const P = K.PAY, mul = TR() ? TR().of(diff).pay : 1;
    if (!(p.time >= P.MIN_T)) return { base: 0, mul, pay: 0 };
    const base = P.BASE + (p.kills || 0) * P.KO + P.ZONE * Math.max(0, (p.zone || 1) - 1) + P.BOSS * (p.bosses || 0) + (p.won ? P.WIN : 0) + P.CATCH * (p.catches || 0) + P.LEGEND * (p.legends || 0) + P.SURV_MIN * (p.surv ? (p.time || 0) / 60 : 0);
    return { base: Math.round(base), mul, pay: coinsOf(base * mul) };
  }

  // ---------------- the Lab ----------------
  /** Buy the next level of a Lab upgrade. -> {ok, level} | {error} */
  function buyLab(id) {
    const u = LAB_BY[id];
    if (!u) return { error: 'unknown' };
    const lv = labLv(id);
    if (lv >= u.max) return { error: 'max' };
    const p = coinsOf(price(id, lv));
    if (!debit(p, 'lab.' + id + '.' + lv)) return { error: 'poor', need: p };
    Sv().best('lab.' + id, lv + 1);
    Sv().commit();
    return { ok: true, level: lv + 1, price: p };
  }
  /** An upgrade's effect at level n, as text. */
  function labText(u, n) {
    if (!n) return T.t('Nada todavía');
    if (u.stat) return IT() ? IT().statText(u.stat, u.per * n) : '';
    if (u.id === 'revive') return T.t(u.text);
    return F(u.text, n * (u.k || 1));
  }

  // ---------------- the Archive (Lamport toggles `arc.<item>`) ----------------
  const arcSlots = lv => (lv == null ? labLv('archive') : lv) * K.ARCHIVE_PER;
  const arcStamp = () => { let m = 0; const c = S0(); for (const k in c) if (k.startsWith('arc.')) m = Math.max(m, Math.floor(c[k] / 2)); return m; };
  const archivedRaw = () => { const c = S0(), out = []; for (const k in c) if (k.startsWith('arc.') && c[k] % 2 === 1) out.push(k.slice(4)); return out; };
  /** The archived items that count (an item order, at most the slots you have). */
  function archived(lv) {
    if (!IT()) return [];
    const on = new Set(archivedRaw());
    return IT().ITEMS.map(i => i.id).filter(id => on.has(id) && !locked(id)).slice(0, arcSlots(lv));
  }
  /** Toggle an item in the Archive. -> {ok, on} | {error} */
  function toggleArchive(id, want) {
    if (!IT() || !IT().IT[id]) return { error: 'unknown' };
    if (locked(id)) return { error: 'locked' };   // (not in the pool yet: nothing to keep out)
    const on = archived().includes(id), to = want == null ? !on : !!want;
    if (to === on) return { ok: true, on };
    if (to && archived().length >= arcSlots()) return { error: 'full' };
    Sv().best('arc.' + id, (arcStamp() + 1) * 2 + (to ? 1 : 0));
    Sv().commit();
    return { ok: true, on: to };
  }

  /** Buy a revealed item into the drop pool. -> {ok} | {error} */
  function buyItem(id) {
    const u = UNLOCK_BY[id];
    if (!u) return { error: 'unknown' };
    if (bought(id)) return { error: 'have' };
    if (stat(u.k) < u.n) return { error: 'goal' };
    const cost = coinsOf(u.cost);
    if (!debit(cost, 'item.' + id)) return { error: 'poor', need: cost };
    Sv().add('items.bought', id);
    Sv().commit();
    return { ok: true };
  }

  // ---------------- research and avatars ----------------
  const famIds = () => (LG() ? LG().D.members.map(m => m.dex) : []);
  const needOf = fam => { const m = LG() && LG().BY[fam]; return K.RS_NEED[(m && m.rank) || 'common'] || K.RS_NEED.common; };
  const research = fam => Sv().get('rs.' + fam);
  const avatars = () => Sv().list('avatar').map(Number);
  /** A KO's research points (study 2.14). */
  function koPts(e) {
    if (e.boss || e.xk === 'guardian' || e.xk === 'legend') return K.RS.boss;
    if (e.xk === 'alpha' || e.xk === 'totem') return K.RS.alpha;
    if (e.xk === 'summoner') return K.RS.summoner;
    if (e.xk === 'elite') return K.RS.elite;
    return K.RS.ko;
  }

  // ---------------- shinies ----------------
  function shinies() { return Math.max(Sv().get('cap.shiny'), Sv().list('shiny.caught').length); }
  /** The shiny-perk tier (0-5) for n shinies caught. */
  const perkTier = n => K.SHINY.filter(([need]) => n >= need).length;

  // ---------------- boosts (G-counters per device) ----------------
  const boostHave = id => Math.max(0, sumPrefix('bg.' + id + '.') - sumPrefix('bu.' + id + '.'));
  function giveBoost(id, n = 1) {
    let got = 0;
    for (let i = 0; i < n && boostHave(id) < K.BOOST_MAX; i++) { Sv().bump('bg.' + id + '.' + dev(), 1); got++; }
    return got;
  }
  const ARM_KEY = 'micasurvivorexp_boosts';
  function armed() { try { const v = JSON.parse(localStorage.getItem(ARM_KEY) || '[]'); return Array.isArray(v) ? v.filter(id => BOOST_BY[id]) : []; } catch (e) { return []; } }
  function arm(id, on) {
    if (!BOOST_BY[id]) return false;
    const a = new Set(armed());
    if (on == null) on = !a.has(id);
    if (on && boostHave(id) <= 0) return false;
    if (on) a.add(id); else a.delete(id);
    try { localStorage.setItem(ARM_KEY, JSON.stringify([...a])); } catch (e) { /* the pick is a convenience */ }
    return on;
  }

  // ---------------- tasks ----------------
  // [id, text, metric, mode ('sum' adds each run, 'max' is one run's best), daily amounts by slot, weekly amounts by slot]
  const TASKS = [
    ['kos', 'Derrota a {x} Pokémon', 'kos', 'sum', [300, 800, 1500], [3000, 6000, 12000]],
    ['time', 'Juega {x} minutos', 'mins', 'sum', [10, 20, 35], [60, 120, 200]],
    ['zone', 'Llega a la zona {x}', 'zone', 'max', [2, 3, 4], null],
    ['guard', 'Vence a {x} guardianes', 'guardians', 'sum', [1, 2, 4], [6, 10, 16]],
    ['balls', 'Abre {x} Poké Balls', 'balls', 'sum', [3, 6, 12], [20, 40, 70]],
    ['altars', 'Usa {x} altares', 'altars', 'sum', [1, 3, 5], [8, 15, 25]],
    ['casts', 'Lanza {x} definitivos', 'casts', 'sum', [2, 5, 10], [15, 30, 50]],
    ['rx', 'Provoca {x} reacciones', 'reactions', 'sum', [20, 60, 150], [200, 400, 800]],
    ['alpha', 'Captura {x} alfas', 'alphas', 'sum', [1, 2, 3], [4, 8, 12]],
    ['catch', 'Captura {x} Pokémon', 'catches', 'sum', [1, 2, 4], [5, 10, 15]],
    ['evo', 'Evoluciona {x} veces', 'evos', 'sum', [1, 2, 4], [5, 10, 16]],
    ['runs', 'Termina {x} partidas', 'runs', 'sum', [1, 2, 3], [5, 10, 15]],
    ['cage', 'Libera {x} Pokémon enjaulados', 'freed', 'sum', [1, 2, 3], [4, 8, 12]],
    ['win', 'Gana {x} mapas', 'wins', 'sum', null, [1, 2, 3]],
    // (D11: Survival: one run's best minutes, and milestone bosses)
    ['surv', 'Aguanta {x} minutos en Supervivencia', 'smins', 'max', [8, 15, 25], [30, 40, 50]],
    ['miles', 'Vence a {x} jefes de hito', 'miles', 'sum', [1, 3, 5], [6, 12, 20]]
  ].map(([id, text, m, mode, d, w]) => ({ id, text, m, mode, d, w }));
  const TASK_BY = {};
  for (const t of TASKS) TASK_BY[t.id] = t;
  function mix(...vals) {
    let h = 0x6D2B79F5 | 0;
    for (const v of vals) { h ^= v | 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16; }
    return h >>> 0;
  }
  const strHash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; };
  const dayOf = now => Math.max(0, Math.floor((now - K.DAY0) / K.DAY));
  const weekOf = now => Math.max(0, Math.floor((now - K.WEEK0) / (7 * K.DAY)));
  const periodOf = (kind, now) => (kind === 'd' ? dayOf(now) : weekOf(now));
  const periodEnds = (kind, now) => (kind === 'd' ? K.DAY0 + (dayOf(now) + 1) * K.DAY : K.WEEK0 + (weekOf(now) + 1) * 7 * K.DAY);
  const whoKey = () => strHash(String(Sv().who || 'guest'));
  /** The reroll used this period: {slot} or null. */
  function rerollOf(kind, per) {
    const v = Sv().get('tk.' + kind + 'r');
    return Math.floor(v / 10) === per + 1 ? { slot: v % 10 - 1 } : null;
  }
  /**
   * A period's 3 tasks (pure for the same save): seeded by the period, the kind and the account; a rerolled slot gets
   * another template. -> [{slot, id, text, need, star, r, have, done, claimed}]
   */
  function tasksOf(kind, now, who) {
    const per = periodOf(kind, now), rng = G.DLC.rng(mix(per, kind === 'd' ? 0xDA1 : 0x3EE, who == null ? whoKey() : who));
    const pool = TASKS.filter(t => (kind === 'd' ? t.d : t.w)).map(t => t.id);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const ids = pool.slice(0, 3), rr = rerollOf(kind, per);
    if (rr && rr.slot >= 0 && rr.slot < 3) ids[rr.slot] = pool[3 + (mix(per, rr.slot, 0x2E) % (pool.length - 3))];
    const stars = kind === 'd' ? K.DAILY : K.WEEKLY;
    return ids.map((id, slot) => {
      const t = TASK_BY[id], need = (kind === 'd' ? t.d : t.w)[slot], r = rr && rr.slot === slot ? 1 : 0;
      const v = Sv().get('tk.' + kind + '.' + slot);
      const have = Math.floor(v / 1e7) === per + 1 && Math.floor(v / 1e6) % 10 === r ? v % 1e6 : 0;
      const claimed = Sv().get('tk.' + kind + 'c.' + slot) === (per + 1) * 10 + r;
      return { slot, id, text: need === 1 && GOAL_ONE[t.m] ? T.t(GOAL_ONE[t.m]) : F(t.text, need.toLocaleString('en')), need, star: stars[slot], r, have: Math.min(have, need), done: have >= need, claimed, mode: t.mode, m: t.m };
    });
  }
  /** Reroll one task this period (one a period; not a finished one). -> true / false */
  function reroll(kind, slot, now) {
    const per = periodOf(kind, now);
    if (rerollOf(kind, per) || !(slot >= 0 && slot < 3)) return false;
    const t = tasksOf(kind, now)[slot];
    if (t.claimed) return false;
    Sv().best('tk.' + kind + 'r', (per + 1) * 10 + slot + 1);
    Sv().commit();
    return true;
  }
  /** The streak today's daily bonus pays (or paid): 1 + yesterday's, up to 5. */
  const dailyStreak = per => { const v = Sv().get('tk.streak'), d = Math.floor(v / 10) - 1; return d === per ? v % 10 : d === per - 1 ? Math.min(K.STREAK_MAX, v % 10 + 1) : 1; };
  /** A run's metrics into this period's tasks; pays what it completes (and the bonuses). -> lines */
  function taskRun(m, now) {
    const out = [], S = Sv();
    for (const kind of ['d', 'w']) {
      const per = periodOf(kind, now), list = tasksOf(kind, now);
      for (const t of list) {
        if (t.claimed) continue;
        const v = Math.floor(m[t.m] || 0);
        const have = t.mode === 'max' ? Math.max(t.have, v) : t.have + v;
        S.best('tk.' + kind + '.' + t.slot, (per + 1) * 1e7 + t.r * 1e6 + Math.min(999999, have));
        if (have >= t.need) {
          S.best('tk.' + kind + 'c.' + t.slot, (per + 1) * 10 + t.r);
          S.best('tkp.' + kind + '.' + t.slot + '.' + dev(), (per + 1) * 10 + t.r);   // (who paid it: reconcile)
          const got = credit(coinsOf(t.star)); S.bump('tk.done');
          out.push(F('¡Tarea hecha: {x}! +{x} Pokémonedas', t.text, got));
        }
      }
      const all = tasksOf(kind, now).every(t => t.claimed), bk = 'tk.' + kind + 'b';
      if (all && S.get(bk) !== per + 1) {
        S.best(bk, per + 1);
        if (kind === 'd') {
          const st = dailyStreak(per);
          S.best('tk.streak', (per + 1) * 10 + st);
          const b = BOOSTS[mix(per, 0xB00, whoKey()) % BOOSTS.length];
          S.best('tkbp.d.' + dev(), (per + 1) * 10 + st);
          const star = credit(coinsOf(K.STREAK * st)); giveBoost(b.id);
          out.push(F('¡Bonus diario! +{x} Pokémonedas · {x}', star, T.t(b.name)));
        } else {
          S.best('tkbp.w.' + dev(), (per + 1) * 10);
          const pay = credit(coinsOf(K.WEEK_BONUS));
          const got = [];
          for (let i = 0; i < K.WEEK_BOOSTS; i++) { const b = BOOSTS[mix(per, 0xB0B, i, whoKey()) % BOOSTS.length]; giveBoost(b.id); got.push(T.t(b.name)); }
          out.push(F('¡Bonus semanal! +{x} Pokémonedas', pay) + ' · ' + got.join(', '));
        }
      }
    }
    return out;
  }

  // ---------------- frames and titles (the card) ----------------
  // ORDER IS THE SAVE'S (card.fr): append only.
  const FRAMES = [
    { id: 'basic', name: 'Básico', css: 'border-color:#8fa3bd' },
    { id: 'leaf', name: 'Hoja', css: 'border-color:#5fd07a;box-shadow:0 0 0 2px #2e7d43 inset', k: 'avatars', n: 1 },
    { id: 'stone', name: 'Piedra', css: 'border-color:#b8a07a;box-shadow:0 0 0 3px #6d5a3c inset', k: 'avatars', n: 5 },
    { id: 'crystal', name: 'Cristal', css: 'border-color:#7fe0ff;box-shadow:0 0 10px #7fe0ff,0 0 0 2px #2b7da0 inset', k: 'avatars', n: 15 },
    { id: 'prism', name: 'Prisma', css: 'border-image:linear-gradient(135deg,#ff6b6b,#ffd23f,#5fd07a,#4f9cf0,#b46cf2) 1', k: 'avatars', n: 40 },
    { id: 'champion', name: 'Campeón', css: 'border-color:#ffd23f;box-shadow:0 0 12px #ffb020,0 0 0 2px #b8860b inset', ach: 'champ' },
    { id: 'nightmare', name: 'Pesadilla', css: 'border-color:#b46cf2;box-shadow:0 0 12px #6b2fa0,0 0 0 2px #2a0f40 inset', ach: 'winnight' },
    { id: 'shiny', name: 'Variocolor', css: 'border-color:#ffe9a0;box-shadow:0 0 12px #fff3c4,0 0 0 2px #c8a2ff inset', ach: 'shiny5' },
    { id: 'ribbon', name: 'Cinta', css: 'border-color:#ff9aa4;box-shadow:0 0 0 3px #a03a48 inset', ribbon: 1 },
    { id: 'master', name: 'Maestro', css: 'border-color:#ffd23f;box-shadow:0 0 14px #ffd23f,0 0 0 3px #7a1f2b inset', ribbon: 4 }
  ];
  const frameOpen = f => (f.k ? stat(f.k) >= f.n : f.ach ? achHave(f.ach) : f.ribbon ? Sv().get('season.best') >= f.ribbon : true);
  const frameHow = f => (f.k ? goalText(f.k, f.n) : f.ach ? T.t(ACH_BY[f.ach].name) : f.ribbon ? (f.ribbon >= 4 ? 'Élite / Maestro' : 'Top 50') : '');
  // titles: the achievements' (ACH order), then the season ribbons' (owner #5: ribbons become titles / frames)
  const TITLES = ACH.filter(a => a.title).map(a => ({ name: a.title, ach: a.id })).concat([{ name: 'Élite de temporada', ribbon: 4 }, { name: 'Maestro de temporada', ribbon: 5 }]);
  const titleOpen = t => (t.ach ? achHave(t.ach) : Sv().get('season.best') >= t.ribbon);
  const CARD_K = 4096;
  const pickOf = k => { const v = Sv().get('card.' + k); return v ? v % CARD_K : null; };
  function setCard(k, v) {
    const cur = Sv().get('card.' + k);
    Sv().best('card.' + k, (Math.floor(cur / CARD_K) + 1) * CARD_K + v);
    Sv().commit();
    return true;
  }
  /** The card: {avatar: dex, frame, title, shiny} (an avatar you no longer have, a locked frame / title: the defaults). */
  function card() {
    const av = pickOf('av'), fr = pickOf('fr'), ti = pickOf('ti');
    const avatar = av && avatars().includes(av) ? av : (LG() ? LG().pickFor() : 1);
    const frame = fr != null && FRAMES[fr] && frameOpen(FRAMES[fr]) ? FRAMES[fr] : FRAMES[0];
    const title = ti && TITLES[ti - 1] && titleOpen(TITLES[ti - 1]) ? TITLES[ti - 1].name : '';
    return { avatar, frame, title };
  }
  const chooseAvatar = dex => (avatars().includes(dex) || dex === 0) && setCard('av', dex);
  const chooseFrame = id => { const i = FRAMES.findIndex(f => f.id === id); return i >= 0 && frameOpen(FRAMES[i]) && setCard('fr', i); };
  const chooseTitle = name => { if (!name) return setCard('ti', 0); const i = TITLES.findIndex(t => t.name === name); return i >= 0 && titleOpen(TITLES[i]) && setCard('ti', i + 1); };

  // ---------------- the run row (fixed at the start; pure effects) ----------------
  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  /** The row now (from the save + the armed boosts you have). */
  function rowNow(boostIds) {
    const lab = LAB.map(u => B36[Math.min(35, labLv(u.id))]).join('');
    let mask = 0;
    for (const id of boostIds || []) if (BOOST_BY[id]) mask |= 1 << BOOST_BY[id].i;
    const member = LG() && LG().run ? LG().run.member : 0;
    const shMember = member && Sv().has('league.shiny', member) ? 1 : 0;
    return [lab, perkTier(shinies()), mask, shMember];
  }
  const validRow = r => Array.isArray(r) && typeof r[0] === 'string' && /^[0-9a-z]{0,64}$/.test(r[0]);
  /** A row's effects (pure: host, guest and viewer agree). */
  function effects(r) {
    const e = { lab: {}, stats: {}, boosts: {}, perk: 0, charm: false, shinyMember: false };
    if (!validRow(r)) return e;
    LAB.forEach((u, i) => { const n = Math.min(u.max, B36.indexOf(r[0][i] || '0')); e.lab[u.id] = Math.max(0, n); if (u.stat && n > 0) e.stats[u.stat] = (e.stats[u.stat] || 0) + u.per * n; });
    const mask = r[2] | 0;
    for (const b of BOOSTS) if (mask & (1 << b.i)) { e.boosts[b.id] = true; if (b.stat) e.stats[b.stat] = (e.stats[b.stat] || 0) + b.v; }
    e.perk = Math.max(0, Math.min(K.SHINY.length, r[1] | 0));
    e.shinyMember = !!r[3];
    K.SHINY.slice(0, e.perk).forEach(([, s, v]) => {
      if (s === 'charm') e.charm = true;
      else if (s === 'member') { if (e.shinyMember) e.stats.dmg = (e.stats.dmg || 0) + v; }
      else e.stats[s] = (e.stats[s] || 0) + v;
    });
    return e;
  }

  // ---------------- the run (host) ----------------
  let S = null;   // {row, eff, rs: {fam: pts}, excl: Set, master, honey: {zone: done}, candy, lines}
  const on = pl => !!(S && G.Modes.isExp() && pl && pl === G.Game.player && !pl.remote);
  /** An Expedition run starts (after the League's begin, before the level-ups'): the row, the boosts spent, the exclusions. */
  function begin(pl) {
    S = null;
    if (!pl || !G.Modes.isExp()) return null;
    const use = armed().filter(id => boostHave(id) > 0);
    for (const id of use) Sv().bump('bu.' + id + '.' + dev(), 1);
    try { localStorage.setItem(ARM_KEY, '[]'); } catch (e) { /* the pick is a convenience */ }
    if (use.length) Sv().commit();
    const row = rowNow(use), eff = effects(row);
    const excl = new Set(UNLOCKS.filter(u => !bought(u.id)).map(u => u.id).concat(archived(eff.lab.archive)));
    S = { row, eff, rs: {}, excl, master: !!eff.boosts.master, honey: {}, candy: !!eff.boosts.candy, used: use };
    pl.xmr = row;
    return S;
  }
  /** After every begin: the Lab's Max Revive (an item of D5's, taken like a drop). */
  function after(pl) {
    if (!on(pl)) return;
    if (S.eff.lab.revive && IT()) IT().takeItem(pl, 'maxrevive');
  }
  function reset() { S = null; }
  /** A Lab level for this run (its row), or the save's outside a run. */
  const labNow = id => (S ? S.eff.lab[id] || 0 : LAB_BY[id] ? labLv(id) : 0);
  /** D5's stat sum (items.js total()): the Lab, the shiny perks and the boosts of the player's row. */
  function statOf(pl, s) {
    if (!pl || !pl.xmr) return 0;
    if (pl.xmrOf !== pl.xmr) { pl.xmrOf = pl.xmr; pl.xmrEff = effects(pl.xmr); }
    return pl.xmrEff.stats[s] || 0;
  }
  /** An item kept out of this run's drop pool (locked, or archived). Only the host's run rolls items. */
  const excluded = id => !!(S && S.excl.has(id));
  const charm = () => !!(S && S.eff.charm);
  /** Dawn Stone: a shiny in zone 1 (capture.js zonePlan's `force`). */
  const dawn = zone => !!(S && S.eff.boosts.dawn && zone === 1);
  /** Master Ball: the run's first League / shiny encounter faints at once (capture.js mark). -> true once */
  function useMaster() { if (!S || !S.master) return false; S.master = false; return true; }
  function onKill(e, pl) {
    if (!S || !e || !LG()) return;
    const fam = LG().FAM[e.dex];
    if (fam) S.rs[fam] = (S.rs[fam] || 0) + koPts(e);
  }
  /** A freed cage's Pokémon (economy.js): +25 research to its family. */
  function onFreed(dex) {
    if (!S || !LG()) return;
    const fam = LG().FAM[dex];
    if (fam) S.rs[fam] = (S.rs[fam] || 0) + K.RS.cage;
  }
  /** run.tick: Rare Candy (once), Honey (an extra alpha a zone, at a seeded time). */
  function tick(dt, pl) {
    if (!on(pl)) return;
    // (D11: a co-op guest's level is the team's, the host's: its Rare Candy is spent with no effect, its Honey is the host's to plant)
    if (S.candy && G.Coop && G.Coop.active && !G.Coop.isHost) S.candy = false;
    if (S.candy) {
      S.candy = false;
      const L = LV(), need = L ? L.need(pl.level) + L.need(pl.level + 1) : 0;
      const ups = need ? pl.gainXp(Math.max(0, need - pl.xp + 0.01) / (pl.xpMul || 1)) : 0;
      if (ups > 0) G.Game.grantLevels(ups, false);
    }
    if (S.eff.boosts.honey && C() && C().run) {
      const run = C().run, z = run.zone;
      if (z >= 1 && z <= 3 && !S.honey[z] && run.plan && run.plan.cards && run.plan.cards.length) {
        const rng = G.DLC.rng(mix(G.World.seed | 0, z, 0x40E7));
        const at = K.HONEY_AT[0] + Math.floor(rng() * (K.HONEY_AT[1] - K.HONEY_AT[0]));
        if (G.Game.st.time - run.zs >= at) {
          S.honey[z] = true;
          const cards = run.plan.cards, dex = cards[Math.floor(rng() * Math.min(10, cards.length))], A = C().K.ALPHA;
          const pt = C().spotNear(rng, pl, rng() * 6.2832, G.Sprites.hovers(dex), G.Camera.outerRadius() * 0.7);
          if (pt) {
            C().spawnFoe(dex, pt[0], pt[1], { ti: 1, hp: A.hp, dmg: A.dmg, xp: A.xp, scale: A.scale, spd: 0.9, kind: 'alpha' });
            G.Spawner.say(G.I18n.f('¡Un {x} alfa aparece!', (G.DEX_BY[dex] || {}).name || ''), 3, true);
          }
        }
      }
    }
  }
  /** The run's row (x block `k`, replay header `h.k`); null outside an Expedition run. */
  const row = () => (S ? S.row : null);
  /** A viewer / guest: a player's row (its effects are read from it). */
  function applyRow(p, r) { if (!p) return; p.xmr = validRow(r) ? r : null; }

  /** The run's end (core.js run.end): Pokémonedas, research, tasks, achievements. now: the date (ms), passed in. -> lines */
  function record(sum, now) {
    if (!S) return [];
    const out = [], Svv = Sv();
    const p = sum.parts || { kills: sum.kills || 0, time: sum.time || 0, zone: sum.zone || 1, bosses: 0, won: !!sum.won, catches: CP() && CP().run ? CP().run.n : 0 };
    const diff = sum.diff || 'normal', pay = payOf(sum.mode === 'exp-survival' ? Object.assign({}, p, { surv: true }) : p, diff);   // (D11: Survival's minutes)
    reconcile();   // (a double payment from another device, undone before this run pays)
    if (pay.pay > 0) {
      const got = credit(pay.pay); Svv.bump('pay.total', got); Svv.best('pay.best', got);
      out.push(pay.mul !== 1 ? F('Pokémonedas: +{x} (×{x} {x})', got, pay.mul, T.t(TR().DIFF_NAME[diff])) : F('Pokémonedas: +{x}', got));
    }
    // research
    const k = 1 + K.RS.LAB * (S.eff.lab.research || 0);
    let rsum = 0;
    for (const fam in S.rs) {
      const add = Math.round(S.rs[fam] * k);
      if (add <= 0) continue;
      rsum += add;
      Svv.bump('rs.' + fam, add);
      if (research(fam) >= needOf(+fam) && Svv.add('avatar', fam)) out.push(F('¡Avatar nuevo: {x}!', (G.DEX_BY[fam] || {}).name || '#' + fam));
    }
    if (rsum) out.push(F('Investigación: +{x}', rsum));
    if (S.used.length) out.push(F('Potenciadores: {x}', S.used.map(id => T.t(BOOST_BY[id].name)).join(', ')));
    // tasks (the run's metrics)
    const CPr = CP() && CP().run, ECr = EC() && EC().run, run = C() && C().run;
    const m = {
      runs: 1, kos: sum.kills || 0, mins: (sum.time || 0) / 60, zone: p.zone || 1, wins: p.won ? 1 : 0,
      guardians: run && !run.surv ? run.bosses.filter(b => b.zone <= 3 && b.down != null).length : 0,   // (D11: Survival's milestone bosses are `miles`)
      balls: ECr ? ECr.log.balls : 0, altars: ECr ? ECr.log.altars : 0, freed: ECr ? ECr.log.freed : 0,
      casts: UL() && UL().run ? UL().run.casts || 0 : 0, reactions: RX() && RX().run ? RX().run.n || 0 : 0,
      alphas: CPr ? CPr.log.alpha : 0, catches: CPr ? CPr.n : 0, evos: LG() && LG().run ? LG().run.evo || 0 : 0,
      smins: 0, miles: 0   // (D11: Survival's, below)
    };
    if (sum.mode === 'exp-survival' && G.ExpSurv) Object.assign(m, G.ExpSurv.metrics(sum));
    out.push(...taskRun(m, now));
    // achievements (after the other modules recorded this run's counters)
    for (const a of checkAch()) out.push(F('¡Logro: {x}! +{x} Pokémonedas', T.t(a.name), coinsOf(a.star)));
    Svv.commit();
    return out;
  }

  // ---------------- the panel: "League HQ" on the mode select (the Classic card's third button) ----------------
  const CSS = `
#modes-xmeta .xm-head { display: flex; align-items: center; gap: 10px; justify-content: space-between; flex-wrap: wrap; }
#modes-xmeta .xm-head h3 { margin: 0; font-size: 18px; }
#modes-xmeta .xm-bal { display: inline-flex; align-items: center; gap: 5px; font-weight: 800; color: #ffd23f; font-size: 17px; }
#modes-xmeta .xm-bal img { width: 22px; height: 22px; image-rendering: pixelated; }
#modes-xmeta .xm-note { font-size: 12px; color: #9fb1c9; margin: 2px 0 4px; }
#modes-xmeta .xm-tabs { margin: 6px 0; display: flex; flex-wrap: wrap; gap: 4px; }
#modes-xmeta .xm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 6px; }
#modes-xmeta .xm-c { border: 2px solid rgba(244,248,255,.18); border-radius: 10px; background: rgba(0,0,0,.22); padding: 6px 8px; font-size: 12px; color: #dfe7f3; display: grid; grid-template-columns: 34px 1fr auto; gap: 2px 8px; align-items: center; }
#modes-xmeta .xm-c > img, #modes-xmeta .xm-c > canvas { width: 32px; height: 32px; image-rendering: pixelated; grid-row: span 2; }
#modes-xmeta .xm-c b { color: #f4f8ff; font-size: 13px; }
#modes-xmeta .xm-c small { color: #aab6c8; display: block; line-height: 1.25; }
#modes-xmeta .xm-c .btn { grid-row: span 2; white-space: nowrap; }
#modes-xmeta .xm-c.done { border-color: rgba(127,209,139,.6); }
#modes-xmeta .xm-c.off { opacity: .6; }
#modes-xmeta .xm-bar { height: 5px; border-radius: 3px; background: rgba(255,255,255,.12); overflow: hidden; margin-top: 2px; }
#modes-xmeta .xm-bar i { display: block; height: 100%; background: #7fd18b; }
#modes-xmeta .xm-tag { font-weight: 800; color: #7fd18b; white-space: nowrap; }
#modes-xmeta .xm-tag.lock { color: #ff9aa4; }
#modes-xmeta h4 { margin: 8px 0 4px; font-size: 14px; color: #ffd23f; }
#modes-xmeta h4 .xm-reset { font-size: 12px; color: #9fb1c9; font-weight: 600; margin-left: 6px; }
#modes-xmeta .xm-card { display: flex; gap: 12px; align-items: center; margin: 4px 0 6px; }
#modes-xmeta .xm-av { border: 4px solid #8fa3bd; border-radius: 14px; background: rgba(0,0,0,.35); width: 76px; height: 76px; display: grid; place-items: center; }
#modes-xmeta .xm-av canvas { width: 64px; height: 64px; }
#modes-xmeta .xm-pick { display: flex; flex-wrap: wrap; gap: 5px; }
#modes-xmeta .xm-pick button { border: 3px solid rgba(244,248,255,.25); border-radius: 10px; background: rgba(0,0,0,.25); color: #dfe7f3; padding: 2px 6px; font-size: 12px; cursor: pointer; }
#modes-xmeta .xm-pick button.on { outline: 2px solid #ffd23f; }
#modes-xmeta .xm-pick button[aria-disabled="true"] { opacity: .45; }
#modes-xmeta .xm-list { max-height: calc(calc(100 * var(--vh)) - 250px); min-height: 120px; overflow-y: auto; }
@media (max-width: 600px) { #modes-xmeta .xm-grid { grid-template-columns: 1fr; } }
@media (max-height: 520px) {
  #scr-modes .modes-box:has(#modes-xmeta:not(.hidden)) > .row:first-child { display: none; }
  #modes-xmeta .xm-head h3 { font-size: 15px; } #modes-xmeta .xm-note { display: none; } #modes-xmeta .xm-tabs { margin: 3px 0; }
  #modes-xmeta .xm-tabs .chip { padding-top: 2px; padding-bottom: 2px; }
  #modes-xmeta .xm-list { max-height: none; } #modes-xmeta .xm-c { padding: 3px 6px; }
}
`;
  let el = null, onClose = null, scrollWas = 0;
  const ui = { tab: 'lab' };
  const TABS = [['lab', 'Laboratorio'], ['items', 'Objetos'], ['archive', 'Archivo'], ['research', 'Investigación'], ['tasks', 'Tareas'], ['ach', 'Logros'], ['card', 'Tarjeta']];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const img = (n, s = 32) => `<img src="${ICON(n)}" width="${s}" height="${s}" alt="" loading="lazy">`;
  const bar = (a, b) => `<div class="xm-bar"><i style="width:${Math.round(100 * Math.min(1, b ? a / b : 1))}%"></i></div>`;
  const fmt = n => Math.floor(n).toLocaleString('en');
  function mount() {
    if (el || typeof document === 'undefined') return el;
    const box = document.querySelector('#scr-modes .modes-box');
    if (!box) return null;
    const st = document.createElement('style'); st.id = 'exp-d10-style'; st.textContent = CSS; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'modes-xmeta'; el.className = 'hidden';
    box.appendChild(el);
    return el;
  }
  const $m = id => document.getElementById(id);
  const back0 = () => document.querySelector('#scr-modes [data-back]');
  let clock = () => Date.now();   // (the panel's "today": a UI boundary; tests can pin it)
  /** Opens the panel on the mode select (the Expedition code is loaded). onBack: called after it closes. */
  function open(onBack, tab) {
    if (!mount()) return false;
    onClose = onBack || null;
    if (tab) ui.tab = tab;
    $m('modes-main').classList.add('hidden');
    el.classList.remove('hidden');
    if (back0()) back0().classList.add('hidden');
    const box = document.querySelector('#scr-modes .modes-box');
    if (box) { scrollWas = box.scrollTop; box.scrollTop = 0; }
    reconcile();
    for (const a of checkAch()) G.UI.toast(F('¡Logro: {x}! +{x} Pokémonedas', T.t(a.name), coinsOf(a.star)), 3000);
    render();
    return true;
  }
  function close(quiet) {
    if (!el || el.classList.contains('hidden')) return false;
    el.classList.add('hidden');
    $m('modes-main').classList.remove('hidden');
    if (back0()) back0().classList.remove('hidden');
    const box = document.querySelector('#scr-modes .modes-box');
    if (box && quiet !== true) box.scrollTop = scrollWas;
    if (quiet !== true && onClose) onClose();
    return true;
  }
  const back = () => (el && !el.classList.contains('hidden') ? close() : false);
  const isShown = () => !!(el && !el.classList.contains('hidden'));
  const sfx = n => { if (G.Audio && G.Audio.sfx) G.Audio.sfx(n); };
  const coin = (s = 16) => (G.Icons ? G.Icons.html('coin', s) : '');   // (the base game's Pokémoneda)
  const max0 = (u, lv) => lv >= u.max;
  const toast = (t, ms) => { if (G.UI && G.UI.toast) G.UI.toast(t, ms); };

  function render() {
    if (!el) return;
    el.innerHTML = `
      <div class="xm-head"><h3>${esc(T.t('Expedición · cuartel de la Liga'))}</h3>
        <span class="xm-bal" id="xm-bal" title="${esc(T.t('Pokémonedas'))}">${G.Icons ? G.Icons.html('coin', 22) : ''} ${fmt(balance())}</span>
        <button id="xm-back" class="btn small" type="button">${esc(T.t('Atrás'))}</button></div>
      <p class="xm-note">${esc(T.t('Tus Pokémonedas de siempre: se ganan jugando (partidas, tareas y logros) y nunca se venden.'))}</p>
      <div class="filters xm-tabs">${TABS.map(([k, l]) => `<button type="button" class="chip${ui.tab === k ? ' on' : ''}" data-xtab="${k}">${esc(T.t(l))}</button>`).join('')}</div>
      <div id="xm-body" class="xm-list"></div>`;
    $m('xm-back').onclick = () => close();
    el.querySelectorAll('[data-xtab]').forEach(b => { b.onclick = () => { ui.tab = b.dataset.xtab; sfx('select'); render(); }; });
    const body = $m('xm-body');
    ({ lab: tabLab, items: tabItems, archive: tabArchive, research: tabResearch, tasks: tabTasks, ach: tabAch, card: tabCard }[ui.tab] || tabLab)(body);
  }
  const act = (b, fn) => { b.onclick = e => { e.stopPropagation(); fn(); }; };
  function tabLab(body) {
    body.innerHTML = `<div class="xm-grid">${LAB.map(u => {
      const lv = labLv(u.id), p = max0(u, lv) ? 0 : coinsOf(price(u.id, lv)), max = lv >= u.max;
      return `<div class="xm-c${max ? ' done' : ''}" data-lab="${u.id}">${img(u.icon)}<span><b>${esc(T.t(u.name))}</b> <small>${esc(F('Nv. {x}/{x}', lv, u.max))} · ${esc(F('Ahora: {x}', labText(u, lv)))}</small></span>
        ${max ? `<span class="xm-tag">${esc(T.t('Máximo'))}</span>` : `<button class="btn small${balance() >= p ? ' gold' : ''}" type="button" data-buy="${u.id}">${coin()} ${fmt(p)}</button>`}
        <small>${max ? '' : esc(F('Siguiente: {x}', labText(u, lv + 1)))}</small></div>`;
    }).join('')}</div>`;
    body.querySelectorAll('[data-buy]').forEach(b => act(b, () => {
      const r = buyLab(b.dataset.buy);
      if (r.ok) { sfx('levelup'); if (G.UI && G.UI.refreshCoins) G.UI.refreshCoins(); for (const a of checkAch()) toast(F('¡Logro: {x}! +{x} Pokémonedas', T.t(a.name), coinsOf(a.star)), 3000); render(); } else { sfx('error'); toast(T.t('Te faltan Pokémonedas')); }
    }));
  }
  function tabItems(body) {
    const I = IT(), all = I.ITEMS.length, inPool = all - UNLOCKS.filter(u => !bought(u.id)).length;
    body.innerHTML = `<p class="xm-note" style="display:block">${esc(F('{x} / {x} objetos en la bolsa', inPool, all))}</p><div class="xm-grid">${UNLOCKS.map(u => {
      const it = I.IT[u.id], have = stat(u.k), ok = have >= u.n, got = bought(u.id);
      const state = got ? `<span class="xm-tag">${esc(T.t('En la bolsa de objetos'))}</span>` : ok ? `<button class="btn small${balance() >= coinsOf(u.cost) ? ' gold' : ''}" type="button" data-ibuy="${u.id}">${coin()} ${fmt(coinsOf(u.cost))}</button>` : `<span class="xm-tag lock">${G.Icons ? G.Icons.html('ban', 14) : ''} ${esc(T.t('Bloqueado'))}</span>`;
      return `<div class="xm-c${got ? ' done' : ok ? '' : ' off'}" data-item="${u.id}">${img(it.icon)}<span><b style="color:${I.RAR_COL[it.rar]}">${esc(T.t(it.name))}</b> <small>${esc(I.itemText(u.id))}</small></span>${state}
        <small>${esc(F('Desbloqueo: {x}', goalText(u.k, u.n)))} · ${fmt(Math.min(have, u.n))}/${fmt(u.n)}${bar(have, u.n)}</small></div>`;
    }).join('')}</div>`;
    body.querySelectorAll('[data-ibuy]').forEach(b => act(b, () => {
      const r = buyItem(b.dataset.ibuy);
      if (r.ok) { sfx('legend'); if (G.UI && G.UI.refreshCoins) G.UI.refreshCoins(); render(); } else { sfx('error'); toast(T.t('Te faltan Pokémonedas')); }
    }));
  }
  function tabArchive(body) {
    const I = IT(), slots = arcSlots(), arc = archived();
    if (!slots) { body.innerHTML = `<p class="sub">${esc(T.t('Construye el Archivo en el Laboratorio para apartar objetos de la bolsa.'))}</p>`; return; }
    const pool = I.ITEMS.filter(it => !locked(it.id)).sort((a, b) => arc.includes(b.id) - arc.includes(a.id));   // (archived first)
    body.innerHTML = `<p class="xm-note" style="display:block" id="xm-arc">${esc(F('El Archivo guarda objetos fuera de la bolsa: {x} / {x} huecos', arc.length, slots))}</p><div class="xm-grid">${pool.map(it => {
      const on1 = arc.includes(it.id);
      return `<div class="xm-c${on1 ? ' done' : ''}" data-arc="${it.id}">${img(it.icon)}<span><b style="color:${I.RAR_COL[it.rar]}">${esc(T.t(it.name))}</b> <small>${esc(I.itemText(it.id))}</small></span>
        <button class="btn small${on1 ? ' gold' : ''}" type="button" data-atog="${it.id}">${esc(T.t(on1 ? 'Sacar' : 'Archivar'))}</button><small>${on1 ? esc(T.t('Archivado')) : ''}</small></div>`;
    }).join('')}</div>`;
    body.querySelectorAll('[data-atog]').forEach(b => act(b, () => {
      const r = toggleArchive(b.dataset.atog);
      if (r.ok) { sfx('select'); render(); } else { sfx('error'); toast(T.t('El Archivo está lleno')); }
    }));
  }
  function tabResearch(body) {
    const fams = famIds(), av = new Set(avatars()), k = 1 + K.RS.LAB * labLv('research');
    body.innerHTML = `<p class="xm-note" style="display:block">${esc(F('Avatares: {x} / {x} · investigación ×{x}', av.size, fams.length, k))} · ${esc(T.t('Cada derrota de la familia suma: 1, élite 2, invocador 4, alfa o tótem 5, jefe 10, jaula 25.'))}</p><div class="xm-grid" id="xm-rs"></div>`;
    const grid = $m('xm-rs');
    const sorted = fams.slice().sort((a, b) => (av.has(b) - av.has(a)) || (research(b) / needOf(b) - research(a) / needOf(a)) || a - b);
    for (const d of sorted) {
      const have = research(d), need = needOf(d), done = av.has(d);
      const c = document.createElement('div');
      c.className = 'xm-c' + (done ? ' done' : have ? '' : ' off');
      c.dataset.fam = d;
      const cv = G.UI && G.UI.spriteCanvas ? G.UI.spriteCanvas(d, 32, 32, { scale: 1 }) : document.createElement('canvas');
      if (!have && !done) cv.style.filter = 'brightness(0)';
      c.appendChild(cv);
      c.insertAdjacentHTML('beforeend', `<span><b>${esc((G.DEX_BY[d] || {}).name || '#' + d)}</b> <small>${fmt(Math.min(have, need))} / ${fmt(need)}</small></span><span class="xm-tag${done ? '' : ' lock'}">${done ? esc(T.t('Avatar')) : ''}</span><small>${bar(have, need)}</small>`);
      grid.appendChild(c);
    }
  }
  function taskRows(kind, now) {
    const list = tasksOf(kind, now), per = periodOf(kind, now), rr = rerollOf(kind, per);
    return list.map(t => `<div class="xm-c${t.claimed ? ' done' : ''}" data-task="${kind}${t.slot}">${G.Icons ? G.Icons.html('coin', 32) : ''}<span><b>${esc(t.text)}</b> <small>+${fmt(coinsOf(t.star))} Pokémonedas · ${fmt(t.have)}/${fmt(t.need)}</small></span>
      ${t.claimed ? `<span class="xm-tag">${esc(T.t('Hecha'))}</span>` : rr ? '<span></span>' : `<button class="btn small" type="button" data-rr="${kind}${t.slot}">${esc(T.t('Cambiar tarea'))}</button>`}<small>${bar(t.have, t.need)}</small></div>`).join('');
  }
  const left = ms => { const h = Math.max(0, Math.floor(ms / 3600000)); return h >= 24 ? Math.floor(h / 24) + ' d ' + (h % 24) + ' h' : h + ' h ' + Math.max(0, Math.floor(ms / 60000) % 60) + ' min'; };
  function tabTasks(body) {
    const now = clock(), st = dailyStreak(dayOf(now));
    const armSet = new Set(armed());
    body.innerHTML = `<h4>${esc(T.t('Diarias'))} <small class="xm-reset">${esc(F('Se renuevan en {x}', left(periodEnds('d', now) - now)))}</small></h4>
      <div class="xm-grid" id="xm-daily">${taskRows('d', now)}</div>
      <p class="xm-note" style="display:block">${esc(F('Bonus: las 3 diarias · racha {x} → +{x} Pokémonedas y un potenciador', st, fmt(coinsOf(st * K.STREAK))))}</p>
      <h4>${esc(T.t('Semanales'))} <small class="xm-reset">${esc(F('Se renuevan en {x}', left(periodEnds('w', now) - now)))}</small></h4>
      <div class="xm-grid" id="xm-weekly">${taskRows('w', now)}</div>
      <p class="xm-note" style="display:block">${esc(F('Bonus: las 3 semanales → +{x} Pokémonedas y 3 potenciadores', fmt(coinsOf(K.WEEK_BONUS))))}</p>
      <h4>${esc(T.t('Potenciadores (para la próxima partida)'))}</h4>
      <div class="xm-grid" id="xm-boosts">${BOOSTS.map(b => { const n = boostHave(b.id), a = armSet.has(b.id); return `<div class="xm-c${a ? ' done' : n ? '' : ' off'}" data-boost="${b.id}">${img(b.icon)}<span><b>${esc(T.t(b.name))} ×${n}</b> <small>${esc(T.t(b.text))}</small></span>
        ${n ? `<button class="btn small${a ? ' gold' : ''}" type="button" data-arm="${b.id}">${esc(T.t(a ? 'Usará' : 'Usar'))}</button>` : '<span></span>'}<small></small></div>`; }).join('')}</div>`;
    body.querySelectorAll('[data-rr]').forEach(b => act(b, () => {
      const kind = b.dataset.rr[0], slot = +b.dataset.rr.slice(1);
      if (reroll(kind, slot, clock())) { sfx('select'); render(); } else { sfx('error'); toast(T.t(kind === 'd' ? 'Ya cambiaste una tarea hoy' : 'Ya cambiaste una tarea esta semana')); }
    }));
    body.querySelectorAll('[data-arm]').forEach(b => act(b, () => { arm(b.dataset.arm); sfx('select'); render(); }));
  }
  function tabAch(body) {
    const got = ACH.filter(a => achHave(a.id)).length;
    body.innerHTML = `<p class="xm-note" style="display:block">${esc(F('{x} / {x} logros', got, ACH.length))}</p><div class="xm-grid">${ACH.map(a => {
      const have = stat(a.k), ok = achHave(a.id);
      const extra = [a.title ? F('Título: {x}', T.t(a.title)) : '', a.frame ? F('Marco: {x}', T.t(FRAMES.find(f => f.id === a.frame).name)) : ''].filter(Boolean).join(' · ');
      return `<div class="xm-c${ok ? ' done' : ' off'}" data-ach="${a.id}">${G.Icons ? G.Icons.html(ok ? 'trophy' : 'medalOff', 30) : ''}<span><b>${esc(T.t(a.name))}</b> <small>${esc(goalText(a.k, a.n))}${extra ? ' · ' + esc(extra) : ''}</small></span>
        <span class="xm-tag${ok ? '' : ' lock'}">+${fmt(coinsOf(a.star))} ${coin(14)}</span><small>${fmt(Math.min(have, a.n))}/${fmt(a.n)}${bar(have, a.n)}</small></div>`;
    }).join('')}</div>`;
  }
  function tabCard(body) {
    const cd = card(), n = shinies(), tier = perkTier(n);
    body.innerHTML = `<h4>${esc(T.t('Tu tarjeta de la Expedición'))}</h4>
      <div class="xm-card"><div class="xm-av" id="xm-av" style="${cd.frame.css}"></div><div><b translate="no">${esc((G.MicaAccount && G.MicaAccount.name()) || 'Trainer')}</b><br><span class="gold">${esc(cd.title ? T.t(cd.title) : T.t('Sin título'))}</span><br><small class="xm-note">${esc(T.t(cd.frame.name))}</small></div></div>
      <h4>${esc(T.t('Avatares'))}</h4><div class="xm-pick" id="xm-avs"></div>
      <h4>${esc(T.t('Marcos'))}</h4><div class="xm-pick">${FRAMES.map(f => { const o = frameOpen(f); return `<button type="button" data-frame="${f.id}" class="${cd.frame.id === f.id ? 'on' : ''}" style="${f.css}"${o ? '' : ` aria-disabled="true" title="${esc(F('Desbloquéalo: {x}', frameHow(f)))}"`}>${esc(T.t(f.name))}</button>`; }).join('')}</div>
      <h4>${esc(T.t('Títulos'))}</h4><div class="xm-pick"><button type="button" data-title=""${cd.title ? '' : ' class="on"'}>${esc(T.t('Sin título'))}</button>${TITLES.map(t => { const o = titleOpen(t); return `<button type="button" data-title="${esc(t.name)}" class="${cd.title === t.name ? 'on' : ''}"${o ? '' : ' aria-disabled="true"'}>${esc(T.t(t.name))}</button>`; }).join('')}</div>
      <h4>${esc(F('Ventajas variocolor ({x} capturados)', n))}</h4><div class="xm-grid">${K.SHINY.map(([need, s, v], i) => {
        const txt = s === 'charm' ? T.t('Amuleto Iris en cada partida') : s === 'member' ? T.t('+20 % de daño con un miembro variocolor') : IT().statText(s, v);
        return `<div class="xm-c${i < tier ? ' done' : ' off'}">${img('shiny_charm')}<span><b>${esc(F('{x} variocolor: {x}', need, txt))}</b></span><span class="xm-tag${i < tier ? '' : ' lock'}">${i < tier ? '✓' : fmt(Math.min(n, need)) + '/' + need}</span><small></small></div>`;
      }).join('')}</div>`;
    const avBox = $m('xm-av');
    if (G.UI && G.UI.spriteCanvas) avBox.appendChild(G.UI.spriteCanvas(cd.avatar, 64, 64, { scale: 2 }));
    const list = $m('xm-avs'), mine = [0].concat(avatars());
    for (const d of mine) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.avatar = d;
      if ((d === 0 && !avatars().includes(cd.avatar)) || d === cd.avatar) b.className = 'on';
      if (d === 0) b.textContent = T.t('Tu miembro de la Liga');
      else if (G.UI && G.UI.spriteCanvas) b.appendChild(G.UI.spriteCanvas(d, 40, 40, { scale: 1.2 }));
      act(b, () => { chooseAvatar(d); sfx('select'); render(); });
      list.appendChild(b);
    }
    body.querySelectorAll('[data-frame]').forEach(b => act(b, () => { if (chooseFrame(b.dataset.frame)) { sfx('select'); render(); } else sfx('error'); }));
    body.querySelectorAll('[data-title]').forEach(b => act(b, () => { if (chooseTitle(b.dataset.title)) { sfx('select'); render(); } else sfx('error'); }));
  }

  return {
    K, LAB, LAB_BY, BOOSTS, BOOST_BY, UNLOCKS, ACH, ACH_BY, TASKS, FRAMES, TITLES,
    price, labCost, labLv, buyLab, labText, balance, earned, credit, debit, coinsOf, reconcile, amountOf, payOf, dev,
    locked, bought, buyItem, stat, goalText, archived, toggleArchive, arcSlots,
    research, needOf, avatars, koPts, shinies, perkTier, boostHave, giveBoost, armed, arm,
    tasksOf, reroll, taskRun, dayOf, weekOf, periodOf, dailyStreak, checkAch, achHave,
    card, chooseAvatar, chooseFrame, chooseTitle, frameOpen, titleOpen,
    rowNow, effects, begin, after, reset, labNow, statOf, excluded, charm, dawn, useMaster, onKill, onFreed, tick, row, applyRow, record,
    open, close, back, render,
    get run() { return S; }, get shown() { return isShown(); }, get ui() { return ui; }, get el() { return el; },
    /** For tests: pin the panel's "today". */
    set clock(f) { clock = typeof f === 'function' ? f : () => Date.now(); }
  };
})();
