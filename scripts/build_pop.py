"""人口データ（都道府県・二次医療圏 × 性・5歳階級）を作る。
usage: python build_pop.py RAW_DIR GEO_DIR OUT_DIR
  住民基本台帳（各年1月1日）→ 年度人口（Y年1月1日 = Y-1年度）
  社人研 令和5年推計（2020〜2050年）→ 将来人口
"""
import csv, glob, json, re, sys, pathlib, collections
from python_calamine import CalamineWorkbook

RAW, GEO, OUT = map(pathlib.Path, sys.argv[1:4])
NB = 19  # 0-4,...,85-89,90+
log = collections.Counter()

def num(v):
    try: return float(str(v).replace(",", ""))
    except Exception: return 0.0

# 市区町村(5桁) → 二次医療圏（国土数値情報 A38 2020）
muni = {}
with open(GEO / "muni_attr.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        muni[r["A38a_001"]] = r["A38a_003"]
areas = sorted(set(muni.values()))

# 市区町村コードの変更（A38 2020年版との差）
ALIAS = {"40305": "40231",  # 那珂川町→那珂川市(2018)
         "04423": "04216",  # 富谷町→富谷市(2016)
         "22138": "22131", "22139": "22135", "22140": "22137"}  # 浜松市の区再編(2024)

def area_of(c5, all_codes=None):
    c5 = ALIAS.get(c5, c5)
    if c5 in muni: return muni[c5]
    if c5.endswith("0"): return "SKIP"  # 政令市・郡などの集計行
    return None

def fold21(v):  # 住基 21階級(…90-94,95-99,100+) → 19階級
    return v[:18] + [sum(v[18:])]

# ---------- 住民基本台帳 ----------
jumin = {}
for f in sorted(glob.glob(str(RAW / "pop" / "jumin_*"))):
    y = int(re.search(r"jumin_(\d{4})", f).group(1)); fy = y - 1
    rows = CalamineWorkbook.from_path(f).get_sheet_by_name(CalamineWorkbook.from_path(f).sheet_names[0]).to_python(skip_empty_area=False)
    recs = []
    for r in rows:
        code = str(r[0]).strip().split(".")[0]
        if not re.fullmatch(r"\d{5,6}", code): continue
        c5 = code.zfill(6)[:5]
        sex = str(r[3]).strip()
        if sex not in ("男", "女"): continue
        recs.append((c5, sex, fold21([num(x) for x in r[5:26]])))
    codes = {c for c, _, _ in recs}
    pref = collections.defaultdict(lambda: [0.0] * 38)
    area = collections.defaultdict(lambda: [0.0] * 38)
    unmatched = collections.Counter()
    for c5, sex, v in recs:
        off = 0 if sex == "男" else NB
        if c5[2:] == "000":
            for i, x in enumerate(v): pref[c5[:2]][off + i] += x
            continue
        a = area_of(c5, codes)
        if a == "SKIP": continue
        if a is None: unmatched[c5] += sum(v); continue
        for i, x in enumerate(v): area[a][off + i] += x
    log[f"jumin{y} unmatched_pop"] = int(sum(unmatched.values()))
    if unmatched: log[f"jumin{y} unmatched_codes {sorted(unmatched)[:8]}"] = len(unmatched)
    tp, ta = sum(map(sum, pref.values())), sum(map(sum, area.values()))
    log[f"jumin{y} pref_total"] = int(tp); log[f"jumin{y} area_total"] = int(ta)
    jumin[str(fy)] = {"pref": {k: [round(x) for x in v] for k, v in sorted(pref.items())},
                      "area": {k: [round(x) for x in v] for k, v in sorted(area.items())}}

# ---------- 社人研 将来推計 ----------
rows = CalamineWorkbook.from_path(str(RAW / "pop" / "ipss_r5_suikei_kekka.xlsx")).get_sheet_by_name("Sheet1").to_python(skip_empty_area=False)
h = [str(x) for x in rows[3]]
mi, fi = h.index("男"), h.index("女")
def fold20(v): return v[:18] + [v[18] + v[19]]  # 90-94,95+ → 90+
fut = collections.defaultdict(lambda: {"pref": collections.defaultdict(lambda: [0.0] * 38), "area": collections.defaultdict(lambda: [0.0] * 38)})
hama = {}
for r in rows[5:]:
    if not r[0]: continue
    typ = str(r[1]).replace(".0", ""); y = str(r[4]).replace("年", "")
    c5 = f"{int(float(r[0])):05d}"
    v = fold20([num(x) for x in r[mi + 1:mi + 21]]) + fold20([num(x) for x in r[fi + 1:fi + 21]])
    if typ == "a":
        fut[y]["pref"][c5[:2]] = v; continue
    if typ == "1": continue  # 政令市（区を使う）
    if typ == "9": hama[y] = v; continue  # 福島県浜通り13市町村の合計
    a = area_of(c5, set())
    if a in (None, "SKIP"): log[f"ipss_unmatched {c5}"] += 1; continue
    for i, x in enumerate(v): fut[y]["area"][a][i] += x
# 浜通り地域は2025年住基の各医療圏の構成比（性・年齢別）で按分
HAMA = ["07204", "07209", "07212", "07541", "07542", "07543", "07544", "07545", "07546", "07547", "07548", "07561", "07564"]
share = collections.defaultdict(lambda: [0.0] * 38)
f25 = sorted(glob.glob(str(RAW / "pop" / "jumin_2025*")))[0]
wb = CalamineWorkbook.from_path(f25)
for r in wb.get_sheet_by_name(wb.sheet_names[0]).to_python(skip_empty_area=False):
    code = str(r[0]).strip().split(".")[0]
    if not re.fullmatch(r"\d{6}", code) or code[:5] not in HAMA: continue
    sex = str(r[3]).strip()
    if sex not in ("男", "女"): continue
    off = 0 if sex == "男" else NB
    for i, x in enumerate(fold21([num(x) for x in r[5:26]])): share[muni[code[:5]]][off + i] += x
tot = [sum(share[a][i] for a in share) for i in range(38)]
for y, v in hama.items():
    for a in share:
        for i in range(38):
            if tot[i]: fut[y]["area"][a][i] += v[i] * share[a][i] / tot[i]
future = {y: {"pref": {k: [round(x) for x in vv] for k, vv in sorted(d["pref"].items())},
              "area": {k: [round(x) for x in vv] for k, vv in sorted(d["area"].items())}} for y, d in sorted(fut.items())}
for y, d in future.items():
    log[f"ipss{y} pref_total"] = int(sum(map(sum, d["pref"].values())))
    log[f"ipss{y} area_total"] = int(sum(map(sum, d["area"].values())))

bands = [f"{i*5}-{i*5+4}" for i in range(18)] + ["90+"]
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "pop.json").write_text(json.dumps({"bands": bands, "sexes": ["男", "女"], "jumin": jumin, "future": future},
                                         ensure_ascii=False, separators=(",", ":")))
for k, v in sorted(log.items()): print(k, v)
