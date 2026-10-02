#!/usr/bin/env bash
# setup.sh — prepare a fresh clone (a Claude Code cloud session) to run the gate.
#
# In a cloud session the owner just types "start setup" (see CLAUDE.md), which
# runs this. It can also be the environment's SETUP SCRIPT (`bash tools/cloud/setup.sh`),
# cached when it finishes in ~5 minutes (typically ~3-4), so sessions start ready. Safe to re-run: every step skips what already exists.
#   1. npm install        (package-lock.json is gitignored, so not `npm ci`)
#   2. a Chrome for puppeteer at /opt/chrome/chrome (the gate runners and the
#      doctor use it automatically when CHROME isn't set)
#   3. overworld/data from magepunk-owdata.pages.dev (gitignored, ~270 MB)
# Card art (battlecards/art, 1.4 GB) is NOT fetched: the game falls back to
# procedural art and the gate doesn't need it.
set -euo pipefail
cd "$(dirname "$0")/../.."
# cloud sessions run as root; elsewhere use sudo for apt and /opt
SUDO=""; if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null; then SUDO="sudo"; fi

echo "== npm install"
if [ -d node_modules/puppeteer-core ]; then echo "already installed"; else npm install --no-audit --no-fund; fi

echo "== chrome"
if [ ! -x /opt/chrome/chrome ]; then
	# Chrome's shared-library dependencies (Debian/Ubuntu names; missing ones are skipped)
	if command -v apt-get >/dev/null; then
		$SUDO apt-get update -qq || true
		for p in libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
			libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libasound2t64 \
			libxshmfence1 fonts-liberation; do
			$SUDO apt-get install -y -qq "$p" >/dev/null 2>&1 || true
		done
	fi
	$SUDO mkdir -p /opt/chrome-dl /opt/chrome && $SUDO chown "$(id -u)" /opt/chrome-dl /opt/chrome
	out=$(npx --yes @puppeteer/browsers install chrome@stable --path /opt/chrome-dl 2>&1 | tail -1)
	bin=$(echo "$out" | awk '{print $NF}')
	ln -sf "$bin" /opt/chrome/chrome
fi
/opt/chrome/chrome --version || { echo "chrome did not install"; exit 1; }

echo "== overworld/data"
node tools/cloud/fetch-owdata.mjs

echo "== setup done. Check with: node tools/cloud/doctor.mjs"
