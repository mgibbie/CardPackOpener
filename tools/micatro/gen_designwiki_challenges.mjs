// gen_designwiki_challenges.mjs — a challenge as the design wiki lists it, from the engine's own
// challengeInfo() (the Challenges screen's Rules / Restrictions / Deck): Balatro's 20
// (gen_designwiki.mjs -> micatro.json) and every mod's (gen_designwiki_mods.mjs).
//   {key, name, art: [the deck it plays on: the Challenge Deck, or its own back], lines: [rule lines, Balatro markup], info: [{name, lines}], pills?}
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const CH = await import(pathToFileURL(path.join(ROOT, 'micatro/js/engine/challenge.js')).href);
const { describeCenter } = await import(pathToFileURL(path.join(ROOT, 'micatro/js/engine/describe.js')).href);
const { P_CENTERS } = await import(pathToFileURL(path.join(ROOT, 'micatro/js/engine/core.js')).href);
/** A back's art layers: Balatro's Enhancers atlas (the Challenge Deck is its maze back, b_challenge). */
const vanillaBackArt = (key) => { const c = P_CENTERS[key] || P_CENTERS[CH.CHALLENGE_BACK]; return c && c.pos && !c.atlas ? [['centers', { x: c.pos.x || 0, y: c.pos.y || 0 }]] : null; };

const plain = (s) => String(s == null ? '' : s).replace(/\{[^}]*\}/g, '').trim();
const ED = { foil: 'Foil', holo: 'Holographic', polychrome: 'Polychrome', negative: 'Negative' };
/** "Egg ×5, Joker (Eternal)" — repeated cards counted, not listed again. */
function cardList(cards) {
  const out = new Map();
  for (const c of cards) {
    const tags = [c.edition && (ED[c.edition] || c.edition), c.eternal && 'Eternal', c.pinned && 'Pinned'].filter(Boolean);
    const label = plain(c.name) + (tags.length ? ' (' + tags.join(', ') + ')' : '');
    out.set(label, (out.get(label) || 0) + 1);
  }
  return [...out].map(([l, n]) => (n > 1 ? l + ' ×' + n : l)).join(', ');
}

/** One challenge (raw, as data/challenges.js or a mod's challenges list has it) -> a wiki item. */
export function challengeItem(raw, modId = null, modName = (id) => id, backArt = vanillaBackArt) {
  const ch = CH.normalize(raw, modId);
  const i = CH.challengeInfo(ch);
  const lines = [...i.rules, ...i.modifiers].map(String).filter((l) => l.trim());
  const info = [];
  const starts = [['Jokers', i.jokers], ['Consumables', i.consumables], ['Vouchers', i.vouchers]].filter(([, l]) => l.length).map(([k, l]) => k + ': ' + cardList(l));
  if (starts.length) info.push({ name: 'Starts with', lines: starts });
  const bans = [];
  if (i.banned_cards.length) bans.push('Cards: ' + cardList(i.banned_cards));
  if (i.banned_tags.length) bans.push('Tags: ' + i.banned_tags.map((t) => plain(t.name)).join(', '));
  if (i.banned_other.length) bans.push('Blinds: ' + i.banned_other.map((t) => plain(t.name)).join(', '));
  if (bans.length) info.push({ name: 'Banned', lines: bans });
  const back = i.deck.back && i.deck.back !== CH.CHALLENGE_BACK ? plain((describeCenter(i.deck.back) || {}).name || i.deck.back) : 'Challenge Deck';
  info.push({ name: 'Deck', lines: [back + ' · ' + i.deck.lines.join(' · ')] });
  const req = ch.requires.filter((r) => r !== modId);
  return {
    key: ch.id, name: plain(ch.name) || ch.id, art: backArt(i.deck.back || CH.CHALLENGE_BACK) || vanillaBackArt(CH.CHALLENGE_BACK), lines: lines.length ? lines : ['No special rules (see the deck and starting cards).'], info,
    ...(req.length ? { pills: [{ text: 'Needs ' + req.map(modName).join(' + ') }] } : {}),
    ...(ch.button_colour ? { colour: ch.button_colour } : {}),
  };
}
export const VANILLA_CHALLENGES = CH.VANILLA_CHALLENGES;
