// pokermon_missing_jokers.mjs — which canonical Pokemon (National Dex 1-1025) have NO joker in Micatro's Pokermon
// family of mods (Pokermon 3.9.1, Nacho's Pokermon Dip, Sonfive's Pokermon+), and what a joker for each would be
// by upstream's own conventions: its Pokermon type (energy), stage, evolution line and a rarity / cost guess.
//
// The mods are loaded headlessly exactly as the game registers them (micatro/js/mods), so a joker added to any of
// them drops out of the list the next time this runs. A Mega, regional form or other variant of a species that
// already has a joker does NOT make that species missing: the list is base species only. No fakemon (dex 1-1025).
//
//   import { computeMissing } from './pokermon_missing_jokers.mjs'   (used by gen_designwiki_pokermon_jokers.mjs,
//   compose_missing_pokermon_jokers.mjs and overworld/tests/designwiki_pokermon_jokers_test.mjs)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../');
export const MODS = ['pokermon', 'nacho', 'pokermonplus'];
export const MOD_NAMES = { pokermon: 'Pokermon', nacho: "Nacho's Pokermon Dip", pokermonplus: "Sonfive's Pokermon+" };

// ---- upstream conventions -----------------------------------------------------------------------------------------------
/**
 * Pokemon type (the species' PRIMARY type) -> Pokermon type (its energy), the Pokemon TCG convention Pokermon follows.
 * Pokermon has no table of its own (each joker names its ptype by hand); this is the majority of those choices over
 * every existing joker in the three mods, and designwiki_pokermon_jokers_test re-derives it from the mods and checks
 * it. Flying has no majority of its own (upstream has one Flying-primary joker, the joke "Bird" type), so a Flying-
 * primary species takes its SECOND type's energy, and Colorless when it is pure Flying (the TCG's rule: Noivern Dragon,
 * Corviknight Metal, Tornadus Colorless).
 */
export const TYPE_TO_PTYPE = {
  Normal: 'Colorless', Fire: 'Fire', Water: 'Water', Grass: 'Grass', Bug: 'Grass', Electric: 'Lightning', Ice: 'Water',
  Fighting: 'Fighting', Poison: 'Dark', Ground: 'Earth', Rock: 'Earth', Psychic: 'Psychic', Ghost: 'Psychic',
  Dragon: 'Dragon', Dark: 'Dark', Steel: 'Metal', Fairy: 'Fairy',
};
export const ptypeOf = (types) => {
  const [a, b] = types || [];
  if (a === 'Flying') return b && b !== 'Flying' ? TYPE_TO_PTYPE[b] : 'Colorless';
  return TYPE_TO_PTYPE[a] || 'Colorless';
};
/** Upstream's stage keys, and how a card shows them. */
export const STAGE_LABEL = { Baby: 'Baby', Basic: 'Basic', One: 'Stage 1', Two: 'Stage 2', Legendary: 'Legendary' };
export const RARITY_LABEL = { 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Legendary', poke_safari: 'Safari' };
/** The 19 baby Pokemon (Pokermon gives each the 'Baby' stage; the one they evolve into is then the line's Basic). */
export const BABIES = new Set([172, 173, 174, 175, 236, 238, 239, 240, 298, 360, 406, 433, 438, 439, 440, 446, 447, 458, 848]);
/**
 * Legendary + Mythical species (Pokermon gives every one the 'Legendary' stage and rarity, evolved ones included,
 * e.g. Melmetal). Pokemon Showdown's data/pokedex.ts tags "Sub-Legendary", "Restricted Legendary" and "Mythical"
 * (base species, dex <= 1025). Ultra Beasts and Paradox Pokemon are not legendary there, nor here.
 */
export const LEGENDARY = new Set([
  144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 480, 481, 482,
  483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493, 494, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649,
  716, 717, 718, 719, 720, 721, 772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 800, 801, 802, 807, 808, 809, 888, 889,
  890, 891, 892, 893, 894, 895, 896, 897, 898, 905, 1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016, 1017, 1024, 1025,
]);
export const GENS = [[1, 151], [152, 251], [252, 386], [387, 493], [494, 649], [650, 721], [722, 809], [810, 905], [906, 1025]];
export const genOf = (n) => GENS.findIndex(([a, b]) => n >= a && n <= b) + 1;
/** Joker names that aren't `<species>` / `mega_<species>` / `<region>_<species>` / `<species>_<form>`. */
const JOKER_ALIASES = { rotomh: 'rotom', rotomw: 'rotom', rotomf: 'rotom', rotomfan: 'rotom', rotomm: 'rotom', gimmighoulr: 'gimmighoul', taurosh: 'tauros' };
/** Jokers named after a species that are not that species' joker (an item / joke card). */
const NOT_A_SPECIES = new Set(['rotomdex', 'miror_budicolo']);

/**
 * Every canonical evolution as "child:parent" dex pairs (Pokemon Showdown data/pokedex.ts `prevo`, base species, dex <= 1025).
 * The overworld's species_extra.json evos miss 32 of them (move / friendship / trade / regional-form evolutions: Mr. Mime,
 * Sylveon, Kingambit, Sirfetch'd, the Hisuian ones...), so the lines come from here.
 */
const PREVO = '2:1 3:2 5:4 6:5 8:7 9:8 11:10 12:11 14:13 15:14 17:16 18:17 20:19 22:21 24:23 25:172 26:25 28:27 30:29 31:30 ' +
  '33:32 34:33 35:173 36:35 38:37 39:174 40:39 42:41 44:43 45:44 47:46 49:48 51:50 53:52 55:54 57:56 59:58 61:60 ' +
  '62:61 64:63 65:64 67:66 68:67 70:69 71:70 73:72 75:74 76:75 78:77 80:79 82:81 85:84 87:86 89:88 91:90 93:92 ' +
  '94:93 97:96 99:98 101:100 103:102 105:104 106:236 107:236 110:109 112:111 113:440 117:116 119:118 121:120 ' +
  '122:439 124:238 125:239 126:240 130:129 134:133 135:133 136:133 139:138 141:140 143:446 148:147 149:148 ' +
  '153:152 154:153 156:155 157:156 159:158 160:159 162:161 164:163 166:165 168:167 169:42 171:170 176:175 178:177 ' +
  '180:179 181:180 182:44 183:298 184:183 185:438 186:61 188:187 189:188 192:191 195:194 196:133 197:133 199:79 ' +
  '202:360 205:204 208:95 210:209 212:123 217:216 219:218 221:220 224:223 226:458 229:228 230:117 232:231 233:137 ' +
  '237:236 242:113 247:246 248:247 253:252 254:253 256:255 257:256 259:258 260:259 262:261 264:263 266:265 ' +
  '267:266 268:265 269:268 271:270 272:271 274:273 275:274 277:276 279:278 281:280 282:281 284:283 286:285 ' +
  '288:287 289:288 291:290 292:290 294:293 295:294 297:296 301:300 305:304 306:305 308:307 310:309 315:406 ' +
  '317:316 319:318 321:320 323:322 326:325 329:328 330:329 332:331 334:333 340:339 342:341 344:343 346:345 ' +
  '348:347 350:349 354:353 356:355 358:433 362:361 364:363 365:364 367:366 368:366 372:371 373:372 375:374 ' +
  '376:375 388:387 389:388 391:390 392:391 394:393 395:394 397:396 398:397 400:399 402:401 404:403 405:404 ' +
  '407:315 409:408 411:410 413:412 414:412 416:415 419:418 421:420 423:422 424:190 426:425 428:427 429:200 ' +
  '430:198 432:431 435:434 437:436 444:443 445:444 448:447 450:449 452:451 454:453 457:456 460:459 461:215 462:82 ' +
  '463:108 464:112 465:114 466:125 467:126 468:176 469:193 470:133 471:133 472:207 473:221 474:233 475:281 ' +
  '476:299 477:356 478:361 496:495 497:496 499:498 500:499 502:501 503:502 505:504 507:506 508:507 510:509 ' +
  '512:511 514:513 516:515 518:517 520:519 521:520 523:522 525:524 526:525 528:527 530:529 533:532 534:533 ' +
  '536:535 537:536 541:540 542:541 544:543 545:544 547:546 549:548 552:551 553:552 555:554 558:557 560:559 ' +
  '563:562 565:564 567:566 569:568 571:570 573:572 575:574 576:575 578:577 579:578 581:580 583:582 584:583 ' +
  '586:585 589:588 591:590 593:592 596:595 598:597 600:599 601:600 603:602 604:603 606:605 608:607 609:608 ' +
  '611:610 612:611 614:613 617:616 620:619 623:622 625:624 628:627 630:629 634:633 635:634 637:636 651:650 ' +
  '652:651 654:653 655:654 657:656 658:657 660:659 662:661 663:662 665:664 666:665 668:667 670:669 671:670 ' +
  '673:672 675:674 678:677 680:679 681:680 683:682 685:684 687:686 689:688 691:690 693:692 695:694 697:696 ' +
  '699:698 700:133 705:704 706:705 709:708 711:710 713:712 715:714 723:722 724:723 726:725 727:726 729:728 ' +
  '730:729 732:731 733:732 735:734 737:736 738:737 740:739 743:742 745:744 748:747 750:749 752:751 754:753 ' +
  '756:755 758:757 760:759 762:761 763:762 768:767 770:769 773:772 783:782 784:783 790:789 791:790 792:790 ' +
  '804:803 811:810 812:811 814:813 815:814 817:816 818:817 820:819 822:821 823:822 825:824 826:825 828:827 ' +
  '830:829 832:831 834:833 836:835 838:837 839:838 841:840 842:840 844:843 847:846 849:848 851:850 853:852 ' +
  '855:854 857:856 858:857 860:859 861:860 862:264 863:52 864:222 865:83 866:122 867:562 869:868 873:872 879:878 ' +
  '886:885 887:886 892:891 899:234 900:123 901:217 902:550 903:215 904:211 907:906 908:907 910:909 911:910 ' +
  '913:912 914:913 916:915 918:917 920:919 922:921 923:922 925:924 927:926 929:928 930:929 933:932 934:933 ' +
  '936:935 937:935 939:938 941:940 943:942 945:944 947:946 949:948 952:951 954:953 956:955 958:957 959:958 ' +
  '961:960 964:963 966:965 970:969 972:971 975:974 979:57 980:194 981:203 982:206 983:625 997:996 998:997 ' +
  '1000:999 1011:840 1013:1012 1018:884 1019:1011';
export const PARENT = new Map(PREVO.split(' ').map((p) => p.split(':').map(Number)));

// ---- data --------------------------------------------------------------------------------------------------------------
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
let cache = null;

/** Every registered joker of the three mods: {key, name, mod, ptype, stage, rarity, cost, atlas, pos}. */
export async function loadModJokers() {
  globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() { }, removeItem() { } };
  const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
  const core = await imp('micatro/js/engine/core.js');
  const IDX = await imp('micatro/js/mods/index.js');
  const REG = await imp('micatro/js/mods/registry.js');
  await IDX.loadMods(MODS);
  REG.activateMods(MODS);
  return Object.values(core.P_CENTERS)
    .filter((c) => c && c.set === 'Joker' && MODS.includes(c.mod))
    .map((c) => ({ key: c.key, name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, rarity: c.rarity, cost: c.cost, atlas: c.atlas, pos: c.pos ? { x: c.pos.x, y: c.pos.y } : null }));
}

/** The canonical species: dex -> {dex, key, name, types, sprite}; the base key of a dex number is its shortest key. */
export function loadSpecies(dataDir = path.join(ROOT, 'overworld/data')) {
  const SI = readJSON(path.join(dataDir, 'species_index.json'));
  const SB = readJSON(path.join(dataDir, 'species_battle.json'));
  const byDex = new Map(), numOfKey = {};
  for (const [k, v] of Object.entries(SI)) {
    if (!(v.num >= 1 && v.num <= 1025)) continue;
    numOfKey[k] = v.num;
    const cur = byDex.get(v.num);
    if (!cur || k.length < cur.key.length || (k.length === cur.key.length && k < cur.key)) byDex.set(v.num, { dex: v.num, key: k });
  }
  for (const s of byDex.values()) {
    const i = SI[s.key], b = SB[s.key] || {};
    // (some names carry a literal "́" / "’" escape: Flabébé, Sirfetch'd)
    s.name = String(b.name || i.name).replace(/\\u([0-9a-fA-F]{4})/g, (m, hx) => String.fromCharCode(parseInt(hx, 16))).normalize('NFC').replace(/[‘’]/g, "'");
    s.types = b.types || [];
    s.sprite = i.sprite;
  }
  // the evolution graph on dex numbers (PARENT above)
  const parent = new Map(), kids = new Map();
  for (const [to, from] of PARENT) {
    parent.set(to, from);
    if (!kids.has(from)) kids.set(from, new Set());
    kids.get(from).add(to);
  }
  return { byDex, numOfKey, parent, kids };
}

/** A joker's species dex number, or null (an item / trainer / joke joker). */
export function speciesOfJoker(name, numOfKey) {
  let n = String(name || '').toLowerCase();
  if (NOT_A_SPECIES.has(n)) return null;
  n = JOKER_ALIASES[n] || n;
  n = n.replace(/^mega_/, '').replace(/^(hisuian|galarian|alolan|paldean)_/, '');
  const tries = [n, n.replace(/_/g, '')];
  let m = n;
  while (m.includes('_')) { m = m.slice(0, m.lastIndexOf('_')); tries.push(m, m.replace(/_/g, '')); }
  for (const t of tries) if (numOfKey[t]) return numOfKey[t];
  return null;
}

/** Root of a species' family, its whole line in evolution order, and its stage by upstream's rules. */
function lineOf(dex, sp) {
  let root = dex;
  for (let i = 0; i < 6 && sp.parent.has(root); i++) root = sp.parent.get(root);
  const line = [], depth = new Map();
  const walk = (n, d) => { if (depth.has(n)) return; depth.set(n, d); line.push(n); for (const c of [...(sp.kids.get(n) || [])].sort((a, b) => a - b)) walk(c, d + 1); };
  walk(root, 0);
  // stages skip babies: Pichu is Baby, Pikachu Basic, Raichu Stage 1
  const nb = (n) => { let d = 0, x = n; while (sp.parent.has(x)) { x = sp.parent.get(x); if (!BABIES.has(x)) d++; } return d; };
  const lineDepth = Math.max(...line.filter((n) => !BABIES.has(n)).map(nb), 0) + 1;
  return { root, line, stageDepth: nb(dex), lineDepth };
}
export function stageOf(dex, sp) {
  if (LEGENDARY.has(dex)) return 'Legendary';
  if (BABIES.has(dex)) return 'Baby';
  return ['Basic', 'One', 'Two'][Math.min(2, lineOf(dex, sp).stageDepth)];
}

/**
 * Coverage of the dex by the mods, and the missing species with their proposed joker:
 * { jokers, coverage: {mod: Set(dex)}, covered: Set, missing: [{dex, key, name, gen, types, ptype, stage, rarity, cost, line}],
 *   rarityTable, typeVotes }
 */
export async function computeMissing(opts = {}) {
  if (cache && !opts.fresh) return cache;
  const sp = loadSpecies(opts.dataDir);
  const jokers = opts.jokers || await loadModJokers();
  const coverage = Object.fromEntries(MODS.map((m) => [m, new Set()]));
  const jokerOfDex = new Map();
  for (const j of jokers) {
    const dex = speciesOfJoker(j.name, sp.numOfKey);
    if (!dex) continue;
    j.dex = dex;
    coverage[j.mod].add(dex);
    // the species' own card (not a Mega / form) is the one a missing relative is styled after
    const own = sp.byDex.get(dex)?.key === j.name || sp.byDex.get(dex)?.key === String(j.name).replace(/_/g, '');
    if (!jokerOfDex.has(dex) || (own && !jokerOfDex.get(dex).own)) jokerOfDex.set(dex, { ...j, own });
  }
  const covered = new Set(MODS.flatMap((m) => [...coverage[m]]));
  // upstream's rarity / cost per (stage, how many non-baby stages the line has): the most common choice
  const buckets = {};
  const typeVotes = {};
  for (const j of jokers) {
    if (!j.dex || !['Basic', 'One', 'Two', 'Baby', 'Legendary'].includes(j.stage)) continue;
    const s = sp.byDex.get(j.dex);
    if (s && s.types[0]) { const t = s.types[0]; (typeVotes[t] = typeVotes[t] || {})[j.ptype] = (typeVotes[t][j.ptype] || 0) + 1; }
    if (sp.byDex.get(j.dex)?.key !== j.name && sp.byDex.get(j.dex)?.key !== String(j.name).replace(/_/g, '')) continue; // forms don't vote
    const b = bucketOf(j.stage, j.dex, sp);
    (buckets[b] = buckets[b] || []).push(j);
  }
  const mode = (arr) => { const m = new Map(); let best = null, bc = 0; for (const v of arr) { const c = (m.get(v) || 0) + 1; m.set(v, c); if (c > bc) { bc = c; best = v; } } return best; };
  const rarityTable = {};
  for (const [b, js] of Object.entries(buckets)) {
    const cost = js.map((j) => j.cost).filter(Number.isFinite).sort((a, b2) => a - b2);
    rarityTable[b] = { rarity: mode(js.map((j) => String(j.rarity))), cost: cost.length ? cost[cost.length >> 1] : null, n: js.length };
  }
  const missing = [];
  for (let dex = 1; dex <= 1025; dex++) {
    if (covered.has(dex)) continue;
    const s = sp.byDex.get(dex);
    if (!s) throw new Error('no species for dex ' + dex + ' in overworld/data/species_index.json');
    const stage = stageOf(dex, sp);
    const L = lineOf(dex, sp);
    const guess = rarityTable[bucketOf(stage, dex, sp)] || rarityTable[stage + '/any'] || { rarity: stage === 'Legendary' ? '4' : '2', cost: null };
    const rarity = /^\d+$/.test(guess.rarity) ? +guess.rarity : guess.rarity;
    missing.push({
      dex, key: s.key, name: s.name, gen: genOf(dex), types: s.types, ptype: ptypeOf(s.types), stage, stageLabel: STAGE_LABEL[stage],
      rarity, rarityLabel: RARITY_LABEL[rarity] || String(rarity), cost: guess.cost,
      line: L.line.map((n) => ({ dex: n, name: sp.byDex.get(n)?.name || '#' + n, joker: covered.has(n) ? (jokerOfDex.get(n)?.key || null) : null })),
      sprite: s.sprite,
    });
  }
  cache = { species: sp, jokers, jokerOfDex, coverage, covered, missing, rarityTable, typeVotes };
  return cache;
}
function bucketOf(stage, dex, sp) {
  if (stage === 'Legendary' || stage === 'Baby') return stage;
  return stage + '/' + lineOf(dex, sp).lineDepth;
}
