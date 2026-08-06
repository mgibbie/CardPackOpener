#!/usr/bin/env python3
"""Audit Battlecards art, source missing Hearthstone art from hearthstone.wiki.gg,
and crop solid black/white side bars without inventing replacement artwork."""
from __future__ import annotations
import argparse, io, json, re, time, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image, ImageStat

WIKI = "https://hearthstone.wiki.gg"
UA = "CardPackOpener-art-audit/1.0 (https://github.com/mgibbie/CardPackOpener)"
EXCLUDED_SETS = {"paper", "magepunk"}

def request_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)

def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*"})
    with urllib.request.urlopen(req, timeout=45) as response:
        data = response.read()
        if not response.headers.get_content_type().startswith("image/"):
            raise ValueError("not an image")
        return data

def wiki_image_url(name):
    params = urllib.parse.urlencode({"action": "query", "format": "json", "formatversion": 2,
        "prop": "images", "imlimit": "max", "redirects": 1, "titles": name})
    pages = request_json(f"{WIKI}/api.php?{params}").get("query", {}).get("pages", [])
    images = pages[0].get("images", []) if pages else []
    normalized = re.sub(r"[^a-z0-9]+", "", name.lower())
    def rank(title):
        filename = title.removeprefix("File:")
        stem = re.sub(r"[^a-z0-9]+", "", filename.lower())
        return (0 if stem.startswith(normalized) and "full" in filename.lower() else
                1 if stem.startswith(normalized) and " art." in filename.lower() else
                2 if "full" in filename.lower() else 3 if " art." in filename.lower() else 9)
    for title in sorted((item["title"] for item in images), key=rank):
        if rank(title) >= 9:
            continue
        query = urllib.parse.urlencode({"action": "query", "format": "json", "formatversion": 2,
            "prop": "imageinfo", "iiprop": "url", "titles": title})
        page = request_json(f"{WIKI}/api.php?{query}").get("query", {}).get("pages", [{}])[0]
        if page.get("imageinfo"):
            return page["imageinfo"][0]["url"], title
    return None, None

def side_bar_width(image, from_left, max_fraction=.35):
    rgb = image.convert("RGB")
    width, height = rgb.size
    non_bar_run = last_bar = 0
    for step in range(max(1, int(width * max_fraction))):
        x = step if from_left else width - 1 - step
        stat = ImageStat.Stat(rgb.crop((x, 0, x + 1, height)))
        mean = sum(stat.mean) / 3
        if (mean <= 18 or mean >= 237) and max(stat.stddev) <= 15:
            last_bar, non_bar_run = step + 1, 0
        else:
            non_bar_run += 1
            if non_bar_run >= 3:
                break
    return max(0, last_bar - 2)

def crop_side_bars(image):
    left, right = side_bar_width(image, True), side_bar_width(image, False)
    if left + right < 4 or left + right >= image.width * .55:
        return image, (0, 0)
    overscan = max(2, round(image.width * .025))
    x1 = min(image.width - 2, left + overscan)
    x2 = max(x1 + 1, image.width - right - overscan)
    return image.crop((x1, 0, x2, image.height)), (left, right)

def save_jpeg(image, path):
    if image.mode != "RGB":
        background = Image.new("RGB", image.size, "white")
        background.paste(image, mask=image.getchannel("A") if "A" in image.getbands() else None)
        image = background
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "JPEG", quality=92, optimize=True, progressive=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--download-missing", action="store_true")
    parser.add_argument("--crop-bars", action="store_true")
    parser.add_argument("--delay", type=float, default=.18)
    args = parser.parse_args()
    root = Path(args.root)
    art_dir = root / "battlecards/art"
    cards = json.loads((root / "battlecards/cards.json").read_text(encoding="utf-8"))["cards"]
    indexed = set(json.loads((art_dir / "index.json").read_text(encoding="utf-8")))
    missing = [card for card in cards if card["id"] not in indexed]
    report = {"cardCount": len(cards), "indexedArtCountBefore": len(indexed),
        "missingBefore": [{key: card.get(key) for key in ("id", "name", "set", "type")} for card in missing],
        "downloaded": [], "wikiNotFound": [], "barsCropped": [], "errors": []}
    if args.download_missing:
        for card in missing:
            if not card.get("set") or str(card["set"]).lower() in EXCLUDED_SETS:
                report["wikiNotFound"].append({"id": card["id"], "name": card["name"], "reason": "custom-or-unscoped"})
                continue
            try:
                url, title = wiki_image_url(card["name"])
                if not url:
                    report["wikiNotFound"].append({"id": card["id"], "name": card["name"], "reason": "no-wiki-art"})
                    continue
                image = Image.open(io.BytesIO(download(url))); image.load()
                image, bars = crop_side_bars(image)
                save_jpeg(image, art_dir / f"{card['id']}.jpg")
                indexed.add(card["id"])
                report["downloaded"].append({"id": card["id"], "name": card["name"],
                    "wikiFile": title, "sourceUrl": url, "croppedBars": list(bars)})
            except Exception as exc:
                report["errors"].append({"id": card["id"], "name": card["name"], "error": str(exc)})
            time.sleep(args.delay)
    if args.crop_bars:
        for card_id in sorted(indexed):
            path = art_dir / f"{card_id}.jpg"
            if not path.exists():
                continue
            try:
                with Image.open(path) as source:
                    source.load(); cropped, bars = crop_side_bars(source)
                    if bars != (0, 0):
                        save_jpeg(cropped, path)
                        report["barsCropped"].append({"id": card_id, "left": bars[0], "right": bars[1],
                            "originalWidth": source.width, "newWidth": cropped.width})
            except Exception as exc:
                report["errors"].append({"id": card_id, "error": str(exc)})
    (art_dir / "index.json").write_text(json.dumps(sorted(indexed)) + "\n", encoding="utf-8")
    report["indexedArtCountAfter"] = len(indexed)
    report["missingAfter"] = len(cards) - len(indexed)
    (art_dir / "audit-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"downloaded={len(report['downloaded'])} bars_cropped={len(report['barsCropped'])} "
          f"missing_after={report['missingAfter']} errors={len(report['errors'])}")

if __name__ == "__main__":
    main()

