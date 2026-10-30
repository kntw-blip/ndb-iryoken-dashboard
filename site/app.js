/* NDB 医療圏ダッシュボード */
"use strict";

const PREFS = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
const PCODES = PREFS.map((_, i) => String(i + 1).padStart(2, "0"));
const BANDS = ["0-4","5-9","10-14","15-19","20-24","25-29","30-34","35-39","40-44","45-49","50-54","55-59","60-64","65-69","70-74","75-79","80-84","85-89","90+"];
const DENOM = { t: { lab: "総人口", from: 0 }, "65": { lab: "65歳以上人口", from: 13 }, "75": { lab: "75歳以上人口", from: 15 } };
const SETTING_LAB = { all: "全体", in: "入院", out: "外来" };
const FUT_YEARS = ["2025", "2030", "2035", "2040", "2045", "2050"];

const $ = (s) => document.querySelector(s);
const fmt = (v, d = 0) => (v == null || !isFinite(v)) ? "–" : Number(v).toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
const fy = (y) => `${y}年度`;

const D = { index: null, items: new Map(), pop: null, areas: [], areaName: {}, geo: {} };
const S = { item: "A301", excl: new Set(), setting: "all", pref: "", area: "", denom: "65", cmpMetric: "rate", cmpYear: "", saYear: "" };
let G = null; // 現在の項目データ
const charts = {};

/* ---------- テーマ ---------- */
function css(name) { return getComputedStyle($(".viz-root")).getPropertyValue(name).trim(); }
function theme() {
  return {
    text: css("--text-primary"), text2: css("--text-secondary"), muted: css("--text-muted"), grid: css("--grid"),
    surface: css("--surface-1"), s1: css("--series-1"), s2: css("--series-2"), s3: css("--series-3"), s4: css("--series-4"),
    neutral: css("--neutral"), neg: css("--div-neg"), pos: css("--div-pos"),
    seq: [css("--seq-1"), css("--seq-2"), css("--seq-3"), css("--seq-4"), css("--seq-5")],
  };
}
function chart(id) {
  const el = document.getElementById(id);
  if (!charts[id]) { charts[id] = echarts.init(el, null, { renderer: "svg" }); }
  return charts[id];
}
function baseOpt(T) {
  return {
    textStyle: { fontFamily: getComputedStyle(document.body).fontFamily, color: T.text2 },
    animation: false,
    grid: { left: 64, right: 16, top: 24, bottom: 32 },
    tooltip: { trigger: "axis", backgroundColor: T.surface, borderColor: T.grid, textStyle: { color: T.text, fontSize: 12 },
      axisPointer: { type: "line", lineStyle: { color: T.muted } } },
  };
}
function axisX(T, data) {
  return { type: "category", data, axisLine: { lineStyle: { color: T.grid } }, axisTick: { show: false }, axisLabel: { color: T.text2 } };
}
function axisY(T, extra = {}) {
  return Object.assign({ type: "value", splitLine: { lineStyle: { color: T.grid } }, axisLabel: { color: T.text2,
    formatter: (v) => Math.abs(v) >= 10000 ? (v / 10000).toLocaleString("ja-JP") + "万" : v.toLocaleString("ja-JP") } }, extra);
}
const lineS = (name, data, color, extra = {}) => Object.assign({ name, type: "line", data, connectNulls: false, symbol: "circle", symbolSize: 8,
  lineStyle: { width: 2, color }, itemStyle: { color, borderColor: "transparent" } }, extra);

/* ---------- データ読み込み ---------- */
async function getJSON(p) { const r = await fetch(p); if (!r.ok) throw new Error(p + " " + r.status); return r.json(); }

async function init() {
  [D.index, D.pop, D.areas] = await Promise.all([getJSON("data/items.json"), getJSON("data/pop.json"), getJSON("data/areas_ndb.json")]);
  D.areas.forEach((a) => (D.areaName[a.code] = a.name));
  readHash();
  buildRegionSelectors();
  bindUI();
  await loadItem(S.item, true);
  loadGeo();
  window.addEventListener("resize", () => Object.values(charts).forEach((c) => c.resize()));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
}

async function loadGeo() {
  try {
    const [a, p] = await Promise.all([getJSON("data/areas.topo.json"), getJSON("data/prefs.topo.json")]);
    const fa = topojson.feature(a, a.objects[Object.keys(a.objects)[0]]);
    const fp = topojson.feature(p, p.objects[Object.keys(p.objects)[0]]);
    fa.features.forEach((f) => (f.properties.name = f.properties.code));
    fp.features.forEach((f) => (f.properties.name = f.properties.pref));
    D.geo = { areas: fa, prefs: fp };
    renderCompare();
  } catch (e) { console.warn("map", e); }
}

async function loadItem(id, keepExcl) {
  const meta = D.index.find((x) => x.id === id) || D.index.find((x) => x.id === "A301") || D.index[0];
  S.item = meta.id;
  if (!keepExcl) S.excl = new Set();
  $("#itemName").textContent = `${meta.id.includes(":") ? "" : meta.id + "　"}${meta.n}`;
  if (!D.items.has(meta.id)) D.items.set(meta.id, await getJSON(`data/items/${meta.f}.json`));
  G = D.items.get(meta.id);
  const hasSplit = Object.values(G.codes).some((c) => c.in && c.out);
  const sts = new Set(Object.values(G.codes).flatMap((c) => c.st));
  [...$("#setting").options].forEach((o) => (o.disabled = o.value !== "all" && !(hasSplit || sts.has(o.value))));
  if ($("#setting").selectedOptions[0]?.disabled) S.setting = "all";
  $("#setting").value = S.setting;
  buildCodeList();
  render();
}

/* ---------- 集計 ---------- */
function codeVal(c, kind, y) {
  if (S.setting === "all") return c.all?.[kind]?.[y] ?? null;
  if (c[S.setting]) return c[S.setting][kind]?.[y] ?? null;
  if (c.st.length === 1 && c.st[0] === S.setting) return c.all?.[kind]?.[y] ?? null;
  return null;
}
// 秘匿（‐）は0として合計。ただし全コードが秘匿の地域は null（不明）とする
function sumKind(kind, y) {
  const key = kind + y + S.setting + S.excl.size + [...S.excl].join();
  if (G._cache?.[key]) return G._cache[key];
  let out = null;
  for (const [code, c] of Object.entries(G.codes)) {
    if (S.excl.has(code)) continue;
    const v = codeVal(c, kind, y);
    if (!v) continue;
    if (!out) out = new Array(v.length).fill(null);
    v.forEach((x, i) => { if (x != null) out[i] = (out[i] || 0) + x; });
  }
  (G._cache ||= {})[key] = out;
  return out;
}
function yearsOf(kind) {
  const ys = new Set();
  for (const c of Object.values(G.codes)) for (const k of ["all", "in", "out"]) Object.keys(c[k]?.[kind] || {}).forEach((y) => ys.add(y));
  return [...ys].sort();
}
const sum = (a) => a ? a.reduce((s, x) => s + (x || 0), 0) : null;

// 医療圏別の値が全国合計の何割を捕捉しているか（秘匿の多さの指標）
function areaCoverage(y) {
  const a = sumKind("area", y), p = sumKind("pref", y);
  const tp = sum(p); return a && tp ? sum(a) / tp : null;
}
const COVER_MIN = 0.9;
function areaYearOK(y) { const c = areaCoverage(y); return c != null && c >= COVER_MIN; }
function region() {
  if (S.area) return { lv: "area", code: S.area, name: D.areaName[S.area] + "（" + PREFS[+S.area.slice(0, 2) - 1] + "）", short: D.areaName[S.area] };
  if (S.pref) return { lv: "pref", code: S.pref, name: PREFS[+S.pref - 1], short: PREFS[+S.pref - 1] };
  return { lv: "nation", code: "00", name: "全国", short: "全国" };
}
function obs(r, y, force) {
  if (r.lv === "area") { if (!force && !areaYearOK(y)) return null; const a = sumKind("area", y); if (!a) return null; const i = D.areas.findIndex((x) => x.code === r.code); return a[i] ?? null; }
  const p = sumKind("pref", y); if (!p) return null;
  return r.lv === "pref" ? p[+r.code - 1] : sum(p);
}
function popVec(r, y, src = "jumin") {
  const P = D.pop[src][y]; if (!P) return null;
  if (r.lv === "area") return P.area[r.code] || null;
  if (r.lv === "pref") return P.pref[r.code] || null;
  const v = new Array(38).fill(0); Object.values(P.pref).forEach((a) => a.forEach((x, i) => (v[i] += x))); return v;
}
function denomOf(vec, d = S.denom) {
  if (!vec) return null; const f = DENOM[d].from; let s = 0;
  for (let i = f; i < 19; i++) s += vec[i] + vec[19 + i];
  return s;
}
const rate = (o, p) => (o == null || !p) ? null : o / p * 1000;
// 全国の性・年齢別算定率（算定回数の総計に合わせて補正）
function natRates(y) {
  const sa = sumKind("sa", y), np = popVec({ lv: "nation" }, y);
  if (!sa || !np) return null;
  const nat = obs({ lv: "nation" }, y), k = nat && sum(sa) ? nat / sum(sa) : 1;
  return sa.map((x, i) => (np[i] ? x / np[i] * k : 0));
}
function expected(r, y, rates) {
  const v = popVec(r, y); if (!v || !rates) return null;
  return v.reduce((s, x, i) => s + x * rates[i], 0);
}
function scr(r, y) { const o = obs(r, y), e = expected(r, y, natRates(y)); return (o == null || !e) ? null : o / e * 100; }

/* ---------- UI ---------- */
function buildRegionSelectors() {
  $("#prefSel").innerHTML = `<option value="">全国</option>` + PREFS.map((p, i) => `<option value="${PCODES[i]}">${p}</option>`).join("");
  $("#prefSel").value = S.pref;
  fillAreas();
}
function fillAreas() {
  const list = D.areas.filter((a) => S.pref && a.code.startsWith(S.pref));
  $("#areaSel").innerHTML = `<option value="">（都道府県全体）</option>` + list.map((a) => `<option value="${a.code}">${a.name}</option>`).join("");
  $("#areaSel").disabled = !S.pref;
  if (!list.find((a) => a.code === S.area)) S.area = "";
  $("#areaSel").value = S.area;
}
function bindUI() {
  $("#prefSel").onchange = (e) => { S.pref = e.target.value; S.area = ""; fillAreas(); render(); };
  $("#areaSel").onchange = (e) => { S.area = e.target.value; render(); };
  $("#setting").onchange = (e) => { S.setting = e.target.value; buildCodeList(); render(); };
  $("#denom").value = S.denom;
  $("#denom").onchange = (e) => { S.denom = e.target.value; render(); };
  $("#cmpMetric").value = S.cmpMetric;
  $("#cmpMetric").onchange = (e) => { S.cmpMetric = e.target.value; renderCompare(); writeHash(); };
  $("#cmpYear").onchange = (e) => { S.cmpYear = e.target.value; renderCompare(); };
  $("#saYear").onchange = (e) => { S.saYear = e.target.value; renderSexAge(); };
  $("#codeToggle").onclick = () => { const p = $("#codePanel"); p.hidden = !p.hidden; $("#codeToggle").setAttribute("aria-expanded", String(!p.hidden)); };
  $("#codeFilter").oninput = buildCodeList;
  $("#codeAll").onclick = () => { visibleCodes().forEach((c) => S.excl.delete(c)); buildCodeList(); render(); };
  $("#codeNone").onclick = () => { visibleCodes().forEach((c) => S.excl.add(c)); buildCodeList(); render(); };
  document.querySelectorAll("[data-table]").forEach((b) => (b.onclick = () => { const t = $("#tbl-" + b.dataset.table); t.hidden = !t.hidden; }));
  // 検索
  const inp = $("#itemSearch"), box = $("#searchResults");
  let active = 0;
  inp.addEventListener("input", () => { active = 0; showResults(); });
  inp.addEventListener("focus", showResults);
  inp.addEventListener("keydown", (e) => {
    const items = box.querySelectorAll(".sr-item");
    if (e.key === "ArrowDown") { active = Math.min(active + 1, items.length - 1); mark(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); mark(); e.preventDefault(); }
    else if (e.key === "Enter" && items[active]) { items[active].click(); }
    else if (e.key === "Escape") box.hidden = true;
    function mark() { items.forEach((x, i) => x.classList.toggle("active", i === active)); items[active]?.scrollIntoView({ block: "nearest" }); }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) box.hidden = true; });
  function showResults() {
    const q = inp.value.trim().normalize("NFKC").toLowerCase();
    if (!q) { box.hidden = true; return; }
    const res = [];
    for (const it of D.index) {
      const n = (it.id + " " + it.n).normalize("NFKC").toLowerCase();
      if (n.includes(q)) { res.push({ it, score: n.startsWith(q) ? 0 : 1 }); continue; }
      const hit = it.c.find(([code, nm]) => code.startsWith(q) || (nm || "").normalize("NFKC").toLowerCase().includes(q));
      if (hit) res.push({ it, hit, score: 2 });
    }
    res.sort((a, b) => a.score - b.score);
    box.innerHTML = res.slice(0, 80).map(({ it, hit }) =>
      `<div class="sr-item" role="option" data-id="${it.id}"><span class="id">${it.id.includes(":") ? it.cat + " 加算" : it.id}</span>${it.n}${hit ? `<span class="hit">${hit[0]} ${hit[1]}</span>` : ""}</div>`).join("")
      || `<div class="sr-item muted">該当なし</div>`;
    box.querySelectorAll(".sr-item[data-id]").forEach((el, i) => {
      el.classList.toggle("active", i === active);
      el.onclick = () => { box.hidden = true; inp.value = ""; loadItem(el.dataset.id, false); };
    });
    box.hidden = false;
  }
}
function latestNat(c) {
  const ys = Object.keys(c.all?.pref || {}).sort(); const y = ys[ys.length - 1];
  return y ? { y, v: sum(c.all.pref[y]) } : { y: null, v: 0 };
}
function visibleCodes() {
  const q = $("#codeFilter").value.trim().normalize("NFKC");
  return Object.entries(G.codes).filter(([k, c]) => !q || k.includes(q) || (c.n || "").normalize("NFKC").includes(q)).map(([k]) => k);
}
function buildCodeList() {
  if (!G) return;
  const vis = new Set(visibleCodes());
  const rows = Object.entries(G.codes).filter(([k]) => vis.has(k))
    .map(([k, c]) => ({ k, c, l: latestNat(c) })).sort((a, b) => (b.l.y || "").localeCompare(a.l.y || "") || b.l.v - a.l.v);
  $("#codeList").innerHTML = rows.map(({ k, c, l }) =>
    `<label><input type="checkbox" data-code="${k}" ${S.excl.has(k) ? "" : "checked"}> <span>${k}　${c.n}</span><span class="cnum">${l.y ? fy(l.y) + " " + fmt(l.v) : ""}</span></label>`).join("");
  $("#codeList").querySelectorAll("input").forEach((el) => (el.onchange = () => { el.checked ? S.excl.delete(el.dataset.code) : S.excl.add(el.dataset.code); updateCodeCount(); render(); }));
  updateCodeCount();
}
function updateCodeCount() {
  const n = Object.keys(G.codes).length, x = [...S.excl].filter((k) => G.codes[k]).length;
  $("#codeCount").textContent = `${n - x} / ${n} コードを集計中`;
  $("#codeToggle").textContent = x ? `対象コード：${n - x}/${n}（変更あり）` : `対象コードを選ぶ（${n}件）`;
}

/* ---------- 描画 ---------- */
function render() {
  if (!G) return;
  writeHash();
  renderKpis(); renderTrend(); renderCompare(); renderSexAge(); renderFuture();
}

function renderKpis() {
  const r = region(), ys = yearsOf(r.lv === "area" ? "area" : "pref"), y = (r.lv === "area" ? ys.filter(areaYearOK) : ys).pop();
  const o = obs(r, y), p = denomOf(popVec(r, y)), s = scr(r, y), f = futureSeries(r);
  const chg = f && f.proj["2040"] != null && f.proj["2025"] ? (f.proj["2040"] / f.proj["2025"] - 1) * 100 : null;
  const notice = [];
  if (r.lv === "area" && !ys.length) notice.push("この項目には二次医療圏別のデータがありません。");
  if (o === 0) notice.push("選択地域の値は0です（10未満の秘匿を含む）。");
  if (o == null && ys.length) notice.push("選択地域の最新年度の値は秘匿（‐）のため表示できません。");
  if (r.lv === "area" || r.lv === "pref") {
    const bad = yearsOf("area").filter((yy) => !areaYearOK(yy));
    if (bad.length) notice.push(`医療圏別：${bad.map((yy) => `${fy(yy)}（捕捉率${fmt((areaCoverage(yy) || 0) * 100, 0)}%）`).join("・")}は公表値の多くが秘匿（‐）のため表示していません。`);
    if (r.lv === "area") { const sup = ys.filter((yy) => areaYearOK(yy) && obs(r, yy) == null); if (sup.length) notice.push(`${sup.map(fy).join("・")}はこの医療圏の値が秘匿（‐）です。`); }
  }
  $("#notice").hidden = !notice.length; $("#notice").textContent = notice.join(" ");
  $("#kpis").innerHTML = [
    ["算定回数", fmt(o), `${r.short}・${y ? fy(y) : ""}・${SETTING_LAB[S.setting]}`],
    [`${DENOM[S.denom].lab}千人あたり`, fmt(rate(o, p), 2), `全国 ${fmt(rate(obs({ lv: "nation" }, y), denomOf(popVec({ lv: "nation" }, y))), 2)}`],
    ["年齢調整比 SCR", fmt(s, 1), "全国＝100（性・年齢構成を調整）"],
    ["2040年の推計（2025年比）", chg == null ? "–" : (chg >= 0 ? "+" : "") + fmt(chg, 1) + "%", "人口構成の変化のみを反映"],
  ].map(([k, v, s2]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s2}</div></div>`).join("");
}

function renderTrend() {
  const T = theme(), r = region(), kind = r.lv === "area" ? "area" : "pref";
  const ys = yearsOf("pref"), ysR = yearsOf(kind);
  const nat = { lv: "nation" }, pr = r.lv === "area" ? { lv: "pref", code: S.area.slice(0, 2), short: PREFS[+S.area.slice(0, 2) - 1] } : null;
  const o = ys.map((y) => ysR.includes(y) ? obs(r, y) : null);
  const p = ys.map((y) => denomOf(popVec(r, y)));
  const rt = ys.map((y, i) => rate(o[i], p[i]));
  const rn = ys.map((y) => rate(obs(nat, y), denomOf(popVec(nat, y))));
  const rp = pr ? ys.map((y) => rate(obs(pr, y), denomOf(popVec(pr, y)))) : null;
  $("#trendRegion").textContent = `${r.name}｜${SETTING_LAB[S.setting]}`;
  $("#popCap").textContent = `${DENOM[S.denom].lab}（千人）`;
  $("#rateCap").textContent = `${DENOM[S.denom].lab}千人あたり算定回数`;
  const xl = ys.map((y) => y);
  chart("cCount").setOption(Object.assign(baseOpt(T), {
    xAxis: axisX(T, xl), yAxis: axisY(T),
    tooltip: Object.assign(baseOpt(T).tooltip, { valueFormatter: (v) => fmt(v) }),
    series: [{ name: "算定回数", type: "bar", data: o, barMaxWidth: 28, itemStyle: { color: T.s1, borderRadius: [4, 4, 0, 0] } }],
  }), true);
  chart("cPop").setOption(Object.assign(baseOpt(T), {
    xAxis: axisX(T, xl), yAxis: axisY(T, { scale: true, axisLabel: { color: T.text2, formatter: (v) => v.toLocaleString("ja-JP") } }),
    tooltip: Object.assign(baseOpt(T).tooltip, { valueFormatter: (v) => fmt(v) + " 千人" }),
    series: [lineS(DENOM[S.denom].lab, p.map((v) => v == null ? null : Math.round(v / 1000)), T.s1)],
  }), true);
  const ser = [lineS(r.short, rt, T.s1, { label: { show: true, position: "top", color: T.text2, fontSize: 11, formatter: (d) => d.dataIndex === rt.length - 1 || d.dataIndex === rt.findIndex((v) => v != null) ? fmt(d.value, 2) : "" } })];
  if (r.lv !== "nation") ser.push(lineS("全国", rn, T.s2, { lineStyle: { width: 2, color: T.s2, type: "dashed" } }));
  if (rp) ser.push(lineS(pr.short, rp, T.s3, { lineStyle: { width: 2, color: T.s3, type: "dotted" } }));
  chart("cRate").setOption(Object.assign(baseOpt(T), {
    legend: ser.length > 1 ? { top: 0, right: 0, textStyle: { color: T.text2 }, itemWidth: 18 } : undefined,
    grid: { left: 52, right: 16, top: ser.length > 1 ? 30 : 24, bottom: 32 },
    xAxis: axisX(T, xl), yAxis: axisY(T, { scale: false }),
    tooltip: Object.assign(baseOpt(T).tooltip, { valueFormatter: (v) => fmt(v, 2) }),
    series: ser,
  }), true);
  table("trend", ["年度", "算定回数", DENOM[S.denom].lab, "千人あたり", "全国 千人あたり", ...(rp ? [pr.short + " 千人あたり"] : []), "SCR"],
    ys.map((y, i) => [fy(y), fmt(o[i]), fmt(p[i]), fmt(rt[i], 3), fmt(rn[i], 3), ...(rp ? [fmt(rp[i], 3)] : []), ysR.includes(y) ? fmt(scr(r, y), 1) : "–"]),
    `${G.id}_${r.short}_年次推移`);
}

function units() {
  const r = region();
  if (r.lv === "nation") return { lv: "pref", list: PCODES.map((c) => ({ lv: "pref", code: c, short: PREFS[+c - 1] })), title: "都道府県別" };
  const pc = r.lv === "pref" ? r.code : r.code.slice(0, 2);
  return { lv: "area", pc, list: D.areas.filter((a) => a.code.startsWith(pc)).map((a) => ({ lv: "area", code: a.code, short: a.name })), title: `${PREFS[+pc - 1]}の二次医療圏別` };
}
function metricVal(u, y, m = S.cmpMetric) {
  if (m === "count") return obs(u, y);
  if (m === "scr") return scr(u, y);
  return rate(obs(u, y), denomOf(popVec(u, y)));
}
const metricLab = (m = S.cmpMetric) => m === "count" ? "算定回数" : m === "scr" ? "年齢調整比 SCR（全国＝100）" : `${DENOM[S.denom].lab}千人あたり算定回数`;

function renderCompare() {
  if (!G) return;
  const T = theme(), U = units(), r = region();
  const ys = yearsOf(U.lv);
  const ysel = $("#cmpYear");
  const okY = U.lv === "area" ? ys.filter(areaYearOK) : ys;
  ysel.innerHTML = ys.map((y) => `<option value="${y}" ${okY.includes(y) ? "" : "disabled"}>${fy(y)}${okY.includes(y) ? "" : "（秘匿多）"}</option>`).join("");
  if (!okY.includes(S.cmpYear)) S.cmpYear = okY[okY.length - 1] || "";
  ysel.value = S.cmpYear;
  const y = S.cmpYear, m = S.cmpMetric;
  $("#cmpTitle").textContent = `${U.title}｜${y ? fy(y) : "データなし"}｜${metricLab()}`;
  const vals = U.list.map((u) => ({ u, v: y ? metricVal(u, y) : null }));
  const natRef = m === "scr" ? 100 : m === "rate" ? metricVal({ lv: "nation" }, y) : null;
  const dp = m === "count" ? 0 : m === "scr" ? 1 : 2;
  // ランキング
  const sorted = vals.filter((x) => x.v != null).sort((a, b) => a.v - b.v);
  const selCode = r.lv === "area" ? r.code : r.lv === "pref" && U.lv === "pref" ? r.code : null;
  chart("cRank").setOption(Object.assign(baseOpt(T), {
    grid: { left: 110, right: 56, top: 10, bottom: 28 },
    tooltip: { trigger: "item", backgroundColor: T.surface, borderColor: T.grid, textStyle: { color: T.text, fontSize: 12 }, formatter: (d) => `${d.name}<br>${metricLab()}：<b>${fmt(d.value, dp)}</b>` },
    xAxis: axisY(T), yAxis: { type: "category", data: sorted.map((x) => x.u.short), axisTick: { show: false }, axisLine: { lineStyle: { color: T.grid } },
      axisLabel: { color: T.text2, fontSize: sorted.length > 30 ? 10 : 12, interval: 0 } },
    series: [{ type: "bar", data: sorted.map((x) => ({ value: x.v, itemStyle: { color: x.u.code === selCode ? T.s2 : T.s1, borderRadius: [0, 4, 4, 0] } })),
      barMaxWidth: 18, barCategoryGap: "30%",
      label: { show: sorted.length <= 30, position: "right", color: T.text2, fontSize: 11, formatter: (d) => fmt(d.value, dp) },
      markLine: natRef == null ? undefined : { symbol: "none", silent: true, lineStyle: { color: T.text2, type: "dashed" },
        label: { formatter: m === "scr" ? "全国=100" : `全国 ${fmt(natRef, dp)}`, color: T.text2, position: "end" }, data: [{ xAxis: natRef }] } }],
  }), true);
  // 地図
  const geo = U.lv === "pref" ? D.geo.prefs : D.geo.areas;
  if (geo) {
    // 東京都の島しょは本土から遠く地図が縮むため地図上のみ除外（ランキングには表示）
    const MAP_SKIP = ["1313"];
    const feats = U.lv === "pref" ? geo.features : geo.features.filter((f) => f.properties.code.startsWith(U.pc) && !MAP_SKIP.includes(f.properties.code));
    const mapName = U.lv === "pref" ? "jp_prefs" : "areas_" + U.pc;
    if (!echarts.getMap(mapName)) echarts.registerMap(mapName, { type: "FeatureCollection", features: feats });
    const data = vals.map((x) => ({ name: x.u.code, value: x.v, label2: x.u.short }));
    const vv = data.map((d) => d.value).filter((v) => v != null);
    let visualMap;
    if (m === "scr") {
      visualMap = { type: "piecewise", left: 8, bottom: 8, textStyle: { color: T.text2, fontSize: 11 }, itemWidth: 14,
        pieces: [{ lt: 70, label: "70未満", color: T.neg }, { gte: 70, lt: 90, label: "70–90", color: mix(T.neg, T.neutral, .5) },
          { gte: 90, lt: 110, label: "90–110", color: T.neutral }, { gte: 110, lt: 130, label: "110–130", color: mix(T.pos, T.neutral, .5) },
          { gte: 130, label: "130以上", color: T.pos }], outOfRange: { color: T.grid } };
    } else {
      visualMap = { type: "continuous", min: vv.length ? Math.min(...vv) : 0, max: vv.length ? Math.max(...vv) : 1, left: 8, bottom: 8, calculable: false,
        text: ["高", "低"], textStyle: { color: T.text2 }, inRange: { color: T.seq }, itemHeight: 110, formatter: (v) => fmt(v, dp) };
    }
    chart("cMap").setOption({
      animation: false,
      tooltip: { trigger: "item", backgroundColor: T.surface, borderColor: T.grid, textStyle: { color: T.text, fontSize: 12 },
        formatter: (d) => `${d.data?.label2 || d.name}<br>${metricLab()}：<b>${fmt(d.value, dp)}</b>` },
      visualMap,
      series: [{ type: "map", map: mapName, roam: true, data, selectedMode: false, nameProperty: "name",
        itemStyle: { borderColor: T.surface, borderWidth: 1, areaColor: T.grid },
        emphasis: { label: { show: true, color: T.text, formatter: (d) => d.data?.label2 || "" }, itemStyle: { areaColor: T.s4 } },
        label: { show: U.lv === "area", color: T.text, fontSize: 10, formatter: (d) => d.data?.label2 || "" } }],
    }, true);
    chart("cMap").off("click");
    chart("cMap").on("click", (d) => {
      if (U.lv === "pref") { S.pref = d.name; S.area = ""; $("#prefSel").value = S.pref; fillAreas(); }
      else { S.area = d.name; $("#areaSel").value = S.area; }
      render();
    });
    $("#mapNote").textContent = "地図をクリックすると地域を選択できます。" + (U.lv === "area" ? "医療圏は医療機関所在地ベースのため、都市部は周辺からの流入で高く出ます。" : "") + (U.pc === "13" ? "島しょは地図から除いています。" : "");
  }
  // 小さな推移グラフ（同じ目盛り）
  const ysT = U.lv === "area" ? yearsOf("area").filter(areaYearOK) : yearsOf("pref");
  const series = U.list.map((u) => ({ u, d: ysT.map((yy) => metricVal(u, yy, m === "count" ? "rate" : m)) }));
  const mmax = Math.max(0, ...series.flatMap((s) => s.d.filter((v) => v != null)));
  const box = $("#multiples");
  Object.keys(charts).filter((k) => k.startsWith("mult_")).forEach((k) => { charts[k].dispose(); delete charts[k]; });
  box.innerHTML = series.map((s, i) => `<div class="mult ${s.u.code === selCode ? "sel" : ""}"><div class="t" title="${s.u.short}">${s.u.short}</div><div class="c" id="mult_${i}"></div></div>`).join("");
  $(".h3").textContent = `${U.lv === "pref" ? "都道府県" : "医療圏"}ごとの推移（${m === "scr" ? "SCR" : "人口千人あたり"}・同じ目盛り）`;
  series.forEach((s, i) => {
    chart("mult_" + i).setOption({ animation: false, grid: { left: 30, right: 6, top: 6, bottom: 16 },
      tooltip: { trigger: "axis", backgroundColor: T.surface, borderColor: T.grid, textStyle: { color: T.text, fontSize: 11 }, valueFormatter: (v) => fmt(v, m === "scr" ? 1 : 2) },
      xAxis: { type: "category", data: ysT, axisLabel: { color: T.muted, fontSize: 9, interval: Math.max(0, ysT.length - 2) }, axisTick: { show: false }, axisLine: { lineStyle: { color: T.grid } } },
      yAxis: { type: "value", min: 0, max: mmax ? Math.ceil(mmax * 1.05) : null, splitNumber: 2, axisLabel: { color: T.muted, fontSize: 9 }, splitLine: { lineStyle: { color: T.grid } } },
      series: [lineS(s.u.short, s.d, s.u.code === selCode ? T.s2 : T.s1, { symbolSize: 5 })] });
    document.getElementById("mult_" + i).parentElement.onclick = () => {
      if (s.u.lv === "pref") { S.pref = s.u.code; S.area = ""; $("#prefSel").value = S.pref; fillAreas(); } else { S.area = s.u.code; $("#areaSel").value = S.area; }
      render(); };
  });
  table("cmp", ["地域", ...ysT.map(fy)], series.map((s) => [s.u.short, ...s.d.map((v) => fmt(v, m === "scr" ? 1 : 3))]),
    `${G.id}_${U.title}_${m}`, `値：${m === "scr" ? "SCR" : "人口千人あたり"}（${DENOM[S.denom].lab}）`);
}
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, "0")).join("");
}

function renderSexAge() {
  const T = theme(), ys = yearsOf("sa");
  const sel = $("#saYear");
  sel.innerHTML = ys.map((y) => `<option value="${y}">${fy(y)}</option>`).join("");
  if (!ys.includes(S.saYear)) S.saYear = ys[ys.length - 1] || "";
  sel.value = S.saYear;
  const y = S.saYear, sa = y ? sumKind("sa", y) : null, np = y ? popVec({ lv: "nation" }, y) : null;
  $("#saYearLab").textContent = y ? `${fy(y)}｜${SETTING_LAB[S.setting]}` : "データなし";
  const m = sa ? sa.slice(0, 19) : [], f = sa ? sa.slice(19) : [], t = sa ? m.map((v, i) => v + f[i]) : [];
  const rm = np ? m.map((v, i) => rate(v, np[i])) : [], rf = np ? f.map((v, i) => rate(v, np[19 + i])) : [];
  const leg = { top: 0, right: 0, textStyle: { color: T.text2 }, itemWidth: 18 };
  chart("cSa").setOption(Object.assign(baseOpt(T), { legend: leg, grid: { left: 64, right: 16, top: 30, bottom: 40 },
    xAxis: Object.assign(axisX(T, BANDS), { axisLabel: { color: T.text2, rotate: 45, fontSize: 10 } }), yAxis: axisY(T),
    tooltip: Object.assign(baseOpt(T).tooltip, { valueFormatter: (v) => fmt(v) }),
    series: [{ name: "男性", type: "bar", data: m, itemStyle: { color: T.s1, borderRadius: [4, 4, 0, 0] }, barGap: "8%" },
      { name: "女性", type: "bar", data: f, itemStyle: { color: T.s2, borderRadius: [4, 4, 0, 0] } },
      lineS("合計", t, T.s3, { symbolSize: 6 })] }), true);
  chart("cSaRate").setOption(Object.assign(baseOpt(T), { legend: leg, grid: { left: 52, right: 16, top: 30, bottom: 40 },
    xAxis: Object.assign(axisX(T, BANDS), { axisLabel: { color: T.text2, rotate: 45, fontSize: 10 } }), yAxis: axisY(T),
    tooltip: Object.assign(baseOpt(T).tooltip, { valueFormatter: (v) => fmt(v, 2) }),
    series: [lineS("男性", rm, T.s1), lineS("女性", rf, T.s2)] }), true);
  table("sa", ["年齢階級", "男性", "女性", "合計", "男性 千人あたり", "女性 千人あたり"],
    BANDS.map((b, i) => [b, fmt(m[i]), fmt(f[i]), fmt(t[i]), fmt(rm[i], 3), fmt(rf[i], 3)]), `${G.id}_全国_性年齢_${y}`);
}

function futureSeries(r) {
  const ysR = yearsOf(r.lv === "area" ? "area" : "pref"), ysS = yearsOf("sa");
  const base = ysR.filter((y) => ysS.includes(y) && (r.lv !== "area" || areaYearOK(y))).pop();
  if (!base) return null;
  const rates = natRates(base), o = obs(r, base);
  if (!rates || o == null) return null;
  const e = {};
  FUT_YEARS.forEach((Y) => { const v = popVec(r, Y, "future"); e[Y] = v ? v.reduce((s, x, i) => s + x * rates[i], 0) : null; });
  const proj = {}; FUT_YEARS.forEach((Y) => (proj[Y] = e["2025"] ? o * e[Y] / e["2025"] : null));
  return { base, o, proj, idx: Object.fromEntries(FUT_YEARS.map((Y) => [Y, e["2025"] ? e[Y] / e["2025"] * 100 : null])) };
}
function renderFuture() {
  const T = theme(), r = region(), f = futureSeries(r);
  const pr = r.lv === "area" ? { lv: "pref", code: S.area.slice(0, 2), short: PREFS[+S.area.slice(0, 2) - 1] } : null;
  const fn = r.lv !== "nation" ? futureSeries({ lv: "nation" }) : null, fp = pr ? futureSeries(pr) : null;
  $("#futTitle").textContent = `${r.name}｜${SETTING_LAB[S.setting]}`;
  if (!f) { chart("cFut").clear(); chart("cFutIdx").clear(); $("#futNote").textContent = "推計に必要なデータがありません。"; return; }
  const xl = [fy(f.base) + "実績", ...FUT_YEARS.map((y) => y + "年")];
  chart("cFut").setOption(Object.assign(baseOpt(T), { xAxis: axisX(T, xl), yAxis: axisY(T),
    tooltip: Object.assign(baseOpt(T).tooltip, { valueFormatter: (v) => fmt(v) }),
    series: [{ name: r.short, type: "bar", barMaxWidth: 28, data: [{ value: f.o, itemStyle: { color: T.muted } }, ...FUT_YEARS.map((y) => ({ value: f.proj[y], itemStyle: { color: T.s1 } }))],
      itemStyle: { borderRadius: [4, 4, 0, 0] }, label: { show: true, position: "top", color: T.text2, fontSize: 11, formatter: (d) => fmt(d.value) } }] }), true);
  const ser = [lineS(r.short, FUT_YEARS.map((y) => f.idx[y]), T.s1, { label: { show: true, position: "top", color: T.text2, fontSize: 11, formatter: (d) => fmt(d.value, 1) } })];
  if (fn) ser.push(lineS("全国", FUT_YEARS.map((y) => fn.idx[y]), T.s2, { lineStyle: { width: 2, color: T.s2, type: "dashed" } }));
  if (fp) ser.push(lineS(pr.short, FUT_YEARS.map((y) => fp.idx[y]), T.s3, { lineStyle: { width: 2, color: T.s3, type: "dotted" } }));
  chart("cFutIdx").setOption(Object.assign(baseOpt(T), { legend: ser.length > 1 ? { top: 0, right: 0, textStyle: { color: T.text2 } } : undefined,
    grid: { left: 52, right: 16, top: 30, bottom: 32 }, xAxis: axisX(T, FUT_YEARS.map((y) => y + "年")), yAxis: axisY(T, { scale: true }),
    tooltip: Object.assign(baseOpt(T).tooltip, { valueFormatter: (v) => fmt(v, 1) }), series: ser }), true);
  $("#futNote").textContent = `基準：${fy(f.base)}の実績と全国の性・年齢階級別算定率。将来人口は社人研 令和5年推計（各年10月1日）。2025年を100とした指数を実績に掛けています。`;
  table("fut", ["年", "推計算定回数", "指数（2025=100）", ...(fn ? ["全国 指数"] : []), ...(fp ? [pr.short + " 指数"] : [])],
    [[fy(f.base) + "実績", fmt(f.o), "–", ...(fn ? ["–"] : []), ...(fp ? ["–"] : [])],
      ...FUT_YEARS.map((y) => [y + "年", fmt(f.proj[y]), fmt(f.idx[y], 1), ...(fn ? [fmt(fn.idx[y], 1)] : []), ...(fp ? [fmt(fp.idx[y], 1)] : [])])],
    `${G.id}_${r.short}_将来推計`);
}

/* ---------- 表とCSV ---------- */
function table(key, head, rows, fname, cap = "") {
  const el = $("#tbl-" + key);
  el.innerHTML = `<div class="dl"><button type="button">CSVをダウンロード</button> <span class="muted">${cap}</span></div>` +
    `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  el.querySelector("button").onclick = () => {
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/,/g, "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = fname.replace(/[\\/:*?"<>|]/g, "_") + ".csv"; a.click();
  };
}

/* ---------- URL ---------- */
function writeHash() {
  const p = new URLSearchParams();
  p.set("i", S.item); if (S.pref) p.set("p", S.pref); if (S.area) p.set("a", S.area);
  if (S.setting !== "all") p.set("s", S.setting); p.set("d", S.denom); if (S.cmpMetric !== "rate") p.set("m", S.cmpMetric);
  const x = [...S.excl].filter((k) => G?.codes[k]); if (x.length) p.set("x", x.join("."));
  history.replaceState(null, "", "#" + p.toString());
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  S.item = p.get("i") || S.item; S.pref = p.get("p") || ""; S.area = p.get("a") || ""; S.setting = p.get("s") || "all";
  S.denom = p.get("d") || S.denom; S.cmpMetric = p.get("m") || "rate";
  S.excl = new Set((p.get("x") || "").split(".").filter(Boolean));
}

init().catch((e) => { $("#notice").hidden = false; $("#notice").textContent = "データの読み込みに失敗しました：" + e.message; console.error(e); });
