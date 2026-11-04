// Extract Þe Autumn Circus (TheAutumnCircus) STATIC data for Micatro.
// TAC registers its content through buffers (data.lua: TheAutumnCircus.data.buffer_insert(kind, obj, extra)),
// so the generic extract_mod_data.cjs can't see it: this runs the mod's own module files in a fengari VM with
// a stub TheAutumnCircus whose buffer_insert records every object (non-function fields + which functions it
// defines), honouring config.lua's enabled_* switches and load_check like data.lua's register funcs do.
// `dependencies` (other mods an item needs) are recorded, not resolved — Micatro decides per run.
//
//   NODE_PATH=<dir with fengari> node tools/micatro/extract_autumn.cjs "<mods off>/TheAutumnCircus-main" \
//     micatro/mods/autumncircus/data.js micatro/mods/autumncircus/loc.js
const fs = require('fs'), path = require('path');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');
const [, , MOD, OUT, OUTLOC] = process.argv;
// Mods Micatro ships that TAC has cross-mod content for: the run is repeated with each one "installed"
// (SMODS.find_mod returns it, with its default config) and the extra objects are tagged `__xmod`.
const PARTNERS = { MoreFluff: '{config = {["Colour Cards"] = true, ["45 Degree Rotated Tarot Cards"] = true}}', Pokermon: '{config = {}}' };

const PRELUDE = [
  "local stub_mt = {}",
  "local function mkstub(name) return setmetatable({__stub = name or '?'}, stub_mt) end",
  "stub_mt.__index = function(t, k) if k == '__stub' then return rawget(t, '__stub') end local s = mkstub(tostring(rawget(t,'__stub'))..'.'..tostring(k)) rawset(t, k, s) return s end",
  "stub_mt.__call = function(t, ...) return mkstub(rawget(t,'__stub')..'()') end",
  "stub_mt.__concat = function(a, b) return (type(a)=='table' and '' or tostring(a))..(type(b)=='table' and '' or tostring(b)) end",
  "stub_mt.__add = function() return 0 end stub_mt.__sub = stub_mt.__add stub_mt.__mul = stub_mt.__add stub_mt.__div = stub_mt.__add",
  "stub_mt.__unm = stub_mt.__add stub_mt.__len = function() return 0 end",
  "stub_mt.__lt = function() return false end stub_mt.__le = stub_mt.__lt stub_mt.__eq = function() return false end",
  "stub_mt.__tostring = function(t) return '<' .. tostring(rawget(t,'__stub')) .. '>' end",
  "setmetatable(_G, {__index = function(t, k) local s = mkstub(k) rawset(t, k, s) return s end})",
  "SMODS = mkstub('SMODS')",
  "SMODS.find_mod = function() return {} end",
  "SMODS.Atlas = function() end",
  "SMODS.Font = function() end",
  "NFS = mkstub('NFS')",
  "function HEX(h) return '#'..tostring(h) end",
  "function localize(k) return k end",
  "G = mkstub('G')",
  "G.C = setmetatable({}, {__index = function(t,k) return '#COLOUR_'..tostring(k) end})",
  "G.ARGS = {LOC_COLOURS = {}}",
  "OddityAPI = {config = {base_shop_rate = 3}}",
  "AMM = {config = {suit_levels = {chips = 5, mult = 1, asc = 1}}, api = mkstub('AMM.api'), Aspects = {}}",
  "CAPTURED = {}",
  "TheAutumnCircus = {mod_prefix = 'thac', INIT = {}, func = mkstub('TheAutumnCircus.func'), data = {}}",
  "TheAutumnCircus.data.buffer_insert = function(kind, object, extra)",
  "  if extra then for k, v in pairs(extra) do if object[k] == nil then object[k] = v end end end",
  "  object.__kind = kind",
  "  table.insert(CAPTURED, object)",
  "end",
].join('\n');

const SERIALIZE = [
  "local seen = {}",
  "local function enc(v, depth)",
  "  depth = depth or 0",
  "  local t = type(v)",
  "  if t == 'nil' then return 'null' elseif t == 'boolean' then return tostring(v)",
  "  elseif t == 'number' then if v ~= v or v == math.huge or v == -math.huge then return 'null' end return string.format('%.14g', v)",
  "  elseif t == 'string' then return (string.format('%q', v):gsub('\\\\\\n','\\\\n'))",
  "  elseif t == 'function' then return '\"__fn\"'",
  "  elseif t == 'table' then",
  "    if getmetatable(v) and rawget(v, '__stub') then return '{\"__stub\":' .. string.format('%q', tostring(rawget(v,'__stub'))) .. '}' end",
  "    if seen[v] or depth > 12 then return '\"__cycle\"' end",
  "    seen[v] = true",
  "    local n = #v; local isArr = n > 0",
  "    if isArr then for k in pairs(v) do if type(k) ~= 'number' then isArr = false break end end end",
  "    local parts = {}",
  "    if isArr then for i=1,n do parts[#parts+1] = enc(v[i], depth+1) end seen[v] = nil return '['..table.concat(parts, ',')..']' end",
  "    local keys = {} for k in pairs(v) do if type(k)=='string' or type(k)=='number' then keys[#keys+1]=k end end",
  "    table.sort(keys, function(a,b) return tostring(a) < tostring(b) end)",
  "    for _,k in ipairs(keys) do parts[#parts+1] = string.format('%q', tostring(k))..':'..enc(v[k], depth+1) end",
  "    seen[v] = nil",
  "    return '{'..table.concat(parts, ',')..'}'",
  "  end",
  "  return 'null'",
  "end",
  "return enc",
].join('\n');

let L;
function run(code, name) {
  if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring(name)) !== 0 || lua.lua_pcall(L, 0, 1, 0) !== 0) {
    const err = to_jsstring(lua.lua_tostring(L, -1)); lua.lua_pop(L, 1); throw new Error(name + ': ' + err);
  }
  lua.lua_pop(L, 1);
}
function evalJSON(expr) {
  const code = 'local enc = (function() ' + SERIALIZE + ' end)(); return enc(' + expr + ')';
  if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring('ser')) !== 0 || lua.lua_pcall(L, 0, 1, 0) !== 0) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
  const s = to_jsstring(lua.lua_tostring(L, -1)); lua.lua_pop(L, 1);
  return JSON.parse(s);
}
const readLua = (rel) => fs.readFileSync(path.join(MOD, rel), 'utf8').replace(/^\uFEFF/, '');
const MODULES = ['LooksLikeTheJokers', 'MoreConsumables', 'JokerStamps', 'VouchMe', 'DeckTheBalatro', 'BlindToAllButTheVideo',
  'TagImIt', 'Skinnington', 'Emojiokers', 'BasicOddities', 'Enhancable', 'EditionToMeetYa', 'TransGirlsWhoBooster', 'StakeMePls', 'HamSpect'];
// data.lua's register filter: enabled_<kind>[key] == false or a failing load_check drops the object.
const FILTER = [
  "local cfgkey = {Jokers='enabled_jokers', Consumables='enabled_consumables', Seals='enabled_seals', Stamps='enabled_stamps',",
  "  Vouchers='enabled_vouchers', Enhancements='enabled_enhancements', Decks='enabled_decks', DeckSkins='enabled_deckskins',",
  "  Blinds='enabled_blinds', Stakes='enabled_stakes', Editions='enabled_editions', Boosters='enabled_boosters', Tags='enabled_tags',",
  "  Aspects='enabled_aspects'}",
  'KEPT = {}', 'DROPPED = {}',
  'for _, v in ipairs(CAPTURED) do',
  '  local tab = cfgkey[v.__kind] and TheAutumnCircus.config[cfgkey[v.__kind]] or {}',
  '  local ok = not (tab[v.key] == false)',
  "  local why = (not ok) and 'config' or nil",
  '  if ok and v.load_check then',
  '    local s, r = pcall(v.load_check, v)',
  "    if not s or not r then ok = false; why = 'load_check' end",
  '  end',
  '  if ok then table.insert(KEPT, v) else table.insert(DROPPED, {kind = v.__kind, key = v.key, why = why}) end',
  'end',
].join('\n');
// TheAutumnCircus.lua's module order. The cross-mod modules (BossMyJokers / ShatterMyJokersIntoPieces: GrabBag,
// selbamusnoCeroM: Entropy, 3ERROR: 0 ERROR, JoyInAutumn: JoyousSpring, EffectsOnMyJokers...: Stacked) load
// only with mods Micatro doesn't ship, so they are not run; TheAutumnQuips are title-screen quips.
function extract(partner) {
  L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const errors = [];
  run(PRELUDE, 'prelude');
  if (partner) run('SMODS.find_mod = function(id) if id == "' + partner + '" then return {' + PARTNERS[partner] + '} end return {} end', 'partner');
  run('TheAutumnCircus.config = (function() ' + readLua('config.lua') + ' end)()', 'config.lua');
  for (const f of MODULES) { try { run(readLua('modules/' + f + '.lua'), f); } catch (e) { errors.push(String(e.message)); } }
  run(FILTER, 'filter');
  return { kept: evalJSON('KEPT'), dropped: evalJSON('DROPPED'), errors };
}
const base = extract(null);
const { errors, dropped, kept } = base;
const seen = new Set(kept.map((o) => o.__kind + ':' + o.key));
for (const partner of Object.keys(PARTNERS)) {
  const r = extract(partner);
  for (const o of r.kept) if (!seen.has(o.__kind + ':' + o.key)) { o.__xmod = partner; kept.push(o); seen.add(o.__kind + ':' + o.key); }
  for (const e of r.errors) if (!errors.includes(e)) errors.push(e);
}
const byKind = {};
for (const o of kept) (byKind[o.__kind] = byKind[o.__kind] || []).push(o);
let loc = null;
try { run('LOC = (function() ' + readLua('localization/default.lua') + ' end)()', 'loc'); loc = evalJSON('LOC'); } catch (e) { errors.push('loc: ' + e.message); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, '// GENERATED from \u00DEe Autumn Circus 0.0.0f (modules/*.lua via data.lua\'s buffers) by tools/micatro/extract_autumn.cjs \u2014\n' +
  '// the mod\'s static fields ("__fn" marks a function the Lua defines; behaviour is ported by hand; __xmod: loads only with that mod).\nexport default ' + JSON.stringify({ kinds: byKind, dropped }, null, 1) + ';\n');
if (OUTLOC && loc) fs.writeFileSync(OUTLOC, '// GENERATED from \u00DEe Autumn Circus 0.0.0f localization/default.lua (static text only; tools/micatro/extract_autumn.cjs).\nexport default ' + JSON.stringify(loc, null, 1) + ';\n');
console.log('kinds', JSON.stringify(Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length]))), 'dropped', dropped.length);
for (const e of errors) console.log('  !', e.slice(0, 300));
