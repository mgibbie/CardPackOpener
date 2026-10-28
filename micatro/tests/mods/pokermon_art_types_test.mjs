// The owner's Pokermon jokers take the type their CARD shows (owner rule, 2026-10-28: "the type shown on the card is always the right
// one when there's a conflict"; contentRev 30). Every joker of jokers/pokejokers_designs.js draws an upstream 3.9.1 card
// (`poke_sprite391`), and upstream draws the type on it (the type icon in the bottom-left corner). tools/micatro/pokermon_art_type.mjs
// reads that icon by template matching, trained on the jokers upstream itself registers.
//   ART   (when the gitignored Pokermon sheets are on disk) the reader gets every registered upstream joker's type right,
//         leave-one-out (100%); then every owner-designed joker's ptype IS its card's type, and Castform's three weather forms'
//         types are their own cards' (the Gen 3 sheet cells CASTFORM_SPRITES draws)
//   PLAY  the one change the rule made: Urshifu Single Strike is Dark, Rapid Strike Water (they were Fighting; Kubfu stays
//         Fighting). Kubfu's evolution lands the new type on the card (ability.extra.ptype); is_type / find_pokemon_type see it;
//         Dark / Water Energy raises their X Mult and Fighting Energy no longer does; Barboach's Muddy Water counts Rapid Strike
//         as a Water Joker
//   node micatro/tests/mods/pokermon_art_types_test.mjs
import path from 'path';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
import { T, start, hand, add, play, winRound, nextRound, clearHand, G, P_CENTERS } from './poke_helpers.mjs';
import { ART } from './poke_art_helpers.mjs';
import { SEA_SPRITES } from '../../mods/pokermon/systems/anim.js';
import { increment_energy, energy_matches } from '../../mods/pokermon/systems/energy.js';
import { is_type, find_pokemon_type } from '../../mods/pokermon/systems/types.js';
import { CASTFORM_FORMS, BURMY_CLOAKS } from '../../mods/pokermon/jokers/pokejokers_designs.js';
import { CASTFORM_SPRITES, BURMY_SPRITES } from '../../mods/pokermon/systems/anim.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const designs = () => Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon' && c.poke_sprite391);

await sec('static', () => {
  const D = Object.fromEntries(designs().map((c) => [c.name, c.ptype]));
  ok(Object.keys(D).length >= 42, 'the owner\'s designs are registered', Object.keys(D).length);
  ok(D.kubfu === 'Fighting' && D.urshifu_single === 'Dark' && D.urshifu_rapid === 'Water', 'Kubfu Fighting; Urshifu Single Strike Dark, Rapid Strike Water (their cards\' types)', [D.kubfu, D.urshifu_single, D.urshifu_rapid]);
  ok(D.stunky === 'Dark' && D.skuntank === 'Dark', 'Stunky / Skuntank: Dark (both cards show the Dark icon)', [D.stunky, D.skuntank]);
  ok(D.gible === 'Dragon' && D.gabite === 'Dragon' && D.garchomp === 'Dragon', 'Gible / Gabite / Garchomp: Dragon (all three cards show the Dragon icon)', [D.gible, D.gabite, D.garchomp]);
  ok(D.hippopotas === 'Earth' && D.hippowdon === 'Earth' && D.skorupi === 'Dark' && D.drapion === 'Dark' && D.carnivine === 'Grass' && D.finneon === 'Water' && D.lumineon === 'Water',
    'Hippopotas / Hippowdon Earth, Skorupi / Drapion Dark, Carnivine Grass, Finneon / Lumineon Water (the icons on their cards)', [D.hippopotas, D.hippowdon, D.skorupi, D.drapion, D.carnivine, D.finneon, D.lumineon]);
  ok(D.dialga === 'Metal' && D.palkia === 'Water' && D.giratina === 'Psychic' && D.regigigas === 'Colorless' && D.arceus === 'Colorless',
    'Dialga Metal, Palkia Water, Giratina Psychic, Regigigas / Arceus Colorless (the icons on their cards)', [D.dialga, D.palkia, D.giratina, D.regigigas, D.arceus]);
  ok(D.scorbunny === 'Fire' && D.raboot === 'Fire' && D.cinderace === 'Fire' && D.sobble === 'Water' && D.drizzile === 'Water' && D.inteleon === 'Water',
    'the Gen 8 starters: Scorbunny / Raboot / Cinderace Fire, Sobble / Drizzile / Inteleon Water (the icons on their cards)', [D.scorbunny, D.raboot, D.cinderace, D.sobble, D.drizzile, D.inteleon]);
  ok(D.uxie === 'Psychic' && D.mesprit === 'Psychic' && D.azelf === 'Psychic' && D.cresselia === 'Psychic' && D.phione === 'Water' && D.manaphy === 'Water',
    'the Lake trio + Cresselia: Psychic; Phione / Manaphy: Water (the icons on their cards)', [D.uxie, D.mesprit, D.azelf, D.cresselia, D.phione, D.manaphy]);
  ok(['rowlet', 'dartrix', 'decidueye'].every((n) => D[n] === 'Grass') && ['litten', 'torracat', 'incineroar'].every((n) => D[n] === 'Fire') && ['popplio', 'brionne', 'primarina'].every((n) => D[n] === 'Water'),
    'the Gen 7 starters: Rowlet line Grass, Litten line Fire, Popplio line Water (the icons on their cards)', ['rowlet', 'dartrix', 'decidueye', 'litten', 'torracat', 'incineroar', 'popplio', 'brionne', 'primarina'].map((n) => D[n]));
  ok(D.snivy === 'Grass' && D.servine === 'Grass' && D.serperior === 'Grass' && D.tepig === 'Fire' && D.pignite === 'Fire' && D.emboar === 'Fire'
    && D.oshawott === 'Water' && D.dewott === 'Water' && D.samurott === 'Water',
  'the Gen 5 starters: Snivy line Grass, Tepig line Fire (Pignite / Emboar too: Fire/Fighting, their cards Fire), Oshawott line Water (the icons on their cards)',
  [D.snivy, D.servine, D.serperior, D.tepig, D.pignite, D.emboar, D.oshawott, D.dewott, D.samurott]);
  ok(['chespin', 'quilladin', 'chesnaught'].every((n) => D[n] === 'Grass') && ['fennekin', 'braixen', 'delphox'].every((n) => D[n] === 'Fire') && ['froakie', 'frogadier', 'greninja'].every((n) => D[n] === 'Water'),
    'the Gen 6 starters: Chespin line Grass, Fennekin line Fire, Froakie line Water (the icons on their cards; Greninja\'s Protean changes it in play)', [D.chespin, D.chesnaught, D.fennekin, D.delphox, D.froakie, D.greninja]);
  ok(CASTFORM_FORMS.normal.ptype === 'Colorless' && CASTFORM_FORMS.sunny.ptype === 'Fire' && CASTFORM_FORMS.rainy.ptype === 'Water' && CASTFORM_FORMS.snowy.ptype === 'Water',
    'Castform: Normal Colorless, Sunny Fire, Rainy / Snowy Water');
});

if (!ART) console.log('(Pokermon art not on disk: the art checks are skipped; set MICATRO_MAIN)');
else await sec('art', async () => {
  const AT = await import(pathToFileURL(path.join(ROOT, 'tools/micatro/pokermon_art_type.mjs')).href);
  // the training set straight from the registry this suite already loaded (not a second mod load)
  const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
    .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
  const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
  const v = typer.validate();
  ok(v.total >= 540 && v.ok === v.total && v.minMargin >= 0.2, `the reader: ${v.ok} / ${v.total} registered Pokermon jokers' types right, leave-one-out (min margin ${v.minMargin.toFixed(2)})`,
    v.wrong.slice(0, 8));
  ok(!typer.training.some((r) => designs().some((c) => c.name === r.name)), 'it never trains on the owner\'s designs (what it checks)');
  const bad = [];
  for (const c of designs()) {
    const s = c.poke_sprite391, r = typer.typeOfEntry({ atlas: s.atlas, pos: [s.pos.x, s.pos.y] });
    if (!r || r.ptype !== c.ptype) bad.push(`${c.name}: ptype ${c.ptype}, card ${r && r.ptype} (${r && r.score.toFixed(2)})`);
  }
  ok(!bad.length, `every owner-designed joker's ptype is the type its card shows (${designs().length})`, bad);
  // Shellos / Gastrodon: both seas' cards (East = each one's own Gen 4 cell, West the second) show the Water icon, their ptype
  const seas = Object.entries(SEA_SPRITES || {}).flatMap(([k, cells]) => Object.entries(cells).map(([f, p]) => [k + ' ' + f, P_CENTERS[k] && P_CENTERS[k].ptype, typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen04', pos: [p.x, p.y] })]));
  ok(seas.length === 4 && seas.every(([, want, r]) => want === 'Water' && r && r.ptype === want), 'Shellos / Gastrodon: each sea’s card shows the Water icon (West and East)',
    seas.map(([f, w, r]) => `${f} ${w} / card ${r && r.ptype}`));
  const own = typer.typeOfEntry({ atlas: P_CENTERS.j_poke_castform.poke_sprite391.atlas, pos: [P_CENTERS.j_poke_castform.poke_sprite391.pos.x, P_CENTERS.j_poke_castform.poke_sprite391.pos.y] });
  const forms = Object.entries(CASTFORM_SPRITES).map(([f, p]) => [f, CASTFORM_FORMS[f].ptype, typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen03', pos: [p.x, p.y] })]);
  ok(own && own.ptype === CASTFORM_FORMS.normal.ptype && forms.length === 3 && forms.every(([, want, r]) => r && r.ptype === want),
    'Castform: each form\'s type is its own card\'s (Normal Colorless; Sunny / Rainy / Snowy on the Gen 3 sheet)', forms.map(([f, w, r]) => `${f} ${w} / card ${r && r.ptype}`));
  // Burmy / Wormadam: each cloak's type is its own card's (Plant = their own Gen 4 cells; Sandy / Trash the cells BURMY_SPRITES draws)
  const cloaks = [];
  for (const k of ['j_poke_burmy', 'j_poke_wormadam']) {
    const s = P_CENTERS[k].poke_sprite391;
    cloaks.push([k + ' plant', BURMY_CLOAKS.plant.ptype, typer.typeOfEntry({ atlas: s.atlas, pos: [s.pos.x, s.pos.y] })]);
    for (const [f, p] of Object.entries(BURMY_SPRITES[k])) cloaks.push([k + ' ' + f, BURMY_CLOAKS[f].ptype, typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen04', pos: [p.x, p.y] })]);
  }
  ok(cloaks.length === 6 && cloaks.every(([, want, r]) => r && r.ptype === want), 'Burmy / Wormadam: each cloak\'s type is its own card\'s (Plant Grass, Sandy Earth, Trash Metal)',
    cloaks.map(([f, w, r]) => `${f} ${w} / card ${r && r.ptype}`));
  // Giratina: its Origin Forme card (Gen 4 {10,3}, drawn while Dialga or Palkia is held) shows the Psychic icon too: one type for both
  const origin = typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen04', pos: [10, 3] });
  ok(origin && origin.ptype === 'Psychic' && P_CENTERS.j_poke_giratina.ptype === 'Psychic', 'Giratina: the Origin Forme card shows Psychic, as its Altered card', origin);
});

/** Kubfu with these trainings, evolved by a winning 1-card hand. */
function urshifu(seed, single, rapid) {
  start(seed);
  const k = add('j_poke_kubfu');
  k.ability.extra.single = single; k.ability.extra.rapid = rapid; k.ability.extra.Xmult = 2;
  winRound();
  return k;
}
await sec('urshifu single (Dark)', () => {
  const j = urshifu('ARTDARK', 5, 4);
  ok(key(j) === 'j_poke_urshifu_single' && j.ability.extra.ptype === 'Dark', 'Kubfu (Fighting) evolves into Single Strike Urshifu, Dark on the card', [key(j), j.ability.extra.ptype]);
  ok(is_type(j, 'Dark') && !is_type(j, 'Fighting') && find_pokemon_type('Dark').includes(j) && !find_pokemon_type('Fighting').includes(j), 'is_type / find_pokemon_type: Dark, not Fighting');
  ok(energy_matches(j, 'Dark', false) && !energy_matches(j, 'Fighting', false), 'Darkness Energy matches it, Fighting Energy no longer does');
  const x0 = j.ability.extra.Xmult;
  increment_energy(j, 'Fighting');
  ok(near(j.ability.extra.Xmult, x0) && !(j.ability.extra.energy_count > 0), 'Fighting Energy: no change', j.ability.extra);
  increment_energy(j, 'Dark');
  ok(j.ability.extra.energy_count === 1 && j.ability.extra.Xmult > x0, 'Darkness Energy: energized, its X Mult up', [x0, j.ability.extra.Xmult]);
});
await sec('urshifu rapid (Water)', () => {
  const j = urshifu('ARTWATER', 2, 7);
  ok(key(j) === 'j_poke_urshifu_rapid' && j.ability.extra.ptype === 'Water', 'Kubfu evolves into Rapid Strike Urshifu, Water on the card', [key(j), j.ability.extra.ptype]);
  ok(is_type(j, 'Water') && !is_type(j, 'Fighting') && energy_matches(j, 'Water', false) && !energy_matches(j, 'Fighting', false), 'is_type / Energy: Water, not Fighting');
  const x0 = j.ability.extra.Xmult;
  increment_energy(j, 'Water');
  ok(j.ability.extra.energy_count === 1 && j.ability.extra.Xmult > x0, 'Water Energy: energized, its X Mult up', [x0, j.ability.extra.Xmult]);
  // a Water synergy now counts it: Barboach's Muddy Water, +12 Chips per Water / Earth Joker (itself included)
  nextRound();
  const b = add('j_poke_barboach');
  clearHand();
  const r = play(hand(['S_2'])).total;
  // High Card 5 + the 2 (Surging Strikes retriggers it: +2 again) + Muddy Water 2 x 12
  ok(r && r.chips === 5 + 2 + 2 + 2 * 12, 'Barboach counts Rapid Strike Urshifu as a Water Joker (+24 Chips: two of them)', r);
  b.remove();
});

done();
