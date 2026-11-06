import assert from 'node:assert/strict';
import { AVAILABLE, loadMods, modOptionList, MODS } from '../js/mods/index.js';
import { activateMods, centerActive } from '../js/mods/registry.js';
await loadMods(AVAILABLE.map((m) => m.id));
let checked = 0;
for (const manifest of AVAILABLE) {
  const mod = MODS[manifest.id];
  for (const group of ['centers', 'tags', 'blinds', 'seals', 'stakes', 'suits', 'poker_hands', 'poker_hand_parts', 'stickers']) {
    const item = (mod.content[group] || []).find((c) => c.key && !c.legacy && !c.unported && (group !== 'centers' || c.set));
    if (!item) continue;
    const option = 'content:' + item.key;
    assert(modOptionList(manifest.id).some((o) => o.key === option), `${manifest.id} exposes ${option}`);
    activateMods([manifest.id], { [manifest.id]: { [option]: false } });
    assert.equal(centerActive(item), false, `${manifest.id} disables ${option}`);
    checked++;
  }
}
console.log(`${checked} content categories across shipped mods expose and apply individual switches`);
