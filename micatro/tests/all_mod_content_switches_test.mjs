import assert from 'node:assert/strict';
import { AVAILABLE, loadMods, modOptionList, MODS } from '../js/mods/index.js';
import { activateMods, centerActive } from '../js/mods/registry.js';
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
  for (const item of items) {
    const option = 'content:' + item.key;
    assert(shown.has(option), `${manifest.id} exposes ${option}`);
    assert.equal(centerActive(item), false, `${manifest.id} disables ${option}`);
    checked++;
  }
}
console.log(`${checked} individual content switches across shipped mods are exposed and applied`);
