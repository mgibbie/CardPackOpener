/* ============ starters.js — compañeros iniciales y test de personalidad ============
 * Como en Mundo Misterioso: unas preguntas deciden tu personalidad, y tu
 * personalidad decide tu compañero. Puedes rechazarlo y elegir otro.
 *
 * Los stats salen de G.DEX; aquí sólo van los rasgos y el movimiento inicial.
 */
G.STARTERS = [
  { dex: 1,   start: 'vine-whip',     traits: ['leal', 'paciente'] },
  { dex: 4,   start: 'ember',         traits: ['valiente', 'impulsivo'] },
  { dex: 7,   start: 'water-gun',     traits: ['prudente', 'leal'] },
  { dex: 152, start: 'vine-whip',     traits: ['dulce', 'paciente'] },
  { dex: 155, start: 'ember',         traits: ['tímido', 'impulsivo'] },
  { dex: 158, start: 'water-gun',     traits: ['travieso', 'valiente'] },
  { dex: 252, start: 'razor-leaf',    traits: ['sereno', 'astuto'] },
  { dex: 255, start: 'ember',         traits: ['alegre', 'valiente'] },
  { dex: 258, start: 'water-gun',     traits: ['tenaz', 'leal'] },
  { dex: 387, start: 'vine-whip',     traits: ['paciente', 'tenaz'] },
  { dex: 390, start: 'ember',         traits: ['travieso', 'alegre'] },
  { dex: 393, start: 'bubble',        traits: ['orgulloso', 'prudente'] },
  { dex: 495, start: 'razor-leaf',    traits: ['orgulloso', 'astuto'] },
  { dex: 498, start: 'ember',         traits: ['tenaz', 'alegre'] },
  { dex: 501, start: 'water-gun',     traits: ['valiente', 'travieso'] },
  { dex: 650, start: 'vine-whip',     traits: ['travieso', 'tenaz'] },
  { dex: 653, start: 'ember',         traits: ['astuto', 'sereno'] },
  { dex: 656, start: 'water-gun',     traits: ['sereno', 'astuto'] },
  { dex: 722, start: 'razor-leaf',    traits: ['sereno', 'dulce'] },
  { dex: 725, start: 'ember',         traits: ['solitario', 'orgulloso'] },
  { dex: 728, start: 'bubble',        traits: ['alegre', 'dulce'] },
  { dex: 810, start: 'vine-whip',     traits: ['alegre', 'travieso'] },
  { dex: 813, start: 'ember',         traits: ['impulsivo', 'alegre'] },
  { dex: 816, start: 'water-gun',     traits: ['tímido', 'astuto'] },
  { dex: 906, start: 'razor-leaf',    traits: ['solitario', 'astuto'] },
  { dex: 909, start: 'ember',         traits: ['tranquilo', 'tenaz'] },
  { dex: 912, start: 'water-gun',     traits: ['orgulloso', 'prudente'] },
  { dex: 54,  start: 'confusion',     traits: ['caótico', 'tímido'] },
  { dex: 79,  start: 'confusion',     traits: ['tranquilo', 'paciente'] }
];

G.STARTER_BY = {};
for (const s of G.STARTERS) G.STARTER_BY[s.dex] = s;

/** Movimiento inicial de cualquier Pokémon (starter o del gacha). */
G.startMoveOf = dex => {
  // MicaSurvivor (M5 lote 3, save_data.gd start_move_of): con la MT comprada, el que elegiste.
  const pick = G.tmPick(dex);
  return pick || G.naturalStartOf(dex);
};

/** El movimiento inicial de siempre (sin la MT). */
G.naturalStartOf = dex => {
  const s = G.STARTER_BY[dex];
  return s ? s.start : G.Moves.startFor(G.DEX_BY[dex]);
};

/**
 * MicaSurvivor (M5 lote 3, save_data.gd tm_pool): los movimientos que se pueden elegir de
 * inicio con la MT: los de sus tipos y los Normales (Mew, todos), sin los de apoyo.
 */
G.tmPool = dex => {
  const mon = G.DEX_BY[dex];
  if (!mon) return [];
  return G.Moves.ALL.filter(m => m.kind !== 'buff' && (+dex === 151 || m.type === 'normal' || mon.types.includes(m.type))).map(m => m.id);
};

/** El elegido con la MT (save.ptm[dex]) si la tienes comprada y sigue siendo válido; si no, null. */
G.tmPick = dex => {
  const sv = G.DB && G.DB.save;
  // (MicaSurvivor DLC D18: the TM is per family: bought on any stage, the pick of this stage or, if none, another stage's)
  if (!sv || !(G.DB.levelsOf ? G.DB.levelsOf(dex).tm : ((sv.pupg || {})[dex] || {}).tm)) return null;
  const id = G.DB.familyPick ? G.DB.familyPick('ptm', dex) : (sv.ptm || {})[dex];
  return id && G.tmPool(dex).includes(id) ? id : null;
};

/** Elige el movimiento inicial (MT). No puede quedarse vetado (save_data.gd tm_set). */
G.tmSet = (dex, id) => {
  const sv = G.DB.save;
  if (!G.tmPool(dex).includes(id)) return false;
  sv.ptm = sv.ptm || {};
  sv.ptm[dex] = id;
  if (sv.pban && sv.pban[dex]) sv.pban[dex] = sv.pban[dex].filter(b => b !== id);
  G.DB.commit();
  return true;
};

// (The personality test that used to pick a partner is gone, owner 2026-11-12: a new player chooses one of G.STARTERS
//  directly, js/ui/test.js. A starter's two traits are still shown beside it.)
