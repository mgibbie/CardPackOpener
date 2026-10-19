// tools/micatro/gen_smods_attributes.cjs — vendors Steamodded's built-in SMODS.Attribute list (src/game_objects/attributes.lua) as JS data.
//   node tools/micatro/gen_smods_attributes.cjs <smods>/src/game_objects/attributes.lua micatro/js/engine/smods_attributes.js
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
const body = src.slice(src.indexOf('SMODS.Attribute({'));
const out = [];
const re = /SMODS\.Attribute\(\{([\s\S]*?)\n\}\)/g;
let m;
const strs = (s) => (s.replace(/--[^\n]*/g, '').match(/'[^']*'|"[^"]*"/g) || []).map((x) => x.slice(1, -1));
while ((m = re.exec(body))) {
  const b = m[1];
  const key = (b.match(/key\s*=\s*['"]([^'"]+)['"]/) || [])[1];
  const keysM = b.match(/keys\s*=\s*\{([\s\S]*?)\}/);
  const aliasM = b.match(/alias\s*=\s*\{([\s\S]*?)\}/);
  const rest = b.replace(/key\s*=\s*['"][^'"]+['"]/, '').replace(/keys\s*=\s*\{[\s\S]*?\}/, '').replace(/alias\s*=\s*\{[\s\S]*?\}/, '').replace(/--[^\n]*/g, '').replace(/[\s,]/g, '');
  if (rest) throw new Error('unknown fields in ' + key + ': ' + rest);
  const a = { key };
  a.keys = keysM ? strs(keysM[1]) : [];
  if (aliasM) a.alias = strs(aliasM[1]);
  out.push(a);
}
const n = (src.match(/SMODS\.Attribute\(\{/g) || []).length;
if (n !== out.length) throw new Error(`parsed ${out.length} of ${n}`);
const lines = out.map((a) => '  ' + JSON.stringify(a).replace(/"/g, "'") + ',');
fs.writeFileSync(process.argv[3], `// GENERATED — never edit. Steamodded's built-in attributes (SMODS.Attribute), vendored from
// Steamodded/smods src/game_objects/attributes.lua at 5b8a087 (version 26.1018.0~dev-b; Pokermon 3.9.1 needs >= 26.829.0)
// by tools/micatro/gen_smods_attributes.cjs. {key, keys: [object keys that have it], alias?: [attribute keys]}.
// Read through js/engine/smods.js (get_attribute_pool / has_attribute); mods add their own via registerMod content.attributes.
export default [
${lines.join('\n')}
];
`);
console.log(out.length, 'attributes,', out.reduce((n, a) => n + a.keys.length, 0), 'keys');
