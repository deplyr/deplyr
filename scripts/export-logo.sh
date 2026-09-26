#!/usr/bin/env bash
# Renders the Deplyr logo (apps/web/app/icon.svg) to PNGs at common sizes.
# Needs rsvg-convert:  brew install librsvg   /   apt install librsvg2-bin
#
#   scripts/export-logo.sh            -> assets/logo/deplyr-logo-<size>.png
#   scripts/export-logo.sh out 512    -> out/deplyr-logo-512.png
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="apps/web/app/icon.svg"
OUT="${1:-assets/logo}"
SIZES=("${@:2}")
[ ${#SIZES[@]} -eq 0 ] && SIZES=(32 180 256 512 1024)

command -v rsvg-convert >/dev/null || { echo "rsvg-convert not found (brew install librsvg)" >&2; exit 1; }

mkdir -p "$OUT"
for size in "${SIZES[@]}"; do
  rsvg-convert -w "$size" -h "$size" "$SRC" -o "$OUT/deplyr-logo-$size.png"
  echo "wrote $OUT/deplyr-logo-$size.png"
done
