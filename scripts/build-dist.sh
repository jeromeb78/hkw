#!/usr/bin/env bash
# Assemble the public site in dist/ for Hostinger. Only files listed here are published:
# lesson sources, docs, emails, and tests stay private in the repository.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 lessons/build.py >/dev/null          # validate lessons and confirm index.html is current
if [ "${CI:-}" = "true" ] && ! git diff --quiet -- index.html; then
  echo "index.html is out of date with lessons/*.py: run 'npm run build:lessons' and commit it" >&2; exit 1
fi
rm -rf dist && mkdir -p dist/assets
cp index.html config.js dist/
cp deploy/.htaccess deploy/robots.txt dist/
cp assets/HKW-Share-Card.png dist/assets/
echo "dist/ ready:"; find dist -type f | sort
