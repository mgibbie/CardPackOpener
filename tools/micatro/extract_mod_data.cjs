// Extract a Balatro mod's STATIC data (every content item's non-function fields,
// plus which hook functions it defines) by executing the mod's own Lua files in a
// sandboxed Lua VM (fengari) with permissive stubs for Steamodded/Balatro globals.
// Behaviour (the functions) is ported by hand; this guarantees the numbers,
// keys, sprite cells, rarities, costs and configs match the mod exactly.
//
//   NODE_PATH=<dir containing fengari> node tools/micatro/extract_mod_data.cjs <modDir> <outFile.js> [spec.json]
//
// spec (optional JSON): { "files": {"<group>": ["glob-ish relative paths"...]}, "globals": ["pokermon.family", {"name", "expr"}, ...],
//                         "loc": "localization/en-us.lua", "run_first": ["functions/x.lua", ...],
//                         "prelude": "<Lua run before run_first, e.g. namespace tables a newer mod version expects>" }
const fs = require('fs'), path = require('path');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

const [, , MOD, OUT, SPECF] = process.argv;
const spec = SPECF ? JSON.parse(fs.readFileSync(SPECF, 'utf8')) : {};

// A value that absorbs anything done to it at load time (index, call, concat, arithmetic).
const PRELUDE = String.raw`
local stub_mt = {}
local function mkstub(name) return setmetatable({__stub = name or '?'}, stub_mt) end
stub_mt.__index = function(t, k) if k == '__stub' then return rawget(t, '__stub') end local s = mkstub(tostring(rawget(t,'__stub'))..'.'..tostring(k)) rawset(t, k, s) return s end
stub_mt.__call = function(t, ...) return mkstub(rawget(t,'__stub')..'()') end
stub_mt.__concat = function(a, b) return (type(a)=='table' and '' or tostring(a))..(type(b)=='table' and '' or tostring(b)) end
stub_mt.__add = function() return 0 end stub_mt.__sub = stub_mt.__add stub_mt.__mul = stub_mt.__add stub_mt.__div = stub_mt.__add
stub_mt.__unm = stub_mt.__add stub_mt.__len = function() return 0 end
stub_mt.__lt = function() return false end stub_mt.__le = stub_mt.__lt stub_mt.__eq = function() return false end
stub_mt.__tostring = function(t) return '<' .. tostring(rawget(t,'__stub')) .. '>' end

CAPTURED = {}
local function capture(kind) return function(t) if type(t) == 'table' then t.__kind = kind; table.insert(CAPTURED, t) end return t end end
local smods = setmetatable({}, {__index = function(t, k)
  local v = setmetatable({}, {__call = function(self, t) return capture(k)(t) end, __index = function(s, kk)
    if kk == 'take_ownership' then return function(key, t) if type(t)=='table' then t.__take_ownership = key end return capture(k)(t) end end
    if kk == 'extend' then return function(self, base) local mt = {__index = base} mt.__call = function(_, t) if type(t)=='table' then for bk, bv in pairs(base) do if t[bk] == nil then t[bk] = bv end end end return capture(k)(t) end return setmetatable({}, mt) end end
    if kk == 'new' then return function(self, ...) local a = {...}; local t = {name = a[1], key = a[2], config = a[3], pos = a[4], loc_txt = a[5], cost = a[6]}; return capture(k)(t) end end
    return mkstub('SMODS.'..k..'.'..kk) end})
  rawset(t, k, v) return v end})
SMODS = smods
SMODS.current_mod = setmetatable({config = {}}, {__index = function(t,k) return mkstub('current_mod.'..k) end})
SMODS.Mods = setmetatable({}, {__index = function() return nil end})
SMODS.find_mod = function() return {} end -- next(SMODS.find_mod('x')) is nil: no other mod loaded (Bunco fork 5.4.8b)
SMODS.load_file = function() return function() return {} end end
NFS = setmetatable({}, {__index = function() return function() return {} end end})
function HEX(h) return '#'..tostring(h) end
function localize(k) return k end
G = mkstub('G')
G.C = setmetatable({}, {__index = function(t,k) return '#COLOUR_'..tostring(k) end})
for _, k in ipairs({'SECONDARY_SET', 'SET', 'SUITS', 'RARITY', 'UI', 'BOOSTER', 'EDITION', 'TAROT'}) do rawset(G.C, k, {}) end
G.ARGS = {LOC_COLOURS = {}}
pokermon = {}
setmetatable(_G, {__index = function(t, k) local s = mkstub(k) rawset(t, k, s) return s end})
`;

const SERIALIZE = String.raw`
local seen = {}
local function enc(v, depth)
  depth = depth or 0
  local t = type(v)
  if t == 'nil' then return 'null' elseif t == 'boolean' then return tostring(v)
  elseif t == 'number' then if v ~= v or v == math.huge or v == -math.huge then return 'null' end return string.format('%.14g', v)
  elseif t == 'string' then return (string.format('%q', v):gsub('\\\n','\\n'))
  elseif t == 'function' then return '"__fn"'
  elseif t == 'table' then
    if getmetatable(v) and rawget(v, '__stub') then return '{"__stub":' .. string.format('%q', tostring(rawget(v,'__stub'))) .. '}' end
    if seen[v] or depth > 12 then return '"__cycle"' end
    seen[v] = true
    local n = #v; local isArr = n > 0
    if isArr then for k in pairs(v) do if type(k) ~= 'number' then isArr = false break end end end
    local parts = {}
    if isArr then for i=1,n do parts[#parts+1] = enc(v[i], depth+1) end seen[v] = nil return '['..table.concat(parts, ',')..']' end
    local keys = {} for k in pairs(v) do if type(k)=='string' or type(k)=='number' then keys[#keys+1]=k end end
    table.sort(keys, function(a,b) return tostring(a) < tostring(b) end)
    for _,k in ipairs(keys) do parts[#parts+1] = string.format('%q', tostring(k))..':'..enc(v[k], depth+1) end
    seen[v] = nil
    return '{'..table.concat(parts, ',')..'}'
  end
  return 'null'
end
return enc
`;

function newState() {
  const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  run(L, PRELUDE, 'prelude');
  if (spec.prelude) { run(L, spec.prelude, 'spec prelude'); lua.lua_pop(L, 1); }
  return L;
}
function run(L, code, name) {
  if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring(name)) !== 0 || lua.lua_pcall(L, 0, 1, 0) !== 0) {
    const err = to_jsstring(lua.lua_tostring(L, -1)); lua.lua_pop(L, 1); throw new Error(name + ': ' + err);
  }
}
function evalJSON(L, expr) {
  run(L, `local enc = (function() ${SERIALIZE} end)(); return enc(${expr})`, 'serialize');
  const s = to_jsstring(lua.lua_tostring(L, -1)); lua.lua_pop(L, 1);
  return JSON.parse(s);
}
const readLua = (rel) => fs.readFileSync(path.join(MOD, rel), 'utf8').replace(/^﻿/, '');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(MOD, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) out.push(...walk(rel)); else if (e.name.endsWith('.lua')) out.push(rel);
  }
  return out.sort();
}

const result = { source: path.basename(MOD), groups: {}, captured: [], globals: {}, loc: null, errors: [] };
const L = newState();
for (const f of spec.run_first || []) {
  try { run(L, readLua(f), f); lua.lua_pop(L, 1); } catch (e) { result.errors.push(String(e.message)); }
}
for (const [group, globs] of Object.entries(spec.files || {})) {
  result.groups[group] = [];
  const files = globs.flatMap((g) => (g.endsWith('/') ? walk(g.slice(0, -1)) : [g]));
  for (const f of files) {
    try {
      run(L, `RET = (function() ${readLua(f)}
 end)()`, f);
      lua.lua_pop(L, 1);
      const ret = evalJSON(L, 'RET');
      result.groups[group].push({ file: f, ret });
    } catch (e) { result.errors.push(String(e.message)); }
  }
}
try { result.captured = evalJSON(L, 'CAPTURED'); } catch (e) { result.errors.push('captured: ' + e.message); }
// A global is a Lua expression named by itself, or {name, expr} (e.g. data a newer mod keeps in a local table, read
// through the accessor the mod exposes).
for (const g of spec.globals || []) {
  const [name, expr] = typeof g === 'string' ? [g, g] : [g.name, g.expr];
  try { result.globals[name] = evalJSON(L, expr); } catch (e) { result.errors.push('global ' + name + ': ' + e.message); }
}
if (spec.loc) {
  try { run(L, `LOC = (function() ${readLua(spec.loc)}
 end)()`, spec.loc); lua.lua_pop(L, 1); result.loc = evalJSON(L, 'LOC'); }
  catch (e) { result.errors.push('loc: ' + e.message); }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `// GENERATED by tools/micatro/extract_mod_data.cjs from ${result.source}. Static data only — behaviour is ported by hand.\nexport default ${JSON.stringify(result)};\n`);
const counts = Object.fromEntries(Object.entries(result.groups).map(([g, a]) => [g, a.reduce((n, x) => n + ((x.ret && x.ret.list && x.ret.list.length) || 0), 0)]));
console.log('wrote', OUT, JSON.stringify(counts), 'captured', result.captured.length, 'errors', result.errors.length);
for (const e of result.errors.slice(0, 20)) console.log('  !', e.slice(0, 200));
