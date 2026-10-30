"""一次データの取得。
  NDBオープンデータ 第1〜11回 医科診療行為 算定回数（都道府県別・性年齢別・二次医療圏別、公費レセプトを含まない）
  住民基本台帳 年齢階級別人口（市区町村別、各年1月1日）
  社人研 地域別将来推計人口（令和5年推計）
  国土数値情報 医療圏データ（A38, 2020年度版）
出力: raw/ 以下
"""
import io, json, re, sys, time, zipfile, pathlib, urllib.parse
import requests
from bs4 import BeautifulSoup

RAW = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "raw")
S = requests.Session(); S.headers["User-Agent"] = "Mozilla/5.0 (ndb-iryoken-dashboard data pipeline)"
TOP = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177182.html"
KINDS = ("都道府県別", "性年齢別", "二次医療圏別")
log = []

def get(url):
    for i in range(4):
        try:
            r = S.get(url, timeout=300); r.raise_for_status(); return r
        except Exception as e:
            print("retry", url, e, flush=True); time.sleep(5 * (i + 1))
    raise RuntimeError(url)

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

def save(path, content):
    path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(content)
    log.append({"path": str(path.relative_to(RAW)), "bytes": len(content)})

# ---------- NDB ----------
def fetch_ndb():
    eds = []
    for l in links(TOP):
        m = re.search(r"第(\d+)回", l["text"])
        if m and re.search(r"0000177221|0000139390", l["href"]):
            eds.append((int(m.group(1)), l["href"]))
    for n, url in sorted(set(eds)):
        if n >= 12:
            continue  # 第12回は2025年4〜6月分のみの部分公開のため対象外
        out = RAW / "ndb" / f"ed{n:02d}"
        L = links(url)
        if n <= 9:
            seen = set()
            for l in L:
                t = l["text"]
                if not re.search(r"\.xlsx?$", l["href"]): continue
                if "算定回数" not in t or "患者数" in t: continue
                if not any(k in t for k in KINDS): continue
                if l["href"] in seen: continue
                seen.add(l["href"])
                name = safe(f"{l['heading'][:20]}__{re.sub(r'［.*?］', '', t)}") + "__" + l["href"].rsplit("/", 1)[-1]
                save(out / name, get(l["href"]).content)
        else:
            for l in L:
                if not l["href"].lower().endswith(".zip"): continue
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
                    save(out / safe(nm.replace("/", "__")), z.read(info))

# ---------- 住民基本台帳 ----------
def era_year(s):
    m = re.search(r"(平成|令和)(\d+|元)年", s)
    if not m: return None
    y = 1 if m.group(2) == "元" else int(m.group(2))
    return (1988 if m.group(1) == "平成" else 2018) + y

def fetch_jumin():
    pages = ["https://www.soumu.go.jp/main_sosiki/jichi_gyousei/daityo/jinkou_jinkoudoutai-setaisuu.html"]
    for l in links("https://web.pref.hyogo.lg.jp/kk11/ac08_5_000000040.html"):
        if "soumu.go.jp/menu_news/s-news" in l["href"]: pages.append(l["href"])
    got = {}
    for p in pages:
        try: L = links(p)
        except Exception as e: print("FAIL", p, e); continue
        for l in L:
            t = l["text"]
            if "【総計】" in t and "年齢" in t and "市区町村別" in t and re.search(r"\.xlsx?$", l["href"]):
                y = era_year(t)
                if y and y >= 2015 and y not in got:
                    got[y] = l["href"]
                    ext = l["href"].rsplit(".", 1)[-1]
                    save(RAW / "pop" / f"jumin_{y}0101.{ext}", get(l["href"]).content)
    print("jumin years", sorted(got))

def fetch_other():
    save(RAW / "pop" / "ipss_r5_suikei_kekka.xlsx",
         get("https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/3kekka/suikei_kekka.xlsx").content)
    save(RAW / "geo" / "AdminiBoundary_CD.xlsx",
         get("https://nlftp.mlit.go.jp/ksj/gml/codelist/AdminiBoundary_CD.xlsx").content)
    try:
        save(RAW / "geo" / "A38-20_GML.zip", get("https://nlftp.mlit.go.jp/ksj/gml/data/A38/A38-20/A38-20_GML.zip").content)
    except Exception as e:
        print("A38 national failed, fetching by prefecture", e)
        for i in range(1, 48):
            save(RAW / "geo" / f"A38-20_{i:02d}_GML.zip",
                 get(f"https://nlftp.mlit.go.jp/ksj/gml/data/A38/A38-20/A38-20_{i:02d}_GML.zip").content)

if __name__ == "__main__":
    for f in (fetch_ndb, fetch_jumin, fetch_other):
        try: f()
        except Exception as e: print("ERROR in", f.__name__, repr(e)); log.append({"error": f.__name__, "msg": repr(e)})
    (RAW / "fetch_log.json").write_text(json.dumps(log, ensure_ascii=False, indent=1))
    print("files:", len(log), "bytes:", sum(x.get("bytes", 0) for x in log))
