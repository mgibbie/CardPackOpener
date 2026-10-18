/* ============ achievements.js — logros, medallas y títulos ============
 * Cada logro: medalla (bronce 1, plata 2, oro 3), premio al conseguirlo y, a
 * veces, un título para el perfil. Se comprueban en systems/progress.js.
 *
 *   value(save) -> progreso actual (número) · goal -> lo que hay que llegar
 *
 * Además hay un logro por CADA legendario: vencerle en una grieta.
 */
G.AchDefs = (() => {
  const own = s => Object.keys(s.owned || {}).filter(d => G.DEX_BY[d]).length;
  const shinies = s => Object.keys(s.shiny || {}).length;
  const legends = s => Object.keys(s.legends || {}).length;
  const st = k => s => (s.stats && s.stats[k]) || 0;
  const count = k => s => Object.keys(s[k] || {}).length;

  const CATS = [['coleccion', 'Colección'], ['supervivencia', 'Supervivencia'], ['combate', 'Combate'],
                ['grietas', 'Grietas'], ['legendarios', 'Legendarios'], ['modos', 'Modos de juego'], ['otros', 'Misiones y más']];

  const LIST = [
    // ---------- colección ----------
    { id: 'own1', cat: 'coleccion', tier: 1, name: 'Primer compañero', desc: 'Ten 1 Pokémon.', value: own, goal: 1, reward: { coins: 100 } },
    { id: 'own10', cat: 'coleccion', tier: 1, name: 'Pequeño equipo', desc: 'Ten 10 Pokémon.', value: own, goal: 10, reward: { t1: 2 } },
    { id: 'own50', cat: 'coleccion', tier: 2, name: 'Coleccionista', desc: 'Ten 50 Pokémon.', value: own, goal: 50, reward: { t1: 5 }, title: 'Coleccionista' },
    { id: 'own100', cat: 'coleccion', tier: 2, name: 'Cien amigos', desc: 'Ten 100 Pokémon.', value: own, goal: 100, reward: { t10: 1 } },
    { id: 'own250', cat: 'coleccion', tier: 3, name: 'Maestro Pokémon', desc: 'Ten 250 Pokémon.', value: own, goal: 250, reward: { t10: 2 }, title: 'Maestro Pokémon' },
    { id: 'own500', cat: 'coleccion', tier: 3, name: 'Enciclopedia', desc: 'Ten 500 Pokémon.', value: own, goal: 500, reward: { t10: 3 } },
    { id: 'ownAll', cat: 'coleccion', tier: 3, name: 'Profesor Pokémon', desc: 'Ten todos los Pokémon del juego.', value: own, goal: 966, reward: { t10: 10 }, title: 'Profesor Pokémon' },
    { id: 'shiny1', cat: 'coleccion', tier: 1, name: 'Algo brilla', desc: 'Consigue 1 shiny.', value: shinies, goal: 1, reward: { t1: 3 }, title: 'Brillante' },
    { id: 'shiny5', cat: 'coleccion', tier: 2, name: 'Ojo para el brillo', desc: 'Consigue 5 shinies.', value: shinies, goal: 5, reward: { t10: 1 } },
    { id: 'shiny20', cat: 'coleccion', tier: 3, name: 'Cazashinies', desc: 'Consigue 20 shinies.', value: shinies, goal: 20, reward: { t10: 2 }, title: 'Cazashinies' },
    { id: 'pulls100', cat: 'coleccion', tier: 2, name: 'Tragaperras', desc: 'Haz 100 tiradas en el gacha.', value: st('pulls'), goal: 100, reward: { t10: 1 }, title: 'Afortunado' },

    // ---------- supervivencia ----------
    { id: 'time5', cat: 'supervivencia', tier: 1, name: 'Calentando', desc: 'Aguanta 5 minutos.', value: s => Math.floor(st('bestTime')(s) / 60), goal: 5, reward: { coins: 200 } },
    { id: 'time10', cat: 'supervivencia', tier: 2, name: 'Duro de pelar', desc: 'Aguanta 10 minutos.', value: s => Math.floor(st('bestTime')(s) / 60), goal: 10, reward: { t1: 4 } },
    { id: 'time15', cat: 'supervivencia', tier: 2, name: 'Resistente', desc: 'Aguanta 15 minutos.', value: s => Math.floor(st('bestTime')(s) / 60), goal: 15, reward: { t10: 1 } },
    { id: 'time20', cat: 'supervivencia', tier: 3, name: 'Superviviente', desc: 'Aguanta 20 minutos.', value: s => Math.floor(st('bestTime')(s) / 60), goal: 20, reward: { t10: 2 }, title: 'Superviviente' },
    { id: 'lvl20', cat: 'supervivencia', tier: 1, name: 'Creciendo', desc: 'Llega al nivel 15 en una run.', value: st('bestLevel'), goal: 15, reward: { t1: 2 } },
    { id: 'lvl40', cat: 'supervivencia', tier: 3, name: 'Imparable', desc: 'Llega al nivel 30 en una run.', value: st('bestLevel'), goal: 30, reward: { t10: 1 }, title: 'Imparable' },
    // La Sentencia de Arceus (minuto 30, ver systems/judgment.js).
    { id: 'judge', cat: 'supervivencia', tier: 2, name: 'La Sentencia', desc: 'Llega a la Sentencia de Arceus (minuto 30).', value: st('judged'), goal: 1, reward: { t10: 1 }, title: 'Juzgado' },
    { id: 'judge60', cat: 'supervivencia', tier: 3, name: 'Ante el Creador', desc: 'Aguanta 1 minuto ante Arceus.', value: st('judgeTime'), goal: 60, reward: { t10: 2 }, title: 'Elegido de Arceus' },
    { id: 'judgeBoss', cat: 'supervivencia', tier: 3, name: 'Desafío divino', desc: 'Derrota a 3 legendarios ante Arceus en una partida.', value: st('judgeBosses'), goal: 3, reward: { t10: 2 } },
    { id: 'runs50', cat: 'supervivencia', tier: 2, name: 'Explorador', desc: 'Juega 50 runs.', value: st('runs'), goal: 50, reward: { t10: 1 }, title: 'Explorador' },

    // ---------- combate ----------
    { id: 'kills1k', cat: 'combate', tier: 1, name: 'Primeros combates', desc: 'Derrota a 1.000 Pokémon.', value: st('totalKills'), goal: 1000, reward: { t1: 2 } },
    { id: 'kills10k', cat: 'combate', tier: 2, name: 'Veterano', desc: 'Derrota a 10.000 Pokémon.', value: st('totalKills'), goal: 10000, reward: { t10: 1 }, title: 'Veterano' },
    { id: 'kills100k', cat: 'combate', tier: 3, name: 'Leyenda viva', desc: 'Derrota a 100.000 Pokémon.', value: st('totalKills'), goal: 100000, reward: { t10: 3 }, title: 'Leyenda viva' },
    { id: 'boss1', cat: 'combate', tier: 1, name: 'Matagigantes', desc: 'Derrota a un jefe.', value: st('bossesTotal'), goal: 1, reward: { t1: 2 } },
    { id: 'boss25', cat: 'combate', tier: 2, name: 'Cazajefes', desc: 'Derrota a 25 jefes.', value: st('bossesTotal'), goal: 25, reward: { t10: 1 }, title: 'Cazajefes' },
    { id: 'boss100', cat: 'combate', tier: 3, name: 'Terror de los jefes', desc: 'Derrota a 100 jefes.', value: st('bossesTotal'), goal: 100, reward: { t10: 2 } },
    { id: 'evo1', cat: 'combate', tier: 1, name: 'Evolución', desc: 'Evoluciona un movimiento.', value: st('evolutions'), goal: 1, reward: { t1: 3 } },
    { id: 'evo25', cat: 'combate', tier: 2, name: 'Evolucionista', desc: 'Evoluciona 25 movimientos.', value: st('evolutions'), goal: 25, reward: { t10: 1 }, title: 'Evolucionista' },
    { id: 'evoAll', cat: 'combate', tier: 3, name: 'Maestro de movimientos', desc: 'Evoluciona los 47 movimientos distintos.', value: count('evoMoves'), goal: 47, reward: { t10: 3 }, title: 'Maestro de movimientos' },
    { id: 'items5', cat: 'combate', tier: 1, name: 'Bolsa llena', desc: 'Encuentra 5 objetos distintos.', value: count('itemsFound'), goal: 5, reward: { t1: 3 } },
    { id: 'itemsAll', cat: 'combate', tier: 2, name: 'Coleccionista de objetos', desc: 'Encuentra los ' + G.Items.LIST.length + ' objetos.', value: count('itemsFound'), goal: G.Items.LIST.length,   /* M5 lote 3: todos (26), como el port */ reward: { t10: 1 }, title: 'Anticuario' },

    // ---------- grietas ----------
    { id: 'rift1', cat: 'grietas', tier: 1, name: 'Al otro lado', desc: 'Gana tu primera pelea en una grieta.', value: st('riftWins'), goal: 1, reward: { t1: 3 }, title: 'Valiente' },
    { id: 'rift10', cat: 'grietas', tier: 2, name: 'Saltagrietas', desc: 'Gana 10 peleas en grietas.', value: st('riftWins'), goal: 10, reward: { t10: 1 } },
    { id: 'arenas', cat: 'grietas', tier: 3, name: 'Viajero de grietas', desc: 'Gana en las 18 arenas (una por tipo).', value: count('arenas'), goal: 18, reward: { t10: 2 }, title: 'Viajero de grietas' },

    // ---------- legendarios (contador; los individuales se añaden abajo) ----------
    { id: 'leg10', cat: 'legendarios', tier: 2, name: 'Cazalegendarios', desc: 'Vence a 10 legendarios distintos.', value: legends, goal: 10, reward: { t10: 1 }, title: 'Cazalegendarios' },
    { id: 'leg30', cat: 'legendarios', tier: 3, name: 'Domador de mitos', desc: 'Vence a 30 legendarios distintos.', value: legends, goal: 30, reward: { t10: 2 } },
    { id: 'legAll', cat: 'legendarios', tier: 3, name: 'Leyenda', desc: 'Vence a todos los legendarios.', value: legends, goal: 87, reward: { t10: 5 }, title: 'Leyenda' },

    // ---------- modos de juego (MicaSurvivor M5 lote 6, progress.gd 107-134: los de los modos de este
    // lote; lote 7: los del Modo Equipo; los del Rush de Jefes y la Torre llegan con su lote) ----------
    { id: 'daily1', cat: 'modos', tier: 1, name: 'Reto del día', desc: 'Juega un Desafío diario.', value: st('dailyPlays'), goal: 1, reward: { coins: 150, t1: 2 } },
    { id: 'daily7', cat: 'modos', tier: 2, name: 'Rutina diaria', desc: 'Juega 7 Desafíos diarios.', value: st('dailyPlays'), goal: 7, reward: { coins: 500, t1: 5 } },
    { id: 'daily30', cat: 'modos', tier: 3, name: 'Fiel al reto', desc: 'Juega 30 Desafíos diarios.', value: st('dailyPlays'), goal: 30, reward: { coins: 2000, t1: 3, t10: 2 }, title: 'Fiel al reto' },
    { id: 'dailyMin10', cat: 'modos', tier: 2, name: 'Reto superado', desc: 'Aguanta 10 minutos en un Desafío diario.', value: st('dailyBestMin'), goal: 10, reward: { coins: 1000, t10: 1 } },
    { id: 'dailyMin20', cat: 'modos', tier: 3, name: 'Campeón del día', desc: 'Aguanta 20 minutos en un Desafío diario.', value: st('dailyBestMin'), goal: 20, reward: { coins: 2500, t10: 2 }, title: 'Campeón del día' },
    { id: 'mod1', cat: 'modos', tier: 1, name: 'Con un extra', desc: 'Aguanta 5 minutos con un modificador activo.', value: st('mn1'), goal: 5, reward: { coins: 300, t1: 3 } },
    { id: 'mod3', cat: 'modos', tier: 2, name: 'Doble dificultad', desc: 'Aguanta 8 minutos con 3 modificadores.', value: st('mn3'), goal: 8, reward: { coins: 1200, t10: 1 } },
    { id: 'mod4', cat: 'modos', tier: 3, name: 'Sin red', desc: 'Aguanta 10 minutos con 4 modificadores.', value: st('mn4'), goal: 10, reward: { coins: 3000, t1: 2, t10: 2 }, title: 'Sin red' },
    { id: 'modAll', cat: 'modos', tier: 3, name: 'Masoquista', desc: 'Aguanta 5 minutos con los 6 modificadores.', value: st('mn6'), goal: 5, reward: { coins: 6000, t1: 3, t10: 4 }, title: 'Masoquista' },
    { id: 'noheal10', cat: 'modos', tier: 2, name: 'Sin curas', desc: 'Aguanta 10 minutos con «Sin curación».', value: st('mb_nohealing'), goal: 10, reward: { coins: 1500, t10: 1 } },
    { id: 'frail10', cat: 'modos', tier: 2, name: 'Cristal', desc: 'Aguanta 10 minutos con «Frágil».', value: st('mb_frail'), goal: 10, reward: { coins: 1500, t10: 1 } },
    { id: 'horde10', cat: 'modos', tier: 2, name: 'Entre la multitud', desc: 'Aguanta 10 minutos con «Horda».', value: st('mb_horde'), goal: 10, reward: { coins: 1500, t10: 1 } },
    { id: 'type1', cat: 'modos', tier: 1, name: 'Especialista', desc: 'Aguanta 5 minutos en Supervivencia por tipo.', value: st('typeBestMin'), goal: 5, reward: { coins: 300, t1: 3 } },
    { id: 'type10', cat: 'modos', tier: 2, name: 'Experto en tipo', desc: 'Aguanta 10 minutos en Supervivencia por tipo.', value: st('typeBestMin'), goal: 10, reward: { coins: 1200, t10: 1 } },
    { id: 'typeVar9', cat: 'modos', tier: 3, name: 'Todoterreno', desc: 'Aguanta 10 minutos en 9 tipos distintos de Supervivencia por tipo.', value: count('typeDone'), goal: 9, reward: { coins: 3000, t1: 3, t10: 2 } },
    { id: 'typeAll', cat: 'modos', tier: 3, name: 'Maestro de tipos', desc: 'Aguanta 10 minutos en los 18 tipos de Supervivencia por tipo.', value: count('typeDone'), goal: 18, reward: { coins: 8000, t1: 5, t10: 5 }, title: 'Maestro de tipos' },
    // (M5 lote 7, progress.gd 129-131)
    { id: 'team1', cat: 'modos', tier: 1, name: 'Mejor en equipo', desc: 'Juega una partida en Modo Equipo.', value: st('teamRuns'), goal: 1, reward: { coins: 150, t1: 2 } },
    { id: 'team10', cat: 'modos', tier: 2, name: 'Relevo perfecto', desc: 'Aguanta 10 minutos en Modo Equipo.', value: st('teamBestMin'), goal: 10, reward: { coins: 1500, t10: 1 } },
    { id: 'team20', cat: 'modos', tier: 3, name: 'Líder de equipo', desc: 'Aguanta 20 minutos en Modo Equipo.', value: st('teamBestMin'), goal: 20, reward: { coins: 3500, t1: 2, t10: 2 }, title: 'Líder de equipo' },
    { id: 'rifts3', cat: 'modos', tier: 1, name: 'Contrarreloj', desc: 'Gana 3 grietas en una Contrarreloj de grietas.', value: st('riftsBest'), goal: 3, reward: { coins: 500, t1: 3 } },
    { id: 'rifts5', cat: 'modos', tier: 2, name: 'Pasillo de grietas', desc: 'Gana 5 grietas en una Contrarreloj de grietas.', value: st('riftsBest'), goal: 5, reward: { coins: 1500, t10: 1 } },
    { id: 'rifts8', cat: 'modos', tier: 3, name: 'Cazador contrarreloj', desc: 'Gana 8 grietas en una Contrarreloj de grietas.', value: st('riftsBest'), goal: 8, reward: { coins: 3500, t1: 3, t10: 2 }, title: 'Cazador contrarreloj' },
    { id: 'riftsRuns10', cat: 'modos', tier: 2, name: 'Siempre con prisa', desc: 'Juega 10 Contrarrelojes de grietas.', value: st('riftsRuns'), goal: 10, reward: { coins: 1500, t10: 1 } },

    // ---------- misiones y más ----------
    { id: 'mis10', cat: 'otros', tier: 1, name: 'Cumplidor', desc: 'Completa 10 misiones.', value: st('missionsDone'), goal: 10, reward: { t1: 3 } },
    { id: 'mis50', cat: 'otros', tier: 2, name: 'Constante', desc: 'Completa 50 misiones.', value: st('missionsDone'), goal: 50, reward: { t10: 1 }, title: 'Constante' },
    { id: 'mis200', cat: 'otros', tier: 3, name: 'Incansable', desc: 'Completa 200 misiones.', value: st('missionsDone'), goal: 200, reward: { t10: 3 } },
    { id: 'group1', cat: 'otros', tier: 1, name: 'En compañía', desc: 'Juega una partida en grupo.', value: st('groupRuns'), goal: 1, reward: { t1: 2 } },
    { id: 'group10', cat: 'otros', tier: 2, name: 'Compañero fiel', desc: 'Juega 10 partidas en grupo.', value: st('groupRuns'), goal: 10, reward: { t10: 1 }, title: 'Compañero fiel' }
  ];

  // Un logro por legendario: "Vence a Mewtwo"...
  for (const p of G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex])) {
    LIST.push({ id: 'leg_' + p.dex, cat: 'legendarios', tier: 2, dex: p.dex, name: 'Vence a ' + p.name,
                desc: 'Derrota a ' + p.name + ' en una grieta.', value: s => (s.legends && s.legends[p.dex] ? 1 : 0), goal: 1, reward: { t1: 1 } });
  }
  const totalLegends = LIST.filter(a => a.dex).length;
  for (const a of LIST) if (a.id === 'legAll') { a.goal = totalLegends; a.desc = `Vence a los ${totalLegends} legendarios.`; }
  // Metas que dependen de los datos del juego.
  for (const a of LIST) if (a.id === 'ownAll') { a.goal = G.DEX.length; a.desc = `Ten los ${G.DEX.length} Pokémon del juego.`; }
  const evoTotal = Object.keys(G.Moves.EVO).length;
  for (const a of LIST) if (a.id === 'evoAll') { a.goal = evoTotal; a.desc = `Evoluciona los ${evoTotal} movimientos distintos.`; }

  const BY = {};
  for (const a of LIST) BY[a.id] = a;

  return { CATS, LIST, BY };
})();
