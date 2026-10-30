"""NDB医科診療行為（算定回数）のExcelを読み、項目（分類コード）ごとのJSONを作る。
usage: python build_ndb.py RAW_DIR OUT_DIR
"""
import json, re, sys, glob, os, pathlib, collections, hashlib
from python_calamine import CalamineWorkbook

RAW, OUT = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
KIND_OF = [("二次医療圏別", "area"), ("性年齢別", "sa"), ("都道府県別", "pref")]
N = {"pref": 47, "area": 335, "sa": 38}
warn = collections.Counter()

def kind_of(name):
    if "クロス" in name or "都道府県性年齢" in name: return None
    for k, v in KIND_OF:
        if k in name: return v
    return None

def num(v):
    if v is None or v == "": return None
    if isinstance(v, (int, float)): return int(round(v))
    s = str(v).strip().replace(",", "")
    return int(float(s)) if re.fullmatch(r"-?\d+(\.\d+)?", s) else None

def fy_of(title, ed):
    m = re.search(r"(H|R|20)(\d+)年0?4月", str(title))
    if m:
        y = int(m.group(2))
        return {"H": 1988 + y, "R": 2018 + y, "20": 2000 + y}[m.group(1)]
    return 2013 + ed

def parse_sheet(rows, kind, grp_label):
    """rows: list of lists -> (地域等の見出し, レコード一覧)"""
    hr = ci = None
    for i, r in enumerate(rows[:12]):
        for j, c in enumerate(r[:6]):
            if c and re.match(r"診療行為\s*コード", str(c)):
                hr, ci = i, j; break
        if hr is not None: break
    if hr is None: warn["no_header"] += 1; return None, []
    h = [str(c or "") for c in rows[hr]]
    ti = next(i for i, c in enumerate(h) if c.startswith("総計"))
    bi = next((i for i, c in enumerate(h[:ci]) if c.startswith("分類") and "名称" not in c), None)
    first, vals_n = ti + 1, N[kind]
    ds = next(i for i in range(hr + 1, min(hr + 6, len(rows))) if num(rows[i][ci]) is not None)
    if kind == "area":
        meta = list(zip([str(c).strip() for c in rows[ds - 2][first:first + vals_n]],
                        [str(c).strip() for c in rows[ds - 1][first:first + vals_n]]))
    else:
        meta = [str(c).strip() for c in rows[ds - 1][first:first + vals_n]]
    out, bc, bn = [], None, None
    for r in rows[ds:]:
        if len(r) <= ti: continue
        if bi is not None:
            if r[bi]: bc, bn = str(r[bi]).strip(), str(r[bi + 1] or "").strip()
        elif str(r[0] or "").strip():
            lab = str(r[0]).strip()
            bc, bn = f"{grp_label[0]}加算:{grp_label[1]}:{lab}", f"{grp_label[1]} 加算（{lab}）"
        code = num(r[ci])
        if code is None: continue
        v = [num(x) for x in r[first:first + vals_n]]
        v += [None] * (vals_n - len(v))
        pt = r[ci + 2]
        out.append(dict(bc=bc, bn=bn, code=str(code), name=str(r[ci + 1] or "").strip(),
                        pt=num(pt), total=num(r[ti]), v=v))
    return meta, out

def grp_label_of(base):
    m = re.match(r"(?:\d+_医科診療行為__)?([A-O])_?([^_]+)__(?:(.+?)_(?:都道府県|性年齢|二次医療圏|款別))?", base)
    if not m: return ("?", base[:10])
    sub = m.group(3) or m.group(2)
    return (m.group(1), sub)

def setting_of(sheet):
    kasan = "加算" in sheet or "加減算" in sheet
    s = "in" if sheet.startswith("入院") else "out" if sheet.startswith("外来") else "all"
    return s, kasan

# data[(grp)]["codes"][code][setting][kind][fy] = values
groups = {}
meta_area = {}
files = sorted(glob.glob(str(RAW / "ndb" / "ed*" / "*.xls*")))
# 医療圏の並び順は最新回のファイルを基準にする（古い回で並び・区分が異なる場合はコードで並べ替え）
CANON = None
for f in reversed(files):
    if kind_of(os.path.basename(f)) == "area":
        wb = CalamineWorkbook.from_path(f)
        CANON = parse_sheet(wb.get_sheet_by_name(wb.sheet_names[0]).to_python(skip_empty_area=False), "area", grp_label_of(os.path.basename(f)))[0]
        break
CANON_IDX = {c: i for i, (c, n) in enumerate(CANON)}
for f in files:
    ed = int(re.search(r"ed(\d+)", f).group(1))
    kind = kind_of(os.path.basename(f))
    if not kind: continue
    wb = CalamineWorkbook.from_path(f)
    titles = [str((wb.get_sheet_by_name(sh).to_python() or [[""]])[0][0]) for sh in wb.sheet_names]
    if any("歯科" in t for t in titles):
        warn["dental_file"] += 1; continue
    for sheet in wb.sheet_names:
        rows = wb.get_sheet_by_name(sheet).to_python(skip_empty_area=False)
        if not rows: continue
        fy = fy_of(rows[0][0], ed)
        try:
            meta, recs = parse_sheet(rows, kind, grp_label_of(os.path.basename(f)))
        except Exception as e:
            warn[f"parse_error {os.path.basename(f)} {sheet} {e}"] += 1; continue
        if not recs: continue
        if not recs[0]["code"].startswith("1"):  # 医科診療行為コードは1始まり（歯科3・調剤4等は除外）
            warn["non_ika_sheet"] += 1; continue
        if kind == "area":
            meta_area[fy] = meta
            if meta != CANON:
                pos = [CANON_IDX.get(c) for c, n in meta]
                miss = sum(p is None for p in pos)
                warn[f"area_remap {fy} unmatched={miss}"] += 1
                if miss: continue  # 医療圏の区分が異なる年は医療圏別データを使わない
                for r in recs:
                    nv = [None] * len(CANON)
                    for j, p in enumerate(pos):
                        if p is not None and j < len(r["v"]): nv[p] = r["v"][j]
                    r["v"] = nv
        setting, kasan = setting_of(sheet)
        for r in recs:
            gid = (r["bc"] or "NA") + ("_k" if kasan and ":" not in (r["bc"] or "") else "")
            g = groups.setdefault(gid, {"id": gid, "bc": r["bc"], "name": {}, "cat": grp_label_of(os.path.basename(f))[0], "kasan": kasan, "codes": {}})
            g["name"][fy] = r["bn"]
            c = g["codes"].setdefault(r["code"], {"name": {}, "pt": {}, "d": {}})
            c["name"][fy] = r["name"]; c["pt"][fy] = r["pt"]
            d = c["d"].setdefault(setting, {}).setdefault(kind, {})
            if fy in d and d[fy] == r["v"]:
                warn["dup_identical"] += 1
            elif fy in d:  # 同一年・同一区分で値の異なる重複 → 合算
                d[fy] = [None if a is None and b is None else (a or 0) + (b or 0) for a, b in zip(d[fy], r["v"])]
                warn[f"dup {os.path.basename(f)[:50]} {sheet}"] += 1
            else:
                d[fy] = r["v"]
            if kind == "pref":
                c.setdefault("tot", {}).setdefault(setting, {})[fy] = r["total"]
    print("parsed", f, flush=True)

# 医療圏コード一覧の整合確認
base = CANON

def latest(d): return d[max(d)] if d else None

def add(a, b):
    if a is None: return b
    if b is None: return a
    return [None if x is None and y is None else (x or 0) + (y or 0) for x, y in zip(a, b)]

OUT.mkdir(parents=True, exist_ok=True); (OUT / "items").mkdir(exist_ok=True)
index = []
for gid, g in sorted(groups.items()):
    codes_out = {}
    years = set()
    for code, c in g["codes"].items():
        d = c["d"]
        # 「全体」= 全体シートがあればそれ、無ければ入院+外来
        allk = {}
        for kind in ("pref", "area", "sa"):
            ys = set()
            for s in d.values(): ys |= set(s.get(kind, {}))
            for fy in ys:
                v = d.get("all", {}).get(kind, {}).get(fy)
                if v is None:
                    v = add(d.get("in", {}).get(kind, {}).get(fy), d.get("out", {}).get(kind, {}).get(fy))
                allk.setdefault(kind, {})[str(fy)] = v
                years.add(fy)
        rec = {"n": latest(c["name"]), "p": latest(c["pt"]), "all": allk}
        if "in" in d and "out" in d:  # 入院・外来の両方に現れる項目のみ内訳を保持
            for s in ("in", "out"):
                rec[s] = {k: {str(fy): v for fy, v in kv.items()} for k, kv in d[s].items()}
        rec["st"] = sorted(d)
        codes_out[code] = rec
    name = latest(g["name"]) or gid
    fn = re.sub(r"[^A-Za-z0-9_]", "", gid) if ":" not in gid else "X" + hashlib.md5(gid.encode()).hexdigest()[:10]
    (OUT / "items" / f"{fn}.json").write_text(json.dumps({"id": gid, "name": name, "cat": g["cat"], "kasan": g["kasan"], "codes": codes_out},
                                                         ensure_ascii=False, separators=(",", ":")))
    index.append({"id": gid, "f": fn, "n": name + ("（加算）" if g["kasan"] else ""), "cat": g["cat"], "y": sorted(years),
                  "c": [[k, v["n"]] for k, v in codes_out.items()],
                  "st": sorted({s for v in codes_out.values() for s in v["st"]})})
(OUT / "items.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")))
(OUT / "areas_ndb.json").write_text(json.dumps([{"code": a, "name": b} for a, b in base], ensure_ascii=False))
print("groups", len(groups), "codes", sum(len(g["codes"]) for g in groups.values()))
print("warnings", dict(warn))
