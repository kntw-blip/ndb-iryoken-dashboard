#!/usr/bin/env bash
# 国土数値情報 A38(2020) → 市区町村→二次医療圏 対応表 と 簡略化境界(topojson)
OUT=$1; mkdir -p "$OUT"; T=$(mktemp -d); LOG="$OUT/info.txt"
curl -sSL -o "$T/a38.zip" https://nlftp.mlit.go.jp/ksj/gml/data/A38/A38-20/A38-20_GML.zip; echo "curl rc=$?" >> "$LOG"
(cd "$T" && unzip -q -o a38.zip "*_1.shp" "*_1.dbf" "*_1.shx" "*_1.prj" "*_2.shp" "*_2.dbf" "*_2.shx" "*_2.prj") >> "$LOG" 2>&1
S1=$(find "$T" -name "*_1.shp"); S2=$(find "$T" -name "*_2.shp")
mapshaper "$S1" encoding=cp932 -o "$OUT/muni_attr.csv" format=csv >> "$LOG" 2>&1
for pct in 0.5 1; do
  mapshaper -i "$S2" encoding=cp932 snap \
    -dissolve2 A38b_003 copy-fields=A38b_004 \
    -simplify ${pct}% weighted keep-shapes \
    -filter-slivers min-area=2km2 \
    -rename-fields code=A38b_003,name=A38b_004 \
    -rename-layers areas \
    -o "$OUT/areas_${pct}.topo.json" format=topojson quantization=1e5 >> "$LOG" 2>&1
  mapshaper -i "$OUT/areas_${pct}.topo.json" \
    -each 'pref=code.slice(0,2)' -dissolve pref -rename-layers prefs \
    -o "$OUT/prefs_${pct}.topo.json" format=topojson quantization=1e5 >> "$LOG" 2>&1
done
ls -la "$OUT" >> "$LOG"
exit 0
