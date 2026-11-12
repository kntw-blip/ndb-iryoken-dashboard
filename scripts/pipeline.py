"""自動更新の判定・検証・通知文の作成。

  python pipeline.py compare  SOURCES.json PREV_META.json           → GITHUB_OUTPUT 形式で changed/first/fp を出力
  python pipeline.py validate DATA_DIR SOURCES.json PREV_META.json   → DATA_DIR/meta.json を作成し、検証結果を出力
  python pipeline.py notify   KIND SOURCES.json PREV_META.json [DATA_DIR] → 通知（GitHub Issue）のタイトルと本文を出力
"""
import json, os, sys, pathlib
from datetime import datetime, timezone

def load(p, default=None):
    try: return json.loads(pathlib.Path(p).read_text())
    except Exception: return default if default is not None else {}

def jst(ts):
    try:
        t = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        return t.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    except Exception: return ts or "-"

def out(**kw):
    for k, v in kw.items():
        v = str(v)
        if "\n" in v: print(f"{k}<<__EOF__\n{v}\n__EOF__")
        else: print(f"{k}={v}")

def diff_sources(src, prev):
    """前回公開時と比べて増えた・変わったもの（人が読む説明）"""
    ps = prev.get("sources", {})
    pe = {e["n"]: e for e in ps.get("editions", [])}
    lines = []
    for e in src.get("editions", []):
        if e["n"] not in pe: lines.append(f"- NDBオープンデータ **第{e['n']}回** が新たに公表されました（{e['title']}）")
        elif e["files"] != pe[e["n"]].get("files"): lines.append(f"- 第{e['n']}回 のファイルが更新・追加されました")
    pj = set(ps.get("jumin", {}))
    for y in src.get("jumin", {}):
        if y not in pj: lines.append(f"- 住民基本台帳人口（{y}年1月1日）が公表されました")
    return lines

# ---------- compare ----------
def compare(src_p, prev_p):
    src, prev = load(src_p), load(prev_p)
    first = not prev.get("fingerprint")
    changed = first or src.get("fingerprint") != prev.get("fingerprint")
    out(changed=str(changed).lower(), first=str(first).lower(), fp=src.get("fingerprint", "none"))

# ---------- validate ----------
CHECK_ITEMS = ["A000", "A001", "A100", "A301", "D007"]

def item_totals(data, gid):
    try: g = json.loads((data / "items" / f"{gid}.json").read_text())
    except Exception: return None
    tot = {}
    for c in g["codes"].values():
        for y, arr in c.get("all", {}).get("pref", {}).items():
            tot[y] = tot.get(y, 0) + sum(x or 0 for x in arr if x)
    return tot

def validate(data_p, src_p, prev_p):
    data = pathlib.Path(data_p); src, prev = load(src_p), load(prev_p)
    nm = load(data / "ndb_meta.json"); pop = load(data / "pop.json"); index = load(data / "items.json", [])
    areas = [a["code"] for a in load(data / "areas_ndb.json", [])]
    years = sorted({str(y) for it in index for y in it.get("y", [])}, key=int)
    checks = {g: item_totals(data, g) for g in CHECK_ITEMS}
    checks = {k: v for k, v in checks.items() if v}
    errors, notes = [], []
    # 1. 実績の各年度に人口があるか
    for y in years:
        if y not in pop.get("jumin", {}):
            errors.append(f"{y}年度の住民基本台帳人口がありません（人口あたりの値が計算できません）。総務省の公表待ち、または取得処理の修正が必要です。")
    # 2. 医療圏の区分が人口・地図と合っているか
    if years:
        latest_pop = pop.get("jumin", {}).get(max((y for y in pop.get("jumin", {})), key=int, default=""), {})
        miss = [a for a in areas if a not in latest_pop.get("area", {})]
        if miss: errors.append(f"NDBの二次医療圏 {len(miss)} 件が人口データにありません（例：{', '.join(miss[:5])}）。医療圏の区分が変わった可能性があります。")
    try:
        topo = load(data / "areas.topo.json")
        geo_codes = {g["properties"]["code"] for o in topo.get("objects", {}).values() for g in o.get("geometries", [])}
        miss = [a for a in areas if a not in geo_codes]
        if len(miss) > 1: errors.append(f"NDBの二次医療圏 {len(miss)} 件が地図データにありません（例：{', '.join(miss[:5])}）。")
    except Exception as e:
        notes.append(f"地図データを確認できませんでした: {e}")
    # 3. 前回公開分との整合
    pm = prev.get("summary", {})
    if pm:
        if nm.get("groups", 0) < 0.9 * pm.get("groups", 0):
            errors.append(f"診療行為の分類数が大きく減りました（{pm['groups']} → {nm.get('groups')}）。ファイル形式が変わった可能性があります。")
        lost = [y for y in pm.get("years", []) if y not in years]
        if lost: errors.append(f"前回あった年度が消えています：{', '.join(lost)}")
        if pm.get("areas") and nm.get("areas") != pm.get("areas"):
            errors.append(f"二次医療圏の数が変わりました（{pm['areas']} → {nm.get('areas')}）。第8次医療計画の区分に変わった可能性があり、人口・地図の対応表の更新が必要です。")
        for g, old in prev.get("checks", {}).items():
            new = checks.get(g, {})
            for y, v in old.items():
                if not v: continue
                nv = new.get(y)
                if nv is None: errors.append(f"{g} の {y}年度の値がなくなりました。")
                elif abs(nv - v) / v > 0.02: errors.append(f"{g} の {y}年度の全国値が前回から2%以上変わりました（{v:,} → {nv:,}）。厚労省の訂正か、集計処理の不具合の可能性があります。")
    new_years = [y for y in years if y not in pm.get("years", [])] if pm else []
    for e in nm.get("editions", []):
        if not e.get("used"): notes.append(f"第{e['n']}回は{e['months']}か月分のみの公表（部分公開）のため、1年度分そろうまで反映しません。")
    meta = {
        "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "checked_at": src.get("checked_at"), "fingerprint": src.get("fingerprint"),
        "sources": {k: src.get(k) for k in ("editions", "jumin", "ipss")},
        "summary": {"years": years, "groups": nm.get("groups"), "codes": nm.get("codes"), "areas": nm.get("areas"),
                    "editions_used": [e["n"] for e in nm.get("editions", []) if e.get("used")],
                    "editions_partial": [{"n": e["n"], "months": e["months"]} for e in nm.get("editions", []) if not e.get("used")],
                    "pop_years": sorted(pop.get("jumin", {}), key=int)},
        "checks": checks, "validation": {"errors": errors, "notes": notes, "new_years": new_years},
    }
    (data / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    (data / "status.json").write_text(json.dumps({"checked_at": src.get("checked_at"), "result": "updated" if not errors else "held"}, ensure_ascii=False))
    for e in errors: print("ERROR:", e, file=sys.stderr)
    out(ok=str(not errors).lower(), new_years=",".join(new_years))

# ---------- notify ----------
def notify(kind, src_p, prev_p, data_p=None):
    src, prev = load(src_p), load(prev_p)
    meta = load(pathlib.Path(data_p) / "meta.json") if data_p else {}
    site = f"https://{os.environ.get('GITHUB_REPOSITORY_OWNER', '')}.github.io/{os.environ.get('GITHUB_REPOSITORY', '/').split('/')[1]}/"
    run = f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{os.environ.get('GITHUB_REPOSITORY', '')}/actions/runs/{os.environ.get('GITHUB_RUN_ID', '')}"
    sm, v = meta.get("summary", {}), meta.get("validation", {})
    changes = diff_sources(src, prev)
    yrs = sm.get("years", [])
    status = (f"- 収載期間：{yrs[0]}〜{yrs[-1]}年度（NDBオープンデータ 第{min(sm['editions_used'])}〜{max(sm['editions_used'])}回）\n"
              f"- 診療行為：{sm.get('groups', 0):,} 分類／{sm.get('codes', 0):,} コード、二次医療圏 {sm.get('areas')} 区分") if yrs and sm.get("editions_used") else ""
    notes = "\n".join(f"- {n}" for n in v.get("notes", []))
    if kind == "first":
        title = "【お知らせ】データの自動確認・自動更新を開始しました"
        body = f"""毎月2日に厚生労働省などのサイトを確認し、新しいデータが公表されていれば自動でサイトを更新します。\nこの通知が届いていれば、GitHub からのお知らせ（Issue）は正しく届いています。\n\n## 現在のデータ\n{status}\n\n## 補足\n{notes or '- なし'}\n\n## 通知の種類\n- 【自動更新】新しいデータを検出し、検証に合格してサイトに反映したとき\n- 【要確認】新しいデータを検出したが、検証で問題が見つかり公開を保留したとき（サイトは前回のまま）\n- 【エラー】取得・処理そのものが失敗したとき\n\nサイト：{site}\n実行記録：{run}"""
    elif kind == "updated":
        ny = v.get("new_years", [])
        title = f"【自動更新】新しいデータを反映しました" + (f"（{', '.join(ny)}年度を追加）" if ny else "")
        body = f"""新しいデータを検出し、検証に合格したためサイトを更新しました。\n\n## 検出した変更\n{chr(10).join(changes) or '- 公表ファイルの更新'}\n\n## 更新後のデータ\n{status}\n\n## 補足\n{notes or '- なし'}\n\nサイト：{site}\n実行記録：{run}"""
    elif kind == "held":
        title = "【要確認】新しいデータを検出しましたが、公開を保留しました"
        errs = "\n".join(f"- {e}" for e in v.get("errors", []))
        body = f"""新しいデータを検出しましたが、自動の検証で問題が見つかったため、サイトは前回のまま更新していません。\n内容を確認のうえ、処理の修正が必要です。\n\n## 検出した変更\n{chr(10).join(changes) or '- 公表ファイルの更新'}\n\n## 検証で見つかった問題\n{errs}\n\n## 補足\n{notes or '- なし'}\n\n実行記録：{run}"""
    else:
        title = "【エラー】データの自動確認・更新処理が失敗しました"
        body = f"""毎月のデータ確認・更新処理が途中で失敗しました。サイトは前回のまま公開されています。\n厚生労働省などのサイトの一時的な不具合、またはページ構成の変更が考えられます。\n\n- 実行記録（失敗した手順とログ）：{run}\n- 再実行：Actions → build-and-publish → Run workflow"""
    print(title)
    print(body, file=open(os.environ.get("NOTIFY_BODY", "notify_body.md"), "w"))

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "compare": compare(*sys.argv[2:4])
    elif cmd == "validate": validate(*sys.argv[2:5])
    elif cmd == "notify": notify(*sys.argv[2:])
