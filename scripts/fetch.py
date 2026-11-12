"""一次データの取得・公表状況の確認。

  python fetch.py RAW_DIR            一次データをダウンロードする
  python fetch.py --check OUT.json   ダウンロードせず、公表されているファイルの一覧（指紋）だけを作る

対象:
  NDBオープンデータ 医科診療行為 算定回数（都道府県別・性年齢別・二次医療圏別、公費レセプトを含まない）
    ※回数の上限は設けない。年度の途中までしか含まない回（部分公開）は build_ndb.py で除外する
  住民基本台帳 年齢階級別人口（市区町村別、各年1月1日）
  社人研 地域別将来推計人口（令和5年推計）
  （国土数値情報 医療圏データは scripts/geo.sh で取得）
"""
import hashlib, io, json, re, sys, time, zipfile, pathlib, urllib.parse
from datetime import datetime, timezone
import requests
from bs4 import BeautifulSoup

S = requests.Session(); S.headers["User-Agent"] = "Mozilla/5.0 (ndb-iryoken-dashboard data pipeline)"
TOP = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177182.html"
SOUMU = "https://www.soumu.go.jp/main_sosiki/jichi_gyousei/daityo/jinkou_jinkoudoutai-setaisuu.html"
SOUMU_INDEX = "https://web.pref.hyogo.lg.jp/kk11/ac08_5_000000040.html"  # 総務省の各年報道資料へのリンク集
IPSS = "https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/3kekka/suikei_kekka.xlsx"
KINDS = ("都道府県別", "性年齢別", "二次医療圏別")
log = []

def get(url, tries=4):
    for i in range(tries):
        try:
            r = S.get(url, timeout=300); r.raise_for_status(); return r
        except Exception as e:
            print("retry", url, e, flush=True); time.sleep(5 * (i + 1))
    raise RuntimeError(f"取得できませんでした: {url}")

def links(url):
    r = get(url); r.encoding = r.apparent_encoding
    soup = BeautifulSoup(r.text, "html.parser"); res, h = [], ""
    for el in soup.find_all(["h1", "h2", "h3", "h4", "h5", "a"]):
        if el.name != "a": h = el.get_text(" ", strip=True); continue
        if el.get("href"):
            res.append({"heading": h, "text": el.get_text(" ", strip=True),
                        "href": urllib.parse.urljoin(url, el["href"])})
    return res

def safe(s): return re.sub(r"[\\/:*?\"<>|\s]+", "_", s)

# ---------- 公表状況の把握 ----------
def list_editions():
    """NDBオープンデータの各回: [(回, タイトル, URL)]"""
    eds = {}
    for l in links(TOP):
        m = re.search(r"第(\d+)回", l["text"])
        if m and re.search(r"0000177221|0000139390", l["href"]):
            eds.setdefault(int(m.group(1)), (l["text"], l["href"]))
    return [(n, t, u) for n, (t, u) in sorted(eds.items())]

def ndb_targets(n, url):
    """その回の医科診療行為（算定回数）に関係するファイルのリンク"""
    out = []
    for l in links(url):
        t, h = l["text"], l["href"]
        if n <= 9:  # 第9回までは項目ごとのExcel
            if re.search(r"\.xlsx?$", h) and "算定回数" in t and "患者数" not in t and any(k in t for k in KINDS):
                out.append(l)
        elif h.lower().endswith(".zip"):  # 第10回以降は種類ごとのzip（中身で絞り込む）
            out.append(l)
    seen, res = set(), []
    for l in out:
        if l["href"] not in seen: seen.add(l["href"]); res.append(l)
    return res

def era_year(s):
    m = re.search(r"(平成|令和)(\d+|元)年?", s)
    if not m: return None
    y = 1 if m.group(2) == "元" else int(m.group(2))
    return (1988 if m.group(1) == "平成" else 2018) + y

def jumin_targets():
    """住民基本台帳 年齢階級別人口（市区町村別）: {年: URL}"""
    pages = [SOUMU]
    try:
        pages += [l["href"] for l in links(SOUMU_INDEX) if "soumu.go.jp/menu_news/s-news" in l["href"]]
    except Exception as e:
        print("WARN 総務省リンク集を取得できませんでした", e)
    got = {}
    for p in pages:
        try: L = links(p)
        except Exception as e: print("WARN", p, e); continue
        for l in L:
            t = l["text"]
            if "【総計】" in t and "年齢" in t and "市区町村別" in t and re.search(r"\.xlsx?$", l["href"]):
                y = era_year(t)
                if y and y >= 2015 and y not in got: got[y] = l["href"]
    return got

def check(out_path):
    eds = []
    for n, title, url in list_editions():
        files = ndb_targets(n, url)
        eds.append({"n": n, "title": title, "url": url, "files": sorted(l["href"] for l in files)})
    jumin = jumin_targets()
    src = {"editions": eds, "jumin": {str(k): v for k, v in sorted(jumin.items())}, "ipss": IPSS}
    fp = hashlib.sha256(json.dumps(src, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
    res = {"checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fingerprint": fp, **src}
    pathlib.Path(out_path).write_text(json.dumps(res, ensure_ascii=False, indent=1))
    print(f"editions: {[e['n'] for e in eds]}  jumin: {sorted(jumin)}  fingerprint: {fp}")
    if not eds: raise SystemExit("NDBオープンデータの回が1つも見つかりません（サイト構成の変更の可能性）")

# ---------- ダウンロード ----------
def save(raw, path, content):
    path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(content)
    log.append({"path": str(path.relative_to(raw)), "bytes": len(content)})

def fetch_ndb(raw):
    for n, title, url in list_editions():
        out = raw / "ndb" / f"ed{n:02d}"
        for l in ndb_targets(n, url):
            if n <= 9:
                name = safe(f"{l['heading'][:20]}__{re.sub(r'［.*?］', '', l['text'])}") + "__" + l["href"].rsplit("/", 1)[-1]
                save(raw, out / name, get(l["href"]).content)
                continue
            z = zipfile.ZipFile(io.BytesIO(get(l["href"]).content))
            for info in z.infolist():
                nm = info.filename
                if not (info.flag_bits & 0x800):
                    try: nm = nm.encode("cp437").decode("cp932")
                    except Exception: pass
                nm = re.sub(r"#U([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), nm)
                if nm.endswith("/") or "医科" not in nm or "算定回数" not in nm: continue
                if "公費含む" in nm: continue
                if not any(k in nm for k in KINDS): continue
                save(raw, out / safe(nm.replace("/", "__")), z.read(info))

def fetch_pop(raw):
    jumin = jumin_targets()
    for y, href in sorted(jumin.items()):
        save(raw, raw / "pop" / f"jumin_{y}0101.{href.rsplit('.', 1)[-1]}", get(href).content)
    print("jumin years", sorted(jumin))
    save(raw, raw / "pop" / "ipss_r5_suikei_kekka.xlsx", get(IPSS).content)

if __name__ == "__main__":
    if sys.argv[1] == "--check":
        check(sys.argv[2]); sys.exit(0)
    RAW = pathlib.Path(sys.argv[1])
    errors = []
    for f in (fetch_ndb, fetch_pop):
        try: f(RAW)
        except Exception as e:
            print("ERROR in", f.__name__, repr(e)); errors.append(f"{f.__name__}: {e}")
    (RAW / "fetch_log.json").write_text(json.dumps(log, ensure_ascii=False, indent=1))
    print("files:", len(log), "bytes:", sum(x.get("bytes", 0) for x in log))
    if errors: raise SystemExit("一次データの取得に失敗しました: " + " / ".join(errors))
