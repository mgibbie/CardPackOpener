// designwiki_forms.mjs — every form / forme / mode of a Micatro joker, resolved by the game's own engine for the design wiki
// (tools/micatro/gen_designwiki_mods.mjs puts the result on the joker's item as `forms`; designwiki/app.js draws a "Forms" box).
//
// Nothing here is hand-written per joker. For each joker center the forms are FOUND, then each one's text is RESOLVED:
//   1. candidate values: the form art the game draws (Pokermon systems/anim.js tables keyed by the joker, the center's own
//      poke_form_art, and every other table's keys tried against the game's face()), the joker's alternate loc keys
//      (descriptions.Joker '<key>_<suffix>'), what its set_ability rolls (sampled on many seeds), and the literals its own
//      loc_vars / poke_view_form / calculate / set_ability compare a field with;
//   2. candidate fields: what loc_vars / poke_view_form read off the card (ability.* and ability.extra.*), plus extra.form;
//      a numeric counter also tries a ladder of counts (Zygarde's Cells, Necrozma's bank, ...);
//   3. each (field, value) is applied to a fresh collection card, and the engine's describe() gives its text, loc_vars its
//      loc key, poke_view_form its form and the Pokermon UI's face() its art. A state that changes the form, the loc key or
//      the art is a form; the first state reaching it is kept.
// A form whose effect text equals the base card's is `covered` when that text names it or a count of the card reaches it
// (Therian Forme, Zygarde's 50% Forme: the text above describes it), else `cosmetic` (Vivillon's patterns). A form only the run's state reaches (the Ante's season, a Boss Blind,
// the jokers beside it) — no field of the card gets there — is listed with its art and `state: true` (the card's text covers it).
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const title = (s) => String(s).replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()).trim();
const COUNTS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 500, 1000];
// (fields every Pokermon joker carries that are never a form: energy, type, the card's money)
const NOT_FORM = new Set(['name', 'set', 'energy_count', 'c_energy_count', 'cost', 'sell_cost', 'extra_value', 'mult', 't_mult', 't_chips', 'x_mult', 'h_size', 'd_size', 'type', 'perish_tally', 'eternal', 'perishable', 'rental']);

/**
 * @param {object} o  { ROOT, G, P_CENTERS, MOD_LOC, describe }
 * @returns {Promise<(center) => null | {forms: object[], cosmetic: number}>}
 */
export async function makeFormsOf({ ROOT, G, P_CENTERS, MOD_LOC, describe }) {
  const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
  let UI = null, AN = {};
  try { UI = (await imp('micatro/mods/pokermon/ui.js')).POKE_UI; } catch (e) { /* no Pokermon: text-only forms */ }
  try { AN = await imp('micatro/mods/pokermon/systems/anim.js'); } catch (e) { /* idem */ }
  // art tables: keyed by joker (GEN6_FORM_SPRITES.j_poke_vivillon = {2: pos, ...}) or by form alone (DEOXYS_SOULS = {1: pos})
  const BY_JOKER = {};
  for (const v of Object.values(AN)) {
    if (!isObj(v)) continue;
    for (const [k, t] of Object.entries(v)) if (/^j_/.test(k) && isObj(t)) { BY_JOKER[k] = BY_JOKER[k] || new Set(); for (const [f, cell] of Object.entries(t)) if (isObj(cell)) BY_JOKER[k].add(f); }
  }
  const ALT = MOD_LOC.descriptions.Joker || {};
  altKeysOf.ALT = ALT; altKeysOf.P_CENTERS = P_CENTERS;
  await loadRawCards(ROOT);
  const numish = (s) => (/^-?\d+$/.test(s) ? Number(s) : s);
  /** The forms a poke_view_form can return: the string literals of its own source. */
  const viewLiterals = (c) => (typeof c.poke_view_form === 'function' ? [...String(c.poke_view_form).matchAll(/'([^'\\\n]+)'|"([^"\\\n]+)"/g)].map((m) => m[1] || m[2]) : []);
  const fill = (text, vars) => (Array.isArray(text) ? text.flat(Infinity) : [text]).filter((l) => typeof l === 'string' && l !== '' && !/^\s*\{br:/.test(l))
    .map((l) => l.replace(/#(\d+)#/g, (m, n) => (vars && vars[n - 1] !== undefined && vars[n - 1] !== null ? String(vars[n - 1]) : '?'))); // (a var only that state has: '?')
  const literals = (c) => {
    const src = ['loc_vars', 'poke_view_form', 'calculate', 'set_ability'].map((f) => (typeof c[f] === 'function' ? String(c[f]) : '')).join('\n');
    const out = new Set();
    for (const m of src.matchAll(/[!=]==?\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|(-?\d+)\b)/g)) out.add(m[3] !== undefined ? Number(m[3]) : m[1] !== undefined ? m[1] : m[2]);
    for (const m of src.matchAll(/(?:'([^'\\\n]*)'|"([^"\\\n]*)"|\b(-?\d+))\s*[!=]==?/g)) out.add(m[3] !== undefined ? Number(m[3]) : m[1] !== undefined ? m[1] : m[2]);
    return [...out].filter((v) => v !== '' && v !== undefined);
  };
  const card0 = (c) => ({ ability: { name: c.name, set: c.set, ...clone(c.config || {}), extra: clone(c.config && c.config.extra) }, area: null, config: { center: c }, fake: true, cost: c.cost || 0, sell_cost: Math.max(1, Math.floor((c.cost || 0) / 2)) });
  const safe = (f, d) => { try { const r = f(); return r === undefined ? d : r; } catch (e) { return d; } };
  // (the view's form: poke_view_form, else ability.extra.form — only on a joker that has one: its config, its art or its roll gives it)
  const FORMFUL = new Set();
  const viewOf = (c, card) => (typeof c.poke_view_form === 'function' ? safe(() => c.poke_view_form(c, card), undefined) : FORMFUL.has(c.key) && isObj(card.ability.extra) ? card.ability.extra.form : undefined);
  const keyOf = (c, card) => (c.loc_vars ? safe(() => (c.loc_vars(c, [], card) || {}).key, undefined) : undefined) || c.key;
  const artOf = (c, card) => {
    if (!UI) return null;
    const view = viewOf(c, card);
    const f = safe(() => UI.face({ center: c.key, atlas: c.atlas, pos: c.pos, soul_pos: c.soul_pos, poke: { form: view, ptype: card.ability.extra && card.ability.extra.ptype } }), null);
    return f && f.atlas ? { atlas: f.atlas, pos: f.pos, soul_pos: f.soul_pos } : null;
  };
  const sameArt = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /** The fields loc_vars / poke_view_form read off the card ('a.<k>' ability, 'e.<k>' ability.extra). */
  const reads = (c) => {
    const card = card0(c), got = new Set();
    const ex = card.ability.extra;
    if (isObj(ex)) card.ability.extra = new Proxy(ex, { get(t, k) { if (typeof k === 'string') got.add('e.' + k); return t[k]; } });
    const ab = card.ability;
    card.ability = new Proxy(ab, { get(t, k) { if (typeof k === 'string' && k !== 'extra') got.add('a.' + k); return t[k]; } });
    safe(() => c.loc_vars && c.loc_vars(c, [], card));
    safe(() => c.poke_view_form && c.poke_view_form(c, card));
    return [...got].filter((f) => !NOT_FORM.has(f.slice(2)) && !/^e\.(energy|c_energy)/.test(f));
  };
  const get = (card, f) => (f[0] === 'e' ? (card.ability.extra || {})[f.slice(2)] : card.ability[f.slice(2)]);
  const put = (card, f, v) => { if (f[0] === 'e') { if (!isObj(card.ability.extra)) card.ability.extra = {}; card.ability.extra[f.slice(2)] = v; } else card.ability[f.slice(2)] = v; };
  const linesOf = (card) => safe(() => (describe(card).lines || []).filter((l) => l !== '' && l != null).map(String), []);
  /** What the joker rolls for itself: its set_ability (initial) on many seeds and — when loc_vars reads a field nothing sets yet
   *  (Salandit's gender, rolled when it is bought) — its add_to_deck, the run's state put back after each. -> [[field, value]] */
  const sample = (c, rd) => {
    const hooks = [];
    if (typeof c.set_ability === 'function') hooks.push((card) => c.set_ability(c, card, true));
    const unset = rd.filter((f) => get(card0(c), f) === undefined);
    if (typeof c.add_to_deck === 'function' && unset.length) hooks.push((card) => c.add_to_deck(c, card, false));
    if (!hooks.length) return [];
    const seen = new Map(), dflt = card0(c);
    let snap = null;
    try { snap = structuredClone(G.GAME); } catch (e) { snap = null; }
    for (const hook of hooks) {
      if (hook !== hooks[0] && !snap) break;
      for (let i = 0; i < 160; i++) {
        const card = card0(c);
        safe(() => hook(card));
        for (const f of ['e.form', ...rd].filter((x) => /^e.(form|gender)$/.test(x))) {
          const v = get(card, f);
          if (v !== get(dflt, f) && (typeof v === 'string' || (f === 'e.form' && typeof v === 'number'))) seen.set(f + ':' + JSON.stringify(v), [f, v]);
        }
        for (const [k, v] of Object.entries(card.ability)) if (/^poke_/.test(k) && (typeof v === 'string' || typeof v === 'number')) seen.set('a.' + k + ':' + JSON.stringify(v), ['a.' + k, v]);
        if (snap && hook !== hooks[0]) { for (const k of Object.keys(G.GAME)) delete G.GAME[k]; Object.assign(G.GAME, structuredClone(snap)); }
      }
    }
    return [...seen.values()];
  };
  const nameOf = (c, card, view, key) => {
    const own = typeof c.poke_form_name === 'function' && safe(() => c.poke_form_name(c, card), null);
    if (own) return String(own);
    if (key !== c.key && ALT[key]) {
      const m = /\(([^)]+)\)\s*$/.exec(String(ALT[key].name || ''));
      return m ? m[1] : title(key.slice(c.key.length + 1));
    }
    if (view === undefined || view === null || view === '') return null;
    return typeof view === 'number' ? 'Form ' + view : title(view);
  };

  formsOf.altKeysOf = altKeysOf;
  return formsOf;
  function formsOf(c) {
    if (!c || c.set !== 'Joker' || !(c.loc_vars || c.poke_view_form)) return null;
    const artKeys = [...(BY_JOKER[c.key] || []), ...Object.keys(c.poke_form_art || {})].map(numish);
    const rd = reads(c);
    const sampled = sample(c, rd);
    if ((isObj(c.config && c.config.extra) && 'form' in c.config.extra) || artKeys.length || sampled.some(([f]) => f === 'e.form')) FORMFUL.add(c.key);
    // (the collection's card; its set_ability's derived values too — Pumpkaboo's Jack target — unless that re-rolls it)
    let base = card0(c);
    if (typeof c.set_ability === 'function') { const k0 = keyOf(c, base); safe(() => c.set_ability(c, base, false)); if (keyOf(c, base) !== k0 || viewOf(c, base) !== viewOf(c, card0(c))) base = card0(c); }
    const b = { view: viewOf(c, base), key: keyOf(c, base), art: artOf(c, base), lines: linesOf(base) };
    const altKeys = altKeysOf(c);
    // values
    const views = [...new Set([...artKeys, ...viewLiterals(c)])];
    const vals = new Set([...views, ...altKeys.map((k) => k.slice(c.key.length + 1)), ...literals(c)]);
    // fields
    const fields = [...new Set(['e.form', ...rd])].filter((f) => f !== 'e.form' || isObj(base.ability.extra));
    const states = sampled.map(([f, v]) => [f, v, 'sampled']);
    for (const f of fields) {
      const d = get(base, f);
      if (typeof d === 'number' || (d === undefined && f !== 'e.form')) for (const n of COUNTS) states.push([f, n, 'count']);
      if (typeof d !== 'boolean') for (const v of vals) states.push([f, v]);
    }
    const found = new Map(); // identity -> form
    const idOf = (view, key, art) => (view !== undefined && view !== b.view ? 'v:' + JSON.stringify(view) : key !== b.key ? 'k:' + key : !sameArt(art, b.art) ? 'a:' + JSON.stringify(art) : null);
    for (const [f, v, how] of states) {
      if (get(base, f) === v) continue;
      const card = card0(c);
      put(card, f, v);
      // (the joker's own set_ability, not initial: what follows from the form — Pumpkaboo's size sets its Jack target)
      if (typeof c.set_ability === 'function') { safe(() => c.set_ability(c, card, false)); put(card, f, v); }
      const view = viewOf(c, card), key = keyOf(c, card), art = artOf(c, card);
      // (a view the game draws no different card for and whose key is the base one: a state label, not a form — unless the art tables name it)
      const named = view !== undefined && (artKeys.includes(view) || altKeys.includes(c.key + '_' + view));
      const lines = linesOf(card);
      // (a rolled value — Salandit's gender — or an on/off flag that changes the text is a form even when the art and key stay)
      const id = idOf(view, key, art) || (how === 'sampled' ? 'f:' + f + '=' + JSON.stringify(v) : null);
      if (!id || found.has(id)) continue;
      if (id[0] === 'v' && key === b.key && sameArt(art, b.art) && !named) continue;
      found.set(id, { card, view, key, art, lines, field: f, value: v, how });
    }
    // art the tables name that no state of the card reaches: the run's state picks it (season, Boss Blind, the jokers beside it)
    for (const v of views) {
      if (v === b.view || [...found.values()].some((x) => x.view === v)) continue;
      const art = UI ? safe(() => { const f = UI.face({ center: c.key, atlas: c.atlas, pos: c.pos, soul_pos: c.soul_pos, poke: { form: v } }); return f && f.atlas ? { atlas: f.atlas, pos: f.pos, soul_pos: f.soul_pos } : null; }, null) : null;
      found.set('s:' + v, { view: v, key: b.key, art, state: true });
    }
    // an alternate loc key no state of the card reaches (the run's weather: Cherrim's Sunshine): its own text, the card's vars
    const baseVars = c.loc_vars ? safe(() => (c.loc_vars(c, [], card0(c)) || {}).vars, []) : [];
    // (and the card's own key, when the collection shows an alternate one: Bunco's Crop Circles with Exotic suits)
    for (const k of [...altKeys, ...(b.key !== c.key && ALT[c.key] ? [c.key] : [])]) {
      if (k === b.key || [...found.values()].some((x) => x.key === k)) continue;
      const sfx = k === c.key ? null : k.slice(c.key.length + 1);
      // (a form the art reached but not the key — Minior's Core while its shields are still up — takes the key's text)
      const st = [...found.values()].find((x) => x.key === b.key && String(x.view) === sfx);
      if (st) { st.key = k; st.lines = fill(ALT[k].text, baseVars); st.state = true; continue; }
      found.set('k:' + k, { view: undefined, key: k, art: null, lines: fill(ALT[k].text, baseVars), state: true, alt: true });
    }
    if (!found.size) return null;
    // (cosmetic: the same effect text — only a {C:inactive} status line may differ, Vivillon's "(Pattern 2 of 20)")
    const effect = (l) => JSON.stringify((l || []).filter((x) => !/^\{C:inactive/.test(x)));
    const same = (l) => effect(l) === effect(b.lines);
    // (a base whose view names another form's key — Minior's rolled Core, shields up — is just the card)
    const baseName = (b.key !== c.key + '_' + b.view && altKeys.includes(c.key + '_' + b.view) ? null : nameOf(c, base, b.view, b.key)) || 'Base';
    const forms = [{ name: baseName, base: true, key: b.key, ...(b.art ? { art: b.art } : {}), lines: b.lines }];
    for (const x of found.values()) {
      const nm = (x.card && nameOf(c, x.card, x.view, x.key)) || (x.key !== b.key && ALT[x.key] && /\(([^)]+)\)\s*$/.test(ALT[x.key].name || '') ? /\(([^)]+)\)\s*$/.exec(ALT[x.key].name)[1] : null)
        || (x.view !== undefined ? (typeof x.view === 'number' ? 'Form ' + x.view : title(x.view)) : x.alt && x.key === c.key ? 'Standard' : x.key !== b.key ? title(x.key.slice(c.key.length + 1)) : x.field ? (typeof x.value === 'boolean' ? title(x.field.slice(2)) + (x.value ? '' : ' off') : title(x.value)) : 'Variant');
      const fm = { name: nm, key: x.key, ...(x.art ? { art: x.art } : {}) };
      if (x.state) fm.state = true;
      // (the same effect text that names this form — Therian Forme, Complete Forme, White Kyurem — covers it: not cosmetic)
      const alnum = (t) => String(t).replace(/\{[^}]*\}/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (x.lines && same(x.lines) && (x.how === 'count' || (alnum(nm).length > 2 && alnum(JSON.parse(effect(b.lines)).join(' ')).includes(alnum(nm))))) { fm.covered = true; fm.lines = x.lines; }
      else if (x.lines && same(x.lines)) fm.cosmetic = true;
      else if (x.lines) fm.lines = x.lines;
      forms.push(fm);
    }
    // (two states can land on one name — keep the first)
    const num = (f) => (/^Form \d+$/.test(f.name) ? Number(f.name.slice(5)) : null);
    forms.sort((a, b2) => (a.base ? -1 : b2.base ? 1 : num(a) !== null && num(b2) !== null ? num(a) - num(b2) : 0));
    const seen = new Set();
    const out = forms.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true)));
    if (out.length < 2) return null;
    return { forms: out, cosmetic: out.filter((f) => f.cosmetic).length };
  }
}

/**
 * A joker's alternate loc keys: descriptions.Joker '<key>_<suffix>' that are not a card of their own — neither registered (P_CENTERS)
 * nor in a mod's upstream card data (micatro/mods/<id>/data.js: More Fluff's unported John Balatro Super Ultra Mega Upgraded
 * Deluxe is a card, not a form of John Balatro).
 */
export function altKeysOf(c, ALT0, P_CENTERS0) {
  const ALT = ALT0 || altKeysOf.ALT, PC = P_CENTERS0 || altKeysOf.P_CENTERS;
  return Object.keys(ALT).filter((k) => k.startsWith(c.key + '_') && !PC[k] && !RAW_CARDS.has(k));
}
const RAW_CARDS = new Set();
/** The cards every mod's upstream data defines (its data.js: lists / maps of {key}). */
export async function loadRawCards(ROOT) {
  const dir = path.join(ROOT, 'micatro/mods');
  for (const id of fs.readdirSync(dir)) {
    const f = path.join(dir, id, 'data.js');
    if (!fs.existsSync(f)) continue;
    let D = null;
    try { D = (await import(pathToFileURL(f).href)).default; } catch (e) { continue; }
    for (const v of Object.values(D || {})) for (const o of (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [])) if (o && typeof o.key === 'string') RAW_CARDS.add(o.key);
  }
  return RAW_CARDS;
}
