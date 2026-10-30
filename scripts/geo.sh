#!/usr/bin/env bash
# 国土数値情報 A38(2020) → 対応表CSVと簡略化境界(topojson)
OUT=$1; mkdir -p "$OUT"; T=$(mktemp -d); LOG="$OUT/info.txt"
curl -sSL -o "$T/a38.zip" https://nlftp.mlit.go.jp/ksj/gml/data/A38/A38-20/A38-20_GML.zip; echo "curl rc=$? size=$(stat -c %s $T/a38.zip)" >> "$LOG"
(cd "$T" && unzip -q -o a38.zip; echo "unzip rc=$?") >> "$LOG" 2>&1
# 入れ子のzipを展開
for z in $(find "$T" -mindepth 2 -name "*.zip"); do (cd "$(dirname $z)" && unzip -q -o "$z") >> "$LOG" 2>&1; done
find "$T" -type f -printf "%s %P\n" | grep -v "^.* a38.zip$" | sort -k2 | head -80 >> "$LOG"
find "$T" -name "*.shp" | sort > "$T/shps.txt"
while read shp; do
  b=$(basename "$shp" .shp)
  echo "== $b" >> "$LOG"
  mapshaper "$shp" encoding=cp932 -info >> "$LOG" 2>&1
  mapshaper "$shp" encoding=cp932 -o "$OUT/${b}_attr.csv" format=csv >> "$LOG" 2>&1
  mapshaper "$shp" encoding=cp932 -simplify 2% keep-shapes -o "$OUT/${b}_s.json" format=topojson quantization=1e5 >> "$LOG" 2>&1
done < "$T/shps.txt"
# GeoJSONのみの場合
if [ ! -s "$T/shps.txt" ]; then
  for gj in $(find "$T" -name "*.geojson"); do
    b=$(basename "$gj" .geojson); echo "== $b (geojson)" >> "$LOG"
    mapshaper "$gj" -info >> "$LOG" 2>&1
    mapshaper "$gj" -o "$OUT/${b}_attr.csv" format=csv >> "$LOG" 2>&1
    mapshaper "$gj" -simplify 2% keep-shapes -o "$OUT/${b}_s.json" format=topojson quantization=1e5 >> "$LOG" 2>&1
  done
fi
exit 0
