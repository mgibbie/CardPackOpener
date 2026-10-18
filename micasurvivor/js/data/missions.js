/* ============ missions.js — plantillas de misiones diarias y semanales ============
 * Cada día salen 3 diarias y cada semana 2 semanales (hora de España), con
 * objetivos y tipos sorteados (el sorteo y el orden de las listas, los del port de Android: progress.gd
 * 301-334 y ensure / _pick_set; MicaSurvivor M5 lote 11 completa las 17 diarias y 13 semanales). Se completan jugando y el premio se recoge en
 * la pantalla de Misiones. La lógica está en systems/progress.js.
 *
 *   ev      evento que la hace avanzar (ver G.Progress.event)
 *   match   (datos, parámetro) -> ¿cuenta este evento?
 *   value   datos -> cuánto vale; con mode 'max' se queda el mayor, con
 *           'add' (por defecto) se suma (1 si no hay value)
 *   param   'type': sortea un tipo Pokémon para la misión
 */
G.MissionDefs = (() => {
  const T = t => G.U.TYPE_NAME[t];
  const min = d => Math.floor(d.time / 60);

  const daily = [
    { id: 'kill', ev: 'kill', goals: [300, 500, 800], reward: { t1: 2, coins: 150 },
      text: n => `Derrota a ${n} Pokémon` },
    { id: 'killType', ev: 'kill', param: 'type', goals: [30, 50, 80], reward: { t1: 2, coins: 200 },
      match: (d, t) => d.types.includes(t), text: (n, t) => `Derrota a ${n} Pokémon de tipo ${T(t)}` },
    { id: 'survive', ev: 'runEnd', mode: 'max', value: min, goals: [5, 7, 9], reward: { t1: 3, coins: 200 },
      text: n => `Aguanta ${n} minutos en una run` },
    { id: 'level', ev: 'runEnd', mode: 'max', value: d => d.level, goals: [8, 12, 15], reward: { t1: 2, coins: 200 },
      text: n => `Llega al nivel ${n} en una run` },
    { id: 'boss', ev: 'kill', match: d => d.boss, goals: [1, 2], reward: { t1: 3, coins: 250 },
      text: n => (n === 1 ? 'Derrota a un jefe' : `Derrota a ${n} jefes`) },
    { id: 'chest', ev: 'chest', goals: [1, 2], reward: { t1: 2, coins: 200 },
      text: n => (n === 1 ? 'Abre un cofre con candado' : `Abre ${n} cofres con candado`) },
    { id: 'coins', ev: 'runEnd', value: d => d.coins, goals: [100, 200, 300], reward: { t1: 2, coins: 150 },
      text: n => `Recoge ${n} monedas en tus runs` },
    { id: 'playType', ev: 'runEnd', param: 'type', mode: 'max', value: min, goals: [3], reward: { t1: 3, coins: 200 },
      match: (d, t) => d.types.includes(t), text: (n, t) => `Aguanta ${n} minutos con un Pokémon de tipo ${T(t)}` },
    { id: 'item', ev: 'item', goals: [1], reward: { t1: 2, coins: 150 },
      text: () => 'Encuentra un objeto equipable' },
    { id: 'evolve', ev: 'evolve', goals: [1], reward: { t1: 3, coins: 250 },
      text: () => 'Evoluciona un movimiento' },
    // MicaSurvivor: las misiones de los modos, en el orden del port (progress.gd 312-318; el orden importa: el sorteo
    // del día elige por posición). "req" (progress.gd _advance 535-540): sólo cuentan las partidas de ese modo; mMods,
    // las que llevan algún modificador (el Desafío diario llega con nmods 0). Lote 7: mTeam; lote 8: mRush, mTower;
    // lote 11: mDaily, mMods, mType, mRifts.
    { id: 'mDaily', ev: 'runEnd', goals: [1], reward: { t1: 3, coins: 250 },
      match: d => d.mode === 'daily', text: () => 'Juega el Desafío diario' },
    { id: 'mRush', ev: 'runEnd', mode: 'max', value: d => d.bosses || 0, goals: [2, 4], reward: { t1: 3, coins: 300 },
      match: d => d.mode === 'rush', text: n => `Derrota a ${n} jefes en el Rush de Jefes` },
    { id: 'mMods', ev: 'runEnd', mode: 'max', value: min, goals: [4, 6], reward: { t1: 3, coins: 300 },
      match: d => (d.nmods || 0) >= 1, text: n => `Aguanta ${n} minutos con algún modificador activo` },
    { id: 'mType', ev: 'runEnd', mode: 'max', value: min, goals: [4, 6], reward: { t1: 3, coins: 300 },
      match: d => d.mode === 'type', text: n => `Aguanta ${n} minutos en Supervivencia por tipo` },
    { id: 'mTeam', ev: 'runEnd', mode: 'max', value: min, goals: [5, 8], reward: { t1: 3, coins: 300 },
      match: d => d.mode === 'team', text: n => `Aguanta ${n} minutos en Modo Equipo` },
    { id: 'mTower', ev: 'runEnd', mode: 'max', value: d => d.floor || 0, goals: [2, 3], reward: { t1: 3, coins: 350 },
      match: d => d.mode === 'tower', text: n => `Supera ${n} pisos de la Torre de pisos` },
    { id: 'mRifts', ev: 'runEnd', mode: 'max', value: d => d.rifts || 0, goals: [2, 3], reward: { t1: 3, coins: 350 },
      match: d => d.mode === 'rifts', text: n => `Gana ${n} grietas en la Contrarreloj de grietas` }
  ];

  const weekly = [
    { id: 'wkill', ev: 'kill', goals: [4000, 6000], reward: { t10: 1, coins: 800 },
      text: n => `Derrota a ${n.toLocaleString('es')} Pokémon` },
    { id: 'wrift', ev: 'rift', goals: [1, 2], reward: { t10: 1, coins: 1000 },
      text: n => (n === 1 ? 'Gana una pelea en una grieta' : `Gana ${n} peleas en grietas`) },
    { id: 'wboss', ev: 'kill', match: d => d.boss, goals: [4, 6], reward: { t10: 1, coins: 900 },
      text: n => `Derrota a ${n} jefes` },
    { id: 'wsurvive', ev: 'runEnd', mode: 'max', value: min, goals: [12, 15], reward: { t10: 1, coins: 1000 },
      text: n => `Aguanta ${n} minutos en una run` },
    { id: 'wevolve', ev: 'evolve', goals: [3, 5], reward: { t10: 1, coins: 900 },
      text: n => `Evoluciona ${n} movimientos` },
    { id: 'wdaily', ev: 'missionDone', match: d => d.daily, goals: [8, 12], reward: { t10: 1, coins: 800 },
      text: n => `Completa ${n} misiones diarias` },
    // MicaSurvivor: las de los modos en el orden del port (progress.gd 327-333). Lote 7: wTeam; lote 8: wRush, wTower;
    // lote 11: wDailyCh, wType, wRifts, wMods (3 o más modificadores).
    { id: 'wDailyCh', ev: 'runEnd', goals: [3, 5], reward: { t1: 3, t10: 1, coins: 1000 },
      match: d => d.mode === 'daily', text: n => `Juega ${n} Desafíos diarios` },
    { id: 'wRush', ev: 'runEnd', mode: 'max', value: d => d.bosses || 0, goals: [6, 9], reward: { t1: 3, t10: 1, coins: 1100 },
      match: d => d.mode === 'rush', text: n => `Derrota a ${n} jefes en una sola partida de Rush de Jefes` },
    { id: 'wType', ev: 'runEnd', mode: 'max', value: min, goals: [8, 12], reward: { t1: 3, t10: 1, coins: 1100 },
      match: d => d.mode === 'type', text: n => `Aguanta ${n} minutos en Supervivencia por tipo` },
    { id: 'wTeam', ev: 'runEnd', mode: 'max', value: min, goals: [10, 15], reward: { t1: 3, t10: 1, coins: 1200 },
      match: d => d.mode === 'team', text: n => `Aguanta ${n} minutos en Modo Equipo` },
    { id: 'wTower', ev: 'runEnd', mode: 'max', value: d => d.floor || 0, goals: [6, 9], reward: { t1: 4, t10: 1, coins: 1300 },
      match: d => d.mode === 'tower', text: n => `Supera ${n} pisos de la Torre de pisos en una sola partida` },
    { id: 'wRifts', ev: 'runEnd', mode: 'max', value: d => d.rifts || 0, goals: [5, 7], reward: { t1: 4, t10: 1, coins: 1300 },
      match: d => d.mode === 'rifts', text: n => `Gana ${n} grietas en una Contrarreloj de grietas` },
    { id: 'wMods', ev: 'runEnd', mode: 'max', value: min, goals: [6, 8], reward: { t1: 3, t10: 1, coins: 1200 },
      match: d => (d.nmods || 0) >= 3, text: n => `Aguanta ${n} minutos con 3 o más modificadores` }
  ];

  const BY = {};
  for (const m of daily.concat(weekly)) BY[m.id] = m;

  return { daily, weekly, BY };
})();
