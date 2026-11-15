#!/usr/bin/env bash
# One command: build catalog -> test -> bump version -> install into Aside -> zip.
#   npm run release            (bumps patch version)
#   npm run release -- minor   (bumps minor version)
set -euo pipefail
cd "$(dirname "$0")/.."
INSTALL_DIR="$HOME/Library/Application Support/AsidePinnedIcons"
node scripts/build-library.mjs
for f in tests/*.test.cjs; do node "$f" >/dev/null || { echo "FAIL $f"; node "$f"; exit 1; }; done
echo "tests passed"
VERSION=$(node -e "
const fs=require('fs');const m=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));
const p=m.version.split('.').map(Number);const kind='${1:-patch}';
if(kind==='minor'){p[1]++;p[2]=0}else if(kind==='major'){p[0]++;p[1]=0;p[2]=0}else p[2]++;
m.version=p.join('.');fs.writeFileSync('extension/manifest.json',JSON.stringify(m,null,2)+'\n');console.log(m.version)")
mkdir -p "$INSTALL_DIR"
rsync -a --delete extension/ "$INSTALL_DIR/"
rm -f dist/*.zip
(cd extension && zip -qr "../dist/Aside-Icons-$VERSION.zip" .)
echo "released $VERSION -> $INSTALL_DIR (open the settings page once; it reloads the extension itself)"
