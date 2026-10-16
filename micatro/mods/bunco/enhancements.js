// Bunco — enhancements (Bunco.lua ~8169-8320). Their rules live in flow.js:
//   Cracker  discarding it plays it instead (a free hand), then it is eaten (lovely "Cracker Cards")
//   Copper   a streak of adjacent Copper cards scores again once its last card has scored (rescore_amount 1)
import { data_of } from './util.js';

const enh = (key, def = {}) => ({ ...data_of('enhancements', key), set: 'Enhanced', name: key, config: {}, ...def });
export const centers = [
  enh('m_bunc_cracker'),
  enh('m_bunc_copper', { post_effect: true, rescore_amount: 1 }),
];
export const hooks = {};
