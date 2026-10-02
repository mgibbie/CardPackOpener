#!/usr/bin/env bash
# setup.sh — prepare a fresh clone (a Claude Code cloud session) to run the gate.
#
# Paste this as the cloud environment's SETUP SCRIPT:
#     bash tools/cloud/setup.sh
# It is cached when it finishes in ~5 minutes (typically ~3-4 here), so later
# sessions start ready. Safe to re-run: every step skips what already exists.
#   1. npm install        (package-lock.json is gitignored, so not `npm ci`)
#   2. a Chrome for puppeteer at /opt/chrome/chrome (set CHROME=/opt/chrome/chrome
#      in the environment's variables — every test reads process.env.CHROME)
#   3. overworld/data from magepunk-owdata.pages.dev (gitignored, ~270 MB)
# Card art (battlecards/art, 1.4 GB) is NOT fetched: the game falls back to
# procedural art and the gate doesn't need it.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "== npm install"
npm install --no-audit --no-fund

echo "== chrome"
if [ ! -x /opt/chrome/chrome ]; then
	# Chrome's shared-library dependencies (Debian/Ubuntu names; missing ones are skipped)
	if command -v apt-get >/dev/null; then
		apt-get update -qq || true
		for p in libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
			libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libasound2t64 \
			libxshmfence1 fonts-liberation; do
			apt-get install -y -qq "$p" >/dev/null 2>&1 || true
		done
	fi
	out=$(npx --yes @puppeteer/browsers install chrome@stable --path /opt/chrome-dl 2>&1 | tail -1)
	bin=$(echo "$out" | awk '{print $NF}')
	mkdir -p /opt/chrome
	ln -sf "$bin" /opt/chrome/chrome
fi
/opt/chrome/chrome --version || { echo "chrome did not install"; exit 1; }

echo "== overworld/data"
node tools/cloud/fetch-owdata.mjs

echo "== setup done. Check with: node tools/cloud/doctor.mjs"
