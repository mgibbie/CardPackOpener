"""Build the Battlecards design-work section for the design wiki: every card
name we hold that has NO working design yet, plus the undefined keywords and
open rules questions. Self-contained: reads bundled sources from tools/data/
and the live pool from battlecards/cards.json; writes designwiki/data/
battlecards.json. (Moved out of the abandoned Magepunk66 Love2D repo.)"""
import importlib.util
import io
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))   # CardPackOpener/tools
WEB = os.path.dirname(HERE)                          # CardPackOpener
ROOT = WEB
DATA = os.path.join(HERE, "data")                   # bundled design-source data

game = json.load(open(os.path.join(WEB, "battlecards", "cards.json"), encoding="utf-8"))
pool_ids = {c["id"] for c in game["cards"]}
slug = lambda n: re.sub(r"[^a-z0-9]+", "_", n.lower()).strip("_")

out = {"generated": "run tools/gen_battlecards_design.py to refresh", "sections": []}


def section(key, title, blurb, items):
    out["sections"].append({"key": key, "title": title, "blurb": blurb,
                            "count": len(items), "items": items})


# ---- 1. keywords with no definition / pending redesign ----
section("keywords", "Keywords Needing Definitions",
        "Mechanics referenced on cards that have no ruling yet. Each needs a "
        "designer definition before its cards can work.",
        [{"name": k, "note": n} for k, n in [
            ("Excavate", "paper keyword (W boost table 'Connect: Excavate')"),
            ("Planeshift", "paper keyword (G boost table 'Deathrattle: Planeshift')"),
            ("Harvest", "paper keyword"),
            ("Firebreathing", "paper keyword"),
            ("Bash", "paper keyword"),
            ("Regenerate", "paper keyword"),
            ("Static", "paper keyword (Abzan Fortification is 'Wall Defender Static')"),
            ("Ponder", "paper keyword"),
            ("Cascade", "paper keyword"),
            ("Sadist", "paper keyword (Deathbringer Saurfang)"),
            ("Elite", "paper keyword (Deathbringer Saurfang)"),
            ("Dredge", "paper keyword (Inspire: Dredge)"),
            ("Advance", "paper keyword (Swing: Advance)"),
            ("Flying", "MTG keyword — needs a Magepunk redesign (31+ WUBRG cards wait on it)"),
            ("Reach", "MTG keyword — needs a Magepunk redesign"),
            ("Vigilance", "MTG keyword — needs a Magepunk redesign"),
            ("Protection", "MTG keyword — needs a Magepunk redesign"),
            ("Rune costs", "Death Knight cards print '( Runes: (R)(U)(G) )' — no rune system exists"),
        ]])

# ---- 2. paper cards that still don't work (OCR names not in the pool) ----
paper_pending = []
ocr_path = os.path.join(DATA, "all_cards.json")
ocr = json.load(open(ocr_path, encoding="utf-8"))
ocr_cards = ocr if isinstance(ocr, list) else list(ocr.values())
for card in ocr_cards:
    name = (card.get("name") or "").strip()
    if name and slug(name) not in pool_ids:
        paper_pending.append({"name": name})
paper_pending = sorted({p["name"]: p for p in paper_pending}.values(), key=lambda x: x["name"])
section("paper", "Paper Cards Awaiting Mechanics",
        "Scanned paper cards whose rules text doesn't convert yet — they need "
        "either an importer pattern or a design decision.", paper_pending)

# ---- 3. WUBRG cards ----
wa = json.load(open(os.path.join(DATA, "wubrg_assessment.json"), encoding="utf-8"))
redesign, hard = [], []
for color, rows in wa.items():
    for r in rows:
        if slug(r["name"]) in pool_ids:
            continue
        item = {"name": r["name"], "note": f"{color.title()} {r.get('cost', '?')} — {r['why']}"}
        (redesign if r["verdict"] == "REDESIGN" else hard if r["verdict"] == "HARD" else []).append(item)
section("wubrg_redesign", "WUBRG — Blocked on Keyword Redesigns",
        "Planned colored cards that lean on flying / reach / vigilance / "
        "protection. Deciding those keywords unlocks all of these.", redesign)
section("wubrg_hard", "WUBRG — Needs Engine Work or Redesign",
        "Planned colored cards whose MTG text doesn't map onto current "
        "mechanics (per-card reason attached).", hard)

# ---- 4. Planned Card Dex custom names (god/guild pools etc.) ----
dex = open(os.path.join(DATA, "planned_card_dex.txt"), encoding="utf-8", errors="replace").read()
custom = []
for m in re.finditer(r"^\d+\. ([A-Z][\w' ]+?) \d+ \((.+?)\)\s*$", dex, re.M):
    group, name = m.group(1), m.group(2)
    if group in ("White", "Blue", "Black", "Red", "Green"):
        continue
    if slug(name) not in pool_ids:
        custom.append({"name": name, "note": f"{group} pool"})
custom = sorted({c["name"]: c for c in custom}.values(), key=lambda x: (x["note"], x["name"]))
section("dex_pools", "Advanced-Land Theme Pools (Planned Card Dex)",
        "God / guild / praetor pool cards named in the dex but not designed — "
        "these feed each advanced land's 'Discover a themed card' tap.", custom)

# ---- 5. classes with no card lists at all ----
empty = []
for f in sorted(os.listdir(os.path.join(DATA, "cards"))):
    p = os.path.join(DATA, "cards", f)
    if f.endswith(".txt") and os.path.getsize(p) == 0:
        empty.append({"name": f[:-4], "note": "class card list is an empty file"})
section("empty_classes", "Classes With No Card List",
        "Planned classes whose card files are empty placeholders — each needs "
        "a full card set designed.", empty)

# ---- 6. open items ----
section("open_items", "Open Design Items", "Assorted pending decisions.", [
    {"name": "Fireball (Needs New Name)", "note": "Red dex slot — the X-damage burn spell awaits its Magepunk name"},
    {"name": "Locations (more content)", "note": "25 HS locations are in (set hsloc); 24 more are blocked on HS systems (Corpses, Relics, Choose One, Past/Advance, next-card modifiers) — design Magepunk-original locations instead?"},
    {"name": "Wastes in the land shop", "note": "colorless basic to be added once its identity rules are set"},
    {"name": "Western lands vs color identity", "note": "Gold Vein / Boomtown Claim / Crossroads Station / Hallowed Springs are colorless and currently outside the land shop"},
    {"name": "Multi-trigger cards", "note": "cards with two ongoing triggers (Hungry Turtle, Gurubashi Offering) skip — engine supports one"},
])

# ---- 7. every unimplemented Hearthstone card, by game mode ----
# constructed collectibles not yet imported, then the solo-adventure /
# Duels / Battlegrounds / Mercenaries card pools (never imported at all)
_hs_path = os.path.join(DATA, "hs_cards_full.json")
hs_dump = json.load(open(_hs_path, encoding="utf-8")) if os.path.exists(_hs_path) else []
if not hs_dump:
    print("note: tools/data/hs_cards_full.json absent - Hearthstone backlog sections will be empty")
SKIP_SETS = {"HERO_SKINS", "PLACEHOLDER_202204", "CREDITS", "VANILLA"}
PLAYABLE = {"MINION", "SPELL", "WEAPON", "LOCATION", "HERO", "HERO_POWER"}


def hs_text(c, cap=110):
    t = re.sub(r"</?[^>]+>", "", c.get("text") or "")
    t = t.replace("[x]", "").replace("\n", " ").replace("$", "").replace("#", "")
    t = re.sub(r"\s+", " ", t).strip()
    return (t[:cap] + "…") if len(t) > cap else t


def set_name(c):
    return (c.get("set") or "?").replace("_", " ").title()


def num_rank(name):
    m = re.search(r"\s+(\d+)$", name)
    return int(m.group(1)) if m else 0


def hs_items(cards, note_fn, key_fn=lambda c: slug(c.get("name") or ""), presorted=False):
    """Dedupe by key (first wins), skip pool-implemented names, sort by name."""
    seen, items = {}, []
    if not presorted:
        cards = sorted(cards, key=lambda c: (c.get("name") or "", c.get("id") or ""))
    for c in cards:
        name = (c.get("name") or "").strip()
        k = key_fn(c)
        if not name or not k or k in pool_ids or k in seen:
            continue
        seen[k] = True
        items.append({"name": name, "note": note_fn(c).rstrip(" —").strip()})
    return items


is_duels = lambda c: "PVPDR" in (c.get("id") or "")

constructed = hs_items(
    [c for c in hs_dump if c.get("collectible") and c.get("type") in PLAYABLE
     and c.get("type") != "HERO_POWER"
     and c.get("set") not in SKIP_SETS | {"BATTLEGROUNDS", "LETTUCE"} and not is_duels(c)],
    lambda c: f"{c.get('cost', '?')} {(c.get('cardClass') or 'NEUTRAL').title()} "
              f"{c['type'].lower()} — {hs_text(c) or '(vanilla)'}")
section("hs_constructed", "Hearthstone — Unimported Collectibles",
        "Every collectible constructed card the importers don't convert yet — "
        "each needs a grammar pattern, an engine mechanic, or a redesign.", constructed)

taken = {slug(i["name"]) for i in constructed}
solo = hs_items(
    [c for c in hs_dump if not c.get("collectible") and c.get("type") in PLAYABLE
     and c.get("set") not in SKIP_SETS | {"BATTLEGROUNDS", "LETTUCE", "PET"}
     and not is_duels(c)],
    lambda c: f"{set_name(c)} {c['type'].replace('_', ' ').lower()} — {hs_text(c) or '(vanilla)'}")
solo = [i for i in solo if slug(i["name"]) not in taken]
section("hs_solo", "Hearthstone — Single-Player, Adventures & Tokens",
        "Non-collectible cards from every solo mode (Dungeon Run, Monster Hunt, "
        "Dalaran Heist, Tombs of Terror, Galakrond's Awakening, …): bosses, boss "
        "powers, treasures, and the tokens cards create.", solo)

section("hs_duels", "Hearthstone — Duels",
        "Duels-mode heroes, hero powers, and treasure pools (PVPDR).",
        hs_items([c for c in hs_dump if is_duels(c) and c.get("type") in PLAYABLE],
                 lambda c: f"Duels {c['type'].replace('_', ' ').lower()} — {hs_text(c)}"))


def bg_note(c):
    t = c.get("type")
    if t == "MINION":
        tier = f"Tier {c['techLevel']} " if c.get("techLevel") else ""
        return f"BG {tier}minion — {hs_text(c) or '(vanilla)'}"
    label = {"HERO": "BG hero", "HERO_POWER": "BG hero power",
             "BATTLEGROUND_TRINKET": "BG trinket", "BATTLEGROUND_SPELL": "BG tavern spell",
             "BATTLEGROUND_ANOMALY": "BG anomaly", "BATTLEGROUND_QUEST_REWARD": "BG quest reward",
             "BATTLEGROUND_HERO_BUDDY": "BG buddy", "SPELL": "BG spell"}.get(t, "BG " + t.lower())
    return f"{label} — {hs_text(c)}"


section("hs_battlegrounds", "Hearthstone — Battlegrounds",
        "The Battlegrounds pool: heroes, hero powers, tavern minions (goldens "
        "deduped), tavern spells, trinkets, anomalies, buddies, quest rewards.",
        hs_items([c for c in hs_dump if c.get("set") == "BATTLEGROUNDS"
                  and c.get("type") not in ("ENCHANTMENT", "GAME_MODE_BUTTON",
                                            "MOVE_MINION_HOVER_TARGET", None)],
                 bg_note))


MERC_ROLES = {1: "Caster", 2: "Fighter", 3: "Protector"}


def merc_base(name):
    # "Fireball 3" and templated "Fireball {0}" are ranks of one ability
    return re.sub(r"\s+(\{\d\}|\d+)$", "", name or "").strip()


def merc_note(c):
    if c.get("type") == "MINION":
        role = MERC_ROLES.get(c.get("mercenariesRole"))
        return f"Mercenary{' (' + role + ')' if role else ''} — {hs_text(c) or 'unit'}"
    label = "Merc ability" if c.get("type") == "LETTUCE_ABILITY" else "Merc " + (c.get("type") or "?").lower()
    return f"{label} — {hs_text(c)}"


# ability ranks collapse to one entry, keeping the highest concrete rank
# (untemplated "{0}" rank entries sort last)
merc_key = lambda c: slug(merc_base(c.get("name")))
merc_cards = [dict(c, name=merc_base(c.get("name")), _rank=num_rank(c.get("name") or ""))
              for c in hs_dump if c.get("set") == "LETTUCE"
              and c.get("type") in ("MINION", "SPELL", "LETTUCE_ABILITY")]
merc_cards.sort(key=lambda c: (c["name"], -c["_rank"]))
section("hs_mercenaries", "Hearthstone — Mercenaries",
        "Mercenaries mode: every merc (skins deduped), their abilities "
        "(rank-collapsed, top rank shown), and mode spells.",
        hs_items(merc_cards, merc_note, key_fn=merc_key, presorted=True))

# ---- Plane candidates: MTG Planechase planes that map to the Arrival/Static/
# Chaos/Departure format but aren't built yet. Notes are our proposed in-game
# adaptation (not oracle text); art lives at battlecards/art/plane_<slug>.jpg.
# Planes already in the pool are skipped automatically. To add a candidate,
# append (Name, note) and drop a plane_<slug>.jpg into battlecards/art/.
PLANE_CANDIDATES = [
    ("Turri Island", "Static: Your creature cards cost 1 less. Chaos: Draw the top 3 creatures from your deck."),
    ("Undercity Reaches", "Static: When your creature damages the enemy hero, draw a card. Chaos: You have no maximum hand size."),
    ("The Dark Barony", "Static: Whenever a card hits a graveyard, its owner loses 1 Life. Chaos: Each opponent discards a card."),
    ("Naya", "Static: You may buy an extra land each turn. Chaos: A creature gains +1/+1 for each land you control."),
    ("Onakke Catacomb", "Static: All creatures have Deathtouch. Chaos: Your creatures gain +1 Attack this turn."),
    ("Gavony", "Static: Your creatures have Taunt. Chaos: Your creatures gain Divine Shield this turn."),
    ("Goldmeadow", "Static: When you play a land, summon three 0/1 Goats. Chaos: Summon a 0/1 Goat."),
    ("Tember City", "Static: Whenever a player taps a land, deal 1 damage to them. Chaos: Each opponent sacrifices a creature."),
    ("Nephalia", "Static: At the end of your turn, mill 2, then return a random card from your graveyard. Chaos: Return a card from your graveyard to your hand."),
    ("Prahv", "Static: If you cast a spell this turn you can't attack; if you attacked you can't cast. Chaos: Gain Life equal to the cards in your hand."),
    ("Astral Arena", "Static: Only one creature may attack each turn. Chaos: Deal 2 damage to all creatures."),
    ("Horizon Boughs", "Static: All lands and creatures untap each turn. Chaos: Gain 3 lands."),
    ("The Eon Fog", "Static: Lands and creatures do not untap. Chaos: Untap all your permanents."),
    ("The Fourth Sphere", "Static: At the start of your turn, sacrifice a creature. Chaos: Summon a 2/2."),
    ("Mirrored Depths", "Static: Whenever a player casts a spell, they flip a coin; on a loss it is countered. Chaos: Cast the top card of your deck for free."),
]
# planes with real mechanics that need engine work / reworks before they fit
PLANE_REWORK = [
    ('Esper', 'Needs rework (colour-matters): Static — artifact spells cost 1 less. Chaos — your W/U/B creatures become artifacts.'),
    ('Tazeem', "Needs rework (no blocking here): Static — creatures can't block. Chaos — draw a card for each land you control."),
    ('Isle of Vesuva', 'Needs copy-on-summon: Static — when a creature enters, summon a copy of it. Chaos — destroy a creature and all others with its name.'),
    ('Selesnya Loft Gardens', 'Needs token/counter doubling: Static — tokens are made in double. Chaos — your lands add extra mana this turn.'),
    ('Academy at Tolaria West', 'Static — at end of turn, if your hand is empty, draw 7. Chaos — discard your hand. (needs empty-hand check)'),
    ('The Great Forest', 'Needs combat rework: Static — creatures deal damage equal to Health. Chaos — your creatures gain +0/+2 and Trample.'),
    ('Velis Vel', 'Needs tribal-count support: Static — each creature +1/+1 per other creature sharing a tribe. Chaos — a creature gains every tribe.'),
    ('Kessig', 'Needs Werewolf tribe: Static — non-Werewolves deal no combat damage. Chaos — your creatures become +2/+2 Werewolves with Trample.'),
    ('Sea of Sand', "Needs draw-reveal: Static — gain 3 Life when you draw a land. Chaos — put a permanent on top of its owner's deck."),
    ('Windriddle Palaces', 'Needs play-from-top: Static — top card of decks revealed; play off the planar deck. Chaos — each player mills a card.'),
    ('Stairs to Infinity', 'Needs planar-deck hooks: Static — no max hand size; draw when you roll the planar die. Chaos — peek at the planar deck.'),
    ('Glimmervoid Basin', 'Needs spell-copy: Static — single-target spells copy for each other creature. Chaos — everyone else copies a chosen creature.'),
    ('Skybreen', 'Needs open-hand: Static — top card revealed; matching-type spells cost more. Chaos — target player loses Life equal to their hand size.'),
    ('Agyrem', "Needs colour recursion: Static — white creatures that die return; nonwhite return to hand. Chaos — creatures can't attack you until someone planeswalks."),
    ('Truga Jungle', 'Needs mana-fixing: Static — your lands tap for any type. Chaos — reveal the top 3 cards and take the lands.'),
    ('Llanowar', 'Needs mana ramp: Static — your creatures tap for extra mana. Chaos — untap all your creatures.'),
    ('The Zephyr Maze', 'Needs Flying keyword: Static — fliers +2/+0, non-fliers -2/-0. Chaos — a creature gains Flying.'),
    ('Glen Elendra', 'Needs control-swap: Static — swap a creature that dealt combat damage this turn. Chaos — take back control of a creature you own.'),
]
_art_dir = os.path.join(WEB, "battlecards", "art")


def _plane_items(pairs):
    items = []
    for name, note in pairs:
        if slug(name) in pool_ids:
            continue  # already built into the pool
        art = "plane_" + slug(name)
        item = {"name": name, "note": note}
        if os.path.exists(os.path.join(_art_dir, art + ".jpg")):
            item["art"] = art
        items.append(item)
    return items


section("plane_candidates", "Plane Candidates (unbuilt)",
        "MTG Planechase planes that map to the Arrival/Static/Chaos/Departure "
        "format but aren't built yet. Rules shown are the proposed in-game "
        "adaptation; click for art. (8 more — Krosa, Sokenzan, The "
        "Hippodrome, Stronghold Furnace, Lethe Lake, Takenuma, Fields of "
        "Summer, Minamo — are already in the pool.)",
        _plane_items(PLANE_CANDIDATES))
section("plane_rework", "Planes Needing Rework",
        "Planes with real gameplay hooks that would need new engine work or a "
        "rework to fit (blocking, flying, mana colours, the planar deck, "
        "counters, spell-copy, etc.). Notes flag what each needs.",
        _plane_items(PLANE_REWORK))

out["totals"] = {s["key"]: s["count"] for s in out["sections"]}
dest = os.path.join(WEB, "designwiki", "data", "battlecards.json")
json.dump(out, open(dest, "w", encoding="utf-8"), separators=(",", ":"))
print("wrote", dest)
for s in out["sections"]:
    print(f"  {s['count']:>4}  {s['title']}")
