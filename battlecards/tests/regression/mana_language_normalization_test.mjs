// Mana-language normalization (owner request, 2026-09-17). Three-tier vocabulary,
// mechanics untouched (only description/text edited):
//   • temporary/spendable  -> "Gain X Mana"        (no "Mana Crystal", no "this turn")
//   • permanent ramp        -> "Gain an empty Mana Crystal" / "Gain N empty Mana Crystals"
//                              (ONE phrasing — filled ramp collapses to "empty" too)
//   • refill spent mana     -> "Refresh N Mana" / "Refresh all your Mana"  (no "Crystals")
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const desc = id => (byId[id] && byId[id].description) || '';

// ---- 1) temporary-mana cards: "this turn" gone, "Gain N Mana" ----
ok('azorius_signet -> "{T}: Gain 2 Mana."', desc('azorius_signet') === '{T}: Gain 2 Mana.', desc('azorius_signet'));
ok('azorius_signet tapAbility.text matches', byId.azorius_signet.tapAbility.text === 'Gain 2 Mana.', byId.azorius_signet.tapAbility.text);
ok('innervate -> "Gain 2 Mana."', desc('innervate') === 'Gain 2 Mana.', desc('innervate'));
ok('coin -> "Gain 1 Mana." (dropped "this turn only")', desc('coin') === 'Gain 1 Mana.', desc('coin'));
ok('klothys_command keeps its other clause', desc('klothys_command') === 'Deal 2 damage to a creature. Gain 2 Mana.', desc('klothys_command'));

// ---- 2) "a/two/three Mana Crystal(s) this turn" -> "Gain N Mana" ----
ok('sc_jaheira_10 "a Mana Crystal this turn" -> "Gain 1 Mana"', desc('sc_jaheira_10') === '{T}: Gain 1 Mana.', desc('sc_jaheira_10'));
ok('wastes_palladium_myr -> "Battlecry: Gain 2 Mana."', desc('wastes_palladium_myr') === 'Battlecry: Gain 2 Mana.', desc('wastes_palladium_myr'));
ok('mv_treasure_gilded_lotus -> "Battlecry: Gain 3 Mana."', desc('mv_treasure_gilded_lotus') === 'Battlecry: Gain 3 Mana.', desc('mv_treasure_gilded_lotus'));
ok('astral_communion -> "Gain 10 Mana. Discard your hand."', desc('astral_communion') === 'Gain 10 Mana. Discard your hand.', desc('astral_communion'));

// ---- 3) lands: "Gain N" boost line + tap label both -> "Gain N Mana" ----
ok('plains description leads "⟳ ⟳: Gain 1 Mana."', desc('plains').startsWith('⟳ ⟳: Gain 1 Mana.\n'), desc('plains'));
ok('plains taps[0].text -> "Gain 1 Mana."', byId.plains.taps[0].text === 'Gain 1 Mana.', byId.plains.taps[0].text);
ok('wastes land leads "⟳ ⟳: Gain 1 Mana."', desc('wastes').startsWith('⟳ ⟳: Gain 1 Mana.\n'), desc('wastes'));
// no land still says a bare "Gain N." boost line
{
  const lands = raw.cards.filter(c => c.type === 'land');
  const bad = lands.filter(c => /⟳ ⟳: Gain \d+\.(?!\d)/.test(c.description || '') && !/⟳ ⟳: Gain \d+ Mana\./.test(c.description || ''));
  ok('every one of the ' + lands.length + ' lands says "Gain N Mana"', bad.length === 0, bad.map(c => c.id).join(','));
}

// ---- 4) hybrid: temp clause cleaned, permanent-crystal clause preserved ----
ok('temur_savage_ventmaw Swing -> "Gain 3 Mana."', /Swing: Gain 3 Mana\./.test(desc('temur_savage_ventmaw')), desc('temur_savage_ventmaw'));
ok('temur_savage_ventmaw keeps "Gain an empty Mana Crystal."', /Gain an empty Mana Crystal\./.test(desc('temur_savage_ventmaw')), desc('temur_savage_ventmaw'));

// ---- 5) permanent ramp -> ONE phrasing: "(an|N) empty Mana Crystal(s)" ----
ok('simic_signet -> "Gain 2 empty Mana Crystals."', desc('simic_signet') === 'Gain 2 empty Mana Crystals.', desc('simic_signet'));
ok('karametras_acolyte -> "Gain an empty Mana Crystal."', desc('karametras_acolyte') === 'Battlecry: Gain an empty Mana Crystal.', desc('karametras_acolyte'));
ok('ysera_emerald_aspect ramp clause -> "Gain 3 empty Mana Crystals."', /Gain 3 empty Mana Crystals\./.test(desc('ysera_emerald_aspect')) && /maximum Mana by 5/.test(desc('ysera_emerald_aspect')), desc('ysera_emerald_aspect'));
ok('word-number "two" -> digit: wastes_oblivion_sower "Gain 2 empty Mana Crystals."', desc('wastes_oblivion_sower') === 'Battlecry: Gain 2 empty Mana Crystals.', desc('wastes_oblivion_sower'));
ok('lowercase casing fixed: breath_of_dreams "Gain an empty Mana Crystal."', /Gain an empty Mana Crystal\./.test(desc('breath_of_dreams')) && !/mana crystal/.test(desc('breath_of_dreams')), desc('breath_of_dreams'));
ok('opponent ramp: arcane_golem -> "Give your opponent an empty Mana Crystal."', /Give your opponent an empty Mana Crystal\./.test(desc('arcane_golem')), desc('arcane_golem'));
// filled ramp collapses to "empty" too (owner's "one phrasing for all")
ok('filled ulda_academic_research -> "Gain an empty Mana Crystal."', desc('ulda_academic_research') === 'Gain an empty Mana Crystal.', desc('ulda_academic_research'));
ok('filled ulda_tea_time -> "Gain 4 empty Mana Crystals & draw 2 cards."', desc('ulda_tea_time') === 'Gain 4 empty Mana Crystals & draw 2 cards.', desc('ulda_tea_time'));
// a LOSS is not ramp — must stay "Lose a Mana Crystal"
ok('darnassus_aspirant keeps "Lose a Mana Crystal"', /Lose a Mana Crystal\./.test(desc('darnassus_aspirant')) && /Gain an empty Mana Crystal\./.test(desc('darnassus_aspirant')), desc('darnassus_aspirant'));

// ---- 6) refill -> "Refresh N Mana" / "Refresh all your Mana" (no "Crystals") ----
ok('horn_of_winter -> "Refresh 2 Mana."', desc('horn_of_winter') === 'Refresh 2 Mana.', desc('horn_of_winter'));
ok('full refill: twig_of_the_world_tree -> "Refresh all your Mana."', desc('twig_of_the_world_tree') === 'Deathrattle: Refresh all your Mana.', desc('twig_of_the_world_tree'));
ok('prose refill: green_thumb_gardener -> "Refresh Mana equal to..."', /Refresh Mana equal to the Cost/.test(desc('green_thumb_gardener')), desc('green_thumb_gardener'));
ok('3rd-person: ingenious_artificer -> "refreshes Mana equal to..."', /refreshes Mana equal to its Attack\./.test(desc('ingenious_artificer')), desc('ingenious_artificer'));
ok('rehydrate -> "Refresh 2 Mana."', /Quickdraw: Refresh 2 Mana\./.test(desc('rehydrate')), desc('rehydrate'));
// counting your permanent slots is NOT a refresh — keep "Mana Crystals" there
ok('duels_wardens_insight: refresh clause normalized, count clause kept', /Refresh all your Mana;/.test(desc('duels_wardens_insight')) && /for each of your Mana Crystals\./.test(desc('duels_wardens_insight')), desc('duels_wardens_insight'));

// ---- 6b) non-grant "Mana this turn" text: LEFT ALONE ----
ok('pebbly_page keeps "don\'t lock Mana this turn"', /don't lock Mana this turn/.test(desc('pebbly_page')), desc('pebbly_page'));
ok('forgotten_millennium keeps "instead of Mana this turn"', /instead of Mana this turn/.test(desc('forgotten_millennium')), desc('forgotten_millennium'));

// ---- 6c) GLOBAL: no leftover "Mana Crystal" refills or non-empty ramp grants ----
{
  let rLeak = 0, pLeak = 0, low = 0; const seen = [];
  for (const c of raw.cards) {
    (function rec(v) {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach(rec); return; }
      for (const k in v) {
        if ((k === 'description' || k === 'text') && typeof v[k] === 'string') {
          const s = v[k];
          if (/[Rr]efresh(?:es)? (?:your |a |an |two |three |empty |\d+ )?Mana Crystals?\b/.test(s)) { rLeak++; if (seen.length < 6) seen.push('R:' + c.id); }
          if (/\b(?:Gain|gain|gains) (?:a|\d+) Mana Crystals?\b/.test(s)) { pLeak++; if (seen.length < 6) seen.push('P:' + c.id); }
          if (/mana crystal/.test(s)) low++;
        } else if (typeof v[k] === 'object') rec(v[k]);
      }
    })(c);
  }
  ok('no "Refresh ... Mana Crystal(s)" left anywhere', rLeak === 0, rLeak + ' ' + seen.join(','));
  ok('no ramp grant missing "empty" (no "Gain N/a Mana Crystal(s)")', pLeak === 0, pLeak + ' ' + seen.join(','));
  ok('no lowercase "mana crystal" left anywhere', low === 0, low);
}

// ---- 6d) deferred temp mana ("next turn") joins the "Gain X Mana" family ----
ok('emberscarred_whelp -> "Gain 1 Mana next turn."', /Gain 1 Mana next turn\./.test(desc('emberscarred_whelp')), desc('emberscarred_whelp'));
ok('trail_mix -> "Gain 2 Mana next turn."', desc('trail_mix') === 'Gain 2 Mana next turn.', desc('trail_mix'));
// ...but the special conditional/duration crystals keep their distinct wording
ok('felwood_treant keeps "Gain a temporary Mana Crystal"', /Gain a temporary Mana Crystal\./.test(desc('felwood_treant')), desc('felwood_treant'));
ok('acceleration_aura keeps "temporary Mana Crystal. Lasts 3 turns."', /temporary Mana Crystal\. Lasts 3 turns\./.test(desc('acceleration_aura')), desc('acceleration_aura'));
ok('felguard "Mana Crystals" now capitalized', /Destroy one of your Mana Crystals\./.test(desc('felguard')), desc('felguard'));

// ---- 7) GLOBAL invariant: no card grants "Gain N Mana this turn" anymore ----
{
  let residual = 0; const seen = [];
  for (const c of raw.cards) {
    (function rec(v) {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach(rec); return; }
      for (const k in v) {
        if ((k === 'description' || k === 'text') && typeof v[k] === 'string') {
          if (/\b(?:Gain|gain) (?:a|an|two|three|\d+) (?:[Mm]ana|Mana Crystals?) this turn/.test(v[k])) { residual++; if (seen.length < 5) seen.push(c.id); }
        } else if (typeof v[k] === 'object') rec(v[k]);
      }
    })(c);
  }
  ok('no residual "Gain N Mana this turn" grant text anywhere', residual === 0, residual + ' e.g. ' + seen.join(','));
}

// ---- 8) MECHANICS intact: the mana-grant effects still fire ----
ok('azorius_signet tap still gain-mana:2', byId.azorius_signet.tapAbility.effects[0].type === 'gain-mana' && byId.azorius_signet.tapAbility.effects[0].value === 2, JSON.stringify(byId.azorius_signet.tapAbility.effects));
ok('plains tap still gain-mana:1', byId.plains.taps[0].effects[0].type === 'gain-mana' && byId.plains.taps[0].effects[0].value === 1, JSON.stringify(byId.plains.taps[0].effects));
{
  const st = E.createGame(byId, seededRng(17), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 0, max: 10, bonus: 0 }; }
  E.execEffects(st, 0, byId.azorius_signet.tapAbility.effects, null, null);
  ok('firing gain-mana grants 2 temporary mana', st.players[0].mana.bonus === 2, st.players[0].mana.bonus);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
