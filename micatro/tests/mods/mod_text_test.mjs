// In-game text of the mods' content (all mods on): every tag / pack / sticker / blind has its name and text, and
// no #n# placeholder is left unfilled — in a run and in the collection (no run: the design wiki's view too).
//   node micatro/tests/mods/mod_text_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, P_CENTERS, add_joker } from '../../js/engine/core.js';
import { newRun, init_game_object } from '../../js/engine/run.js';
import { describe, describeCenter, describeTag, describeBlind } from '../../js/engine/describe.js';
import { loadMods, AVAILABLE } from '../../js/mods/index.js';
import { STICKERS, MOD_LOC } from '../../js/mods/registry.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const MODS = await loadMods(AVAILABLE.map((m) => m.id));
const unfilled = (d) => !d || (d.lines || []).some((l) => /#\d+#/.test(l)) || (d.info || []).some((i) => (i.lines || []).some((l) => /#\d+#/.test(l)));
const texty = (d, key) => d && d.name && d.name !== key && (d.lines || []).some((l) => l !== '');

newRun({ seed: 'MODTEXT', back: 'b_red', stake: 1, mods: MODS });

// Bunco's 16 tags: a real name and text, not the raw key
for (const k of ['tag_bunc_breaking', 'tag_bunc_arcade', 'tag_bunc_glitter', 'tag_bunc_filigree', 'tag_bunc_rental']) {
  const d = describeTag(k);
  ok(texty(d, k) && !unfilled(d), 'Bunco tag text: ' + k, d && [d.name, d.lines]);
}
// Pokermon's packs and Autumn Circus's Option Select (SMODS.Booster text lives in descriptions.Other)
for (const k of ['p_poke_pokepack_normal_1', 'p_poke_pokepack_mega_2', 'p_poke_pokepack_wish_pack', 'p_poke_pokepack_starter_pack', 'p_thac_option_select']) {
  const d = describeCenter(k);
  ok(texty(d, k) && !unfilled(d), 'pack text: ' + k, d && [d.name, d.lines]);
}
// Litwick / Lampent / Chandelure read the card's sell value: the collection card has one too
for (const k of ['j_poke_litwick', 'j_poke_lampent', 'j_poke_chandelure']) {
  const d = describeCenter(k);
  ok(texty(d, k) && !unfilled(d), 'collection text filled: ' + k, d && d.lines);
}
// Gourgeist before a size is picked (the collection card): the Average form's text
{ const d = describeCenter('j_poke_gourgeist'); ok(/^Gourgeist/.test(d.name) && texty(d, 'j_poke_gourgeist') && !unfilled(d), 'Gourgeist collection text', d && [d.name, d.lines]); }
// the Jirachi tag (no loc entry in Pokermon)
{ const d = describeTag('tag_poke_jirachi_tag'); ok(texty(d, 'tag_poke_jirachi_tag'), 'Jirachi tag: a name and text', d && [d.name, d.lines]); }
// info boxes: a vanilla tag / the Negative edition pushed without vars are filled like Balatro's
for (const k of ['j_poke_cleffa', 'j_poke_garbodor', 'j_nacho_mega_gardevoir', 'j_poke_hisuian_qwilfish', 'j_poke_overqwil']) {
  const c = add_joker(k); G.E_MANAGER.flush();
  const d = describe(c);
  ok(!unfilled(d) && (d.info || []).length > 0, 'info boxes filled: ' + k, d.info && d.info.filter((i) => (i.lines || []).some((l) => /#\d+#/.test(l))).map((i) => i.key));
  c.remove(); G.E_MANAGER.flush();
}
// Tera stickers + the Stellar sticker have text
const OTHER = MOD_LOC.descriptions.Other || {};
const stickerKeys = Object.values(STICKERS).filter((s) => s.mod === 'pokermon' || s.mod === 'nacho').map((s) => s.key);
ok(stickerKeys.length === 13 && stickerKeys.every((k) => OTHER[k] && OTHER[k].text && OTHER[k].text.length), 'Tera + Stellar stickers have text', stickerKeys.filter((k) => !OTHER[k]));
ok(/X:grass/.test(OTHER.grass_sticker.text[0]), 'Grass sticker: the author\'s "{X:grass,C:white}Grass{}"', OTHER.grass_sticker);
// Bunco's The Mask in a run: the real hands; in the collection: the placeholders (collection_loc_vars)
{
  const d = describeBlind('bl_bunc_mask');
  ok(!unfilled(d) && d.lines.join(' ').includes('High Card'), 'The Mask in a run: the most / least played hands', d.lines);
  const jokers = G.jokers; G.jokers = undefined;
  try {
    const c = describeBlind('bl_bunc_mask');
    ok(!unfilled(c) && c.lines.join(' ').includes('(least played hand)'), 'The Mask in the collection: "(least played hand)"', c.lines);
    const t = describeBlind('bl_bunc_tine');
    ok(!unfilled(t) && t.lines.join(' ').includes('(most played rank)'), 'The Tine in the collection: "(most played rank)"', t.lines);
  } finally { G.jokers = jokers; }
}
// The design wiki's bare game object (no run): Station / The Mask still fill their text
{
  const saved = { GAME: G.GAME, handlist: G.handlist, jokers: G.jokers };
  G.GAME = init_game_object(); G.handlist = undefined; G.jokers = undefined;
  try {
    const s = describeCenter('c_thac_station');
    ok(!unfilled(s) && s.lines.join(' ').includes('High Card'), 'Station with no run: "Currently: High Card"', s.lines);
    const m = describeBlind('bl_bunc_mask');
    ok(!unfilled(m), 'The Mask with no run: filled', m.lines);
  } finally { Object.assign(G, saved); }
}
// a whole sweep: no mod center / tag / blind with unfilled text, a raw-key name or (tags, packs) no text
{
  const bad = [];
  for (const c of Object.values(P_CENTERS)) {
    if (!c.mod || c.unported || c.set === 'Shader') continue;
    const d = describeCenter(c.key);
    if (unfilled(d)) bad.push(c.key + ' unfilled');
    if (!d || !d.name || d.name === c.key) bad.push(c.key + ' raw name');
    if (c.set === 'Booster' && !texty(d, c.key)) bad.push(c.key + ' no text');
  }
  ok(bad.length === 0, 'every mod center: named, filled', bad.slice(0, 12));
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
