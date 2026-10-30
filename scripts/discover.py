"""データソースの調査用スクリプト。
各ページのリンク一覧(JSON)を作り、最新回のNDB医科診療行為ファイルを取得する。"""
import json, re, sys, time, pathlib, urllib.parse
import requests
from bs4 import BeautifulSoup

OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "discover_out")
OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0 (ndb-iryoken-dashboard data pipeline)"

TOP = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177182.html"
EXTRA = {
    "soumu_jumin": "https://www.soumu.go.jp/main_sosiki/jichi_gyousei/daityo/jinkou_jinkoudoutai-setaisuu.html",
    "ipss_shicyoson": "https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/t-page.asp",
    "mlit_a38": "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A38-2020.html",
    "mlit_a38_list": "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A38.html",
}

def get(url, **kw):
    for i in range(3):
        try:
            r = S.get(url, timeout=120, **kw)
            r.raise_for_status()
            return r
        except Exception as e:
            print("retry", url, e, file=sys.stderr)
            time.sleep(5)
    raise RuntimeError(url)

def links(url):
    r = get(url)
    r.encoding = r.apparent_encoding
    soup = BeautifulSoup(r.text, "html.parser")
    res, heading = [], ""
    for el in soup.find_all(["h1", "h2", "h3", "h4", "h5", "a"]):
        if el.name != "a":
            heading = el.get_text(" ", strip=True)
            continue
        href = el.get("href")
        if not href:
            continue
        res.append({"heading": heading, "text": el.get_text(" ", strip=True),
                    "href": urllib.parse.urljoin(url, href)})
    return res, r.text

index = {}
top, _ = links(TOP)
index["top"] = top
editions = [l for l in top if re.search(r"0000177221|0000139390", l["href"])]
for l in editions:
    key = l["text"][:40]
    try:
        index[key], html = links(l["href"])
        (OUT / f"page_{len(index)}.html").write_text(html)
    except Exception as e:
        index[key] = str(e)
for k, u in EXTRA.items():
    try:
        index[k], _ = links(u)
    except Exception as e:
        index[k] = str(e)
(OUT / "link_index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))

# 最新2回分の「医科診療行為」関連ファイルを取得(構造確認用)
dl = OUT / "files"; dl.mkdir(exist_ok=True)
ed_keys = [k for k in index if k not in ("top", *EXTRA) and isinstance(index[k], list)]
for k in ed_keys[-2:] if len(ed_keys) >= 2 else ed_keys:
    for l in index[k]:
        if not re.search(r"\.(zip|xlsx?|csv)$", l["href"], re.I):
            continue
        ctx = l["heading"] + " " + l["text"]
        if "医科" not in ctx and "解説" not in ctx:
            continue
        name = re.sub(r"[^\w.-]", "_", f"{k[:12]}__{l['heading'][:30]}__{l['text'][:40]}__" + l["href"].rsplit("/", 1)[-1])
        print("download", l["href"], "->", name)
        (dl / name).write_bytes(get(l["href"]).content)
print("done")
