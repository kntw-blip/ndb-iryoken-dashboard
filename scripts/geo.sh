#!/usr/bin/env bash
set -euo pipefail
OUT=$1; mkdir -p "$OUT"; T=$(mktemp -d)
curl -sSL -o "$T/a38.zip" https://nlftp.mlit.go.jp/ksj/gml/data/A38/A38-20/A38-20_GML.zip
cd "$T" && unzip -q a38.zip && cd - >/dev/null
find "$T" -type f | sed "s|$T/||" | head -50 > "$OUT/info.txt"
for shp in $(find "$T" -name "*.shp"); do
  b=$(basename "$shp" .shp)
  echo "== $b" >> "$OUT/info.txt"
  mapshaper "$shp" encoding=cp932 -info 2>> "$OUT/info.txt" || mapshaper "$shp" -info 2>> "$OUT/info.txt"
  mapshaper "$shp" encoding=cp932 -o "$OUT/${b}_attr.csv" format=csv 2>/dev/null || true
  mapshaper "$shp" encoding=cp932 -simplify 3% keep-shapes -o "$OUT/${b}_s3.json" format=topojson quantization=1e5 2>/dev/null || true
done
