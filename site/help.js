/* 取扱説明：使い方ガイド（ダイアログ）・画面ツアー・「?」ボタンの説明 */
"use strict";
(() => {
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存できない環境では無視 */ } },
  };

  /* ---------- 「?」ボタンの短い説明 ---------- */
  const TIPS = {
    item: ["診療行為の選び方", "名前（例：特定集中治療室、人工腎臓）や分類コード（例：A301）、9桁の診療行為コードで検索できます。選んだ「分類」に含まれるコードを合計して表示します。特定のコードだけを見たいときは「対象コードを選ぶ」で絞り込めます。"],
    setting: ["入院／外来", "「全体」は入院と外来の合計です。入院でしか算定されない項目（入院料など）は、どれを選んでも同じ値になります。入院・外来の両方で算定される項目（検査など）だけ、切り替えると値が変わります。"],
    area: ["二次医療圏", "入院医療を地域で完結させる単位として都道府県が定める区域（全国335）。都道府県を選ぶと、その中の医療圏を選べます。医療圏の値は「その圏内にある医療機関で算定された回数」で、他の地域から来た患者の分も含みます。"],
    denom: ["人口あたりの分母", "地域の大きさの違いをならすために、算定回数を人口で割った値（人口千人あたり）を表示します。高齢者に多い治療なら「65歳以上」「75歳以上」を選ぶと、より実態に近い比較になります。年齢構成の違いまで調整したいときは、年齢調整比（SCR）を見てください。"],
    trend: ["年次推移", "選んだ地域の 2014〜2024年度の推移です。左上：算定回数、右上：分母に使った人口、左下：人口千人あたり（全国・都道府県と比較）、右下：年齢調整比 SCR（全国＝100）。SCR が100より大きければ、年齢構成を考慮しても全国より多く算定されている地域です。"],
    cmp: ["地域比較", "全国を選んでいるときは都道府県、都道府県・医療圏を選んでいるときはその都道府県内の医療圏を比べます。「指標」で人口千人あたり・SCR・算定回数を切り替え、地図やグラフをクリックするとその地域に移動します。下の小さなグラフはすべて同じ目盛りなので、高さをそのまま比べられます。"],
    sa: ["性・年齢別（全国）", "どの年代・性別で多く行われている診療行為かが分かります。右のグラフは人口千人あたりの算定率で、将来推計や SCR の計算の基礎になっています。NDBオープンデータでは、性・年齢別は全国の値だけが公表されています。"],
    fut: ["将来推計", "「算定率一定」は今の年代別の算定率が変わらず、人口構成だけが変わった場合の推計です。「トレンド延長」は、過去5年の算定率の伸びが指定した年まで続くと仮定した推計です。伸び率は自由に変更できます。2つの間を幅のある見通しとして使ってください。"],
  };
  const pop = $("#pop");
  let popFor = null;
  function showTip(btn) {
    const t = TIPS[btn.dataset.help]; if (!t) return;
    if (popFor === btn && !pop.hidden) { hideTip(); return; }
    const calcKeys = ["denom", "trend", "cmp", "sa", "fut"];
    pop.innerHTML = `<b>${t[0]}</b>${t[1]}<br><button type="button" class="link more" data-open="terms">用語集を見る</button>` +
      (calcKeys.includes(btn.dataset.help) ? ` <button type="button" class="link more" data-open="calc">計算方法を見る</button>` : "");
    pop.hidden = false; popFor = btn;
    const r = btn.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 24);
    pop.style.maxWidth = w + "px";
    const left = Math.max(12, Math.min(window.scrollX + r.left - 20, window.scrollX + window.innerWidth - w - 12));
    pop.style.left = left + "px"; pop.style.top = (window.scrollY + r.bottom + 8) + "px";
    pop.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => { hideTip(); openHelp(b.dataset.open); }));
  }
  function hideTip() { pop.hidden = true; popFor = null; }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".q");
    if (b) { e.preventDefault(); e.stopPropagation(); showTip(b); return; }
    if (!e.target.closest("#pop")) hideTip();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });

  /* ---------- 使い方ガイド ---------- */
  const CASES = [
    { t: "自院のある医療圏で、ICUの需要が全国と比べて多いか調べる", h: "#i=A301&p=13&a=1304&d=t",
      s: ["診療行為で「特定集中治療室管理料（A301）」、都道府県・二次医療圏で自院の地域を選ぶ（例は東京都・区西部）", "上の数字カードで「人口千人あたり」と「年齢調整比 SCR」を確認。SCRが100を超えていれば、高齢化の影響を除いても全国より多い", "「地域比較」で同じ都道府県の他の医療圏と並べ、地図で周辺との差を見る"] },
    { t: "回復期リハビリ病棟を増やす余地があるか、高齢者人口あたりで比べる", h: "#i=A308&p=11&d=75",
      s: ["診療行為で「回復期リハビリテーション病棟入院料（A308）」を選ぶ", "分母を「75歳以上人口」にして、高齢者人口あたりの提供量を見る", "「地域比較」で県内の医療圏を並べ、全国平均（点線）より低い医療圏を探す", "「将来推計」で2040年に向けて需要がどう変わるかを確認"] },
    { t: "伸びている治療（カテーテルアブレーション）の将来需要を見積もる", h: "#i=K595&p=27",
      s: ["診療行為で「経皮的カテーテル心筋焼灼術（K595）」を選ぶ", "「将来推計」の2つのシナリオを比べる。人口だけで見ると横ばい〜減少でも、算定率の伸び（トレンド延長）を入れると増加になる", "伸び率のスライダーを動かし、控えめな見通し（例：年2%）でも採算が合うか検討する"] },
  ];

  function calcBody() {
    const c = window.ndbCalc && window.ndbCalc();
    if (!c) return "<p>データを読み込み中です。少し待ってから開き直してください。</p>";
    const f = c.fmt, item = c.item ? `${c.item.id.includes(":") ? "" : c.item.id + " "}${c.item.n}` : "";
    if (c.none) return `<p>${item}（${c.region.name}）は、計算に必要な性・年齢別データがありません。</p>`;
    const reg = c.region.name, yl = c.fy(c.year), isNat = c.region.lv === "nation";
    const top = c.rows.filter((x) => x.rate != null).sort((a, b) => b.rate - a.rate)[0];
    const fu = c.fut, t = c.trend;
    const rowsHtml = c.rows.map((x) => `<tr><td>${x.sex}</td><td>${x.band}</td><td>${f(x.cnt)}</td><td>${f(x.npop)}</td><td>${f(x.rate, 3)}</td>${isNat ? "" : `<td>${f(x.rpop)}</td><td>${f(x.exp, 1)}</td>`}</tr>`).join("");
    return `
      <p>このページの数値が、どのような計算で求められているかを説明します。後半の<b>計算例</b>は、いま画面で選んでいる条件<br>
      （<b>${item}</b>／<b>${reg}</b>／${c.setting}／${yl}）の実際の数値で計算しています。条件を変えてから開き直すと、計算例も変わります。</p>

      <h3>0. 算定率と受療率の違い（本ツールは算定率のみを使用）</h3>
      <p>本ツールで計算しているのは<b>算定率</b>（人口あたりの算定回数）です。よく似た言葉の<b>受療率</b>は厚生労働省「患者調査」の指標で、元のデータも数え方も異なります。本ツールでは受療率は計算・表示していません。</p>
      <div class="calc-tbl"><table class="txt">
        <thead><tr><th></th><th>算定率（本ツール）</th><th>受療率（患者調査）</th></tr></thead>
        <tbody>
          <tr><td>元データ</td><td>NDB（全国のレセプトの全数集計）</td><td>患者調査（全国の医療機関から抽出した標本調査）</td></tr>
          <tr><td>分子</td><td>1年度の<b>算定回数</b></td><td>調査日1日の<b>推計患者数</b></td></tr>
          <tr><td>計算式</td><td>算定回数 ÷ 人口 × 1,000</td><td>推計患者数 ÷ 推計人口 × 100,000</td></tr>
          <tr><td>単位</td><td>人口千人あたり（年間の回数）</td><td>人口10万人あたり（1日あたりの患者数）</td></tr>
          <tr><td>同じ患者の繰り返し</td><td>回数分数える（入院料なら入院日数分）</td><td>調査日に受診した1人を1人と数える</td></tr>
          <tr><td>分類</td><td>診療行為（手術・検査・入院料など）</td><td>傷病（病名）</td></tr>
        </tbody>
      </table></div>

      <h3>1. 人口千人あたり算定回数</h3>
      <div class="formula">人口千人あたり算定回数 ＝ 算定回数 ÷ 人口（総人口・65歳以上・75歳以上のいずれか） × 1,000</div>
      <div class="ex">計算例（${reg}・${yl}）：${f(c.o)} ÷ ${f(c.pop)}（${c.denomLab}） × 1,000 ＝ <b>${f(c.rate, 2)}</b></div>

      <h3>2. 性・年齢階級別算定率</h3>
      <div class="formula">算定率（性 s・年齢 a） ＝ 全国の算定回数（s, a） ÷ 全国の人口（s, a） × 補正係数 k</div>
      <div class="formula">補正係数 k ＝ 全国の算定回数の総計（都道府県別の合計） ÷ 性・年齢別の算定回数の合計</div>
      <p>性・年齢別の表は秘匿（10未満は「‐」）などのため、合計が都道府県別の総計と少しずれることがあります。k でこのずれを補正し、全国の期待値が実績と一致するようにしています。性・年齢別は全国の値しか公表されていないため、算定率は全国共通の値です。年齢は5歳刻み（90歳以上はまとめて1区分）、男女別の38区分です。</p>
      <div class="ex">計算例（全国・${yl}）：k ＝ ${f(c.natObs)} ÷ ${f(c.saSum)} ＝ ${f(c.k, 4)}。算定率がもっとも高いのは ${top ? `${top.sex}性 ${top.band}歳の <b>人口千人あたり ${f(top.rate, 3)}</b>（${f(top.cnt)} ÷ ${f(top.npop)} × 1,000 × k）` : "–"}。全区分は下の表を参照してください。</div>

      <h3>3. 年齢調整比（SCR）</h3>
      <div class="formula">期待値 ＝ Σ（全国の算定率（s, a） × その地域の人口（s, a））　※38区分の合計</div>
      <div class="formula">SCR ＝ その地域の算定回数（実績） ÷ 期待値 × 100</div>
      <p>「その地域の年齢構成で、全国平均どおりに算定された場合の回数」が期待値です。実績が期待値と同じなら100。高齢者の多い地域は期待値も大きくなるため、年齢構成の違いを除いて比べられます（間接法）。基準となる算定率は年度ごとに計算するため、SCRの推移は「全国に対する相対的な水準」の変化を表します。</p>
      <div class="ex">計算例（${reg}・${yl}）：${isNat ? "全国は定義上、期待値＝実績となり SCR＝100 です。都道府県・医療圏を選んで開き直すと、その地域での計算例を表示します。" : `期待値 ${f(c.expTot, 1)}、実績 ${f(c.o)} → SCR ＝ ${f(c.o)} ÷ ${f(c.expTot, 1)} × 100 ＝ <b>${f(c.scr, 1)}</b>`}</div>

      <h3>4. 将来推計：算定率一定</h3>
      <div class="formula">期待値（Y年） ＝ Σ（基準年度の全国算定率（s, a） × その地域の将来推計人口（Y年, s, a））</div>
      <div class="formula">推計算定回数（Y年） ＝ 基準年度の実績 × 期待値（Y年） ÷ 期待値（2025年）</div>
      <p>算定率は基準年度（最新年度）のまま変わらないと仮定し、人口の増減と年齢構成の変化だけを反映します。基準年度の実績（2024年度＝2024年4月〜2025年3月）は、2025年時点の値とみなしています。</p>
      ${fu ? `<div class="ex">計算例（${reg}）：基準 ${c.fy(fu.base)} の実績 ${f(fu.o)}、期待値の比（2040年 ÷ 2025年） ＝ ${f(fu.idx["2040"] / 100, 4)} → 2040年 ＝ ${f(fu.o)} × ${f(fu.idx["2040"] / 100, 4)} ＝ <b>${f(fu.proj["2040"])}</b></div>` : ""}

      <h3>5. 年齢調整算定率と過去の伸び率</h3>
      <div class="formula">年齢調整算定率（年度 y） ＝ Σ（年度 y の全国算定率（s, a） × 基準人口（s, a）） ÷ 基準人口の総数 × 1,000　※基準人口＝2025年の全国推計人口</div>
      <div class="formula">年平均伸び率 g ＝（年齢調整算定率（最新年度） ÷ 年齢調整算定率（5年度前））^（1 ÷ 年数） − 1</div>
      <p>人口構成を2025年に固定して比べることで、高齢化の影響を除いた「算定率そのものの伸び」を測ります（直接法）。既定値は −10%〜+20% の範囲に制限しています。</p>
      ${t ? `<div class="ex">計算例（全国）：${c.fy(t.from)} ${f(t.r0, 3)} → ${c.fy(t.to)} ${f(t.r1, 3)}（人口千人あたり）。g ＝（${f(t.r1, 3)} ÷ ${f(t.r0, 3)}）^（1 ÷ ${+t.to - +t.from}） − 1 ＝ <b>${t.g >= 0 ? "+" : ""}${f(t.g, 2)}%</b></div>` : `<div class="ex">この項目は5年度分の性・年齢別データがないため、過去の伸び率を計算できません。</div>`}

      <h3>6. 将来推計：トレンド延長</h3>
      <div class="formula">推計算定回数（Y年） ＝ 算定率一定の推計（Y年） × （1 ＋ g）^（min（Y, 伸びが続く最後の年） − 2025）</div>
      <p>算定率が毎年 g ずつ変化し、指定した年（既定は2030年）以降は横ばいと仮定します。g は全国の値をすべての地域に共通で使います。画面の入力欄で g と期間を変更できます。</p>
      ${fu ? `<div class="ex">計算例（${reg}、g ＝ ${f(c.g, 1)}%、${c.gUntil}年まで）：2040年 ＝ ${f(fu.proj["2040"])} × （1 ＋ ${f(c.g / 100, 4)}）^${Math.max(0, Math.min(2040, +c.gUntil) - (+fu.base + 1))} ＝ <b>${f(fu.projB["2040"])}</b></div>` : ""}

      <h3>7. 使っている人口の時点</h3>
      <ul>
        <li>実績（2014〜2024年度）：総務省「住民基本台帳に基づく人口」の<b>翌年1月1日</b>現在（例：2024年度 → 2025年1月1日）。市区町村の人口を二次医療圏ごとに合計。</li>
        <li>将来（2025〜2050年）：国立社会保障・人口問題研究所「日本の地域別将来推計人口（令和5年推計）」の各年10月1日。</li>
      </ul>

      <h3>計算例：性・年齢階級別の算定率${isNat ? "" : "と期待値"}（${reg}・${yl}・${c.setting}）</h3>
      <div class="calc-tbl"><table>
        <thead><tr><th>性</th><th>年齢</th><th>全国 算定回数</th><th>全国 人口</th><th>算定率（千人あたり、k補正後）</th>${isNat ? "" : `<th>${reg} 人口</th><th>期待値</th>`}</tr></thead>
        <tbody>${rowsHtml}</tbody>
        ${isNat ? "" : `<tfoot><tr><td colspan="6">期待値の合計 → 実績 ${f(c.o)} ÷ ${f(c.expTot, 1)} × 100 ＝ SCR ${f(c.scr, 1)}</td><td>${f(c.expTot, 1)}</td></tr></tfoot>`}
      </table></div>`;
  }
  const BODY = {
    calc: calcBody,
    about: `
      <p>厚生労働省が公表している<b>NDBオープンデータ</b>（全国のレセプト＝診療報酬明細書の集計）を使い、<b>どの地域で、どの診療行為が、どれだけ行われているか</b>を、人口と組み合わせて見るためのツールです。</p>
      <h3>わかること</h3>
      <ul>
        <li><b>地域の医療の規模</b>：自院のある都道府県・二次医療圏で、ある診療行為が年に何回行われているか</li>
        <li><b>全国や近隣との比較</b>：人口あたり・年齢調整後で、全国より多いのか少ないのか</li>
        <li><b>これまでの推移</b>：2014〜2024年度の増減</li>
        <li><b>これからの見通し</b>：人口の変化をもとにした2025〜2050年の推計</li>
      </ul>
      <h3>わからないこと</h3>
      <ul>
        <li>病院ごとの件数やシェア（NDBオープンデータは地域単位の集計のみ）</li>
        <li>患者がどこに住んでいるか（医療機関の所在地で集計されています）</li>
        <li>病名（傷病名）別の患者数</li>
      </ul>
      <div class="tip">はじめての方は、下の「画面ツアーを始める」で各部分の役割を順番に確認できます（約1分）。</div>`,
    steps: `
      <ol>
        <li><b>見たい診療行為を選ぶ</b><br>画面上部の検索欄に、名前の一部（例：「人工腎臓」「内視鏡」）やコード（例：「A301」）を入力し、候補から選びます。</li>
        <li><b>地域を選ぶ</b><br>「都道府県」を選ぶと、その中の「二次医療圏」を選べるようになります。何も選ばなければ全国です。</li>
        <li><b>上の4つの数字カードを見る</b><br>最新年度の算定回数、人口千人あたり、年齢調整比（SCR）、2040年の見通しが一目で分かります。</li>
        <li><b>グラフで詳しく見る</b><br>「年次推移」で過去の増減、「地域比較」で周辺地域との差、「性・年齢別」で対象患者の年代、「将来推計」で今後の見通しを確認します。</li>
        <li><b>分母を変えてみる</b><br>高齢者に多い治療は「人口あたりの分母」を「65歳以上」「75歳以上」にすると比較しやすくなります。</li>
        <li><b>保存・共有する</b><br>各グラフの「表で見る」から数値を表示し、CSVでダウンロードできます。画面のURLには選んだ条件が含まれているので、そのまま共有すれば同じ画面を開けます。</li>
      </ol>
      <div class="tip">グラフにマウスを重ねると（スマートフォンではタップすると）正確な数値が表示されます。地図は拡大・移動でき、クリックするとその地域に切り替わります。</div>`,
    cases: () => CASES.map((c, i) => `
      <div class="case"><h3>例${i + 1}：${c.t}</h3><ol>${c.s.map((x) => `<li>${x}</li>`).join("")}</ol>
      <button type="button" class="btn-help" data-case="${i}">この例を開く</button></div>`).join(""),
    terms: `
      <dl>
        <dt>算定回数</dt><dd>診療報酬を請求した回数。入院料なら「入院日数」、手術なら「手術の件数」に近い意味になります。患者数ではありません。</dd>
        <dt>分類・診療行為コード</dt><dd>診療報酬の項目（例：A301 特定集中治療室管理料）が「分類」、その中の細かい区分（日数・施設基準ごとなど）が9桁の「診療行為コード」です。本ツールは分類ごとに合計して表示し、「対象コードを選ぶ」で一部だけに絞れます。</dd>
        <dt>加算</dt><dd>基本の点数に上乗せして請求する項目。「（加算）」の付いた分類として別に表示しています。</dd>
        <dt>二次医療圏</dt><dd>一般的な入院医療を完結させる区域として都道府県が定める単位（全国335、第7次医療計画の区分）。</dd>
        <dt>医療機関所在地ベース</dt><dd>集計は患者の住所ではなく、診療した医療機関の所在地で行われています。大病院が集まる都市部の医療圏は、周辺から患者が集まるため値が高くなります。</dd>
        <dt>人口千人あたり算定回数</dt><dd>算定回数 ÷ 人口 × 1,000。地域の大きさの違いをならして比べるための指標です。人口は住民基本台帳（翌年1月1日現在）。</dd>
        <dt>年齢調整比（SCR）</dt><dd>その地域の年齢構成で全国平均どおりに算定された場合の回数（期待値）に対する、実際の回数の比率×100。<b>100＝全国並み</b>、120なら全国より2割多い。高齢者が多い地域ほど回数が多くなるのは当然なので、その影響を除いて比べるための指標です。</dd>
        <dt>秘匿（‐）</dt><dd>個人や医療機関が特定されないよう、10未満の値は公表されていません。本ツールでは0として合計するため、件数の少ない項目・地域では実際より少なくなります。</dd>
        <dt>捕捉率</dt><dd>医療圏別の値の合計が全国合計の何％にあたるか。2018〜2021年度は医療圏別の値の多くが秘匿されている項目があり、捕捉率が90％未満の年度は表示していません。</dd>
        <dt>算定率</dt><dd>人口あたりの算定回数（算定回数 ÷ 人口）。性・年齢階級別に全国の算定回数を人口で割って求め、SCRや将来推計の基礎にしています。本ツールで「率」と言うときは、すべてこの算定率です。計算式は「計算方法」タブを参照。</dd>
        <dt>受療率（本ツールでは使用していません）</dt><dd>厚生労働省「患者調査」の指標で、調査日に医療機関で受療した推計患者数を人口10万人あたりで表したもの。傷病別に集計され、算定率とは元データも数え方も異なるため、数値を直接比べることはできません。</dd>
        <dt>算定率一定（将来推計）</dt><dd>今の年代別の算定率が将来も変わらないと仮定し、人口の増減と高齢化だけを反映した推計。</dd>
        <dt>トレンド延長（将来推計）</dt><dd>過去5年の算定率の伸び（年齢構成の影響を除いた値）が指定した年まで続き、その後は横ばいと仮定した推計。伸び率は画面で変更できます。</dd>
        <dt>公費レセプト</dt><dd>生活保護などの公費負担医療のレセプト。年度間で比べられるよう、全年度「公費レセプトを含まない」集計を使っています。</dd>
      </dl>`,
    faq: `
      <h3>医療圏を選ぶと、古い年度のグラフが空欄になります</h3>
      <p>2018〜2021年度は、入院系の項目を中心に医療圏別の値の多くが秘匿（‐）されています。誤解を招く値を出さないよう、医療圏の値が全国合計の90％以上をとらえている年度だけを表示しています。</p>
      <h3>全国を選ぶと年齢調整比（SCR）が100のままです</h3>
      <p>SCRは全国を基準にした比率なので、全国は常に100です。都道府県か医療圏を選んでください。</p>
      <h3>厚生労働省の資料や他の集計と数字が少し違います</h3>
      <p>①公費レセプトを含まない集計を使っている、②秘匿（‐）を0として合計している、③分類に含まれる全コード（コロナ特例などを含む）を合計している、などが主な理由です。「対象コードを選ぶ」でコードを絞ると合わせられる場合があります。</p>
      <h3>自院の件数やシェアは分かりますか</h3>
      <p>NDBオープンデータは地域単位の集計のため、病院ごとの件数は分かりません。自院の実績と並べて、地域内のおおよそのシェアを計算する使い方をおすすめします。</p>
      <h3>将来推計はどのくらい当てになりますか</h3>
      <p>人口の推計は比較的確かですが、算定率は診療報酬改定・新しい技術・病院の再編で大きく変わります。「算定率一定」と「トレンド延長」の2つを幅として捉え、伸び率を変えて複数の見通しを確認してください。</p>
      <h3>データはいつ更新されますか</h3>
      <p>毎月、厚生労働省のサイトを確認し、新しいNDBオープンデータが公表されていれば自動で取り込みます。現在は2014〜2024年度分です。</p>`,
  };
  const dlg = $("#helpDlg");
  function openHelp(tab = "about") {
    hideTip();
    showTab(tab);
    if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute("open", "");
  }
  function closeHelp() { if (dlg.open) dlg.close(); else dlg.removeAttribute("open"); }
  function showTab(tab) {
    document.querySelectorAll(".help-tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    const c = BODY[tab]; $("#helpBody").innerHTML = typeof c === "function" ? c() : c; $("#helpBody").scrollTop = 0;
    $("#helpBody").querySelectorAll("[data-case]").forEach((b) => (b.onclick = () => {
      closeHelp(); window.applyHash && window.applyHash(CASES[+b.dataset.case].h);
    }));
  }
  document.querySelectorAll(".help-tabs [data-tab]").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  $("#helpOpen").onclick = () => openHelp();
  const co = $("#calcOpen"); if (co) co.onclick = () => openHelp("calc");
  $("#helpClose").onclick = closeHelp;
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeHelp(); });
  $("#helpTour").onclick = () => { closeHelp(); startTour(); };

  /* ---------- 画面ツアー ---------- */
  const STEPS = [
    { sel: ".site-header", t: "ようこそ", x: "このツールでは、全国のレセプト集計（NDBオープンデータ）を使って、地域ごとに診療行為がどれだけ行われているかを見られます。主な操作を順番に紹介します。" },
    { sel: ".ctl-item", t: "① 診療行為を選ぶ", x: "名前の一部やコードを入力すると候補が出ます。例えば「特定集中」「人工腎臓」「A301」など。選んだ分類に含まれるコードを合計して表示します。" },
    { sel: "#codeToggle", t: "対象コードの絞り込み", x: "分類の中の一部のコードだけを集計したいときに使います（例：コロナ特例のコードを除く）。普段はそのままで大丈夫です。" },
    { sel: ["#prefSel", "#areaSel"], up: ".ctl", t: "② 地域を選ぶ", x: "都道府県を選ぶと、その中の二次医療圏を選べます。何も選ばなければ全国の値です。自院のある医療圏を選んでみてください。" },
    { sel: "#denom", up: ".ctl", t: "③ 人口あたりの分母", x: "地域の大きさをそろえて比べるための分母です。高齢者に多い治療では「65歳以上」「75歳以上」を選ぶと比較しやすくなります。" },
    { sel: "#kpis", t: "④ まずはここを見る", x: "最新年度の算定回数、人口千人あたり（全国値と比較）、年齢調整比 SCR（全国＝100）、2040年の見通しです。SCRが100より大きければ、年齢構成を考慮しても全国より多い地域です。" },
    { sel: "#cCount", up: "section", t: "⑤ 年次推移", x: "2014〜2024年度の算定回数・人口・人口あたり・SCRの推移です。点線は全国や都道府県の値で、自分の地域と比べられます。" },
    { sel: "#cRank", up: "section", t: "⑥ 地域比較", x: "同じ都道府県の医療圏（全国選択時は都道府県）を地図とランキングで比べます。地図やグラフをクリックすると、その地域に切り替わります。" },
    { sel: "#cSa", up: "section", t: "⑦ 性・年齢別", x: "どの年代・性別で多い診療行為かが分かります（全国の値）。対象患者の年代をつかむのに役立ちます。" },
    { sel: ".scen", up: "section", t: "⑧ 将来推計", x: "人口構成の変化だけを見る「算定率一定」と、過去の伸びが続く「トレンド延長」の2通りで2050年まで推計します。伸び率は自由に変えられます。" },
    { sel: "[data-table=trend]", t: "⑨ 数値の確認と保存", x: "「表で見る」で数値を表に表示し、CSVでダウンロードできます。画面のURLには選んだ条件が入っているので、共有すれば同じ画面を開けます。" },
    { sel: ".help-btns", t: "いつでも見返せます", x: "使い方・用語・計算方法は「使い方ガイド」で確認できます。各見出しの「?」を押すと、その部分の説明が出ます。" },
  ];
  let ti = 0, tourOn = false;
  const tour = $("#tour"), hole = $("#tourHole"), card = $("#tourCard");
  function targetRect(st) {
    const sels = Array.isArray(st.sel) ? st.sel : [st.sel];
    const els = sels.map((s) => document.querySelector(s)).filter(Boolean).map((e) => (st.up ? e.closest(st.up) || e : e));
    if (!els.length) return null;
    const rs = els.map((e) => e.getBoundingClientRect());
    return { el: els[0], left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)),
      right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
  }
  function place() {
    if (!tourOn) return;
    const st = STEPS[ti], r = targetRect(st); if (!r) return;
    const pad = 6, vw = window.innerWidth, vh = window.innerHeight;
    const top = Math.max(4, r.top - pad), bottom = Math.min(vh - 4, r.bottom + pad);
    Object.assign(hole.style, { left: Math.max(4, r.left - pad) + "px", top: top + "px",
      width: Math.min(vw - 8, r.right - r.left + pad * 2) + "px", height: Math.max(0, bottom - top) + "px" });
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let ct = bottom + 12;
    if (ct + ch > vh - 8) ct = top - ch - 12;
    if (ct < 8) ct = Math.max(8, Math.min(vh - ch - 8, top + 12));
    card.style.top = ct + "px";
    card.style.left = Math.max(8, Math.min(vw - cw - 8, r.left)) + "px";
  }
  function go(i) {
    ti = Math.max(0, Math.min(STEPS.length - 1, i));
    const st = STEPS[ti], r = targetRect(st);
    $("#tourStep").textContent = `${ti + 1} / ${STEPS.length}`;
    $("#tourTitle").textContent = st.t; $("#tourText").textContent = st.x;
    $("#tourPrev").disabled = ti === 0;
    $("#tourNext").textContent = ti === STEPS.length - 1 ? "完了" : "次へ";
    if (r) {
      const h = r.bottom - r.top, vh = window.innerHeight;
      // 固定表示の条件バーに隠れないよう、要素を画面中央付近へ
      const y = window.scrollY + r.top - Math.max(140, (vh - Math.min(h, vh * 0.6)) / 2);
      window.scrollTo({ top: Math.max(0, y), behavior: "auto" });
    }
    requestAnimationFrame(() => requestAnimationFrame(place));
    $("#tourNext").focus({ preventScroll: true });
  }
  function startTour() {
    hideTip(); closeHelp(); tourOn = true; tour.hidden = false; go(0);
    store.set("ndb_tour_seen", "1");
  }
  function endTour() { tourOn = false; tour.hidden = true; $("#tourStart").focus({ preventScroll: true }); }
  $("#tourStart").onclick = startTour;
  $("#tourNext").onclick = () => (ti === STEPS.length - 1 ? endTour() : go(ti + 1));
  $("#tourPrev").onclick = () => go(ti - 1);
  $("#tourSkip").onclick = endTour;
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (!tourOn) return;
    if (e.key === "Escape") endTour();
    else if (e.key === "ArrowRight") $("#tourNext").click();
    else if (e.key === "ArrowLeft") go(ti - 1);
  });
  tour.addEventListener("click", (e) => { if (e.target === tour) endTour(); });

  /* ---------- はじめての方への案内 ---------- */
  if (!store.get("ndb_tour_seen")) {
    const bar = document.createElement("div");
    bar.className = "notice welcome";
    bar.innerHTML = `はじめての方へ：画面ツアー（約1分）で使い方を確認できます。
      <button type="button" class="btn-help" id="wTour">ツアーを見る</button>
      <button type="button" class="link" id="wGuide">使い方ガイドを読む</button>
      <button type="button" class="link" id="wClose">閉じる</button>`;
    bar.hidden = false;
    $("main").prepend(bar);
    const done = () => { bar.remove(); store.set("ndb_tour_seen", "1"); };
    $("#wTour").onclick = () => { done(); startTour(); };
    $("#wGuide").onclick = () => { done(); openHelp(); };
    $("#wClose").onclick = done;
  }

  window.ndbHelp = { openHelp, startTour };
})();
