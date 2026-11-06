import assert from 'node:assert/strict';
import { AVAILABLE, loadMods, modOptionList, MODS } from '../js/mods/index.js';
import { activateMods, centerActive } from '../js/mods/registry.js';
import { newRun } from '../js/engine/run.js';
import { G, create_card } from '../js/engine/core.js';
await loadMods(AVAILABLE.map((m) => m.id));
let checked = 0;
for (const manifest of AVAILABLE) {
  const mod = MODS[manifest.id];
  const items = [];
  for (const group of ['centers', 'tags', 'blinds', 'seals', 'stakes', 'suits', 'poker_hands', 'poker_hand_parts', 'stickers']) {
    items.push(...(mod.content[group] || []).filter((c) => c.key && !c.legacy && !c.unported && (group !== 'centers' || c.set)));
  }
  const options = Object.fromEntries(items.map((item) => ['content:' + item.key, false]));
  activateMods([manifest.id], { [manifest.id]: options });
  const shown = new Set(modOptionList(manifest.id).map((o) => o.key));
  assert(modOptionList(manifest.id).filter((o) => o.key.startsWith('content:')).every((o) => !/\{[^}]*\}/.test(o.label)), `${manifest.id} content labels contain no raw markup`);
  for (const item of items) {
    const option = 'content:' + item.key;
    assert(shown.has(option), `${manifest.id} exposes ${option}`);
    assert.equal(centerActive(item), false, `${manifest.id} disables ${option}`);
    checked++;
  }
}
console.log(`${checked} individual content switches across shipped mods are exposed and applied`);
let forcedChecks = 0;
for (const manifest of AVAILABLE) {
  const center = (MODS[manifest.id].content.centers || []).find((c) => c.set === 'Joker' && c.key && !c.unported && !c.legacy);
  if (!center) continue;
  newRun({ seed: 'TOGGLE', mods: [manifest.id], modOptions: { [manifest.id]: { ['content:' + center.key]: false } } });
  const card = create_card('Joker', G.jokers, null, null, null, false, center.key);
  assert.notEqual(card.config.center.key, center.key, `${manifest.id} cannot force its disabled Joker`);
  forcedChecks++;
}
console.log(`${forcedChecks} shipped mods reject forced creation of a disabled Joker`);
let cardChecks = 0;
for (const manifest of AVAILABLE) for (const type of ['Tarot', 'Planet', 'Spectral', 'Voucher']) {
  const center = (MODS[manifest.id].content.centers || []).find((c) => c.set === type && c.key && !c.unported && !c.legacy);
  if (!center) continue;
  newRun({ seed: 'TOGGLE', mods: [manifest.id], modOptions: { [manifest.id]: { ['content:' + center.key]: false } } });
  const card = create_card(type, type === 'Voucher' ? G.shop_vouchers : G.consumeables, null, null, null, false, center.key);
  assert.notEqual(card.config.center.key, center.key, `${manifest.id} cannot force disabled ${type}`);
  cardChecks++;
}
console.log(`${cardChecks} shipped mod consumables and vouchers reject forced creation when disabled`);
