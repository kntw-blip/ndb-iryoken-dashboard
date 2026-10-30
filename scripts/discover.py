"""データソース調査(2): 形式確認用のサンプルファイルを取得する。"""
import json, re, sys, time, pathlib, urllib.parse
import requests
from bs4 import BeautifulSoup

OUT = pathlib.Path(sys.argv[1]); (OUT / "files").mkdir(parents=True, exist_ok=True)
S = requests.Session(); S.headers["User-Agent"] = "Mozilla/5.0 (ndb-iryoken-dashboard)"
TOP = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177182.html"

def get(url):
    for i in range(3):
        try:
            r = S.get(url, timeout=180); r.raise_for_status(); return r
        except Exception as e:
            print("retry", url, e); time.sleep(5)
    raise RuntimeError(url)

def links(url):
    r = get(url); r.encoding = r.apparent_encoding
    soup = BeautifulSoup(r.text, "html.parser"); res, h = [], ""
    for el in soup.find_all(["h1", "h2", "h3", "h4", "h5", "a"]):
        if el.name != "a": h = el.get_text(" ", strip=True); continue
        if el.get("href"):
            res.append({"heading": h, "text": el.get_text(" ", strip=True), "href": urllib.parse.urljoin(url, el["href"])})
    return res

def save(url, name):
    p = OUT / "files" / name
    p.write_bytes(get(url).content); print("saved", name, p.stat().st_size, url)

top = links(TOP)
eds = [(l["text"], l["href"]) for l in top if re.search(r"0000177221|0000139390", l["href"]) and "回" in l["text"]]
for title, url in eds:
    n = re.search(r"第(\d+)回", title)
    if not n: continue
    n = int(n.group(1))
    if n >= 11: continue
    got = set()
    for l in links(url):
        t = l["text"]
        if "特定入院料" in t and "算定回数" in t and "加算" not in t:
            for kind in ("性年齢別", "都道府県別", "二次医療圏別"):
                if kind in t and kind not in got:
                    got.add(kind); save(l["href"], f"ed{n:02d}_tokutei_{kind}.xlsx")
for u, name in [
    ("https://www.mhlw.go.jp/content/12400000/001742574.zip", "ed11_ika_santei_kohi.zip"),
    ("https://www.mhlw.go.jp/content/12400000/001758801.zip", "ed12_sample.zip"),
    ("https://www.soumu.go.jp/main_content/000892953.xlsx", "jumin_R8_shikuchoson_nenrei.xlsx"),
    ("https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/3kekka/suikei_kekka.xlsx", "ipss_suikei_kekka.xlsx"),
]:
    try: save(u, name)
    except Exception as e: print("FAIL", u, e)

idx = {}
for k, u in {"soumu_past": "https://www.soumu.go.jp/main_sosiki/jichi_gyousei/daityo/jinkou_jinkoudoutai-setaisuu.html",
             "mlit_a38_2020": "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A38-2020.html",
             "ed12": [h for t, h in eds if "第12回" in t][0]}.items():
    idx[k] = links(u)
# 総務省の過去分ページも辿る
for l in list(idx["soumu_past"]):
    if "過去" in l["text"] or "jinkou_jinkoudoutai-setaisuu" in l["href"] and l["href"] != idx["soumu_past"][0]["href"]:
        try: idx["soumu:" + l["text"][:30]] = links(l["href"])
        except Exception as e: print("FAIL", l["href"], e)
# A38の実ファイル名をHTMLから抽出
r = get("https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A38-2020.html")
idx["a38_zip_names"] = sorted(set(re.findall(r"[\w/.-]*A38[\w-]*\.zip", r.text)))
(OUT / "link_index2.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1))
print("done")
